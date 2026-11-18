// BigQuery lookback (Control tab row 31, BqLookback.gs): how far back Direct BigQuery alerts (row 15) and the Early wave
// check (row 19) look. B31 is a strict 15 / 30 / 45 / 60 minutes dropdown (setAllowInvalid(false) rejects 0 and arbitrary
// entries in the Sheet UI; programmatic or legacy inputs are clamped to 15-60 minutes, with blank/0/unreadable falling back
// to 60); C31 says what the bot uses. A tab from before the row gets it on its next run at 60 minutes, an older 3-item /
// allow-invalid dropdown upgrades in place once, and "How it works" sits at row 38 (below row 32's switch, row 33, the
// Other alerts space, row 34's switch, row 35, Watch alerts, and row 36's switch). poll() puts it in the run's
// settings.bq_lookback_minutes, and every Direct BigQuery query and the early wave query carry it as the INT64 parameter
// `minutes` (BqLookback.gs bqLookbackMinutes_ holds it to 15-60 again).
'use strict';

module.exports = H => {
  const { test, eq, assert, B, e2e } = H;

  const MIN = 60 * 1000;
  const CHOICES = ['15 minutes', '30 minutes', '45 minutes', '60 minutes'];  // B31's strict 15-minute dropdown
  const USING = 'Direct BigQuery alerts (row 15) and Early detection (row 19) look at posts from ';
  const OK_60 = `✓ ${USING}the last hour`;
  const OK_45 = `✓ ${USING}the last 45 minutes`;
  const OK_30 = `✓ ${USING}the last 30 minutes`;
  const OK_15 = `✓ ${USING}the last 15 minutes`;
  const BLANK_NOTE = `Blank: ${USING}the last hour (choose 15, 30, 45 or 60 minutes)`;
  const unreadable = text => `⚠️ Couldn't read "${text}": ${USING}the last hour. Choose 15, 30, 45 or 60 minutes.`;
  const tooLong = n => `⚠️ ${n} minutes is more than the longest lookback (60): ${USING}the last hour`;
  const tooShort = n => `⚠️ ${n} minutes is less than the shortest lookback (15): ${USING}the last 15 minutes`;
  const timeCell = (h, m) => new Date(1899, 11, 30, h, m);  // how Sheets hands back a time typed in a cell (0:45)
  const isDate = v => Object.prototype.toString.call(v) === '[object Date]';
  const row = (sh, r) => [1, 2, 3].map(c => sh.cell(r, c));
  const lists = sh => Object.fromEntries(Object.entries(sh.validations).map(([k, v]) => [k, v && v.values]));
  // Row 32: the "Work directly in B25" switch (Control.gs), OFF, as every tab gets it
  const SW32 = () => { const s = B.ev('CONTROL_SWITCHES_').find(x => x.row === 32); return [s.label, 'OFF', B.switchOffText_(s)]; };
  // Row 33: the Other alerts space (OtherSpace.gs), blank, as every tab gets it
  const OS33 = () => [B.ev('OS_LABEL_'), '', B.ev('OS_HINT_')];
  // Row 34: the "Proactive watch" switch (Control.gs), OFF, as every tab gets it
  const SW34 = () => { const s = B.ev('CONTROL_SWITCHES_').find(x => x.row === 34); return [s.label, 'OFF', B.switchOffText_(s)]; };
  // Row 35: Watch alerts (WatchAlerts.gs), OFF, as every tab gets it
  const WA35 = () => [B.ev('PW_ALERTS_LABEL_'), 'OFF', B.pwAlertsOffText_()];
  // Row 36: the "Temp checks" switch (Control.gs, TempCheck.gs), OFF, as every tab gets it
  const TC36 = () => { const s = B.ev('CONTROL_SWITCHES_').find(x => x.row === 36); return [s.label, 'OFF', B.switchOffText_(s)]; };
  // Row 37: the "Group test emails" switch (Control.gs, BrandSafetyGroups.gs), OFF, as every tab gets it
  const GT37 = () => { const s = B.ev('CONTROL_SWITCHES_').find(x => x.row === 37); return [s.label, 'OFF', B.switchOffText_(s)]; };
  // Rows 38-40, 46: Fast triage and early_wave BigQuery switches (Control.gs, FastTriage.gs), OFF, as every tab gets them
  const BLANK = ['', '', ''];  // rows 52-53 (left to people): blank, "How it works" from row 57 (row 56 is a switch now: FT(56))
  const FT = r => { const s = B.ev('CONTROL_SWITCHES_').find(x => x.row === r); return [s.label, 'OFF', B.switchOffText_(s)]; };
  const BAR_SPECS = B.ev('FT_BAR_SPECS_');
  const BAR = r => { const s = BAR_SPECS.find(x => x.row === r); return [s.label, s.seedText, B.ftBarFrom_(s, s.seedText).note]; };
  const BAR_VALS = Object.fromEntries(BAR_SPECS.map(s => [`${s.row},2`, s.choices]));

  /** Every write to `sh` from now on: [method, row, col, rows, cols, (the weight or color for a format)]. */
  const spyWrites = sh => {
    const seen = [];
    const get = sh.getRange.bind(sh);
    sh.getRange = (r, c, nr, nc) => {
      const range = get(r, c, nr, nc);
      ['setValues', 'setValue', 'setDataValidation', 'setFontWeight', 'setBackground', 'clearContent'].forEach(m => {
        const orig = range[m];
        range[m] = (...a) => {
          seen.push([m, r, c, nr || 1, nc || 1].concat(m === 'setFontWeight' || m === 'setBackground' ? a : []));
          return orig(...a);
        };
      });
      return range;
    };
    return seen;
  };
  /**
   * setup(), then the Control tab as the build before this row left it: rows 1-30 as setup() made them, row 31 blank,
   * "How it works" from row 32 (that build's help: no line for B31, and a line this build's help doesn't have), and no
   * dropdown on B31.
   */
  const olderTab = () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    const oldHelp = B.ev('CONTROL_HELP_').filter(l => !/^• BigQuery lookback/.test(l)).concat(['• An old help line']);
    sh.rows = sh.rows.slice(0, 30);
    sh.rows[30] = [''];
    sh.rows[31] = ['How it works'];
    oldHelp.forEach((l, i) => { sh.rows[32 + i] = [l]; });
    delete sh.validations['31,2'];
    return { t, sh };
  };
  /** A fake BigQuery that answers every query with no rows and records it ({sql, params, types}: values as strings). */
  const fakeBq = g => {
    const calls = [];
    const orig = g.services.UrlFetchApp.fetch;
    g.services.UrlFetchApp.fetch = (url, params) => {
      if (!String(url).startsWith('https://bigquery.googleapis.com/')) return orig(url, params);
      const body = JSON.parse(params.payload);
      calls.push({ sql: body.query || '',
        params: Object.fromEntries((body.queryParameters || []).map(p => [p.name, p.parameterValue.value])),
        types: Object.fromEntries((body.queryParameters || []).map(p => [p.name, p.parameterType.type])) });
      const text = JSON.stringify({ jobComplete: true, schema: { fields: [] }, rows: [] });
      return { getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => text };
    };
    return calls;
  };
  // The queries that look back: Direct BigQuery alerts' Sprinklr, BMIE (a US query each) and BSIP (us-central1) queries,
  // and EarlyWaveSource's US and us-central1 queries (which start at B31 on the first check and advance incrementally)
  const kindOf = c => (/sprinklr_candidates AS/.test(c.sql) ? 'spr' : /bmie_candidates AS/.test(c.sql) ? 'bmie'
    : /"BSIP" AS source_kind/.test(c.sql) ? 'bsip'
      : /sprinklr_inbound_comments/.test(c.sql) && /'post' AS kind/.test(c.sql) ? 'ew_us'
        : /sonar_raw/.test(c.sql) && /'post' AS kind/.test(c.sql) ? 'ew_c1' : '?');

  // ===========================================================================================================
  // What B31 says
  // ===========================================================================================================

  test('BigQuery lookback (B31): bqLookbackFrom_ reads the dropdown\'s 15 / 30 / 45 / 60 minutes and legacy formats ("45", 45, "15 min", "quarter of an hour", "1 hour", "0:15", "0:45", a time cell); blank or 0 falls back to 60; held to 15-60 minutes with C31 saying so', () => {
    const read = raw => { const r = B.bqLookbackFrom_(raw); return [r.minutes, r.blank, r.note]; };
    // blank: 60 minutes, and C31 says what to choose
    ['', '   ', null, undefined].forEach(raw => eq(read(raw), [60, true, BLANK_NOTE], String(raw)));
    // the dropdown's four 15-minute increments starting at 15 minutes
    eq(CHOICES.map(read), [[15, false, OK_15], [30, false, OK_30], [45, false, OK_45], [60, false, OK_60]]);
    // other ways of writing 15, 30, 45, 60 minutes
    ['15', 15, '15 min', '15 mins', '15m', '0.25h', '0:15', 'quarter of an hour', 'a quarter hour', timeCell(0, 15)]
      .forEach(raw => eq(read(raw), [15, false, OK_15], String(raw)));
    ['45', 45, '45 min', '45 mins', '45m', '45 minute', '  45   MINUTES ', '0.75 hours', '0:45', 44.6, timeCell(0, 45)]
      .forEach(raw => eq(read(raw), [45, false, OK_45], String(raw)));
    ['1 hour', '1h', '1 hr', '1 hours', 'an hour', 'One hour', '1:00', 60, timeCell(1, 0)]
      .forEach(raw => eq(read(raw), [60, false, OK_60], String(raw)));
    ['half an hour', 'Half a hour', '30', 30, '0.5h', '0:30', timeCell(0, 30)]
      .forEach(raw => eq(read(raw), [30, false, OK_30], String(raw)));
    // never more than an hour, never less than 15 minutes: held there, and C31 says so
    eq([read('2 hours'), read('90'), read(61), read('1:30'), read(timeCell(2, 0))],
      [[60, false, tooLong(120)], [60, false, tooLong(90)], [60, false, tooLong(61)], [60, false, tooLong(90)], [60, false, tooLong(120)]]);
    eq([read('10 minutes'), read('0:05'), read(14), read('0.1h')],
      [[15, false, tooShort(10)], [15, false, tooShort(5)], [15, false, tooShort(14)], [15, false, tooShort(6)]]);
    // 0, negative, or unreadable: rejected by strict dropdown in UI, and falls back to 60 minutes if set programmatically
    eq([read(0), read('0'), read('0 minutes'), read('soon'), read('forty five minutes'), read('45 seconds'), read('-30'), read(new Date(NaN))],
      [[60, false, unreadable('0')], [60, false, unreadable('0')], [60, false, unreadable('0 minutes')],
        [60, false, unreadable('soon')], [60, false, unreadable('forty five minutes')], [60, false, unreadable('45 seconds')],
        [60, false, unreadable('-30')], [60, false, unreadable('Invalid Date')]]);
    eq(read('about three quarters of an hour, give or take a little'),
      [60, false, unreadable('about three quarters of an hour, give o…')]);
  });

  test('BigQuery lookback: bqLookbackMinutes_ clamps settings.bq_lookback_minutes to 15-60 minutes, and returns 60 when unset, 0, negative, or NaN; bqLookbackText_ says "the last hour" for 60', () => {
    const m = v => B.bqLookbackMinutes_({ bq_lookback_minutes: v });
    eq([15, 30, 45, 60, '45', 44.6].map(m), [15, 30, 45, 60, 45, 45]);
    eq([61, 90, 600, 14, 10, 1].map(m), [60, 60, 60, 15, 15, 15]);
    eq([undefined, null, '', 'abc', 0, -5, NaN].map(m), [60, 60, 60, 60, 60, 60, 60]);
    eq([B.bqLookbackMinutes_(undefined), B.bqLookbackMinutes_(null), B.bqLookbackMinutes_({})], [60, 60, 60]);
    eq([60, 45, 30, 15].map(n => B.bqLookbackText_(n)),
      ['the last hour', 'the last 45 minutes', 'the last 30 minutes', 'the last 15 minutes']);
  });

  // ===========================================================================================================
  // The row
  // ===========================================================================================================

  test('BigQuery lookback row: a tab from before it gets row 31 with strict 15 / 30 / 45 / 60 minutes dropdown (allowInvalid === false), upgrades an older 3-item / allowInvalid dropdown in place once, and moves "How it works" to row 57 (below the row-32 switch, row 33, the Other alerts space, the row-34 switch, row 35, Watch alerts, the row-36..40 switches, the row-41..45 bars, the row-46 switch, the row-47 bar, the row-48..51 switches, the blank rows 52-53, the row-54..55 switches and the blank row 56)', () => {
    const { t, sh } = olderTab();
    t.bot.ensureSwitchRows_(sh);  // as every run does first (poll(), setup()): rows 32, 34, 36-40, 46, 48-51, 54 and 55's switches go where the old help was
    const before = JSON.stringify(sh.rows.slice(0, 30));
    const lists0 = lists(sh);
    const writes = spyWrites(sh);
    t.bot.ensureBqLookbackRow_(sh);
    t.bot.ensureOtherSpaceRow_(sh);  // as every run does next: row 33 goes where the old help was
    t.bot.ensureWatchAlertsRow_(sh);  // and row 35 (Watch alerts, OFF)
    t.bot.ensureFtBarRows_(sh);  // and rows 41-45 and 47 (the fast-triage and early-watch bars)
    eq(row(sh, 31), ['BigQuery lookback', '60 minutes', OK_60]);
    eq([sh.validations['31,2'].values, sh.validations['31,2'].allowInvalid], [CHOICES, false]);
    eq(lists(sh), Object.assign({}, lists0, { '31,2': CHOICES, '35,2': B.ev('PW_ALERTS_CHOICES_') }, BAR_VALS));
    assert.ok(writes.some(w => w[0] === 'setFontWeight' && w[1] === 31 && w[2] === 1 && w[5] === 'bold'), 'A31 bold');
    assert.ok(writes.some(w => w[0] === 'setBackground' && w[1] === 31 && w[2] === 2 && w[5] === '#fff8e1'), 'B31 colored');
    const help = B.ev('CONTROL_HELP_');
    eq([row(sh, 32), row(sh, 33), row(sh, 34), row(sh, 35), row(sh, 36), row(sh, 37), row(sh, 38), row(sh, 39), row(sh, 40),
      row(sh, 41), row(sh, 42), row(sh, 43), row(sh, 44), row(sh, 45), row(sh, 46), row(sh, 47), row(sh, 48), row(sh, 49), row(sh, 50), row(sh, 51), row(sh, 52), row(sh, 53), row(sh, 54), row(sh, 55),
      row(sh, 56), sh.cell(57, 1)],
      [SW32(), OS33(), SW34(), WA35(), TC36(), GT37(), FT(38), FT(39), FT(40),
        BAR(41), BAR(42), BAR(43), BAR(44), BAR(45), FT(46), BAR(47), FT(48), FT(49), FT(50), FT(51), BLANK, BLANK, FT(54), FT(55), FT(56), 'How it works']);
    eq(help.map((_, i) => sh.cell(58 + i, 1)), help);
    for (let r = 58 + help.length; r <= Math.max(sh.rows.length, 90); r++) eq(row(sh, r), ['', '', ''], `row ${r}`);
    assert.ok(!sh.rows.some(r => /An old help line/.test(String(r[0]))));
    assert.ok(help.some(l => /^• BigQuery lookback \(B31\): how far back Direct BigQuery alerts and Early detection look: 15, 30, 45 or 60 minutes \(blank: 60; never more than an hour\)\./.test(l)));
    assert.ok(writes.some(w => w[0] === 'setFontWeight' && w[1] === 57 && w[5] === 'bold'), 'the help\'s title bold');
    eq([JSON.stringify(sh.rows.slice(0, 30)) === before, writes.filter(w => w[1] < 31)], [true, []]);
    eq(t.bot.readControl_(sh).bqLookback, '60 minutes');

    // Simulate an existing sheet with the older 3-item allowInvalid=true dropdown and B31 set to '45 minutes':
    // ensureBqLookbackRow_ upgrades the dropdown to strict 4-item allowInvalid=false while preserving B31='45 minutes'
    sh.getRange(31, 2).setValue('45 minutes');
    sh.validations['31,2'] = { values: ['30 minutes', '45 minutes', '60 minutes'], allowInvalid: true,
      getAllowInvalid() { return true; }, getCriteriaValues() { return [['30 minutes', '45 minutes', '60 minutes']]; } };
    writes.length = 0;
    t.bot.ensureBqLookbackRow_(sh);
    eq([sh.cell(31, 2), sh.validations['31,2'].values, sh.validations['31,2'].allowInvalid], ['45 minutes', CHOICES, false]);
    writes.length = 0;
    t.bot.ensureBqLookbackRow_(sh);
    eq(writes, [], 'zero writes once upgraded');

    // The every-minute run, on another older tab, without setup()
    const other = olderTab();
    other.t.poll();
    eq([row(other.sh, 31), row(other.sh, 32), row(other.sh, 33), row(other.sh, 34), row(other.sh, 35), row(other.sh, 36),
      row(other.sh, 37), row(other.sh, 38), row(other.sh, 39), row(other.sh, 40),
      row(other.sh, 41), row(other.sh, 42), row(other.sh, 43), row(other.sh, 44), row(other.sh, 45), row(other.sh, 46),
      row(other.sh, 47), row(other.sh, 48), row(other.sh, 49), row(other.sh, 50), row(other.sh, 51), row(other.sh, 52), row(other.sh, 53), row(other.sh, 54), row(other.sh, 55), row(other.sh, 56),
      other.sh.cell(57, 1), other.sh.validations['31,2'].values,
      other.sh.validations['31,2'].allowInvalid,
      other.t.bot.readControl_(other.sh).bqLookback],
    [['BigQuery lookback', '60 minutes', OK_60], SW32(), OS33(), SW34(), WA35(), TC36(), GT37(), FT(38), FT(39), FT(40),
      BAR(41), BAR(42), BAR(43), BAR(44), BAR(45), FT(46), BAR(47), FT(48), FT(49), FT(50), FT(51), BLANK, BLANK, FT(54), FT(55), FT(56), 'How it works', CHOICES, false,
      '60 minutes']);
    eq(help.map((_, i) => other.sh.cell(58 + i, 1)), help);
  });

  test('BigQuery lookback row: running it again changes nothing (not one write), nor do setup() and later runs: row 31, its strict dropdown and C31 stay as they are', () => {
    const { t, sh } = olderTab();
    t.bot.ensureBqLookbackRow_(sh);
    const snap = JSON.stringify([sh.rows, lists(sh)]);
    const writes = spyWrites(sh);
    t.bot.ensureBqLookbackRow_(sh);
    eq([writes, JSON.stringify([sh.rows, lists(sh)]) === snap], [[], true]);
    t.bot.setup();
    t.poll();
    t.poll();
    eq([row(sh, 31), sh.validations['31,2'].values, sh.validations['31,2'].allowInvalid, row(sh, 32), row(sh, 33), row(sh, 34), row(sh, 35),
      row(sh, 36), row(sh, 37), row(sh, 38), row(sh, 39), row(sh, 40),
      row(sh, 41), row(sh, 42), row(sh, 43), row(sh, 44), row(sh, 45), row(sh, 46), row(sh, 47), row(sh, 48), row(sh, 49), row(sh, 50), row(sh, 51), row(sh, 52), row(sh, 53), row(sh, 54), row(sh, 55),
      row(sh, 56), sh.cell(57, 1)],
      [['BigQuery lookback', '60 minutes', OK_60], CHOICES, false, SW32(), OS33(), SW34(), WA35(), TC36(), GT37(), FT(38), FT(39), FT(40),
        BAR(41), BAR(42), BAR(43), BAR(44), BAR(45), FT(46), BAR(47), FT(48), FT(49), FT(50), FT(51), BLANK, BLANK, FT(54), FT(55), FT(56), 'How it works']);
    eq(writes.filter(w => w[1] <= 31 && w[1] + w[3] - 1 >= 31), []);
  });

  test('BigQuery lookback row: what someone already put in B31 of a tab from before the row is kept ("15 minutes", "45 minutes", a time cell, even "2 hours"), with C31 saying what the bot makes of it, through setup() and later runs', () => {
    for (const [value, note, minutes] of [['15 minutes', OK_15, 15], ['45 minutes', OK_45, 45], [timeCell(0, 45), OK_45, 45], ['2 hours', tooLong(120), 60]]) {
      const { t, sh } = olderTab();
      sh.getRange(31, 2).setValue(value);
      t.bot.ensureBqLookbackRow_(sh);
      eq(row(sh, 31), ['BigQuery lookback', value, note], String(value));
      assert.ok(isDate(value) ? sh.cell(31, 2) === value : sh.cell(31, 2) === value, `B31 kept as it was: ${value}`);
      eq([sh.validations['31,2'].values, sh.validations['31,2'].allowInvalid], [CHOICES, false], String(value));
      eq(t.bot.bqLookbackFor_(t.bot.readControl_(sh).bqLookback).minutes, minutes, String(value));
      t.bot.setup();
      t.poll();
      eq(row(sh, 31), ['BigQuery lookback', value, note], `after setup() and a run: ${value}`);
    }
  });

  test('BigQuery lookback row: an A31 label someone cleared or changed is put back on the next run, B31 kept (while it\'s missing, B31 isn\'t read); a row cleared entirely starts again at 60 minutes', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    sh.getRange(31, 2).setValue('15 minutes');
    t.poll();
    eq(row(sh, 31), ['BigQuery lookback', '15 minutes', OK_15]);
    for (const label of ['', 'Lookback']) {
      sh.getRange(31, 1).setValue(label);
      eq(t.bot.readControl_(sh).bqLookback, '', `A31 "${label}"`);
      t.poll();
      eq([row(sh, 31), t.bot.readControl_(sh).bqLookback, sh.validations['31,2'].values],
        [['BigQuery lookback', '15 minutes', OK_15], '15 minutes', CHOICES], `A31 "${label}"`);
    }
    sh.getRange(31, 1, 1, 3).setValues([['', '', '']]);
    t.poll();
    eq([row(sh, 31), row(sh, 32), row(sh, 33), row(sh, 34), row(sh, 35), row(sh, 36), row(sh, 37), row(sh, 38), row(sh, 39), row(sh, 40),
      row(sh, 41), row(sh, 42), row(sh, 43), row(sh, 44), row(sh, 45), row(sh, 46), row(sh, 47), row(sh, 48), row(sh, 49), row(sh, 50), row(sh, 51), row(sh, 52), row(sh, 53), row(sh, 54), row(sh, 55),
      row(sh, 56), sh.cell(57, 1)],
      [['BigQuery lookback', '60 minutes', OK_60], SW32(), OS33(), SW34(), WA35(), TC36(), GT37(), FT(38), FT(39), FT(40),
        BAR(41), BAR(42), BAR(43), BAR(44), BAR(45), FT(46), BAR(47), FT(48), FT(49), FT(50), FT(51), BLANK, BLANK, FT(54), FT(55), FT(56), 'How it works']);
  });

  test('BigQuery lookback: readControl_ reads B31 only on the BigQuery lookback row itself (trimmed; a time cell as it is): \'\' when A31 is blank or something else, as on a tab from before the row', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    const read = () => t.bot.readControl_(sh).bqLookback;
    eq(read(), '60 minutes');
    sh.getRange(31, 2).setValue('  15 minutes ');
    eq(read(), '15 minutes');
    sh.getRange(31, 2).setValue(45);
    eq(read(), '45');
    const cell = timeCell(0, 45);
    sh.getRange(31, 2).setValue(cell);
    assert.ok(read() === cell, 'the time cell itself, for bqLookbackFrom_ to read');
    sh.getRange(31, 2).setValue('');
    eq(read(), '');
    sh.getRange(31, 1, 1, 2).setValues([['  BigQuery lookback  ', '30 minutes']]);
    eq(read(), '30 minutes');
    for (const label of ['', '• Don\'t share this sheet with Burson.', 'Lookback']) {
      sh.getRange(31, 1).setValue(label);
      eq(read(), '', `A31 "${label}"`);
    }
  });

  test('BigQuery lookback: bqLookbackFor_ resolves B31 for the run and writes C31 only when it changed; without the sheet, or with one it can\'t write, the run still gets its lookback (the error is logged)', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    const writes = spyWrites(sh);
    eq(t.bot.bqLookbackFor_('60 minutes', sh).minutes, 60);
    eq(writes, []);
    const r = t.bot.bqLookbackFor_('15 minutes', sh);
    eq([r.minutes, r.blank, r.note, sh.cell(31, 3)], [15, false, OK_15, OK_15]);
    assert.ok(writes.length && writes.every(w => w[1] === 31 && w[2] === 3 && w[3] === 1 && w[4] === 1), JSON.stringify(writes));
    writes.length = 0;
    eq(t.bot.bqLookbackFor_('15', sh).minutes, 15);
    eq(writes, []);
    eq([t.bot.bqLookbackFor_('2 hours', null).minutes, sh.cell(31, 3)], [60, OK_15]);
    const broken = { getRange: () => { throw new Error('Service Spreadsheets failed'); } };
    eq(t.bot.bqLookbackFor_('30 minutes', broken).minutes, 30);
    assert.ok(t.g.logs.includes('ERROR could not write C31 (BigQuery lookback): Service Spreadsheets failed'), t.g.logs.slice(-3).join('\n'));
  });

  // ===========================================================================================================
  // End to end
  // ===========================================================================================================

  test('BigQuery lookback end to end (poll()): with Direct BigQuery alerts (row 15) and the Early wave check (row 19) ON, each Direct BigQuery query (Sprinklr, BMIE, BSIP) carries B31 as the INT64 parameter minutes (15 minutes -> 15; 30 minutes -> 30; "2 hours" -> 60; blank -> 60) and the early detection producer starts at B31 on its first check and advances incrementally across subsequent/paused windows; while paused C31 still follows B31', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    sh.getRange(15, 2).setValue('ON');
    sh.getRange(19, 2).setValue('ON');
    const calls = fakeBq(t.g);
    let all = 0;
    let ew = () => '';  // the early detection window this run's check used (BigQuery.gs edLookbackMinutes_)
    const run = wait => {
      t.g.clock.now += wait || 0;
      const from = calls.length;
      const before = Number(t.g.props.get('EARLY_DETECTION_AT')) || 0;
      t.poll();
      const after = Number(t.g.props.get('EARLY_DETECTION_AT')) || 0;
      ew = b31 => String(t.bot.edLookbackMinutes_({ bq_lookback_minutes: b31 }, before, after));
      all = calls.length - from;
      return calls.slice(from).filter(c => kindOf(c) !== '?').map(c => {
        const k = kindOf(c);
        if (k === 'ew_us' || k === 'ew_c1') {
          const span = String(Math.round((Number(c.params.until_ms) - Number(c.params.since_ms)) / MIN));
          return [k, span, c.types.since_ms];
        }
        return [k, c.params.minutes, c.types.minutes];
      });
    };
    const each = (m, span) => [
      ['spr', m, 'INT64'], ['bmie', m, 'INT64'], ['bsip', m, 'INT64'],
      ['ew_us', span || m, 'INT64'], ['ew_c1', span || m, 'INT64'],
    ];

    sh.getRange(31, 2).setValue('15 minutes');
    eq(run(), each('15', '15'));  // the first early detection check: B31 itself (15 min) on both US and us-central1 lanes
    eq([row(sh, 31), t.bot.status().bigquery_lookback], [['BigQuery lookback', '15 minutes', OK_15], '15 minutes (Control tab B31)']);

    sh.getRange(31, 2).setValue('30 minutes');
    const second = run(15 * MIN);
    eq(second.slice(0, 3), [['spr', '30', 'INT64'], ['bmie', '30', 'INT64'], ['bsip', '30', 'INT64']]);
    assert.ok(Number(second[3][1]) >= 15 && Number(second[3][1]) <= 16 && second[3][1] === second[4][1], JSON.stringify(second));
    assert.ok(Number(ew(30)) > 30, ew(30));  // 16 minutes since its last check + 20: nothing between two checks is missed
    eq([row(sh, 31), t.bot.status().bigquery_lookback], [['BigQuery lookback', '30 minutes', OK_30], '30 minutes (Control tab B31)']);

    sh.getRange(31, 2).setValue('2 hours');
    const third = run(15 * MIN);
    eq(third.slice(0, 3), [['spr', '60', 'INT64'], ['bmie', '60', 'INT64'], ['bsip', '60', 'INT64']]);
    eq(ew(60), '60');
    eq([row(sh, 31), t.bot.status().bigquery_lookback], [['BigQuery lookback', '2 hours', tooLong(120)], '60 minutes (Control tab B31)']);

    sh.getRange(31, 2).setValue('');
    const fourth = run(15 * MIN);
    eq(fourth.slice(0, 3), [['spr', '60', 'INT64'], ['bmie', '60', 'INT64'], ['bsip', '60', 'INT64']]);
    eq(row(sh, 31), ['BigQuery lookback', '', BLANK_NOTE]);

    // Paused: nothing is checked, but C31 is kept current
    t.set('B2', 'OFF');
    sh.getRange(31, 2).setValue(timeCell(0, 45));
    eq([run(15 * MIN), all], [[], 0]);
    eq([sh.cell(31, 3), t.get('B5')], [OK_45, '⏸ Paused: Bot is OFF. Set it to ON to restart.']);
    t.set('B2', 'ON');
    const resumed = run(15 * MIN);
    eq(resumed.slice(0, 3), [['spr', '45', 'INT64'], ['bmie', '45', 'INT64'], ['bsip', '45', 'INT64']]);
    assert.ok(Number(resumed[3][1]) >= 30 && resumed[3][1] === resumed[4][1], JSON.stringify(resumed));  // the paused half hour is read too
    assert.ok(Number(ew(45)) > 45, ew(45));
    eq([sh.cell(31, 3), t.get('B5')], [OK_45, '✅ Working']);
  });
};
