// The Burson test copy (Control tab B26, TestCopy.gs): practising the Relay as close to live as it gets, with nothing
// ever written to real S-F Burson (B25). B26 names a Google-only space nobody works in: the bot copies S-F Burson into it
// as it is, in S-F Burson's own order (Zapier's alerts, and everyone's replies, messages and emojis), and while it's set
// the Relay (row 22) sends the analysts' side straight there (no outbox, no Send), never to S-F Burson. The Relay's
// inbound into the Mirror space is the same exact, in-order copy (alerts included); the Relay names tab only says how
// people show. The Control tab gets row 26 on its next run, whatever build made it.
'use strict';

const DEPLOYED = require('./control_tab_deployed_38feba8.json');

module.exports = H => {
  const { test, eq, assert, B, F, e2e, REAL, TRIAGED, TEST_FEED, markAs, bursonTexts } = H;
  const MIRROR = 'spaces/AAQAmirror1';
  const MIRROR_NAME = 'SLRR Zapier Training Mirror';
  const COPY = 'spaces/AAQAtestcp1';
  const COPY_NAME = 'SLRR Burson Test Copy';
  const COPY_LINK = 'https://chat.google.com/room/AAQAtestcp1';
  const COPY2 = 'spaces/AAQAtestcp2';
  const COPY2_NAME = 'SLRR Burson Test Copy 2';
  const AC = 'spaces/AAQAautofx1';
  const VENDOR_LINK = 'https://chat.google.com/room/AAQAvendor01';
  const ZAP = { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' };
  const ALICE = { sender: 'users/burson7', displayName: 'Alice Smith', email: 'alice@agency.test' };
  const BO = { sender: 'users/burson8', displayName: 'Bo Chen' };                         // not marked at first
  const SAM = { sender: 'users/im1', displayName: 'Sam IM', email: 'sam@' + ['google', 'com'].join('.') };    // an IM in S-F Burson: Google
  const DANA = { sender: 'users/analyst9', displayName: 'Dana Lee', email: 'dana@' + ['google', 'com'].join('.') };
  const BLANK = B.ev('RTC_BLANK_NOTE_');
  const OK_NOTE = `✓ ${COPY_NAME} · copying S-F Burson here; the Relay sends the analysts' side here, never to S-F Burson`;
  const SWITCHES = B.ev('CONTROL_SWITCHES_');

  const tabRows = (t, name) => {
    const tab = t.sheet().getSheetByName(name);
    if (!tab) return [];
    const head = tab.rows[0];
    return tab.rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
  };
  const copyRows = t => tabRows(t, 'Test copy');
  const relayRows = t => tabRows(t, 'Relay');
  const allRows = t => tabRows(t, 'Burson outbox').map(r => ({ kind: r.Kind, text: r['Text or emoji'], status: r.Status, note: r.Note, from: r.From }));
  // the relay's rows (the analysts' side); the bot's own (row 24: its Burson replies and emojis, LIVE) are ownRows
  const outbox = t => allRows(t).filter(r => r.from !== 'bot').map(({ from, ...r }) => r);
  const ownRows = t => allRows(t).filter(r => r.from === 'bot');
  /** Sets the relay's Burson outbox rows that are Pending to Send, as a person would, and runs once. */
  const sendAll = t => {
    const tab = t.sheet().getSheetByName('Burson outbox');
    tab.rows.slice(1).forEach((r, i) => { if (r[5] === 'Pending' && r[4] !== 'bot') tab.getRange(i + 2, 6).setValue('Send'); });
    t.poll();
  };
  const posts = (t, space) => t.chat.botPosts(space);  // what the bot posted there
  const tops = (t, space) => posts(t, space).filter(m => !m.threadReply);
  const textsIn = (t, space) => posts(t, space).map(m => m.text);
  const inThread = (t, space, thread) => posts(t, space).filter(m => m.thread.name === thread && m.threadReply).map(m => m.text);
  const notes = (t, thread) => posts(t, MIRROR).filter(m => m.thread.name === thread && /^Not sent/.test(m.text)).map(m => m.text);
  const writesIn = (t, space) => t.chat.calls.filter(c => c.method !== 'get' && String(c.path).indexOf(space + '/') === 0);
  const switchNote = (t, row) => t.control().cell(row, 3);
  const lists = sh => Object.fromEntries(Object.entries(sh.validations).map(([k, v]) => [k, v && v.values]));
  const keysOn = rows => Object.assign(B.switchesOff_(), Object.fromEntries(rows.map(r => [SWITCHES[r - 11].key, true])));
  /** Every Chat write the bot attempts from now on (Chat.gs chatCall_), refused or not: a list of paths. */
  const spyWrites = t => {
    t.bot.__writes = [];
    t.bot.ev('chatCall_ = (orig => function (method, path, opts) { if (String(method).toLowerCase() !== "get") __writes.push(String(path)); ' +
      'return orig(method, path, opts); })(chatCall_)');
    return () => t.bot.__writes;
  };
  /** What the analysts' side sent to the test copy is audited for leaks with what goes to Burson (run_tests.js, at the end). */
  const auditCopy = t => posts(t, COPY).filter(m => /^client-zrlo-/.test(String(m.clientAssignedMessageId || '')))
    .forEach(m => { if (!bursonTexts.includes(m.text)) bursonTexts.push(m.text); });

  /**
   * setup(), S-F Burson (B25) and the Mirror space (B9) set; the Burson test copy (B26: `copy`, the test copy's name unless
   * given; '' leaves it blank), the Relay (row 22) and Post in S-F Burson (row 24) as asked, and a run that sees them; then a
   * Zapier alert in S-F Burson and a run. Returns the alert and its copies in the test copy and the Mirror space.
   */
  const copyWorld = opts => {
    opts = opts || {};
    const t = e2e();
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    t.set('B25', REAL);
    t.chat.addSpace(MIRROR, MIRROR_NAME);
    t.chat.addSpace(COPY, COPY_NAME);
    t.chat.addSpace(COPY2, COPY2_NAME);
    t.bot.startMirror(MIRROR_NAME);
    if (opts.copy !== '') t.set('B26', opts.copy || COPY_NAME);
    t.control().getRange(22, 2).setValue(opts.relay ? 'ON' : 'OFF');
    t.control().getRange(24, 2).setValue(opts.post ? 'ON' : 'OFF');
    t.poll();
    const zap = t.chat.say(REAL, F.P0_OK, ZAP);
    t.poll();
    const alertIn = space => tops(t, space).find(m => m.text === F.P0_OK);
    return { t, zap, inCopy: alertIn(COPY), inMirror: alertIn(MIRROR) };
  };

  // -----------------------------------------------------------------------------------------------------------------
  // The cell, and the Control tab it's on
  // -----------------------------------------------------------------------------------------------------------------

  test('Burson test copy (B26): row 26 of a new Control tab, blank (C26: blank means LIVE once the Safety valve is OFF and S-F Burson set), "How it works" from row 33 (below the switches in rows 27-29, Testing: send to in row 30 and the BigQuery lookback in row 31) with a line for it; resolved like the other space cells (a Chat link, spaces/ID, the bare ID or the exact name), C26 ✓ with the space found; refused (✗ and what to fix; nothing copied): S-F Burson itself, a space people outside Google can join, the same space as B3, B4, B9 or B10, one the bot can\'t open, a name no space has; B25 blank or not found: paused, Status says so; a dry run says nothing is copied', () => {
    const t = e2e();
    t.chat.addSpace(COPY, COPY_NAME);
    t.chat.addSpace(MIRROR, MIRROR_NAME);
    t.chat.addSpace(AC, 'SLRR Auto-correct Test');
    t.bot.setup();
    const sh = t.control();
    const cells = r => [1, 2, 3].map(c => sh.cell(r, c));
    const lookback = ['BigQuery lookback', '60 minutes', B.bqLookbackFrom_('60 minutes').note];  // row 31, as a new tab starts it
    const sw32 = B.ev('CONTROL_SWITCHES_').find(s => s.row === 32);
    const row32 = [sw32.label, 'OFF', B.switchOffText_(sw32)];  // Work directly in B25, OFF
    const row33 = [B.ev('OS_LABEL_'), '', B.ev('OS_HINT_')];  // the Other alerts space, blank
    const sw34 = B.ev('CONTROL_SWITCHES_').find(s => s.row === 34);
    const row34 = [sw34.label, 'OFF', B.switchOffText_(sw34)];  // Proactive watch, OFF
    const row35 = [B.ev('PW_ALERTS_LABEL_'), 'OFF', B.pwAlertsOffText_()];  // Watch alerts, OFF
    const sw36 = B.ev('CONTROL_SWITCHES_').find(s => s.row === 36);
    const row36 = [sw36.label, 'OFF', B.switchOffText_(sw36)];  // Temp checks, OFF
    const sw37 = B.ev('CONTROL_SWITCHES_').find(s => s.row === 37);
    const row37 = [sw37.label, 'OFF', B.switchOffText_(sw37)];  // Group test emails, OFF
    const ft = r => { const s = B.ev('CONTROL_SWITCHES_').find(x => x.row === r); return [s.label, 'OFF', B.switchOffText_(s)]; };  // rows 38-40, 46, 48-51, 54-55: Fast triage, early_wave BigQuery, the AMIE table, Brandwatch live, the Watch's AMIE source, the open engine, the live dashboard and the slide deliveries, OFF
    const BLANK3 = ['', '', ''];  // rows 52-53: blank, "How it works" from row 57 (row 56 is a switch now: ft(56))
    const barSpecs = B.ev('FT_BAR_SPECS_');
    const bar = r => { const s = barSpecs.find(x => x.row === r); return [s.label, s.seedText, B.ftBarFrom_(s, s.seedText).note]; };
    eq([cells(26), sh.cell(27, 1), sh.cell(28, 1), sh.cell(29, 1), cells(30).slice(0, 2), cells(31), cells(32), cells(33), cells(34),
      cells(35), cells(36), cells(37), cells(38), cells(39), cells(40),
      cells(41), cells(42), cells(43), cells(44), cells(45), cells(46), cells(47), cells(48), cells(49), cells(50), cells(51), cells(52), cells(53),
      cells(54), cells(55), cells(56), sh.cell(57, 1), t.bot.testCopyId_()],
    [['Burson test copy', '', BLANK], 'Draft follow-ups', 'Draft answers to questions', 'Safety valve', ['Testing: send to', ''],
      lookback, row32, row33, row34, row35, row36, row37, ft(38), ft(39), ft(40),
      bar(41), bar(42), bar(43), bar(44), bar(45), ft(46), bar(47), ft(48), ft(49), ft(50), ft(51), BLANK3, BLANK3, ft(54), ft(55), ft(56), 'How it works', '']);  // row 56 is a switch now (it was blank)
    const help = B.ev('CONTROL_HELP_');
    eq(help.map((_, i) => sh.cell(58 + i, 1)), help);
    assert.ok(help.some(l => /^• Burson test copy \(B26\): a Google-only space that plays S-F Burson while Testing/.test(l)));
    eq(t.bot.status().burson_test_copy, 'not set: the Control tab\'s B26 is blank (the Relay works with S-F Burson itself)');
    t.set('B25', REAL);
    t.poll();
    eq([t.get('C26'), t.bot.testCopyId_(), t.get('B5')], [BLANK, '', '✅ Working']);
    for (const value of [COPY_LINK, 'https://mail.google.com/chat/u/0/#chat/space/AAQAtestcp1', COPY, ' AAQAtestcp1 ', COPY_NAME]) {
      t.set('B26', value);
      t.poll();
      eq([t.get('C26'), t.bot.testCopyId_(), t.get('B5')], [OK_NOTE, COPY, '✅ Working'], value);
    }
    eq(t.bot.status().burson_test_copy, `${COPY_NAME} (${COPY})`);
    assert.ok(t.g.props.get('RTC_CURSORS'), 'the copy runs');

    // Refused: what to fix in C26, nothing copied (the copy forgets how far it got), no test copy this run
    t.set('B9', MIRROR_NAME);
    t.set('B10', 'SLRR Auto-correct Test');
    const own = 'Paste a separate Google-only space.';
    const outside = '✗ "Shared With Vendors" allows people outside Google, so Burson could see it. Use a space only Google people can join.';
    for (const [value, note] of [
      [REAL, `✗ The Burson test copy can't be S-F Burson itself (B25). ${own}`],
      [VENDOR_LINK, outside],
      [TEST_FEED, `✗ The Burson test copy must be a space of its own, not the Burson space (B3). ${own}`],
      [TRIAGED, `✗ The Burson test copy must be a space of its own, not the analyst space (B4). ${own}`],
      [MIRROR, `✗ The Burson test copy must be a space of its own, not the Mirror space (B9). ${own}`],
      ['https://chat.google.com/room/AAQAautofx1', `✗ The Burson test copy must be a space of its own, not the Auto-correct space (B10). ${own}`],
      ['spaces/NOPENOPE123', '\u2717 Can\'t open spaces/NOPENOPE123. Check the link, and that bot@runner.test is a member of that space.'],
      ['No Such Space', '✗ No space named "No Such Space" (Burson test copy). Paste the space\'s link instead.'],
    ]) {
      t.set('B26', value);
      t.poll();
      eq([t.get('C26'), t.bot.testCopyId_(), t.g.props.get('RTC_CURSORS')], [note, '', undefined], value);
    }
    t.set('B26', VENDOR_LINK);
    eq(t.bot.status().burson_test_copy, `not used: ${outside.slice(2)}`);
    eq([posts(t, COPY), writesIn(t, COPY)], [[], []]);

    // S-F Burson (B25) blank or not found: paused, like the Mirror; Status (B5) says so
    t.set('B9', '');
    t.set('B10', '');
    t.set('B26', COPY_NAME);
    t.set('B25', '');
    t.poll();
    eq([t.get('C26'), t.bot.testCopyId_(), t.get('B5')], ['⏸ Paused: it needs the S-F Burson space (B25), which is blank', '',
      '⚠️ S-F Burson space (B25) is blank: paste S-F Burson\'s link there. Until then the Burson test copy (B26) is paused.']);
    t.set('B25', 'spaces/NOPENOPE123');
    t.poll();
    eq(t.get('C26'), '⏸ Paused: it needs the S-F Burson space (B25), which can\'t be found (see C25)');
    t.set('B25', REAL);
    t.poll();
    eq([t.get('C26'), t.bot.testCopyId_(), t.get('B5')], [OK_NOTE, COPY, '✅ Working']);

    // A label someone cleared is put back, with the space kept; setup() keeps it too
    sh.getRange(26, 1).setValue('');
    t.poll();
    eq(cells(26), ['Burson test copy', COPY_NAME, OK_NOTE]);
    t.bot.setup();
    eq([cells(26), cells(30).slice(0, 2), cells(31), cells(32), cells(33), cells(34), cells(35), cells(36), cells(37), cells(38), cells(39), cells(40),
      cells(41), cells(42), cells(43), cells(44), cells(45), cells(46), cells(47), cells(48), cells(49), cells(50), cells(51), cells(52), cells(53),
      cells(54), cells(55), cells(56), sh.cell(57, 1)],
    [['Burson test copy', COPY_NAME, OK_NOTE], ['Testing: send to', ''], lookback, row32, row33, row34, row35, row36, row37, ft(38), ft(39), ft(40),
      bar(41), bar(42), bar(43), bar(44), bar(45), ft(46), bar(47), ft(48), ft(49), ft(50), ft(51), BLANK3, BLANK3, ft(54), ft(55), ft(56), 'How it works']);  // row 56 is a switch now (it was blank)

    // A dry run: nothing is copied or sent there, and C26 says so
    const GEN = t.bot.ev('GEN');
    GEN.settings.dry_run = true;
    t.chat.say(REAL, F.MAPS, ZAP);
    t.poll();
    eq([t.get('C26'), posts(t, COPY)], [`${OK_NOTE} · a dry run: nothing is copied or sent here`, []]);
    GEN.settings.dry_run = false;
    t.poll();
    eq([t.get('C26'), tops(t, COPY).map(m => m.text)], [OK_NOTE, [F.MAPS]]);  // caught up on what came meanwhile

    // Cleared: the copy stops
    t.set('B26', '');
    t.poll();
    eq([t.get('C26'), t.bot.testCopyId_(), t.g.props.get('RTC_CURSORS')], [BLANK, '', undefined]);
  });

  /** The bot's sheet from setup(), then its Control tab replaced by one today's deployed code (38feba8) made. */
  const deployedWorld = variant => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    sh.rows = JSON.parse(JSON.stringify(variant.rows));
    sh.validations = {};
    Object.entries(variant.validations).forEach(([k, values]) => { sh.validations[k] = { values }; });
    t.g.props.delete('SWITCH_NOTES');
    return t;
  };

  /**
   * The tab is the deployed one but for row 26 and the switches below it: rows 1-25 as they were (B6, the time of the
   * last run, aside, and column C of a switch that's ON: what it's doing), row 26 the Burson test copy (blank, or `b26`
   * {value, note}), rows 27-29 the three new switches (OFF, with their dropdowns; C29: Testing, and why), row 30 Testing:
   * send to (blank; C30 who gets the emails), row 31 the BigQuery lookback (60 minutes, with its dropdown; C31 what the
   * bot uses), row 32 the Work directly in B25 switch (OFF, with its dropdown), row 33 the Other alerts space (blank),
   * row 34 the Proactive watch switch (OFF, with its dropdown), row 35 Watch alerts (OFF, with its dropdown), row 36
   * the Temp checks switch (OFF, with its dropdown), row 37 Group test emails (OFF, with its dropdown), rows 38-40 the three Fast triage
   * switches (OFF, with their dropdowns), rows 41-45 and 47 the bar cells, row 46 early_wave BigQuery (OFF), row 48 the AMIE table (OFF), row 49 Brandwatch live (OFF), row 50 the Watch's AMIE source (OFF), row 51 the open engine (OFF), rows 52-53 blank, row 54 the live dashboard (OFF), row 55 the slide deliveries (OFF), row 56 the run log's switch (OFF; it was blank), "How it works" from row 57;
   * the other dropdowns as they were;
   * the switches, B25 and B26 read as the tab has them. Column C of a switch is the bot's own text, written every run:
   * what it's doing (ON) or what OFF means (this build's words: C11 names the testers in B30).
   */
  const sameAsDeployed = (t, variant, when, b26) => {
    const sh = t.control();
    const cells = r => [1, 2, 3].map(c => sh.cell(r, c));
    const sw = r => B.ev('CONTROL_SWITCHES_')[B.switchRows_().indexOf(r)];
    const barSpecs = B.ev('FT_BAR_SPECS_');
    const bar = r => { const s = barSpecs.find(x => x.row === r); return [s.label, s.seedText, B.ftBarFrom_(s, s.seedText).note]; };
    const barVals = Object.fromEntries(barSpecs.map(s => [`${s.row},2`, s.choices]));
    for (let r = 1; r <= 25; r++) {
      const want = [0, 1, 2].map(c => { const v = (variant.rows[r - 1] || [])[c]; return v === undefined ? '' : v; });
      if (r === 6) want[1] = sh.cell(6, 2);
      if (variant.on.includes(r)) {
        assert.match(sh.cell(r, 3), /^✓ ON/, `${when}: C${r}`);
        want[2] = sh.cell(r, 3);
      } else if (r >= 11 && r <= 24) {
        want[2] = B.switchOffText_(sw(r), keysOn(variant.on));  // the bot's own words for OFF
      }
      eq(cells(r), want, `${when}: row ${r}`);
    }
    eq(cells(26), ['Burson test copy', b26 ? b26.value : '', b26 ? b26.note : BLANK], `${when}: row 26`);
    const why = b26 ? 'the Burson test copy, B26, is set' : variant.b25
      ? 'the alerts don\'t come from S-F Burson: B3 isn\'t S-F Burson and no Mirror space' : 'S-F Burson, B25, isn\'t set or found';
    eq([cells(27), cells(28), cells(29), cells(30).slice(0, 2), cells(31), cells(32), cells(33), cells(34), cells(35), cells(36), cells(37), cells(38), cells(39), cells(40),
      cells(41), cells(42), cells(43), cells(44), cells(45), cells(46), cells(47), cells(48), cells(49), cells(50), cells(51), cells(52), cells(53),
      cells(54), cells(55), cells(56), sh.cell(57, 1)], [[sw(27).label, 'OFF', B.switchOffText_(sw(27))],
      [sw(28).label, 'OFF', B.switchOffText_(sw(28))], [sw(29).label, 'OFF', B.switchOffText_(sw(29), null, false, { modeWhy: why })],
      ['Testing: send to', ''], ['BigQuery lookback', '60 minutes', B.bqLookbackFrom_('60 minutes').note],
      [sw(32).label, 'OFF', B.switchOffText_(sw(32))], [B.ev('OS_LABEL_'), '', B.ev('OS_HINT_')], [sw(34).label, 'OFF', B.switchOffText_(sw(34))],
      [B.ev('PW_ALERTS_LABEL_'), 'OFF', B.pwAlertsOffText_()], [sw(36).label, 'OFF', B.switchOffText_(sw(36))],
      [sw(37).label, 'OFF', B.switchOffText_(sw(37))], [sw(38).label, 'OFF', B.switchOffText_(sw(38))], [sw(39).label, 'OFF', B.switchOffText_(sw(39))],
      [sw(40).label, 'OFF', B.switchOffText_(sw(40))],
      bar(41), bar(42), bar(43), bar(44), bar(45), [sw(46).label, 'OFF', B.switchOffText_(sw(46))], bar(47),
      [sw(48).label, 'OFF', B.switchOffText_(sw(48))], [sw(49).label, 'OFF', B.switchOffText_(sw(49))], [sw(50).label, 'OFF', B.switchOffText_(sw(50))], [sw(51).label, 'OFF', B.switchOffText_(sw(51))], ['', '', ''], ['', '', ''],
      [sw(54).label, 'OFF', B.switchOffText_(sw(54))], [sw(55).label, 'OFF', B.switchOffText_(sw(55))],
      [sw(56).label, 'OFF', B.switchOffText_(sw(56))], 'How it works'], when);  // row 56 is a switch now (it was blank)
    assert.match(sh.cell(30, 3), /^Blank: while Testing, /, when);
    const help = B.ev('CONTROL_HELP_');
    eq(help.map((_, i) => sh.cell(58 + i, 1)), help, when);
    for (let r = 58 + help.length; r <= Math.max(sh.rows.length, 90); r++) eq(cells(r), ['', '', ''], `${when}: row ${r}`);
    eq(lists(sh), Object.assign({}, variant.validations, { '27,2': ['ON', 'OFF'], '28,2': ['ON', 'OFF'], '29,2': ['ON', 'OFF'],
      '31,2': ['15 minutes', '30 minutes', '45 minutes', '60 minutes'], '32,2': ['ON', 'OFF'], '34,2': ['ON', 'OFF'],
      '35,2': ['OFF', 'Other alerts space (B33)', 'Mirror space (B9)', 'Auto-correct space (B10)'], '36,2': ['ON', 'OFF'], '37,2': ['ON', 'OFF'],
      '38,2': ['ON', 'OFF'], '39,2': ['ON', 'OFF'], '40,2': ['ON', 'OFF'] }, barVals, { '46,2': ['ON', 'OFF'], '48,2': ['ON', 'OFF'], '49,2': ['ON', 'OFF'], '50,2': ['ON', 'OFF'], '51,2': ['ON', 'OFF'],
      '54,2': ['ON', 'OFF'], '55,2': ['ON', 'OFF'], '56,2': ['ON', 'OFF'] }), when);  // and row 56's dropdown
    const read = t.bot.readControl_(sh);
    eq([read.switches, read.sfBurson, read.testCopy, read.testers, read.bqLookback],
      [keysOn(variant.on), variant.b25, b26 ? b26.value : '', '', '60 minutes'], when);
  };

  test('Burson test copy row: the fixture is the Control tab today\'s deployed code (38feba8) makes: switches in rows 11-24, S-F Burson in row 25, row 26 blank, "How it works" from row 27', () => {
    for (const v of [DEPLOYED.all_off, DEPLOYED.on_14_15_17_b25]) {
      eq([v.rows[23][0], v.rows[24][0], v.rows[25], v.rows[26][0]], ['Post in S-F Burson', 'S-F Burson space', [''], 'How it works']);
      eq(v.rows.slice(10, 24).map(r => r[1]), Array.from({ length: 14 }, (_, i) => (v.on.includes(11 + i) ? 'ON' : 'OFF')));
    }
    eq([DEPLOYED.all_off.b25, DEPLOYED.on_14_15_17_b25.b25, DEPLOYED.on_14_15_17_b25.rows[24][1]],
      ['', 'https://chat.google.com/room/AAQAaa_0I9g', 'https://chat.google.com/room/AAQAaa_0I9g']);
  });

  for (const [name, variant] of [['every switch OFF, B25 blank', DEPLOYED.all_off],
    ['rows 14, 15 and 17 ON and S-F Burson in B25', DEPLOYED.on_14_15_17_b25]]) {
    test(`Burson test copy row: a Control tab the code deployed before (38feba8) made, ${name}, gets row 26 on its next run without setup() (blank, saying what blank means), the switches in rows 27-29 (OFF), rows 30-31 (Testing: send to, blank; BigQuery lookback, 60 minutes) and "How it works" moves to row 33; rows 1-25 and the dropdowns stay exactly as they were, through setup() and more runs`, () => {
      const t = deployedWorld(variant);
      t.poll();
      sameAsDeployed(t, variant, 'after the first poll()');
      eq(t.get('B5'), '✅ Working');
      t.bot.setup();
      sameAsDeployed(t, variant, 'after setup()');
      t.poll();
      t.poll();
      sameAsDeployed(t, variant, 'after more runs');
    });
  }

  test('Burson test copy row: a space someone pastes in B26 of the deployed layout before this build is deployed (row 26 is blank there) is kept and used from the first run, without setup()', () => {
    const variant = DEPLOYED.on_14_15_17_b25;
    const t = deployedWorld(variant);
    t.chat.addSpace(COPY, COPY_NAME);
    t.control().getRange(26, 2).setValue(COPY_LINK);
    t.poll();
    sameAsDeployed(t, variant, 'after the first poll()', { value: COPY_LINK, note: OK_NOTE });
    eq([t.bot.testCopyId_(), t.get('B5')], [COPY, '✅ Working']);
    t.bot.setup();
    t.poll();
    sameAsDeployed(t, variant, 'after setup() and another run', { value: COPY_LINK, note: OK_NOTE });
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The copy: S-F Burson into the test copy
  // -----------------------------------------------------------------------------------------------------------------

  test('Burson test copy, Relay OFF: everything in S-F Burson is copied as it is: Zapier\'s alert exactly, top level; everyone\'s replies (under the alert\'s copy), messages (a file named) and emojis, as "Name (Burson)" or "Name (Google)" when the Relay names tab says, the name alone while it doesn\'t (nothing waits on it; a later mark changes how the next ones show); the bot\'s own work never lands there; a removed emoji stays; nothing twice; nothing is written in S-F Burson', () => {
    const { t, zap, inCopy, inMirror } = copyWorld();
    assert.ok(inCopy && inMirror, 'the alert is copied into the test copy and into the Mirror space');
    eq([inCopy.threadReply, String(inCopy.clientAssignedMessageId).slice(0, 12)], [false, 'client-zmir-']);
    eq(copyRows(t).map(r => [r.what, r.who, r.status, r.burson_message, r.copy_message]), [['alert', 'Zapier', 'copied', zap.name, inCopy.name]]);
    eq(t.get('C26'), OK_NOTE);

    markAs(t, ALICE.sender, 'Burson');  // her org, set once on the Relay names tab
    t.chat.say(REAL, 'Why is this one P0?', Object.assign({ thread: zap.thread.name }, ALICE));
    const own = t.chat.say(REAL, 'Heads up: the queue is busy today', ALICE);
    t.chat.addReaction(zap.name, '👀', ALICE.sender, ALICE.displayName);
    t.chat.say(REAL, 'Looking into it', Object.assign({ thread: zap.thread.name }, SAM));  // an IM (a Google address): Google
    t.chat.addReaction(zap.name, '👍', SAM.sender, SAM.displayName);
    t.chat.say(REAL, 'Me too', Object.assign({ thread: zap.thread.name }, BO));          // not marked: the name alone
    t.chat.addReaction(own.name, '🎉', BO.sender, BO.displayName);
    t.chat.say(REAL, 'see the screenshot', Object.assign({ attachment: [{ contentName: 'shot.png', contentType: 'image/png' }] }, ALICE));
    t.poll();
    eq(inThread(t, COPY, inCopy.thread.name), ['Alice Smith (Burson): Why is this one P0?', 'Sam IM (Google): Looking into it', 'Bo Chen: Me too']);
    eq(tops(t, COPY).map(m => m.text), [F.P0_OK, 'Alice Smith (Burson): Heads up: the queue is busy today',
      'Alice Smith (Burson): see the screenshot\n[a file: shot.png, open in S-F Burson]']);
    const ownCopy = tops(t, COPY)[1];
    eq([t.chat.reactionsOn(inCopy.name), t.chat.reactionsOn(ownCopy.name)], [[['users/bot', '👀'], ['users/bot', '👍']], [['users/bot', '🎉']]]);
    eq(t.get('C26'), OK_NOTE);  // nothing waits
    eq(copyRows(t).map(r => [r.what, r.who, r.status]), [
      ['alert', 'Zapier', 'copied'],
      ['reply', 'Alice Smith (Burson)', 'copied'],
      ['message', 'Alice Smith (Burson)', 'copied'],
      ['reply', 'Sam IM (Google)', 'copied'],
      ['reply', 'Bo Chen', 'copied'],
      ['message', 'Alice Smith (Burson)', 'copied'],
      ['emoji', 'Bo Chen', 'copied'],  // the emojis: newest message first
      ['emoji', 'Alice Smith (Burson)', 'copied'],
      ['emoji', 'Sam IM (Google)', 'copied'],
    ]);
    eq(tabRows(t, 'Relay names').map(r => [r.user, r.name, r.org, r.seen_in]), [['users/burson7', 'Alice Smith', 'Burson', 'S-F Burson'],
      ['users/im1', 'Sam IM', 'Google', 'S-F Burson'], ['users/burson8', 'Bo Chen', '', 'S-F Burson']]);

    // Marked Burson later: what Bo writes from then on shows so; what's already copied stays as it was
    markAs(t, BO.sender, 'Burson');
    t.chat.say(REAL, 'Fixed now', Object.assign({ thread: zap.thread.name }, BO));
    t.poll();
    eq(inThread(t, COPY, inCopy.thread.name), ['Alice Smith (Burson): Why is this one P0?', 'Sam IM (Google): Looking into it', 'Bo Chen: Me too',
      'Bo Chen (Burson): Fixed now']);

    // A removed emoji isn't copied (the copy keeps it), and added again it isn't copied twice; more runs copy nothing twice
    const live = t.chat.message(zap.name);
    live.reactions = live.reactions.filter(r => !(r.user === ALICE.sender && r.emoji === '👀'));
    t.poll();
    live.reactions.push({ emoji: '👀', user: ALICE.sender, displayName: ALICE.displayName });
    const counts = () => [posts(t, COPY).length, copyRows(t).length, t.chat.reactionsOn(inCopy.name).length];
    const before = counts();
    t.poll();
    t.poll();
    eq(counts(), before);
    eq(t.chat.reactionsOn(inCopy.name), [['users/bot', '👀'], ['users/bot', '👍']]);

    // Only the copy writes there: each post carries one of its ids; nothing of the bot's own work (its 🤖 answers, its
    // 📰 📦) is there; the Mirror space has Zapier's alerts only (the Relay is OFF); nothing is written in S-F Burson
    eq(posts(t, COPY).map(m => String(m.clientAssignedMessageId).slice(0, 12)).filter(p => p !== 'client-zmir-' && p !== 'client-zrly-'), []);
    assert.ok(!textsIn(t, COPY).some(x => /🤖/.test(x)));
    assert.ok(t.chat.reactionsOn(inMirror.name).some(([u, e]) => u === 'users/bot' && e === '📦'), 'the bot works the alert in the Mirror space');
    assert.ok(!posts(t, MIRROR).some(m => /Alice Smith|Bo Chen|Sam IM/.test(m.text)));
    eq([t.chat.botPosts(REAL), writesIn(t, REAL), t.chat.botReactions(zap.name)], [[], [], []]);
  });

  test('Exact order: what S-F Burson gets (Zapier\'s alerts, standalone messages and thread replies, from people marked Burson, marked Google, or not marked at all) lands in the Burson test copy and, with the Relay ON, in the Mirror space in exactly S-F Burson\'s order, never grouped by person or alerts first, each reply under its own alert\'s copy and each emoji on its message\'s copy; the next minute\'s follow in order; a later mark changes only how the next ones show', () => {
    const { t, zap, inCopy, inMirror } = copyWorld({ relay: true });
    const DIKSHA = { sender: 'users/burson3', displayName: 'Diksha Singh' };  // not marked on the Relay names tab
    const VIPULA = { sender: 'users/xwf1', displayName: 'Vipula Keny' };      // marked Google there (Chat gives no address)
    markAs(t, VIPULA.sender, 'Google');
    markAs(t, ALICE.sender, 'Burson');
    t.chat.say(REAL, 'Good morning team', DIKSHA);
    const maps = t.chat.say(REAL, F.MAPS, ZAP);
    t.chat.say(REAL, 'APAC signing off, all clear', Object.assign({ thread: zap.thread.name }, VIPULA));
    t.chat.say(REAL, 'Shift handover in 5', DIKSHA);
    t.chat.say(REAL, 'On it', Object.assign({ thread: maps.thread.name }, ALICE));
    t.chat.addReaction(maps.name, '👀', VIPULA.sender, VIPULA.displayName);
    t.chat.say(REAL, F.PARIS, ZAP);
    t.chat.say(REAL, 'Thanks Vipula', Object.assign({ thread: zap.thread.name }, DIKSHA));
    t.poll();
    // S-F Burson's copies in a space, in the order they landed there (the alert from before left out)
    const landed = space => t.chat.spaces.get(space).messages.filter(m => /^client-(?:zmir|zrly)-/.test(String(m.clientAssignedMessageId || '')))
      .map(m => m.text).filter(x => x !== F.P0_OK);
    const first = ['Diksha Singh: Good morning team', F.MAPS, 'Vipula Keny (Google): APAC signing off, all clear',
      'Diksha Singh: Shift handover in 5', 'Alice Smith (Burson): On it', F.PARIS, 'Diksha Singh: Thanks Vipula'];
    eq([landed(COPY), landed(MIRROR)], [first, first]);
    const alertCopy = (space, text) => tops(t, space).find(m => m.text === text);
    const botTexts = new Set(posts(t, MIRROR).filter(m => /^client-bqa-/.test(String(m.clientAssignedMessageId || ''))).map(m => m.text));
    const people = x => !botTexts.has(x);  // the bot's own answers in the Mirror space (its client-bqa- posts) left out
    eq([inThread(t, COPY, inCopy.thread.name), inThread(t, MIRROR, inMirror.thread.name).filter(people)],
      [['Vipula Keny (Google): APAC signing off, all clear', 'Diksha Singh: Thanks Vipula'],
        ['Vipula Keny (Google): APAC signing off, all clear', 'Diksha Singh: Thanks Vipula']]);
    eq([inThread(t, COPY, alertCopy(COPY, F.MAPS).thread.name), inThread(t, MIRROR, alertCopy(MIRROR, F.MAPS).thread.name).filter(people)],
      [['Alice Smith (Burson): On it'], ['Alice Smith (Burson): On it']]);
    eq(t.chat.reactionsOn(alertCopy(COPY, F.MAPS).name), [['users/bot', '👀']]);
    eq(relayRows(t).filter(r => r.direction === 'From S-F Burson' && r.what === 'emoji').map(r => [r.who, r.text, r.test_message]),
      [['Vipula Keny (Google)', '👀', alertCopy(MIRROR, F.MAPS).name]]);

    // The next minute's come after them, in order; Diksha marked Burson now shows so from her next message on
    markAs(t, DIKSHA.sender, 'Burson');
    t.chat.say(REAL, F.MISTAKES, ZAP);
    t.chat.say(REAL, 'Looks like a duplicate', DIKSHA);
    t.poll();
    const next = first.concat([F.MISTAKES, 'Diksha Singh (Burson): Looks like a duplicate']);
    eq([landed(COPY), landed(MIRROR)], [next, next]);
    eq([t.get('C26'), t.control().cell(9, 3)], [OK_NOTE, `✓ ${MIRROR_NAME} (S-F Burson copied here in its own order by the Relay · outbounds blocked)`]);
  });

  test('Chat answers 403, not 404, for a copy that isn\'t there: a reply in S-F Burson under an alert neither space copied (from before they started) comes over at once, on its own and saying so, in the Burson test copy and the Mirror space, and nothing after it is held back; an emoji on an alert whose copy isn\'t made yet is no error, and goes on once the copy is there', () => {
    const t = e2e();
    t.bot.setup();
    t.set('B25', REAL);
    const before = t.chat.say(REAL, F.MAPS, ZAP);  // before either space started: never copied
    t.g.clock.now += 20 * 60e3;
    t.chat.addSpace(MIRROR, MIRROR_NAME);
    t.chat.addSpace(COPY, COPY_NAME);
    t.bot.startMirror(MIRROR_NAME);
    t.set('B26', COPY_NAME);
    t.control().getRange(22, 2).setValue('ON');
    t.poll();
    markAs(t, ALICE.sender, 'Burson');
    t.chat.say(REAL, 'Still open?', Object.assign({ thread: before.thread.name }, ALICE));
    t.chat.say(REAL, 'Next shift starts at 9', ALICE);
    t.poll();
    const lead = where => `Alice Smith (Burson), replying in a thread the ${where} doesn't have: Still open?`;
    const landed = space => t.chat.spaces.get(space).messages.filter(m => /^client-zrly-/.test(String(m.clientAssignedMessageId || ''))).map(m => m.text);
    eq([landed(COPY), landed(MIRROR)], [[lead('test copy'), 'Alice Smith (Burson): Next shift starts at 9'],
      [lead('Mirror space'), 'Alice Smith (Burson): Next shift starts at 9']]);
    const errors = () => t.g.logs.filter(l => /didn't go|Chat API 403/.test(l));
    eq([t.get('C26'), errors()], [OK_NOTE, []]);
    // An emoji on an alert whose copy in the test copy isn't made yet (its copy fails once): looked at again, no error
    let down = true;
    t.chat.fail = (method, path, query, body) => (down && method === 'post' && path === `${COPY}/messages` && body.text === F.PARIS
      ? { code: 500, body: { error: { message: 'backend error' } } } : null);
    const paris = t.chat.say(REAL, F.PARIS, ZAP);
    t.chat.addReaction(paris.name, '🎉', ALICE.sender, ALICE.displayName);
    t.poll();
    eq(t.g.logs.filter(l => /the emojis on .* didn't go/.test(l)), []);
    down = false;
    t.poll();
    eq(t.chat.reactionsOn(tops(t, COPY).find(m => m.text === F.PARIS).name), [['users/bot', '🎉']]);
  });

  test('Burson test copy: it starts when a run sees B26 set, with nothing from before then (no backlog posted at once: not even an alert from a minute before, nor emojis on it; a reply under it comes over on its own, saying so); another space in B26 starts afresh there and nothing more goes to the first; cleared, it stops; set again, it starts again from then (nothing from while it was cleared), nothing copied twice', () => {
    const t = e2e();
    t.bot.setup();
    t.set('B25', REAL);
    t.chat.addSpace(COPY, COPY_NAME);
    t.chat.addSpace(COPY2, COPY2_NAME);
    markAs(t, ALICE.sender, 'Burson');
    t.chat.say(REAL, F.MAPS, ZAP);  // well before the test copy: never copied
    t.g.clock.now += 5 * 60e3;
    const recent = t.chat.say(REAL, F.P0_OK, ZAP);  // a minute before B26 is set: never copied either
    t.g.clock.now += 60e3;
    t.set('B26', COPY_LINK);
    t.poll();
    eq([posts(t, COPY), t.get('C26')], [[], OK_NOTE]);  // nothing from before
    const fresh = t.chat.say(REAL, F.PARIS, ZAP);  // after: copied
    t.chat.say(REAL, 'Is this one still open?', Object.assign({ thread: recent.thread.name }, ALICE));
    t.chat.say(REAL, 'On it', Object.assign({ thread: fresh.thread.name }, ALICE));
    t.chat.addReaction(recent.name, '👀', ALICE.sender, ALICE.displayName);  // on a message from before: not copied
    t.poll();
    const freshCopy = tops(t, COPY)[0];
    eq(tops(t, COPY).map(m => m.text), [F.PARIS, 'Alice Smith (Burson), replying in a thread the test copy doesn\'t have: Is this one still open?']);
    eq(inThread(t, COPY, freshCopy.thread.name), ['Alice Smith (Burson): On it']);
    eq(posts(t, COPY).map(m => t.chat.reactionsOn(m.name)), [[], [], []]);

    // Another test copy: from the run that sees it on, there only
    t.g.clock.now += 20 * 60e3;
    t.set('B26', COPY2_NAME);
    t.poll();
    eq(posts(t, COPY2), []);
    const next = t.chat.say(REAL, F.MISTAKES, ZAP);
    t.poll();
    eq([tops(t, COPY2).map(m => m.text), posts(t, COPY).length, t.get('C26')], [[F.MISTAKES], 3, `✓ ${COPY2_NAME} · copying S-F Burson here; the Relay sends the analysts' side here, never to S-F Burson`]);
    eq(copyRows(t).filter(r => String(r.copy_message).indexOf(COPY2 + '/') === 0).map(r => [r.what, r.burson_message]), [['alert', next.name]]);

    // Cleared: it stops, and forgets how far it got
    t.set('B26', '');
    t.poll();
    eq([t.get('C26'), t.g.props.get('RTC_CURSORS'), t.bot.testCopyId_()], [BLANK, undefined, '']);
    t.chat.say(REAL, F.MAPS, ZAP);  // while it's cleared: never copied
    t.poll();
    eq([posts(t, COPY2).length, posts(t, COPY).length], [1, 3]);
    // Set again: from then on (nothing from while it was cleared); what's already there isn't copied twice
    t.set('B26', COPY2_NAME);
    t.poll();
    t.chat.say(REAL, F.P0_OK, ZAP);
    t.poll();
    t.poll();
    eq(tops(t, COPY2).map(m => m.text), [F.MISTAKES, F.P0_OK]);
  });

  test('Burson test copy: a message that can\'t be copied is tried again every run (C26 says so), then given up on after 5 runs with a row saying why, and the copy goes on; it never stops the rest of the run; an alert\'s row says it\'s Zapier\'s alert', () => {
    const { t, zap, inCopy } = copyWorld();
    markAs(t, ALICE.sender, 'Burson');
    let down = true;
    t.chat.fail = (method, path, query, body) => (down && method === 'post' && path === `${COPY}/messages` && /Stuck/.test(body.text)
      ? { code: 500, body: { error: { message: 'backend error' } } } : null);
    t.chat.say(REAL, 'Stuck one', Object.assign({ thread: zap.thread.name }, ALICE));
    t.chat.say(REAL, 'Next one', ALICE);
    t.poll();
    eq(t.get('C26'), `${OK_NOTE} · ⚠️ Chat API 500 on posting to ${COPY}: backend error (tried again every run)`);
    assert.ok(!textsIn(t, COPY).some(x => /Next one/.test(x)), 'held behind it, in order');
    eq(t.get('B5'), '✅ Working');
    for (let i = 0; i < 4; i++) t.poll();
    eq(copyRows(t).filter(r => r.text === 'Stuck one').map(r => [r.what, r.status]), [['reply', `not copied: Chat API 500 on posting to ${COPY}: backend error`]]);
    eq(textsIn(t, COPY).filter(x => /Stuck one|Next one/.test(x)), ['Alice Smith (Burson): Next one']);
    down = false;
    t.poll();
    eq([inThread(t, COPY, inCopy.thread.name), t.get('C26')], [[], OK_NOTE]);  // given up for good; C26 clear again
    // An alert that can't be copied there: the same, its row naming Zapier's alert
    t.chat.fail = (method, path, query, body) => (method === 'post' && path === `${COPY}/messages` && body.text === F.MAPS
      ? { code: 500, body: { error: { message: 'backend error' } } } : null);
    const maps = t.chat.say(REAL, F.MAPS, ZAP);
    for (let i = 0; i < 5; i++) t.poll();
    eq(copyRows(t).filter(r => r.burson_message === maps.name).map(r => [r.what, r.who, r.text, r.status]),
      [['alert', 'Zapier', F.MAPS.split('\n')[0], `not copied: Chat API 500 on mirroring to ${COPY}: backend error`]]);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The Relay's analysts' side: straight to the test copy while B26 is set
  // -----------------------------------------------------------------------------------------------------------------

  test('Relay ON with a Burson test copy: the analysts\' replies, messages and emojis go straight to the test copy where S-F Burson would get them (a reply under the matching alert\'s copy, a message as one of its own and replies under it, an emoji on the matching copy), with their names; no outbox row, no Send, row 24 not needed; "internal:" stays, 👎 never goes, the leak guard holds with its note, the bot\'s own work never goes; nothing twice', () => {
    const { t, zap, inCopy, inMirror } = copyWorld({ relay: true });
    assert.ok(textsIn(t, MIRROR).some(x => new RegExp('^The relay with S-F Burson is on from \\d\\d:\\d\\d UTC\\. From now on, what you write here ' +
      'goes straight to the Burson test copy \\(SLRR Burson Test Copy\\), with your name, and never to S-F Burson \\(start a message with ' +
      '"internal:" to keep it here\\)\\. Nothing from before then was sent\\.$').test(x)));
    markAs(t, ALICE.sender, 'Burson');
    t.chat.say(REAL, 'Why is this one P0?', Object.assign({ thread: zap.thread.name }, ALICE));
    t.poll();
    eq(inThread(t, COPY, inCopy.thread.name), ['Alice Smith (Burson): Why is this one P0?']);
    assert.ok(inThread(t, MIRROR, inMirror.thread.name).includes('Alice Smith (Burson): Why is this one P0?'));

    t.chat.say(MIRROR, 'It is P0 because of the exposure tag. Thanks!', Object.assign({ thread: inMirror.thread.name }, DANA));
    const hello = t.chat.say(MIRROR, 'Morning Burson team', DANA);
    const internal = t.chat.say(MIRROR, 'internal: the bot got this one right', DANA);
    t.chat.say(MIRROR, 'agreed, nice one', Object.assign({ thread: internal.thread.name }, DANA));
    const leak = t.chat.say(MIRROR, 'see the analyst space for this one', Object.assign({ thread: inMirror.thread.name }, DANA));
    t.chat.addReaction(inMirror.name, '👍', DANA.sender, DANA.displayName);
    t.chat.addReaction(inMirror.name, '👎', DANA.sender, DANA.displayName);
    const asked = t.g.vertex.calls.length;
    t.poll();
    eq(inThread(t, COPY, inCopy.thread.name), ['Alice Smith (Burson): Why is this one P0?', 'Dana Lee: It is P0 because of the exposure tag. Thanks!']);
    const helloCopy = tops(t, COPY).find(m => m.text === 'Dana Lee: Morning Burson team');
    assert.ok(helloCopy, 'a message of its own, as one');
    eq(t.chat.reactionsOn(inCopy.name), [['users/bot', '👍']]);  // never 👎 ("the bot got this wrong")
    eq(notes(t, leak.thread.name), ['Not sent to the Burson test copy: it mentions "analyst space". Post it again without that, or start ' +
      'it with "internal:" to keep it here.']);
    eq(notes(t, internal.thread.name), []);
    assert.ok(!textsIn(t, COPY).some(x => /internal|agreed|analyst space|🤖/.test(x)));
    assert.strictEqual(t.g.vertex.calls.length, asked);  // the bot never answers the analysts as if they were Burson
    eq([t.sheet().getSheetByName('Burson outbox'), t.chat.botPosts(REAL), writesIn(t, REAL)], [null, [], []]);

    // A reply under Dana's own message goes under its copy; an emoji on it, on its copy
    t.chat.say(MIRROR, 'And one more thing', Object.assign({ thread: hello.thread.name }, DANA));
    t.chat.addReaction(hello.name, '🎉', DANA.sender, DANA.displayName);
    t.poll();
    eq(inThread(t, COPY, helloCopy.thread.name), ['Dana Lee: And one more thing']);
    eq(t.chat.reactionsOn(helloCopy.name), [['users/bot', '🎉']]);

    // The Relay tab: which way each went (to the test copy), and its message there
    eq(relayRows(t).map(r => [r.direction, r.what, r.who, r.status]), [
      ['From S-F Burson', 'alert', 'Zapier', 'copied'],
      ['From S-F Burson', 'reply', 'Alice Smith (Burson)', 'sent'],
      ['To the Burson test copy', 'reply', 'Dana Lee', 'sent'],
      ['To the Burson test copy', 'message', 'Dana Lee', 'sent'],
      ['To the Burson test copy', 'message', '', 'kept here (internal)'],
      ['To the Burson test copy', 'reply', '', 'not sent: it mentions "analyst space". Post it again without that, or start it with "internal:" to keep it here.'],
      ['To the Burson test copy', 'emoji', 'Dana Lee', 'sent'],
      ['To the Burson test copy', 'reply', 'Dana Lee', 'sent'],
      ['To the Burson test copy', 'emoji', 'Dana Lee', 'sent'],
    ]);
    eq(relayRows(t).filter(r => r.direction === 'To the Burson test copy' && r.status === 'sent').map(r => String(r.copy_message).indexOf(COPY + '/')),
      [0, 0, 0, 0, 0]);
    assert.match(switchNote(t, 22), /^✓ ON: everything in S-F Burson comes into the Mirror space in its own order \(Zapier's alerts, everyone's replies, messages and emojis\); analysts' \(never the bot's\) go straight to the Burson test copy \(B26\), never to S-F Burson\. The Relay tab logs each one · last relay \d\d:\d\d UTC · the Relay tab has each one$/);

    // Nothing twice
    const counts = () => [posts(t, COPY).length, relayRows(t).length, t.chat.reactionsOn(inCopy.name).length, t.chat.reactionsOn(helloCopy.name).length];
    const before = counts();
    t.poll();
    t.poll();
    eq(counts(), before);
    // The person whose account the bot runs as (B8) can also post a standalone message, a reply or an emoji in the Mirror
    // space and have it go straight to the test copy, while the bot's own posts and emojis never do
    const OWNER = { sender: 'users/bot', displayName: 'Lucas H' };
    t.chat.say(MIRROR, 'Testing standalone from owner', OWNER);
    t.chat.say(MIRROR, 'Testing reply from owner', Object.assign({ thread: inMirror.thread.name }, OWNER));
    t.chat.addReaction(inMirror.name, '🔥', OWNER.sender, OWNER.displayName);
    t.poll();
    assert.ok(tops(t, COPY).some(m => m.text === 'Lucas H: Testing standalone from owner'));
    assert.ok(inThread(t, COPY, inCopy.thread.name).includes('Lucas H: Testing reply from owner'));
    assert.ok(t.chat.reactionsOn(inCopy.name).some(([u, e]) => u === 'users/bot' && e === '🔥'));
    eq(posts(t, COPY).map(m => String(m.clientAssignedMessageId).slice(0, 12)).filter(p => !/^client-(?:zmir|zrly|zrlo)-$/.test(p)), []);
    auditCopy(t);
  });

  test('Relay ON with a Burson test copy: a reply under an alert the test copy doesn\'t have (it came before the test copy started) waits a little, then stays in the Mirror space, with one note per thread', () => {
    const { t, zap, inMirror } = copyWorld({ relay: true, post: true, copy: '' });
    t.g.clock.now += 20 * 60e3;  // the alert is older than S-F Burson's last 15 minutes when B26 is set
    t.set('B26', COPY_NAME);
    t.poll();
    eq(posts(t, COPY), []);
    t.chat.say(MIRROR, 'Is this a known issue?', Object.assign({ thread: inMirror.thread.name }, DANA));
    t.poll();
    eq(notes(t, inMirror.thread.name), []);  // it may still be copied: it waits
    t.g.clock.now += 5 * 60e3;
    t.poll();
    t.g.clock.now += 5 * 60e3;
    t.poll();
    const held = 'Not sent to the Burson test copy: replies in this thread stay here: the Burson test copy doesn\'t have its first message ' +
      '(it\'s from before the test copy started). Post a message of its own to send something.';
    eq(notes(t, inMirror.thread.name), [held]);
    t.chat.say(MIRROR, 'Anyone?', Object.assign({ thread: inMirror.thread.name }, DANA));
    for (let i = 0; i < 3; i++) {
      t.poll();
      t.g.clock.now += 5 * 60e3;
    }
    t.poll();
    eq(notes(t, inMirror.thread.name), [held]);  // one note per thread
    eq(relayRows(t).filter(r => r.direction === 'To the Burson test copy').map(r => [r.what, r.status]),
      [['reply', 'not sent: replies in this thread stay here'], ['reply', 'not sent: replies in this thread stay here']]);
    eq([posts(t, COPY), outbox(t), t.chat.botPosts(REAL), writesIn(t, REAL)], [[], [], [], []]);
    assert.ok(zap);
  });

  test('Burson test copy set, with the Relay (row 22) and Post in S-F Burson (row 24) ON: no Chat write ever targets real S-F Burson (every write the bot attempts is inspected, refused or not); nothing is queued for it, and a relay row someone sets to Send meanwhile goes back to Pending saying why. B26 cleared: the Relay is back on the Burson outbox (afresh, saying so), the copy stops, and that row goes once Send is set again', () => {
    const { t } = copyWorld({ relay: true, post: true, copy: '' });
    const writes = spyWrites(t);
    const toSfb = () => writes().filter(p => p.indexOf(REAL + '/') === 0);
    markAs(t, ALICE.sender, 'Burson');
    t.chat.say(MIRROR, 'Queued before the test copy', DANA);
    t.poll();
    eq(outbox(t).map(r => [r.kind, r.text, r.status]), [['post', 'Dana Lee: Queued before the test copy', 'Pending']]);  // as today
    t.set('B26', COPY_LINK);
    t.poll();
    eq(posts(t, COPY), []);  // nothing from before B26 was set
    assert.match(switchNote(t, 22), /analysts' \(never the bot's\) go straight to the Burson test copy \(B26\), never to S-F Burson\./);
    const zap = t.chat.say(REAL, F.MAPS, ZAP);  // after: copied into the test copy and the Mirror space
    t.poll();
    const inCopy = tops(t, COPY).find(m => m.text === F.MAPS);
    const inMirror = tops(t, MIRROR).find(m => m.text === F.MAPS);
    assert.ok(inCopy && inMirror, 'an alert from after B26 was set is copied into both');
    // A person sets the queued row to Send: not sent while B26 is set
    const ob = t.sheet().getSheetByName('Burson outbox');  // the relay's row (the bot's own 👍, queued while LIVE, comes first)
    ob.getRange(ob.rows.findIndex(r => r[3] === 'Dana Lee: Queued before the test copy') + 1, 6).setValue('Send');
    t.poll();
    eq(outbox(t).map(r => [r.text, r.status, r.note]), [['Dana Lee: Queued before the test copy', 'Pending',
      'not sent: the bot is in Testing (the Burson test copy, B26, is set), so nothing goes to S-F Burson. Set Send again once it\'s LIVE.']]);
    assert.match(switchNote(t, 24), / · 2 waiting on the Burson outbox tab · Testing \(the Burson test copy, B26, is set\): nothing is sent$/);

    // Everything either side does
    t.chat.say(REAL, 'Why is this one P0?', Object.assign({ thread: zap.thread.name }, ALICE));
    t.chat.say(REAL, 'Heads up: the queue is busy today', ALICE);
    t.chat.addReaction(zap.name, '👀', ALICE.sender, ALICE.displayName);
    t.chat.say(MIRROR, 'It is P0 because of the exposure tag. Thanks!', Object.assign({ thread: inMirror.thread.name }, DANA));
    const hello = t.chat.say(MIRROR, 'Morning Burson team', DANA);
    t.chat.say(MIRROR, 'internal: the bot got this one right', DANA);
    t.chat.say(MIRROR, 'see the analyst space for this one', DANA);
    t.chat.addReaction(inMirror.name, '👍', DANA.sender, DANA.displayName);
    t.chat.addReaction(inMirror.name, '👎', DANA.sender, DANA.displayName);
    t.poll();
    t.chat.say(MIRROR, 'And one more thing', Object.assign({ thread: hello.thread.name }, DANA));
    t.chat.addReaction(hello.name, '🎉', DANA.sender, DANA.displayName);
    t.poll();
    t.poll();
    // Not one write to S-F Burson was even attempted; nothing new was queued
    eq([toSfb(), writesIn(t, REAL), t.chat.botPosts(REAL)], [[], [], []]);
    eq(t.chat.spaces.get(REAL).messages.filter(m => m.reactions.some(r => r.user === 'users/bot')).map(m => m.name), []);
    eq(outbox(t).length, 1);
    // It all went to the test copy, and only the copy, the relay and row 24's own Burson replies/emojis wrote there
    eq(inThread(t, COPY, inCopy.thread.name), [
      'Exposure Tag listed is incorrect. Please change to Product - Meme about Google products. Then resend the alert here.',
      'Alice Smith (Burson): Why is this one P0?',
      'Dana Lee: It is P0 because of the exposure tag. Thanks!',
      'Happy to help with that.',
    ]);
    const helloCopy = tops(t, COPY).find(m => m.text === 'Dana Lee: Morning Burson team');
    eq(inThread(t, COPY, helloCopy.thread.name), ['Dana Lee: And one more thing']);
    // (The bot's legend emojis on F.MAPS, Alice's 👀 and Dana's 👍 go on the alert's copy; Dana's 👎, "the bot got this wrong", never goes)
    eq([t.chat.reactionsOn(inCopy.name), t.chat.reactionsOn(helloCopy.name)],
      [[['users/bot', '⬇'], ['users/bot', '📰'], ['users/bot', '📦'], ['users/bot', '👀'], ['users/bot', '👍']], [['users/bot', '🎉']]]);
    eq(t.chat.calls.filter(c => c.method === 'post' && c.path === `${COPY}/messages`).map(c => String(c.query.messageId).slice(0, 12))
      .filter(p => !/^client-(?:zmir|zrly|zrlo|bqa-)/.test(p)), []);
    auditCopy(t);

    // B26 cleared: the Relay starts afresh on the Burson outbox, saying so; the copy stops
    t.set('B26', '');
    t.poll();
    assert.ok(textsIn(t, MIRROR).some(x => /^The relay with S-F Burson is on from \d\d:\d\d UTC\. From now on, what you write here waits on the Burson outbox tab, with your name, and goes to S-F Burson only once someone sets it to Send there/.test(x)));
    eq([t.get('C26'), t.g.props.get('RTC_CURSORS'), t.bot.testCopyId_()], [BLANK, undefined, '']);
    assert.match(switchNote(t, 22), /analysts' \(never the bot's\) wait on the Burson outbox tab for Send\./);
    const inCopyNow = posts(t, COPY).length;
    t.chat.say(REAL, 'After the test copy', ALICE);
    t.chat.say(MIRROR, 'Back after the test', DANA);
    t.poll();
    eq(posts(t, COPY).length, inCopyNow);
    assert.ok(textsIn(t, MIRROR).includes('Alice Smith (Burson): After the test copy'));
    eq(outbox(t).map(r => [r.text, r.status]), [['Dana Lee: Queued before the test copy', 'Pending'], ['Dana Lee: Back after the test', 'Pending']]);
    eq(toSfb(), []);
    // Set to Send by a person: each goes once, from the Burson outbox (the only way anything is written in S-F Burson)
    sendAll(t);
    eq(t.chat.botPosts(REAL).map(m => m.text), ['Dana Lee: Queued before the test copy', 'Dana Lee: Back after the test']);
    eq(outbox(t).map(r => r.status), ['Sent', 'Sent']);
  });

  test('Relay ON, B26 set but refused (a space people outside Google can join): nothing the analysts write goes anywhere (nothing queued for S-F Burson even with row 24 ON, nothing sent), C22 and the relay\'s note say so, and Burson\'s side still comes in; fixed, it starts afresh towards the test copy, and nothing written meanwhile goes', () => {
    const { t, zap, inMirror } = copyWorld({ relay: true, post: true, copy: VENDOR_LINK });
    eq([t.get('C26'), posts(t, COPY)], ['✗ "Shared With Vendors" allows people outside Google, so Burson could see it. Use a space only Google people can join.', []]);
    assert.ok(textsIn(t, MIRROR).some(x => /^The relay with S-F Burson is on from \d\d:\d\d UTC\. From now on, Burson's messages come over here, and nothing you write here goes anywhere until the Burson test copy \(Control tab B26\) is fixed: see C26\. Nothing from before then was queued\.$/.test(x)));
    assert.match(switchNote(t, 22), /analysts' \(never the bot's\) wait until the Burson test copy \(B26\) is fixed \(see C26\)\. The Relay tab logs each one/);
    markAs(t, ALICE.sender, 'Burson');
    t.chat.say(REAL, 'Why is this one P0?', Object.assign({ thread: zap.thread.name }, ALICE));
    t.chat.say(MIRROR, 'While B26 is wrong', Object.assign({ thread: inMirror.thread.name }, DANA));
    t.chat.say(MIRROR, 'Also while B26 is wrong', DANA);
    t.chat.addReaction(inMirror.name, '👍', DANA.sender, DANA.displayName);
    t.poll();
    t.poll();
    assert.ok(inThread(t, MIRROR, inMirror.thread.name).includes('Alice Smith (Burson): Why is this one P0?'));
    eq([outbox(t), writesIn(t, REAL), writesIn(t, 'spaces/AAQAvendor01'), relayRows(t).filter(r => r.direction !== 'From S-F Burson')], [[], [], [], []]);
    // Fixed: the relay starts afresh (saying where the analysts' side goes now); the copy starts, with nothing from before
    t.set('B26', COPY_NAME);
    t.poll();
    eq(posts(t, COPY), []);
    assert.ok(textsIn(t, MIRROR).some(x => /goes straight to the Burson test copy \(SLRR Burson Test Copy\)/.test(x)));
    const next = t.chat.say(REAL, F.MAPS, ZAP);
    t.poll();
    const nextInMirror = tops(t, MIRROR).find(m => m.text === F.MAPS);
    assert.ok(tops(t, COPY).some(m => m.text === F.MAPS) && nextInMirror, 'the copy starts');
    t.chat.say(MIRROR, 'Now it is fixed', Object.assign({ thread: nextInMirror.thread.name }, DANA));
    t.poll();
    eq(textsIn(t, COPY).filter(x => /^Dana Lee: /.test(x)), ['Dana Lee: Now it is fixed']);
    eq(posts(t, COPY).filter(m => t.chat.reactionsOn(m.name).some(r => r[1] === '👍')), []);  // Dana's 👍 from while B26 was wrong never goes
    eq([outbox(t), writesIn(t, REAL)], [[], []]);
    assert.ok(next);
    auditCopy(t);
  });

  test('A Relay tab from the deployed build (no copy_message / copy_thread): the first run with a Burson test copy adds them at the end, keeps every row, and still pairs threads with it', () => {
    const { t } = copyWorld({ relay: true, copy: '' });
    const tab = t.sheet().getSheetByName('Relay');
    eq(tab.rows[0].slice(-2), ['copy_message', 'copy_thread']);
    tab.rows = tab.rows.map(r => r.slice(0, 12));  // as the deployed build made it
    const kept = JSON.stringify(tab.rows.slice(1));
    t.set('B26', COPY_NAME);
    t.poll();
    eq(tab.rows[0], ['when', 'direction', 'what', 'who', 'user', 'text', 'status', 'burson_message', 'burson_thread', 'test_message',
      'test_thread', 'key', 'copy_message', 'copy_thread']);
    eq(JSON.stringify(tab.rows.slice(1, 1 + JSON.parse(kept).length).map(r => r.slice(0, 12))), kept);
    t.chat.say(REAL, F.MAPS, ZAP);  // an alert from after B26 was set: in both
    t.poll();
    const inMirror = tops(t, MIRROR).find(m => m.text === F.MAPS);
    t.chat.say(MIRROR, 'Under the alert', Object.assign({ thread: inMirror.thread.name }, DANA));
    t.poll();
    const inCopy = tops(t, COPY).find(m => m.text === F.MAPS);
    eq(inThread(t, COPY, inCopy.thread.name), ['Dana Lee: Under the alert']);
    auditCopy(t);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The Relay's inbound into the Mirror space: everyone, as in S-F Burson (with or without B26)
  // -----------------------------------------------------------------------------------------------------------------

  test('Relay: everyone\'s emojis in S-F Burson come over onto the message\'s copy in the Mirror space at once, as in S-F Burson (someone not marked, someone marked Google, someone marked Burson), the Relay tab saying who; each once; nothing waits on the Relay names tab', () => {
    const { t, zap, inMirror } = copyWorld({ relay: true, copy: '' });
    const LEE = { sender: 'users/burson6', displayName: 'Lee Wong' };
    markAs(t, LEE.sender, 'Google');
    markAs(t, ALICE.sender, 'Burson');
    t.chat.addReaction(zap.name, '👀', BO.sender, BO.displayName);
    t.chat.addReaction(zap.name, '😀', LEE.sender, LEE.displayName);
    t.chat.addReaction(zap.name, '🎉', ALICE.sender, ALICE.displayName);
    t.poll();
    const theirs = () => t.chat.reactionsOn(inMirror.name).filter(([, e]) => ['👀', '😀', '🎉'].includes(e));
    eq(theirs(), [['users/bot', '👀'], ['users/bot', '😀'], ['users/bot', '🎉']]);
    eq(relayRows(t).filter(r => r.what === 'emoji').map(r => [r.direction, r.who, r.text, r.status]), [
      ['From S-F Burson', 'Bo Chen', '👀', 'sent'],
      ['From S-F Burson', 'Lee Wong (Google)', '😀', 'sent'],
      ['From S-F Burson', 'Alice Smith (Burson)', '🎉', 'sent'],
    ]);
    eq(tabRows(t, 'Relay names').filter(r => r.user === BO.sender).map(r => [r.name, r.org, r.example]), [['Bo Chen', '', '(an emoji)']]);
    assert.match(switchNote(t, 22), / · last relay \d\d:\d\d UTC · the Relay tab has each one$/);
    const n = () => [theirs().length, relayRows(t).length];
    const before = n();
    t.poll();
    t.poll();
    eq(n(), before);
    eq(B.ev('typeof RELAY_NAME_WAIT_MS_'), 'undefined');  // no wait on the Relay names tab any more
  });

  test('Relay names: the first time this build reads the tab, the "Burson" an earlier build filled in by itself for everyone it saw in S-F Burson is cleared (one log line says how many), so they show by name only until a person marks them; rows marked Google, Mirror-space rows and later marks are kept; nothing to do without the tab. What an org cell says: Burson only when it says just that', () => {
    const t = e2e();
    t.bot.setup();
    const ss = t.sheet();
    const tab = ss.insertSheet('Relay names');
    tab.appendRow(['user', 'name', 'org', 'first_seen', 'seen_in', 'example']);
    tab.appendRow(['users/burson7', 'Alice Smith', 'Burson', '2026-10-22T18:10:00.000Z', 'S-F Burson', 'Why is this one P0?']);
    tab.appendRow(['users/im1', '', 'Burson', '2026-10-22T18:11:00.000Z', 'S-F Burson', 'Looking into it']);  // an IM it took for Burson
    tab.appendRow(['users/im2', 'Pat IM', 'Google', '2026-10-22T18:12:00.000Z', 'S-F Burson', 'On it']);
    tab.appendRow(['users/analyst9', 'Dana Lee', 'Google', '2026-10-22T18:13:00.000Z', 'the Mirror space', 'Morning']);
    const line = 'Relay names: cleared the "Burson" the earlier build filled in by itself on 2 row(s); mark each person Burson or Google ' +
      'there (until then they show by name only)';
    const lines = () => t.g.logs.filter(l => /^Relay names: /.test(l));
    t.bot.relayNames_(ss);  // the first read (the first relay or copy run)
    eq(tabRows(t, 'Relay names').map(r => [r.user, r.name, r.org]), [['users/burson7', 'Alice Smith', ''], ['users/im1', '', ''],
      ['users/im2', 'Pat IM', 'Google'], ['users/analyst9', 'Dana Lee', 'Google']]);
    eq(lines(), [line]);
    markAs(t, 'users/burson7', 'Burson');  // a person marks Alice: kept from then on
    t.bot.relayNames_(ss);
    eq([tabRows(t, 'Relay names')[0].org, lines()], ['Burson', [line]]);
    // No tab: nothing to do (none is made, no line), and never again
    const u = e2e();
    u.bot.setup();
    u.bot.relayMarksOnce_(u.sheet());
    eq([u.sheet().getSheetByName('Relay names'), !!u.g.props.get('RELAY_NAMES_MARKED'), u.g.logs.filter(l => /^Relay names: /.test(l))], [null, true, []]);
    // An org cell: Burson only when it says just that; anything with Google in it is Google; anything else is not marked
    eq(['Burson', ' burson ', 'BURSON', 'Google', 'google.com', 'Google (IM)', 'Burson / Google', '', null, undefined, 'Burson agency', 'Bursen']
      .map(v => B.relayMark_(v)), ['burson', 'burson', 'burson', 'google', 'google', 'google', 'google', '', '', '', '', '']);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The safeties: Chat.gs, the writer, the queue
  // -----------------------------------------------------------------------------------------------------------------

  test('Burson test copy: Chat.gs refuses every write there but the copy of S-F Burson and the Relay\'s analysts\' side (the bot\'s own work never lands there); the test copy\'s writer never writes anywhere else, never in S-F Burson; nothing is queued for S-F Burson while B26 is set, usable or not; B26 is read again before each item the Relay sends there', () => {
    const { t, zap, inCopy } = copyWorld({ relay: true });
    eq(t.bot.testCopyId_(), COPY);
    assert.throws(() => t.bot.chatPostMessage_(COPY, 'a note of the bot\'s own', { key: 'k1' }), /Refusing to write in the Burson test copy \(Control tab B26\)/);
    assert.throws(() => t.bot.chatReact_(inCopy.name, '📰'), /Refusing to write in the Burson test copy/);
    assert.throws(() => t.bot.testCopyWrite_(REAL, () => 'x'), /isn't this run's Burson test copy/);
    assert.throws(() => t.bot.testCopyWrite_(MIRROR, () => 'x'), /isn't this run's Burson test copy/);
    assert.throws(() => t.bot.testCopyWrite_(COPY, () => t.bot.chatPostMessage_(REAL, 'x', { key: 'k2' })), /Refusing to write in S-F Burson/);
    assert.throws(() => t.bot.testCopyReact_(COPY, zap.name, '👍'), /isn't in the Burson test copy/);
    eq(t.bot.testCopyWriting_(), false);  // only while the copy or the relay writes there, even after a refusal
    const ok = t.bot.testCopyPost_(COPY, 'a line the copy writes', null, 'test-k', 'client-zrly-');
    eq(ok.name.indexOf(COPY + '/messages/'), 0);
    eq([t.chat.botPosts(REAL), t.chat.botReactions(inCopy.name)], [[], []]);
    // Nothing is queued for S-F Burson while B26 is set (usable or not); the analysts' side runs only to the test copy
    const ctx = extra => Object.assign({ switches: { relay: true, postBurson: true }, outboundBlocked: true, botUser: 'users/bot',
      spaces: { burson: { id: MIRROR } }, sfBurson: { id: REAL }, settings: {}, live: true, outbox: { add: () => ({ queued: true }) } }, extra);
    const w = { kind: 'post', text: 'x', key: 'k' };
    const usable = { testCopyWanted: true, testCopy: { id: COPY, name: COPY_NAME } };
    eq([t.bot.relayQueue_(ctx({}), w), t.bot.relayQueue_(ctx({ testCopyWanted: true }), w), t.bot.relayQueue_(ctx(usable), w)], [{ queued: true }, null, null]);
    eq([t.bot.relayOutOn_(ctx({})), t.bot.relayOutOn_(ctx({ testCopyWanted: true })), t.bot.relayOutOn_(ctx(usable)),
      t.bot.relayOutOn_(ctx(Object.assign({ switches: { relay: true, postBurson: false } }, usable)))], [true, false, true, true]);
    // B26 read again (every few seconds) before each item goes there: changed during a run, nothing more goes that run
    const check = t.bot.relayLiveCheck_(t.control(), COPY_NAME);
    eq(check(), true);
    t.set('B26', COPY2_NAME);
    t.g.clock.now += 5000;
    eq(check(), false);
    // Same space, by any of its names: the check behind "a space of its own"
    const sp = { id: COPY, name: COPY_NAME };
    eq([COPY_LINK, COPY, 'AAQAtestcp1', ' slrr burson test copy ', COPY_NAME, 'Another space', '', null, COPY2].map(v => B.sameSpaceRef_(v, sp)),
      [true, true, true, true, true, false, false, false, false]);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // Testing vs. LIVE mode (Safety valve row 29 & B26), row 24 Mirror-space forwarding, and Early wave in Mirror space
  // -----------------------------------------------------------------------------------------------------------------

  test('runMode_ and Safety valve (row 29): decides Testing vs. LIVE once per run from row 29, B26 and B25 (fail closed to Testing); Status B5 shows 🔴 LIVE · only when LIVE; C11, C22, C24 and C29 name the run mode and reason', () => {
    const sfb = { id: REAL, name: '[S-F] Burson Automated Alerts V3' };
    const cfgMir = { outboundBlocked: true, burson: { id: MIRROR } };
    const cfgSfb = { outboundBlocked: false, burson: { id: REAL } };
    const cfgTest = { outboundBlocked: false, burson: { id: TEST_FEED } };
    // Missing switches or S-F Burson → fail closed to Testing
    eq(B.runMode_(null, '', sfb, cfgMir), { live: false, why: 'the switches couldn\'t be read' });
    eq(B.runMode_({ safetyValve: false }, '', null, cfgMir), { live: false, why: 'S-F Burson, B25, isn\'t set or found' });
    eq(B.runMode_({ safetyValve: false }, '', sfb, cfgTest), { live: false, why: 'the alerts don\'t come from S-F Burson: B3 isn\'t S-F Burson and no Mirror space' });
    // Safety valve ON → always Testing, whether B26 is set or blank
    eq(B.runMode_({ safetyValve: true }, '', sfb, cfgMir), { live: false, why: 'the Safety valve is ON' });
    eq(B.runMode_({ safetyValve: true }, COPY_NAME, sfb, cfgMir), { live: false, why: 'the Safety valve is ON' });
    // Safety valve OFF + B26 set (valid or invalid) → Testing
    eq(B.runMode_({ safetyValve: false }, COPY_NAME, sfb, cfgMir), { live: false, why: 'the Burson test copy, B26, is set' });
    eq(B.runMode_({ safetyValve: false }, 'spaces/NOPENOPE', sfb, cfgMir), { live: false, why: 'the Burson test copy, B26, is set' });
    // Safety valve OFF + B26 blank + S-F Burson found (via Mirror or B3) → LIVE
    eq(B.runMode_({ safetyValve: false }, '', sfb, cfgMir), { live: true, why: '' });
    eq(B.runMode_({ safetyValve: false }, '', sfb, cfgSfb), { live: true, why: '' });

    // End-to-end on the Control tab: B5, C11, C22, C24 and C29 update each run
    const t = e2e();
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    t.set('B25', REAL);
    t.chat.addSpace(MIRROR, MIRROR_NAME);
    t.chat.addSpace(COPY, COPY_NAME);
    t.bot.startMirror(MIRROR_NAME);
    for (const r of [11, 22, 24]) t.control().getRange(r, 2).setValue('ON');
    // 1. LIVE: Safety valve OFF, B26 blank
    t.poll();
    assert.match(t.get('B5'), /^🔴 LIVE · ✅ Working/);
    assert.match(switchNote(t, 11), /^✓ ON: the bot sends the Social Alert email itself/);
    assert.match(switchNote(t, 29), /^OFF · 🔴 LIVE: Social Alerts and the bot's other emails go to the real recipients/);
    // 2. Turn Safety valve ON (B26 still blank) → 🧪 Testing
    t.control().getRange(29, 2).setValue('ON');
    t.poll();
    assert.ok(!/^🔴 LIVE/.test(t.get('B5')));
    assert.match(switchNote(t, 11), /^✓ ON \(testing: sending only to the testers in B30\)/);
    assert.match(switchNote(t, 22), /analysts' \(never the bot's\) stay there \(Testing: nothing goes to S-F Burson\)/);
    assert.match(switchNote(t, 24), /^✓ ON \(Testing\): nothing goes to S-F Burson/);
    assert.match(switchNote(t, 29), /^\u2713 ON · \ud83e\uddea Testing, even with B26 blank: nothing goes to S-F Burson, and every email goes only to tester@testing\.test/);
  });

  test('Row 24 (Post in S-F Burson) ON in the Mirror space: in Testing with B26 usable, the bot\'s own Burson-facing replies (fix-and-resend, Burson Q&A) and legend emojis go straight onto the matching copy in B26 (never internal analyst notes), while with Safety valve ON and B26 blank nothing goes to any Burson space; in LIVE, they wait on the Burson outbox for Send (and are held back to Pending if the Safety valve is turned ON before Send runs)', () => {
    // 1. Testing with B26 usable and row 24 ON: bot's own fix-and-resend reply, Q&A answer, and legend emojis go to COPY
    const { t, zap, inCopy } = copyWorld({ relay: false, post: true });
    // zap (F.P0_OK) got its legend emojis in MIRROR and on inCopy
    eq(t.chat.reactionsOn(inCopy.name), [['users/bot', '📰'], ['users/bot', '📦'], ['users/bot', '🌎']]);
    // Post an alert with mistakes (F.MISTAKES) → bot posts a fix-and-resend reply + ⬇ in MIRROR and forwards both to COPY
    const bad = t.chat.say(REAL, F.MISTAKES, ZAP);
    t.poll();
    const badInCopy = tops(t, COPY).find(m => m.text === F.MISTAKES);
    const badInMirror = tops(t, MIRROR).find(m => m.text === F.MISTAKES);
    assert.ok(badInCopy && badInMirror);
    // In MIRROR the thread has the Burson-facing fix-and-resend reply ("needs ... fix" / "re-send")
    const mirrorReplies = inThread(t, MIRROR, badInMirror.thread.name);
    assert.ok(mirrorReplies.some(x => /needs .*fix|re-send|resend/i.test(x)), 'Mirror has fix-and-resend reply: ' + JSON.stringify(mirrorReplies));
    // And with Never wait on Burson (row 23) ON, F.PARIS gets both a Burson-facing correction reply AND an internal analyst T&S note in MIRROR; only the Burson-facing reply goes to COPY (never the internal T&S note)
    t.control().getRange(23, 2).setValue('ON');
    t.chat.say(REAL, F.PARIS, ZAP);
    t.poll();
    const parisInCopy = tops(t, COPY).find(m => m.text === F.PARIS);
    const parisInMirror = tops(t, MIRROR).find(m => m.text === F.PARIS);
    assert.ok(inThread(t, MIRROR, parisInMirror.thread.name).some(x => /T&S|Trust & Safety|docs\.google\.com\/forms/i.test(x)), 'Mirror has internal analyst T&S note');
    assert.ok(inThread(t, COPY, parisInCopy.thread.name).length === 1 && !inThread(t, COPY, parisInCopy.thread.name).some(x => /T&S|Trust & Safety|docs\.google\.com\/forms/i.test(x)),
      'internal analyst T&S note never goes to COPY');
    t.control().getRange(23, 2).setValue('OFF');
    // In COPY only the Burson-facing fix-and-resend reply appears on badInCopy, plus ⬇ on the alert
    const copyReplies = inThread(t, COPY, badInCopy.thread.name);
    eq(copyReplies.length, 1);
    assert.match(copyReplies[0], /^Please make the following updates and resend/s);
    assert.ok(t.chat.reactionsOn(badInCopy.name).some(r => r[1] === '⬇'), '⬇ reaction forwarded to COPY');
    eq([outbox(t), ownRows(t), writesIn(t, REAL)], [[], [], []]);
    auditCopy(t);

    // 2. Turn row 24 OFF: the bot's own replies/emojis stay in MIRROR only (not forwarded to COPY)
    t.control().getRange(24, 2).setValue('OFF');
    t.poll();
    t.chat.say(REAL, F.MAPS, ZAP);
    t.poll();
    const mapsInCopy = tops(t, COPY).find(m => m.text === F.MAPS);
    eq([inThread(t, COPY, mapsInCopy.thread.name), t.chat.reactionsOn(mapsInCopy.name)], [[], []]);

    // 3. LIVE (Safety valve OFF, B26 blank, row 24 ON): bot's own Burson reply and emoji in MIRROR queue on Burson outbox (from: 'bot')
    t.set('B26', '');
    t.control().getRange(24, 2).setValue('ON');
    t.poll();
    const liveBad = t.chat.say(REAL, F.MISTAKES.replace('2109566527900926417', '2109566527900926999'), ZAP);
    t.poll();
    const queued = ownRows(t);
    assert.ok(queued.some(r => r.kind === 'reply' && r.status === 'Pending' && /Please make the following updates and resend/i.test(r.text)));
    assert.ok(queued.some(r => r.kind === 'reaction' && /^⬇/.test(r.text) && r.status === 'Pending'));
    eq(writesIn(t, REAL), []);

    // A person sets the bot's queued rows to Send, then turns the Safety valve ON before the next run → held back to Pending!
    const tab = t.sheet().getSheetByName('Burson outbox');
    tab.rows.slice(1).forEach((r, i) => { if (r[4] === 'bot') tab.getRange(i + 2, 6).setValue('Send'); });
    t.control().getRange(29, 2).setValue('ON');
    t.poll();
    eq(writesIn(t, REAL), []);
    assert.ok(ownRows(t).every(r => r.status === 'Pending' && /not sent: the bot is in Testing \(the Safety valve is ON\)/.test(r.note)));

    // Turn Safety valve back OFF and set Send again → sent to real S-F Burson
    t.control().getRange(29, 2).setValue('OFF');
    tab.rows.slice(1).forEach((r, i) => { if (r[4] === 'bot') tab.getRange(i + 2, 6).setValue('Send'); });
    t.poll();
    assert.ok(ownRows(t).every(r => r.status === 'Sent'));
    assert.ok(inThread(t, REAL, liveBad.thread.name).some(x => /Please make the following updates and resend/i.test(x)));
    assert.ok(t.chat.reactionsOn(liveBad.name).some(r => r[1] === '⬇'));
    assert.ok(zap && bad);
  });

  test('Row 19 (Early detection) ON in the Mirror space: posts Early Detection Alert cards at the top of the Mirror space and never relays or forwards them to the Burson test copy or S-F Burson; Auto-correct space (B10) stays in Testing even when the Mirror run is LIVE', () => {
    const { t } = copyWorld({ relay: true, post: true });
    t.chat.addSpace(AC, 'SLRR Auto-correct Test');
    t.bot.startAutoCorrect('SLRR Auto-correct Test');
    t.control().getRange(11, 2).setValue('ON');  // Auto-send emails
    t.control().getRange(19, 2).setValue('ON');  // Early detection (clusters & velocity)
    t.bot.bqEarlyDetectionRows_ = () => [{
      alert_id: 'ed-cluster-101',
      created_utc: '2026-11-06 01:00 UTC',
      signal_type: 'CLUSTER_EMERGENCE',
      velocity_grain: '',
      cluster_id: 'cl-maps-bridge',
      signal_key: 'cl-maps-bridge',
      headline: 'Google Maps routing commuters onto a closed bridge',
      topic_product: 'Google Maps',
      priority_hint: 'P1',
      unique_low_tier_authors: 6,
      mention_count: 8,
      platform_count: 2,
      platforms_csv: 'X, Reddit',
      baseline_authors: 0.8,
      velocity_ratio: 7.5,
      absolute_author_delta: 5.2,
      primary_url: 'https://x.com/mapsfan1/status/2120000000000000001',
      representative_posts_json: JSON.stringify([
        { url: 'https://x.com/mapsfan1/status/2120000000000000001', author_handle: 'mapsfan1', platform: 'X',
          snippet: 'Google Maps keeps routing commuters onto a closed bridge', engagement_total: 42, followers: 320 },
        { url: 'https://www.reddit.com/r/Seattle/comments/abc123', author_handle: 'u/seattlecommuter', platform: 'Reddit',
          snippet: 'Third driver stranded at the closed bridge because of Google Maps directions', engagement_total: 35, followers: 0 },
      ]),
      chatbot_card_text: '',
    }];
    t.poll();
    // the bot's own card under either wording: today's first lines, or the header cards had before
    const ED_CARD = /\*EARLY DETECTION\*|\*EARLY SIGNAL\*|Early Detection Alert/;
    const edInMirror = tops(t, MIRROR).filter(m => ED_CARD.test(m.text));
    eq(edInMirror.length, 1, 'Early Detection Alert card is posted at the top of the Mirror space');
    assert.ok(edInMirror[0].text.startsWith('\ud83d\udea8 *EARLY DETECTION* \u00b7 New story\n'), edInMirror[0].text);
    assert.match(edInMirror[0].clientAssignedMessageId || '', /^client-zeda-/);
    // Never forwarded or relayed to COPY or REAL
    eq(posts(t, COPY).filter(m => ED_CARD.test(m.text)), []);
    eq(posts(t, REAL).filter(m => ED_CARD.test(m.text)), []);

    // Switch to LIVE (clear B26, Safety valve OFF): Mirror space Auto-send goes to real recipients, while Auto-correct (B10) stays in Testing (only to tester@testing.test)
    t.set('B26', '');
    t.poll();
    // Even after a second poll (which triages the Early Detection Alert in MIRROR and runs Relay), nothing from Early Detection ever leaks to COPY or REAL
    eq(posts(t, COPY).filter(m => ED_CARD.test(m.text) || /Triage:|Early Detection Review/.test(m.text)), []);
    eq(posts(t, REAL).filter(m => ED_CARD.test(m.text) || /Triage:|Early Detection Review/.test(m.text)), []);
    const beforeCount = t.g.gmail.sentMessages().length;
    t.chat.say(REAL, F.AIO, ZAP);
    t.poll();
    const newMimes = t.g.gmail.sentMessages().slice(beforeCount).map(m => String(m.mime || ''));
    assert.ok(newMimes.some(m => !/^To: tester@testing\.test\r?$/m.test(m)), 'Mirror LIVE run sends to real recipients: ' + JSON.stringify(newMimes.map(m => m.slice(0, 120))));
    assert.ok(newMimes.some(m => /^To: tester@testing\.test\r?$/m.test(m)),
      'Auto-correct space stays in Testing even when Mirror is LIVE');
  });
};

