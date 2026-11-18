// The live dashboard and the pick-up time with Control row 56 ("Speed numbers: leave out when the bot was not running",
// key speedHonest; RunLog.gs): DashboardData.gs, DashboardJs.html and OpenEngine.gs openPickup_ (build design D3 and D4).
//
// With row 56 OFF the dashboard answers exactly as before (the snapshot and every alert's detail equal those of the same
// world with every RunLog.gs reader doing nothing; none of them is called, no RUN_LOG property is read, neither of the
// run log's tabs is looked up, no new field), the page draws nothing new, and every pick-up is kept in the run-time
// record (RUN_LEDGER.p) as before. With it ON: the Now strip says when the bot ran, from its run log (the stretches it was
// not running, paused, failing or not known, in the run log's own words, and where its run log starts), what the page
// can't see (before the run log, or the run log at all), each Head start story's speed check under its head start on
// Caught early (the six new Head start lines come with the others), how long Burson's alert waited for the bot to run in
// its timeline, what the pick-up time leaves out, and the pick-up time itself leaves out the alerts posted before the bot
// came back after a stop. Every time is one the bot recorded; what its run log can't say is "not known".
//
// The world: the golden one-space setup (golden_flows.js oneSpaceWorld: B10 the Auto-correct space reading S-F Burson,
// B25) with its own stories (Direct BigQuery cards, a Watch alert, Early Detection cards) and the live dashboard (row 54)
// ON as a person sets it, the open engine (row 51) ON for the pick-up time; then Bot (B2) OFF for three runs while Burson
// posts an alert (listed when Bot is back ON), and an 18-hour stop of the trigger while Burson alerts the post of this
// app's Maps card (picked up when the bot is back: the race spans the stop), then a fresh alert of Burson's. The viewer
// is let in by stubbing dashAccess_. Every address is made up (.test).
'use strict';

