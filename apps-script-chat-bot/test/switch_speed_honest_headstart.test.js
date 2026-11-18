// The Head start tab's speed check (HeadStart.gs headStartHonest_; Control row 56, "Speed numbers: leave out when the
// bot was not running", switch key speedHonest, RunLog.gs). OFF (the default): the tab is exactly what it was, 21 columns
// wide, and a rebuild reads nothing new. ON: six more headline lines and one more note NEXT TO the ones that were there
// (which never change), and one more column in both stories tables, after the hidden state columns, "Speed check: was
// the bot running?": the race on the same post while the bot was running (signed median, with how many posts it is
// of), Burson alerting the issue first on another post (counted apart, never a win or a loss), races in which the bot
// was not running, paused or failing (not comparable, with the run log's own times), Burson's alerts listed while the
// bot was OFF, and races from before the run log started (not known). Every address is made up (.test).
'use strict';

module.exports = H => {
  const { test, eq, assert, B, F, NOW, e2e, makeGoogle, TEST_FEED, TRIAGED } = H;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const TAB = 'Head start';
  const CHECK = 'Speed check: was the bot running?';
  const LINES = [
    'Race on the same post, while the bot was running: median head start over Burson ("behind by" when Burson was first)',
    'Race on the same post, while the bot was running: posts this app alerted first, and posts Burson alerted first',
    'Burson alerted the issue first, on another post (not counted as a win or a loss)',
    'Not comparable: the bot was not running, paused or failing between the two alerts',
    'Burson\'s alerts posted while the bot was OFF and never reviewed (listed when Bot was turned back ON)',
    'Not known: from before the bot kept its run log',
  ];
  const REVERSE_LINE = 'Of Burson\'s alerts, those on a story this app had alerted first (same post or same story)';
  const NOTE_HEAD = 'The lines from "Race on the same post" on leave out every race in which the bot was not running, paused or failing between the two alerts';
  const NOTE_TAIL = ': a stretch with no runs can hold back this app\'s alert, and Burson\'s alerts posted while the bot was OFF were never ' +
    'recorded on the Alert log. They are counted apart, never as a win or a loss, and the "Speed check" column says why for each story. ' +
    'The lines above them are counted as before.';
  const RUNNING = 'the bot was running the whole time';
  const NOTE_START = 'The lines from "Race on the same post" on ';  // the speed check's note, whatever follows
  const T = ms => B.speedTime_(ms);
  const ED = B.ev('ED_ALERT_INGESTED_');
  const WATCH = B.ev('PW_ALERT_INGESTED_');
  const ONGOING = B.ev('ONGOING_STATUS_SUFFIX_');
  const MAIN = 'spaces/MIRROR > (isolated)';
  const TAG = 'Product - Perceived bias';
  const ZAPIER = { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' };
  const link = n => `https://x.com/user${n}/status/${70000 + n}`;
  const key = n => `x.com/status/${70000 + n}`;
  /** An Alert-log row about post `n` (as test/switch_head_start.test.js makes them); `fields` go on forwarded_fields. */
  const row = (id, at, n, extra, fields) => Object.assign({
    alert_id: id, space: MAIN, source_at: at, created_at: at + MIN, record_key: key(n), status: 'ok', requested: [], email_status: '',
    decision: '', forwarded_fields: Object.assign({ post_url: link(n), social_network: 'X', author: `user${n}`, product: 'Search',
      exposure_tag: TAG, issue_name: `Issue ${n}` }, fields || {}),
  }, extra || {});
  const card = (id, at, n, snap, fields) => row(id, at, n, { ingested: ED }, Object.assign({ early_detection: snap || {} }, fields || {}));
  const watch = (id, at, n, fields) => row(id, at, n, { ingested: WATCH }, fields);
  const burson = (id, at, n, fields, extra) => row(id, at, n, extra, fields);
  /** A run log as RunLog.gs runLogRead_ gives it: running from `start` to `last` but for the `gaps` ([from, to, state, why?, listed?]). */
  const runLog = (start, last, gaps) => {
    const spans = [];
    let at = start;
    (gaps || []).forEach(([from, to, state, why, listed]) => {
      if (from > at) spans.push({ from: at, to: from, state: 'running', why: '', listed: null });
      spans.push({ from, to, state, why: why || '', listed: listed || null });
      at = to;
    });
    if (last > at) spans.push({ from: at, to: last, state: 'running', why: '', listed: null, open: true });
    return { ok: true, why: '', start, last, spans };
  };
  /** The report of `rows` (with Burson's `listed` alerts for the speed check, as refreshHeadStart_ does) and its speed check. */
  const checked = (rows, log, listed, now) => {
    const at = now || NOW;
    const report = B.headStartReport_(rows, null, at);
    const all = (listed || []).length ? rows.concat(B.headStartOffRows_(listed)) : rows;
    const r2 = (listed || []).length ? B.headStartReport_(all, null, at) : report;
    report.honest = B.headStartHonest_(r2, B.headStartBurson_(all), log, listed || [], at);
    return report;
  };
  const cellOf = (h, s) => h.byId.get(B.headStartStoryKey_(s)) || '';
  const cells = r => Object.fromEntries(r.stories.map(s => [s.alert_id, cellOf(r.honest, s)]));
  const numbers = (r, k) => B.headStartCheckRows_(r.honest).map(x => x[k === 'month' ? 2 : 1]);
  const at = (rows, label) => rows.findIndex(x => x[0] === label || String(x[0]).indexOf(label) === 0);
  /** The rows of a tab with the speed check's lines and note left out, each cut to 21 columns: what the tab was without it. */
  const without = rows => rows.filter(x => LINES.indexOf(x[0]) < 0 && String(x[0]).indexOf(NOTE_START) !== 0).map(x => x.slice(0, 21));

  // =================================================================================================================
  // The constants: the labels a person sees, as the design gives them
  // =================================================================================================================

  test('speed honest head start: the six lines, the column and the switch are as designed: the labels in their order, the column "Speed check: was the bot running?" after the three hidden state columns (column 22), and no line starts as one the dashboard\'s answer looks up', () => {
    eq(B.ev('HEAD_START_CHECK_LINES_'), LINES);
    eq([B.ev('HEAD_START_CHECK_HEADER_'), B.ev('HEAD_START_HEADER_.length + 1'), B.ev('HEAD_START_STATE_COL_'), B.ev('HEAD_START_STATE_COLS_')],
      [CHECK, 22, 19, 3]);
    // DashboardData.gs answers "Did we beat Burson?" from the lines that start with these: none of the new ones does
    LINES.forEach(l => assert.ok(!/^(?:This app alerted first|Burson alerted first|Of those, also alerted by Burson)/.test(l), l));
  });

  // =================================================================================================================
  // OFF: exactly as before
  // =================================================================================================================

  /**
   * The bot after setup() with a tester in B30, its Alert log seeded as earlier runs would have left it, and a day of
   * runs: a race while the bot runs (a card, then Burson's alert on its post 19 minutes later, with the IMs' draft), an
   * 18-hour stop with no run (Burson posts during it; the card on that post comes once the bot is back), Bot (B2) OFF
   * while Burson posts two alerts (MAPS, PARIS), Bot ON again (with row 56 ON the bot lists them), the cards on those two
   * posts, and Burson's later alert of PARIS's issue on another post, an Ongoing Issue, 2 hours after its card (so today's
   * numbers read a head start of 2 h over it). Then the Head start tab is rebuilt (t.rebuild()).
   * opts.on: row 56 ON from the start. opts.hold: no Head start rebuild until t.rebuild(). t.runs: each run's [start, end].
   */
  const scenario = opts => {
    const o = opts || {};
    const t = e2e(makeGoogle(NOW));
    t.runs = [];
    t.bot.__runs = t.runs;
    t.bot.ev('openLedgerRecord_ = (f => (s, e, x) => { __runs.push([s, e]); return f(s, e, x); })(openLedgerRecord_)');
    t.bot.setup();
    t.set('B30', 'tester@team.test');
    const log = () => t.bot.sheetTable_(t.sheet(), 'Alert log', t.bot.ev('ALERT_COLUMNS_'), 'alert_id', 4000);
    const fields = text => B.parseAlert_(text).fields;
    t.card = (id, when, text) => {
      const f = fields(text);
      log().append({ alert_id: id, space: `${TEST_FEED} > ${TRIAGED}`, source_at: when, created_at: when + 1000, record_key: B.recordKey_(f),
        ingested: ED, status: 'ok', requested: [], email_status: '', decision: '', forwarded_fields: { post_url: f.post_url,
          social_network: f.social_network, product: f.product, exposure_tag: f.exposure_tag, issue_name: B.issueNameText_(f.issue_name),
          early_detection: {} } });
    };
    t.drafts = [];
    t.bot.speedImDrafts_ = () => t.drafts;  // the IMs' drafts (BigQuery, which the tests can't reach)
    t.bot.speedLogged_ = () => [];
    const real = t.bot.maybeRefreshHeadStart_;
    if (o.hold) t.bot.maybeRefreshHeadStart_ = () => false;
    if (o.on) t.control().getRange(56, 2).setValue('ON');
    t.poll();
    t.poll();
    const s = {};
    // 1. a race while the bot runs: the card, Burson's alert on its post 19 minutes later, the IMs' draft 30 minutes after that
    s.aioCard = t.g.clock.now;
    t.card('QA-AIO', s.aioCard, F.AIO);
    for (let i = 0; i < 19; i++) t.poll();
    s.aio = Date.parse(t.chat.say(TEST_FEED, F.AIO, ZAPIER).createTime);
    t.drafts = [{ post_url: fields(F.AIO).post_url, at: s.aio + 30 * MIN, subject: '⭐ SOCIAL ALERT ⭐: AIO', drafted_by: 'im@ops.test' }];
    t.poll();
    t.poll();
    // 2. 18 hours with no run: Burson posts P0_OK half way; the card on its post comes once the bot is back
    s.stopFrom = t.runs[t.runs.length - 1][1];
    t.g.clock.now += 9 * HOUR;
    s.p0 = Date.parse(t.chat.say(TEST_FEED, F.P0_OK, ZAPIER).createTime);
    t.g.clock.now += 9 * HOUR;
    t.poll();
    s.stopTo = t.runs[t.runs.length - 1][0];
    t.poll();
    t.poll();
    s.p0Card = t.g.clock.now;
    t.card('QA-P0', s.p0Card, F.P0_OK);
    t.poll();
    // 3. Bot (B2) OFF while Burson posts MAPS and PARIS; Bot ON again; the cards on those posts; Burson's later alert of
    // PARIS's issue on another post (an Ongoing Issue), 2 hours after its card, as the main flow would have logged it
    t.set('B2', 'OFF');
    t.poll();
    s.pausedFrom = t.runs[t.runs.length - 1][0];
    t.poll();
    s.maps = Date.parse(t.chat.say(TEST_FEED, F.MAPS, ZAPIER).createTime);
    s.paris = Date.parse(t.chat.say(TEST_FEED, F.PARIS, ZAPIER).createTime);
    t.poll();
    t.poll();
    s.pausedTo = t.runs[t.runs.length - 1][1];
    t.set('B2', 'ON');
    for (let i = 0; i < 3; i++) t.poll();
    s.backOn = t.runs[t.runs.length - 3][0];  // the first run with Bot ON: the paused stretch ends at its start
    s.mapsCard = t.g.clock.now;
    s.parisCard = t.g.clock.now + 1000;
    t.card('QA-MAPS', s.mapsCard, F.MAPS);
    t.card('QA-PARIS', s.parisCard, F.PARIS);
    s.later = s.parisCard + 2 * HOUR;
    log().append({ alert_id: 'QA-PARIS-2', space: `${TEST_FEED} > ${TRIAGED}`, source_at: s.later, created_at: s.later + 1000,
      record_key: 'x.com/status/1845000000000000099', ingested: '', status: 'ok', requested: [], email_status: '', decision: '',
      forwarded_fields: { post_url: 'https://x.com/someone/status/1845000000000000099', social_network: 'X', product: 'Search',
        exposure_tag: TAG, issue_name: B.issueNameText_(fields(F.PARIS).issue_name), issue_status: ONGOING } });
    for (let i = 0; i < 16; i++) {  // 2 h 24 min of runs, 9 minutes apart (never "not running": 10 minutes or less)
      t.g.clock.now += 8 * MIN;
      t.poll();
    }
    t.s = s;
    t.release = () => { t.bot.maybeRefreshHeadStart_ = real; };
    t.rebuild = () => {  // the next run rebuilds the Head start tab (due: as if never rebuilt)
      t.g.props.delete('HEAD_START_AT');
      t.poll();
    };
    t.tab = () => t.sheet().getSheetByName(TAB);
    return t;
  };

  /**
   * Records every call of the speed check's functions and the run log's readers made while the Head start tab is rebuilt
   * (maybeRefreshHeadStart_ or refreshHeadStart() running), every script property read then, and every tab looked up.
   */
  const spyRebuild = t => {
    const seen = { calls: [], props: [], tabs: [] };
    t.bot.__in = false;
    t.bot.__calls = seen.calls;
    ['runLogRead_', 'offListed_', 'runLogCheckIn_', 'runLogWords_', 'runLogStart_', 'headStartHonestOn_', 'headStartHonestFor_',
      'headStartHonest_', 'headStartOffRows_', 'headStartCheckRows_', 'headStartCheckNoteText_'].forEach(name => {
      t.bot.ev(`${name} = (f => function () { if (__in) __calls.push(${JSON.stringify(name)}); return f.apply(this, arguments); })(${name})`);
    });
    ['maybeRefreshHeadStart_', 'refreshHeadStart'].forEach(name => {
      t.bot.ev(`${name} = (f => function () { __in = true; try { return f.apply(this, arguments); } finally { __in = false; } })(${name})`);
    });
    const get = t.g.props.get.bind(t.g.props);
    t.g.props.get = k => { if (t.bot.__in) seen.props.push(k); return get(k); };
    const ss = t.sheet();
    const byName = ss.getSheetByName.bind(ss);
    ss.getSheetByName = n => { if (t.bot.__in) seen.tabs.push(n); return byName(n); };
    return seen;
  };

  /** Everything of the Head start tab a person or the next rebuild sees. */
  const tabState = sh => ({ rows: sh.rows, hidden: Array.from(new Set(sh.hidden || [])), merges: sh.merges, heights: sh.heights,
    protections: sh.protections.map(p => [p.description, p.warningOnly]), width: sh.getLastColumn() });

  test('speed honest head start OFF: with row 56 OFF the tab is exactly what it was, also where the run log and the list of Burson\'s alerts posted while the bot was OFF are there (row 56 was ON all day, then turned OFF): the same cells, notes, merges and row heights as a world where row 56 was never ON, 21 columns wide with the three state columns hidden; the rebuild reads neither the run log nor the OFF list, no RUN_LOG property and neither of their tabs, and the report has no speed check', () => {
    const was = scenario({ on: true, hold: true });
    const never = scenario({ hold: true });
    // row 56 ON all day: the run log has its stop and its pause, and Burson's two alerts were listed
    eq([was.sheet().getSheetByName('When the bot ran').rows.slice(4).map(x => x[6]), was.sheet().getSheetByName('Burson while bot OFF').rows.length - 4],
      [['running', 'not running', 'running', 'paused', 'running'], 2]);
    eq([never.sheet().getSheetByName('When the bot ran'), never.sheet().getSheetByName('Burson while bot OFF')], [null, null]);
    was.control().getRange(56, 2).setValue('OFF');
    was.poll();  // the run that writes C56's OFF text: the next one is a run with row 56 OFF
    never.poll();
    const seen = spyRebuild(was);
    [was, never].forEach(t => { t.release(); t.rebuild(); });
    eq(tabState(was.tab()), tabState(never.tab()));
    const sh = was.tab();
    eq(sh.rows.slice(at(sh.rows, 'EVERY STORY') + 2).map(x => x[10]), ['QA-PARIS', 'QA-MAPS', 'QA-P0', 'QA-AIO']);  // the tab has its stories
    assert.ok(sh.rows.every(x => x.length === 21), 'every row 21 cells');
    eq([sh.getLastColumn(), tabState(sh).hidden], [21, [19, 20, 21]]);
    assert.ok(!sh.rows.some(x => x.indexOf(CHECK) >= 0 || LINES.indexOf(x[0]) >= 0 || String(x[0]).indexOf(NOTE_HEAD) === 0));
    eq([seen.calls, seen.props.filter(k => /^RUN_LOG/.test(k)), seen.tabs.filter(n => n === 'When the bot ran' || n === 'Burson while bot OFF')],
      [[], [], []]);
    // the same rebuild called by hand, without the switch: its report has no speed check
    const out = was.bot.refreshHeadStart_(was.sheet(), { now: was.g.clock.now });
    eq([out.written, Object.prototype.hasOwnProperty.call(out, 'honest'), seen.calls], [true, false, []]);
  });

  // =================================================================================================================
  // ON: the race on the same post, apart from the issue
  // =================================================================================================================

  test('speed honest head start: the race on the same post, apart from Burson alerting the issue first: with the investigation\'s stories and the bot running the whole time, the story Burson\'s first alert on the ISSUE was days ahead of (APP-Y 11 days, on another post) is in row 3, never in rows 1-2, and its Speed check says so; APP-R2, a later alert on Issue R, which this app\'s APP-R1 alerted an hour before Burson (review N1), is in neither row 3 nor rows 1-2, and its Speed check names APP-R1; only the races on the stories\' own posts (APP-N1 30 min, APP-N2 45 min) are in rows 1-2, with how many posts; the lines that were there keep their values; the six lines come right after the reverse-view line, the note right after the note on matching', () => {
    const et = (d, h, m) => Date.UTC(2026, 10, d, h + 5, m || 0);  // ET in November (UTC-5)
    const now = et(18, 12, 0);
    const rows = [
      card('APP-N1', et(16, 9, 0), 1), burson('BUR-N1', et(16, 9, 30), 1),
      card('APP-N2', et(16, 13, 0), 2), burson('BUR-N2', et(16, 13, 45), 2),
      // R: this app first on "Issue R"; Burson's alert on another post an hour later is an Ongoing Issue of it; this app's
      // Watch alert on a third post the next day, an Ongoing Issue too, is a story of its own
      card('APP-R1', et(16, 10, 0), 10, null, { issue_name: 'Issue R' }),
      burson('BUR-R', et(16, 11, 0), 11, { issue_name: 'Issue R', issue_status: ONGOING }),
      watch('APP-R2', et(17, 12, 0), 12, { issue_name: 'Issue R', issue_status: ONGOING }),
      // Y: Burson alerted "Issue Y" 12 days ago; this app's card on a new post beat Burson's alert of its comeback by 40 min
      burson('BUR-Y0', et(6, 9, 0), 20, { issue_name: 'Issue Y' }),
      card('APP-Y', et(17, 10, 0), 21, null, { issue_name: 'Issue Y' }),
      burson('BUR-Y1', et(17, 10, 40), 22, { issue_name: 'Issue Y', issue_status: ONGOING }),
      // Z: this app's card six days before Burson's only alert under its name (an Ongoing Issue)
      card('APP-Z', et(12, 8, 0), 30, null, { issue_name: 'Issue Z' }),
      burson('BUR-Z', et(18, 8, 0), 31, { issue_name: 'Issue Z', issue_status: ONGOING }),
    ];
    const r = checked(rows, runLog(et(1, 0, 0), now), [], now);
    // today's story-level answers, unchanged: APP-Y "behind by 11 d 1 h", APP-R2 "behind by 1 d 1 h"
    eq(r.stories.map(s => [s.alert_id, s.matched, s.lead_ms / MIN]), [['APP-R2', 'same story', -25 * 60], ['APP-Y', 'same story', -(11 * 24 + 1) * 60],
      ['APP-N2', 'same post', 45], ['APP-R1', 'same story', 60], ['APP-N1', 'same post', 30], ['APP-Z', 'same story', 6 * 24 * 60]]);
    // (review N1: APP-R2 was "Burson alerted this issue 1 d 1 h earlier" and counted in row 3, although APP-R1, this
    // app's own, alerted Issue R an hour before Burson's BUR-R, the alert APP-R2 is measured against; the reverse-view
    // line already counted BUR-R as an alert on a story this app had first. Now APP-R2 says it is a later alert on an
    // issue this app alerted first, and row 3 counts APP-Y alone: 1 story, 15,900 minutes = 11 d 1 h)
    eq(cells(r), {
      'APP-R2': `this app alerted this issue first (APP-R1, ${T(et(16, 10, 0))} ET); this is a later alert on it: not counted as a win or a loss`,
      'APP-Y': 'Burson alerted this issue 11 d 1 h earlier, on another post: not counted as a win or a loss',
      'APP-N2': RUNNING, 'APP-R1': RUNNING, 'APP-N1': RUNNING, 'APP-Z': RUNNING,
    });
    eq(T(et(16, 10, 0)), '2026-11-16 10:00');
    const week = r.honest.week;
    eq([week.post_n, week.post_median_min, week.post_first, week.post_behind, week.post_tie, week.issue_n, week.issue_median_min],
      [2, 37.5, 2, 0, 0, 1, 15900]);
    // the reverse-view line counts BUR-R as an alert on a story this app had first: the two lines agree
    eq(r.windows.week.burson_after_by.story >= 1, true);
    eq([week.left_stories, week.unknown_stories], [0, 0]);
    eq(numbers(r, 'week'), ['38 min (2 posts)', '2 this app first, 0 Burson first (of 2 posts)', '1 story: median 11 d 1 h earlier',
      '0 posts, 0 stories (see "Speed check")', '0 alerts; 0 of this app\'s stories matched one', '0 posts, 0 stories']);
    eq(numbers(r, 'month'), numbers(r, 'week'));

    // The tab: the lines that were there are the same (the one-sided medians included); the six lines and the note sit
    // right under them; every story row has its Speed check in column 22
    const before = B.headStartTabRows_(Object.assign({}, r, { honest: undefined }));
    const built = B.headStartTabRows_(r);
    eq([before.width, built.width], [21, 22]);
    eq(without(built.rows), before.rows);
    const rev = at(built.rows, REVERSE_LINE);
    eq(built.rows.slice(rev + 1, rev + 7).map(x => x[0]), LINES);
    eq([at(built.rows, 'Matched on:'), at(built.rows, NOTE_HEAD), built.rows[rev + 9][0]], [rev + 7, rev + 8, '']);
    eq(built.marks.numbers.length, 12 + 6);
    eq(built.rows[rev + 8][0], `${NOTE_HEAD} (the "When the bot ran" tab, kept since ${T(et(1, 0, 0))} ET)${NOTE_TAIL}`);
    eq(built.marks.merged.map(n => built.rows[n - 1][0].slice(0, 12)), ['What\'s count', 'Matched on: ', 'The lines fr']);
    const every = at(built.rows, 'EVERY STORY') + 1;
    eq(built.rows[every][21], CHECK);
    eq(built.rows.slice(every + 1).map(x => [x[10], x[6], x[21]]), [
      ['APP-R2', 'behind by 1 d 1 h', cells(r)['APP-R2']], ['APP-Y', 'behind by 11 d 1 h', cells(r)['APP-Y']], ['APP-N2', '45 min', RUNNING],
      ['APP-R1', '1 h', RUNNING], ['APP-N1', '30 min', RUNNING], ['APP-Z', '6 d', RUNNING]]);
    const top = at(built.rows, 'BIGGEST HEAD STARTS') + 1;
    eq([built.rows[top][21], built.rows.slice(top + 1, top + 5).map(x => [x[10], x[21]])],
      [CHECK, [['APP-Z', RUNNING], ['APP-R1', RUNNING], ['APP-N2', RUNNING], ['APP-N1', RUNNING]]]);
    // a median below 0 reads "behind by", and a median always says how many posts it is of
    eq(B.headStartCheckRows_({ week: Object.assign({}, week, { post_n: 1, post_median_min: -20, post_first: 0, post_behind: 1, issue_n: 1,
      issue_median_min: 90 }), month: null }).map(x => x.slice(1)),
    [['behind by 20 min (1 post)', '—'], ['0 this app first, 1 Burson first (of 1 post)', '—'], ['1 story: median 1 h 30 min earlier', '—'],
      ['0 posts, 0 stories (see "Speed check")', '—'], ['0 alerts; 0 of this app\'s stories matched one', '—'], ['0 posts, 0 stories', '—']]);
  });

  test('speed honest head start: each race is checked against the run log\'s own times: comparable only when the bot was running the whole time between the two alerts (rows 1-2: a signed median, "the same minute" for a tie); a stop, failing runs or a pause in between leaves it out and counts it in row 4 ("not comparable: the bot was not running from … to … ET", "… and 1 more stretch"); from before the run log started it is "not known" (row 6); a post that a later card brought is raced from that card; a story with no Burson alert has a blank Speed check', () => {
    const start = NOW - 20 * DAY;
    const log = runLog(start, NOW, [
      [NOW - 5 * DAY, NOW - 5 * DAY + 3 * HOUR, 'not running', 'no run was recorded for more than 10 minutes'],
      [NOW - 3 * DAY, NOW - 3 * DAY + 20 * MIN, 'failing', 'the run stopped with an error: boom'],
      [NOW - 3 * DAY + HOUR, NOW - 3 * DAY + 2 * HOUR, 'paused', 'Bot (Control B2) was OFF'],
    ]);
    const rows = [
      card('S1', NOW - 2 * DAY, 1), burson('B1', NOW - 2 * DAY + 30 * MIN, 1),                         // this app first by 30 min
      watch('S2', NOW - DAY, 2), burson('B2', NOW - DAY - 20 * MIN, 2),                                 // Burson first by 20 min
      card('S3', NOW - 5 * DAY - HOUR, 3), burson('B3', NOW - 5 * DAY + 4 * HOUR, 3),                    // across the stop
      card('S4', NOW - 3 * DAY - 10 * MIN, 4), burson('B4', NOW - 3 * DAY + 90 * MIN, 4),                // failing, then paused
      card('S5', NOW - 25 * DAY, 5), burson('B5', NOW - 25 * DAY + 10 * MIN, 5),                         // before the run log
      card('S6', NOW - 6 * HOUR, 6), burson('B6', NOW - 6 * HOUR, 6),                                   // the very same moment
      // a card before the stop, and its update after it, which brought post 71; Burson alerted post 71 15 minutes later
      card('S7', NOW - 5 * DAY - 2 * HOUR, 70), card('S7-update', NOW - 4 * DAY, 71, { update_of: 'S7' }),
      burson('B7', NOW - 4 * DAY + 15 * MIN, 71),
      card('S8', NOW - 3 * HOUR, 8),                                                                     // no Burson alert found
    ];
    const r = checked(rows, log);
    const stop = `the bot was not running from ${T(NOW - 5 * DAY)} to ${T(NOW - 5 * DAY + 3 * HOUR)} ET`;
    eq(cells(r), {
      S8: '', S6: RUNNING, S2: RUNNING, S1: RUNNING,
      S4: `not comparable: the bot's runs were failing from ${T(NOW - 3 * DAY)} to ${T(NOW - 3 * DAY + 20 * MIN)} ET and 1 more stretch`,
      S7: `not comparable: ${stop}; race on the same post: ${RUNNING}`,
      S3: `not comparable: ${stop}`,
      S5: `not known: before the bot kept its run log (${T(start)} ET)`,
    });
    // the update's post is raced from the update (15 min), not from the story's first card (a day and more)
    eq(r.stories.find(s => s.alert_id === 'S7').post_leads_ms.map(ms => ms / MIN), [15]);
    eq(r.honest.week, { post_n: 4, post_median_min: 7.5, post_first: 2, post_behind: 1, post_tie: 1, issue_n: 0, issue_median_min: null,
      left_posts: 2, left_stories: 3, unknown_posts: 0, unknown_stories: 0, off_alerts: 0, off_stories: 0 });
    eq(numbers(r, 'week'), ['8 min (4 posts)', '2 this app first, 1 Burson first, 1 the same minute (of 4 posts)', '0 stories',
      '2 posts, 3 stories (see "Speed check")', '0 alerts; 0 of this app\'s stories matched one', '0 posts, 0 stories']);
    // the 30 days hold S5 too, from before the run log: not known, and in no other line
    eq(numbers(r, 'month'), ['8 min (4 posts)', '2 this app first, 1 Burson first, 1 the same minute (of 4 posts)', '0 stories',
      '2 posts, 3 stories (see "Speed check")', '0 alerts; 0 of this app\'s stories matched one', '1 post, 1 story']);
    // the lines that were there count every race as before (S3 and S4 among them)
    eq([r.windows.week.post_matched, r.windows.week.post_first], [6, 4]);
    // a race the run log has no record that late for is not known either (here: no run recorded for the last 2 hours)
    const late = checked([card('S9', NOW - HOUR, 9), burson('B9', NOW - 30 * MIN, 9)], runLog(start, NOW - 2 * HOUR));
    eq([cells(late), numbers(late, 'week')[5]], [{ S9: `not known: no run recorded after ${T(NOW - 2 * HOUR)} ET` }, '1 post, 1 story']);
    // Burson's alert posted 50 days ago and picked up much later (its row is recent): its race with this app's alert
    // yesterday still sees the stop of 47 days ago, however far back that is
    const old = checked([card('S10', NOW - DAY, 10), burson('B10', NOW - 50 * DAY, 10, null, { created_at: NOW - 2 * DAY })],
      runLog(NOW - 55 * DAY, NOW, [[NOW - 48 * DAY, NOW - 47 * DAY, 'not running']]));
    eq(cells(old), { S10: `not comparable: the bot was not running from ${T(NOW - 48 * DAY)} to ${T(NOW - 47 * DAY)} ET` });
  });

  // =================================================================================================================
  // ON: Burson's alerts posted while the bot was OFF
  // =================================================================================================================

  test('speed honest head start: Burson\'s alerts listed while the bot was OFF are matched as Burson\'s for the speed check only (headStartOffRows_): a story whose post Burson alerted while OFF reads "Burson alerted this while the bot was OFF (posted … ET)" and "not comparable: the bot was paused …" where today it reads "No Burson alert found" or a head start over a later alert; row 5 counts each listed post once (also listed in two spaces, or on the Alert log too), in its days; one without a post key counts and matches nothing', () => {
    const paused = [NOW - 4.5 * HOUR, NOW - 130 * MIN];
    const log = runLog(NOW - 20 * DAY, NOW, [[NOW - 10 * DAY - HOUR, NOW - 10 * DAY + HOUR, 'paused', 'Bot (Control B2) was OFF'],
      [paused[0], paused[1], 'paused', 'Bot (Control B2) was OFF']]);
    const listedOne = (name, when, n, space, issue) => ({ name, at: when, space: space || 'spaces/AAQAtestfd1', spaceName: 'SLRR Test Feed',
      key: n === null ? '' : key(n), url: n === null ? '' : link(n), issue: issue || `Issue ${n}`, status: 'NEW', product: 'Search', tag: TAG,
      stretchFrom: paused[0], stretchTo: paused[1], listedAt: paused[1] + MIN });
    const listed = [
      listedOne('spaces/AAQAtestfd1/messages/m1', NOW - 3 * HOUR, 80),
      listedOne('spaces/AAQAaa_0I9g/messages/m9', NOW - 3 * HOUR, 80, 'spaces/AAQAaa_0I9g'),  // the same alert, listed in a second space
      listedOne('spaces/AAQAtestfd1/messages/m2', NOW - 170 * MIN, 81, null, 'Issue Q'),
      // listed for the pause of 10 days ago (its own paused stretch)
      Object.assign(listedOne('spaces/AAQAtestfd1/messages/m3', NOW - 10 * DAY, 90), { stretchFrom: NOW - 10 * DAY - HOUR, stretchTo: NOW - 10 * DAY + HOUR }),
      listedOne('spaces/AAQAtestfd1/messages/m4', NOW - 4 * HOUR, null),                       // no post key
    ];
    const rows = [
      card('C1', NOW - 2 * HOUR, 80),                                                       // Burson's alert on post 80 was posted while OFF
      card('C2', NOW - 90 * MIN, 81, null, { issue_name: 'Issue Q' }),                      // ... and on post 81
      burson('BQ', NOW - 30 * MIN, 82, { issue_name: 'Issue Q', issue_status: ONGOING }),   // Burson's later alert of the issue, on another post
    ];
    const r = checked(rows, log, listed);
    // today's cells: C1 "No Burson alert found", C2 a head start of 60 min over the later alert (same story)
    eq(r.stories.map(s => [s.alert_id, s.matched, s.burson ? s.burson.alert_id : null, s.lead_ms === null ? null : s.lead_ms / MIN]),
      [['C2', 'same story', 'BQ', 60], ['C1', '', null, null]]);
    const pause = `not comparable: the bot was paused (Bot OFF on the Control tab) from ${T(paused[0])} to ${T(paused[1])} ET`;
    eq(cells(r), {
      C2: `Burson alerted this while the bot was OFF (posted ${T(NOW - 170 * MIN)} ET); ${pause}`,
      C1: `Burson alerted this while the bot was OFF (posted ${T(NOW - 3 * HOUR)} ET); ${pause}`,
    });
    eq([r.honest.week.off_alerts, r.honest.week.off_stories, r.honest.month.off_alerts, r.honest.week.left_posts, r.honest.week.post_n],
      [3, 2, 4, 2, 0]);
    eq(numbers(r, 'week'), ['—', '—', '0 stories', '2 posts, 2 stories (see "Speed check")', '3 alerts; 2 of this app\'s stories matched one',
      '0 posts, 0 stories']);
    eq(numbers(r, 'month')[4], '4 alerts; 2 of this app\'s stories matched one');
    // as Alert-log rows: Burson's, with no alert id, timed when Burson posted, from a space that says where they come from
    eq(B.headStartOffRows_([listed[0], { at: 'soon' }, null]), [{ alert_id: '', created_at: NOW - 3 * HOUR, source_at: NOW - 3 * HOUR,
      record_key: key(80), ingested: '', space: 'spaces/AAQAtestfd1 > (listed while the bot was OFF)', forwarded_fields: { issue_name: 'Issue 80',
        issue_status: 'NEW', product: 'Search', exposure_tag: TAG, post_url: link(80) } }]);
    // an alert listed while OFF that the bot also picked up as Bot was turned back ON (the same post, the same time) is still one
    // posted while it was OFF
    const both = checked(rows.concat([burson('B80', NOW - 3 * HOUR, 80)]), log, listed);
    assert.match(cells(both).C1, /^Burson alerted this while the bot was OFF \(posted /);
    eq(both.stories.find(s => s.alert_id === 'C1').burson.alert_id, 'B80');  // today's cells show that alert, as they always did
    // ... but it was reviewed after all (review N2): the cell says so, and row 5, which counts the ones never reviewed,
    // leaves it out (and the story matched with it)
    eq(cells(both).C1, `Burson alerted this while the bot was OFF (posted ${T(NOW - 3 * HOUR)} ET; the bot picked it up when Bot was ` +
      `turned back ON); ${pause}`);
    eq([both.honest.week.off_alerts, both.honest.week.off_stories, both.honest.month.off_alerts], [2, 1, 3]);
  });

  test('speed honest head start: only Burson\'s alerts posted in their own paused stretch count as posted while the bot was OFF (review N2): one posted after the last paused run and before the first run with Bot ON is in the stretch (it ends there) and its race is not comparable; one listed from before the pause, reviewed and emailed by failing runs then, is not OFF and in no OFF count', () => {
    const et = (d, h, m, sec) => Date.UTC(2026, 10, d, h + 5, m || 0, sec || 0);
    const now = et(18, 12, 0);
    // (1) Bot paused from 09:00; its last paused run ended 10:00:30; Burson posted at 10:00:50; the first run with Bot ON
    // started 10:01:00, where the paused stretch ends; this app's card went out 10:01:30
    const log = runLog(et(1, 0, 0), now, [[et(18, 9, 0), et(18, 10, 1), 'paused', 'Bot (Control B2) was OFF', { n: 1, done: true }]]);
    const one = { name: 'spaces/S/messages/m1', at: et(18, 10, 0, 50), key: key(1), url: link(1), issue: 'Issue 1', status: 'NEW', product: 'Search',
      tag: TAG, space: 'spaces/S', spaceName: 'S', stretchFrom: et(18, 9, 0), stretchTo: et(18, 10, 1), listedAt: et(18, 10, 2) };
    const r1 = checked([card('APP-1', et(18, 10, 1, 30), 1)], log, [one], now);
    eq(cells(r1)['APP-1'], `Burson alerted this while the bot was OFF (posted ${T(one.at)} ET); not comparable: the bot was paused (Bot OFF on ` +
      `the Control tab) from ${T(et(18, 9, 0))} to ${T(et(18, 10, 1))} ET`);
    eq([r1.honest.week.post_n, r1.honest.week.left_posts, r1.honest.week.off_alerts, r1.honest.week.off_stories], [0, 1, 1, 1]);
    // (2) runs failing from 08:04 to 08:07 reviewed (and emailed) Burson's alert of 08:04; Bot OFF 08:08 to 08:12. The
    // listing starts at the last running run's start, so it lists that alert too, from before its paused stretch
    const log2 = runLog(et(1, 0, 0), now, [[et(18, 8, 4), et(18, 8, 7), 'failing', 'the run stopped with an error: x'],
      [et(18, 8, 8), et(18, 8, 12), 'paused', 'Bot (Control B2) was OFF', { n: 1, done: true }]]);
    const two = { name: 'spaces/S/messages/m2', at: et(18, 8, 4), key: key(2), url: link(2), issue: 'Issue 2', status: 'NEW', product: 'Search',
      tag: TAG, space: 'spaces/S', spaceName: 'S', stretchFrom: et(18, 8, 8), stretchTo: et(18, 8, 12), listedAt: et(18, 8, 13) };
    const r2 = checked([card('APP-2', et(18, 7, 30), 2), burson('QA-9', et(18, 8, 4), 2)], log2, [two], now);
    assert.ok(!/while the bot was OFF/.test(cells(r2)['APP-2']), cells(r2)['APP-2']);
    eq([r2.honest.week.off_alerts, r2.honest.week.off_stories], [0, 0]);
    eq(B.headStartCheckRows_(r2.honest)[4].slice(1), ['0 alerts; 0 of this app\'s stories matched one', '0 alerts; 0 of this app\'s stories matched one']);
    // the same alert not on the Alert log (never reviewed): still not OFF, it was posted before the pause
    const r3 = checked([card('APP-2', et(18, 7, 30), 2)], log2, [two], now);
    eq([/while the bot was OFF/.test(cells(r3)['APP-2']), r3.honest.week.off_alerts], [false, 0]);
  });

  // =================================================================================================================
  // ON, through poll(): the tab
  // =================================================================================================================

  test('speed honest head start: through poll() with row 56 ON: the card that came after an 18-hour stop reads "not comparable: the bot was not running from … to … ET" and is out of rows 1-2; the stories whose Burson alert was posted while Bot (B2) was OFF read "Burson alerted this while the bot was OFF (posted … ET)" (row 5 counts them) while today\'s cells still read "No Burson alert found" and the head start of 2 h over the later alert; every cell that was there is the same as in the same world with row 56 OFF; column 22 is shown, the state columns hidden and still read; the dashboard\'s Caught early view reads the six lines', () => {
    const on = scenario({ on: true });
    const off = scenario();
    on.rebuild();
    off.rebuild();
    const s = on.s;
    const sh = on.tab();
    const rows = sh.rows;
    // nothing the owner sees today is removed or reworded: without the six lines, the note and column 22, the same tab
    eq(without(rows), off.tab().rows);
    const every = at(rows, 'EVERY STORY') + 1;
    const stories = rows.slice(every + 1).map(x => [x[10], x[5] ? 'Burson alerted' : 'No Burson alert found', x[6], x[9], x[21]]);
    const paused = on.sheet().getSheetByName('When the bot ran').rows.slice(4).find(x => x[6] === 'paused');
    const pause = `not comparable: the bot was paused (Bot OFF on the Control tab) from ${T(paused[4])} to ${T(paused[5])} ET`;
    // (review N2: the paused row ends at the first run with Bot ON, where the listing of Burson's alerts ends, not at the
    // last paused run's end; no run was made in between)
    eq([paused[4], paused[5]], [s.pausedFrom, s.backOn]);
    assert.ok(s.backOn > s.pausedTo && s.backOn - s.pausedTo <= 10 * MIN);
    eq(stories, [
      ['QA-PARIS', 'Burson alerted', '2 h', 'same story', `Burson alerted this while the bot was OFF (posted ${T(s.paris)} ET); ${pause}`],
      ['QA-MAPS', 'No Burson alert found', '', '', `Burson alerted this while the bot was OFF (posted ${T(s.maps)} ET); ${pause}`],
      ['QA-P0', 'Burson alerted', B.headStartWords_((s.p0 - s.p0Card) / MIN), 'same post',
        `not comparable: the bot was not running from ${T(s.stopFrom)} to ${T(s.stopTo)} ET`],
      ['QA-AIO', 'Burson alerted', '19 min', 'same post', RUNNING],
    ]);
    // the six lines: only the race the bot was running for (AIO) is in rows 1-2
    const rev = at(rows, REVERSE_LINE);
    eq(rows.slice(rev + 1, rev + 7).map(x => x.slice(0, 3)), [
      [LINES[0], '19 min (1 post)', '19 min (1 post)'],
      [LINES[1], '1 this app first, 0 Burson first (of 1 post)', '1 this app first, 0 Burson first (of 1 post)'],
      [LINES[2], '0 stories', '0 stories'],
      [LINES[3], '3 posts, 3 stories (see "Speed check")', '3 posts, 3 stories (see "Speed check")'],
      [LINES[4], '2 alerts; 2 of this app\'s stories matched one', '2 alerts; 2 of this app\'s stories matched one'],
      [LINES[5], '0 posts, 0 stories', '0 posts, 0 stories'],
    ]);
    // ... while the lines that were there still count every race (P0's 9 hours behind among them)
    eq(rows[at(rows, 'Burson alerted first')].slice(1, 3), [1, 1]);
    eq(rows[at(rows, NOTE_HEAD)][0], `${NOTE_HEAD} (the "When the bot ran" tab, kept since ${T(on.runs[0][0])} ET)${NOTE_TAIL}`);
    // column 22: in both tables' headers, shown; the three state columns hidden as before, and still read back
    eq([rows[every][21], rows[at(rows, 'BIGGEST HEAD STARTS') + 1][21], Array.from(new Set(sh.hidden)), sh.getLastColumn()], [CHECK, CHECK, [19, 20, 21], 22]);
    eq(rows[every].slice(0, 21), off.tab().rows[at(off.tab().rows, 'EVERY STORY') + 1]);
    const kept = on.bot.readHeadStartState_(sh);
    eq([kept.unread, Array.from(kept.keys()), kept.get(B.postKey_(B.parseAlert_(F.AIO).fields.post_url))],
      [undefined, [B.postKey_(B.parseAlert_(F.AIO).fields.post_url)], { at: s.aio + 30 * MIN, from: 'draft' }]);
    // the dashboard's Caught early view reads the six lines with the others, and its stories as before
    const early = on.bot.dlEarly_(on.sheet());
    eq(early.numbers.slice(12).map(x => [x.label, x.week]), rows.slice(rev + 1, rev + 7).map(x => [x[0], x[1]]));
    eq(early.numbers.length, 18);
    eq(early.stories, off.bot.dlEarly_(off.sheet()).stories);
    // every cell at or under 45,000 characters
    assert.ok(rows.every(x => x.every(v => String(v).length <= 45000)));
  });

  test('speed honest head start: turning row 56 OFF again, the next rebuild is as before: 21 columns, column 22 cleared, the six lines and the note gone, the same cells as the world where row 56 was never ON; and it reads neither the run log nor the OFF list', () => {
    const on = scenario({ on: true });
    const off = scenario();
    on.rebuild();
    off.rebuild();
    assert.ok(on.tab().rows.some(x => x[21] === CHECK));
    on.control().getRange(56, 2).setValue('OFF');
    const seen = spyRebuild(on);
    on.rebuild();
    off.rebuild();
    const rows = on.tab().rows;
    eq(rows.map(x => x.slice(0, 21)), off.tab().rows);
    assert.ok(rows.every(x => x.length <= 21 || x.slice(21).every(v => v === '')), 'column 22 is cleared');
    eq(on.tab().cleared.slice(-1), [`1,22,${rows.length},1`]);
    eq([Array.from(new Set(on.tab().hidden)), seen.calls, seen.props.filter(k => /^RUN_LOG/.test(k))], [[19, 20, 21], [], []]);
    // ON again: the column comes back, shown (only it: the three state columns stay hidden)
    on.control().getRange(56, 2).setValue('ON');
    on.poll();
    on.rebuild();
    eq([on.tab().rows[at(on.tab().rows, 'EVERY STORY') + 1][21], on.tab().hidden.indexOf(22)], [CHECK, -1]);
  });

  test('speed honest head start: refreshHeadStart() from the editor takes row 56 from the Control tab: ON, it shows the speed check from the run log read outside a run, where a race after the log\'s last record is "not known: no run recorded after … ET" (never guessed); OFF, it reads neither the run log nor the OFF list; the every-minute rebuild takes it from the run\'s switches', () => {
    const t = scenario({ on: true });
    t.rebuild();
    const last = t.runs[t.runs.length - 1][1];
    // 30 minutes with no run, then a card and Burson's alert on its post 5 minutes later; rebuilt from the editor
    t.g.clock.now += 30 * MIN;
    const log = t.bot.sheetTable_(t.sheet(), 'Alert log', t.bot.ev('ALERT_COLUMNS_'), 'alert_id', 4000);
    log.append(card('QA-LATE', t.g.clock.now - 10 * MIN, 5));
    log.append(burson('QA-LATE-B', t.g.clock.now - 5 * MIN, 5, null, { space: `${TEST_FEED} > ${TRIAGED}` }));
    const seen = spyRebuild(t);
    eq(t.bot.refreshHeadStart() !== null, true);
    eq(seen.calls.filter((n, i, a) => a.indexOf(n) === i).sort(), ['headStartCheckNoteText_', 'headStartCheckRows_', 'headStartHonestFor_',
      'headStartHonestOn_', 'headStartHonest_', 'headStartOffRows_', 'offListed_', 'runLogCheckIn_', 'runLogRead_', 'runLogWords_']);
    const rows = t.tab().rows;
    const late = rows.find(x => x[10] === 'QA-LATE');
    eq(late[21], `not known: no run recorded after ${T(last)} ET`);
    eq(rows.find(x => x[0] === LINES[5]).slice(1, 3), ['1 post, 1 story', '1 post, 1 story']);
    // row 56 OFF: the editor's rebuild reads only the Control tab's switches, nothing of the run log
    t.control().getRange(56, 2).setValue('OFF');
    seen.calls.length = 0;
    t.bot.refreshHeadStart();
    eq([seen.calls, at(t.tab().rows, LINES[0]), t.tab().rows.some(x => x[21])], [['headStartHonestOn_'], -1, false]);
    // the every-minute rebuild: the run's own switches (no Control read of its own)
    const calls = [];
    t.bot.__calls2 = calls;
    t.bot.ev('refreshHeadStart_ = (f => (ss, o) => { __calls2.push(o.honest); return f(ss, o); })(refreshHeadStart_)');
    t.g.props.delete('HEAD_START_AT');
    t.bot.maybeRefreshHeadStart_(t.sheet(), { switches: { speedHonest: true }, now: () => t.g.clock.now }, {});
    t.g.props.delete('HEAD_START_AT');
    t.bot.maybeRefreshHeadStart_(t.sheet(), { switches: { speedHonest: false }, now: () => t.g.clock.now }, {});
    t.g.props.delete('HEAD_START_AT');
    t.bot.maybeRefreshHeadStart_(t.sheet(), { now: () => t.g.clock.now }, {});
    eq(calls, [true, false, false]);
  });

  // =================================================================================================================
  // ON: when the run log can't say, and cells
  // =================================================================================================================

  test('speed honest head start: a run log that can\'t be read (a person\'s "When the bot ran" tab in the way) or has no record yet makes every race "not known", and the note says why; an OFF listing that did not list everything is named in the note; a speed check that fails is logged, the tab is still written with every cell that was there, and the note says it could not be worked out', () => {
    const rows = [card('S1', NOW - 2 * HOUR, 1), burson('B1', NOW - HOUR, 1), card('S2', NOW - 3 * HOUR, 2)];
    const blocked = checked(rows, { ok: false, why: 'a "When the bot ran" tab the bot didn\'t make is in the way', start: 0, last: 0, spans: [] });
    eq([cells(blocked), numbers(blocked, 'week')[5], numbers(blocked, 'week')[0]],
      [{ S1: 'not known: a "When the bot ran" tab the bot didn\'t make is in the way', S2: '' }, '1 post, 1 story', '—']);
    eq(B.headStartCheckNoteText_(blocked.honest), `${NOTE_HEAD} (the "When the bot ran" tab, which could not be read: a "When the bot ran" tab ` +
      `the bot didn't make is in the way; so every race is "not known")${NOTE_TAIL}`);
    const none = checked(rows, { ok: true, why: '', start: 0, last: 0, spans: [] });
    eq(cells(none).S1, 'not known: the bot keeps no record of when it ran');
    eq(B.headStartCheckNoteText_(none.honest), `${NOTE_HEAD} (the "When the bot ran" tab, which has no record yet; so every race is "not known")${NOTE_TAIL}`);
    // a paused stretch whose listing stopped part way (its "listed" says done: false)
    const p = [NOW - 6 * HOUR, NOW - 5 * HOUR];
    const why = 'Bot (Control B2) was OFF · Burson\'s alerts posted while it was OFF: 9 listed on the "Burson while bot OFF" tab; listing ' +
      'stopped after 10,000 messages: alerts from 2026-10-14 03:00 to 2026-10-14 03:01 ET are not listed';
    const cut = checked(rows, runLog(NOW - 10 * DAY, NOW, [[p[0], p[1], 'paused', why, { n: 9, done: false, upTo: p[0] + HOUR }]]));
    eq(B.headStartCheckNoteText_(cut.honest), `${NOTE_HEAD} (the "When the bot ran" tab, kept since ${T(NOW - 10 * DAY)} ET)${NOTE_TAIL} ` +
      `Listing of an OFF stretch not complete: the bot was paused (Bot OFF on the Control tab) from ${T(p[0])} to ${T(p[1])} ET (Burson's ` +
      'alerts posted while it was OFF: 9 listed on the "Burson while bot OFF" tab; listing stopped after 10,000 messages: alerts from ' +
      '2026-10-14 03:00 to 2026-10-14 03:01 ET are not listed).');
    // a speed check that fails: logged; the tab is written, every cell that was there the same, the six lines "—"
    const w = H.world();
    const ss = w.g.services.SpreadsheetApp.create('bot');
    const errors = [];
    w.bot.console = { log() {}, warn() {}, error: m => errors.push(String(m)) };
    w.bot.runLogRead_ = () => { throw new Error('Sheets did not answer'); };
    const out = w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, honest: true });
    const plainTab = H.world().bot;
    const ss2 = w.g.services.SpreadsheetApp.create('bot2');
    plainTab.refreshHeadStart_(ss2, { now: NOW, alerts: rows });
    const tab = ss.getSheetByName(TAB).rows;
    eq([out.written, without(tab), errors], [true, ss2.getSheetByName(TAB).rows,
      ['Head start tab: the speed check could not be worked out: Sheets did not answer']]);
    eq(tab.filter(x => LINES.indexOf(x[0]) >= 0).map(x => x.slice(1, 3)), LINES.map(() => ['—', '—']));
    eq(tab[at(tab, 'The lines from')][0], 'The lines from "Race on the same post" on could not be worked out this time (Sheets did not answer); ' +
      'the next rebuild tries again. The lines above them are counted as before.');
    eq([tab[at(tab, 'EVERY STORY') + 1][21], tab.slice(at(tab, 'EVERY STORY') + 2).map(x => x[21])], [CHECK, ['', '']]);
  });

  test('speed honest head start: every cell of the speed check stays at or under 45,000 characters (a run log reason of 100,000 characters), a story names at most three races on its own posts and how many more, and no cell of it can be read as a formula', () => {
    const huge = 'x'.repeat(100000);
    const big = checked([card('S1', NOW - 2 * HOUR, 1), burson('B1', NOW - HOUR, 1)], { ok: false, why: huge, start: 0, last: 0, spans: [] });
    const built = B.headStartTabRows_(big);
    assert.ok(built.rows.every(x => x.every(v => String(v).length <= 45000)));
    eq([cellOf(big.honest, big.stories[0]).length, built.rows[at(built.rows, NOTE_HEAD)][0].length], [45000, 45000]);
    // a card on five posts, each alerted by Burson across a stop of its own: three named, and how many more
    const gaps = [1, 2, 3, 4, 5].map(i => [NOW - (12 - i) * HOUR, NOW - (12 - i) * HOUR + 15 * MIN, 'not running']);
    const posts = [11, 12, 13, 14, 15].map(n => key(n));
    const rows = [card('S1', NOW - 12 * HOUR, 11, { post_keys: posts })].concat([11, 12, 13, 14, 15].map((n, i) =>
      burson(`B${n}`, NOW - (11 - i) * HOUR + 30 * MIN, n)));
    const many = checked(rows, runLog(NOW - DAY, NOW, gaps));
    const text = cellOf(many.honest, many.stories[0]);
    eq(text.split('; ').map(x => x.replace(/ from .* ET/, ' from … ET')), [
      'not comparable: the bot was not running from … ET',  // the story's own race (to Burson's first alert on it)
      'race on the same post not comparable: the bot was not running from … ET and 1 more stretch',
      'race on the same post not comparable: the bot was not running from … ET and 2 more stretches',
      'race on the same post not comparable: the bot was not running from … ET and 3 more stretches',
      'and 1 more races on the same post that are not comparable or not known',
    ]);
    eq([many.honest.week.left_posts, many.honest.week.left_stories], [5, 1]);
    // the speed check's cells start with words, never = + - @
    const all = B.headStartTabRows_(many).rows.concat(built.rows);
    assert.ok(!all.some(x => x.slice(21).concat(LINES.indexOf(x[0]) >= 0 ? x.slice(0, 3) : []).some(v => /^[=+\-@]/.test(String(v)))));
  });
};
