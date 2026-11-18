// The new sources' Control rows (Control.gs, Main.gs, EarlyWaveSource.gs, BrandwatchLive.gs): row 48, "Early
// Detection: also read the AMIE table", and row 49, "Early Detection: also read Brandwatch live (not X)", each written
// OFF and never set ON by the bot; "How it works" moved to row 53 (rows 50 and 51 became switches too), then to row 57
// (rows 52-53 left to people, rows 54-55 two more switches, row 56 the blank row above the help); the seam that tells
// Early Detection's source which new rows are ON
// (ewsRunSwitches_, set right after the Control tab is read); and what a row turned OFF forgets (ewsAmieOff_,
// bwLiveOff_). With rows 48 and 49 OFF nothing new happens anywhere; with one ON its source is read (the AMIE table's
// tests are in switch_ed_amie.test.js, Brandwatch live's in switch_bw_live.test.js), and column C says so plainly.
'use strict';

module.exports = H => {
  const { test, eq, assert, B, NOW, e2e, makeGoogle, loadBot } = H;
  const MIN = 60 * 1000;
  const BASE = require('./ed_new_lanes_base_requests.json');
  const LABEL = 'Early Detection: also read the AMIE table';
  const OFF_TEXT = 'OFF (Early Detection does not read the AMIE table)';
  const WAITING = '✓ ON, but waiting: it needs Early wave & velocity check (row 19) ON, which it adds posts to';
  const ON_TEXT = '✓ ON: each Early Detection check also reads new rows of the AMIE table (Brandwatch\'s alert feeds, X with its words)';
  const ON_OFF = ['ON', 'OFF'];
  // row 49 (step 2b of the new sources): Brandwatch live, written OFF
  const LABEL49 = 'Early Detection: also read Brandwatch live (not X)';
  const OFF49 = 'OFF (Early Detection does not call Brandwatch)';
  // row 50 (step 3b): the Watch's AMIE source, written OFF
  const LABEL50 = 'Proactive watch: also read the AMIE table';
  const OFF50 = 'OFF (the Watch does not read the AMIE table)';
  // row 51 (step S2 of the open-engine plan): the open engine, written OFF
  const LABEL51 = 'Open engine: judgment in place of caps';
  const OFF51 = 'OFF (Early Detection, the Watch and Direct BigQuery keep today\'s limits)';
  // row 56 (the run log, RunLog.gs): a switch now, written OFF, where the blank row above the help was
  const LABEL56 = 'Speed numbers: leave out when the bot was not running';
  const OFF56 = 'OFF (the speed numbers count every alert as they always have, and the bot keeps no record of when it was running)';
  const cells = (sh, r) => [1, 2, 3].map(c => sh.cell(r, c));
  const lists = sh => Object.fromEntries(Object.entries(sh.validations).map(([k, v]) => [k, v && v.values]));
  const EWS_COLS = ['kind', 'lane', 'mid', 'url', 'platform', 'author', 'audience', 'eng', 'posted_ms', 'seen_ms', 'txt', 'topic',
    'chash', 'sig', 'risk', 'brand'];

  // A world after setup(), with BigQuery answering every early-wave job at once with no rows; every request body kept.
  const world = () => {
    const t = e2e();
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    const bq = [];
    const orig = t.g.services.UrlFetchApp.fetch;
    t.g.services.UrlFetchApp.fetch = (url, params) => {
      if (!String(url).startsWith('https://bigquery.googleapis.com/')) return orig(url, params);
      const payload = (params && params.payload) || '';
      let body = {};
      try { body = JSON.parse(payload || '{}'); } catch (e) { body = {}; }
      bq.push({ url: String(url), lane: (body.labels && body.labels.lane) || '', location: body.location, payload, method: (params && params.method) || 'get' });
      return {
        getResponseCode: () => 200,
        getHeaders: () => ({}),
        getContentText: () => JSON.stringify({
          jobComplete: true,
          jobReference: { projectId: 'brand-social-central-data', jobId: `job_${bq.length}`, location: body.location || 'US' },
          schema: { fields: EWS_COLS.map(name => ({ name, type: 'STRING' })) },
          rows: [],
        }),
      };
    };
    return { t, bq, sh: t.control() };
  };
  // Early Detection's jobs (each names its lane in a label: 'us', 'c1', or a new source's); the bot's other BigQuery
  // reads (sends, alerts) are not Early Detection's
  const jobs = w => w.bq.filter(c => c.method === 'post' && /\/queries$/.test(c.url) && c.lane);
  // anything sent to Secret Manager or Brandwatch, a BigQuery table read (tables.get) or a dry run, or naming the AMIE table
  const newCalls = w => w.t.g.fetches.filter(f => /secretmanager|api\.brandwatch\.com|\/tables\//.test(f.url))
    .concat(w.bq.filter(c => /all_sundar_mentions|"dryRun"/.test(c.payload + c.url)));
  const newState = w => {
    const names = Array.from(w.t.g.props.keys()).concat(Array.from(w.t.g.cache.keys()));
    return names.filter(n => /^EWS_SRC_DAY$|^BWL_|^ews1:(carry|nk:|sn:|xb|ak|bwl)/.test(n));
  };

  // -----------------------------------------------------------------------------------------------------------------
  // E27: the row, its help line, and the help at row 57
  // -----------------------------------------------------------------------------------------------------------------

  test('new sources control (E27): a new Control tab has row 48, "Early Detection: also read the AMIE table", OFF with its ON / OFF dropdown and what OFF means in C48 (starting "OFF ("), row 49 (Brandwatch live) the same; rows 52-53 are blank and "How it works" is at row 57 with a help line for each row', () => {
    const { t, sh } = world();
    eq(cells(sh, 48), [LABEL, 'OFF', OFF_TEXT]);
    assert.match(sh.cell(48, 3), /^OFF \(/);
    eq(sh.validations['48,2'].values, ON_OFF);
    // row 56 is a switch now (RunLog.gs), OFF, no longer blank
    eq([cells(sh, 49), cells(sh, 50), cells(sh, 51), cells(sh, 52), cells(sh, 53), cells(sh, 56), sh.cell(57, 1)],
      [[LABEL49, 'OFF', OFF49], [LABEL50, 'OFF', OFF50], [LABEL51, 'OFF', OFF51], ['', '', ''], ['', '', ''], [LABEL56, 'OFF', OFF56], 'How it works']);
    eq([sh.validations['49,2'].values, sh.validations['50,2'].values, sh.validations['51,2'].values, sh.validations['52,2'], sh.validations['53,2']],
      [ON_OFF, ON_OFF, ON_OFF, undefined, undefined]);
    // (row 56's switch, speedHonest, comes after these: they are the ones before it)
    eq([B.ev('CONTROL_HELP_ROW_'), B.switchRows_().slice(-8, -1), B.ev('CONTROL_SWITCHES_').slice(-7, -1).map(s => s.key)],
      [57, [46, 48, 49, 50, 51, 54, 55], ['edAmie', 'edBwLive', 'watchAmie', 'openEngine', 'liveDashboard', 'slideDeliveries']]);
    const help = B.ev('CONTROL_HELP_');
    eq(help.map((_, i) => sh.cell(58 + i, 1)), help);
    assert.ok(B.ev('CONTROL_HELP_ROWS_') >= help.length + 1, 'the rows kept for the help hold its title and every line');
    const line = help.filter(l => l.startsWith(`• ${LABEL}: `));
    eq(line.length, 1);
    assert.match(line[0], /row 48, OFF until you turn it ON; it needs Early wave & velocity check \(row 19\) ON/);
    assert.match(line[0], /never go to S-F Burson/);
    assert.ok(help.some(l => /^• Rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 are switches/.test(l)));  // now ends "54, 55 and 56"
    assert.ok(help.some(l => /^• Early wave & velocity check: row 19.*with row 48 or 49 ON, posts from the AMIE table or Brandwatch can start a story too/.test(l)));
    const line49 = help.filter(l => l.startsWith(`• ${LABEL49}: `));
    eq(line49.length, 1);
    assert.match(line49[0], /row 49, OFF until you turn it ON; it needs Early wave & velocity check \(row 19\) ON/);
    assert.match(line49[0], /never X and never LinkedIn/);
    assert.match(line49[0], /never go to S-F Burson/);
    // every switch's OFF text starts "OFF (" and every label has its help line (row 48's too)
    B.ev('CONTROL_SWITCHES_').forEach(s => {
      assert.match(B.switchOffText_(s), /^OFF \(/, s.key);
      assert.ok(help.some(l => l.startsWith(`• ${s.label}: `)), s.label);
    });
    // a run keeps it so: OFF, C48 the OFF text, the switch read as OFF
    t.poll();
    eq([cells(sh, 48), t.bot.readControl_(sh).switches.edAmie], [[LABEL, 'OFF', OFF_TEXT], false]);
  });

  test('new sources control (E27): a Control tab from before row 48 (row 48 blank, "How it works" at row 49, help lines from row 50) gets rows 48-51 OFF on its next run without setup(); rows 52-53 are left blank (no old help text), the help is at row 57, and no row from 11 to 47 moves or changes (values people set, switches ON, dropdowns)', () => {
    const { t, sh } = world();
    // the tab as the build before this one left it: row 48 blank, "How it works" at row 49, its help from row 50
    const oldHelp = B.ev('CONTROL_HELP_').filter(l => !l.startsWith(`• ${LABEL}: `) && !l.startsWith(`• ${LABEL49}: `) && !l.startsWith(`• ${LABEL50}: `) && !l.startsWith(`• ${LABEL51}: `)).concat(['• An old help line']);
    sh.rows = sh.rows.slice(0, 47);
    sh.rows[47] = [''];
    sh.rows[48] = ['How it works'];
    oldHelp.forEach((l, i) => { sh.rows[49 + i] = [l]; });
    delete sh.validations['48,2'];
    // what people set above it: switches ON, a bar, the lookback
    sh.getRange(19, 2).setValue('ON');
    sh.getRange(46, 2).setValue('ON');
    sh.getRange(34, 2).setValue('ON');
    sh.getRange(45, 2).setValue('4');
    sh.getRange(31, 2).setValue('30 minutes');
    const above = () => sh.rows.slice(10, 47).map(r => [r[0], r[1]]);
    const before = JSON.stringify(above());
    const lists0 = lists(sh);
    t.poll();
    eq(JSON.stringify(above()), before);
    eq(lists(sh), Object.assign({}, lists0, { '48,2': ON_OFF, '49,2': ON_OFF }));
    eq(cells(sh, 48), [LABEL, 'OFF', OFF_TEXT]);
    // row 56 is a switch now (RunLog.gs): written OFF over the old help line there
    eq([cells(sh, 49), cells(sh, 50), cells(sh, 51), cells(sh, 52), cells(sh, 53), cells(sh, 56), sh.cell(57, 1)],
      [[LABEL49, 'OFF', OFF49], [LABEL50, 'OFF', OFF50], [LABEL51, 'OFF', OFF51], ['', '', ''], ['', '', ''], [LABEL56, 'OFF', OFF56], 'How it works']);
    const help = B.ev('CONTROL_HELP_');
    eq(help.map((_, i) => sh.cell(58 + i, 1)), help);
    for (let r = 58 + help.length; r <= sh.rows.length; r++) eq(cells(sh, r), ['', '', ''], `row ${r}`);
    assert.ok(!sh.rows.some(r => /An old help line/.test(String(r[0]))));
    eq(sh.rows.filter(r => String(r[0]).trim() === 'How it works').length, 1);
    eq(t.bot.readControl_(sh).switches, Object.assign(B.switchesOff_(), { earlyWave: true, proactiveWatch: true, earlyWaveBq: true }));

    // a person's ON is kept through setup() and more runs; so is their OFF afterwards: the bot writes only OFF
    sh.getRange(48, 2).setValue('ON');
    t.bot.setup();
    t.poll();
    t.poll();
    eq([sh.cell(48, 2), t.bot.readControl_(sh).switches.edAmie, sh.cell(57, 1)], ['ON', true, 'How it works']);
    sh.getRange(48, 2).setValue('OFF');
    t.bot.setup();
    t.poll();
    eq([sh.cell(48, 2), sh.cell(48, 3)], ['OFF', OFF_TEXT]);
    // a label someone cleared is put back, OFF (the row reads OFF until then)
    sh.getRange(48, 1, 1, 2).setValues([['', 'ON']]);
    eq(t.bot.readControl_(sh).switches.edAmie, false);
    t.poll();
    eq(cells(sh, 48), [LABEL, 'OFF', OFF_TEXT]);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The help at row 57 (rows 48-51 the new sources' and the open engine's switches, rows 52-53 left to people, rows 54-55
  // the live dashboard's and the slide deliveries' switches, row 56 the blank row above it): one move for every live
  // tab, at its next run, without setup(). Only the bot's own old help is cleared from rows 52-56 (never a switch row);
  // a person's cells stay.
  // -----------------------------------------------------------------------------------------------------------------

  // The help lines rows 54, 55 and 56 added (the live dashboard, the slide deliveries, the run log): no earlier build had them
  const NEW54 = l => l.startsWith('• Live dashboard: ') || l.startsWith('• Slide deliveries: ') || l.startsWith(`• ${LABEL56}: `);
  // The first build's help lines: today's, without rows 48-51's, 54's and 55's lines and without what row 48 added to
  // two lines
  const firstBuildHelp = () => B.ev('CONTROL_HELP_')
    .filter(l => !l.startsWith(`• ${LABEL}: `) && !l.startsWith(`• ${LABEL49}: `) && !l.startsWith(`• ${LABEL50}: `) && !l.startsWith(`• ${LABEL51}: `) && !NEW54(l))
    .map(l => l.replace('; with row 48 or 49 ON, posts from the AMIE table or Brandwatch can start a story too', '')
      .replace('36-40, 46, 48-51, 54, 55 and 56 are switches', '36-40 and 46 are switches'));
  // A person's cells beside the old help: columns B and C of rows 52 and 53 (rows 49 to 51 are switches since steps 2b and
  // 3b of the new sources and S2 of the open engine, and rows 54 and 55 since the live dashboard and the slide
  // deliveries: their A to C are written as every new switch row's are; rows 52 and 53 never are), and one column-A note
  // of their own in row 52
  const PEOPLE = { '52,2': 'note B52', '52,3': 'note C52', '53,2': 'note B53', '53,3': 'note C53' };
  const putPeople = sh => Object.entries(PEOPLE).forEach(([k, v]) => { const [r, c] = k.split(',').map(Number); sh.getRange(r, c).setValue(v); });
  const peopleKept = sh => Object.keys(PEOPLE).map(k => { const [r, c] = k.split(',').map(Number); return sh.cell(r, c); });
  const helpAt57 = (sh, when) => {
    const help = B.ev('CONTROL_HELP_');
    eq([B.ev('CONTROL_HELP_ROW_'), sh.cell(57, 1)], [57, 'How it works'], when);
    eq(help.map((_, i) => sh.cell(58 + i, 1)), help, when);
    eq(sh.rows.filter(r => String(r[0]).trim() === 'How it works').length, 1, when);
  };

  test('new sources control (help at row 57): a tab from the first build ("How it works" at row 49, the first build\'s help lines from row 50, row 48 blank) gets rows 48-51 OFF, rows 52-53 with no old help, rows 54-55 OFF and the help at row 57 at its next run without setup(); the old help is cleared only where it was (a person\'s note in A52 and their cells in B52:C53 stay); rows 11-47 do not change', () => {
    const { t, sh } = world();
    const old = firstBuildHelp();
    eq(old.length, 46);  // today's 52 lines less rows 48-51's, 54's and 55's
    assert.ok(old.some(l => l.startsWith('• The Early Detection tab lists every story')), 'the first build\'s line for its tab');
    sh.rows = sh.rows.slice(0, 47);
    sh.rows[47] = [''];
    sh.rows[48] = ['How it works'];
    old.forEach((l, i) => { sh.rows[49 + i] = [l]; });
    delete sh.validations['48,2'];
    putPeople(sh);
    sh.getRange(52, 1).setValue('Ask the leads before turning row 19 ON');  // a person's own note over an old help line
    sh.getRange(19, 2).setValue('ON');
    const above = () => JSON.stringify(sh.rows.slice(10, 47).map(r => [r[0], r[1]]));
    const before = above();
    t.poll();
    eq(above(), before);
    eq(cells(sh, 48), [LABEL, 'OFF', OFF_TEXT]);
    eq(sh.validations['48,2'].values, ON_OFF);
    eq([sh.cell(49, 1), sh.cell(50, 1), sh.cell(51, 1), sh.cell(52, 1), sh.cell(53, 1), sh.cell(54, 1), sh.cell(55, 1), sh.cell(56, 1)],
      [LABEL49, LABEL50, LABEL51, 'Ask the leads before turning row 19 ON', '', 'Live dashboard', 'Slide deliveries', LABEL56]);  // row 56 is a switch now
    eq(cells(sh, 49), [LABEL49, 'OFF', OFF49]);
    eq(peopleKept(sh), Object.values(PEOPLE));
    helpAt57(sh, 'first build');
    assert.ok(!sh.rows.slice(48, 56).some(r => /^•/.test(String(r[0]))), 'no old help line in rows 49-56');
    eq(t.bot.readControl_(sh).switches, Object.assign(B.switchesOff_(), { earlyWave: true }));
    // and it stays so: setup() and more runs change nothing there
    t.bot.setup();
    t.poll();
    eq([sh.cell(49, 1), sh.cell(50, 1), sh.cell(51, 1), sh.cell(52, 1), sh.cell(53, 1)], [LABEL49, LABEL50, LABEL51, 'Ask the leads before turning row 19 ON', '']);
    eq(peopleKept(sh), Object.values(PEOPLE));
    helpAt57(sh, 'after setup()');
  });

  test('new sources control (help at row 57): a tab with the help at row 52 (rows 49-51 blank, as the first stage of the new sources wrote it) gets the help at row 57 at its next run without setup(); row 52\'s old title is cleared, a person\'s cells in B52:C53 stay, rows 49 to 51 get their switches, and row 48 keeps a person\'s ON', () => {
    const { t, sh } = world();
    const help = B.ev('CONTROL_HELP_');
    const stage1Help = help.filter(l => !l.startsWith(`• ${LABEL49}: `) && !l.startsWith(`• ${LABEL50}: `) && !l.startsWith(`• ${LABEL51}: `) && !NEW54(l));
    sh.rows = sh.rows.slice(0, 48);
    sh.rows[48] = [''];
    sh.rows[49] = [''];
    sh.rows[50] = [''];
    sh.rows[51] = ['How it works'];
    stage1Help.forEach((l, i) => { sh.rows[52 + i] = [l]; });
    putPeople(sh);
    sh.getRange(48, 2).setValue('ON');
    const above = () => JSON.stringify(sh.rows.slice(10, 48).map(r => [r[0], r[1]]));
    const before = above();
    t.poll();
    eq(above(), before);
    eq([sh.cell(48, 2), t.bot.readControl_(sh).switches.edAmie], ['ON', true]);
    eq([sh.cell(49, 1), sh.cell(50, 1), sh.cell(51, 1), sh.cell(52, 1), sh.cell(53, 1), sh.cell(54, 1), sh.cell(55, 1), sh.cell(56, 1)],
      [LABEL49, LABEL50, LABEL51, '', '', 'Live dashboard', 'Slide deliveries', LABEL56]);  // row 56 is a switch now
    eq(peopleKept(sh), Object.values(PEOPLE));
    helpAt57(sh, 'help at row 52');
    for (let r = 58 + help.length; r <= sh.rows.length; r++) eq(cells(sh, r), ['', '', ''], `row ${r}`);
  });

  test('new sources control (help at row 57): a new tab has rows 49 to 51 OFF, rows 52-53 blank, rows 54-55 OFF, row 56 OFF (a switch now; it was blank) and the help at row 57; writing the help again writes nothing in rows 49-56', () => {
    const { t, sh } = world();
    eq([cells(sh, 49), cells(sh, 50), cells(sh, 51), cells(sh, 52), cells(sh, 53), cells(sh, 56)],
      [[LABEL49, 'OFF', OFF49], [LABEL50, 'OFF', OFF50], [LABEL51, 'OFF', OFF51], ['', '', ''], ['', '', ''], [LABEL56, 'OFF', OFF56]]);
    helpAt57(sh, 'new tab');
    const writes = [];
    const orig = sh.getRange.bind(sh);
    sh.getRange = (r, c, nr, nc) => {
      const range = orig(r, c, nr, nc);
      const set = range.setValues.bind(range);
      range.setValues = v => { writes.push([r, c, v.length]); return set(v); };
      range.setValue = v => range.setValues([[v]]);
      return range;
    };
    t.bot.writeControlHelp_(sh);
    sh.getRange = orig;
    eq(writes, [[57, 1, B.ev('CONTROL_HELP_ROWS_')]]);
    helpAt57(sh, 'written again');
  });

  // A person's text in column A of the rows the help moves over (rows 96-100: below the first build's help, which ended
  // at row 95, or below the first stage's, which ended at row 98) is kept below the help, unchanged and in order
  const notesBelow = (sh, end) => sh.rows.slice(end).map(r => r[0]).filter(v => String(v === undefined ? '' : v).trim() !== '');
  const helpEnd = () => 57 + B.ev('CONTROL_HELP_ROWS_') - 1;

  test('new sources control (help at row 57): on a tab from the first build, a person\'s notes in A96 and A97 (below its help, which ended at row 95) are kept below the help at its next run, unchanged and in order, and the log says where they went; their notes in B96, A101, A102, B60 and C70 do not change; a second run and setup() change nothing', () => {
    const { t, sh } = world();
    const old = firstBuildHelp();
    sh.rows = sh.rows.slice(0, 47);
    sh.rows[47] = [''];
    sh.rows[48] = ['How it works'];
    old.forEach((l, i) => { sh.rows[49 + i] = [l]; });
    eq(sh.rows.length, 95);
    delete sh.validations['48,2'];
    const notes = { '96,1': 'note A96', '97,1': 'note A97', '96,2': 'note B96', '101,1': 'note A101', '102,1': 'note A102',
      '60,2': 'note B60', '70,3': 'note C70' };
    Object.entries(notes).forEach(([k, v]) => { const [r, c] = k.split(',').map(Number); sh.getRange(r, c).setValue(v); });
    t.g.logs.length = 0;
    t.poll();
    eq(helpEnd(), 110);  // (100 before rows 49-51's help lines, 103 before rows 54-55's, 109 before row 56's: the help area grows by a row for each new switch's line, and it starts at row 57)
    helpAt57(sh, 'first build with notes');
    eq([sh.cell(96, 2), sh.cell(60, 2), sh.cell(70, 3)], ['note B96', 'note B60', 'note C70']);
    // row 56's help line moved the help's end from row 109 to 110, so the notes land one row lower (A111-A114, not A110-A113)
    eq(notesBelow(sh, 110), ['note A96', 'note A97', 'note A101', 'note A102']);
    eq([sh.cell(111, 1), sh.cell(112, 1), sh.cell(113, 1), sh.cell(114, 1)], ['note A96', 'note A97', 'note A101', 'note A102']);
    eq(t.g.logs.filter(l => /person's text there was kept below it/.test(l)),
      ['Control tab: "How it works" now fills rows 57-110 of column A; a person\'s text there was kept below it (A96 to A111, A97 to A112, A101 to A113, A102 to A114)']);
    const snap = JSON.stringify(sh.rows.slice(47));  // row 48 down (the status rows above change each run)
    t.poll();
    eq(JSON.stringify(sh.rows.slice(47)), snap, 'a second run');
    t.bot.setup();
    t.poll();
    eq(JSON.stringify(sh.rows.slice(47)), snap, 'setup() and a run');
  });

  test('new sources control (help at row 57): on a tab with the help at row 52 as the first stage of the new sources wrote it (46 lines, to row 98), a person\'s notes in A99 and A100 are kept below the help at its next run, in the first blank cells of column A below row 100 (a blank A101 first, then past the last row), unchanged and in order; a second run changes nothing', () => {
    const { t, sh } = world();
    const stage1 = B.ev('CONTROL_HELP_').filter(l => !l.startsWith('• The Early Detection tab lists every story') && !l.startsWith(`• ${LABEL49}: `) && !l.startsWith(`• ${LABEL50}: `) && !l.startsWith(`• ${LABEL51}: `) && !NEW54(l));
    eq(stage1.length, 46);
    sh.rows = sh.rows.slice(0, 48);
    sh.rows[48] = [''];
    sh.rows[49] = [''];
    sh.rows[50] = [''];
    sh.rows[51] = ['How it works'];
    stage1.forEach((l, i) => { sh.rows[52 + i] = [l]; });
    eq(sh.rows.length, 98);
    sh.getRange(99, 1).setValue('note A99');
    sh.getRange(100, 1).setValue(42);
    sh.getRange(101, 2).setValue('note B101');  // A101 is blank: the first note goes there
    sh.getRange(102, 1).setValue('note A102');
    t.poll();
    helpAt57(sh, 'first stage with notes');
    // (with the help to row 110 since it moved to row 57 and row 56 became a switch (it ended at row 109 before),
    // A101 and A102 are the help's: the notes go below it, one row lower than before)
    eq([sh.cell(101, 2), sh.cell(111, 1), sh.cell(112, 1), sh.cell(113, 1)], ['note B101', 'note A99', 42, 'note A102']);
    eq(notesBelow(sh, 110), ['note A99', 42, 'note A102']);
    const snap = JSON.stringify(sh.rows.slice(47));  // row 48 down (the status rows above change each run)
    t.poll();
    eq(JSON.stringify(sh.rows.slice(47)), snap, 'a second run');
  });

  test('new sources control (help at row 57): a person\'s own line that starts with "•" is theirs, not old help: in A51 above the help at row 52 it stays, and in A100 below it (after a blank row) it is kept below the new help; the bot\'s own old help lines, in today\'s words or an earlier build\'s, are still cleared from rows 52-56 and written over from row 57', () => {
    eq([B.controlHelpOwn_('How it works'), B.controlHelpOwn_(B.ev('CONTROL_HELP_')[0]), B.controlHelpOwn_('• my own bullet note'),
      B.controlHelpOwn_('Ask the leads'), B.controlHelpOwn_(''),
      // earlier builds' words for two lines (b2ee90f's switch rows and row 19, an old tab's switch rows)
      B.controlHelpOwn_('• Rows 11-24, 27-29, 32, 34, 36-40 and 46 are switches for what the bot may do on its own.'),
      B.controlHelpOwn_('• Rows 11-21 are switches for what the bot may do on its own. Each is ON or OFF.'),
      B.controlHelpOwn_('• Early wave & velocity check: row 19, OFF unless you turn it ON. Every 15 minutes (older words).'),
      B.controlHelpOwn_('• Early wave is noisy today, ask Sam')],
    [true, true, false, false, false, true, true, true, false]);
    const { t, sh } = world();
    const stage1 = B.ev('CONTROL_HELP_').filter(l => !l.startsWith('• The Early Detection tab lists every story') && !l.startsWith(`• ${LABEL49}: `) && !l.startsWith(`• ${LABEL50}: `) && !l.startsWith(`• ${LABEL51}: `) && !NEW54(l));
    sh.rows = sh.rows.slice(0, 48);
    sh.rows[48] = ['• Rows 11-24, 27-29, 32, 34, 36-40 and 46 are switches for what the bot may do on its own.'];
    sh.rows[49] = [''];
    sh.rows[50] = ['• my own bullet note'];
    sh.rows[51] = ['How it works'];
    stage1.forEach((l, i) => { sh.rows[52 + i] = [l]; });
    sh.rows[60] = ['• Early wave & velocity check: row 19, OFF unless you turn it ON. Every 15 minutes (older words).'];
    // a person's "•" line below the old help, after a blank row (one right under the old help's last line, with no
    // blank between, can't be told from an old help line and is written over like one)
    sh.getRange(100, 1).setValue('• my note under the help');
    t.poll();
    helpAt57(sh, 'bullet notes');
    // (row 51 is a switch since step S2: the person's bullet line in A51 gives way to it, as rows 48-50's cells do)
    // (row 56 is a switch now: its old help line gives way to it, as row 51's does; the help ends at row 110, not 109)
    eq([sh.cell(49, 1), sh.cell(50, 1), sh.cell(51, 1), sh.cell(52, 1), sh.cell(53, 1), sh.cell(56, 1)], [LABEL49, LABEL50, LABEL51, '', '', LABEL56]);
    eq(notesBelow(sh, 110), ['• my note under the help']);
  });

  test('new sources control: row 48\'s help line says in plain numbers how many stories only the AMIE table lifts go for review, the same numbers the bot uses (ewsNewCfg_: early_wave_new_lifted_per_hour and _per_day), and where the rest are listed', () => {
    const line = B.ev('CONTROL_HELP_').filter(l => l.startsWith(`• ${LABEL}: `))[0];
    const cfg = B.ewsNewCfg_();
    assert.ok(line.includes(`a story only they lift goes for review like the others, up to ${cfg.liftedPerHour} an hour and ` +
      `${cfg.liftedPerDay} a day (the settings early_wave_new_lifted_per_hour and _per_day); the rest are listed on the New sources tab.`), line);
    assert.ok(!/within a limit/.test(line), line);
  });

  test('new sources control: column C of row 48 while ON says it is waiting while row 19 is OFF, and otherwise the ON text (115 characters) with what the last check found after it; OFF it is the OFF text whatever row 19 says; row 19 turned OFF again leaves only the waiting words (no note of an earlier check)', () => {
    const texts = sw => B.switchStatusTexts_(sw, '', {}, NOW)[B.switchRows_().indexOf(48)];
    eq([texts({ edAmie: true }), texts({ edAmie: true, earlyWave: true }), texts({ earlyWave: true }), texts({})],
      [WAITING, ON_TEXT, OFF_TEXT, OFF_TEXT]);
    eq(ON_TEXT.length, 115);
    const { t, sh } = world();
    sh.getRange(48, 2).setValue('ON');
    t.poll();
    eq(sh.cell(48, 3), WAITING);
    sh.getRange(19, 2).setValue('ON');
    t.poll();
    // this fake's table has none of the AMIE table's columns: the check's note says so after the ON text (NewSources.gs)
    eq(sh.cell(48, 3), `${ON_TEXT} · ⚠️ since 8:02 AM (just now): the AMIE table has no column "alert_source" any more, so it ` +
      'isn\'t read. The other sources go on (New sources tab) · today: 0 rows, 0 used');
    sh.getRange(19, 2).setValue('OFF');
    t.poll();
    eq(sh.cell(48, 3), WAITING);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The seam: which new rows are ON, as Early Detection's source learns them
  // -----------------------------------------------------------------------------------------------------------------

  test('new sources control (seam): each run tells Early Detection\'s source the switches it read right after the Control tab (ewsRunSwitches_): row 48 ON is edAmie, OFF is absent; a run that never read the tab leaves every new row OFF', () => {
    const { t, sh } = world();
    eq(t.bot.ewsRunSwitches_(), {});  // nothing set yet: all OFF (fail closed)
    t.poll();
    eq(t.bot.ewsRunSwitches_(), {});
    sh.getRange(48, 2).setValue('ON');
    sh.getRange(19, 2).setValue('ON');
    t.poll();
    eq(t.bot.ewsRunSwitches_(), { earlyWave: true, edAmie: true });
    eq(t.bot.ewsNewSources_(t.bot.ewsRunSwitches_()), ['ami']);
    sh.getRange(48, 2).setValue('OFF');
    t.poll();
    eq(t.bot.ewsRunSwitches_(), { earlyWave: true });
    // the line sits right after the Control tab is read, and nowhere else in Main.gs
    const main = require('fs').readFileSync(require('path').join(__dirname, '..', 'Main.gs'), 'utf8');
    assert.match(main, /\n    wanted = readControl_\(control\);\n    ewsRunSwitches_\(wanted\.switches\);/);
    eq((main.match(/ewsRunSwitches_\(/g) || []).length, 1);
    eq((main.match(/ewsAmieOff_\(/g) || []).length, 1);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // E1 (the part that exists after this step) and E3: nothing new happens
  // -----------------------------------------------------------------------------------------------------------------

  test('new sources control (E1): rows 48 to 50 OFF and row 19 ON, six checks: no Secret Manager or Brandwatch call, no table read or dry run, nothing names the AMIE table, exactly two BigQuery jobs a check (US and us-central1) whose bodies are the ones recorded at commit 3be2e06, no New sources tab, no new property or cache item, C48 to C50 the OFF texts', () => {
    const w = world();
    const { t, sh } = w;
    sh.getRange(19, 2).setValue('ON');
    sh.getRange(31, 2).setValue('30 minutes');  // the recorded checks read 30 minutes first
    // the recording's two checks: 12:00 and 12:15 UTC (the run's clock moves a minute before it starts)
    t.g.clock.now = NOW - MIN;
    t.poll();
    t.g.clock.now = NOW + 14 * MIN;
    t.poll();
    eq(jobs(w).map(c => c.payload), BASE.bodies.map(b => b.payload));
    for (let i = 0; i < 4; i++) { t.g.clock.now += 15 * MIN; t.poll(); }
    eq([jobs(w).length, jobs(w).map(c => c.lane).filter(l => l !== 'us' && l !== 'c1')], [12, []]);
    eq([newCalls(w), newState(w), t.sheet().getSheetByName('New sources')], [[], [], null]);
    const st = JSON.parse(t.g.props.get('EWS_STATE'));
    eq([['nk', 'sn'].filter(k => k in st), Object.keys(st.marks).filter(k => /ami|bwl/.test(k))], [[], []]);
    eq([cells(sh, 48), t.bot.readControl_(sh).switches.edAmie], [[LABEL, 'OFF', OFF_TEXT], false]);
    eq([cells(sh, 49), t.bot.readControl_(sh).switches.edBwLive, cells(sh, 50), t.bot.readControl_(sh).switches.watchAmie], [[LABEL49, 'OFF', OFF49], false, [LABEL50, 'OFF', OFF50], false]);
    eq([cells(sh, 51), t.bot.readControl_(sh).switches.openEngine], [[LABEL51, 'OFF', OFF51], false]);
    eq(Array.from(t.g.cache.keys()).filter(k => /^ews:bwl:|^bwl:/.test(k)), []);
  });

  test('new sources control (E3): row 48 ON with row 19 OFF reads nothing at all (no BigQuery job, no table read, no Brandwatch or Secret Manager call, no Early Detection state); with row 19 ON too, the US job is byte for byte the one with row 48 OFF and the us-central1 job only gains its list of the big posts Sonar knew; here the AMIE table\'s check finds none of its columns, so it is checked once and not read (no dry run, no AMIE job) and no trial starts', () => {
    const on = world();
    on.sh.getRange(48, 2).setValue('ON');
    for (let i = 0; i < 3; i++) { on.t.g.clock.now += 15 * MIN; on.t.poll(); }
    eq([jobs(on), newCalls(on), newState(on), on.t.g.props.get('EWS_STATE') === undefined || on.t.g.props.get('EWS_STATE') === null],
      [[], [], [], true]);
    eq(on.sh.cell(48, 3), WAITING);

    const run = row48 => {
      const w = world();
      w.sh.getRange(19, 2).setValue('ON');
      w.sh.getRange(48, 2).setValue(row48);
      for (let i = 0; i < 3; i++) { w.t.g.clock.now += 15 * MIN; w.t.poll(); }
      return w;
    };
    const off = run('OFF');
    const amie = run('ON');
    const of = (w, lane) => jobs(w).filter(c => c.lane === lane).map(c => JSON.parse(c.payload));
    eq(jobs(amie).filter(c => c.lane === 'us').map(c => c.payload), jobs(off).filter(c => c.lane === 'us').map(c => c.payload));
    // us-central1: the same body but for the 'xbig' part at the end of its SQL (only while a new row is ON)
    const big = B.ewsC1BigSql_().join('\n');
    eq(of(amie, 'c1').map(b => b.query), of(off, 'c1').map(b => `${b.query}\n${big}`));
    eq(of(amie, 'c1').map(b => Object.assign(b, { query: '' })), of(off, 'c1').map(b => Object.assign(b, { query: '' })));
    eq([jobs(amie).length, jobs(amie).filter(c => c.lane !== 'us' && c.lane !== 'c1')], [6, []]);
    // the New sources tab is made (the bot's own, its title in A1) and says why the AMIE table isn't read
    const tab = amie.t.sheet().getSheetByName('New sources');
    eq([!!tab, tab && tab.cell(1, 1), tab && /^⚠️ since .*the AMIE table has no column/.test(tab.cell(4, 2))], [true, B.ev('NSRC_TITLE_'), true]);
    // the AMIE table's check (its metadata, read once): this fake answers with other columns, so it stops for the day
    eq(newCalls(amie).map(c => [c.method, c.url.replace(/^.*\/projects\//, '')]),
      [['get', 'brand-social-central-data/datasets/social_alerts_dataset/tables/all_sundar_mentions']]);
    eq([amie.t.bot.ewsAmiStatus_().state, amie.t.bot.ewsAmiStatus_().kind], ['stopped', 'column']);
    assert.ok(amie.sh.cell(48, 3).startsWith(`${ON_TEXT} · ⚠️ since `), amie.sh.cell(48, 3));
    // the new-lane rules of EarlyWaveSource.gs run while a new row is ON (their own day record and index), but with no
    // AMIE job collected the source is never read, so its trial has no first day
    const day = JSON.parse(amie.t.g.props.get('EWS_SRC_DAY') || '{}');
    eq(Object.keys(day.on || {}), []);
    // turned OFF again: the next run forgets the new lanes' index and signatures (the day record stays)
    const onState = JSON.parse(amie.t.g.props.get('EWS_STATE'));
    eq(['nk', 'sn'].filter(k => k in onState), ['nk', 'sn']);  // the new-lane rules kept their index and signatures while ON
    const dayRecord = amie.t.g.props.get('EWS_SRC_DAY');
    amie.sh.getRange(48, 2).setValue('OFF');
    amie.t.poll();
    const st = JSON.parse(amie.t.g.props.get('EWS_STATE'));
    eq([['nk', 'sn'].filter(k => k in st), Array.from(amie.t.g.cache.keys()).filter(k => /^ews1:(nk:|sn:|carry)/.test(k)),
      amie.t.g.props.get('EWS_SRC_DAY')], [[], [], dayRecord]);
    eq(amie.sh.cell(48, 3), OFF_TEXT);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // Row 49 (Brandwatch live) in a run: what it calls and when
  // -----------------------------------------------------------------------------------------------------------------

  const { installBrandwatch, bwMention } = require('./fake_brandwatch.js');
  const WAITING49 = '✓ ON, but waiting: it needs Early wave & velocity check (row 19) ON, which it adds posts to';
  const NONE_TICKED = '✓ ON, but waiting: tick Read = ON for at least one query on the New sources tab';
  const ON49 = '✓ ON: reads new Brandwatch mentions (never X) from the queries ticked on the New sources tab, for Early Detection (row 19)';
  /** Ticks Read = ON on the New sources tab for the queries with these ids, as the owner would. */
  const tickQueries = (t, ids) => {
    const tab = t.sheet().getSheetByName('New sources');
    for (let r = 9; r <= tab.getLastRow(); r++) {
      if (ids.map(String).indexOf(String(tab.cell(r, 8) || '').replace(/^'/, '')) >= 0) tab.getRange(r, 1).setValue('ON');
    }
  };

  test('new sources control (E3, row 49): row 49 ON with row 19 OFF does nothing at all (no Secret Manager or Brandwatch call, no BWL_ value, no tab, no new job) and C49 says it waits for row 19; with row 19 ON it lists the queries, waits for a tick (C49 says so, once) and never reads the AMIE table; row 48 ON with row 49 OFF never calls Secret Manager or Brandwatch', () => {
    const a = world();
    const bwA = installBrandwatch(a.t.g);
    a.sh.getRange(49, 2).setValue('ON');
    checks(a, 3);
    eq([bwA.calls, jobs(a), newState(a), a.t.sheet().getSheetByName('New sources')], [[], [], [], null]);
    eq([a.sh.cell(49, 3), a.t.bot.readControl_(a.sh).switches.edBwLive], [WAITING49, true]);

    const b = world();
    const bwB = installBrandwatch(b.t.g);
    b.sh.getRange(19, 2).setValue('ON');
    b.sh.getRange(49, 2).setValue('ON');
    checks(b, 3);
    eq(bwB.calls.filter(c => /\/data\/mentions$/.test(c.path)), []);  // nothing ticked: nothing read
    assert.ok(bwB.calls.some(c => /\/queries\/summary$/.test(c.path)), 'the query list was read');
    eq(bwB.calls.every(c => c.method === 'get' && !c.payload), true);
    eq([b.bq.filter(c => /all_sundar_mentions|"dryRun"/.test(c.payload + c.url)), b.t.g.fetches.filter(f => /\/tables\//.test(f.url))], [[], []]);
    eq(jobs(b).map(c => c.lane).filter(l => l !== 'us' && l !== 'c1'), []);
    eq(b.sh.cell(49, 3), NONE_TICKED);
    const tab = b.t.sheet().getSheetByName('New sources');
    eq([tab.cell(9, 1), tab.cell(9, 2), tab.cell(10, 1), tab.cell(11, 1)], ['OFF', 'Google Pixel complaints', 'OFF', 'OFF']);
    // ticked: the next run reads, and C49 says what it does
    bwB.mentions = [1, 2, 3].map(i => bwMention(i, b.t.g.clock.now - (12 - i) * MIN));
    tickQueries(b.t, [2005000001]);
    checks(b, 1);
    eq(bwB.calls.filter(c => /\/data\/mentions$/.test(c.path)).length, 1);
    assert.ok(b.sh.cell(49, 3).startsWith(`${ON49} · read `), b.sh.cell(49, 3));
    assert.ok(b.sh.cell(49, 3).length <= ON49.length + 3 + 200, b.sh.cell(49, 3));

    const c = world();
    const bwC = installBrandwatch(c.t.g);
    c.sh.getRange(19, 2).setValue('ON');
    c.sh.getRange(48, 2).setValue('ON');
    checks(c, 3);
    eq(bwC.calls, []);
    eq([c.sh.cell(49, 3), Object.keys(JSON.parse(c.t.g.props.get('EWS_STATE') || '{}').jobs || {}).filter(k => k === 'bwl')], [OFF49, []]);
  });

  test('new sources control (OFF, row 49): a run with row 49 OFF forgets where Brandwatch live had read to (BWL_STATE) and the parcel waiting (its cache items); the day\'s counts (BWL_DAY), the query list and the owner\'s ticks stay, C49 is the OFF text, and ON again reads from the last 30 minutes', () => {
    const w = world();
    const { t, sh } = w;
    const bw = installBrandwatch(t.g);
    sh.getRange(19, 2).setValue('ON');
    sh.getRange(49, 2).setValue('ON');
    checks(w, 1);
    tickQueries(t, [2005000001]);
    bw.mentions = [1, 2, 3].map(i => bwMention(i, t.g.clock.now - (12 - i) * MIN));
    checks(w, 1);  // the read leaves a parcel for the next check
    const parcelItems = () => Array.from(t.g.cache.keys()).filter(k => k.startsWith('ews:bwl:p:'));
    eq([!!JSON.parse(t.g.props.get('BWL_STATE')).parcel, parcelItems().length > 0, JSON.parse(t.g.props.get('BWL_DAY')).mentions], [true, true, 3]);
    // the day's own counts; the count of every feature's mentions (af, as, step 2c) stops at OFF
    const dayOwn = JSON.parse(t.g.props.get('BWL_DAY'));
    delete dayOwn.af;
    delete dayOwn.as;
    const day = JSON.stringify(dayOwn);
    sh.getRange(49, 2).setValue('OFF');
    checks(w, 1);
    const tab = t.sheet().getSheetByName('New sources');
    eq([t.g.props.get('BWL_STATE') || null, parcelItems(), t.g.props.get('BWL_DAY'), tab.cell(9, 1), sh.cell(49, 3)], [null, [], day, 'ON', OFF49]);
    eq(Object.keys(JSON.parse(t.g.props.get('EWS_STATE') || '{}').jobs || {}).filter(k => k === 'bwl'), []);
    const calls = bw.calls.length;
    checks(w, 2);
    eq(bw.calls.length, calls);  // OFF: nothing more is asked
    sh.getRange(49, 2).setValue('ON');
    checks(w, 1);
    const read = bw.calls.filter(c => /\/data\/mentions$/.test(c.path)).slice(-1)[0];
    eq(Date.parse(read.params.sinceAdded[0]), t.g.clock.now - 30 * MIN);
  });

  test('new sources control (row 49 in a run): Brandwatch live reads only after the Watch\'s block (row 34), and the Watch\'s own requests, results and timing are exactly those of a run with row 49 OFF; Burson\'s own alert in the same runs is handled the same, at the same time', () => {
    const run = row49 => {
      const w = world();
      const { t, sh } = w;
      const bw = installBrandwatch(t.g);
      bw.mentions = [1, 2, 3, 4].map(i => bwMention(i, t.g.clock.now - (20 - i) * MIN));
      sh.getRange(19, 2).setValue('ON');
      sh.getRange(34, 2).setValue('ON');
      sh.getRange(49, 2).setValue(row49);
      const order = [];
      const watchRuns = [];
      const b = t.bot;
      const watch = b.runProactiveWatch_;
      b.runProactiveWatch_ = function () {
        const at = t.g.clock.now;
        const n = { bq: w.bq.length, bw: bw.calls.length, f: t.g.fetches.length };
        order.push('watch');
        const r = watch.apply(this, arguments);
        watchRuns.push({ at, ms: t.g.clock.now - at, result: JSON.stringify(r === undefined ? null : r),
          bq: w.bq.slice(n.bq).map(c => c.payload || c.url), bw: bw.calls.slice(n.bw).map(c => c.url), f: t.g.fetches.slice(n.f).map(x => x.url) });
        return r;
      };
      const live = b.bwLiveRun_;
      b.bwLiveRun_ = function () { order.push('bw live'); return live.apply(this, arguments); };
      t.chat.say(H.TEST_FEED, H.F.MISTAKES, ZAPIER);  // Burson's own alert in the first run
      checks(w, 1);
      t.sheet().getSheetByName('Watches').getRange(2, 2).setValue('ON');  // the first watch ON, so the Watch looks
      if (row49 === 'ON') tickQueries(t, [2005000001]);
      checks(w, 3);
      const answered = t.chat.botPosts(H.TRIAGED).map(m => [m.text, m.createTime]);
      return { order, watchRuns, bw, answered };
    };
    const off = run('OFF');
    const on = run('ON');
    eq(off.order, ['watch', 'watch', 'watch', 'watch']);
    eq(on.order, ['watch', 'bw live', 'watch', 'bw live', 'watch', 'bw live', 'watch', 'bw live']);
    eq(on.watchRuns, off.watchRuns);
    assert.ok(off.watchRuns.some(r => r.bq.length + r.bw.length + r.f.length > 0), JSON.stringify(off.watchRuns).slice(0, 300));
    assert.ok(on.bw.calls.some(c => /\/data\/mentions$/.test(c.path)), 'Brandwatch live did read');
    eq(on.answered, off.answered);
    assert.ok(off.answered.length > 0, 'Burson\'s alert was handled');
  });

  // -----------------------------------------------------------------------------------------------------------------
  // Turning row 48 OFF: what it forgets, and what it keeps
  // -----------------------------------------------------------------------------------------------------------------

  test('new sources control (OFF): a run with row 48 OFF forgets the AMIE table\'s mark and its job left running (cancelled), and, with no new row ON, the new lanes\' carry, post-key index and own signatures; the day counts, the trial date, the leave-out lists and today\'s lanes\' marks stay; the next run writes nothing', () => {
    const w = world();
    const { t, sh } = w;
    const def = { key: 'amj', location: 'US', sw: 'edAmie', query: () => null };
    t.bot.ev('EWS_NEW_LANE_DEFS_').push(def);
    const st = { v: 1, at: NOW, marks: { sonar: NOW - 5 * MIN, spk: NOW - 6 * MIN, ami: NOW - 7 * MIN },
      jobs: { us: { id: 'job_us', location: 'US', at: NOW }, amj: { id: 'job_amj', location: 'US', at: NOW, project: 'brand-social-central-data' } },
      day: { key: '2026-10-14', embedded: 40, nl: 12 }, nk: 2, sn: 1, cl: 0, sg: 0 };
    t.g.props.set('EWS_STATE', JSON.stringify(st));
    const srcDay = JSON.stringify({ v: 1, on: { ami: '2026-10-13' }, d: { '2026-10-14': { ami: { in: 5 } } } });
    t.g.props.set('EWS_SRC_DAY', srcDay);
    ['carry', 'nk:0', 'nk:1', 'sn:0', 'xb', 'ak', 'cl:0'].forEach(k => t.g.cache.set(`ews1:${k}`, '[]'));
    t.poll();
    const after = JSON.parse(t.g.props.get('EWS_STATE'));
    eq([after.marks, Object.keys(after.jobs), after.day, 'nk' in after, 'sn' in after],
      [{ sonar: NOW - 5 * MIN, spk: NOW - 6 * MIN }, ['us'], st.day, false, false]);
    eq(t.g.props.get('EWS_SRC_DAY'), srcDay);
    eq(Array.from(t.g.cache.keys()).filter(k => /^ews1:/.test(k)).sort(), ['ews1:ak', 'ews1:cl:0', 'ews1:xb']);
    eq(w.bq.filter(c => /\/jobs\/job_amj\/cancel/.test(c.url)).map(c => c.method), ['post']);
    eq(w.bq.filter(c => /\/cancel/.test(c.url) && !/job_amj/.test(c.url)), []);
    // nothing left to forget: the next runs write nothing
    const saved = t.g.props.get('EWS_STATE');
    const writes = [];
    const set = t.g.props.set.bind(t.g.props);
    t.g.props.set = (k, v) => { if (k === 'EWS_STATE') writes.push(v); return set(k, v); };
    t.poll();
    t.poll();
    eq([writes, t.g.props.get('EWS_STATE')], [[], saved]);
    eq(sh.cell(48, 2), 'OFF');
  });

  test('new sources control (OFF): with another new source still ON, turning the AMIE table OFF forgets only its own mark and job; the shared items stay; with no Early Detection state at all it writes nothing and never throws', () => {
    const g = makeGoogle(NOW);
    const b = loadBot(g.services, g.clock);
    const st = { v: 1, marks: { sonar: 1, ami: 2 }, jobs: {}, day: {}, nk: 1, sn: 1 };
    g.props.set('EWS_STATE', JSON.stringify(st));
    g.cache.set('ews1:carry', '[]');
    g.cache.set('ews1:nk:0', '[]');
    b.ewsAmieOff_({ edBwLive: true });
    eq(JSON.parse(g.props.get('EWS_STATE')), { v: 1, marks: { sonar: 1 }, jobs: {}, day: {}, nk: 1, sn: 1 });
    eq(Array.from(g.cache.keys()).sort(), ['ews1:carry', 'ews1:nk:0']);
    const empty = makeGoogle(NOW);
    const b2 = loadBot(empty.services, empty.clock);
    b2.ewsAmieOff_({});
    b2.ewsAmieOff_(undefined);
    eq([Array.from(empty.props.keys()), Array.from(empty.cache.keys())], [[], []]);
    empty.props.set('EWS_STATE', '{not json');
    b2.ewsAmieOff_({});
    eq(empty.props.get('EWS_STATE'), '{not json');
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The New sources tab is the bot's only by its title in A1 (NewSources.gs): any other tab of that name is left alone
  // -----------------------------------------------------------------------------------------------------------------

  const TITLE = B.ev('NSRC_TITLE_');
  const FOREIGN_NOTE = '⚠️ waiting: a tab named "New sources" exists that the bot didn\'t make; rename it to let the bot make its own';
  const tablesGets = w => w.bq.filter(c => /\/tables\/all_sundar_mentions$/.test(c.url)).length;
  const checks = (w, n) => { for (let i = 0; i < n; i++) { w.t.g.clock.now += 15 * MIN; w.t.poll(); } };

  test('new sources control (Q12): a tab named "New sources" the bot didn\'t make (a person\'s, an empty one, a title one character short or long, a protected one, a hidden one) is never written, and the AMIE table waits: it is not read at all and C48 says why; once that tab is renamed the bot makes its own and reads again', () => {
    const cases = {
      'a person\'s tab': sh => sh.getRange(1, 1, 2, 2).setValues([['My notes on sources', 'kept'], ['Reddit', 'check weekly']]),
      'an empty tab': () => {},
      'a title one character short': sh => sh.getRange(1, 1).setValue(TITLE.slice(0, -1)),
      'a title one character long': sh => sh.getRange(1, 1).setValue(`${TITLE}.`),
      'a protected tab': sh => { sh.getRange(1, 1).setValue('Ours'); sh.protect().setDescription('Only us'); },
      'a hidden tab': sh => { sh.getRange(1, 2).setValue(TITLE); sh.hideSheet(); },
    };
    Object.keys(cases).forEach(what => {
      const w = world();
      const { t, sh } = w;
      const theirs = t.sheet().insertSheet('New sources');
      cases[what](theirs);
      const look = () => JSON.stringify([theirs.rows, theirs.protections.length, theirs.isSheetHidden(), theirs.validations, theirs.cleared || []]);
      const before = look();
      sh.getRange(19, 2).setValue('ON');
      sh.getRange(48, 2).setValue('ON');
      checks(w, 3);
      eq([what, look()], [what, before]);
      eq([what, t.sheet().sheets.filter(x => x.name === 'New sources').length, tablesGets(w), jobs(w).filter(c => c.lane === 'ami').length],
        [what, 1, 0, 0]);
      assert.ok(sh.cell(48, 3).startsWith(`${ON_TEXT} · ${FOREIGN_NOTE}`), `${what}: ${sh.cell(48, 3)}`);
      assert.ok(JSON.parse(t.g.props.get('EWS_STATE')).nsf > 0, what);
      // renamed: the bot makes its own tab at the next check, and the check after that reads the AMIE table again
      theirs.setName('Our sources');
      checks(w, 1);
      const mine = t.sheet().getSheetByName('New sources');
      eq([what, mine && mine.cell(1, 1), 'nsf' in JSON.parse(t.g.props.get('EWS_STATE')), theirs.name, look()], [what, TITLE, false, 'Our sources', before]);
      checks(w, 1);
      eq([what, tablesGets(w)], [what, 1]);
      assert.ok(!sh.cell(48, 3).includes('a tab named'), sh.cell(48, 3));
    });
  });

  test('new sources control (Q12): the bot\'s own New sources tab stays its own when a person hides it or protects it: it is written at each check, never made twice, never shown again or unprotected; turning row 48 OFF leaves the tab as it is (nothing more is written to it)', () => {
    const w = world();
    const { t, sh } = w;
    const amie = amieOn(t, sh);  // the AMIE table answers as it should: it is read at each check from the second
    checks(w, 2);                // (the first makes the table's checks, at its end)
    const tab = t.sheet().getSheetByName('New sources');
    eq([tab.cell(1, 1), tab.protections.map(p => p.warningOnly), amie.jobs()], [TITLE, [true], 1]);
    tab.hideSheet();
    tab.protect().setDescription('Only the owner');
    const summary = tab.cell(2, 1);
    checks(w, 1);
    eq([t.sheet().sheets.filter(x => x.name === 'New sources').length, tab.isSheetHidden(), tab.protections.length], [1, true, 2]);
    assert.ok(tab.cell(2, 1) !== summary && /^Calls today: /.test(tab.cell(2, 1)), tab.cell(2, 1));  // written again: its time moved
    // a person renames the bot's tab and makes one of that name while the AMIE table is being read: the check that
    // finds it leaves it alone, and from the next check the AMIE table waits (no job) until it is renamed in turn
    tab.setName('New sources (old)');
    const theirs = t.sheet().insertSheet('New sources');
    theirs.getRange(1, 1).setValue('Mine now');
    checks(w, 1);
    const amiJobs = amie.jobs();
    checks(w, 2);
    eq([amie.jobs(), theirs.rows], [amiJobs, [['Mine now']]]);
    assert.ok(sh.cell(48, 3).startsWith(`${ON_TEXT} · ${FOREIGN_NOTE}`), sh.cell(48, 3));
    theirs.setName('Mine');
    tab.setName('New sources');
    checks(w, 2);
    eq(amie.jobs(), amiJobs + 1);  // the check after the one that found its own tab again reads the AMIE table
    assert.ok(!sh.cell(48, 3).includes('a tab named'), sh.cell(48, 3));
    // OFF: the tab stays, as it was; the bot writes no more there
    sh.getRange(48, 2).setValue('OFF');
    const rows = JSON.stringify(tab.rows);
    checks(w, 2);
    eq([JSON.stringify(tab.rows), sh.cell(48, 3)], [rows, OFF_TEXT]);
    eq(t.sheet().sheets.map(x => x.name).filter(n => /^New sources/.test(n)), ['New sources']);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // E26: a full run with row 48 ON puts nothing new in front of Burson
  // -----------------------------------------------------------------------------------------------------------------

  const golden = require('./golden_flows')(H);
  const ZAPIER = { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' };
  const AMIE_TABLE = now => ({ lastModifiedTime: String(now), timePartitioning: { type: 'DAY', field: 'ingestionTimestamp' },
    schema: { fields: [['url'], ['alert_source'], ['snippet'], ['authorHandle'], ['SocialNetwork'], ['Sentiment'], ['postTime', 'TIMESTAMP'],
      ['ingestionTimestamp', 'TIMESTAMP'], ['followers', 'INTEGER'], ['KOF'], ['product'], ['engagement']]
      .map(([name, type]) => ({ name, type: type || 'STRING', mode: 'NULLABLE' })) } });
  const STORY = 'Google Wallet keeps declining my transit card at the gate since the update this morning';
  const AMIE_POSTS = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((x, i) => ({
    url: `https://www.reddit.com/r/googlewallet/comments/1wal${i}/gate/`, author: `walletrider${i}`, txt: `${STORY} ${x}` }));
  const COLS16 = [['kind'], ['lane'], ['mid'], ['url'], ['platform'], ['author'], ['audience', 'INTEGER'], ['eng', 'INTEGER'],
    ['posted_ms', 'INTEGER'], ['seen_ms', 'INTEGER'], ['txt'], ['topic'], ['chash'], ['sig'], ['risk'], ['brand', 'BOOLEAN']];

  /**
   * Row 48 ON (and row 19) in a world `t`: the AMIE table's checks and jobs answered (its first job has five posts of one
   * story, by five accounts), today's two jobs with no rows, and Early Detection's real producer in place of a scenario's
   * scripted one. Every other call goes to the world's own fakes.
   */
  function amieOn(t, sh) {
    Object.assign(t.bot.ev('GEN').settings, { early_wave_new_trial_days: 0 });
    let amieJobs = 0;
    const prev = t.g.services.UrlFetchApp.fetch;
    const resp = body => ({ getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => JSON.stringify(body) });
    t.g.services.UrlFetchApp.fetch = (url, params) => {
      const u = String(url);
      const method = String((params && params.method) || 'get').toLowerCase();
      if (!u.startsWith('https://bigquery.googleapis.com/')) return prev(url, params);
      if (method === 'get' && /\/tables\/all_sundar_mentions$/.test(u)) return resp(AMIE_TABLE(t.g.clock.now));
      let body = {};
      try { body = JSON.parse((params && params.payload) || '{}'); } catch (e) { body = {}; }
      const labels = body.labels || {};
      if (method !== 'post' || !/\/queries$/.test(u) || labels.purpose !== 'early-wave') return prev(url, params);
      if (body.dryRun === true) return resp({ jobComplete: true, totalBytesProcessed: '80000000' });
      const now = t.g.clock.now;
      if (labels.lane === 'bwl') {  // Brandwatch live's job: every mention of its @bwl passes (no test runs SQL)
        const p = (body.queryParameters || []).find(x => x.name === 'bwl');
        const bwlRows = ((p && p.parameterValue.arrayValues) || []).map(a => {
          const v = k => (a.structValues[k] || {}).value;
          return { kind: 'post', lane: 'bwl', mid: v('mid'), url: v('url'), platform: v('platform'), author: v('author'), audience: v('audience'),
            posted_ms: v('posted_ms'), seen_ms: v('seen_ms'), txt: v('raw'), topic: v('topic'), chash: `c${v('mid')}`, sig: `s${v('mid')}`, risk: '', brand: true };
        });
        return resp({ jobComplete: true, jobReference: { projectId: 'brand-social-central-data', jobId: `e26_bwl_${now}`, location: body.location },
          schema: { fields: COLS16.map(c => ({ name: c[0], type: c[1] || 'STRING' })) },
          rows: bwlRows.map(r => ({ f: COLS16.map(c => ({ v: r[c[0]] === undefined || r[c[0]] === null ? null : String(r[c[0]]) })) })) });
      }
      const rows = labels.lane !== 'ami' ? [] : ++amieJobs > 1 ? [{ kind: 'amark', lane: 'ami', seen_ms: now - 2 * MIN }]
        : AMIE_POSTS.map((p, i) => ({ kind: 'post', lane: 'ami', mid: `AMI|e26p${i}`, url: p.url, platform: 'Reddit', author: p.author,
          audience: 140, posted_ms: now - (12 + i * 3) * MIN, seen_ms: now - 4 * MIN, txt: p.txt, topic: 'Google Wallet', chash: `e26c${i}`,
          sig: `e26s${i}`, risk: '', brand: true })).concat([{ kind: 'amark', lane: 'ami', audience: 5, eng: 0, posted_ms: 5, seen_ms: now - 3 * MIN }]);
      return resp({ jobComplete: true, jobReference: { projectId: 'brand-social-central-data', jobId: `e26_${labels.lane}_${now}`, location: body.location },
        schema: { fields: COLS16.map(c => ({ name: c[0], type: c[1] || 'STRING' })) },
        rows: rows.map(r => ({ f: COLS16.map(c => ({ v: r[c[0]] === undefined || r[c[0]] === null ? null : String(r[c[0]]) })) })) });
    };
    t.bot.bqEarlyDetectionRows_ = (minutes, opts) => t.bot.ewsRows_(minutes, opts);
    sh.getRange(19, 2).setValue('ON');
    sh.getRange(48, 2).setValue('ON');
    return { jobs: () => amieJobs };
  }

  const BW_STORY = 'Google Fit stopped syncing my steps with my watch since the update this morning';
  const BW_QUERY = 'Fit sync complaints (made up)';
  const BW_POSTS = ['one', 'two', 'three', 'four', 'five'].map((x, i) => ({
    url: `https://www.reddit.com/r/googlefit/comments/1fit${i}/sync/`, author: `fitwalker${i}`, txt: `${BW_STORY} ${x}` }));
  /**
   * Row 49 ON (with row 19, which amieOn turns ON) in a world `t`: Brandwatch faked, its project's one query BW_QUERY;
   * returns tick(), the owner's step after the first run listed the query: it ticks it, and five mentions of one story
   * by five accounts are added in the 10 minutes before (the first read reaches 30 minutes back).
   */
  function bwlOn(t, sh) {
    const bw = installBrandwatch(t.g, { queries: [{ id: 2005000009, name: BW_QUERY, contentSources: ['reddit'], languages: ['en'] }] });
    sh.getRange(49, 2).setValue('ON');
    const tick = () => {
      const now = t.g.clock.now;
      bw.mentions = BW_POSTS.map((p, i) => bwMention(i + 1, now - (10 - i * 2) * MIN, { url: p.url, author: p.author, snippet: p.txt,
        queryId: 2005000009, queryName: BW_QUERY, date: now - (14 - i * 2) * MIN }));
      tickQueries(t, [2005000009]);
    };
    return { bw, tick };
  }

  /** What the bot put where Burson sees it: its posts in S-F Burson (B25) and the Burson test copy, and the outbox tab. */
  function bursonSide(t, spaces) {
    const posts = [].concat(...spaces.filter(s => s && t.chat.spaces.has(s)).map(s => t.chat.botPosts(s).map(m => m.text || '')));
    const outbox = t.sheet().getSheetByName('Burson outbox');
    return { posts, outbox: outbox ? outbox.rows.slice(1).map(r => r.join(' | ')) : [] };
  }

  /** Every email the bot sent or drafted, as words: whom to, the subject, the text and the HTML. */
  const mails = t => t.g.gmail.sentMessages().concat(t.g.gmail.allDrafts())
    .map(m => [].concat(m.to || [], m.cc || [], m.bcc || [], [m.subject || '', m.text || '', m.html || '']).join(' | '));

  /** None of it holds a new-lane post's words or link, a query's name, "AMIE", "Brandwatch" or the AMIE table's name. */
  function assertNothingNew(what, side) {
    const leaks = side.posts.concat(side.outbox).filter(text => /amie|brandwatch|all_sundar|social_alerts_dataset/i.test(text) ||
      text.includes(STORY.slice(0, 30)) || AMIE_POSTS.some(p => text.includes(p.url) || text.includes(p.author)) ||
      text.includes(BW_STORY.slice(0, 30)) || text.includes(BW_QUERY) || BW_POSTS.some(p => text.includes(p.url) || text.includes(p.author)));
    eq([what, leaks], [what, []]);
  }

  test('new sources control (E26): full runs with rows 48 to 50 ON, in the one-space setup, beside a Mirror space and in the main flow: the AMIE table\'s story and Brandwatch live\'s are found and reviewed where the bot works, but no outbox row, relay post, post in S-F Burson (B25), the Burson test copy (B26) or the Other alerts space (B33), and no email sent or drafted, holds a new-lane post\'s words or link, a query\'s name, "AMIE" or "Brandwatch"', () => {
    const run = (t, sh) => {
      amieOn(t, sh);
      const bwl = bwlOn(t, sh);
      sh.getRange(50, 2).setValue('ON');  // the Watch's AMIE source (it waits for row 34) and every story card's posts claimed
      t.chat.say(golden.spaces.REAL, H.F.MISTAKES, ZAPIER);  // Burson's own alert: the relay and the outbox have work too
      checks({ t }, 1);
      bwl.tick();
      checks({ t }, 6);
    };
    const one = golden.world.oneSpaceWorld({});  // B10 alone; B25 the live Burson space, read only
    run(one.t, one.sh);
    const mir = golden.world.mirrorWorld({});    // beside a Mirror space, Testing, with the Burson test copy
    run(mir.t, mir.sh);
    const main = world();                        // the main flow: the test feed into the analysts' space, B25 and B33 set
    main.t.set('B25', golden.spaces.REAL);
    const OTHER = 'spaces/AAQAotheralerts26';
    main.t.chat.addSpace(OTHER, 'Other alerts (made up)');
    main.sh.getRange(33, 2).setValue(OTHER);
    run(main.t, main.sh);
    [['one-space', one.t, golden.spaces.AC], ['mirror', mir.t, golden.spaces.MIRROR], ['main', main.t, null]].forEach(([what, t, where]) => {
      const day = JSON.parse(t.g.props.get('EWS_SRC_DAY') || '{}');
      const today = Object.keys(day.d || {}).sort().slice(-1)[0];
      eq([what, (((day.d || {})[today] || {}).ami || {}).used], [what, 5]);  // the AMIE table's five posts came in
      eq([what, JSON.parse(t.g.props.get('BWL_DAY') || '{}').used], [what, 5]);  // and Brandwatch live's five
      // beside the Mirror space the test copy does get Burson's corrected alert: the way to Burson is open, and holds nothing new
      if (what === 'mirror') assert.ok(bursonSide(t, [golden.spaces.COPY]).posts.length > 0, 'the test copy has posts');
      assertNothingNew(what, bursonSide(t, [golden.spaces.REAL, golden.spaces.COPY]));
      // the Other alerts space, and every email the bot sent or drafted (Social Alerts, to testers or to groups): in these
      // worlds the bot sends none and posts nothing there, so any that a later change makes must hold nothing new
      assertNothingNew(`${what}: Other alerts space and emails`, { posts: bursonSide(t, [OTHER]).posts.concat(mails(t)), outbox: [] });
      if (where) assert.ok(t.chat.botPosts(where).some(m => /EARLY DETECTION/.test(m.text || '') && AMIE_POSTS.some(p => (m.text || '').includes(p.url))), `${what}: the story's card is where the bot works`);
      if (where) assert.ok(t.chat.botPosts(where).some(m => /EARLY DETECTION/.test(m.text || '') && BW_POSTS.some(p => (m.text || '').includes(p.url))), `${what}: Brandwatch live's story's card is where the bot works`);
    });
  });
};
