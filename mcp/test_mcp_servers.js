#!/usr/bin/env node
/**
 * test_mcp_servers.js — End-to-end stdio JSON-RPC 2.0 test harness for `slrr-dev-pipeline` and `slrr-live-ops`.
 *
 * Spawns each MCP server as a real child process over stdin/stdout pipes and verifies `initialize`,
 * `tools/list`, and `tools/call`. Pass `--live` to also execute live read-only Google Sheets v4 and
 * Cloud Logging v2 calls against `brand-social-central-data`.
 */
'use strict';

const assert = require('assert');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

function spawnMcpClient(serverScript) {
  const child = spawn(process.execPath, [serverScript], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let nextId = 1;
  const pending = new Map();
  let stderrBuf = '';

  child.stderr.on('data', chunk => {
    stderrBuf += chunk.toString('utf8');
  });

  const rl = readline.createInterface({ input: child.stdout, terminal: false });
  rl.on('line', line => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(`RPC error ${msg.error.code}: ${msg.error.message}`));
      } else {
        resolve(msg.result);
      }
    }
  });

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  function notify(method, params = {}) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async function callTool(name, args = {}) {
    const res = await request('tools/call', { name, arguments: args });
    assert(!res.isError, `Tool ${name} returned error: ${JSON.stringify(res.content)}`);
    return JSON.parse(res.content[0].text);
  }

  function close() {
    child.stdin.end();
    return new Promise(resolve => {
      child.on('exit', () => resolve(stderrBuf));
    });
  }

  return { request, notify, callTool, close };
}

// ---------------------------------------------------------------------------------------------------------------
// In-process cases: the handlers called directly with canned Sheets responses (deps.fetchJson) and a stand-in for
// subprocesses (deps.runSubprocess). None of them reads the live sheet or the live logs, or runs a real test suite.
// ---------------------------------------------------------------------------------------------------------------

/**
 * A fake Google Sheets backend. `tabs`: {title: {gridRows, rows}} with rows[0] sheet row 1. It answers the two
 * requests the servers make, workbook metadata and values:batchGet, as the API does: a range's blank last rows and a
 * row's blank last cells are left out, and a wholly blank range has no `values`. Any other host goes to `other(url)`
 * when given; anything else fails the test. `calls` keeps every request, `ranges` every range asked for.
 */