module.exports = H => {
  const { test, eq, assert, F, REAL } = H;
  const { loadPage } = require('./fake_dom');
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const ZAPIER = { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' };
  const VIEWER = 'viewer@team.test';
  const MAPS_POST = 'https://x.com/roadwatcher/status/2150000000000000002';  // golden_flows.js MAPS: this app's Direct BigQuery card
  const BURSON_MAPS = F.MAPS.replace(/\[Link\]: \S+/, `[Link]: ${MAPS_POST}`);  // Burson's alert on that very post
  const RUN_LOG_TAB = 'When the bot ran';
  const OFF_TAB = 'Burson while bot OFF';
  const CHECK_HEADER = 'Speed check: was the bot running?';
  const SIX = [
    'Race on the same post, while the bot was running: median head start over Burson ("behind by" when Burson was first)',
    'Race on the same post, while the bot was running: posts this app alerted first, and posts Burson alerted first',
    'Burson alerted the issue first, on another post (not counted as a win or a loss)',
    'Not comparable: the bot was not running, paused or failing between the two alerts',
    'Burson\'s alerts posted while the bot was OFF and never reviewed (listed when Bot was turned back ON)',
    'Not known: from before the bot kept its run log',
  ];
  const NEW_FIELDS = /"(?:runLog|speedCheck|speedCheckWhy|pickupNote|pickupKeptP90Sec|pickupKept)"/;
  // the pick-up line with row 56 ON, under the usual one (review R1: the usual one is as it was)
  const PICKUP_HEAD = 'Leaving out alerts posted before the bot came back after a stop, a pause or failing runs (row 56): ';
  const EMOJI = /\p{Extended_Pictographic}/u;
  const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/;

  /**
   * The world of the header, run to its end: {t, golden, times: {stopFrom (the clock when the trigger stopped), mapsAt
   * (Burson's Maps alert posted), back (the clock of the first poll after the stop)}}. o.on: row 56 ON from the start;
   * o.engine: row 51 ON; o.setup(t): before the first run.
   */
  function world(o) {
    o = o || {};
    const golden = require('./golden_flows')(H);
    const w = golden.world.oneSpaceWorld();
    const { t, sh, feed, rec } = w;
    t.bot.ev(`dashAccess_ = () => ({ ok: true, email: "${VIEWER}", self: false, why: '' })`);
    sh.getRange(54, 2).setValue('ON');
    if (o.engine) sh.getRange(51, 2).setValue('ON');
    if (o.on) sh.getRange(56, 2).setValue('ON');
    if (o.setup) o.setup(t);
    // the golden one-space steps (golden_flows.js oneSpaceRun): Burson's alert, this app's own cards and stories
    rec.step('01 first run', 1);
    golden.world.watchOn(t);
    sh.getRange(35, 2).setValue('Auto-correct space (B10)');
    rec.step('02 quiet run', 1);
    rec.step('03 Burson alert with mistakes', 1, () => { t.chat.say(REAL, F.MISTAKES, ZAPIER); });
    rec.step('04 Direct BigQuery finds the Pixel post', 3, () => { feed.bsip = [golden.rows.bsipRow()]; });
    rec.step('05 the Pixel card is reviewed', 1);
    rec.step('06 the watch flags the Gemini post', 1, () => { feed.look = [golden.rows.hit()]; });
    rec.step('07 the watch alert is triaged', 1, () => { feed.look = []; });
    rec.step('08 Maps and a story', 5, () => { feed.bsip = [golden.rows.bsipRow(), golden.rows.mapsRow()]; feed.stories = [golden.rows.story()]; });
    rec.step('09 the Maps card is reviewed', 1, () => { feed.look = [golden.rows.mapsHit()]; });
    rec.step('10 quiet run', 1, () => { feed.look = []; });
    rec.step('11 the Pixel story', 14, () => { feed.stories = [golden.rows.story(), golden.rows.pixelStory()]; });
    rec.step('12 quiet run', 1);
    // Bot (B2) OFF for three runs; Burson posts an alert meanwhile
    t.set('B2', 'OFF');
    rec.step('13 paused', 1);
    rec.step('14 paused, Burson posts', 1, () => { t.chat.say(REAL, F.PARIS, ZAPIER); });
    rec.step('15 paused', 1);
    t.set('B2', 'ON');
    rec.step('16 Bot ON again', 1);
    rec.step('17 quiet run', 1);
    // the trigger stops for 18 hours; 2 hours in, Burson alerts the post of this app's Maps card
    const stopFrom = t.g.clock.now;
    t.g.clock.now += 2 * HOUR;
    const mapsAt = t.g.clock.now;
    t.chat.say(REAL, BURSON_MAPS, ZAPIER);
    t.g.clock.now = stopFrom + 18 * HOUR - MIN;  // poll() moves the clock on a minute
    rec.step('18 back after 18 hours', 1);
    const back = t.g.clock.now;
    rec.step('19 a fresh alert of Burson\'s', 1, () => { t.chat.say(REAL, F.AIO, ZAPIER); });
    rec.step('20 quiet run', 1);
    rec.step('21 the Head start tab is rebuilt', 10);
    return Object.assign({ golden, times: { stopFrom, mapsAt, back } }, w);
  }

  const shared = {};
  const onWorld = () => shared.on || (shared.on = world({ on: true, engine: true }));
  const offWorld = () => shared.off || (shared.off = world({ engine: true }));
  const snap = t => t.bot.dashSnapshot({ refresh: true });
  const rows = t => t.bot.sheetBackend_(t.sheet()).loadAlerts();
  /** Burson's alert posted during the stop (on the post of this app's Maps card), as the Alert log has it. */
  const mapsRow = w => rows(w.t).find(r => Number(r.source_at) >= w.times.mapsAt && Number(r.source_at) < w.times.back);
  const T = (t, ms) => t.bot.speedTime_(ms);

  // the RunLog.gs readers, and what each answers when it does nothing
  const READERS = { runLogRead_: '({ ok: true, why: "", start: 0, last: 0, spans: [] })', runLogCheckIn_: 'null', runLogWords_: '""',
    runLogStart_: '0', runLogDownEnd_: '0', runLogSpans_: '[]', runLogNotRunningOverlap_: 'null', offListed_: '[]', runLogOn_: 'false' };

  /** Each RunLog.gs reader, wrapped: every call is recorded; with noop(true) each does nothing (READERS). restore() puts them back. */
  function readers(t) {
    t.bot.ev('var __rl = { calls: [], noop: false, orig: {} }');
    Object.keys(READERS).forEach(name => t.bot.ev(`__rl.orig.${name} = ${name}; ${name} = function () { __rl.calls.push("${name}"); ` +
      `return __rl.noop ? ${READERS[name]} : __rl.orig.${name}.apply(this, arguments); }`));
    return {
      calls: () => t.bot.ev('__rl.calls.slice()'),
      noop: on => t.bot.ev(`__rl.noop = ${!!on}`),
      restore: () => Object.keys(READERS).forEach(name => t.bot.ev(`${name} = __rl.orig.${name}`)),
    };
  }

  /** Every script property read from now on (restore() stops it). */
  function propReads(g) {
    const reads = [];
    const get = g.props.get;
    g.props.get = function (k) { reads.push(k); return get.apply(this, arguments); };
    return { reads, restore: () => { g.props.get = get; } };
  }

  /** Every tab looked up by name, and every getLastColumn of the Head start tab, from now on. */
  function sheetReads(t) {
    const ss = t.sheet();
    const names = [];
    const cols = [];
    const byName = ss.getSheetByName;
    const hs = ss.getSheetByName('Head start');
    const last = hs && hs.getLastColumn;
    ss.getSheetByName = function (n) { names.push(n); return byName.apply(this, arguments); };
    if (hs) hs.getLastColumn = function () { cols.push(1); return last.apply(this, arguments); };
    return { names, cols, restore: () => { ss.getSheetByName = byName; if (hs) hs.getLastColumn = last; } };
  }

  /** Everything the bot keeps that a dash* call must not change: every tab's cells, every property, the cache but its own keys. */
  function kept(t) {
    return JSON.stringify({
      tabs: t.sheet().getSheets().map(sh => [sh.getName(), sh.rows]),
      props: Array.from(t.g.props.entries()).sort(),
      cache: Array.from(t.g.cache.entries()).filter(([k]) => k.indexOf('dash1:') !== 0).sort(),
    });
  }

  /** The page, as the viewer sees it, its google.script.run calls answered by the bot's own dash* functions. */
  function page(t) {
    const p = loadPage({ viewer: VIEWER, run: (fn, args) => t.bot[fn].apply(null, args) });
    p.flush();
    return p;
  }

  /** The Head start tab's EVERY STORY row of the story named `name`, and its speed check cell ('' with no such column). */
  function headStartRow(t, name) {
    const sh = t.sheet().getSheetByName('Head start');
    const every = sh.rows.findIndex(r => r && /^EVERY STORY/.test(String(r[0] || '')));
    const header = sh.rows[every + 1].map(String);
    const i = sh.rows.findIndex((r, n) => n > every + 1 && String(r[2] || '').indexOf(name) >= 0);
    const col = header.indexOf(CHECK_HEADER);
    return { row: sh.rows[i], check: col >= 0 ? String(sh.rows[i][col] || '') : '' };
  }

  // =================================================================================================================
  // Row 56 OFF: as before
  // =================================================================================================================

  test('speed honest dashboard OFF: with row 56 OFF the snapshot and every alert\'s detail are the same as in the same world with every RunLog.gs reader doing nothing; none of them is called, no RUN_LOG property is read, neither run-log tab is looked up, the Head start tab is read no wider, and no new field is there (no runLog, speedCheck, speedCheckWhy or pickupNote; no "waited for the bot" line)', () => {
    const w = offWorld();
    const t = w.t;
    const spy = readers(t);
    const props = propReads(t.g);
    const sheets = sheetReads(t);
    try {
      const ids = rows(t).map(r => r.alert_id);
      const answer = () => ({ snap: snap(t), details: ids.map(id => t.bot.dashDetail('alert', id)) });
      const real = answer();
      const realCalls = spy.calls();
      spy.noop(true);
      const none = answer();
      eq([realCalls, spy.calls()], [[], []]);
      eq(real, none);
      eq([props.reads.filter(k => /^RUN_LOG/.test(k)), sheets.names.filter(n => n === RUN_LOG_TAB || n === OFF_TAB), sheets.cols], [[], [], []]);
      // the world has what row 56 ON would show: a stop and a pause, Burson's alert picked up 16 hours after it was posted,
      // a story whose race spans the stop, the pick-up time measured (row 51 ON)
      assert.ok(real.snap.ok && real.snap.pressure.load.measured === true, JSON.stringify(real.snap.pressure.load));
      const maps = mapsRow(w);
      assert.ok(maps && Number(maps.seen_at) - Number(maps.source_at) > 10 * HOUR, JSON.stringify(maps && [maps.source_at, maps.seen_at]));
      assert.ok(real.snap.early.stories.some(s => /Maps/.test(s.story) && s.headStart), JSON.stringify(real.snap.early.stories));
      const text = JSON.stringify(real);
      assert.ok(!NEW_FIELDS.test(text), text.match(NEW_FIELDS));
      assert.ok(!/It waited [\d,]+ min for the bot to run/.test(text));
      eq(Object.keys(real.snap.health).sort(), ['cannotSee', 'fix', 'headline', 'lastRunAt', 'level', 'sources', 'status', 'why']);
      assert.ok(!real.snap.health.cannotSee.some(c => /When the bot was running/.test(c.what)));
      eq(real.snap.early.numbers.map(n => n.label).filter(l => SIX.indexOf(l) >= 0), []);
      eq(t.sheet().getSheetByName(RUN_LOG_TAB), null);
    } finally {
      spy.noop(false);
      spy.restore();
      props.restore();
      sheets.restore();
    }
  });

  test('speed honest dashboard OFF: the page draws nothing new with row 56 OFF: no "When the bot ran" lines in the Now strip, no speed check under a head start on Caught early, no note under the pick-up time', () => {
    const t = offWorld().t;
    const p = page(t);
    eq(p.one('#runlog'), null);
    assert.ok(!/When the bot ran/.test(p.text(p.one('#now'))));
    p.click(p.one('#tab-early'));
    eq(p.all('.speed-check').length, 0);
    assert.ok(/Maps routing onto a closed bridge/.test(p.text(p.one('#view-panel'))));
    p.click(p.one('#tab-pressure'));
    eq(p.all('.pickup-note').length, 0);
    assert.ok(/Pick-up time\s*90% within [\d,]+ s \(2 runs\)\s*Today/.test(p.text(p.one('#view-panel'))), p.text(p.one('#view-panel')));
  });

  test('speed honest pick-up time OFF: with row 56 OFF every pick-up is kept as before (the 16-hour wait of Burson\'s alert from the stop included), and openPickup_ never asks the run log: the run-time record (RUN_LEDGER) is the same as in the same world with runLogDownEnd_ doing nothing', () => {
    const off = offWorld();
    const none = world({ engine: true, setup: t => t.bot.ev('var __down = 0; runLogDownEnd_ = () => { __down++; return 0; }') });
    eq(none.t.bot.ev('__down'), 0);
    eq(JSON.parse(off.t.g.props.get('RUN_LEDGER')), JSON.parse(none.t.g.props.get('RUN_LEDGER')));
    const maps = mapsRow(off);
    const waited = Math.round((Number(maps.seen_at) - Number(maps.source_at)) / 1000);
    const p = JSON.parse(off.t.g.props.get('RUN_LEDGER')).p;
    assert.ok(p.some(s => Math.abs(s - waited) <= 60) && p.some(s => s <= 120), JSON.stringify([p, waited]));
  });

  // =================================================================================================================
  // Row 56 ON: the Now strip and what the page can't see (DashboardData.gs dlHealth_, dlRunLog_, dlCannotSee_)
  // =================================================================================================================

  test('speed honest dashboard: with row 56 ON the Now strip says when the bot ran in the last 7 days, from its run log: each stretch it was not running or paused, newest first, in the run log\'s own words with the times it recorded, the stretch still going, and where its run log starts (before then, not known); what the page can\'t see says the same', () => {
    const w = onWorld();
    const t = w.t;
    const before = kept(t);
    const s = snap(t);
    eq(kept(t), before);  // read-only: no tab, property or cache entry of the bot's changes
    const r = s.health.runLog;
    const log = t.bot.runLogRead_(t.sheet());
    const gaps = log.spans.filter(x => ['not running', 'paused', 'failing', 'not known'].indexOf(x.state) >= 0);
    // the run log: the golden steps' 14 minutes with no run, the pause, the 18-hour stop
    eq(gaps.map(x => x.state), ['not running', 'paused', 'not running']);
    const stop = gaps[2];
    const pause = gaps[1];
    assert.ok(stop.to - stop.from > 17 * HOUR && stop.from >= w.times.stopFrom - 2 * MIN && stop.to <= w.times.back, JSON.stringify(stop));
    eq([r.ok, r.why, r.start, r.last, r.days, r.more], [true, '', log.start, log.last, 7, 0]);
    eq(r.spans, gaps.slice().reverse().map(x => ({ from: x.from, to: x.to, state: x.state, words: t.bot.runLogWords_(x) })));
    eq(r.spans[0].words, `the bot was not running from ${T(t, stop.from)} to ${T(t, stop.to)} ET`);
    eq(r.spans[1].words, `the bot was paused (Bot OFF on the Control tab) from ${T(t, pause.from)} to ${T(t, pause.to)} ET`);
    const open = log.spans.find(x => x.open);
    eq(r.open, { state: 'running', from: open.from, last: open.to });
    eq(t.bot.dlClock_(log.start, s.asOf), 'Oct 14, 8:01 AM');
    eq(r.notes, ['Its run log starts Oct 14, 8:01 AM: before then, not known.']);
    eq(s.health.cannotSee.slice(-1), [{ what: 'When the bot was running before Oct 14, 8:01 AM',
      why: 'Its run log (Control row 56) starts then. Before that the bot kept no record of when it was running, so older speed numbers can\'t be checked against it.',
      fix: '' }]);
    // what the health check says is as with row 56 OFF in the same world (the run log adds to it, never changes it)
    const offHealth = snap(offWorld().t).health;
    eq([s.health.level, s.health.headline, s.health.why, s.health.fix, s.health.sources], [offHealth.level, offHealth.headline, offHealth.why,
      offHealth.fix, offHealth.sources]);
    eq(s.health.cannotSee.slice(0, -1), offHealth.cannotSee);
    const text = JSON.stringify(s);
    assert.ok(!EMOJI.test(JSON.stringify(r)) && !ADDRESS.test(text), text.match(ADDRESS));
  });

  test('speed honest dashboard: a "When the bot ran" tab whose A1 is not the bot\'s is not read: the Now strip says when the bot ran is not known and why, what the page can\'t see says what to do, and the pick-up note says nothing is left out; the tab is never written', () => {
    const t = onWorld().t;
    const sh = t.sheet().getSheetByName(RUN_LOG_TAB);
    const a1 = sh.cell(1, 1);
    sh.getRange(1, 1).setValue('My own notes on when the bot ran');
    try {
      const before = JSON.stringify(sh.rows);
      const s = snap(t);
      const why = 'a "When the bot ran" tab the bot didn\'t make is in the way';
      eq([s.health.runLog.ok, s.health.runLog.spans, s.health.runLog.notes],
        [false, [], [`Not known: the "When the bot ran" tab could not be read (${why}).`]]);
      eq(s.health.cannotSee.slice(-1), [{ what: 'When the bot was running', why: `The "When the bot ran" tab could not be read: ${why}.`,
        fix: 'Open the bot\'s sheet: the tab must keep the title the bot wrote in A1.' }]);
      eq(s.pressure.load.pickupNote, `${PICKUP_HEAD}not known, its run log can't be read (${why})`);
      eq(JSON.stringify(sh.rows), before);
    } finally {
      sh.getRange(1, 1).setValue(a1);
    }
  });

  test('speed honest dashboard: dlRunLog_ on hand-made logs: running the whole time (in the 7 days, or since a log that started within them), no run recorded lately, a pause still going, at most 10 stretches (newest first) and how many more, not known before a log or without one, and a log that can\'t be read', () => {
    const b = onWorld().t.bot;
    const now = Date.UTC(2026, 9, 20, 16, 0);  // Oct 20, 12:00 PM ET
    const span = (from, to, state, extra) => Object.assign({ from, to, state, why: '', listed: null }, extra || {});
    const T2 = ms => b.speedTime_(ms);
    // running the whole time: in the 7 days, and since a log that started within them
    const old = { ok: true, why: '', start: now - 30 * DAY, last: now - MIN, spans: [span(now - 30 * DAY, now - MIN, 'running', { open: true })] };
    eq(b.dlRunLog_(old, now), { ok: true, why: '', start: old.start, last: old.last, days: 7, spans: [], more: 0,
      open: { state: 'running', from: old.start, last: old.last }, notes: ['It was running the whole time in the last 7 days.'] });
    const young = Object.assign({}, old, { start: now - 2 * HOUR, spans: [span(now - 2 * HOUR, now - MIN, 'running', { open: true })] });
    eq(b.dlRunLog_(young, now).notes, ['It was running the whole time since its run log started.', 'Its run log starts 10:00 AM: before then, not known.']);
    // no run recorded for more than 10 minutes: never "the whole time" up to now
    const quiet = Object.assign({}, old, { last: now - 25 * MIN, spans: [span(old.start, now - 25 * MIN, 'running', { open: true })] });
    eq(b.dlRunLog_(quiet, now).notes, ['It was running the whole time in the last 7 days, up to its last recorded run (11:35 AM).',
      'No run is recorded after 11:35 AM (more than 10 minutes ago).']);
    // a pause still going: its words say so; an older stretch out of the 7 days is not listed
    const paused = { ok: true, why: '', start: old.start, last: now - MIN, spans: [span(old.start, now - 9 * DAY, 'running'),
      span(now - 9 * DAY, now - 8 * DAY, 'not running'), span(now - 8 * DAY, now - HOUR, 'running'), span(now - HOUR, now - MIN, 'paused', { open: true })] };
    const p = b.dlRunLog_(paused, now);
    eq([p.spans, p.open, p.notes], [[{ from: now - HOUR, to: now - MIN, state: 'paused', open: true,
      words: `the bot was paused (Bot OFF on the Control tab) from ${T2(now - HOUR)} to ${T2(now - MIN)} ET (still going at its last run)` }],
    { state: 'paused', from: now - HOUR, last: now - MIN }, []]);
    // 12 stretches: the newest 10, and how many more
    const many = { ok: true, why: '', start: old.start, last: now - MIN, spans: [] };
    for (let i = 12; i >= 1; i--) many.spans.push(span(now - i * HOUR, now - i * HOUR + 20 * MIN, i % 2 ? 'failing' : 'not known', { why: 'the run log was OFF (Control row 56)' }));
    const m = b.dlRunLog_(many, now);
    eq([m.spans.length, m.spans[0].from, m.spans[9].from, m.more, m.notes], [10, now - HOUR, now - 10 * HOUR, 2,
      ['And 2 more stretches in the last 7 days: see the "When the bot ran" tab.']]);
    eq(m.spans[0].words, `the bot's runs were failing from ${T2(now - HOUR)} to ${T2(now - 40 * MIN)} ET`);
    eq(m.spans[1].words, `it is not known whether the bot was running from ${T2(now - 2 * HOUR)} to ${T2(now - 100 * MIN)} ET (the run log was OFF (Control row 56))`);
    // no log yet, a log that can't be read, and nothing at all
    eq(b.dlRunLog_({ ok: true, why: '', start: 0, last: 0, spans: [] }, now).notes, ['Not known yet: its run log has no record. It starts at the bot\'s next run with row 56 ON.']);
    eq(b.dlRunLog_({ ok: false, why: 'the "When the bot ran" tab could not be read: Service error', start: 0, last: 0, spans: [] }, now).notes,
      ['Not known: the "When the bot ran" tab could not be read (Service error).']);
    eq([b.dlRunLog_(null, now).ok, b.dlRunLog_(null, now).notes], [false, ['Not known: the "When the bot ran" tab could not be read (it could not be read).']]);
    // what the page can't see, for each
    const cs = r => b.dlCannotSee_({ earlyWave: true, proactiveWatch: true, directBq: true, trackOutcomes: true }, { tab: true, mine: true, oldestAt: 1, rows: [] },
      { count: 1, missing: 0 }, now, null, r).filter(c => /When the bot was running/.test(c.what));
    eq([cs(b.dlRunLog_(old, now)), cs(b.dlRunLog_(young, now)).map(c => c.what), cs(undefined)], [[], ['When the bot was running before 10:00 AM'], []]);
    eq(cs(b.dlRunLog_({ ok: true, why: '', start: 0, last: 0, spans: [] }, now)), [{ what: 'When the bot was running',
      why: 'Its run log (Control row 56) has no record yet: it starts at the bot\'s next run. Until then the bot keeps no record of when it was running, so speed numbers can\'t be checked against it.',
      fix: '' }]);
  });

  // =================================================================================================================
  // Row 56 ON: Caught early (DashboardData.gs dlEarly_)
  // =================================================================================================================

  test('speed honest dashboard: with row 56 ON Caught early has the Head start tab\'s six new lines with the others, and each story\'s speed check (the tab\'s "Speed check: was the bot running?" cell): the Maps story, whose race with Burson\'s alert spans the stop, reads "not comparable: the bot was not running from … ET"; its head start as before', () => {
    const t = onWorld().t;
    const s = snap(t);
    const labels = s.early.numbers.map(n => n.label);
    const at = labels.indexOf('Of Burson\'s alerts, those on a story this app had alerted first (same post or same story)');
    eq(labels.slice(at + 1), SIX);
    s.early.numbers.slice(at + 1).forEach(n => assert.ok(n.week && n.month, JSON.stringify(n)));
    const maps = s.early.stories.find(x => /Maps routing onto a closed bridge/.test(x.story));
    const tab = headStartRow(t, 'Maps routing onto a closed bridge');
    assert.ok(/not comparable: the bot was not running from 2026-10-14 \d\d:\d\d to 2026-10-1[45] \d\d:\d\d ET/.test(tab.check), tab.check);
    eq([maps.speedCheck, maps.headStart], [tab.check, String(tab.row[6])]);
    assert.ok(maps.headStart, 'the head start that was there');
    // every story has its cell (blank: no Burson alert to race), and the old callers' answer has no such field
    s.early.stories.forEach(x => assert.ok(typeof x.speedCheck === 'string', JSON.stringify(x)));
    eq(s.early.speedCheckWhy, undefined);
    assert.ok(!('speedCheck' in t.bot.dlEarly_(t.sheet()).stories[0]));
    eq(t.bot.dlEarly_(t.sheet(), { speedHonest: true }).stories.find(x => /Maps/.test(x.story)).speedCheck, tab.check);
  });

  test('speed honest dashboard: row 56 turned ON before the Head start tab is rebuilt with its speed check: Caught early says the column comes at its next rebuild (no story gets an empty speed check), the Now strip says the run log has no record yet, and the pick-up note says nothing is left out yet', () => {
    const t = offWorld().t;
    t.control().getRange(56, 2).setValue('ON');
    try {
      const s = snap(t);
      eq(s.early.speedCheckWhy, 'The Head start tab has no "Speed check: was the bot running?" column yet: the bot adds it at its next rebuild (every 10 minutes).');
      assert.ok(s.early.stories.length && s.early.stories.every(x => !('speedCheck' in x)));
      eq([s.health.runLog.ok, s.health.runLog.start, s.health.runLog.notes], [true, 0, ['Not known yet: its run log has no record. It starts at the bot\'s next run with row 56 ON.']]);
      eq(s.health.cannotSee.slice(-1)[0].what, 'When the bot was running');
      eq(s.pressure.load.pickupNote, `${PICKUP_HEAD}not known yet, its run log has no record (it starts at the bot's next run)`);
      eq(t.sheet().getSheetByName(RUN_LOG_TAB), null);  // the dashboard only reads: the bot makes the tab at its next run
    } finally {
      t.control().getRange(56, 2).setValue('OFF');
    }
  });

  // =================================================================================================================
  // Row 56 ON: the alert's timeline (DashboardData.gs dlTimelineOf_) and the pick-up note (dlPressure_)
  // =================================================================================================================

  test('speed honest dashboard: with row 56 ON Burson\'s alert picked up after the stop says, right after "The bot picked it up", how long it waited for the bot to run and why (the run log\'s words); an alert picked up at once says nothing more', () => {
    const w = onWorld();
    const t = w.t;
    const maps = mapsRow(w);
    const before = kept(t);
    const d = t.bot.dashDetail('alert', maps.alert_id);
    eq(kept(t), before);
    const at = d.timeline.findIndex(x => x.what === 'The bot picked it up');
    const log = t.bot.runLogRead_(t.sheet());
    const stop = log.spans.filter(x => x.state === 'not running').slice(-1)[0];
    const waited = Math.round((Number(maps.seen_at) - Number(maps.source_at)) / MIN);
    assert.ok(waited > 15 * 60, String(waited));
    eq(d.timeline[at + 1], { at: Number(maps.seen_at),
      what: `It waited ${waited.toLocaleString('en-US')} min for the bot to run: the bot was not running from ${T(t, stop.from)} to ${T(t, stop.to)} ET` });
    eq(d.timeline.filter(x => /waited/.test(x.what)).length, 1);
    const fresh = rows(t).slice(-1)[0];
    assert.ok(Number(fresh.source_at) > w.times.back, 'the fresh alert came after the stop');
    eq(t.bot.dashDetail('alert', fresh.alert_id).timeline.filter(x => /waited/.test(x.what)), []);
  });

  test('speed honest dashboard: dlTimelineOf_ on hand-made rows: a wait of 10 minutes is no line, 10 minutes and a second is; the bot running the whole time gives the minutes alone; before the run log, "not known"; more stretches are counted; only Burson\'s alerts, and only with the run log given', () => {
    const b = onWorld().t.bot;
    const t0 = Date.UTC(2026, 9, 20, 14, 0);
    const T2 = ms => b.speedTime_(ms);
    const log = { ok: true, why: '', start: t0 - DAY, last: t0 + 5 * HOUR, spans: [
      { from: t0 - DAY, to: t0 + HOUR, state: 'running', why: '', listed: null },
      { from: t0 + HOUR, to: t0 + 2 * HOUR, state: 'not running', why: '', listed: null },
      { from: t0 + 2 * HOUR, to: t0 + 3 * HOUR, state: 'running', why: '', listed: null },
      { from: t0 + 3 * HOUR, to: t0 + 4 * HOUR, state: 'paused', why: 'Bot (Control B2) was OFF', listed: null },
      { from: t0 + 4 * HOUR, to: t0 + 5 * HOUR, state: 'running', why: '', listed: null }] };
    const row = (from, seen) => ({ source_at: from, seen_at: seen, created_at: seen + 1000 });
    const waits = (r, kind, o) => b.dlTimelineOf_(r, kind, o).filter(x => /waited/.test(x.what)).map(x => x.what);
    eq(waits(row(t0, t0 + 10 * MIN), 'burson', { log }), []);
    eq(waits(row(t0, t0 + 10 * MIN + 1000), 'burson', { log }), ['It waited 10 min for the bot to run']);
    eq(waits(row(t0 + 30 * MIN, t0 + 2 * HOUR + MIN), 'burson', { log }),
      [`It waited 91 min for the bot to run: the bot was not running from ${T2(t0 + HOUR)} to ${T2(t0 + 2 * HOUR)} ET`]);
    eq(waits(row(t0 + 30 * MIN, t0 + 4 * HOUR + MIN), 'burson', { log }),
      [`It waited 211 min for the bot to run: the bot was not running from ${T2(t0 + HOUR)} to ${T2(t0 + 2 * HOUR)} ET (and 1 more stretch)`]);
    eq(waits(row(t0 - 2 * DAY, t0), 'burson', { log }),
      [`It waited 2,880 min for the bot to run: not known: before the bot kept its run log (${T2(t0 - DAY)} ET)`]);
    eq([waits(row(t0, t0 + HOUR), 'watch', { log }), waits(row(t0, t0 + HOUR), 'burson'), waits(row(t0, 0), 'burson', { log })], [[], [], []]);
    // the line comes right after "The bot picked it up", whatever else shares its time
    const tl = b.dlTimelineOf_(Object.assign(row(t0 + 30 * MIN, t0 + 2 * HOUR + MIN), { updated_at: t0 + 2 * HOUR + MIN }), 'burson', { log });
    eq(tl.map(x => x.what), ['Burson\'s alert reached the space', 'The bot picked it up',
      `It waited 91 min for the bot to run: the bot was not running from ${T2(t0 + HOUR)} to ${T2(t0 + 2 * HOUR)} ET`, 'The bot recorded its review']);
  });

  test('speed honest dashboard: with row 51 and row 56 ON "How hard the bot is working" shows, under the usual pick-up time, the pick-up time leaving out the alerts posted before the bot came back, with how many and since when that list is kept today (review R1)', () => {
    const t = onWorld().t;
    const s = snap(t);
    const L = JSON.parse(t.g.props.get('RUN_LEDGER'));
    const p90 = t.bot.openQuantile_(L.pc, 0.9);
    eq(s.pressure.load.pickupNote, `${PICKUP_HEAD}90% within ${p90} s (${L.pc.length} alert${L.pc.length === 1 ? '' : 's'} since ` +
      `${t.bot.dlClock_(L.pcs, t.g.clock.now)})`);
    eq([s.pressure.load.pickupKeptP90Sec, s.pressure.load.pickupKept], [p90, L.pc.length]);
    const b = t.bot;
    const now = Date.UTC(2026, 9, 20, 16, 0);
    const log = start => ({ ok: true, why: '', start, last: now - MIN, spans: [] });
    eq(b.dlPickupNote_(b.dlRunLog_(log(Date.UTC(2026, 9, 20, 13, 14)), now), now, { p90: 61.4, n: 3, since: Date.UTC(2026, 9, 20, 13, 14) }),
      `${PICKUP_HEAD}90% within 61 s (3 alerts since 9:14 AM)`);
    eq(b.dlPickupNote_(b.dlRunLog_(log(Date.UTC(2026, 9, 20, 3, 59)), now), now, { p90: 1200, n: 1, since: 0 }), `${PICKUP_HEAD}90% within 1,200 s (1 alert)`);
    eq(b.dlPickupNote_(b.dlRunLog_(log(Date.UTC(2026, 9, 20, 3, 59)), now), now, { p90: null, n: 0, since: Date.UTC(2026, 9, 20, 13, 14) }),
      `${PICKUP_HEAD}none counted yet today since 9:14 AM`);
    eq(b.dlPickupNote_(b.dlRunLog_(log(Date.UTC(2026, 9, 20, 3, 59)), now), now), `${PICKUP_HEAD}none counted yet today`);
    // row 51 OFF: the load is not measured, and no note
    t.control().getRange(51, 2).setValue('OFF');
    try {
      const off = snap(t).pressure.load;
      eq([off.measured, 'pickupNote' in off], [false, false]);
    } finally {
      t.control().getRange(51, 2).setValue('ON');
    }
  });

  // =================================================================================================================
  // Row 56 ON: the pick-up time itself (OpenEngine.gs openPickup_, D4)
  // =================================================================================================================

  test('speed honest pick-up time: with row 56 ON the pick-up of Burson\'s alert posted during the 18-hour stop is left out of a list of its own (RUN_LEDGER.pc), and the fresh alert\'s after it is kept there; the usual record (RUN_LEDGER.p), which C51 and the slow pick-up guard read, keeps every pick-up as with row 56 OFF (review R1)', () => {
    const on = onWorld();
    const off = offWorld();
    const LOn = JSON.parse(on.t.g.props.get('RUN_LEDGER'));
    const pOn = LOn.p;
    const pOff = JSON.parse(off.t.g.props.get('RUN_LEDGER')).p;
    const waited = r => Math.round((Number(r.seen_at) - Number(r.source_at)) / 1000);
    const backlog = waited(mapsRow(off));
    assert.ok(backlog > 15 * 3600, String(backlog));
    assert.ok(pOff.some(s => Math.abs(s - backlog) <= 60), JSON.stringify([pOff, backlog]));
    // (review R1: this was "pOn has no pick-up over an hour"; RUN_LEDGER.p is now the same ON as OFF, and the pick-ups
    // that leave out the backlog are on their own list)
    eq(pOn, pOff);
    eq(LOn.pc.filter(s => s > 3600), []);
    eq(LOn.pc, pOff.filter(s => s <= 3600));
    assert.ok(LOn.pc.length >= 1, 'the fresh alert\'s pick-up is kept');
    eq(['pc', 'pcd', 'pcs'].filter(k => k in JSON.parse(off.t.g.props.get('RUN_LEDGER'))), []);
    // why: the pick-up came after the end of the stop the run log recorded, and the alert was posted before it
    const stop = on.t.bot.runLogRead_(on.t.sheet()).spans.filter(x => x.state === 'not running').slice(-1)[0];
    eq([on.t.bot.runLogDownEnd_(), Number(mapsRow(on).source_at) < stop.to], [stop.to, true]);
    // the p90 the page shows on its usual line is of every pick-up, as with row 56 OFF; the new line's of the list kept apart
    eq(snap(on.t).pressure.load.pickupP90Sec, off.t.bot.openQuantile_(pOff, 0.9));
    eq(snap(on.t).pressure.load.pickupKeptP90Sec, on.t.bot.openQuantile_(LOn.pc, 0.9));
    // what C51 and the slow pick-up guard read is the same ON and OFF: openUsage_'s pickup (and openShrinkMs_ of it)
    const uOn = on.t.bot.openUsage_(on.t.g.clock.now);
    const uOff = off.t.bot.openUsage_(off.t.g.clock.now);
    eq([uOn.pickup, on.t.bot.openShrinkMs_(uOn)], [uOff.pickup, off.t.bot.openShrinkMs_(uOff)]);
    eq([uOn.pickupC.n, 'pickupC' in uOff], [LOn.pc.length, false]);
    // and nothing of it reached S-F Burson (B25): the bot only read it, ON or OFF
    eq([on.t.chat.botPosts(REAL).length, off.t.chat.botPosts(REAL).length], [0, 0]);
  });

  // =================================================================================================================
  // Row 56 ON: the page (DashboardJs.html)
  // =================================================================================================================

  test('speed honest dashboard: the page with row 56 ON: the Now strip has "When the bot ran (last 7 days, from its run log):" and a line for each stretch (first letter capital), then where the run log starts; Caught early has the six new lines and the Maps story\'s speed check under its head start; the pick-up time has its note under it', () => {
    const t = onWorld().t;
    const s = snap(t);
    const p = page(t);
    const box = p.one('#runlog');
    assert.ok(box, p.text(p.one('#now')));
    eq(p.all('#runlog li').map(li => p.text(li)), s.health.runLog.spans.map(x => `${x.words.charAt(0).toUpperCase()}${x.words.slice(1)}.`));
    assert.ok(/^When the bot ran \(last 7 days, from its run log\):\s*The bot was not running from 2026-10-14/.test(p.text(box)), p.text(box));
    assert.ok(p.text(box).endsWith('Its run log starts Oct 14, 8:01 AM: before then, not known.'), p.text(box));
    // the newest stretch is in sight with how many there were; the full list and the notes are folded behind one button
    // (a bad week's stretches never push the first thing to do out of the first screen), and open on a click
    const total = s.health.runLog.spans.length + (s.health.runLog.more || 0);
    assert.ok(p.text(box.querySelector('p')).indexOf(`${s.health.runLog.spans[0].words.charAt(0).toUpperCase()}${s.health.runLog.spans[0].words.slice(1)}`) > 0, p.text(box));
    if (total > 1) assert.ok(p.text(box.querySelector('p')).indexOf(`(the latest of ${total} such stretches in the last 7 days)`) > 0, p.text(box));
    eq([p.one('#runlog-list').hidden, p.one('#runlog-toggle').getAttribute('aria-expanded')], [true, 'false']);
    p.click(p.one('#runlog-toggle'));
    eq([p.one('#runlog-list').hidden, p.one('#runlog-toggle').getAttribute('aria-expanded')], [false, 'true']);
    p.click(p.one('#runlog-toggle'));
    eq(p.one('#runlog-list').hidden, true);
    p.click(p.one('#tab-early'));
    const view = p.text(p.one('#view-panel'));
    SIX.forEach(l => assert.ok(view.indexOf(l) >= 0, l));
    const maps = s.early.stories.find(x => /Maps/.test(x.story));
    eq(p.all('.speed-check').map(x => p.text(x)), [`Speed check: ${maps.speedCheck}`]);
    p.click(p.one('#tab-pressure'));
    eq(p.all('.pickup-note').map(x => p.text(x)), [s.pressure.load.pickupNote]);
    assert.ok(/^Leaving out alerts posted before the bot came back after a stop, a pause or failing runs \(row 56\): 90% within [\d,]+ s \(\d+ alerts? since /
      .test(s.pressure.load.pickupNote), s.pressure.load.pickupNote);
    assert.ok(/Pick-up time\s*90% within [\d,]+ s \(2 runs\)\s*Leaving out alerts posted before the bot came back/.test(p.text(p.one('#view-panel'))),
      p.text(p.one('#view-panel')));
  });

  test('speed honest dashboard: the bot\'s code never turns row 56 ON (DashboardData.gs, DashboardJs.html and OpenEngine.gs only read it)', () => {
    const fs = require('fs');
    const path = require('path');
    ['DashboardData.gs', 'DashboardJs.html', 'OpenEngine.gs'].forEach(f => {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      assert.ok(!/speedHonest\s*[:=]\s*true/.test(src), f);
      assert.ok(!/setValue\(\s*['"]ON['"]/.test(src), f);
    });
  });
};
