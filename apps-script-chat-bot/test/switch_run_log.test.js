// When the bot ran (Control row 56, "Speed numbers: leave out when the bot was not running", RunLog.gs; key
// speedHonest): the switch row (written OFF, never set ON by the bot; a person's text in row 56 kept below the help);
// with it OFF nothing new is read or written (every output equal to a world where every RunLog.gs entry point does
// nothing); with it ON the "When the bot ran" tab: running, paused, failing, not running and not known, each with the
// ends poll() recorded (a run's own start and the end of its finally), the 10-minute rule, the log's start (before it:
// not known), a person's tab of that name never written, its bounds; the readers (runLogRead_, runLogCheckIn_,
// runLogSpans_, runLogStart_, runLogDownEnd_, runLogWords_, offListed_); and, when Bot (B2) is set back ON, the listing
// of Burson's alerts posted while it was OFF on the "Burson while bot OFF" tab: read only (nothing reviewed, posted,
// reacted or emailed, no cursor moved), the spaces the flows read (never the Mirror space, B33 or B26), a page or two a
// run, its bounds. Every address is made up (.test).
'use strict';

module.exports = H => {
  const { test, eq, assert, B, F, NOW, e2e, makeGoogle, TEST_FEED, REAL } = H;
  const fs = require('fs');
  const path = require('path');
  const MIN = 60 * 1000;
  const DAYMS = 24 * 3600 * 1000;
  const LABEL = 'Speed numbers: leave out when the bot was not running';
  const OFF_TEXT = 'OFF (the speed numbers count every alert as they always have, and the bot keeps no record of when it was running)';
  const ON_HEAD = '✓ ON: keeping the "When the bot ran" tab';
  const ON_TAIL = '; the Results and Head start tabs show speed numbers that leave out the times the bot was not running, next to the usual ones';
  const TAB = 'When the bot ran';
  const OFF_TAB = 'Burson while bot OFF';
  const TITLE = 'When the bot ran: running, paused, failing or not running (written by the Burson QA bot)';
  const OFF_TITLE = 'Burson\'s alerts posted while the bot was OFF, listed when Bot was turned back ON (written by the Burson QA bot)';
  const HEADER = ['From (ET)', 'To (ET)', 'What the bot was doing', 'Details', 'from (ms)', 'to (ms)', 'state', 'listed'];
  const NOT_RUNNING_WHY = 'no run was recorded for more than 10 minutes (a stopped trigger, a wait for a permission after an update, ' +
    'or runs that failed before they read the Control tab)';
  const ZAPIER = { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' };
  const HUMAN = { sender: 'users/burson7', type: 'HUMAN', displayName: 'Sam (Burson)' };
  const AC = 'spaces/AAQAautofx1';
  const AC_NAME = 'SLRR Auto-correct Test';
  const MIRROR = 'spaces/AAQAmirror1';
  const MIRROR_NAME = 'SLRR Zapier Training Mirror';
  const OTHER = 'spaces/AAQAother01';
  const OTHER_LINK = 'https://chat.google.com/app/chat/AAQAother01';
  const T = ms => B.speedTime_(ms);
  const keyOf = text => B.recordKey_(B.parseAlert_(text).fields);
  const issueOf = text => B.issueNameText_(B.parseAlert_(text).fields.issue_name);
  const plainJson = v => JSON.parse(JSON.stringify(v));

  /**
   * A bot after setup(), with a tester in B30. t.runs: every run's own start and end, as poll() hands them to the
   * run-time record (OpenEngine.gs openLedgerRecord_, called right after the run log's end, with the same clock).
   * opts.noop: every RunLog.gs entry point does nothing (the world "without the run log" a world with it is compared to).
   */
  const world = (opts) => {
    opts = opts || {};
    const t = e2e(makeGoogle(NOW));
    t.runs = [];
    t.bot.__runs = t.runs;
    t.bot.ev('openLedgerRecord_ = (f => (s, e, o) => { __runs.push([s, e]); return f(s, e, o); })(openLedgerRecord_)');
    if (opts.noop) {
      t.bot.ev('runLogBegin_ = () => {}; runLogFailed_ = () => {}; runLogEnd_ = () => {}; runLogListOff_ = () => null; ' +
        'runLogStart_ = () => 0; runLogRead_ = () => null; offListed_ = () => [];');
    }
    // a run that stops with an error, when __fail holds its message (testersFor_ runs right after the run log's start)
    t.bot.__fail = '';
    t.bot.ev('testersFor_ = (f => (...a) => { if (__fail) { const m = __fail; __fail = ""; throw new Error(m); } return f(...a); })(testersFor_)');
    t.bot.setup();
    t.set('B30', 'tester@team.test');
    t.on56 = () => t.control().getRange(56, 2).setValue('ON');
    t.off56 = () => t.control().getRange(56, 2).setValue('OFF');
    t.tab = () => t.sheet().getSheetByName(TAB);
    t.offTab = () => t.sheet().getSheetByName(OFF_TAB);
    // the tab's rows as [from, to ('still going' while it is), state]
    t.spans = () => t.tab().rows.slice(4).map(r => [r[4], r[5] === '' ? 'still going' : r[5], r[6]]);
    t.open = () => JSON.parse(t.g.props.get('RUN_LOG_OPEN') || 'null');
    t.run = i => t.runs[i < 0 ? t.runs.length + i : i];
    return t;
  };

  /** Every script property read and written from now on: {reads: [key], writes: [key]}. */
  const spyProps = g => {
    const out = { reads: [], writes: [] };
    const get = g.props.get.bind(g.props);
    const has = g.props.has.bind(g.props);
    const set = g.props.set.bind(g.props);
    const del = g.props.delete.bind(g.props);
    g.props.get = k => { out.reads.push(k); return get(k); };
    g.props.has = k => { out.reads.push(k); return has(k); };
    g.props.set = (k, v) => { out.writes.push(k); return set(k, v); };
    g.props.delete = k => { out.writes.push(k); return del(k); };
    return out;
  };

  /** Every tab looked up by name from now on (the bot's sheet). */
  const spyTabs = t => {
    const names = [];
    const ss = t.sheet();
    const orig = ss.getSheetByName.bind(ss);
    ss.getSheetByName = n => { names.push(n); return orig(n); };
    return names;
  };

  /** Every write to a tab from now on: [row, col, rows]. */
  const spyWrites = sh => {
    const writes = [];
    const orig = sh.getRange.bind(sh);
    sh.getRange = (r, c, nr, nc) => {
      const range = orig(r, c, nr, nc);
      const setValues = range.setValues.bind(range);
      range.setValues = v => { writes.push([r, c, v.length]); return setValues(v); };
      range.setValue = v => range.setValues([[v]]);
      const clear = range.clearContent.bind(range);
      range.clearContent = () => { writes.push(['clear', r, c]); return clear(); };
      return range;
    };
    return writes;
  };

  // A few records carry the computer's own time (new Date(), not the fake clock: LAST_RUN's "at"): left out of comparisons
  const REAL_DAYS = [0, -1, 1].map(d => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const unreal = v => JSON.parse(REAL_DAYS.reduce((s, day) => s.split(new RegExp(`${day}T\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z`)).join('(the computer\'s time)'), JSON.stringify(v)));

  /** Everything the bot put out and keeps: every Chat message (theirs and the bot's) with its reactions, emails and drafts, every tab, every property. */
  const outputs = t => unreal({
    chat: Array.from(t.chat.spaces.values()).map(s => [s.name, s.messages.map(m => [m.name, m.text, m.thread.name, m.clientAssignedMessageId || '',
      m.sender.name, m.reactions.map(r => [r.user, r.emoji])])]),
    sent: plainJson(t.g.gmail.sentMessages()),
    drafts: plainJson(t.g.gmail.allDrafts()),
    tabs: t.sheet().sheets.map(sh => [sh.name, plainJson(sh.rows), sh.hidden || [], sh.protections.length]),
    props: Array.from(t.g.props.entries()).sort(),
  });

  /** The Auto-correct world: B3 the test feed (the main flow reads it), B25 S-F Burson (the Auto-correct flow reads it), B10 set. */
  const acWorld = opts => {
    const t = world(opts);
    t.set('B25', REAL);
    t.set('B29', 'ON');  // the Safety valve: Testing
    t.chat.addSpace(AC, AC_NAME);
    t.g.clock.now += 3600e3;
    t.bot.startAutoCorrect(AC_NAME);
    t.poll();
    return t;
  };

  // =================================================================================================================
  // A. The switch (Control row 56)
  // =================================================================================================================

  test('run log: a new Control tab has row 56 "Speed numbers: leave out when the bot was not running", OFF with its ON / OFF dropdown and what OFF means in C56; "How it works" right under it at row 57, with a line for it and the switch-rows line ending "54, 55 and 56"; it reads OFF; its texts name no address and are the same LIVE or Testing', () => {
    const t = world();
    const sh = t.control();
    eq([[1, 2, 3].map(c => sh.cell(56, c)), sh.validations['56,2'].values, sh.cell(57, 1)], [[LABEL, 'OFF', OFF_TEXT], ['ON', 'OFF'], 'How it works']);
    const help = B.ev('CONTROL_HELP_');
    eq(help.map((_, i) => sh.cell(58 + i, 1)), help);
    const line = help.filter(l => l.startsWith(`• ${LABEL}: `));
    eq(line.length, 1);
    assert.match(line[0], /^• Speed numbers: leave out when the bot was not running: row 56, OFF until you turn it ON\. ON, the bot keeps a "When the bot ran" tab/);
    assert.match(line[0], /no run for more than 10 minutes/);
    assert.match(line[0], /without reviewing, posting or emailing anything/);
    assert.match(line[0], /OFF, the bot keeps no such record and the tabs are as they were\.$/);
    assert.ok(help.some(l => /^• Rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 are switches/.test(l)));
    const s = B.ev('CONTROL_SWITCHES_').find(x => x.key === 'speedHonest');
    eq([s.row, s.label, B.switchRows_().slice(-1), B.ev('CONTROL_KEEP_TEXT_SWITCHES_')], [56, LABEL, [56], ['liveDashboard', 'slideDeliveries', 'speedHonest']]);
    eq([s.on('', true), s.on('', false), s.on('tester@team.test', undefined)], [ON_HEAD + ON_TAIL, ON_HEAD + ON_TAIL, ON_HEAD + ON_TAIL]);
    eq(s.on('', true, {}, { runLogStart: Date.UTC(2026, 10, 18, 15, 4) }), `${ON_HEAD} since 2026-11-18 10:04 ET${ON_TAIL}`);
    assert.ok(![LABEL, OFF_TEXT, line[0], s.on('', true)].some(x => /@|\b(?:s[h]adow|record-only|dry-run)\b/i.test(x)));
    t.poll();
    eq([sh.cell(56, 2), sh.cell(56, 3), t.bot.readControl_(sh).switches.speedHonest], ['OFF', OFF_TEXT, false]);
  });

  test('run log: today\'s Control tab (row 56 blank, the help at row 57) gets row 56 OFF at its next run without setup(); rows 1-55 do not change; a person\'s text in A56, B56 and C56 is kept below the help, unchanged (the log says where it came from), and their "ON" in B56 is never carried over: the row starts OFF', () => {
    const t = world();
    const sh = t.control();
    sh.rows[55] = [''];  // today's live tab: row 56 blank
    delete sh.validations['56,2'];
    sh.getRange(19, 2).setValue('ON');
    sh.getRange(54, 2).setValue('ON');
    const above = JSON.stringify(sh.rows.slice(7, 55).map(r => [r[0], r[1]]));
    t.poll();
    eq([[1, 2, 3].map(c => sh.cell(56, c)), sh.validations['56,2'].values, sh.cell(57, 1)], [[LABEL, 'OFF', OFF_TEXT], ['ON', 'OFF'], 'How it works']);
    eq(JSON.stringify(sh.rows.slice(7, 55).map(r => [r[0], r[1]])), above);
    const end = 57 + B.ev('CONTROL_HELP_ROWS_') - 1;
    eq(sh.rows.length, end);
    // a person's text in row 56 (the blank row of today's tab)
    sh.rows[55] = ['My note: ask Sam first', 'ON', 'C56 mine'];
    delete sh.validations['56,2'];
    t.g.logs.length = 0;
    t.poll();
    eq([[1, 2, 3].map(c => sh.cell(56, c)), t.bot.readControl_(sh).switches.speedHonest], [[LABEL, 'OFF', OFF_TEXT], false]);
    eq(sh.rows.slice(end).map(r => r[0]), ['My note: ask Sam first', 'C56 mine']);
    eq(t.g.logs.filter(l => /kept below/.test(l)),
      [`Control tab: a person's text in the cells the new switch rows were written over was kept below "How it works" (rows 57-${end} of column A): A56 to A${end + 1}, C56 to A${end + 2}`]);
    // the bot's own C56 texts are never kept as a person's (OFF, ON with or without the log's start, with a note)
    eq([OFF_TEXT, ON_HEAD + ON_TAIL, `${ON_HEAD} since 2026-11-18 10:04 ET${ON_TAIL} · listed 3 Burson alerts`, 'C56 mine'].map(B.controlOwnStatus_),
      [true, true, true, false]);
    const snap = JSON.stringify(sh.rows.slice(50));
    t.poll();
    t.bot.setup();
    eq(JSON.stringify(sh.rows.slice(50)), snap, 'a run and setup() move nothing again');
  });

  test('run log: the switch is ON only with its own label and ON in B56; the bot only ever writes OFF there, and no code sets it ON', () => {
    const t = world();
    const sh = t.control();
    sh.getRange(56, 2).setValue('on');
    eq(t.bot.readControl_(sh).switches.speedHonest, true);
    sh.getRange(56, 2).setValue('yes');
    eq(t.bot.readControl_(sh).switches.speedHonest, false);
    sh.getRange(56, 1, 1, 2).setValues([['Speed numbers', 'ON']]);
    eq(t.bot.readControl_(sh).switches.speedHonest, false);
    t.poll();  // the label is put back, OFF
    eq([sh.cell(56, 1), sh.cell(56, 2)], [LABEL, 'OFF']);
    const dir = path.join(__dirname, '..');
    const src = fs.readdirSync(dir).filter(f => /\.(gs|html)$/.test(f)).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    assert.ok(!/speedHonest\s*[:=]\s*true/.test(src));
    eq(B.switchesOff_().speedHonest, false);
  });

  // =================================================================================================================
  // OFF: nothing new
  // =================================================================================================================

  test('run log OFF: a whole day with row 56 OFF (Burson\'s alerts in B3 and S-F Burson, Bot OFF for a while with alerts posted, Bot ON again, an hour with no run, a run that stops with an error) reads and writes no RUN_LOG property and never looks up either tab; every Chat message and reaction, email, draft, tab (the Alert log, the Message log and the Control tab included) and property is the same as in the same day with every RunLog.gs entry point doing nothing', () => {
    const day = noop => {
      const t = acWorld({ noop });
      const props = spyProps(t.g);
      const tabs = spyTabs(t);
      // C56 alone (what the run log reads at a run's start with row 56 ON): never read with it OFF
      const c56 = [];
      const control = t.control();
      const getRange = control.getRange.bind(control);
      control.getRange = (r, c, nr, nc) => { if (r === 56 && c === 3 && !nr) c56.push(r); return getRange(r, c, nr, nc); };
      t.chat.say(TEST_FEED, F.P0_OK, ZAPIER);
      t.chat.say(REAL, F.AIO, ZAPIER);
      t.poll();
      t.poll();
      t.set('B2', 'OFF');
      t.poll();
      t.chat.say(TEST_FEED, F.MAPS, ZAPIER);
      t.chat.say(REAL, F.MAPS, ZAPIER);
      t.poll();
      t.poll();
      t.set('B2', 'ON');
      t.poll();
      t.g.clock.now += 60 * MIN;  // no run for an hour
      t.chat.say(TEST_FEED, F.PARIS, ZAPIER);
      t.poll();
      t.bot.__fail = 'Sheets is not answering';
      t.poll();
      t.poll();
      control.getRange = getRange;
      return { t, props, tabs, c56, out: outputs(t) };
    };
    const real = day(false);
    const none = day(true);
    eq([real.props.reads.filter(k => /^RUN_LOG/.test(k)), real.props.writes.filter(k => /^RUN_LOG/.test(k))], [[], []]);
    eq([real.tabs.filter(n => n === TAB || n === OFF_TAB), real.c56], [[], []]);
    eq([real.t.tab(), real.t.offTab()], [null, null]);
    // the day did what it says: alerts handled, a pause, a failed run
    assert.ok(real.t.bot.sheetBackend_(real.t.sheet()).loadAlerts().length >= 3);
    assert.match(real.t.get('B5'), /Sheets is not answering|Working/);
    eq(real.t.runs.length, none.t.runs.length);
    for (const k of Object.keys(real.out)) eq(real.out[k], none.out[k], k);
  });

  // =================================================================================================================
  // B. The run log
  // =================================================================================================================

  test('run log: the first run with row 56 ON makes the "When the bot ran" tab at the end of the sheet (A1 the bot\'s title, A2 since when it is kept, the header in row 4, the bot\'s columns hidden, protected with a warning) and its first row from that run\'s own start; C56 says since when; before then nothing is known; the next runs only move its end (no Sheets call, one property write each)', () => {
    const t = world();
    t.poll();
    t.on56();
    t.poll();
    const r1 = t.run(-1);
    const tab = t.tab();
    eq([t.sheet().sheets.slice(-1)[0].name, tab.cell(1, 1), tab.rows[3], tab.hidden, tab.protections.map(p => p.warningOnly), tab.frozenRows],
      [TAB, TITLE, HEADER, [5, 6, 7, 8], [true], 4]);
    eq(tab.cell(2, 1), `Kept since ${T(r1[0])} ET, when "Speed numbers: leave out when the bot was not running" (Control row 56) was ` +
      'turned ON: before then, when the bot was running is not known. More than 10 minutes with no run is "Not running". Times are ' +
      'Eastern (ET), newest at the bottom; the last row\'s end is filled in when the bot does something else.');
    eq(t.tab().rows.slice(4), [[T(r1[0]), 'still going', 'Running', '', r1[0], '', 'running', '']]);
    eq(t.open(), { v: 1, start: r1[0], on: r1[0], s: 'running', f: r1[0], t: r1[1], w: '', pr: r1[0], dn: 0, q: 0 });
    eq(t.control().cell(56, 3), `${ON_HEAD} since ${T(r1[0])} ET${ON_TAIL}`);
    // the next runs: no write to the tab, RUN_LOG_OPEN written once a run (its end), read once
    const writes = spyWrites(t.tab());
    const props = spyProps(t.g);
    t.poll();
    t.poll();
    eq(writes, []);
    eq([props.writes.filter(k => /^RUN_LOG/.test(k)), props.reads.filter(k => k === 'RUN_LOG_OPEN').length], [['RUN_LOG_OPEN', 'RUN_LOG_OPEN'], 4]);
    eq(t.spans(), [[r1[0], 'still going', 'running']]);
    eq([t.open().t, t.open().pr], [t.run(-1)[1], t.run(-1)[0]]);
    // the readers: the log starts at r1's start; before it, not known
    const log = t.bot.runLogRead_(t.sheet());
    eq([log.ok, log.start, log.last, log.spans], [true, r1[0], t.run(-1)[1], [{ from: r1[0], to: t.run(-1)[1], state: 'running', why: '', listed: null, open: true }]]);
    eq(t.bot.runLogStart_(), r1[0]);
    eq(t.bot.runLogCheckIn_(log, r1[0] + 1000, t.run(-1)[1]), null);
    // outside a run, with no sheet given, the readers open the bot's sheet themselves
    eq([plainJson(t.bot.runLogRead_()), t.bot.runLogNotRunningOverlap_(r1[0] + 1000, t.run(-1)[1])], [plainJson(log), null]);
    eq(t.bot.runLogCheckIn_(log, t.run(0)[0], r1[0] + 1000), { state: 'not known', from: t.run(0)[0], to: r1[0],
      why: `before the bot kept its run log (${T(r1[0])} ET)`, words: `not known: before the bot kept its run log (${T(r1[0])} ET)`, more: 0 });
  });

  test('run log: Bot (B2) OFF makes a "paused" row from the first paused run\'s start, and the running row ends at the last running run\'s end; Bot ON again closes it at the start of the first run with Bot ON (no run in between, the last one found Bot OFF) and starts a running row there: every end is a time a run recorded', () => {
    const t = world();
    t.on56();
    t.poll();
    t.poll();
    const [r1, r2] = [t.run(0), t.run(1)];
    t.set('B2', 'OFF');
    t.poll();
    t.poll();
    t.poll();
    const [p1, , p3] = [t.run(2), t.run(3), t.run(4)];
    eq(t.spans(), [[r1[0], r2[1], 'running'], [p1[0], 'still going', 'paused']]);
    eq(t.tab().rows[5].slice(0, 4), [T(p1[0]), 'still going', 'Paused: Bot (B2) was OFF', 'Bot (Control B2) was OFF']);
    eq(t.tab().rows[4][1], T(r2[1]));
    t.set('B2', 'ON');
    t.poll();
    const r6 = t.run(-1);
    // (review N2: the paused row ends where the listing of Burson's alerts posted while it was OFF ends, this run's
    // start, so the two agree on which alerts were posted while the bot was OFF)
    assert.ok(r6[0] > p3[1] && r6[0] - p3[1] <= 10 * MIN);
    eq(t.spans(), [[r1[0], r2[1], 'running'], [p1[0], r6[0], 'paused'], [r6[0], 'still going', 'running']]);
    eq([t.open().s, t.open().f, t.open().t, t.open().pr, t.open().dn], ['running', r6[0], r6[1], r6[0], r6[0]]);
    const log = t.bot.runLogRead_(t.sheet());
    const c = t.bot.runLogCheckIn_(log, r2[0], r6[0]);
    // (the listing of the pause ran in that run too: none of Burson's alerts was posted while it was OFF)
    eq(c, { state: 'paused', from: p1[0], to: r6[0], why: 'Bot (Control B2) was OFF · Burson\'s alerts posted while it was OFF: none found',
      words: `the bot was paused (Bot OFF on the Control tab) from ${T(p1[0])} to ${T(r6[0])} ET`, more: 0 });
    eq(t.bot.runLogDownEnd_(), r6[0]);
    // its listing's window ended there too
    assert.match(t.control().cell(56, 3), new RegExp(`no Burson alert was posted while the bot was OFF \\(${T(p1[0])} to ${T(r6[0])} ET\\)`));
  });

  test('run log: the 10-minute rule: a gap of 9 minutes, or exactly 10, between a run\'s end and the next run\'s start is no row; 10 minutes and 1 ms is "not running" from the one\'s end to the other\'s start; a 30-minute stop the same', () => {
    const t = world();
    t.on56();
    t.poll();
    const r1 = t.run(-1);
    t.g.clock.now = r1[1] + 9 * MIN - MIN;  // poll() adds the minute
    t.poll();
    eq(t.run(-1)[0] - r1[1], 9 * MIN);
    t.g.clock.now = t.run(-1)[1] + 10 * MIN - MIN;
    t.poll();
    const r3 = t.run(-1);
    eq(r3[0] - t.run(-2)[1], 10 * MIN);
    eq(t.spans(), [[r1[0], 'still going', 'running']]);
    t.g.clock.now = r3[1] + 10 * MIN + 1 - MIN;
    t.poll();
    const r4 = t.run(-1);
    eq(r4[0] - r3[1], 10 * MIN + 1);
    eq(t.spans(), [[r1[0], r3[1], 'running'], [r3[1], r4[0], 'not running'], [r4[0], 'still going', 'running']]);
    eq(t.tab().rows[5].slice(0, 4), [T(r3[1]), T(r4[0]), 'Not running: no run was recorded', NOT_RUNNING_WHY]);
    t.g.clock.now += 30 * MIN;
    t.poll();
    const r5 = t.run(-1);
    eq(t.spans().slice(2), [[r4[0], r4[1], 'running'], [r4[1], r5[0], 'not running'], [r5[0], 'still going', 'running']]);
    const log = t.bot.runLogRead_(t.sheet());
    eq(t.bot.runLogCheckIn_(log, r4[0], r5[0] + 1000).words, `the bot was not running from ${T(r4[1])} to ${T(r5[0])} ET`);
    eq([t.bot.runLogCheckIn_(log, r1[0], r5[0] + 1000).from, t.bot.runLogCheckIn_(log, r1[0], r5[0] + 1000).more], [r3[1], 1]);
    eq(t.bot.runLogDownEnd_(), r5[0]);
    eq(B.ev('RUN_LOG_GAP_MS_'), 10 * MIN);
  });

  test('run log: a run that stops with an error is "failing" from its start, with the error as B5 shows it; the next good run closes it at that run\'s end; failing runs in a row stay one row', () => {
    const t = world();
    t.on56();
    t.poll();
    const r1 = t.run(-1);
    t.bot.__fail = 'Sheets is not answering';
    t.poll();
    const f1 = t.run(-1);
    assert.match(t.get('B5'), /Sheets is not answering/);
    t.bot.__fail = 'Sheets is still not answering';
    t.poll();
    const f2 = t.run(-1);
    eq(t.spans(), [[r1[0], r1[1], 'running'], [f1[0], 'still going', 'failing']]);
    eq(t.tab().rows[5].slice(2, 4), ['Failing: its runs stopped with an error', 'the run stopped with an error: Sheets is not answering']);
    t.poll();
    const r4 = t.run(-1);
    eq(t.spans(), [[r1[0], r1[1], 'running'], [f1[0], f2[1], 'failing'], [r4[0], 'still going', 'running']]);
    const log = t.bot.runLogRead_(t.sheet());
    eq(t.bot.runLogCheckIn_(log, r1[0] + 1, r4[0]).words, `the bot's runs were failing from ${T(f1[0])} to ${T(f2[1])} ET`);
  });

  test('run log: a run that ended without finishing (its claim found by the next run: 2 minutes old) is "failing" from its claim\'s start to the next run\'s start; after a stop of more than 10 minutes, "not running" comes first, up to its start', () => {
    const t = world();
    t.on56();
    t.poll();
    const r1 = t.run(-1);
    const dead = r1[1] + MIN;
    t.g.props.set('RUN_OWNER', JSON.stringify({ id: 'dead-run-1', started: dead }));
    t.g.clock.now = dead + 2 * MIN - MIN;
    t.poll();
    const r2 = t.run(-1);
    eq(r2[0] - dead, 2 * MIN);
    eq(t.spans(), [[r1[0], r1[1], 'running'], [dead, r2[0], 'failing'], [r2[0], 'still going', 'running']]);
    eq(t.tab().rows[5].slice(0, 4), [T(dead), T(r2[0]), 'Failing: its runs stopped with an error',
      `the run that started at ${T(dead)} ET ended without finishing (Apps Script stopped it)`]);
    const dead2 = r2[1] + 20 * MIN;
    t.g.props.set('RUN_OWNER', JSON.stringify({ id: 'dead-run-2', started: dead2 }));
    t.g.clock.now = dead2 + 2 * MIN - MIN;
    t.poll();
    const r3 = t.run(-1);
    eq(t.spans().slice(2), [[r2[0], r2[1], 'running'], [r2[1], dead2, 'not running'], [dead2, r3[0], 'failing'], [r3[0], 'still going', 'running']]);
    eq(t.bot.runLogDownEnd_(), r3[0]);
    // a claim 4 to 25 minutes old: the run does nothing and records nothing (the run holding it covers that time)
    const before = JSON.stringify([t.spans(), t.open()]);
    t.g.props.set('RUN_OWNER', JSON.stringify({ id: 'busy-run', started: t.g.clock.now + MIN - 5 * MIN }));
    t.poll();
    eq(JSON.stringify([t.spans(), t.open()]), before);
    t.g.props.delete('RUN_OWNER');
  });

  test('run log: the first run after a stop that dies (it wrote the stop\'s row, then Apps Script stopped it, so its claim stays) is "failing" from its own start, "ended without finishing", whether the next run takes over its claim 26 minutes later or 3 minutes later: its time is never "not running" nor left without a row (review N6)', () => {
    for (const after of [26, 3]) {
      const t = world();
      t.on56();
      t.poll();
      t.poll();
      const last = t.run(-1);
      t.g.clock.now += 30 * MIN;  // a 30-minute stop
      // the first run back claims the run and takes itself into the run log (the stop's row), then Apps Script stops it
      const dead = t.g.clock.now;
      const wanted = t.bot.readControl_(t.control());
      eq(t.bot.claimRun_(dead), true);
      t.bot.runLogBegin_(t.sheet(), dead, null, wanted.switches, wanted.on, t.control());
      t.bot.ev('runId_ = ""');  // it died: no finally ran, and its claim is left
      eq([t.open().t, t.spans().slice(-1)], [dead, [[last[1], dead, 'not running']]]);
      t.g.clock.now = dead + after * MIN - MIN;  // poll() adds the minute
      t.poll();
      const back = t.run(-1);
      eq(back[0] - dead, after * MIN);
      eq(t.spans().slice(-3), [[last[1], dead, 'not running'], [dead, back[0], 'failing'], [back[0], 'still going', 'running']]);
      eq(t.tab().rows.slice(-2)[0].slice(2, 4), ['Failing: its runs stopped with an error',
        `the run that started at ${T(dead)} ET ended without finishing (Apps Script stopped it)`]);
      // so the time it ran is never counted as the bot running
      const c = t.bot.runLogCheckIn_(t.bot.runLogRead_(t.sheet()), dead + MIN / 2, dead + MIN);
      eq([c.state, c.from, c.to], ['failing', dead, back[0]]);
    }
  });

  test('run log: a run that stops with an error after its flows did their work is "failing" to the Results and Head start rebuilds in its own finally (they run after the catch), as its row says once it ends, not "running" (review N4)', () => {
    const t = world();
    t.on56();
    t.poll();
    t.poll();
    t.bot.__late = false;
    t.bot.__seen = [];
    t.bot.__clock = t.g.clock;
    t.bot.ev('healthOk_ = (f => (...a) => { if (__late) { __clock.now += 30 * 1000; throw new Error("late failure after the flows"); } return f(...a); })(healthOk_)');
    t.bot.ev('maybeRefreshSpeed_ = (f => (...a) => { const l = runLogRead_(); const cur = l.spans.find(s => s.current); ' +
      '__seen.push({ cur: cur && { state: cur.state, why: cur.why }, check: cur ? runLogCheckIn_(l, cur.from + 1000, cur.to) : null }); return f(...a); })(maybeRefreshSpeed_)');
    t.bot.__late = true;
    t.poll();
    const run = t.run(-1);
    eq(t.bot.__seen.length, 1);
    eq(plainJson(t.bot.__seen[0].cur), { state: 'failing', why: 'the run stopped with an error: late failure after the flows' });
    eq(t.bot.__seen[0].check.state, 'failing');
    // the next rebuild reads the same time the same way, from the tab
    eq(t.spans().slice(-1), [[run[0], 'still going', 'failing']]);
    const after = t.bot.runLogCheckIn_(t.bot.runLogRead_(t.sheet()), run[0] + 1000, run[1]);
    eq([after.state, after.words], ['failing', t.bot.__seen[0].check.words]);
    // a run that does not fail is running to them, as before
    t.bot.__late = false;
    t.bot.__seen.length = 0;
    t.poll();
    eq(plainJson(t.bot.__seen[0].cur), { state: 'running', why: '' });
  });

  test('run log: runLogCheckIn_ answers with a stop, a pause or failing runs the run log recorded, before a "not known" stretch that overlaps too, and also when the time starts before the log began (review N7); with only "not known" stretches, the earliest; and "before the bot kept its run log" only when nothing it recorded overlaps', () => {
    const et = (h, m) => Date.UTC(2026, 10, 18, h + 5, m || 0);
    const log = { ok: true, why: '', start: et(1), last: et(13), spans: [
      { from: et(1), to: et(9), state: 'running', why: '' },
      { from: et(9), to: et(10), state: 'not known', why: 'the run log was OFF (Control row 56)' },
      { from: et(10, 1), to: et(10, 30), state: 'running', why: '' },
      { from: et(10, 30), to: et(12), state: 'not running', why: NOT_RUNNING_WHY },
      { from: et(12), to: et(13), state: 'running', why: '' },
    ] };
    eq(B.runLogCheckIn_(log, et(9, 30), et(12, 5)), { state: 'not running', from: et(10, 30), to: et(12), why: NOT_RUNNING_WHY,
      words: `the bot was not running from ${T(et(10, 30))} to ${T(et(12))} ET`, more: 1 });
    // from before the log began, with a stop it recorded after it began: the stop
    const later = Object.assign({}, log, { start: et(10, 1), spans: log.spans.slice(2) });
    eq([B.runLogCheckIn_(later, et(9, 30), et(12, 5)).state, B.runLogCheckIn_(later, et(9, 30), et(12, 5)).more], ['not running', 0]);
    // only a "not known" stretch: that one; before the log with nothing recorded in it: before the log
    eq(B.runLogCheckIn_(log, et(9, 30), et(10, 15)).words,
      `it is not known whether the bot was running from ${T(et(9))} to ${T(et(10))} ET (the run log was OFF (Control row 56))`);
    eq(B.runLogCheckIn_(later, et(9, 30), et(10, 15)).words, `not known: before the bot kept its run log (${T(et(10, 1))} ET)`);
    eq(B.runLogCheckIn_(later, et(10, 5), et(10, 15)), null);
  });

  test('run log: row 56 turned OFF writes nothing (the tab and RUN_LOG_OPEN stay as they are; no RUN_LOG property read); ON again, the time it was OFF is "not known" from the last recorded end to the next run\'s start, and the log goes on', () => {
    const t = world();
    t.on56();
    t.poll();
    t.poll();
    const r2 = t.run(-1);
    t.off56();
    const rows = JSON.stringify(t.tab().rows);
    const open = t.open();
    const props = spyProps(t.g);
    t.poll();
    t.poll();
    t.set('B2', 'OFF');
    t.poll();
    t.set('B2', 'ON');
    eq([props.reads.filter(k => /^RUN_LOG/.test(k)), props.writes.filter(k => /^RUN_LOG/.test(k))], [[], []]);
    eq([JSON.stringify(t.tab().rows), t.open(), t.control().cell(56, 3)], [rows, open, OFF_TEXT]);
    t.on56();
    t.poll();
    const r6 = t.run(-1);
    eq(t.spans(), [[t.run(0)[0], r2[1], 'running'], [r2[1], r6[0], 'not known'], [r6[0], 'still going', 'running']]);
    eq(t.tab().rows[5].slice(2, 4), ['Not known', 'the run log was OFF (Control row 56)']);
    const log = t.bot.runLogRead_(t.sheet());
    eq(t.bot.runLogCheckIn_(log, r2[0], r6[0] + 1000).words,
      `it is not known whether the bot was running from ${T(r2[1])} to ${T(r6[0])} ET (the run log was OFF (Control row 56))`);
    // the pause inside the OFF time is never listed: when it ended is not known
    eq([t.open().q, t.g.props.get('RUN_LOG_OFF_TODO'), t.offTab()], [0, undefined, null]);
  });

  test('run log: a "When the bot ran" tab the bot didn\'t make (a person\'s) is never written: nothing is logged, C56 says what to do, and the readers say not known; once it is renamed the bot makes its own and the log starts then', () => {
    const t = world();
    const mine = t.sheet().insertSheet(TAB);
    mine.getRange(1, 1, 2, 2).setValues([['My own run notes', 'x'], ['row 2', 'y']]);
    const theirs = JSON.stringify(mine.rows);
    t.on56();
    t.poll();
    t.poll();
    eq([JSON.stringify(mine.rows), mine.protections.length, t.open().blocked, t.open().start], [theirs, 0, true, 0]);
    assert.match(t.control().cell(56, 3), new RegExp(`^${ON_HEAD}; the Results .* · ⚠️ a "When the bot ran" tab the bot didn't make is in the way: rename it, and the bot makes its own$`));
    const log = t.bot.runLogRead_(t.sheet());
    eq([log.ok, log.why], [false, 'a "When the bot ran" tab the bot didn\'t make is in the way']);
    eq(t.bot.runLogCheckIn_(log, 1, 2).words, 'not known: a "When the bot ran" tab the bot didn\'t make is in the way');
    eq([t.bot.runLogStart_(), t.bot.runLogDownEnd_(), t.bot.runLogSpans_(0, Date.now(), log)], [0, 0, []]);
    mine.setName('My run notes');
    t.poll();
    const r = t.run(-1);
    eq([JSON.stringify(mine.rows), t.tab().cell(1, 1), t.spans(), t.open().start, t.open().blocked],
      [theirs, TITLE, [[r[0], 'still going', 'running']], r[0], undefined]);
  });

  test('run log: when a person\'s "When the bot ran" tab takes the place of the bot\'s during the log, the bot writes nothing there (the next change finds it), and when the bot\'s own tab is back, the time it could not be written is "not known"', () => {
    const t = world();
    t.on56();
    t.poll();
    const r1 = t.run(-1);
    t.tab().setName('Old run log');
    const theirs = t.sheet().insertSheet(TAB);
    theirs.getRange(1, 1).setValue('Mine');
    t.set('B2', 'OFF');
    t.poll();  // the change to paused finds the tab in the way
    t.poll();
    eq([theirs.rows, t.open().blocked, t.open().t], [[['Mine']], true, r1[1]]);
    assert.match(t.control().cell(56, 3), /⚠️ a "When the bot ran" tab the bot didn't make is in the way/);
    theirs.setName('Mine, renamed');
    t.sheet().getSheetByName('Old run log').setName(TAB);
    t.set('B2', 'ON');
    t.poll();
    const r4 = t.run(-1);
    eq(t.spans(), [[r1[0], r1[1], 'running'], [r1[1], r4[0], 'not known'], [r4[0], 'still going', 'running']]);
    eq(t.tab().rows[5][3], 'the tab could not be written');
    eq(theirs.rows, [['Mine']]);
  });

  test('run log: bounds: rows that ended more than 60 days ago go first, and past 20,000 rows the oldest 1,000 go; the newest always stays; A2 says how far back it now reaches, and the log\'s start moves there; every cell stays at or under 45,000 characters (an error message of 100,000 characters is cut to 300)', () => {
    const t = world();
    t.on56();
    t.poll();
    const tab = t.tab();
    const r1 = t.run(-1);
    // 20,000 older rows above the bot's own: the oldest 3 ended more than 60 days ago
    const DAY = 24 * 3600 * 1000;
    const old = Array.from({ length: 20000 }, (_, i) => {
      const from = r1[0] - (i < 3 ? 70 * DAY : 50 * DAY) + i * 1000;
      return [T(from), T(from + 500), 'Running', '', from, from + 500, 'running', ''];
    });
    tab.rows = tab.rows.slice(0, 4).concat(old, tab.rows.slice(4));
    // a log kept since the first of them (its start, as RUN_LOG_OPEN keeps it)
    t.g.props.set('RUN_LOG_OPEN', JSON.stringify(Object.assign(t.open(), { start: old[0][4], on: old[0][4] })));
    t.bot.__fail = 'x'.repeat(100000);
    t.poll();  // a new row: the 3 rows from 70 days ago go
    eq([tab.rows.length - 4, tab.rows[4][4], t.open().start], [20000 - 3 + 2, old[3][4], old[3][4]]);
    // the error is cut to 240 characters when the run records it, its row's Details to 300 at most
    eq([tab.rows.slice(-1)[0][6], tab.rows.slice(-1)[0][3].length <= 300, tab.rows.slice(-1)[0][3]],
      ['failing', true, `the run stopped with an error: ${'x'.repeat(239)}…`]);
    assert.match(tab.cell(2, 1), new RegExp(`Rows older than 60 days are removed, and the oldest when the tab passes 20,000 rows: it now reaches back to ${T(old[3][4])} ET\\.$`));
    assert.match(tab.cell(2, 1), new RegExp(`^Kept since ${T(old[0][4])} ET`));
    t.poll();  // 20,000 rows: still in bounds
    eq(tab.rows.length - 4, 20000);
    t.set('B2', 'OFF');
    t.poll();  // 20,001: the oldest 1,000 go
    eq([tab.rows.length - 4, tab.rows[4][4], t.bot.runLogStart_()], [19001, old[1003][4], old[1003][4]]);
    eq(t.spans().slice(-1), [[t.run(-1)[0], 'still going', 'paused']]);
    for (const sh of t.sheet().sheets) for (const row of sh.rows) for (const v of row) assert.ok(String(v).length <= 45000, `${sh.name}: ${String(v).length}`);
    eq(B.ev('RUN_LOG_LIMITS_'), { rows: 20000, cut: 1000, days: 60 });
  });

  test('run log: the readers on hand-made logs: runLogCheckIn_ (null while running the whole time, gaps of 10 minutes or less included; the earliest stretch not running with how many more; not known before the log, without a log, or past its last record), runLogSpans_, runLogWords_ for each state; and with no log at all: ok, start 0', () => {
    const t0 = Date.UTC(2026, 10, 18, 14, 0);
    const m = n => t0 + n * MIN;
    const log = { ok: true, why: '', start: m(0), last: m(200), spans: [
      { from: m(0), to: m(30), state: 'running', why: '', listed: null },
      { from: m(38), to: m(60), state: 'running', why: '', listed: null },  // an 8-minute gap: running
      { from: m(60), to: m(80), state: 'not running', why: NOT_RUNNING_WHY, listed: null },
      { from: m(80), to: m(100), state: 'running', why: '', listed: null },
      { from: m(105), to: m(120), state: 'paused', why: 'Bot (Control B2) was OFF', listed: { n: 2, done: true } },
      { from: m(121), to: m(130), state: 'failing', why: 'the run stopped with an error: x', listed: null },
      { from: m(130), to: m(150), state: 'not known', why: 'the run log was OFF (Control row 56)', listed: null },
      { from: m(150), to: m(200), state: 'running', why: '', listed: null, open: true },
    ] };
    eq([B.runLogCheckIn_(log, m(5), m(50)), B.runLogCheckIn_(log, m(50), m(5)), B.runLogCheckIn_(log, m(160), m(205))], [null, null, null]);
    eq(B.runLogCheckIn_(log, m(50), m(140)), { state: 'not running', from: m(60), to: m(80), why: NOT_RUNNING_WHY,
      words: 'the bot was not running from 2026-11-18 10:00 to 2026-11-18 10:20 ET', more: 3 });
    eq(B.runLogCheckIn_(log, m(110), m(125)).state, 'paused');
    eq(B.runLogCheckIn_(log, m(125), m(126)).words, 'the bot\'s runs were failing from 2026-11-18 11:01 to 2026-11-18 11:10 ET');
    eq(B.runLogCheckIn_(log, m(140), m(141)).words,
      'it is not known whether the bot was running from 2026-11-18 11:10 to 2026-11-18 11:30 ET (the run log was OFF (Control row 56))');
    eq(B.runLogCheckIn_(log, m(-5), m(10)), { state: 'not known', from: m(-5), to: m(0),
      why: 'before the bot kept its run log (2026-11-18 09:00 ET)', words: 'not known: before the bot kept its run log (2026-11-18 09:00 ET)', more: 0 });
    eq(B.runLogCheckIn_(log, m(190), m(211)), { state: 'not known', from: m(200), to: m(211),
      why: 'no run recorded after 2026-11-18 12:20 ET', words: 'not known: no run recorded after 2026-11-18 12:20 ET', more: 0 });
    eq(B.runLogCheckIn_({ ok: true, start: 0, last: 0, spans: [] }, m(1), m(2)).words, 'not known: the bot keeps no record of when it ran');
    eq(B.runLogCheckIn_(null, m(1), m(2)).state, 'not known');
    eq(B.runLogSpans_(m(95), m(122), log).map(s => s.state), ['running', 'paused', 'failing']);
    eq(B.runLogSpans_(m(100), m(105), log), []);
    eq(B.runLogWords_({ from: m(0), to: m(30), state: 'running' }), 'the bot was running from 2026-11-18 09:00 to 2026-11-18 09:30 ET');
    eq(B.runLogWords_({ from: m(0), to: m(30), state: 'paused' }), 'the bot was paused (Bot OFF on the Control tab) from 2026-11-18 09:00 to 2026-11-18 09:30 ET');
    eq(B.ev('RUN_LOG_GAP_STATES_'), ['not running', 'paused', 'failing', 'not known']);
    const t = world();
    eq([t.bot.runLogRead_(t.sheet()), t.bot.runLogStart_(), t.bot.runLogDownEnd_(), t.bot.offListed_(0, Date.now(), t.sheet())],
      [{ ok: true, why: '', start: 0, last: 0, spans: [] }, 0, 0, []]);
    eq([t.bot.runLogOn_({ speedHonest: true }), t.bot.runLogOn_({ speedHonest: 'ON' }), t.bot.runLogOn_({})], [true, false, false]);
  });

  test('run log: inside a run the readers see the run itself (from its start to now, "current") and read the tab once; a stretch that ended at the run\'s start counts as the bot coming back (runLogDownEnd_)', () => {
    const t = world();
    t.on56();
    t.poll();
    t.g.clock.now += 20 * MIN;
    const seen = [];
    t.bot.__seen = seen;
    t.bot.ev('maybeWriteEngineTab_ = (f => (...a) => { __seen.push([runLogRead_(), runLogRead_(), runLogDownEnd_(), Date.now()]); return f(...a); })(maybeWriteEngineTab_)');
    const tabs = spyTabs(t);
    t.poll();
    const r2 = t.run(-1);
    const [a, b, down, now] = seen[0];
    eq(plainJson(a), plainJson(b));
    eq(a.spans.slice(-2), [{ from: t.run(0)[1], to: r2[0], state: 'not running', why: NOT_RUNNING_WHY, listed: null },
      { from: r2[0], to: now, state: 'running', why: '', listed: null, current: true }]);
    eq([a.last, down], [now, r2[0]]);
    eq(tabs.filter(n => n === TAB).length, 2);  // the gap row's write at the run's start, and one read for the readers
  });

  // =================================================================================================================
  // C. Burson's alerts posted while the bot was OFF
  // =================================================================================================================

  /** B2 OFF for three runs; `post` posts during them; B2 ON again and `after` runs. Returns the listing world. */
  const offStretch = (t, post, after) => {
    t.set('B2', 'OFF');
    t.poll();
    post();
    t.poll();
    t.poll();
    t.set('B2', 'ON');
    for (let i = 0; i < (after || 1); i++) t.poll();
  };
  const offRows = t => (t.offTab() ? t.offTab().rows.slice(4) : []);

  test('run log listing: Bot ON again after a pause lists the Burson alerts posted while it was OFF in B3 (the main flow reads it) and S-F Burson (the Auto-correct flow reads it), exactly the alerts (no person\'s message, no thread reply, never B33): post key, issue, product, tag and space; it reviews, posts, reacts and emails nothing, and every cursor, floor and the flows\' memory are as with row 56 OFF', () => {
    const run = on => {
      const t = acWorld();
      t.chat.addSpace(OTHER, 'SLRR Other Alerts');
      t.control().getRange(33, 2).setValue(OTHER_LINK);
      if (on) t.on56();
      t.poll();
      t.poll();
      const posted = [];
      offStretch(t, () => {
        for (const space of [TEST_FEED, REAL]) {
          const first = t.chat.say(space, F.P0_OK, ZAPIER);
          t.chat.say(space, 'Morning team, a quiet night', HUMAN);
          t.chat.say(space, F.MISTAKES, Object.assign({ thread: first.thread.name }, ZAPIER));  // a thread reply, even one that reads as an alert
          posted.push([space, first], [space, t.chat.say(space, F.AIO, ZAPIER)], [space, t.chat.say(space, F.MAPS, ZAPIER)]);
        }
        t.chat.say(OTHER, F.PARIS, ZAPIER);
      }, 2);
      return { t, posted };
    };
    const on = run(true);
    const off = run(false);
    const t = on.t;
    const paused = t.spans().find(s => s[2] === 'paused');
    const name = id => t.chat.spaces.get(id).displayName;
    eq(offRows(t).map(r => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[11], r[12], r[13]]),
      on.posted.map(([space, m]) => {
        const at = Date.parse(m.createTime);
        const f = B.parseAlert_(m.text).fields;
        return [T(at), issueOf(m.text), f.post_url, f.product, f.exposure_tag, name(space), `${T(paused[0])} to ${T(paused[1])}`, at,
          keyOf(m.text), m.name, space, paused[0], paused[1]];
      }));
    eq([t.offTab().cell(1, 1), t.offTab().rows[3].length, t.offTab().hidden, t.offTab().protections.map(p => p.warningOnly)],
      [OFF_TITLE, 15, [8, 9, 10, 11, 12, 13, 14, 15], [true]]);
    assert.match(t.offTab().cell(2, 1), /^Listed when Bot \(B2\) was turned back ON with Control row 56 ON\. The bot did not review, post or email any of them/);
    // the paused row says how it went, and C56 too
    const row = t.tab().rows.find(r => r[6] === 'paused');
    eq([row[3], JSON.parse(row[7])], ['Bot (Control B2) was OFF · Burson\'s alerts posted while it was OFF: 6 listed on the "Burson while bot OFF" tab',
      { n: 6, done: true }]);
    assert.match(t.control().cell(56, 3), new RegExp(` · listed 6 Burson alerts posted while the bot was OFF \\(${T(paused[0])} to ${T(paused[1])} ET\\)$`));
    // nothing else changed: the same posts, reactions, emails, Alert and Message logs, and flows' cursors and floors
    const same = x => ({
      chat: outputs(x).chat, sent: outputs(x).sent, drafts: outputs(x).drafts,
      logs: ['Alert log', 'Message log'].map(n => plainJson(x.sheet().getSheetByName(n).rows)),
      props: Array.from(x.g.props.entries()).filter(([k]) => /^(?:AC:|CURSOR:|FLOOR:|MIRROR_|OS:|RECENT)/.test(k) || /cursor|floor/i.test(k)).sort(),
    });
    eq(same(on.t), same(off.t));
    // none of the listed alerts was reviewed: none is on the Alert log, none got a reply or an emoji
    const logged = new Set(t.bot.sheetBackend_(t.sheet()).loadAlerts().map(a => a.source_message));
    for (const [space, m] of on.posted) {
      assert.ok(!logged.has(m.name), m.name);
      eq(t.chat.spaces.get(space).messages.filter(x => x.thread.name === m.thread.name && x.viaApi).length, 0);
      eq(t.chat.botReactions(m.name), []);
    }
    // B33 never read for it: every listing read has an end (until) and is of B3 or S-F Burson
    const reads = t.chat.calls.filter(c => c.method === 'get' && /create_time </.test(String(c.query.filter || '')));
    eq(Array.from(new Set(reads.map(c => c.path))).sort(), [`${REAL}/messages`, `${TEST_FEED}/messages`]);
    // the readers
    const listed = t.bot.offListed_(0, Date.now(), t.sheet());
    eq(listed.map(x => [x.name, x.key, x.space, x.stretchFrom]), on.posted.map(([space, m]) => [m.name, keyOf(m.text), space, paused[0]]));
    eq(t.bot.offListed_(Date.parse(on.posted[3][1].createTime), Date.now(), t.sheet()).length, 3);
    eq(plainJson(t.bot.offListed_(0, Date.now())), plainJson(listed));  // outside a run, no sheet given: it opens the bot's
    eq([t.g.props.get('RUN_LOG_OFF_TODO'), t.open().q], [undefined, 0]);
  });

  test('run log listing: only the alerts posted in the paused stretch count as posted while the bot was OFF (review N2): the stretch ends at the first run with Bot ON, as the listing does, so an alert posted after the last paused run is in it; an alert listed from before the pause (the window starts at the last running run\'s start) says on the tab what the bot was doing then: its runs failing (that one was reviewed and emailed then), or not running', () => {
    // (a) runs that fail at their very end (after the flows did their work), then Bot OFF, then ON
    const t = world();
    t.bot.__late = false;
    t.bot.ev('healthOk_ = (f => (...a) => { if (__late) throw new Error("late failure after the flows"); return f(...a); })(healthOk_)');
    t.on56();
    t.poll();
    t.poll();
    t.bot.__late = true;
    t.poll();
    const failing = t.chat.say(TEST_FEED, F.P0_OK, ZAPIER);  // posted while runs are failing: reviewed by them all the same
    t.poll();
    t.poll();
    t.bot.__late = false;
    t.set('B2', 'OFF');
    t.poll();
    const c = t.run(-1)[0];
    const paused = t.chat.say(TEST_FEED, F.AIO, ZAPIER);
    t.poll();
    t.poll();
    const d = t.run(-1)[1];
    t.g.clock.now += 20 * 1000;
    const late = t.chat.say(TEST_FEED, F.MAPS, ZAPIER);  // after the last paused run ended, before the first run with Bot ON
    t.set('B2', 'ON');
    t.poll();
    const on = t.run(-1)[0];
    t.poll();
    assert.ok(Date.parse(late.createTime) > d && Date.parse(late.createTime) < on);
    eq(t.spans().filter(x => x[2] !== 'running'), [[t.spans().find(x => x[2] === 'failing')[0], t.spans().find(x => x[2] === 'failing')[1], 'failing'],
      [c, on, 'paused']]);
    const reviewed = t.bot.sheetBackend_(t.sheet()).loadAlerts().filter(a => a.source_message === failing.name);
    eq([reviewed.length, reviewed[0] && reviewed[0].email_status], [1, 'sent']);
    eq(offRows(t).map(r => [r[9], r[6], r[12], r[13]]), [
      [failing.name, `Not while OFF: posted while the bot's runs were failing, before Bot was set OFF (${T(c)} ET)`, c, on],
      [paused.name, `${T(c)} to ${T(on)}`, c, on],
      [late.name, `${T(c)} to ${T(on)}`, c, on],
    ]);
    const listed = t.bot.offListed_(0, Date.now(), t.sheet());
    eq(listed.map(x => [x.name, t.bot.offListedWhileOff_(x)]), [[failing.name, false], [paused.name, true], [late.name, true]]);
    assert.match(t.offTab().cell(2, 1), /Only the alerts whose column G gives the OFF times count as posted while the bot was OFF\.$/);
    // (b) 40 minutes with no run, then Bot OFF (the first run back is paused), then ON
    const u = world();
    u.on56();
    u.poll();
    u.poll();
    u.g.clock.now += 20 * MIN;
    const stopped = u.chat.say(TEST_FEED, F.P0_OK, ZAPIER);  // posted while the bot was not running
    u.g.clock.now += 20 * MIN;
    u.set('B2', 'OFF');
    u.poll();
    const c2 = u.run(-1)[0];
    u.poll();
    const off2 = u.chat.say(TEST_FEED, F.AIO, ZAPIER);
    u.poll();
    u.set('B2', 'ON');
    u.poll();
    const on2 = u.run(-1)[0];
    eq(offRows(u).map(r => [r[9], r[6]]), [
      [stopped.name, `Not while OFF: posted while the bot was not running, before Bot was set OFF (${T(c2)} ET)`],
      [off2.name, `${T(c2)} to ${T(on2)}`],
    ]);
    eq(u.bot.offListed_(0, Date.now(), u.sheet()).map(x => u.bot.offListedWhileOff_(x)), [false, true]);
    // B.offListWhen_ on its own: each state the run log can give
    const job = { c: c2, d: on2 };
    const at = c2 - MIN;
    const logOf = state => ({ ok: true, why: '', start: c2 - 60 * MIN, last: on2, spans: [{ from: at - MIN, to: at + MIN, state, why: '' }] });
    eq(['running', 'failing', 'not running', 'not known'].map(st => B.offListWhen_(job, at, logOf(st))), [
      `Not while OFF: posted before Bot was set OFF (${T(c2)} ET), while the bot was running`,
      `Not while OFF: posted while the bot's runs were failing, before Bot was set OFF (${T(c2)} ET)`,
      `Not while OFF: posted while the bot was not running, before Bot was set OFF (${T(c2)} ET)`,
      `Not while OFF: posted before Bot was set OFF (${T(c2)} ET); whether the bot was running then is not known`,
    ]);
    eq(B.offListWhen_({ c: c2, d: c2 + MIN }, c2 + 2 * MIN, { ok: true, start: c2 - DAYMS, last: on2, spans: [{ from: c2 + MIN, to: on2, state: 'not running' }] }),
      `Not while OFF: posted while the bot was not running, after Bot was OFF (${T(c2)} to ${T(c2 + MIN)} ET), before the bot's next run`);
  });

  test('run log listing: with the Mirror space (B9) the main flow reads copies of S-F Burson, so S-F Burson (B25) is listed and the Mirror space never is', () => {
    const t = world();
    t.set('B25', REAL);
    t.set('B29', 'ON');
    t.chat.addSpace(MIRROR, MIRROR_NAME);
    t.g.clock.now += 3600e3;
    t.bot.startMirror(MIRROR_NAME);
    t.on56();
    t.poll();
    t.poll();
    let m = null;
    offStretch(t, () => { m = t.chat.say(REAL, F.AIO, ZAPIER); t.chat.say(MIRROR, F.MAPS, ZAPIER); });
    eq(offRows(t).map(r => [r[9], r[11]]), [[m.name, REAL]]);
    const reads = t.chat.calls.filter(c => c.method === 'get' && /create_time </.test(String(c.query.filter || '')));
    eq(Array.from(new Set(reads.map(c => c.path))), [`${REAL}/messages`]);
    eq(B.runLogOffSpaces_({ burson: { id: MIRROR, name: 'M' }, mirror: { id: MIRROR }, outboundBlocked: true }, { space: { id: REAL, name: 'S-F' } }, {}),
      [{ id: REAL, name: 'S-F' }]);
    eq(B.runLogOffSpaces_({ burson: { id: REAL, name: 'B25' }, direct: true, outboundBlocked: true }, { space: { id: REAL, name: 'B25' } }, { autocorrect: 'x' }),
      [{ id: REAL, name: 'B25' }]);
    eq(B.runLogOffSpaces_(null, { space: { id: REAL, name: 'S-F' } }, { autocorrect: 'AC' }, true), [{ id: REAL, name: 'S-F' }]);
    eq([B.runLogOffSpaces_(null, { space: { id: REAL } }, { autocorrect: 'AC' }, false),
      B.runLogOffSpaces_({ burson: { id: 'spaces/X', name: 'X' } }, null, {}, false, ['spaces/X'])], [null, null]);
  });

  test('run log listing: a page or two a run (Chat\'s pages are 1,000 messages; here 5), the window from the start of the last run before the pause to the first run after it; it waits while a flow is still catching up, or with under 45 seconds of the run left; row 56 turned OFF part way, nothing is read, and ON again it goes on where it was', () => {
    const t = world();
    eq(B.ev('OFF_LIST_LIMITS_'), { page: 1000, pagesPerRun: 2, pagesPerSpace: 10, runMs: 20000, minLeftMs: 45000, tries: 3, jobs: 5,
      rows: 5000, cut: 500, days: 60, maxDays: 44 });
    t.bot.ev('OFF_LIST_LIMITS_.page = 5');
    t.on56();
    t.poll();
    const pr = t.run(-1)[0];
    const alerts = [];
    const busy = { on: true };
    t.bot.__busy = busy;
    t.bot.ev('headStartRunBusy_ = (f => (c, flows) => (c === null && __busy.on) || f(c, flows))(headStartRunBusy_)');
    const listReads = () => t.chat.calls.filter(c => c.method === 'get' && /create_time </.test(String(c.query.filter || '')));
    const all = [];
    offStretch(t, () => {
      for (let i = 0; i < 12; i++) {
        alerts.push(t.chat.say(TEST_FEED, F.P0_OK.split('2109952063492993159').join(String(2109952063492990000 + i)), ZAPIER));
        all.push(alerts[alerts.length - 1]);
        if (i % 4 === 3) all.push(t.chat.say(TEST_FEED, `Note ${i}`, HUMAN));
      }
    });
    const back = t.run(-1);
    eq([listReads().length, t.offTab(), JSON.parse(t.g.props.get('RUN_LOG_OFF_TODO')).length], [0, null, 1]);  // busy: it waits
    busy.on = false;
    // under 45 seconds of the run left: it waits
    t.bot.__clock = t.g.clock;
    t.bot.ev('maybeWriteEngineTab_ = (f => (...a) => { __clock.now += 4.5 * 60 * 1000; return f(...a); })(maybeWriteEngineTab_)');
    t.poll();
    eq([listReads().length, t.offTab()], [0, null]);
    t.bot.ev('maybeWriteEngineTab_ = (f => (...a) => { __clock.now -= 4.5 * 60 * 1000; return f(...a); })(maybeWriteEngineTab_)');
    t.poll();  // pages 1 and 2: 10 messages
    const reads = listReads();
    eq(reads.map(c => [c.query.filter, c.query.pageSize]), [
      [`create_time > "${new Date(pr).toISOString()}" AND create_time < "${new Date(back[0]).toISOString()}"`, '5'],
      [`create_time > "${new Date(Date.parse(all[4].createTime)).toISOString()}" AND create_time < "${new Date(back[0]).toISOString()}"`, '5']]);
    eq(offRows(t).map(r => r[9]), alerts.slice(0, 8).map(m => m.name));
    eq(t.tab().rows.find(r => r[6] === 'paused')[7], '');
    t.off56();
    t.poll();
    eq(listReads().length, 2);  // OFF: nothing read
    t.on56();
    t.poll();  // page 3 (5 messages) and page 4 (none): done
    eq(listReads().length, 4);
    eq(offRows(t).map(r => r[9]), alerts.map(m => m.name));
    const row = t.tab().rows.find(r => r[6] === 'paused');
    eq([row[3], JSON.parse(row[7])], ['Bot (Control B2) was OFF · Burson\'s alerts posted while it was OFF: 12 listed on the "Burson while bot OFF" tab', { n: 12, done: true }]);
    eq([t.g.props.get('RUN_LOG_OFF_TODO'), t.open().q], [undefined, 0]);
    t.poll();
    eq(listReads().length, 4);  // nothing more
  });

  test('run log listing: at most 10 pages for one space in one OFF stretch: the rest is said to be not listed, from where it stopped to the end of the stretch; a Chat error is tried again, and after 3 the stretch says why; a sixth stretch waiting drops the oldest, and its row says so', () => {
    const t = world();
    t.bot.ev('OFF_LIST_LIMITS_.page = 2');
    t.on56();
    t.poll();
    const alerts = [];
    offStretch(t, () => {
      for (let i = 0; i < 23; i++) alerts.push(t.chat.say(TEST_FEED, F.P0_OK.split('2109952063492993159').join(String(2109952063492990000 + i)), ZAPIER));
    }, 5);
    const back = t.spans().find(s => s[2] === 'paused');
    const row = t.tab().rows.find(r => r[6] === 'paused');
    const upTo = Date.parse(alerts[19].createTime);
    eq(offRows(t).length, 20);
    eq([row[3], JSON.parse(row[7])], [`Bot (Control B2) was OFF · Burson's alerts posted while it was OFF: 20 listed on the "Burson while bot OFF" tab; ` +
      `listing stopped after 20 messages: alerts from ${T(upTo)} to ${T(t.spans()[2][0])} ET are not listed`, { n: 20, done: false, upTo }]);
    assert.ok(back);
    // a Chat error three times: the stretch ends, saying why
    t.g.chat.fail = (method, p, query) => (method === 'get' && /create_time </.test(String(query.filter || '')) ? { code: 500, body: { error: { message: 'backend error' } } } : null);
    offStretch(t, () => t.chat.say(TEST_FEED, F.AIO, ZAPIER), 3);
    const row2 = t.tab().rows.filter(r => r[6] === 'paused')[1];
    eq([row2[3], JSON.parse(row2[7])], ['Bot (Control B2) was OFF · Burson\'s alerts posted while it was OFF could not be listed: Chat API 500 on reading spaces/AAQAtestfd1: backend error',
      { n: 0, done: false, why: 'Chat API 500 on reading spaces/AAQAtestfd1: backend error' }]);
    assert.match(t.control().cell(56, 3), /⚠️ could not list the Burson alerts posted while the bot was OFF \(.*\): Chat API 500/);
    t.g.chat.fail = null;
    // six stretches waiting (a flow always catching up): the oldest is dropped
    t.bot.ev('headStartRunBusy_ = () => true');
    for (let i = 0; i < 6; i++) offStretch(t, () => {});
    const jobs = JSON.parse(t.g.props.get('RUN_LOG_OFF_TODO'));
    const pausedRows = t.tab().rows.filter(r => r[6] === 'paused').slice(2);
    eq([jobs.length, jobs.map(j => j.c), t.open().q], [5, pausedRows.slice(1).map(r => r[4]), 5]);
    eq([pausedRows[0][3], JSON.parse(pausedRows[0][7])], ['Bot (Control B2) was OFF · Burson\'s alerts posted while it was OFF: not listed: too many OFF stretches waiting',
      { n: 0, done: false, why: 'too many OFF stretches waiting' }]);
  });

  test('run log listing: a "Burson while bot OFF" tab the bot didn\'t make is never written: the stretch waits and C56 says so; once it is renamed the bot makes its own and lists; a log started while the bot was already OFF lists from that start, and says alerts from before then are not listed', () => {
    const t = world();
    const mine = t.sheet().insertSheet(OFF_TAB);
    mine.getRange(1, 1).setValue('My list');
    t.set('B2', 'OFF');
    t.on56();  // the log starts while the bot is OFF
    t.poll();
    const start = t.run(-1)[0];
    let m = null;
    t.poll();
    m = t.chat.say(TEST_FEED, F.MAPS, ZAPIER);
    t.poll();
    t.set('B2', 'ON');
    t.poll();
    t.poll();
    eq([mine.rows, JSON.parse(t.g.props.get('RUN_LOG_OFF_TODO')).length], [[['My list']], 1]);
    assert.match(t.control().cell(56, 3), /⚠️ a "Burson while bot OFF" tab the bot didn't make is in the way: rename it, and the bot makes its own \(the listing waits\)$/);
    mine.setName('My list, renamed');
    t.poll();
    eq([mine.rows, offRows(t).map(r => r[9])], [[['My list']], [m.name]]);
    const row = t.tab().rows.find(r => r[6] === 'paused');
    eq([row[4], row[3]], [start, 'Bot (Control B2) was OFF · Burson\'s alerts posted while it was OFF: 1 listed on the "Burson while bot OFF" tab ' +
      `(Burson's alerts from before ${T(start)} ET are not listed: when the bot was running before then is not known)`]);
  });

  test('run log listing: offListEntry_ takes a top-level alert (its text, or its card\'s) with the local parse\'s post key, and leaves out a thread reply, a person\'s message that isn\'t an alert, the bot\'s own posts (client-bqa-, client-zrlo-, client-zmir- ids, or its own formatted text) and an Early Detection card', () => {
    const msg = (text, o) => Object.assign({ name: 'spaces/S/messages/1', text, cardText: '', createTime: NOW, senderName: 'users/zapier',
      senderDisplay: 'Zapier', senderType: 'BOT', threadReply: false, clientId: '' }, o || {});
    for (const name of ['P0_OK', 'AIO', 'MAPS', 'MISTAKES', 'PARIS', 'WAYMO_KOF', 'NO_LINK']) {
      const f = B.parseAlert_(F[name]).fields;
      eq(B.offListEntry_(msg(F[name]), 'users/bot'), { name: 'spaces/S/messages/1', at: NOW, key: B.recordKey_(f) || '', url: f.post_url || '',
        issue: B.issueNameText_(f.issue_name), status: f.issue_status || '', product: f.product || '', tag: f.exposure_tag || '' }, name);
    }
    eq(B.offListEntry_(msg(F.NO_LINK), 'users/bot').key, '');
    eq(B.offListEntry_(msg('', { cardText: F.AIO }), 'users/bot').key, keyOf(F.AIO));
    eq([B.offListEntry_(msg(F.AIO, { threadReply: true })), B.offListEntry_(msg('Good morning team!', { senderName: 'users/p', senderDisplay: 'Pat', senderType: 'HUMAN' })),
      B.offListEntry_(msg(F.AIO, { clientId: 'client-bqa-abc' })), B.offListEntry_(msg(F.AIO, { clientId: 'client-zrlo-abc' })),
      B.offListEntry_(msg(F.AIO, { clientId: 'client-zmir-abc' })), B.offListEntry_(msg(`${B.ev('GEN').prefix} This alert needs one fix`, { senderName: 'users/bot' }), 'users/bot'),
      B.offListEntry_(msg('🔍 *Early Detection Alert · Gemini App*\n[Issue Name]: x\n[Product]: Gemini App\n[Link]: https://x.com/a/status/1'))],
    [null, null, null, null, null, null, null]);
    // an alert a person pasted is listed as the flows would read it (detectAlert_ decides)
    assert.ok(B.offListEntry_(msg(F.AIO, { senderName: 'users/p', senderDisplay: 'Pat', senderType: 'HUMAN' })));
  });

  test('run log listing: the "Burson while bot OFF" tab keeps at most 5,000 rows (the oldest 500 go) and rows listed more than 60 days ago go first; every cell at or under 45,000 characters', () => {
    const t = world();
    t.on56();
    t.poll();
    offStretch(t, () => t.chat.say(TEST_FEED, F.AIO, ZAPIER));
    const tab = t.offTab();
    const DAY = 24 * 3600 * 1000;
    const now = t.g.clock.now;
    const fake = i => ['', '', '', '', '', '', '', now - 10 * DAY, `x.com/status/${i}`, `spaces/S/messages/f${i}`, '', 'spaces/S', 1, 2,
      i < 2 ? now - 61 * DAY : now - 10 * DAY];
    tab.rows = tab.rows.slice(0, 4).concat(Array.from({ length: 5000 }, (_, i) => fake(i)), tab.rows.slice(4));
    offStretch(t, () => t.chat.say(TEST_FEED, F.MAPS, ZAPIER));
    eq([tab.rows.length - 4, tab.rows[4][9]], [5000, 'spaces/S/messages/f2']);
    offStretch(t, () => t.chat.say(TEST_FEED, F.PARIS, ZAPIER));
    eq([tab.rows.length - 4, tab.rows[4][9]], [4501, 'spaces/S/messages/f502']);
    for (const row of tab.rows) for (const v of row) assert.ok(String(v).length <= 45000);
  });
};
