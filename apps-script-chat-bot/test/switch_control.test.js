// The Control tab's switches (rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56, Control.gs) and the 49,000-character cell cap (Sheets.gs, Speed.gs).
'use strict';

module.exports = H => {
  const { test, eq, assert, B, NOW, e2e, makeGoogle, TRIAGED } = H;
  const LABELS = ['Auto-send Social Alerts', 'Auto-submit T&S form', 'KB & Guidance can start alerts', 'Auto-find missing links',
    'Direct BigQuery alerts', 'Write back to SLRR BigQuery', 'Learn from IM calls', 'Watch sent alerts (24h)',
    'Early wave & velocity check', 'Check outage & comms docs', 'Track post-alert outcomes', 'Relay with S-F Burson',
    'Never wait on Burson', 'Post in S-F Burson', 'Draft follow-ups', 'Draft answers to questions', 'Safety valve',
    'Work directly in B25 (Google-only)', 'Proactive watch', 'Temp checks', 'Group test emails', 'Fast triage (Gemini Decisions)',
    'Fast triage: rank and early watch', 'Fast triage: hold back noise', 'Write early-wave records to BigQuery',
    'Early Detection: also read the AMIE table', 'Early Detection: also read Brandwatch live (not X)', 'Proactive watch: also read the AMIE table', 'Open engine: judgment in place of caps',
    'Live dashboard', 'Slide deliveries', 'Speed numbers: leave out when the bot was not running'];  // row 56 is a switch now
  const KEYS = ['autoSend', 'autoTns', 'kbStartAlerts', 'autoFindLinks', 'directBq', 'writeBackBq', 'learnIm', 'watchSent',
    'earlyWave', 'outageComms', 'trackOutcomes', 'relay', 'noWait', 'postBurson', 'draftFollowUps', 'draftAnswers', 'safetyValve',
    'directB25', 'proactiveWatch', 'tempChecks', 'bsgTestEmails', 'fastTriage', 'fastTriageRank', 'fastTriageHold', 'earlyWaveBq',
    'edAmie', 'edBwLive', 'watchAmie', 'openEngine', 'liveDashboard', 'slideDeliveries', 'speedHonest'];
  const ROWS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 27, 28, 29, 32, 34, 36, 37, 38, 39, 40, 46, 48, 49, 50, 51, 54, 55, 56];  // rows 25-26 the space cells, 30-31 B30 / B31, 33 B33, 35 B35, 41-45 and 47 bars, 52-53 left to people
  const rows = (t, col) => ROWS.map(r => t.control().cell(r, col));
  const allOff = () => Object.fromEntries(KEYS.map(k => [k, false]));
  const VALVE = KEYS.indexOf('safetyValve');

  test('switches: a new Control tab has all 32, each an ON / OFF dropdown set to OFF, with what OFF means in column C; rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 are the switches, row 25 the S-F Burson space (blank), row 26 the Burson test copy (blank), row 30 Testing: send to (blank), row 31 the BigQuery lookback (60 minutes, its own dropdown), row 33 the Other alerts space (blank, no dropdown), row 35 Watch alerts (OFF, its own dropdown), rows 41-45 and 47 the fast-triage and early-watch bars, rows 52-53 blank, and "How it works" follows from row 57', () => {
    const t = e2e();
    t.bot.setup();
    eq(B.switchRows_(), ROWS);
    eq(rows(t, 1), LABELS);
    eq(rows(t, 2), LABELS.map(() => 'OFF'));
    ROWS.forEach(r => eq(t.control().validations[`${r},2`].values, ['ON', 'OFF']));
    // column C: what OFF means (the Safety valve's: B26 decides, until a run knows the mode)
    eq(rows(t, 3), B.ev('CONTROL_SWITCHES_').map(s => B.switchOffText_(s)));
    rows(t, 3).forEach(c => assert.match(c, /^OFF \(/));
    t.poll();  // the first run: C29 says the run's mode (Testing here: no S-F Burson)
    assert.match(rows(t, 3)[VALVE], /^OFF \u00b7 \ud83e\uddea Testing \(S-F Burson, B25, isn't set or found\): nothing goes to S-F Burson, and every email goes only to the stand-in \(B30\)\. With B26 blank and S-F Burson set, the bot is fully LIVE$/);
    assert.match(t.control().cell(16, 3), /writes only to this sheet: nothing goes to the shared SLRR BigQuery tables/);
    eq([25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57].map(r => t.control().cell(r, 1)), ['S-F Burson space', 'Burson test copy', 'Draft follow-ups',
      'Draft answers to questions', 'Safety valve', 'Testing: send to', 'BigQuery lookback', 'Work directly in B25 (Google-only)',
      'Other alerts space', 'Proactive watch', 'Watch alerts', 'Temp checks', 'Group test emails', 'Fast triage (Gemini Decisions)', 'Fast triage: rank and early watch', 'Fast triage: hold back noise',
      'Hold-back: about_google at or below', 'Hold-back: routine_noise at or above', 'Hold-back and early watch: answer confidence at or above',
      'Early watch: about_google and brand_risk, each at or above', 'Early watch: distinct accounts, at least',
      'Write early-wave records to BigQuery', 'Early watch: independent_reports at or above', 'Early Detection: also read the AMIE table',
      'Early Detection: also read Brandwatch live (not X)', 'Proactive watch: also read the AMIE table', 'Open engine: judgment in place of caps', '', '',
      'Live dashboard', 'Slide deliveries', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is a switch now
    eq([t.control().validations['25,2'], t.control().validations['26,2'], t.control().validations['33,2']], [undefined, undefined, undefined]);  // a space goes there
    // B31 is no switch: 60 minutes, with its own 15 / 30 / 45 / 60 minutes dropdown
    eq([t.control().cell(31, 2), t.control().validations['31,2'].values], ['60 minutes', ['15 minutes', '30 minutes', '45 minutes', '60 minutes']]);
    // B35 is no switch either: OFF, with its own OFF / Other alerts space (B33) / Mirror space (B9) dropdown
    eq([t.control().cell(35, 2), t.control().validations['35,2'].values],
      ['OFF', ['OFF', 'Other alerts space (B33)', 'Mirror space (B9)', 'Auto-correct space (B10)']]);
    const help = Array.from({ length: B.ev('CONTROL_HELP_').length }, (_, i) => t.control().cell(58 + i, 1)).join('\n');
    LABELS.forEach(l => assert.ok(help.includes(`• ${l}: `), l));
    eq(t.bot.readControl_(t.control()).switches, allOff());
    eq(B.ev('CONTROL_SWITCHES_').map(s => s.key), KEYS);
  });

  test('switches: a Control tab from before them gets them in place, all OFF; B2:B10 and the people\'s values are kept, and the old help text is gone', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    // The tab as the earlier build left it: help text from row 11 (column A only), and values people set in B2:B10
    sh.rows = sh.rows.slice(0, 10);
    sh.validations = { '2,2': sh.validations['2,2'] };
    const oldHelp = ['How it works'].concat(Array.from({ length: 12 }, (_, i) => `• old help line ${i + 1}`));
    oldHelp.forEach((line, i) => { sh.rows[10 + i] = [line]; });
    t.set('B2', 'ON');
    t.set('B9', 'https://mail.google.com/chat/u/0/#chat/space/AAQAmirror1');
    const people = () => [1, 2, 3, 4, 8, 9, 10].map(r => [sh.cell(r, 1), sh.cell(r, 2)]);  // B5:B7 are the bot's
    const before = people();
    t.poll();  // the every-minute run adds them: nobody has to run setup() after an update
    eq(people(), before);
    eq(rows(t, 1), LABELS);
    eq(rows(t, 2), LABELS.map(() => 'OFF'));
    ROWS.forEach(r => eq(sh.validations[`${r},2`].values, ['ON', 'OFF']));
    eq([25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57].map(r => sh.cell(r, 1)), ['S-F Burson space', 'Burson test copy', 'Draft follow-ups',
      'Draft answers to questions', 'Safety valve', 'Testing: send to', 'BigQuery lookback', 'Work directly in B25 (Google-only)',
      'Other alerts space', 'Proactive watch', 'Watch alerts', 'Temp checks', 'Group test emails', 'Fast triage (Gemini Decisions)', 'Fast triage: rank and early watch', 'Fast triage: hold back noise',
      'Hold-back: about_google at or below', 'Hold-back: routine_noise at or above', 'Hold-back and early watch: answer confidence at or above',
      'Early watch: about_google and brand_risk, each at or above', 'Early watch: distinct accounts, at least',
      'Write early-wave records to BigQuery', 'Early watch: independent_reports at or above', 'Early Detection: also read the AMIE table',
      'Early Detection: also read Brandwatch live (not X)', 'Proactive watch: also read the AMIE table', 'Open engine: judgment in place of caps', '', '',
      'Live dashboard', 'Slide deliveries', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is a switch now
    // the BigQuery lookback row comes in too: 60 minutes, with its dropdown (the tab had only B2's)
    eq([sh.cell(31, 2), sh.validations['31,2'].values], ['60 minutes', ['15 minutes', '30 minutes', '45 minutes', '60 minutes']]);
    eq([sh.cell(25, 2), t.bot.readControl_(sh).sfBurson, sh.cell(26, 2), t.bot.readControl_(sh).testCopy], ['', '', '', '']);
    assert.ok(!sh.rows.some(r => /old help line/.test(String(r[0]))));
    eq(t.bot.readControl_(sh).switches, allOff());

    // A switch someone turned ON stays ON through setup() and later runs; so does one they turned back OFF
    sh.getRange(13, 2).setValue('ON');
    sh.getRange(16, 2).setValue('OFF');
    sh.getRange(28, 2).setValue('ON');
    t.bot.setup();
    t.poll();
    eq([sh.cell(13, 2), sh.cell(16, 2), sh.cell(28, 2)], ['ON', 'OFF', 'ON']);
    eq(t.bot.readControl_(sh).switches, Object.assign(allOff(), { kbStartAlerts: true, draftAnswers: true }));
  });

  test('switches: ON only on the switch\'s own row with its own label (lower-case on is ON; anything else, or a row that isn\'t the switch, is OFF)', () => {
    const on = { kbStartAlerts: true, trackOutcomes: true };
    const grid = LABELS.map((l, i) => [l, KEYS[i] === 'kbStartAlerts' ? 'on' : (KEYS[i] === 'trackOutcomes' ? 'ON' : 'yes')]);
    eq(B.parseSwitches_(grid), Object.assign(allOff(), on));
    eq(B.parseSwitches_(grid.map(r => ['• some help text', r[1]])), allOff());
    eq(B.parseSwitches_([]), allOff());
    eq(B.parseSwitches_(LABELS.map(l => [l, true])), Object.fromEntries(KEYS.map(k => [k, true])));
    assert.strictEqual(B.switchOn_({ switches: { autoSend: true } }, 'autoSend'), true);
    eq([B.switchOn_({}, 'autoSend'), B.switchOn_(null, 'autoSend'), B.switchOn_({ switches: { autoSend: 'ON' } }, 'autoSend')], [false, false, false]);
  });

  test('switches: each run\'s ctx has them (OFF unless ON on the tab), and column C says what an ON switch is doing, with the stand-in while testing', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    t.set('B30', 'tester@testing.test');
    sh.getRange(11, 2).setValue('ON');
    sh.getRange(19, 2).setValue('ON');
    t.bot.noteSwitch_('earlyWave', 'last check 8:15 AM · 1 wave today');
    t.bot.noteSwitch_('directBq', 'a note for a switch that is OFF');
    t.bot.earlyWaveCheck_ = () => null;  // the check itself (it writes its own note) is tested in switch_i_early_wave.test.js
    t.poll();
    assert.strictEqual(sh.cell(11, 3), '✓ ON (testing: sending only to the testers in B30)');
    assert.match(sh.cell(19, 3), /^✓ ON: every 15 min, .* · last check 8:15 AM · 1 wave today$/);
    assert.match(sh.cell(15, 3), /^OFF \(/);
    eq(B.switchStatusTexts_({ autoSend: true }, '', {}, NOW)[0], '✓ ON: the bot sends the Social Alert email itself');
    // A note from more than a day ago is left out
    eq(B.switchStatusTexts_({ earlyWave: true }, '', { earlyWave: { text: 'old', at: NOW - 25 * 3600e3 } }, NOW)[8],
      B.switchStatusTexts_({ earlyWave: true }, '', {}, NOW)[8]);
    const ctx = t.bot.buildCtx_({ burson: { id: H.TEST_FEED, name: 'Feed' }, analyst: { id: TRIAGED, name: 'Analysts' } }, t.sheet());
    eq(ctx.switches, Object.assign(allOff(), { autoSend: true, earlyWave: true }));
    const given = t.bot.buildCtx_({ burson: { id: H.TEST_FEED, name: 'Feed' }, analyst: { id: TRIAGED, name: 'Analysts' } }, t.sheet(), { learnIm: true });
    eq(given.switches, Object.assign(allOff(), { learnIm: true }));
    // Paused, column C is still kept up to date
    t.set('B2', 'OFF');
    sh.getRange(11, 2).setValue('OFF');
    t.poll();
    assert.match(sh.cell(11, 3), /^OFF \(/);
  });

  test('switches: a note a switch keeps writing (a reason that lasts, like "live form id not set") stays in column C past a day; one it stopped writing drops out after a day', () => {
    const t = e2e();
    t.bot.setup();
    t.control().getRange(12, 2).setValue('ON');
    t.control().getRange(13, 2).setValue('ON');
    const LASTING = 'live form id not set (script property TNS_LIVE_FORM_ID): posting the link instead';
    t.bot.noteSwitch_('kbStartAlerts', 'an old note');
    for (let h = 0; h < 30; h++) {
      t.bot.noteSwitch_('autoTns', LASTING);
      t.g.clock.now += 3600e3;
    }
    t.poll();
    assert.ok(t.control().cell(12, 3).endsWith(` · ${LASTING}`), t.control().cell(12, 3));
    assert.ok(!/an old note/.test(t.control().cell(13, 3)), t.control().cell(13, 3));
    // The same note within the hour isn't written again (one property write an hour at most); after it, it is
    t.bot.noteSwitch_('autoTns', LASTING);
    const at = JSON.parse(t.g.props.get('SWITCH_NOTES')).autoTns.at;
    t.g.clock.now += 59 * 60e3;
    t.bot.noteSwitch_('autoTns', LASTING);
    eq(JSON.parse(t.g.props.get('SWITCH_NOTES')).autoTns.at, at);
    t.g.clock.now += 60e3;
    t.bot.noteSwitch_('autoTns', LASTING);
    eq(JSON.parse(t.g.props.get('SWITCH_NOTES')).autoTns.at, at + 3600e3);
  });

  test('standalone Auto-correct space (B10; B9 and B4 blank; B25 the live space, read only; the Safety valve OFF and B26 blank): the Control tab says what is so. Today (B7) is that flow\'s own count, the one C10 shows, in the same run (the main flow\'s counters never move there); and the Safety valve\'s note (C29) says the run is Testing because the bot works in the Auto-correct space, without the line that B26 blank and S-F Burson set make the bot LIVE (both are so here, and it is Testing: every email goes only to B30)', () => {
    const t = e2e(null, { noWait: true });
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    const AC = 'spaces/AAQAautocorrect8';
    t.chat.addSpace(AC, 'SLRR Unified Auto-correct');
    t.set('B25', H.REAL);
    t.set('B3', `https://chat.google.com/app/chat/${AC.replace('spaces/', '')}`);
    t.set('B4', '');
    t.set('B9', '');
    t.set('B10', 'SLRR Unified Auto-correct');
    eq([t.get('B29'), t.get('B26')], ['OFF', '']);
    t.poll();  // the Auto-correct flow starts reading the live space from here
    eq([t.get('B5'), t.get('B7'), t.get('C10')], ['✅ Working', 'No alerts yet today', '✓ SLRR Unified Auto-correct · no alerts yet today']);
    const C29 = 'OFF · 🧪 Testing (working in the Auto-correct space (B10)): nothing goes to S-F Burson, and every email goes only to ' +
      'tester@testing.test (B30). The bot works only in the Auto-correct space, which is always Testing';
    eq(t.get('C29'), C29);
    t.g.clock.now += 60 * 1000;
    t.chat.say(H.REAL, H.F.MISTAKES, { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
    t.poll();
    // one alert, corrected, its Social Alert sent to the tester only: C10 and B7 say the same, in this very run
    const social = t.g.gmail.sentMessages().filter(m => /SOCIAL ALERT/.test(m.subject));
    eq([social.length, social.every(m => m.to.join() === 'tester@testing.test' && !(m.cc || []).length)], [1, true]);
    eq(t.get('C10'), '✓ SLRR Unified Auto-correct · today: 1 alert, 1 corrected, 1 Social Alert sent, 0 questions answered');
    eq(t.get('B7'), '1 alert, 1 corrected, 1 Social Alert sent, 0 questions answered (in the Auto-correct space, B10)');
    eq([t.get('C29'), /LIVE/.test(t.get('C29')), t.get('B5')], [C29, false, '✅ Working']);
    // an idle run later: both as they were
    t.poll();
    eq([t.get('B7'), t.get('C10')], ['1 alert, 1 corrected, 1 Social Alert sent, 0 questions answered (in the Auto-correct space, B10)',
      '✓ SLRR Unified Auto-correct · today: 1 alert, 1 corrected, 1 Social Alert sent, 0 questions answered']);
    // Any other reason a run is Testing keeps the line that says how to go LIVE (the first test above: no S-F Burson)
    const off = B.ev('CONTROL_SWITCHES_').find(s => s.key === 'safetyValve').off;
    assert.match(off({}, false, { modeWhy: 'the Burson test copy, B26, is set' }), /\(B30\)\. With B26 blank and S-F Burson set, the bot is fully LIVE$/);
    eq(t.chat.botPosts(H.REAL), []);
  });

  test('standalone Auto-correct space: when the write of Today (B7) that follows the flow fails (Sheets, once), the run logs it and skips nothing after it: the Temp checks, the Proactive watch\'s step and the four report tabs (Results, Follow-up, Analysis, Head start) still get their turn in that run, and the next run writes the cell', () => {
    const t = e2e(null, { noWait: true });
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    const AC = 'spaces/AAQAautocorrect9';
    t.chat.addSpace(AC, 'SLRR Unified Auto-correct');
    t.set('B25', H.REAL);
    t.set('B3', `https://chat.google.com/app/chat/${AC.replace('spaces/', '')}`);
    t.set('B4', '');
    t.set('B9', '');
    t.set('B10', 'SLRR Unified Auto-correct');
    t.poll();  // the Auto-correct flow starts reading the live space from here
    t.g.clock.now += 60 * 1000;
    t.chat.say(H.REAL, H.F.MISTAKES, { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
    // Sheets fails once on that write: the one cell B7 (the run's own status write, before the flow, is B5:B7 at once)
    const control = t.control();
    const real = control.getRange.bind(control);
    let failed = 0;
    control.getRange = (r, c, nr, nc) => {
      const range = real(r, c, nr, nc);
      if (r === 7 && c === 2 && !nr && !nc) {
        range.setValue = () => { failed++; throw new Error('Service Spreadsheets failed while accessing document'); };
      }
      return range;
    };
    // what comes after that write in the run, counted
    const STEPS = ['runTempChecks_', 'proactiveWatchOff_', 'maybeRefreshSpeed_', 'maybeRefreshFollowUp_', 'maybeRefreshAnalysis_', 'maybeRefreshHeadStart_'];
    const ran = {};
    STEPS.forEach(name => {
      const step = t.bot[name];
      t.bot[name] = (...args) => { ran[name] = (ran[name] || 0) + 1; return step(...args); };
    });
    const logged = t.g.logs.length;
    t.poll();
    control.getRange = real;
    const logs = t.g.logs.slice(logged);
    eq([failed, STEPS.map(name => ran[name] || 0), logs.filter(l => /could not update Today \(B7\)|after the run:/.test(l))],
      [1, [1, 1, 1, 1, 1, 1], ['ERROR could not update Today (B7): Service Spreadsheets failed while accessing document']]);
    // the alert was handled as ever; only the cell is behind, until the next run
    const COUNT = '1 alert, 1 corrected, 1 Social Alert sent, 0 questions answered';
    eq([t.g.gmail.sentMessages().filter(m => /SOCIAL ALERT/.test(m.subject)).length, t.get('B7'), t.get('C10'), t.get('B5')],
      [1, 'No alerts yet today', `✓ SLRR Unified Auto-correct · today: ${COUNT}`, '✅ Working']);
    t.poll();
    eq([failed, t.get('B7')], [1, `${COUNT} (in the Auto-correct space, B10)`]);
    eq(t.chat.botPosts(H.REAL), []);
  });

  test('cell cap: no cell the bot writes goes over 49,000 characters; a JSON column stays JSON that parses, keeping its short fields', () => {
    assert.strictEqual(B.ev('SHEET_CELL_MAX_CHARS_'), 49000);
    const huge = 'x'.repeat(120000);
    eq([B.encodeCell_('author', huge).length, B.encodeCell_('author', '=' + huge).slice(0, 2)], [49000, '\'=']);
    assert.strictEqual(B.speedText_(huge).length, 49000);
    assert.strictEqual(B.speedText_('=SUM(A1)'), '\'=SUM(A1)');
    const input = { escalation: { text: huge, product: 'Gemini App', track: 'URGENT' }, screenshot: { url: 'https://x.com/a.png', label: 'Screenshot of the post', base64: huge },
      recommended_groups: ['PRESS'], summary: huge };
    const cell = B.encodeCell_('email_input', input);
    assert.ok(cell.length <= 49000, String(cell.length));
    const back = B.decodeCell_('email_input', cell);
    eq([back.escalation.product, back.escalation.track, back.screenshot.url, back.recommended_groups, 'base64' in back.screenshot],
      ['Gemini App', 'URGENT', 'https://x.com/a.png', ['PRESS'], false]);
    assert.ok(back.escalation.text.startsWith('xxx') && back.escalation.text.endsWith('…'));
    // A list that's too long is shortened, still a list; a small value is written exactly as before
    const tokens = Array.from({ length: 20000 }, (_, i) => 'token' + i);
    const list = B.decodeCell_('issue_tokens', B.encodeCell_('issue_tokens', tokens));
    assert.ok(list.length > 1000 && list.length < 20000 && list[0] === 'token0');
    eq(B.encodeCell_('email_input', { a: 1, b: 'two' }), JSON.stringify({ a: 1, b: 'two' }));
    // Written through the store's table (as poll() does), the row reads back
    const rowsWritten = [];
    const io = { lastRow: () => rowsWritten.length + 1, read: (f, c) => rowsWritten.slice(f - 2, f - 2 + c), append: v => { rowsWritten.push(v); return rowsWritten.length + 1; },
      write: (r, v) => { rowsWritten[r - 2] = v; }, keyAt: (r, c) => rowsWritten[r - 2][c - 1], findRow: () => null };
    const table = B.tableOver_(io, ['alert_id', 'email_input', 'decision'], 'alert_id', 100);
    table.append({ alert_id: 'QA-1', email_input: input, decision: huge });
    rowsWritten[0].forEach(v => assert.ok(String(v).length <= 49000));
    const [row] = table.load();
    eq([row.alert_id, row.email_input.escalation.product, row.decision.length], ['QA-1', 'Gemini App', 49000]);
  });

  test('cell cap: a huge email_input (a long alert text) no longer stops the run that writes it', () => {
    const g = makeGoogle(NOW);
    const t = e2e(g);
    t.bot.setup();
    const log = t.sheet().getSheetByName('Alert log');
    const header = log.rows[0];
    const row = header.map(h => (h === 'alert_id' ? 'QA-9' : ''));
    log.appendRow(row);
    const table = t.bot.sheetBackend_(t.sheet());
    const [r] = table.loadAlerts();
    table.updateAlert(r, { email_input: { escalation: { text: 'y'.repeat(200000) } }, decision: 'z'.repeat(60000) });
    log.rows.forEach(vals => vals.forEach(v => assert.ok(String(v).length <= 49000)));
    const [again] = t.bot.sheetBackend_(t.sheet()).loadAlerts();
    assert.ok(again.email_input.escalation.text.length < 49000);
  });
};
