// C1: every switch starts OFF, and only a person turns one ON. The Control tab the LIVE code (8a0f20b) made, as on the
// live sheet (every switch OFF, or rows 14, 15 and 17 ON), stays exactly as it was through this build's poll() and
// setup(), but for the new switch rows (22-24, 27-29, 32, 34, 36-40, 46, 48-51, 54 and 55, OFF; C29 says the run is Testing), the S-F Burson space row
// (25, blank: only a person pastes S-F Burson there), the Burson test copy row (26, blank), the Testing: send to row (30,
// blank), the BigQuery lookback row (31, 60 minutes), the Other alerts space row (33, blank), the Watch alerts row (35,
// OFF) and "How it works" moved below them (row 57). The tabs are in
// test/control_tab_live_8a0f20b.json, made by running the LIVE code (setup(), the switches set, one poll()) on these fakes.
'use strict';

const LIVE = require('./control_tab_live_8a0f20b.json');

module.exports = H => {
  const { test, eq, assert, B, e2e, REAL } = H;
  const SWITCHES = B.ev('CONTROL_SWITCHES_');
  const at = r => SWITCHES[B.switchRows_().indexOf(r)];  // the switch on row r (rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54-55)
  const NEW_ROWS = [22, 23, 24, 27, 28, 32, 34, 36, 37, 38, 39, 40, 46, 48, 49, 50, 51, 54, 55, 56];  // 56: the run log's switch (RunLog.gs), new too  // + row 29, the Safety valve (its C29 says the run's mode)
  const ON_OFF = ['ON', 'OFF'];
  const LOOKBACK = ['15 minutes', '30 minutes', '45 minutes', '60 minutes'];  // B31's dropdown (the BigQuery lookback)
  const LOOKBACK_60 = B.bqLookbackFrom_('60 minutes').note;     // C31 for the 60 minutes a new row 31 starts with
  const cells = (sh, r) => [1, 2, 3].map(c => sh.cell(r, c));
  const lists = sh => Object.fromEntries(Object.entries(sh.validations).map(([k, v]) => [k, v && v.values]));
  const keysOn = rows => Object.assign(B.switchesOff_(), Object.fromEntries(rows.map(r => [at(r).key, true])));
  // C29 once a run knows the mode: Testing, and why
  const NO_SFB = 'S-F Burson, B25, isn\'t set or found';
  const NOT_FROM_SFB = 'the alerts don\'t come from S-F Burson: B3 isn\'t S-F Burson and no Mirror space';
  const valveC = why => B.switchOffText_(at(29), null, false, { modeWhy: why });
  const SW32 = () => [at(32).label, 'OFF', B.switchOffText_(at(32))];  // Work directly in B25, as every tab gets it
  const OS33 = () => [B.ev('OS_LABEL_'), '', B.ev('OS_HINT_')];  // the Other alerts space, blank, as every tab gets it
  const SW34 = () => [at(34).label, 'OFF', B.switchOffText_(at(34))];  // Proactive watch, as every tab gets it
  const WA35 = () => [B.ev('PW_ALERTS_LABEL_'), 'OFF', B.pwAlertsOffText_()];  // Watch alerts, OFF, as every tab gets it
  const TC36 = () => [at(36).label, 'OFF', B.switchOffText_(at(36))];  // Temp checks, as every tab gets it
  const GT37 = () => [at(37).label, 'OFF', B.switchOffText_(at(37))];  // Group test emails, as every tab gets it
  const FT = r => [at(r).label, 'OFF', B.switchOffText_(at(r))];  // rows 38-40, 46, 48-51, 54-55: Fast triage, early_wave BigQuery, AMIE, Brandwatch live, the Watch's AMIE, the open engine, the live dashboard and the slide deliveries switches, as every tab gets them
  const BLANK = ['', '', ''];
  const BAR_SPECS = B.ev('FT_BAR_SPECS_');
  const BAR = r => { const s = BAR_SPECS.find(x => x.row === r); return [s.label, s.seedText, B.ftBarFrom_(s, s.seedText).note]; };
  const BAR_VALS = Object.fromEntries(BAR_SPECS.map(s => [`${s.row},2`, s.choices]));
  const WA_CHOICES = ['OFF', 'Other alerts space (B33)', 'Mirror space (B9)', 'Auto-correct space (B10)'];  // B35's dropdown

  /** The bot's sheet and properties from setup(), then its Control tab replaced by one the LIVE code made. */
  const liveWorld = variant => {
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
   * The tab is the LIVE one but for what this build adds: rows 1-21 as they were (B6, the time of the last run, aside,
   * and column C of a switch that's ON: what it's doing), rows 22-24, 27-29, 32, 34, 36-40 and 46 the new switches, OFF, with their
   * dropdowns (C29: Testing, and why), row 25 the S-F Burson space, blank (C25: not set, what's paused), row 26 the
   * Burson test copy, blank (C26: what blank means), row 30 Testing: send to, blank (C30: who gets the emails), row 31
   * the BigQuery lookback, 60 minutes, with its dropdown (C31: what the bot uses), row 33 the Other alerts space, blank,
   * row 35 Watch alerts (OFF), row 36 the Temp checks switch (OFF), row 37 Group test emails (OFF), rows 38-40 the three Fast triage switches (OFF), rows 41-45 and 47 the bar cells, row 46 early_wave BigQuery (OFF), row 48 the AMIE table (OFF), row 49 Brandwatch live (OFF), row 50 the Watch's AMIE source (OFF), row 51 the open engine (OFF), rows 52-53 blank, row 54 the live dashboard (OFF), row 55 the slide deliveries (OFF), row 56 blank and "How it works" from row 57 (none of the old help text left); column C of an OFF switch is the bot's own words
   * for OFF (this build's: C11 names the testers in B30); the switches read as the LIVE tab had them, and no S-F Burson is known. With `b25` ({value, note}), B25
   * is the link someone pasted there and C25 what the bot found.
   */
  const sameAsLive = (t, variant, when, b25) => {
    const sh = t.control();
    for (let r = 1; r <= 21; r++) {
      const want = [0, 1, 2].map(c => { const v = (variant.rows[r - 1] || [])[c]; return v === undefined ? '' : v; });
      if (r === 6) want[1] = sh.cell(6, 2);
      if (variant.on.includes(r)) {
        assert.match(sh.cell(r, 3), /^✓ ON/, `${when}: C${r}`);
        want[2] = sh.cell(r, 3);
      } else if (r >= 11) {
        want[2] = B.switchOffText_(at(r), keysOn(variant.on));  // the bot's own words for OFF
      }
      eq(cells(sh, r), want, `${when}: row ${r}`);
    }
    assert.match(sh.cell(6, 2), /^Oct 14, \d+:\d\d [AP]M EDT$/);
    NEW_ROWS.forEach(r => eq(cells(sh, r), [at(r).label, 'OFF', B.switchOffText_(at(r))], `${when}: row ${r}`));
    eq(cells(sh, 29), ['Safety valve', 'OFF', valveC(b25 ? NOT_FROM_SFB : NO_SFB)], `${when}: row 29`);
    eq(cells(sh, 25), ['S-F Burson space', b25 ? b25.value : '', b25 ? b25.note : B.ev('SFB_BLANK_NOTE_')], `${when}: row 25`);
    eq(cells(sh, 26), ['Burson test copy', '', B.ev('RTC_BLANK_NOTE_')], `${when}: row 26`);
    eq([cells(sh, 30).slice(0, 2), cells(sh, 31), cells(sh, 33), cells(sh, 35), cells(sh, 36), cells(sh, 37), cells(sh, 38), cells(sh, 39), cells(sh, 40),
      cells(sh, 41), cells(sh, 42), cells(sh, 43), cells(sh, 44), cells(sh, 45), cells(sh, 46), cells(sh, 47), cells(sh, 48),
      cells(sh, 49), cells(sh, 50), cells(sh, 51), cells(sh, 52), cells(sh, 53), cells(sh, 54), cells(sh, 55), cells(sh, 56), sh.cell(57, 1)],
    [['Testing: send to', ''], ['BigQuery lookback', '60 minutes', LOOKBACK_60], OS33(), WA35(), TC36(), GT37(), FT(38), FT(39), FT(40),
      BAR(41), BAR(42), BAR(43), BAR(44), BAR(45), FT(46), BAR(47), FT(48), FT(49), FT(50), FT(51), BLANK, BLANK, FT(54), FT(55), FT(56),
      'How it works'], when);  // row 56 is a switch now (it was the blank row above the help)
    assert.match(sh.cell(30, 3), /^Blank: while Testing, enter up to 5 email addresses \(comma-separated\) to receive test emails and alerts \(nothing is sent while B30 is blank\)$/, when);
    const help = B.ev('CONTROL_HELP_');
    eq(help.map((_, i) => sh.cell(58 + i, 1)), help, when);
    for (let r = 58 + help.length; r <= Math.max(sh.rows.length, 90); r++) eq(cells(sh, r), ['', '', ''], `${when}: row ${r}`);
    eq(lists(sh), Object.assign({}, variant.validations, { '22,2': ON_OFF, '23,2': ON_OFF, '24,2': ON_OFF, '27,2': ON_OFF,
      '28,2': ON_OFF, '29,2': ON_OFF, '31,2': LOOKBACK, '32,2': ON_OFF, '34,2': ON_OFF, '35,2': WA_CHOICES, '36,2': ON_OFF, '37,2': ON_OFF,
      '38,2': ON_OFF, '39,2': ON_OFF, '40,2': ON_OFF }, BAR_VALS, { '46,2': ON_OFF, '48,2': ON_OFF, '49,2': ON_OFF, '50,2': ON_OFF, '51,2': ON_OFF,
      '54,2': ON_OFF, '55,2': ON_OFF, '56,2': ON_OFF }), when);  // and row 56's dropdown
    eq(t.bot.readControl_(sh).switches, keysOn(variant.on), when);
    eq(t.bot.readControl_(sh).sfBurson, b25 ? b25.value : '', when);
    eq(t.bot.readControl_(sh).testCopy, '', when);
    eq(t.bot.readControl_(sh).testers, '', when);
    eq(t.bot.readControl_(sh).bqLookback, '60 minutes', when);
  };

  test('C1: the fixture is the LIVE code\'s Control tab (switches in rows 11-21, "How it works" from row 23), every switch OFF or rows 14, 15 and 17 ON', () => {
    for (const v of [LIVE.all_off, LIVE.on_14_15_17]) {
      eq([v.rows[10][0], v.rows[20][0], v.rows[21][0], v.rows[22][0]], ['Auto-send Social Alerts', 'Track post-alert outcomes', '', 'How it works']);
      eq(v.rows.slice(10, 21).map(r => r[1]), Array.from({ length: 11 }, (_, i) => (v.on.includes(11 + i) ? 'ON' : 'OFF')));
      eq(Object.keys(v.validations).sort(), ['2,2', '11,2', '12,2', '13,2', '14,2', '15,2', '16,2', '17,2', '18,2', '19,2', '20,2', '21,2'].sort());
    }
    eq([LIVE.all_off.props, LIVE.on_14_15_17.props], [[], ['SWITCH_NOTES']]);  // no SWITCH_DEFAULTS: the LIVE code never had one
  });

  for (const [name, variant] of [['every switch OFF', LIVE.all_off], ['rows 14, 15 and 17 ON (the live sheet today)', LIVE.on_14_15_17]]) {
    test(`C1: a Control tab the LIVE code (8a0f20b) made, ${name}, stays exactly as it was through this build's poll(), setup() and more runs: only rows 22-24 and 27-29 (OFF, with their dropdowns), row 25 (S-F Burson space, blank), row 26 (Burson test copy, blank), row 30 (Testing: send to, blank) and row 31 (BigQuery lookback, 60 minutes, with its dropdown) are new, and "How it works" moves below them (row 33)`, () => {
      const t = liveWorld(variant);
      t.poll();
      sameAsLive(t, variant, 'after the first poll()');
      t.bot.setup();
      sameAsLive(t, variant, 'after setup()');
      t.poll();
      t.poll();
      sameAsLive(t, variant, 'after more runs');
      eq([t.g.props.has('SWITCH_DEFAULTS'), t.get('B5')], [false, '✅ Working']);
    });
  }

  test('S-F Burson row: a link someone pastes in B25 of a LIVE-made tab before this build is deployed (column B of row 25 is empty there: the LIVE code writes its help text in column A only) is kept and used from the first run, without setup(): C25 ✓, the run knows S-F Burson, everything else as with B25 blank', () => {
    const link = 'https://chat.google.com/room/' + REAL.replace(/^spaces\//, '');
    const b25 = { value: link, note: '✓ [S-F] Burson Automated Alerts V3' };
    const t = liveWorld(LIVE.on_14_15_17);
    t.control().getRange(25, 2).setValue(link);
    t.poll();
    sameAsLive(t, LIVE.on_14_15_17, 'after the first poll()', b25);
    eq([t.bot.sfBursonId_(), t.get('B5')], [REAL, '✅ Working']);
    t.bot.setup();
    t.poll();
    sameAsLive(t, LIVE.on_14_15_17, 'after setup() and another run', b25);
  });

  test('C1: a SWITCH_DEFAULTS property an earlier build left changes nothing on a LIVE tab (it\'s never read, written or deleted), and deleting it changes nothing either', () => {
    const t = liveWorld(LIVE.on_14_15_17);
    t.g.props.set('SWITCH_DEFAULTS', '2');  // what the build that turned 9 switches ON by itself (85264de) left after its first run
    t.poll();
    t.bot.setup();
    sameAsLive(t, LIVE.on_14_15_17, 'with SWITCH_DEFAULTS = 2');
    eq(t.g.props.get('SWITCH_DEFAULTS'), '2');
    t.g.props.set('SWITCH_DEFAULTS', '1');  // an older version: still nothing
    t.poll();
    sameAsLive(t, LIVE.on_14_15_17, 'with SWITCH_DEFAULTS = 1');
    t.g.props.delete('SWITCH_DEFAULTS');
    t.poll();
    t.bot.setup();
    sameAsLive(t, LIVE.on_14_15_17, 'after deleting it');
    eq(t.g.props.has('SWITCH_DEFAULTS'), false);
  });

  test('C1: a switch whose label someone cleared (or changed) is put back OFF, even if it said ON (and it reads OFF in the same run); the other switches keep their values', () => {
    const t = liveWorld(LIVE.on_14_15_17);
    t.poll();
    const sh = t.control();
    sh.getRange(22, 2).setValue('ON');  // a person turns the relay and Post in S-F Burson ON
    sh.getRange(24, 2).setValue('ON');
    sh.getRange(14, 1).setValue('');    // ...then someone clears row 14's label, and edits row 24's
    sh.getRange(24, 1).setValue('Post in S-F Burson (careful)');
    sh.getRange(18, 1).setValue('  Watch sent alerts (24h)  ');  // spaces around a label: still that switch
    sh.getRange(18, 2).setValue('ON');
    eq(t.bot.readSwitches_(sh), keysOn([15, 17, 18, 22]));  // a row without its own label is never ON
    t.poll();
    eq([cells(sh, 14), cells(sh, 24)], [['Auto-find missing links', 'OFF', B.switchOffText_(at(14))],
      ['Post in S-F Burson', 'OFF', B.switchOffText_(at(24))]]);
    eq([sh.validations['14,2'].values, sh.validations['24,2'].values], [ON_OFF, ON_OFF]);
    eq(t.bot.readControl_(sh).switches, keysOn([15, 17, 18, 22]));
    eq([sh.cell(15, 2), sh.cell(17, 2), sh.cell(18, 2), sh.cell(22, 2)], ['ON', 'ON', 'ON', 'ON']);
    // A row cleared entirely: put back, OFF
    sh.getRange(17, 1, 1, 3).setValues([['', '', '']]);
    t.bot.setup();
    eq(cells(sh, 17), ['Learn from IM calls', 'OFF', B.switchOffText_(at(17))]);
  });

  test('C1: an in-place update of a tab with the relay row (rows 11-22, "How it works" from row 24) keeps rows 11-22 as people set them, and adds rows 23-24, 27-29, 32, 34, 36 and 37 OFF', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    // The tab as the build before this one made it: 12 switches, a blank row, "How it works" from row 24
    const people = { 12: 'ON', 14: 'ON', 15: 'ON', 16: 'OFF', 17: 'ON', 19: 'ON', 22: 'ON' };
    sh.rows = sh.rows.slice(0, 22);
    for (let r = 11; r <= 22; r++) sh.rows[r - 1][1] = people[r] || 'OFF';
    ['23,2', '24,2', '27,2', '28,2', '29,2', '31,2', '32,2', '34,2', '35,2', '36,2', '37,2', '38,2', '39,2', '40,2', '41,2', '42,2', '43,2', '44,2', '45,2', '46,2', '48,2', '49,2', '50,2', '51,2', '54,2', '55,2', '56,2'].forEach(k => { delete sh.validations[k]; });
    sh.rows[22] = [''];
    sh.rows[23] = ['How it works'];
    ['• old help line 1', '• Rows 11-22 are switches…', '• Relay with S-F Burson: …'].forEach((line, i) => { sh.rows[24 + i] = [line]; });
    const before = Array.from({ length: 12 }, (_, i) => [sh.cell(11 + i, 1), sh.cell(11 + i, 2)]);
    t.poll();
    eq(Array.from({ length: 12 }, (_, i) => [sh.cell(11 + i, 1), sh.cell(11 + i, 2)]), before);
    eq([cells(sh, 23), cells(sh, 24), cells(sh, 27), cells(sh, 28), cells(sh, 29)], [['Never wait on Burson', 'OFF', B.switchOffText_(at(23))],
      ['Post in S-F Burson', 'OFF', B.switchOffText_(at(24))], ['Draft follow-ups', 'OFF', B.switchOffText_(at(27))],
      ['Draft answers to questions', 'OFF', B.switchOffText_(at(28))], ['Safety valve', 'OFF', valveC(NO_SFB)]]);
    eq([sh.validations['23,2'].values, sh.validations['24,2'].values, sh.validations['27,2'].values, sh.validations['28,2'].values,
      sh.validations['29,2'].values, sh.validations['31,2'].values, sh.validations['32,2'].values, sh.validations['34,2'].values,
      sh.validations['35,2'].values, sh.validations['36,2'].values, sh.validations['37,2'].values, sh.cell(25, 1), sh.cell(26, 1), sh.cell(30, 1), cells(sh, 31),
      cells(sh, 32), cells(sh, 33), cells(sh, 34), cells(sh, 35), cells(sh, 36), cells(sh, 37), cells(sh, 38), cells(sh, 39), cells(sh, 40),
      cells(sh, 41), cells(sh, 42), cells(sh, 43), cells(sh, 44), cells(sh, 45), cells(sh, 46), cells(sh, 47),
      cells(sh, 48), cells(sh, 49), cells(sh, 50), cells(sh, 51), sh.cell(52, 1), sh.cell(53, 1), cells(sh, 54), cells(sh, 55),
      sh.cell(56, 1), sh.cell(57, 1)],
    [ON_OFF, ON_OFF, ON_OFF, ON_OFF, ON_OFF, LOOKBACK, ON_OFF, ON_OFF, WA_CHOICES, ON_OFF, ON_OFF, 'S-F Burson space', 'Burson test copy',
      'Testing: send to', ['BigQuery lookback', '60 minutes', LOOKBACK_60], SW32(), OS33(), SW34(), WA35(), TC36(), GT37(), FT(38), FT(39), FT(40),
      BAR(41), BAR(42), BAR(43), BAR(44), BAR(45), FT(46), BAR(47),
      FT(48), FT(49), FT(50), FT(51), '', '', FT(54), FT(55), at(56).label, 'How it works']);  // row 56 is a switch now (it was blank)
    eq([38, 39, 40, 46, 48, 49, 50, 51, 54, 55, 56].map(r => sh.validations[`${r},2`].values), [ON_OFF, ON_OFF, ON_OFF, ON_OFF, ON_OFF, ON_OFF, ON_OFF, ON_OFF, ON_OFF, ON_OFF, ON_OFF]);
    assert.ok(!sh.rows.some(r => /old help line|Rows 11-22/.test(String(r[0]))));
    eq(t.bot.readControl_(sh).switches, keysOn([12, 14, 15, 17, 19, 22]));
  });

  test('S-F Burson row: a tab from the build before this one (switches in rows 11-24, row 25 blank, "How it works" from row 26) gets row 25 (and row 26, the Burson test copy, the switches in rows 27-29, 32, 34, 36 and 37, and row 33, the Other alerts space) on its next run, without setup(): blank, saying it isn\'t set; rows 1-24 stay exactly as people set them (values, switches ON, dropdowns); "How it works" moves to row 57', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    // The tab as the build before this one made it (row 25 blank, the help from row 26), with switches people set ON
    const people = { 12: 'ON', 15: 'ON', 22: 'ON', 23: 'ON', 24: 'ON' };
    for (let r = 11; r <= 24; r++) sh.rows[r - 1][1] = people[r] || 'OFF';
    sh.rows = sh.rows.slice(0, 24);
    sh.rows[24] = [''];
    sh.rows[25] = ['How it works'];
    ['• old help line 1', '• Rows 11-24 are switches…', '• Post in S-F Burson: …'].forEach((line, i) => { sh.rows[26 + i] = [line]; });
    t.set('B2', 'ON');
    const before = JSON.stringify(sh.rows.slice(0, 24).map((r, i) => (i === 4 || i === 5 ? [r[0]] : r.slice(0, 2))));
    const lists0 = lists(sh);
    t.poll();
    eq(JSON.stringify(sh.rows.slice(0, 24).map((r, i) => (i === 4 || i === 5 ? [r[0]] : r.slice(0, 2)))), before);  // B5:B6 are the bot's
    eq(cells(sh, 25), ['S-F Burson space', '', B.ev('SFB_BLANK_NOTE_')]);
    eq([cells(sh, 26), cells(sh, 27), cells(sh, 28), cells(sh, 29), cells(sh, 30).slice(0, 2), cells(sh, 31), cells(sh, 32),
      cells(sh, 33), cells(sh, 34), cells(sh, 35), cells(sh, 36), cells(sh, 37), cells(sh, 38), cells(sh, 39), cells(sh, 40),
      cells(sh, 41), cells(sh, 42), cells(sh, 43), cells(sh, 44), cells(sh, 45), cells(sh, 46), cells(sh, 47), cells(sh, 48),
      cells(sh, 49), cells(sh, 50), cells(sh, 51), cells(sh, 52), cells(sh, 53), cells(sh, 54), cells(sh, 55), cells(sh, 56),
      sh.cell(57, 1), sh.cell(58, 1)],
    [['Burson test copy', '', B.ev('RTC_BLANK_NOTE_')], ['Draft follow-ups', 'OFF', B.switchOffText_(at(27))],
      ['Draft answers to questions', 'OFF', B.switchOffText_(at(28))], ['Safety valve', 'OFF', valveC(NO_SFB)],
      ['Testing: send to', ''], ['BigQuery lookback', '60 minutes', LOOKBACK_60], SW32(), OS33(), SW34(), WA35(), TC36(), GT37(), FT(38), FT(39), FT(40),
      BAR(41), BAR(42), BAR(43), BAR(44), BAR(45), FT(46), BAR(47), FT(48),
      FT(49), FT(50), FT(51), BLANK, BLANK, FT(54), FT(55), FT(56), 'How it works', B.ev('CONTROL_HELP_')[0]]);  // row 56 is a switch now (it was blank)
    assert.ok(!sh.rows.some(r => /old help line|Rows 11-24 are switches…/.test(String(r[0]))));
    // no dropdown moved or dropped; only the new switches', the BigQuery lookback's, Watch alerts', and the bar rows' (B25 and B26 have none: a space goes there)
    eq(lists(sh), Object.assign({}, lists0, { '27,2': ON_OFF, '28,2': ON_OFF, '29,2': ON_OFF, '31,2': LOOKBACK, '32,2': ON_OFF, '34,2': ON_OFF,
      '35,2': WA_CHOICES, '36,2': ON_OFF, '37,2': ON_OFF, '38,2': ON_OFF, '39,2': ON_OFF, '40,2': ON_OFF }, BAR_VALS, { '46,2': ON_OFF, '48,2': ON_OFF, '49,2': ON_OFF, '50,2': ON_OFF, '51,2': ON_OFF,
      '54,2': ON_OFF, '55,2': ON_OFF }));
    eq(t.bot.readControl_(sh).switches, keysOn([12, 15, 22, 23, 24]));
    eq([t.bot.readControl_(sh).sfBurson, t.get('B5')], ['', '⚠️ S-F Burson space (B25) is blank: paste S-F Burson\'s link there. Until then the Relay (row 22) is paused.']);
    // Someone pastes S-F Burson there: kept through setup() and later runs, and read
    t.set('B25', 'https://chat.google.com/room/AAQAaa_0I9g');
    t.bot.setup();
    t.poll();
    eq([sh.cell(25, 2), sh.cell(25, 3), t.bot.readControl_(sh).sfBurson, sh.cell(57, 1)],
      ['https://chat.google.com/room/AAQAaa_0I9g', '✓ [S-F] Burson Automated Alerts V3', 'https://chat.google.com/room/AAQAaa_0I9g', 'How it works']);
  });

  test('C1: no code path sets a switch ON: the switch list has no defaults, and neither applySwitchDefaults_ nor the SWITCH_DEFAULTS property is used', () => {
    const fs = require('fs');
    const path = require('path');
    eq(SWITCHES.filter(s => 'byDefault' in s).map(s => s.key), []);
    eq([B.ev('typeof applySwitchDefaults_'), B.ev('typeof SWITCH_DEFAULTS_PROP_'), B.ev('typeof SWITCH_DEFAULTS_VERSION_')],
      ['undefined', 'undefined', 'undefined']);
    const dir = path.join(__dirname, '..');
    const src = fs.readdirSync(dir).filter(f => /\.gs$/.test(f)).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    assert.ok(!/applySwitchDefaults_|byDefault|Property\(\s*['"]SWITCH_DEFAULTS/.test(src));
    // the only value the bot writes in column B of a switch row is OFF (a row it adds or repairs)
    const t = e2e();
    t.bot.setup();
    eq(B.switchRows_().map(r => t.control().cell(r, 2)), Array(32).fill('OFF'));  // 32 switches now: row 56 is one too
  });
};
