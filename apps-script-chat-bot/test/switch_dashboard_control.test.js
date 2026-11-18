// The live dashboard's and the slide deliveries' Control rows and plumbing (Control.gs, Main.gs, Dashboard.gs): row 54,
// "Live dashboard", and row 55, "Slide deliveries", each written OFF and never set ON by the bot; rows 52-53 left as they
// are (blank, or a person's text); the help moved to row 57 (row 56 blank), the old title at A53 cleared; column C of each
// (the web app's link or "not deployed yet"; "waiting" until the presentations scope is approved); the dashboard's build
// id in BOT_BUILD only with row 54 ON; the deliveries' time trigger kept only with row 55 ON (and, with it OFF and none
// made, not one trigger call); every public function refusing a dashboard viewer (webViewerCall_) while trigger and
// editor runs go on; and who may open the dashboard (dashAccess_, doGet's denied page). Every address is made up (.test).
'use strict';

module.exports = H => {
  const { test, eq, assert, B, e2e, makeGoogle } = H;
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const LABEL54 = 'Live dashboard';
  const LABEL55 = 'Slide deliveries';
  const OFF54 = 'OFF (the live dashboard web app shows nothing; the bot keeps no extra records for it)';
  const OFF55 = 'OFF (no pulse slides are delivered; deliveries can be set up in the web app and wait)';
  const ON54 = '✓ ON: the live dashboard web app shows the bot\'s work (read-only)';
  const NOT_DEPLOYED = ' · not deployed yet: see the README "Live dashboard" section';
  const ON55 = '✓ ON: delivers the brand safety pulse slides on each delivery\'s schedule (Slide deliveries in the web app)';
  const WAITING55 = '✓ ON, but waiting: the bot\'s account must approve editing Google Slides once (README "Slide deliveries")';
  const SLIDES_SCOPE = 'https://www.googleapis.com/auth/presentations';
  const EXEC = 'https://script.google.com/a/macros/team.test/s/AKfycbDashboardDeployment01/exec';
  const REFUSED = 'Not available from the dashboard';
  const ON_OFF = ['ON', 'OFF'];
  const cells = (sh, r) => [1, 2, 3].map(c => sh.cell(r, c));
  const BLANK = ['', '', ''];
  const HELP = () => B.ev('CONTROL_HELP_');
  // row 56 ("Speed numbers: leave out when the bot was not running", RunLog.gs) is now a switch too: its help line came
  // after rows 54-55's, so a tab from before rows 54-55 has none of the three
  const LABEL56 = 'Speed numbers: leave out when the bot was not running';
  const OFF56 = 'OFF (the speed numbers count every alert as they always have, and the bot keeps no record of when it was running)';
  const NEW_LINE = l => l.startsWith(`• ${LABEL54}: `) || l.startsWith(`• ${LABEL55}: `) || l.startsWith(`• ${LABEL56}: `);

  /** A bot after setup(), with a tester in B30. */
  const world = g => {
    const t = e2e(g || makeGoogle(H.NOW));
    t.bot.setup();
    t.set('B30', 'tester@team.test');
    return { t, sh: t.control() };
  };

  /**
   * The Control tab as the build before rows 54-55 left it (today's live tab): rows 1-51 as setup() makes them, row 52
   * blank, "How it works" at row 53 and that build's help lines from row 54 (no line for rows 54 and 55, and its own
   * words for the switch-rows line), no dropdown on B54 or B55.
   */
  const olderTab = sh => {
    const old = HELP().filter(l => !NEW_LINE(l))
      .map(l => l.replace('36-40, 46, 48-51, 54, 55 and 56 are switches', '36-40, 46 and 48-51 are switches'));
    sh.rows = sh.rows.slice(0, 51);
    sh.rows[51] = [''];
    sh.rows[52] = ['How it works'];
    old.forEach((l, i) => { sh.rows[53 + i] = [l]; });
    delete sh.validations['54,2'];
    delete sh.validations['55,2'];
    delete sh.validations['56,2'];
    return old;
  };

  /** The help in place: its title at row 57 (the only one), every line under it in order. */
  const helpAt57 = (sh, when) => {
    eq([B.ev('CONTROL_HELP_ROW_'), sh.cell(57, 1)], [57, 'How it works'], when);
    eq(HELP().map((_, i) => sh.cell(58 + i, 1)), HELP(), when);
    eq(sh.rows.filter(r => String(r[0]).trim() === 'How it works').length, 1, when);
  };

  /** Records every ScriptApp trigger call from now on: [name, handler]. */
  const spyTriggers = g => {
    const calls = [];
    const app = g.services.ScriptApp;
    ['getProjectTriggers', 'newTrigger', 'deleteTrigger'].forEach(m => {
      const orig = app[m];
      app[m] = (...a) => {
        calls.push([m, m === 'newTrigger' ? a[0] : m === 'deleteTrigger' ? a[0].getHandlerFunction() : '']);
        return orig(...a);
      };
    });
    return calls;
  };

  /** Records every script property written from now on: [key, value]. */
  const spyProps = g => {
    const writes = [];
    const set = g.props.set.bind(g.props);
    g.props.set = (k, v) => { writes.push([k, v]); return set(k, v); };
    return writes;
  };

  // -----------------------------------------------------------------------------------------------------------------
  // Rows 54 and 55, rows 52-53, the help at row 57
  // -----------------------------------------------------------------------------------------------------------------

  test('dashboard control: a new Control tab has row 54 "Live dashboard" and row 55 "Slide deliveries", OFF with their ON / OFF dropdowns and what OFF means in column C; rows 52-53 blank (row 56 is now a switch too); "How it works" at row 57 with a help line for each ("• Live dashboard: row 54, OFF until you turn it ON", "• Slide deliveries: row 55, ..."); both start OFF and read OFF', () => {
    const { t, sh } = world();
    // row 56 is no longer blank: it is the "Speed numbers" switch (RunLog.gs), OFF
    eq([cells(sh, 52), cells(sh, 53), cells(sh, 54), cells(sh, 55), cells(sh, 56)],
      [BLANK, BLANK, [LABEL54, 'OFF', OFF54], [LABEL55, 'OFF', OFF55], [LABEL56, 'OFF', OFF56]]);
    eq([sh.validations['54,2'].values, sh.validations['55,2'].values, sh.validations['52,2'], sh.validations['53,2']], [ON_OFF, ON_OFF, undefined, undefined]);
    helpAt57(sh, 'new tab');
    const line54 = HELP().filter(l => l.startsWith(`• ${LABEL54}: `));
    const line55 = HELP().filter(l => l.startsWith(`• ${LABEL55}: `));
    eq([line54.length, line55.length], [1, 1]);
    assert.match(line54[0], /^• Live dashboard: row 54, OFF until you turn it ON\. /);
    assert.match(line55[0], /^• Slide deliveries: row 55, OFF until you turn it ON\. /);
    assert.match(line55[0], /while Testing, only the testers in B30/);
    assert.match(line55[0], /Nothing of it goes to S-F Burson or the Burson test copy/);
    // the switch-rows line now ends "54, 55 and 56" (row 56 is a switch)
    assert.ok(HELP().some(l => /^• Rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 are switches/.test(l)));
    // the switch list: appended after the open engine (indices 0-28 unchanged), each row its own; row 56's switch comes
    // after them (32 switches, not 31; the run of rows from 54 is 3 long, not 2)
    const sw = B.ev('CONTROL_SWITCHES_');
    eq([sw.length, sw.slice(-3, -1).map(s => [s.key, s.label, s.row]), B.switchRows_().slice(-4, -1), sw[28].key],
      [32, [['liveDashboard', LABEL54, 54], ['slideDeliveries', LABEL55, 55]], [51, 54, 55], 'openEngine']);
    eq(B.switchRowRuns_().slice(-2).map(r => [r.start, r.idx.length]), [[48, 4], [54, 3]]);
    // the texts: no record-only words, no emoji, no address; the ON texts are the same LIVE or Testing
    for (const s of sw.slice(-3, -1)) {
      const texts = [s.label, B.switchOffText_(s), s.on('', true), s.on('', false), s.on('tester@team.test', undefined)].join(' ');
      assert.ok(!/\b(?:s[h]adow|record-only|recording only|observe-only|dry-run)\b/i.test(texts), texts);
      assert.ok(!/@/.test(texts), texts);
      eq(s.on('', true), s.on('', false), s.key);
    }
    t.poll();
    eq([cells(sh, 54), cells(sh, 55), t.bot.readControl_(sh).switches.liveDashboard, t.bot.readControl_(sh).switches.slideDeliveries],
      [[LABEL54, 'OFF', OFF54], [LABEL55, 'OFF', OFF55], false, false]);
  });

  test('dashboard control: a tab from before rows 54-55 (the help at row 53, as the live tab has it) gets rows 54 and 55 OFF at its next run without setup(), even beside a person\'s "ON" typed next to an old help line; a person\'s text in A52:C53 stays; the old "How it works" title at A53 is cleared; row 56 has no old help; the help is at row 57; rows 1-51 do not change', () => {
    const { t, sh } = world();
    olderTab(sh);
    // a person's cells in rows 52 and 53 (and a stray ON next to an old help line in B54)
    sh.getRange(52, 1, 1, 3).setValues([['Ask the leads before turning row 19 ON', 'note B52', 'note C52']]);
    sh.getRange(53, 2, 1, 2).setValues([['note B53', 'note C53']]);
    sh.getRange(54, 2).setValue('ON');
    sh.getRange(19, 2).setValue('ON');
    const above = () => JSON.stringify(sh.rows.slice(7, 51).map(r => [r[0], r[1]]));
    const before = above();
    t.g.logs.length = 0;
    t.poll();
    eq(above(), before);
    eq([cells(sh, 52), cells(sh, 53), cells(sh, 54), cells(sh, 55), cells(sh, 56)],
      [['Ask the leads before turning row 19 ON', 'note B52', 'note C52'], ['', 'note B53', 'note C53'],
        [LABEL54, 'OFF', OFF54], [LABEL55, 'OFF', OFF55], [LABEL56, 'OFF', OFF56]]);  // row 56 is now a switch, OFF
    eq([sh.validations['54,2'].values, sh.validations['55,2'].values], [ON_OFF, ON_OFF]);
    helpAt57(sh, 'after the first run');
    eq(t.bot.readControl_(sh).switches, Object.assign(B.switchesOff_(), { earlyWave: true }));
    // no old help line left anywhere (the old switch-rows line included), and nothing kept below the help (none was a person's)
    assert.ok(!sh.rows.some(r => /^• Rows .* 46 and 48-51 are switches/.test(String(r[0]))));
    eq(sh.rows.length, 57 + B.ev('CONTROL_HELP_ROWS_') - 1);
    eq(t.g.logs.filter(l => /kept below/.test(l)), []);
    // and it stays so: setup() and more runs change nothing from row 52 down; a person's ON on row 54 is kept
    const snap = JSON.stringify(sh.rows.slice(51));
    t.bot.setup();
    t.poll();
    eq(JSON.stringify(sh.rows.slice(51)), snap, 'setup() and a run');
    sh.getRange(54, 2).setValue('ON');
    sh.getRange(53, 1).setValue('Row 53 is mine too');
    t.poll();
    t.bot.setup();
    eq([sh.cell(54, 2), sh.cell(53, 1), cells(sh, 52)], ['ON', 'Row 53 is mine too', ['Ask the leads before turning row 19 ON', 'note B52', 'note C52']]);
    helpAt57(sh, 'with row 54 ON');
  });

  test('dashboard control: on a tab from before rows 54-55, a person\'s text in the cells rows 54 and 55 are written over (beside the old help lines) is kept below the help, unchanged, and the log says which cell it came from; a stray ON there is never carried over (the switch starts OFF)', () => {
    const { t, sh } = world();
    const old = olderTab(sh);
    eq([sh.cell(54, 1), sh.cell(55, 1)], [old[0], old[1]]);  // two of the old help's lines
    sh.getRange(54, 3).setValue('C54 a person note beside old help');
    sh.getRange(55, 2).setValue('B55 mine');
    sh.getRange(55, 3).setValue('ON');
    sh.getRange(54, 2).setValue('ON');
    t.g.logs.length = 0;
    t.poll();
    eq([cells(sh, 54), cells(sh, 55)], [[LABEL54, 'OFF', OFF54], [LABEL55, 'OFF', OFF55]]);
    helpAt57(sh, 'after the run');
    const below = sh.rows.slice(57 + B.ev('CONTROL_HELP_ROWS_') - 1).map(r => r[0]);
    eq(below, ['C54 a person note beside old help', 'B55 mine', 'ON']);
    const end = 57 + B.ev('CONTROL_HELP_ROWS_') - 1;
    // the log says the texts came from the new switch rows' cells (never "from the help's rows": U8)
    eq(t.g.logs.filter(l => /kept below/.test(l)),
      [`Control tab: a person's text in the cells the new switch rows were written over was kept below "How it works" (rows 57-${end} of column A): C54 to A${end + 1}, B55 to A${end + 2}, C55 to A${end + 3}`]);
    eq(t.bot.readControl_(sh).switches.liveDashboard, false);
    // the next runs keep them where they are and move nothing again
    const snap = JSON.stringify(sh.rows.slice(51));
    t.poll();
    eq(JSON.stringify(sh.rows.slice(51)), snap);
  });

  test('dashboard control: writing the help clears only the bot\'s own old text from row 52 down, never a switch row (an old help line in A54 stays until its switch is written) and never a person\'s text; on today\'s tab it writes nothing in rows 52-56', () => {
    const { t, sh } = world();
    // today's layout: writing the help again writes only the help itself
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
    eq(writes, [[57, 1, B.ev('CONTROL_HELP_ROWS_')]]);
    // the old title at A53, a help line of the bot's in A52 and A56, a person's note in A56's place next time: the bot's
    // own are cleared, a switch row is never touched (here A54 holds a help line: it is left for ensureSwitchRows_)
    writes.length = 0;
    sh.rows[51] = [HELP()[1]];
    sh.rows[52] = ['How it works'];
    sh.rows[53] = [HELP()[2], 'OFF', OFF54];
    sh.rows[55] = [HELP()[3]];
    t.bot.writeControlHelp_(sh);
    // A56 is a switch row now (row 56, RunLog.gs): like A54, the old help line there is left for ensureSwitchRows_
    eq([sh.cell(52, 1), sh.cell(53, 1), sh.cell(54, 1), sh.cell(56, 1)], ['', '', HELP()[2], HELP()[3]]);
    eq(writes.filter(w => w[0] === 54 || w[0] === 55 || w[0] === 56), []);
    sh.rows[55] = ['• my own note under the switches'];
    sh.rows[51] = ['A note of mine'];
    t.bot.writeControlHelp_(sh);
    eq([sh.cell(52, 1), sh.cell(56, 1)], ['A note of mine', '• my own note under the switches']);
    sh.getRange = orig;
    t.poll();  // the run puts row 54's switch back, and row 56's
    // row 56 is a switch now: the run writes it over A56, and the person's note there is kept below the help instead
    eq([cells(sh, 54), cells(sh, 55), sh.cell(52, 1), cells(sh, 56)],
      [[LABEL54, 'OFF', OFF54], [LABEL55, 'OFF', OFF55], 'A note of mine', [LABEL56, 'OFF', OFF56]]);
    eq(sh.rows.slice(57 + B.ev('CONTROL_HELP_ROWS_') - 1).map(r => r[0]), ['• my own note under the switches']);
    helpAt57(sh, 'after a run');
  });

  // -----------------------------------------------------------------------------------------------------------------
  // Column C of rows 54 and 55
  // -----------------------------------------------------------------------------------------------------------------

  test('dashboard control: C54 while ON says the web app shows the bot\'s work (read-only) and gives its link, or says it is not deployed yet; C55 while ON says it delivers, or that it waits until the bot\'s account approves editing Google Slides; OFF, the OFF texts; only a person turns them ON', () => {
    const { t, sh } = world();
    t.g.script.notGranted = [SLIDES_SCOPE];
    t.poll();
    eq([sh.cell(54, 2), sh.cell(54, 3), sh.cell(55, 2), sh.cell(55, 3)], ['OFF', OFF54, 'OFF', OFF55]);
    sh.getRange(54, 2).setValue('ON');
    sh.getRange(55, 2).setValue('ON');
    t.poll();
    eq([sh.cell(54, 3), sh.cell(55, 3)], [ON54 + NOT_DEPLOYED, WAITING55]);
    // the scope was asked about as Dashboard.gs dashScopeOk_ asks (FULL, the presentations scope only)
    eq(t.g.script.asked.slice(-1), [{ mode: 'FULL', scopes: [SLIDES_SCOPE] }]);
    t.g.script.url = EXEC;
    t.g.script.notGranted = [];
    t.poll();
    eq([sh.cell(54, 3), sh.cell(55, 3)], [`${ON54} · ${EXEC}`, ON55]);
    // the pure texts
    eq([B.liveDashboardOnText_(''), B.liveDashboardOnText_(`  ${EXEC} `), B.slideDeliveriesOnText_(false), B.slideDeliveriesOnText_(true)],
      [ON54 + NOT_DEPLOYED, `${ON54} · ${EXEC}`, WAITING55, ON55]);
    // turned OFF by a person: the OFF texts at once
    sh.getRange(54, 2).setValue('OFF');
    sh.getRange(55, 2).setValue('OFF');
    t.poll();
    eq([sh.cell(54, 3), sh.cell(55, 3)], [OFF54, OFF55]);
    // the code never writes ON in column B of a switch row
    const src = fs.readdirSync(ROOT).filter(f => /\.gs$/.test(f)).map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    assert.ok(!/liveDashboard\s*[:=]\s*true|slideDeliveries\s*[:=]\s*true/.test(src));
  });

  // -----------------------------------------------------------------------------------------------------------------
  // poll(): BOT_BUILD (row 54) and the deliveries' trigger (row 55)
  // -----------------------------------------------------------------------------------------------------------------

  test('dashboard control: poll() writes the dashboard\'s build id to BOT_BUILD only while row 54 is ON, and only when it differs (one write, then none); with row 54 OFF it neither reads nor writes it', () => {
    const { t, sh } = world();
    const writes = spyProps(t.g);
    t.poll();
    t.poll();
    eq([t.g.props.has('BOT_BUILD'), writes.filter(w => w[0] === 'BOT_BUILD')], [false, []]);
    sh.getRange(54, 2).setValue('ON');
    t.poll();
    eq([t.g.props.get('BOT_BUILD'), writes.filter(w => w[0] === 'BOT_BUILD').length], [B.ev('DASH_BUILD_'), 1]);
    t.poll();
    t.poll();
    eq(writes.filter(w => w[0] === 'BOT_BUILD').length, 1, 'no write while it is the same');
    eq(t.bot.dashBuildInfo_(), { web: B.ev('DASH_BUILD_'), bot: B.ev('DASH_BUILD_'), behind: false, url: '', sameAccount: null, accountWhy: '' });
    // the account the web app runs as (it was deployed from) against "Runs as" (Control B8), never naming either address
    eq([t.bot.dashBuildInfo_(t.bot.dashCtx_()).sameAccount, t.bot.dashBuildInfo_(t.bot.dashCtx_()).accountWhy], [true, '']);
    const b8 = sh.cell(8, 2);
    sh.getRange(8, 2).setValue('someone.else@runner.test');
    const other = t.bot.dashBuildInfo_(t.bot.dashCtx_());
    eq(other.sameAccount, false);
    assert.match(other.accountWhy, /^This web app runs as a different Google account than the bot \(Control B8, "Runs as"\): it was deployed from another account\. The owner deploys it again signed in as the account in B8/);
    assert.ok(!/@/.test(other.accountWhy));
    sh.getRange(8, 2).setValue('');
    eq(t.bot.dashBuildInfo_(t.bot.dashCtx_()).sameAccount, null);
    sh.getRange(8, 2).setValue(b8);
    // the web app's own link, for the page's exact `clasp deploy -i <id>` (a Workspace domain's link has /a/macros/<domain>/)
    t.g.script.url = 'https://script.google.com/a/macros/team.test/s/AKfycbTestDeployment0123456789/exec';
    eq(t.bot.dashBuildInfo_().url, 'https://script.google.com/a/macros/team.test/s/AKfycbTestDeployment0123456789/exec');
    t.g.script.url = '';
    // an older build's id there (the code was pushed again): written once more
    t.g.props.set('BOT_BUILD', '2026-11-01.1');
    writes.length = 0;
    t.poll();
    eq([t.g.props.get('BOT_BUILD'), writes.filter(w => w[0] === 'BOT_BUILD').length], [B.ev('DASH_BUILD_'), 1]);
    // row 54 OFF again: left as it is, never written
    sh.getRange(54, 2).setValue('OFF');
    t.g.props.set('BOT_BUILD', 'kept');
    writes.length = 0;
    t.poll();
    eq([t.g.props.get('BOT_BUILD'), writes.filter(w => w[0] === 'BOT_BUILD')], ['kept', []]);
    // the upkeep on its own: what it did
    eq([t.bot.pollDashboardUpkeep_({}), t.bot.pollDashboardUpkeep_(null)], [{ build: '', trigger: '', mode: '' }, { build: '', trigger: '', mode: '' }]);
  });

  test('dashboard control: with row 55 OFF and no delivery trigger made, a run makes no trigger call at all; ON, one time trigger for dashDeliverDue every 5 minutes is made once and kept (an extra one is deleted, the poll trigger is never touched); OFF again, it is removed, and the next runs make no trigger call', () => {
    const { t, sh } = world();
    const calls = spyTriggers(t.g);
    t.poll();
    t.poll();
    eq([calls, t.g.triggers, t.g.props.has('SLIDE_TRIGGER')], [[], [{ handler: 'poll', minutes: 1 }], false]);
    sh.getRange(55, 2).setValue('ON');
    t.poll();
    eq([t.g.triggers, calls], [[{ handler: 'poll', minutes: 1 }, { handler: 'dashDeliverDue', minutes: 5 }],
      [['getProjectTriggers', ''], ['newTrigger', 'dashDeliverDue']]]);
    assert.ok(Number(t.g.props.get('SLIDE_TRIGGER')) > 0);
    calls.length = 0;
    t.poll();
    t.poll();
    eq([t.g.triggers.filter(x => x.handler === 'dashDeliverDue').length, calls.filter(c => c[0] !== 'getProjectTriggers')], [1, []]);
    // a second one (made by hand, say): deleted, one kept
    t.g.triggers.push({ handler: 'dashDeliverDue', minutes: 5 });
    t.poll();
    eq(t.g.triggers, [{ handler: 'poll', minutes: 1 }, { handler: 'dashDeliverDue', minutes: 5 }]);
    // one deleted by hand: made again at the next run
    t.g.triggers.splice(1, 1);
    t.poll();
    eq(t.g.triggers, [{ handler: 'poll', minutes: 1 }, { handler: 'dashDeliverDue', minutes: 5 }]);
    // setup() leaves it (it remakes only the poll trigger)
    t.bot.setup();
    eq(t.g.triggers.filter(x => x.handler === 'dashDeliverDue').length, 1);
    // OFF: removed, the mark gone; the runs after that make no trigger call
    sh.getRange(55, 2).setValue('OFF');
    calls.length = 0;
    t.poll();
    eq([t.g.triggers, calls, t.g.props.has('SLIDE_TRIGGER')],
      [[{ handler: 'poll', minutes: 1 }], [['getProjectTriggers', ''], ['deleteTrigger', 'dashDeliverDue']], false]);
    calls.length = 0;
    t.poll();
    t.poll();
    eq(calls, []);
    // the trigger can't fail the run: a run whose trigger call throws still finishes (Status says it is working)
    sh.getRange(55, 2).setValue('ON');
    const make = t.g.services.ScriptApp.newTrigger;
    t.g.services.ScriptApp.newTrigger = () => { throw new Error('Too many triggers'); };
    t.poll();
    t.g.services.ScriptApp.newTrigger = make;
    eq([t.get('B5'), t.g.triggers.filter(x => x.handler === 'dashDeliverDue').length], ['✅ Working', 0]);
    assert.ok(t.g.logs.some(l => /slide deliveries \(row 55\): could not keep the delivery trigger: Too many triggers/.test(l)));
    t.poll();
    eq(t.g.triggers.filter(x => x.handler === 'dashDeliverDue').length, 1, 'made at the next run');
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The guard: every public function refuses a dashboard viewer
  // -----------------------------------------------------------------------------------------------------------------

  test('dashboard control: every public function of the bot (but doGet and the dashboard\'s own dash* functions) refuses a dashboard viewer (an active user who is not the bot\'s account) before doing anything; poll() and setup() then change nothing; trigger runs (no active user) and the owner\'s own runs in the editor go on as before', () => {
    const { t, sh } = world();
    const src = fs.readdirSync(ROOT).filter(f => /\.gs$/.test(f)).map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    const names = Array.from(src.matchAll(/^function ([A-Za-z0-9]+)\(/gm)).map(m => m[1])
      .filter(n => !/_$/.test(n) && n !== 'doGet' && !/^dash/.test(n));
    ['setup', 'poll', 'status', 'tryAlert', 'listMySpaces', 'refreshKnowledge', 'refreshResults', 'refreshSpeed', 'refreshAnalysis',
      'runBotAnalysis', 'refreshHeadStart', 'startAutoCorrect', 'stopAutoCorrect', 'startMirror', 'stopMirror', 'pollMirror',
      'setupTnsTestForm', 'onTnsTestFormSubmit', 'verifyLookbackAndPipelineLive', 'verifyFastTriageLive', 'verifyEarlyWaveBqLive',
      'verifyNewSourcesLive'].forEach(n => assert.ok(names.includes(n), n));
    t.poll();
    const snapshot = () => JSON.stringify([sh.rows, Array.from(t.g.props.entries()).sort(), t.g.triggers, t.g.gmail.sentMessages().length]);
    const before = snapshot();
    const messages = () => Array.from(t.chat.spaces.values()).reduce((n, s) => n + s.messages.length, 0);
    const posts = messages();
    t.g.session.active = 'viewer@team.test';
    for (const n of names) {
      assert.throws(() => t.bot[n](), e => e && e.message === REFUSED, n);
      assert.throws(() => t.bot[n]({ response: { getItemResponses: 'not a function' } }), e => e && e.message === REFUSED, n);
    }
    eq([snapshot() === before, messages()], [true, posts]);
    // the same viewer's address in another case is still a viewer; the bot's own account is not
    t.g.session.active = 'Viewer@Team.test';
    assert.throws(() => t.bot.poll(), e => e && e.message === REFUSED);
    assert.throws(() => t.bot.setup(), e => e && e.message === REFUSED);
    eq(t.bot.webViewerCall_(), true);
    // a real form-submit trigger run (its event carries a FormResponse) is never refused, whoever submitted the form
    const response = { getItemResponses: () => [{ getItem: () => ({ getTitle: () => 'Post URL' }), getResponse: () => 'https://x.com/a/status/1' }] };
    t.bot.onTnsTestFormSubmit({ response });
    eq(t.g.gmail.sentMessages().slice(-1).map(m => m.to), [['tester@team.test']]);
    // the owner in the editor (the bot's own account, any case) and trigger runs (no active user): as before
    t.g.session.active = 'BOT@runner.test';
    eq(t.bot.webViewerCall_(), false);
    t.poll();
    t.bot.setup();
    t.g.session.active = '';
    eq(t.bot.webViewerCall_(), false);
    t.poll();
    eq(t.get('B5'), '✅ Working');
    // an older Session without getActiveUser (or one that throws): never refused
    const getActive = t.g.services.Session.getActiveUser;
    t.g.services.Session.getActiveUser = () => { throw new Error('no access'); };
    eq(t.bot.webViewerCall_(), false);
    t.g.services.Session.getActiveUser = getActive;
  });

  // -----------------------------------------------------------------------------------------------------------------
  // Who may open the dashboard (dashAccess_), and the page a denied viewer sees (doGet)
  // -----------------------------------------------------------------------------------------------------------------

  /** A fake HtmlService: what doGet built ({html, title, metas, frame, template}). */
  const fakeHtml = g => {
    const built = [];
    const output = html => {
      const o = { html, title: '', metas: [], frame: null, template: null };
      built.push(o);
      const out = {
        setTitle(v) { o.title = v; return out; },
        addMetaTag(n, v) { o.metas.push([n, v]); return out; },
        setXFrameOptionsMode(v) { o.frame = v; return out; },
        getContent: () => o.html,
      };
      return out;
    };
    g.services.HtmlService = {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
      createHtmlOutput: html => output(String(html)),
      createHtmlOutputFromFile: name => output(`<partial ${name}>`),
      createTemplateFromFile: name => {
        const tpl = { evaluate: () => { const out = output(`<template ${name}>`); built[built.length - 1].template = name; return out; } };
        return tpl;
      },
    };
    return built;
  };
  const emailsIn = text => String(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [];

  test('dashboard control: dashAccess_ lets in the people the bot\'s sheet is shared with: the bot\'s own account, an editor, a viewer, the owner (any case), everyone when the sheet is shared with the domain or anyone with the link; it refuses a viewer the sheet is not shared with, a blank address (Google hid it) and any Drive failure, and its answer names no address but the viewer\'s own', () => {
    const g = makeGoogle(H.NOW);
    fakeHtml(g);
    const { t } = world(g);
    const id = t.g.props.get('STORE_SHEET_ID');
    const share = o => { t.g.drive.files.set(id, Object.assign({ access: 'PRIVATE', editors: ['editor@team.test'], viewers: ['reader@team.test'],
      owner: 'owner@team.test' }, o)); t.g.cache.clear(); };
    const as = email => { t.g.session.active = email; return t.bot.dashAccess_(); };
    share({});
    eq(as('bot@runner.test'), { ok: true, email: 'bot@runner.test', self: true, why: '' });
    eq([as('editor@team.test').ok, as('Reader@Team.test').ok, as('owner@team.test').ok], [true, true, true]);
    eq(as('Reader@Team.test').email, 'reader@team.test');
    const denied = as('stranger@team.test');
    eq([denied.ok, denied.email, denied.self], [false, 'stranger@team.test', false]);
    assert.match(denied.why, /the sheet is not shared with stranger@team\.test\. Ask the owner of the bot's sheet \(the Google Sheet with the Control tab\) to share it with you/);
    eq(emailsIn(denied.why), ['stranger@team.test']);
    // shared with the whole domain, or anyone with the link: everyone in
    for (const access of ['DOMAIN', 'DOMAIN_WITH_LINK', 'ANYONE', 'ANYONE_WITH_LINK']) {
      share({ access, editors: [], viewers: [] });
      eq(as('stranger@team.test').ok, true, access);
    }
    // a blank address: refused, saying why, with no address at all
    share({});
    const blank = as('');
    eq([blank.ok, blank.email, emailsIn(blank.why)], [false, '', []]);
    assert.match(blank.why, /Google did not tell the dashboard who you are/);
    // Drive can't be asked (no access, a failure): refused, told to try again, and never kept: once Drive answers, the
    // viewer is let in at once (no 10 minutes of a wrong "not shared with you")
    share({ fail: 'Access denied: DriveApp.' });
    const failed = as('editor@team.test');
    eq(failed.ok, false);
    assert.match(failed.why, /^The dashboard could not check who the bot's sheet is shared with just now .*: try again in a minute\.$/);
    eq(Array.from(t.g.cache.keys()).filter(k => k.startsWith('dash1:acl:')), []);
    t.g.drive.files.set(id, { access: 'PRIVATE', editors: ['editor@team.test'], viewers: [], owner: 'owner@team.test' });
    eq(as('editor@team.test').ok, true);
    // the bot's sheet not known yet (no STORE_SHEET_ID): the same, and nothing kept
    t.g.cache.clear();
    const sheetId = t.g.props.get('STORE_SHEET_ID');
    t.g.props.delete('STORE_SHEET_ID');
    assert.match(as('editor@team.test').why, /^The dashboard could not check/);
    t.g.props.set('STORE_SHEET_ID', sheetId);
    eq(as('editor@team.test').ok, true);
    // the answer is kept per address by a SHA-256 of it: two addresses whose short hash (Bot.gs hashText_) is the same
    // never share an answer
    const [one, two] = ['u00mf9r@team.test', 'u01ab3a@team.test'];
    eq(B.hashText_(one), B.hashText_(two));
    share({ editors: [one], viewers: [] });
    eq([as(one).ok, as(two).ok], [true, false]);
    eq(Array.from(t.g.cache.keys()).filter(k => k.startsWith('dash1:acl:')).map(k => /^dash1:acl:[0-9a-f]{64}$/.test(k)), [true, true]);
    // shared through a Google Group (Drive lists the group's address): the bot can't see the members, and says so
    share({ editors: ['brand-safety-team@team.test'], viewers: [] });
    assert.match(as('member@team.test').why, /If it is shared with you through a Google Group, the bot can't see that: ask to be added by name\.$/);
    // a shared drive's file (no owner): editors and viewers still count
    share({ owner: null });
    eq([as('editor@team.test').ok, as('owner@team.test').ok], [true, false]);
    // the answer is kept 10 minutes per viewer: sharing removed meanwhile still lets them in until then
    share({});
    eq(as('editor@team.test').ok, true);
    t.g.drive.files.set(id, { access: 'PRIVATE', editors: [], viewers: [], owner: 'owner@team.test' });
    eq(as('editor@team.test').ok, true);
    t.g.cache.clear();
    eq(as('editor@team.test').ok, false);
  });

  test('dashboard control: doGet shows a denied viewer only the page that says why (their own address and no other, never the bot\'s, an editor\'s or the owner\'s), and never the dashboard\'s template; a blank address gets the page with no address; a viewer the sheet is shared with gets the Dashboard template', () => {
    const g = makeGoogle(H.NOW);
    const built = fakeHtml(g);
    const { t } = world(g);
    const id = t.g.props.get('STORE_SHEET_ID');
    t.g.drive.files.set(id, { access: 'PRIVATE', editors: ['editor@team.test'], viewers: ['reader@team.test'], owner: 'owner@team.test' });
    t.g.session.active = 'stranger@team.test';
    const page = t.bot.doGet({});
    const out = built[built.length - 1];
    eq([out.template, out.title, out.metas], [null, 'Burson QA bot · Live', [['viewport', 'width=device-width, initial-scale=1']]]);
    assert.match(page.getContent(), /You can't open the live dashboard yet/);
    assert.match(page.getContent(), /Ask the owner of the bot&#39;s sheet \(the Google Sheet with the Control tab\) to share it with you/);
    eq(emailsIn(page.getContent()), ['stranger@team.test']);
    eq(built.some(o => o.template), false);
    // a blank address (Google hid it): the answer as plain text (ContentService), no page at all, so no google.script.run
    // bridge reaches someone the bot could not identify (webViewerCall_ can't tell them from a trigger run); no address
    t.g.session.active = '';
    const pages = built.length;
    const hidden = t.bot.doGet({});
    eq([hidden.contentService, hidden.getMimeType(), built.length, emailsIn(hidden.getContent()), built.some(o => o.template)], [true, 'TEXT', pages, [], false]);
    assert.match(hidden.getContent(), /^You can't open the live dashboard yet\. Google did not tell the dashboard who you are/);
    // an address with markup in it is shown as text, never as markup
    t.g.session.active = 'a<b>@team.test';
    assert.ok(!/<b>/.test(t.bot.doGet({}).getContent()));
    // a viewer the sheet is shared with: the Dashboard template, as the page
    t.g.session.active = 'reader@team.test';
    t.bot.doGet({});
    eq([built[built.length - 1].template, built[built.length - 1].title, built[built.length - 1].frame], ['DashboardPage', 'Burson QA bot · Live', 'DEFAULT']);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The manifest and what clasp pushes
  // -----------------------------------------------------------------------------------------------------------------

  test('dashboard control: the manifest runs the web app as the bot\'s account for the domain and asks for the presentations scope (every scope it had is kept); clasp pushes the .html files too, and still never the tests', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'appsscript.json'), 'utf8'));
    eq(manifest.webapp, { executeAs: 'USER_DEPLOYING', access: 'DOMAIN' });
    assert.ok(manifest.oauthScopes.includes(SLIDES_SCOPE));
    ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/forms',
      'https://www.googleapis.com/auth/script.scriptapp', 'https://www.googleapis.com/auth/userinfo.email']
      .forEach(s => assert.ok(manifest.oauthScopes.includes(s), s));
    eq(manifest.oauthScopes.length, 15);
    const ignore = fs.readFileSync(path.join(ROOT, '.claspignore'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    eq(ignore, ['**/**', '!*.gs', '!*.html', '!appsscript.json']);
  });

  // ----- second review (U2/S3, U3, U4, U5, U6) ----------------------------------------------------------------------

  test('dashboard control: the run that finds row 55 turned OFF marks the mode record "not kept" from its start, so a send while row 55 is OFF is never put under the last mode kept; ON again, the mode is kept from that run on (U2, S3)', () => {
    const { t, sh } = world();
    sh.getRange(55, 2).setValue('ON');
    t.poll();
    const writes = spyProps(t.g);
    const log = () => JSON.parse(t.g.props.get('SLIDE_MODE_LOG'));
    const first = log().changes;
    eq(first.map(c => c[1]), [0]);  // Testing (B30 set)
    sh.getRange(55, 2).setValue('OFF');
    t.poll();
    const offAt = t.g.clock.now;
    eq(log().changes.map(c => c[1]), [0, null]);
    eq(log().changes[1][0], offAt);
    eq(t.bot.slideModeAt_(log(), offAt + 10 * 60 * 1000), 'unknown');
    eq(t.bot.slideModeAt_(log(), first[0][0] + 1000), 'test');
    // more runs with row 55 OFF: nothing more written
    writes.length = 0;
    t.poll();
    t.poll();
    eq(writes.filter(w => w[0] === 'SLIDE_MODE_LOG'), []);
    // ON again: kept from that run (Testing after the gap, though Testing was the last mode kept before it)
    sh.getRange(55, 2).setValue('ON');
    t.poll();
    eq(log().changes.map(c => c[1]), [0, null, 0]);
    eq(t.bot.slideModeAt_(log(), t.g.clock.now + 1000), 'test');
    // the upkeep on its own: a gap only when a record is kept, and only once
    eq(t.bot.slideModeGap_(t.g.clock.now), 'gap');
    eq(t.bot.slideModeGap_(t.g.clock.now + 1), 'same');
  });

  test('dashboard control: a change of mode is kept from the start of the run that found it, before any of that run\'s sends (U3)', () => {
    const { t, sh } = world();
    sh.getRange(55, 2).setValue('ON');
    // the run takes 30 seconds after it starts (its sends are stamped during it)
    t.bot.ev('var __clock = null; writeSwitchStatuses_ = (orig => function () { __clock.now += 30000; return orig.apply(null, arguments); })(writeSwitchStatuses_)');
    t.bot.__clock = t.g.clock;
    const start = t.g.clock.now + 60000;  // t.poll() moves the clock a minute on, then the run starts
    t.poll();
    const log = JSON.parse(t.g.props.get('SLIDE_MODE_LOG'));
    eq([log.since, log.changes], [start, [[start, 0]]]);
    assert.ok(t.g.clock.now > start);
    // the upkeep stamps what it is given (the run's start), never the time it is called
    t.g.props.delete('SLIDE_MODE_LOG');
    t.bot.pollDashboardUpkeep_({ slideDeliveries: true }, { live: true, start: 12345 });
    eq(JSON.parse(t.g.props.get('SLIDE_MODE_LOG')).changes, [[12345, 1]]);
  });

  test('dashboard control: while the bot is paused (B2 OFF) with row 55 ON, C55 says so, written once, and paused runs write no more column C (U4)', () => {
    const { t, sh } = world();
    sh.getRange(55, 2).setValue('ON');
    t.poll();
    const writes = [];
    const orig = sh.getRange.bind(sh);
    sh.getRange = (r, c, nr, nc) => {
      const range = orig(r, c, nr, nc);
      const rows = nr || 1;
      const cols = nc || 1;
      if (r <= 55 && 55 < r + rows && c <= 3 && 3 < c + cols) {
        const set = range.setValues.bind(range);
        range.setValues = v => { writes.push([r, c, rows, cols]); return set(v); };
        range.setValue = v => range.setValues([[v]]);
      }
      return range;
    };
    try {
      sh.getRange(2, 2).setValue('OFF');
      for (let i = 0; i < 3; i++) t.poll();
      eq([sh.cell(55, 3), writes.length], [B.ev('SLIDE_PAUSED_ON_TEXT_'), 1]);
      // ON again: the usual text, once
      sh.getRange(2, 2).setValue('ON');
      t.poll();
      t.poll();
      assert.match(sh.cell(55, 3), /^✓ ON/);
      eq(writes.length, 2);
    } finally {
      sh.getRange = orig;
    }
  });

  test('dashboard control: on a tab from before rows 54-55, a person\'s note in those cells that starts with "OFF" or "✓ ON" is still theirs and kept; the bot\'s own texts there are not (U5)', () => {
    const { t, sh } = world();
    olderTab(sh);
    sh.getRange(55, 3).setValue('OFF-site review on Friday');
    sh.getRange(54, 3).setValue('✓ ON means the dashboard, ask Sam first');
    t.poll();
    eq([cells(sh, 54), cells(sh, 55)], [[LABEL54, 'OFF', OFF54], [LABEL55, 'OFF', OFF55]]);
    const below = sh.rows.slice(57 + B.ev('CONTROL_HELP_ROWS_') - 1).map(r => r[0]);
    eq(below, ['✓ ON means the dashboard, ask Sam first', 'OFF-site review on Friday']);
    // the bot's own: its OFF text, an ON text with its note, the paused text
    [OFF54, OFF55, `${ON54}${NOT_DEPLOYED}`, `${ON55} · last check 9:00 AM`, WAITING55, B.ev('SLIDE_PAUSED_ON_TEXT_')].forEach(v =>
      eq(t.bot.controlPersonText_(v, 2), false, v));
    ['OFF-site review on Friday', 'ON', 'OFF for now, ask Sam'].forEach(v => eq(t.bot.controlPersonText_(v, 2), true, v));
  });

  test('dashboard control: a Sheets failure while the help is written after rows 54-55 were written over never loses a person\'s text from them (U6)', () => {
    const { t, sh } = world();
    olderTab(sh);
    sh.getRange(54, 2).setValue('ask Sam before changing row 53');
    t.bot.ev('writeControlHelp_ = (orig => { let n = 0; return sh => { if (n++ === 0) throw new Error(\'Service Spreadsheets timed out\'); return orig(sh); }; })(writeControlHelp_)');
    for (let i = 0; i < 3; i++) { try { t.poll(); } catch (e) { /* the run's own failure */ } }
    eq(cells(sh, 54), [LABEL54, 'OFF', OFF54]);
    eq(sh.rows.filter(r => r && r[0] === 'ask Sam before changing row 53').length, 1);
    helpAt57(sh, 'after the failed run and the next');
  });

  // Apps Script names a file without its .gs or .html ending, so one project can't hold Dashboard.gs and Dashboard.html:
  // `clasp push` stops with "A file with this name already exists". The files each .claspignore lets through are read here
  test('dashboard control: clasp can push both Apps Script projects: no two files it sends share a name once the .gs or .html ending is dropped (any case), and every page or partial the code opens by name (createTemplateFromFile, createHtmlOutputFromFile, include_) is one of the .html files it sends', () => {
    const pushed = dir => {
      const rules = fs.readFileSync(path.join(dir, '.claspignore'), 'utf8').split('\n').map(l => l.trim())
        .filter(l => l.startsWith('!')).map(l => new RegExp(`^${l.slice(1).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`));
      return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile() && rules.some(r => r.test(f)));
    };
    const projects = [ROOT, path.join(ROOT, '..', 'apps-script-sheet-sidepanel')].filter(d => fs.existsSync(path.join(d, '.claspignore')));
    eq(projects.length, 2);
    projects.forEach(dir => {
      const files = pushed(dir);
      const names = new Map();
      files.forEach(f => {
        if (f === 'appsscript.json') return;
        const key = f.replace(/\.(gs|html)$/, '').toLowerCase();
        names.set(key, (names.get(key) || []).concat(f));
      });
      const clashes = [...names.values()].filter(list => list.length > 1);
      eq([path.basename(dir), clashes], [path.basename(dir), []]);
      const html = new Set(files.filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, '')));
      const opened = new Set();
      files.filter(f => /\.(gs|html)$/.test(f)).forEach(f => {
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        const re = /\b(?:createTemplateFromFile|createHtmlOutputFromFile|include_)\(\s*'([^']+)'\s*\)/g;
        let m;
        while ((m = re.exec(src))) opened.add(m[1]);
      });
      eq([path.basename(dir), [...opened].filter(n => !html.has(n))], [path.basename(dir), []]);
    });
    // the dashboard's page is among them, under its own name
    assert.ok(pushed(ROOT).indexOf('DashboardPage.html') >= 0 && pushed(ROOT).indexOf('Dashboard.gs') >= 0);
  });
};