function fakeSheets(tabs, other) {
  const calls = [];
  const ranges = [];
  const col = letters => letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  const blank = v => v === undefined || v === null || String(v) === '';
  const fetchJson = async (url, options) => {
    calls.push({ url, options });
    const u = new URL(url);
    if (u.hostname !== 'sheets.googleapis.com') {
      if (other) return other(url, options);
      throw new Error(`fakeSheets: unexpected request ${url}`);
    }
    if (!u.pathname.endsWith('/values:batchGet')) {
      return {
        properties: { title: 'Fake workbook' },
        sheets: Object.keys(tabs).map((title, index) => ({
          properties: { sheetId: index, title, index, gridProperties: { rowCount: tabs[title].gridRows, columnCount: 42 } },
        })),
      };
    }
    const valueRanges = u.searchParams.getAll('ranges').map(range => {
      ranges.push(range);
      const m = range.match(/^'(.+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      assert(m, `fakeSheets: unexpected range ${range}`);
      const tab = tabs[m[1].replace(/''/g, "'")];
      assert(tab, `fakeSheets: no tab for ${range}`);
      const firstRow = Number(m[3]);
      const lastRow = Math.min(Number(m[5]), tab.gridRows);
      assert(firstRow >= 1 && firstRow <= tab.gridRows, `fakeSheets: ${range} starts outside the grid (${tab.gridRows} rows)`);
      const values = [];
      for (let r = firstRow; r <= lastRow; r++) {
        const cells = (tab.rows[r - 1] || []).slice(col(m[2]) - 1, col(m[4])).map(v => (blank(v) ? '' : String(v)));
        while (cells.length && cells[cells.length - 1] === '') cells.pop();
        values.push(cells);
      }
      while (values.length && !values[values.length - 1].length) values.pop();
      return values.length ? { range, values } : { range };
    });
    return { valueRanges };
  };
  return { fetchJson, calls, ranges };
}

/** An Alert log of `count` alerts under its header (QA-1001 in row 2, newest last), `fields` each one's forwarded_fields. */
function fakeAlertLog(count, fields) {
  const header = ['alert_id', 'created_at', 'space', 'source_message', 'source_thread', 'record_key', 'author',
    'issue_tokens', 'exposure_tag', 'status', 'requested', 'forwarded_fields'];
  const rows = [header];
  for (let i = 1; i <= count; i++) {
    rows.push([`QA-${1000 + i}`, String(1760000000000 + i * 60000), 'spaces/TEST', `spaces/TEST/messages/m${i}`,
      `spaces/TEST/threads/t${i}`, `x:${i}`, `author${i}`, '[]', 'Product - Perceived bias', 'ok', '[]',
      JSON.stringify(Object.assign({}, fields || { product: 'Gems', issue_name: `Issue ${i}` }))]);
  }
  return rows;
}

async function runInProcessCases(sampleAlert) {
  const liveOps = require('./slrr_live_ops_server.js');
  const devPipeline = require('./slrr_dev_pipeline_server.js');
  const { readTabTails } = require('./mcp_stdio');
  const opsTool = name => liveOps.TOOLS.find(t => t.name === name);
  const devTool = name => devPipeline.TOOLS.find(t => t.name === name);
  let passed = 0;
  const check = async (name, fn) => {
    try {
      await fn();
      passed++;
    } catch (err) {
      err.message = `[${name}] ${err.message}`;
      throw err;
    }
  };

  // --- R2: every Control switch row, row 56 included ----------------------------------------------------------

  await check('control status reads every switch row the bot has, row 56 (Speed numbers: leave out when the bot was not running) included', async () => {
    const { loadBot } = require('../apps-script-chat-bot/test/fakes.js');
    const bot = loadBot();
    assert.deepStrictEqual(liveOps.CONTROL_SWITCH_ROWS, Array.from(bot.switchRows_()));  // (the bot runs in a VM of its own)
    assert.strictEqual(liveOps.CONTROL_SWITCH_ROWS.length, 32);
    const label = 'Speed numbers: leave out when the bot was not running';
    const offText = 'OFF (the speed numbers count every alert as they always have, and the bot keeps no record of when it was running)';
    const grid = { 56: [label, 'OFF', offText], 2: ['Bot', 'ON', ''] };
    const fetchJson = async url => {
      const u = new URL(url);
      assert.strictEqual(u.hostname, 'sheets.googleapis.com');
      if (!u.searchParams.get('includeGridData')) return { properties: { title: 'Fake workbook' }, sheets: [{ properties: { title: 'Control' } }] };
      const rowData = [];
      for (let r = 1; r <= 60; r++) rowData.push({ values: (grid[r] || []).map(v => ({ formattedValue: v })) });
      return { sheets: [{ data: [{ rowData }] }] };
    };
    const out = await opsTool('slrr_get_control_status').handler({ sheet_id: 'fake-sheet' }, { fetchJson });
    const row56 = out.switches.find(x => x.row === 56);
    assert.deepStrictEqual(row56, { row: 56, label, value: 'OFF', note: offText });
    assert.strictEqual(out.switches.length, 32);
    assert(/all 32 switches/.test(opsTool('slrr_get_control_status').description));
    assert(/row 56: Speed numbers: leave out when the bot was not running/.test(opsTool('slrr_get_control_status').description));
  });

  // --- A2: the newest rows of append-only tabs ----------------------------------------------------------------

  await check('trace finds an alert in the newest rows of a 5,700-row Alert log', async () => {
    const sheets = fakeSheets({ 'Alert log': { gridRows: 5700, rows: fakeAlertLog(5699) } });
    const out = await opsTool('slrr_trace_alert').handler({ query: 'QA-6600', include_logs: false }, { fetchJson: sheets.fetchJson });
    assert.strictEqual(out.alert_log_matches.length, 1);
    assert.strictEqual(out.alert_log_matches[0].alert_id, 'QA-6600');
    assert.strictEqual(out.alert_log_matches[0]._row, 5601, 'the match carries its real sheet row');
    assert.deepStrictEqual(sheets.ranges, ["'Alert log'!A1:AP1", "'Alert log'!A3701:AP5700"]);
    assert.strictEqual(out.truncated, true);
    assert.deepStrictEqual(out.tabs_read['Alert log'], {
      grid_rows: 5700, first_row_read: 3701, last_row_read: 5700, rows_read: 2000, truncated: true,
      note: '"Alert log": only its newest 2000 rows were read (sheet rows 3701-5700); 3699 older rows were not.',
    });
    assert.deepStrictEqual(out.read_notes, [out.tabs_read['Alert log'].note]);
  });

  await check('trace says so when the alert is older than the rows it read', async () => {
    const sheets = fakeSheets({ 'Alert log': { gridRows: 5700, rows: fakeAlertLog(5699) } });
    const out = await opsTool('slrr_trace_alert').handler({ query: 'QA-1005', include_logs: false }, { fetchJson: sheets.fetchJson });
    assert.deepStrictEqual(out.alert_log_matches, []);
    assert.strictEqual(out.truncated, true);
    assert(/3699 older rows were not/.test(out.read_notes.join(' ')));
  });

  await check('trace reads a short Alert log whole and does not call it truncated', async () => {
    const sheets = fakeSheets({ 'Alert log': { gridRows: 1000, rows: fakeAlertLog(40) } });
    const out = await opsTool('slrr_trace_alert').handler({ query: 'QA-1005', include_logs: false }, { fetchJson: sheets.fetchJson });
    assert.strictEqual(out.alert_log_matches.length, 1);
    assert.strictEqual(out.alert_log_matches[0]._row, 6);
    assert.deepStrictEqual(sheets.ranges, ["'Alert log'!A1:AP1000"]);
    assert.strictEqual(out.truncated, false);
    assert.deepStrictEqual(out.read_notes, []);
    assert.strictEqual(out.tabs_read['Alert log'].rows_read, 40);
  });

  await check('trace reads Watch detections to column S, from the bottom', async () => {
    const header = ['Seen (ET)', 'Watch', 'Score', 'At the bar', 'Topic', 'Post', 'Source', 'Network', 'Author', 'Followers',
      'Engagements', 'Posted (ET)', 'Issue or query', 'New issue', 'Summary', 'Burson alerted (ET)', 'Lead over Burson (min)',
      'Rating', 'Key'];
    const rows = [['Proactive watch: what the watches flagged'], ['Scorecard note'],
      ['Day (ET)', "Burson's alerts", 'Caught by a watch'], ['2026-11-11', '4', '3']];
    while (rows.length < 12) rows.push([]);
    rows.push(header);  // row 13
    for (let r = 14; r <= 5500; r++) {
      rows.push([`2026-11-11 10:${String(r % 60).padStart(2, '0')}`, 'Outage watch', '8', 'Yes', 'Topic', `https://x.com/u/status/${r}`,
        'Sonar', 'X', `user${r}`, '10', '5', '2026-11-11 09:00', '', 'Yes', `summary of post ${r}`, '', '', r === 5490 ? 'Useful' : '', `key-${r}`]);
    }
    const sheets = fakeSheets({ 'Watch detections': { gridRows: 5500, rows } });
    const out = await opsTool('slrr_trace_alert').handler({ query: 'key-5490', include_logs: false }, { fetchJson: sheets.fetchJson });
    assert.deepStrictEqual(sheets.ranges, ["'Watch detections'!A1:S20", "'Watch detections'!A4001:S5500"]);
    assert.strictEqual(out.watch_detection_matches.length, 1);
    const hit = out.watch_detection_matches[0];
    assert.strictEqual(hit._row, 5490);
    assert.strictEqual(hit.Summary, 'summary of post 5490');
    assert.strictEqual(hit.Rating, 'Useful');
    assert.strictEqual(hit.Key, 'key-5490');
    assert.strictEqual(out.tabs_read['Watch detections'].truncated, true);
    // a detection in the old rows isn't found, and the output says older rows weren't read
    const old = await opsTool('slrr_trace_alert').handler({ query: 'key-100', include_logs: false }, { fetchJson: sheets.fetchJson });
    assert.deepStrictEqual(old.watch_detection_matches, []);
    assert.strictEqual(old.truncated, true);
  });

  await check('relay tool reads the newest rows, past blank rows at the bottom of the grid', async () => {
    const relay = [['when', 'direction', 'what', 'who', 'user', 'text', 'status']];
    for (let r = 2; r <= 5500; r++) relay.push([`t${r}`, r % 2 ? 'From S-F Burson' : 'To S-F Burson', 'message', 'Name', `users/${r}`, `text ${r}`, 'sent']);
    const outbox = [['Queued (ET)', 'Kind', 'Where', 'Text or emoji', 'From', 'Status', 'Note', 'Key (written by the Burson QA bot)']];
    for (let r = 2; r <= 40; r++) outbox.push([`q${r}`, 'reply', 'https://chat.google.com/room/X', `text ${r}`, 'bot', r === 40 ? 'Pending' : 'Sent', '', `k${r}`]);
    const names = [['user', 'name', 'org', 'first_seen', 'seen_in', 'example'], ['users/1', 'Ada', 'Google'], ['users/2', '', ''], ['users/3', 'Bo', 'Burson']];
    const sheets = fakeSheets({
      // 500 blank rows under the last relay row: the grid's last 2,000 rows hold only 1,500 rows of data
      Relay: { gridRows: 6000, rows: relay },
      // a grid far longer than its data: the grid's last 2,000 rows are all blank
      'Burson outbox': { gridRows: 5000, rows: outbox },
      'Relay names': { gridRows: 1000, rows: names },
      'Test copy': { gridRows: 3000, rows: [['never read']] },
    });
    const out = await opsTool('slrr_inspect_relay_and_outbox').handler({ limit: 5 }, { fetchJson: sheets.fetchJson });
    assert.deepStrictEqual(out.present_tabs, ['Burson outbox', 'Relay', 'Relay names', 'Test copy']);
    assert(!sheets.ranges.some(r => r.includes('Test copy')), 'the Test copy tab is not fetched');
    assert(!sheets.ranges.some(r => /!A1:N2000$/.test(r)), 'no fixed range from the top');

    assert.strictEqual(out.relay.total_rows, 5499);
    assert.deepStrictEqual(out.relay.read, {
      grid_rows: 6000, first_row_read: 3501, last_row_read: 5500, rows_read: 2000, truncated: true,
      note: '"Relay": only its newest 2000 rows were read (sheet rows 3501-5500); 3499 older rows were not.',
    });
    assert.deepStrictEqual(out.relay.recent_rows.map(r => r._row), [5496, 5497, 5498, 5499, 5500]);
    assert.strictEqual(out.relay.recent_rows[4].text, 'text 5500');

    assert.strictEqual(out.burson_outbox.total_rows, 39);
    assert.strictEqual(out.burson_outbox.read.truncated, false);
    assert.strictEqual(out.burson_outbox.read.rows_read, 39);
    assert.deepStrictEqual(out.burson_outbox.status_counts, { Sent: 38, Pending: 1 });
    assert.deepStrictEqual(out.burson_outbox.pending_or_send_rows.map(r => r._row), [40]);

    assert.strictEqual(out.relay_names.total_people, 3);
    assert.strictEqual(out.relay_names.unmapped_count, 1);
    assert.strictEqual(out.relay_names.read.truncated, false);
    assert.strictEqual(out.truncated, true);
    assert.deepStrictEqual(out.truncation_notes, [out.relay.read.note]);
  });

  await check('readTabTails: exact fit, a short top-up that reaches the header, and a tab without a row count', async () => {
    const rows = [['h']];
    for (let r = 2; r <= 31; r++) rows.push([`v${r}`]);
    // 31 rows of data in a 40-row grid, 10 wanted: the window (31-40) holds one row, so rows 22-30 are read too
    let sheets = fakeSheets({ T: { gridRows: 40, rows } });
    let out = (await readTabTails('sheet', { sheets: [{ properties: { title: 'T', gridProperties: { rowCount: 40 } } }] },
      [{ tab: 'T', lastCol: 'B', topRows: 1, maxRows: 10 }], sheets.fetchJson)).T;
    assert.deepStrictEqual(sheets.ranges, ["'T'!A1:B1", "'T'!A31:B40", "'T'!A22:B30"]);
    assert.deepStrictEqual([out.firstRow, out.lastRow, out.rows.length, out.truncated, out.rowsNotRead], [22, 31, 10, true, 20]);
    assert.deepStrictEqual(out.rows[0], ['v22']);
    // 5 rows of data in a 40-row grid, 10 wanted: the window is blank, column A says where the data ends, all is read
    sheets = fakeSheets({ T: { gridRows: 40, rows: rows.slice(0, 6) } });
    out = (await readTabTails('sheet', { sheets: [{ properties: { title: 'T', gridProperties: { rowCount: 40 } } }] },
      [{ tab: 'T', lastCol: 'B', topRows: 1, maxRows: 10 }], sheets.fetchJson)).T;
    assert.deepStrictEqual(sheets.ranges, ["'T'!A1:B1", "'T'!A31:B40", "'T'!A2:A30", "'T'!A2:B6"]);
    assert.deepStrictEqual([out.firstRow, out.lastRow, out.rows.length, out.truncated], [2, 6, 5, false]);
    // no row count in the metadata: the first rows, as before, and flagged because the range came back full
    sheets = fakeSheets({ T: { gridRows: 40, rows } });
    out = (await readTabTails('sheet', { sheets: [{ properties: { title: 'T' } }] },
      [{ tab: 'T', lastCol: 'B', topRows: 1, maxRows: 10 }], sheets.fetchJson)).T;
    assert.deepStrictEqual(sheets.ranges, ["'T'!A1:B11"]);
    assert.deepStrictEqual([out.firstRow, out.rows.length, out.truncated, out.fromTop, out.gridRows], [2, 10, true, true, null]);
  });

  await check('backtest takes the newest Alert log rows, not rows 2-500', async () => {
    const preview = await devTool('slrr_preview_alert_triage').handler({ alert_text: sampleAlert });
    const sheets = fakeSheets({ 'Alert log': { gridRows: 5700, rows: fakeAlertLog(5699, preview.reviewed_fields) } });
    const out = await devTool('slrr_backtest_alerts').handler({ limit: 3 }, { fetchJson: sheets.fetchJson });
    assert.deepStrictEqual(sheets.ranges, ["'Alert log'!A1:AP1", "'Alert log'!A5201:AP5700"]);
    assert.strictEqual(out.total_tested, 3);
    assert.deepStrictEqual(out.results.map(r => r.id), ['QA-6697', 'QA-6698', 'QA-6699']);
    assert.strictEqual(out.alert_log_read.first_row_read, 5201);
    assert.strictEqual(out.alert_log_read.last_row_read, 5700);
    assert.strictEqual(out.alert_log_read.truncated, true);
    const none = fakeSheets({ Control: { gridRows: 100, rows: [['Burson QA bot']] } });
    await assert.rejects(devTool('slrr_backtest_alerts').handler({}, { fetchJson: none.fetchJson }), /no "Alert log" tab/);
  });

  // --- A3: the parity tool's two sub-tables and their "None" rows ----------------------------------------------

  const resultsTab = (imOnly, botOnly) => {
    const rows = [['Results', '', '', '', 'Updated 2026-11-12 10:00 ET'], ['scope note'], [],
      ['HEADLINE NUMBERS', 'Last 24 hours', 'Last 7 days'],
      ["The IMs sent a Social Alert, the bot didn't", '1', String(imOnly.length)],
      ["The bot sent a Social Alert, the IMs didn't", '0', String(botOnly.length)], [],
      ['WHERE THE BOT AND THE IMs DIFFERED (last 7 days)']];
    [["The IMs sent a Social Alert, the bot didn't", imOnly], ["The bot sent a Social Alert, the IMs didn't", botOnly]].forEach(([title, list]) => {
      rows.push([`${title}: ${list.length}${list.length > 5 ? ' (latest 5)' : ''}`, 'Post', 'Product', 'Issue', "The bot's reason"]);
      if (!list.length) rows.push(['None']);
      list.slice(0, 5).forEach(p => rows.push(p));
    });
    rows.push([], ['EVERY ALERT (last 7 days, newest first; one row per Burson post, both test spaces together)'],
      ['Burson posted (ET)', 'Post', 'Product', 'Issue'], ['2026-11-10 09:12', 'https://x.com/a/status/1', 'Gemini App', 'Issue A']);
    return { Results: { gridRows: 1000, rows } };
  };
  const post = n => [`2026-11-10 0${n}:12`, `https://x.com/a/status/${n}`, 'Gemini App', `Issue ${n}`, `reason ${n}`];

  await check('parity: no disagreements means none returned (the header and "None" rows are not rows)', async () => {
    const sheets = fakeSheets(resultsTab([], []));
    const out = await opsTool('slrr_inspect_parity_and_results').handler({}, { fetchJson: sheets.fetchJson });
    assert.strictEqual(out.disagreement_count_shown, 0);
    assert.deepStrictEqual(out.disagreements, []);
    assert.deepStrictEqual(out.disagreement_totals, { im_only: 0, bot_only: 0 });
  });

  await check('parity: each row is tagged im_only or bot_only under its own header', async () => {
    const sheets = fakeSheets(resultsTab([post(1), post(2)], [post(3)]));
    const out = await opsTool('slrr_inspect_parity_and_results').handler({}, { fetchJson: sheets.fetchJson });
    assert.strictEqual(out.disagreement_count_shown, 3);
    assert.deepStrictEqual(out.disagreements.map(d => d.kind), ['im_only', 'im_only', 'bot_only']);
    assert.deepStrictEqual(out.disagreement_totals, { im_only: 2, bot_only: 1 });
    assert.deepStrictEqual(out.disagreements[2], {
      _row: 13, kind: 'bot_only', 'Burson posted (ET)': '2026-11-10 03:12', Post: 'https://x.com/a/status/3',
      Product: 'Gemini App', Issue: 'Issue 3', "The bot's reason": 'reason 3',
    });
  });

  await check('parity: the totals come from the headers when only the latest 5 are listed', async () => {
    const sheets = fakeSheets(resultsTab([1, 2, 3, 4, 5, 6, 7].map(post), []));
    const out = await opsTool('slrr_inspect_parity_and_results').handler({}, { fetchJson: sheets.fetchJson });
    assert.strictEqual(out.disagreement_count_shown, 5);
    assert.deepStrictEqual(out.disagreement_totals, { im_only: 7, bot_only: 0 });
    assert(out.disagreements.every(d => d.kind === 'im_only'));
  });

  // --- A4: the Follow-up tab's real header row -----------------------------------------------------------------

  await check('trace finds the Follow-up header row and returns all eleven columns', async () => {
    const header = ['Sent (ET)', 'Space', 'Priority · Product · Issue', 'Post', 'Teams emailed', 'Replies', 'T&S',
      'Post now (row 18)', 'Status', 'Next step', 'Thread'];
    const rows = [['Follow-up: what came of the Social Alerts', '', '', '', 'Updated 2026-11-12 10:00 ET'], ['scope note'], [],
      ['DEADLINES: a team reply is expected within (edit column B)', 'Reply within', 'How the bot reads it'],
      ['P0', '1 hour', ''], ['P1', '4 hours', ''], ['P2', '1 business day', ''], [],
      ['LAST 7 DAYS (by when the Social Alert went out)', 'Sent', 'Replied'], ['All', '2', '1'], [],
      ['BY TEAM (last 7 days)', 'Social Alerts it got', 'Replied', 'Median time to reply'], ['GCPA', '2', '1', '30 min'], [],
      ['EVERY SOCIAL ALERT (last 14 days: overdue and questions waiting first, then the newest)'],
      header,
      ['2026-11-11 09:00', 'Mirror', 'P1 · Chrome · Zero-day', 'https://x.com/a/status/1', 'GCPA', 'GCPA replied in 20 min', 'Submitted',
        'still up', 'Question waiting', 'Answer the GCPA question about patch timing', 'https://mail.google.com/mail/u/0/#all/abc'],
      ['2026-11-10 08:00', 'Mirror', 'P2 · Gems · Bias', 'https://x.com/b/status/2', 'GCPA', 'No reply seen on the thread', '', '', 'Overdue', 'Chase GCPA', '']];
    const sheets = fakeSheets({ 'Follow-up': { gridRows: 1000, rows } });
    const out = await opsTool('slrr_trace_alert').handler({ query: 'patch timing', include_logs: false }, { fetchJson: sheets.fetchJson });
    assert.strictEqual(out.tabs_read['Follow-up'].header_row, 16);
    assert.strictEqual(out.follow_up_matches.length, 1, 'a value in column J (Next step) is searched');
    const hit = out.follow_up_matches[0];
    assert.deepStrictEqual(Object.keys(hit), ['_row'].concat(header));
    assert.strictEqual(hit._row, 17);
    assert.strictEqual(hit.Replies, 'GCPA replied in 20 min');
    assert.strictEqual(hit['T&S'], 'Submitted');
    assert.strictEqual(hit.Status, 'Question waiting');
    assert.strictEqual(hit.Thread, 'https://mail.google.com/mail/u/0/#all/abc');
    // a tab without that header row is reported, not searched with the wrong keys
    const odd = fakeSheets({ 'Follow-up': { gridRows: 1000, rows: rows.slice(0, 15) } });
    const none = await opsTool('slrr_trace_alert').handler({ query: 'GCPA', include_logs: false }, { fetchJson: odd.fetchJson });
    assert.deepStrictEqual(none.follow_up_matches, []);
    assert.strictEqual(none.tabs_read['Follow-up'].header_row, null);
    assert(/no row starting "Sent \(ET\)"/.test(none.read_notes.join(' ')));
  });

  // --- A5: slrr_run_tests ---------------------------------------------------------------------------------------

  const fakeRunner = exitCodes => {
    const ran = [];
    const runSubprocess = (cmd, args) => {
      const what = cmd === 'node' ? 'node' : args.includes('evals.run_evals') ? 'evals' : args.includes('pytest') ? 'pytest' : `${cmd} ${args.join(' ')}`;
      ran.push(what);
      return { exit_code: (exitCodes && exitCodes[what]) || 0, duration_ms: 1, stdout: `${what} ran`, stderr: '', signal: null, error: null };
    };
    return { runSubprocess, ran };
  };

  await check('run_tests: "all" (and the default) runs node, pytest and the evals', async () => {
    let runner = fakeRunner();
    let out = await devTool('slrr_run_tests').handler({ suite: 'all' }, runner);
    assert.deepStrictEqual(runner.ran, ['node', 'pytest', 'evals']);
    assert.deepStrictEqual(Object.keys(out.results), ['node', 'pytest', 'evals']);
    assert.strictEqual(out.all_passed, true);
    runner = fakeRunner();
    out = await devTool('slrr_run_tests').handler({}, runner);
    assert.strictEqual(out.suite, 'all');
    assert.deepStrictEqual(runner.ran, ['node', 'pytest', 'evals']);
  });

  await check('run_tests: failing evals fail "all"', async () => {
    const runner = fakeRunner({ evals: 1 });
    const out = await devTool('slrr_run_tests').handler({ suite: 'all' }, runner);
    assert.strictEqual(out.results.evals.passed, false);
    assert.strictEqual(out.all_passed, false);
  });

  await check('run_tests: each single suite runs only itself', async () => {
    for (const suite of ['node', 'pytest', 'evals']) {
      const runner = fakeRunner();
      const out = await devTool('slrr_run_tests').handler({ suite }, runner);
      assert.deepStrictEqual(runner.ran, [suite]);
      assert.strictEqual(out.all_passed, true);
    }
  });

  await check('run_tests: an unknown suite is an error and runs nothing', async () => {
    const runner = fakeRunner();
    await assert.rejects(devTool('slrr_run_tests').handler({ suite: 'evlas' }, runner), /Unknown suite "evlas"/);
    assert.deepStrictEqual(runner.ran, []);
  });

  // --- C6: the small items ---------------------------------------------------------------------------------------

  await check('log filters escape a backslash as well as a quote', async () => {
    const bodies = [];
    const fetchJson = async (url, options) => { bodies.push(options.body); return { entries: [] }; };
    await opsTool('slrr_read_logs').handler({ process_id: 'abc\\', function_name: 'po"ll\\' }, { fetchJson });
    assert(bodies[0].filter.includes('labels."script.googleapis.com/process_id"="abc\\\\"'), bodies[0].filter);
    assert(bodies[0].filter.includes('resource.labels.function_name="po\\"ll\\\\"'), bodies[0].filter);
    await opsTool('slrr_read_cloud_run_logs').handler({ service_name: 'svc\\', include_proactive_watch_sheet: false }, { fetchJson });
    assert(bodies[1].filter.includes('resource.labels.service_name="svc\\\\" OR resource.labels.job_name="svc\\\\"'), bodies[1].filter);
  });

  await check('the Drive metadata request sends supportsAllDrives once', async () => {
    const driveUrls = [];
    const sheets = fakeSheets({
      Resources: { gridRows: 100, rows: [['Name', 'Link', 'What it covers', 'Burson can see it?', 'Bot status'],
        ['Doc', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit', 'covers', 'Yes', '✓ Read']] },
    }, async url => { driveUrls.push(url); return { id: 'x', name: 'Doc' }; });
    const out = await opsTool('slrr_inspect_resource_doc').handler({}, { fetchJson: sheets.fetchJson });
    assert.strictEqual(out.matched_count, 1);
    assert.strictEqual(driveUrls.length, 1);
    assert.strictEqual((driveUrls[0].match(/supportsalldrives=/gi) || []).length, 1, driveUrls[0]);
    assert(driveUrls[0].includes('?supportsAllDrives=true&fields='), driveUrls[0]);
  });

  await check('the schemas declare the parameters the handlers honour', async () => {
    const logs = opsTool('slrr_read_logs').inputSchema.properties;
    assert(logs.gcp_project && logs.project_key);
    const run = opsTool('slrr_read_cloud_run_logs').inputSchema.properties;
    assert(run.sheet_id && run.gcp_project);
  });

  await check('the Test copy tab alone is reported as present without a single values request', async () => {
    const sheets = fakeSheets({ 'Test copy': { gridRows: 3000, rows: [['never read']] } });
    const out = await opsTool('slrr_inspect_relay_and_outbox').handler({}, { fetchJson: sheets.fetchJson });
    assert.deepStrictEqual(out.present_tabs, ['Test copy']);
    assert.deepStrictEqual(sheets.ranges, []);
    assert.strictEqual(out.relay.exists, false);
  });

  await check('the audit says so when git itself cannot be run', async () => {
    const runner = git => ({
      runSubprocess: (cmd, args) => (cmd === 'git' ? Object.assign({ duration_ms: 1, signal: null }, git)
        : { exit_code: 0, duration_ms: 1, stdout: '', stderr: '', signal: null, error: null }),
    });
    const remoteCheck = async git => (await devTool('slrr_audit_safety_invariants').handler({}, runner(git)))
      .checks.find(c => c.id === 'local_only_no_github_remote');
    let c = await remoteCheck({ exit_code: 128, stdout: '', stderr: 'fatal: not a git repository', error: null });
    assert.strictEqual(c.passed, false);
    assert.strictEqual(c.detail, 'Could not run `git remote -v` (fatal: not a git repository), so the remotes were not checked');
    c = await remoteCheck({ exit_code: -1, stdout: '', stderr: '', error: 'spawnSync git ENOENT' });
    assert.strictEqual(c.passed, false);
    assert(/spawnSync git ENOENT/.test(c.detail) && !/Zero git remotes/.test(c.detail), c.detail);
    c = await remoteCheck({ exit_code: 0, stdout: '', stderr: '', error: null });
    assert.deepStrictEqual([c.passed, c.detail], [true, 'Zero git remotes configured (local-only policy intact)']);
    c = await remoteCheck({ exit_code: 0, stdout: 'origin\thttps://example.invalid/repo.git (fetch)\n', stderr: '', error: null });
    assert.strictEqual(c.passed, false);
    assert(/^Unexpected git remotes: origin/.test(c.detail), c.detail);
  });

  console.log(`✓ ${passed} in-process cases passed (canned Sheets and subprocess responses; nothing live was read)`);
}

async function main() {
  const runLive = process.argv.includes('--live');

  // 1. Test slrr-dev-pipeline over real stdio
  const devClient = spawnMcpClient(path.join(__dirname, 'slrr_dev_pipeline_server.js'));
  try {
    const init = await devClient.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-test-client', version: '1.0.0' },
    });
    assert.strictEqual(init.serverInfo.name, 'slrr-dev-pipeline');
    devClient.notify('notifications/initialized');

    const listed = await devClient.request('tools/list');
    assert.strictEqual(listed.tools.length, 7);

    const audit = await devClient.callTool('slrr_audit_safety_invariants');
    assert.strictEqual(audit.all_passed, true, `Safety audit failed: ${JSON.stringify(audit, null, 2)}`);

    const leakBlocked = await devClient.callTool('slrr_test_leak_guard', {
      text: 'The bot copied this into the Mirror space from the outbox tab.',
      emoji: '👎',
    });
    assert.strictEqual(leakBlocked.text_check.allowed_to_burson, false);
    assert(leakBlocked.text_check.outbox_guard_hits.length >= 2);
    assert.strictEqual(leakBlocked.emoji_check.allowed_to_burson, false);

    const leakClean = await devClient.callTool('slrr_test_leak_guard', {
      text: 'Hi team — could you please share the direct link to the post? Thank you!',
      emoji: '👍',
    });
    assert.strictEqual(leakClean.text_check.allowed_to_burson, true);
    assert.strictEqual(leakClean.emoji_check.allowed_to_burson, true);

    const sampleAlert = [
      'THIS ALERT MEETS P2 CRITERIA',
      '',
      '🟨SOCIAL ALERT🟨: Gems | Criticism against AI Overviews | Instagram | 29425 Engagements',
      '[Name]: Criticism against AI Overviews / Ongoing Issue',
      '[Engagement]: LOW (29425 engagements)',
      '[Product]: Gems',
      '[Social Network]: Instagram',
      '[Exposure Tag]: Product - Perceived bias',
      '[Sensitive Topic]: -',
      '[KOF]: No',
      '',
      'X user edervolcelazz (195 followers) shared a post featuring an AI Overview with an offensive reply.',
      '',
      '[Link]: https://x.com/edervolcelazz/status/2109566527900926417',
      '[Time/Date Post Went Live]: October 12, 2026, 1:47 AM',
      '[Code]: Product - Perceived bias,29425,edervolcelazz,-,Gems,Ongoing Issue',
    ].join('\n');

    const preview = await devClient.callTool('slrr_preview_alert_triage', { alert_text: sampleAlert });
    assert.strictEqual(preview.detected, true);
    assert(preview.fixes.length > 0, 'Expected deterministic fixes on mismatched Gems/Instagram sample alert');
    // the preview's Social Alert email carries the corrected alert's own [Code] (the corrected product), as the bot's does
    const previewCode = preview.analyst_space_post.split('\n').find(l => l.indexOf('[Code]: ') === 0).slice('[Code]: '.length);
    assert.strictEqual(previewCode, 'Product - Perceived bias,29425,edervolcelazz,-,Gemini App,Ongoing Issue');
    assert(preview.social_alert_email, 'Expected the sample alert to be escalated, so the preview has its email');
    assert(preview.social_alert_email.body_preview.split('\n').includes(`Code: ${previewCode}`), preview.social_alert_email.body_preview);

    const simGuidance = await devClient.callTool('slrr_simulate_guidance_rule', {
      guidance_text: 'Escalate all posts about Chrome zero-day CVE-2026-125350 regardless of engagement',
      applies_to: 'Chrome',
      product: 'Chrome',
    });
    assert.strictEqual(simGuidance.can_start_alerts_under_row13, true);
    assert.strictEqual(simGuidance.product_scope_check.allowed, true);

    const backtestOffline = await devClient.callTool('slrr_backtest_alerts', {
      custom_alerts: [sampleAlert],
    });
    assert.strictEqual(backtestOffline.total_tested, 1);

    console.log('✓ slrr-dev-pipeline passed all stdio protocol & VM tool assertions (7 tools)');
  } finally {
    await devClient.close();
  }

  // 2. Test slrr-live-ops protocol + optional live GCP execution
  const opsClient = spawnMcpClient(path.join(__dirname, 'slrr_live_ops_server.js'));
  try {
    const init = await opsClient.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mcp-test-client', version: '1.0.0' },
    });
    assert.strictEqual(init.serverInfo.name, 'slrr-live-ops');
    opsClient.notify('notifications/initialized');

    const listed = await opsClient.request('tools/list');
    assert.strictEqual(listed.tools.length, 9);
    console.log('✓ slrr-live-ops passed stdio initialization & tool schema listing (9 tools)');

    if (runLive) {
      const control = await opsClient.callTool('slrr_get_control_status');
      assert.strictEqual(control.safety_audit.lookback_dropdown_strict_15m, true);
      assert.strictEqual(control.safety_audit.write_back_bq_is_off, true);
      console.log(
        `✓ slrr_get_control_status (LIVE): Bot=${control.bot.enabled} | Last check=${control.bot.last_check} | Tabs=${control.tabs.length} | B31=${control.bigquery_lookback.configured}`
      );

      const logs = await opsClient.callTool('slrr_read_logs', { minutes_back: 180, limit: 10 });
      console.log(`✓ slrr_read_logs (LIVE): returned ${logs.returned_count} log entries (severities=${JSON.stringify(logs.severity_counts)})`);

      const kb = await opsClient.callTool('slrr_inspect_knowledge_and_guidance');
      console.log(
        `✓ slrr_inspect_knowledge_and_guidance (LIVE): ${kb.resources.healthy_docs}/${kb.resources.total_docs} healthy docs, ${kb.guidance.total_rules} guidance rules`
      );

      const relay = await opsClient.callTool('slrr_inspect_relay_and_outbox', { limit: 10 });
      console.log(
        `✓ slrr_inspect_relay_and_outbox (LIVE): present_tabs=${JSON.stringify(relay.present_tabs)}, outbox_rows=${relay.burson_outbox.total_rows}, relay_rows=${relay.relay.total_rows}, unmapped_people=${relay.relay_names.unmapped_count}`
      );

      const diff = await opsClient.callTool('slrr_diff_live_apps_script', { target: 'all' });
      console.log(
        `✓ slrr_diff_live_apps_script (LIVE): all_in_sync=${diff.all_in_sync}, projects=${diff.projects.map(p => `${p.project}(sync=${p.in_sync},identical=${p.identical_count},mod=${p.modified_count})`).join(', ')}`
      );

      const docInspect = await opsClient.callTool('slrr_inspect_resource_doc', { query: 'Collection Requirements' });
      console.log(
        `✓ slrr_inspect_resource_doc (LIVE): matched=${docInspect.matched_count}, first=${docInspect.documents[0] && docInspect.documents[0].name}`
      );

      const trace = await opsClient.callTool('slrr_trace_alert', { query: 'QA-', limit: 2, include_logs: false });
      console.log(
        `✓ slrr_trace_alert (LIVE): alert_log_matches=${trace.alert_log_matches.length}, results_matches=${trace.results_parity_matches.length}`
      );
    }
  } finally {
    await opsClient.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
