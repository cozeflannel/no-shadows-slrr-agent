// Speed numbers that leave out when the bot was not running, on the Results tab (Control row 56, "Speed numbers: leave
// out when the bot was not running"; key speedHonest; Speed.gs resultsHonest_, with the "When the bot ran" tab of
// RunLog.gs). OFF (the default): the Results tab is exactly as before, and neither the run log nor the "Burson while bot
// OFF" tab is read. ON: a section right under HEADLINE NUMBERS, whose lines don't change: the same alerts as their speed
// lines, but only those the bot was running for the whole time from Burson's post until its email was ready; that time
// split into the wait for the bot to run (seen_at), the bot's own work and a person's wait to send the bot's draft; the
// alerts left out counted on their own lines (not running, paused or failing; not known, as before the run log began);
// Burson's alerts listed while the bot was OFF counted once per post. Every number is from recorded times; nothing is
// estimated. Every address is made up (.test).
'use strict';

module.exports = H => {
  const { test, eq, assert, B, F, NOW, world, e2e, makeGoogle, REAL } = H;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const T = ms => B.speedTime_(ms);
  const plainJson = v => JSON.parse(JSON.stringify(v));
  const ZAPIER = { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' };
  const AC = 'spaces/AAQAautofx1';
  const AC_NAME = 'SLRR Auto-correct Test';
  const AC_P = 'spaces/AAQAaa_0I9g > spaces/AUTOFIX (auto-correct)';
  const FLOWS = { main: null, ac: { partition: AC_P, label: 'Auto-correct space' } };
  const NOT_RUNNING_WHY = 'no run was recorded for more than 10 minutes (a stopped trigger, a wait for a permission after an update, ' +
    'or runs that failed before they read the Control tab)';

  // The exact words a person sees (Speed.gs RESULTS_HONEST_SECTION_ and RESULTS_HONEST_LABELS_)
  const SECTION = 'SPEED WHILE THE BOT WAS RUNNING (Control row 56: leaves out the times it was not running)';
  const LABELS = [
    'Typical minutes from Burson\'s post to the email (median): the bot, only the alerts it was running for the whole time (see the note below)',
    'Typical minutes the alert waited for the bot to run (median): from Burson\'s post to the bot picking it up',
    'Typical minutes the bot waited for Burson to resend an alert it asked Burson to fix (median): from picking up Burson\'s alert to picking up the resend',
    'Typical minutes of the bot\'s own work (median): from picking the alert up to its email being ready',
    'Typical minutes a person took to send the bot\'s draft (median)',
    'The bot\'s email went out first, leaving out those alerts',
    'The IMs\' email went out first, leaving out those alerts',
    'Alerts left out: they waited, or were being worked on, while the bot was not running, paused or failing',
    'Alerts left out: not known whether the bot was running (before its run log began, or while row 56 was OFF)',
    'Burson\'s alerts posted while the bot was OFF (never reviewed; on the "Burson while bot OFF" tab)',
  ];
  const NOTE_HEAD = 'These lines count the same alerts as the speed lines of HEADLINE NUMBERS (both the bot and the IMs sent a Social ' +
    'Alert, both times known), but only those where the bot was running the whole time from Burson\'s post until its email was ' +
    'ready, as its run log shows (the "When the bot ran" tab';
  const NOTE_MID = '. The waiting and own-work lines count only the alerts with a recorded time the bot picked them up, and a ' +
    'person\'s wait only the bot\'s drafts a person sent. For an alert the bot asked Burson to fix, its own work starts when it ' +
    'picked up Burson\'s resend, and the wait for that resend is on its own line. The lines of HEADLINE NUMBERS are counted as before.';
  const OLD_BOT_LINE = 'Typical minutes from Burson\'s post to the email (median): the bot';
  const BLOCK = 13;  // the section, 10 lines, the note and a blank row

  /** Where the section starts on a Results tab (rows as the fake keeps them, 0-based), or -1. */
  const sectionAt = tab => tab.rows.findIndex(r => r[0] === SECTION);
  /** The tab's rows without the section (what the tab is with row 56 OFF). */
  const withoutSection = tab => {
    const at = sectionAt(tab);
    return at < 0 ? tab.rows : tab.rows.slice(0, at).concat(tab.rows.slice(at + BLOCK));
  };
  /** A line of the tab: [label, last 24 hours, last N days]. */
  const line = (tab, label) => (tab.rows.find(r => r[0] === label) || []).slice(0, 3);
  const switchesOn = bot => Object.assign(bot.switchesOff_(), { speedHonest: true });

  // ---------------------------------------------------------------------------------------------------------------
  // Hand-made Alert-log rows (the Auto-correct space's), the IMs' drafts, a run log and what was listed while OFF
  // ---------------------------------------------------------------------------------------------------------------

  const url = n => `https://x.com/user${n}/status/${30000 + n}`;
  /** One Alert-log row: Burson posted at `at`, the bot picked it up a minute later and sent its Social Alert 3 minutes after. */
  const row = (id, n, at, extra) => Object.assign({
    alert_id: id, space: AC_P, source_at: at, seen_at: at + MIN, created_at: at + 2 * MIN, status: 'ok', requested: [], decision: '',
    email_status: 'sent', email_at: at + 3 * MIN, email_sent_at: at + 3 * MIN, email_sent_by: 'bot@runner.test', email_thread: 'thread-' + id,
    email_input: { escalation: { priority: 'P1', reasons: ['HIGH_ENGAGEMENT'], engagement_total: 5000, platform: 'X' } },
    forwarded_fields: { post_url: url(n), social_network: 'X', author: 'user' + n, product: 'Search', issue_name: 'Issue ' + n },
  }, extra || {});
  const A1 = NOW - 3 * HOUR;   // the bot running: picked up after 1 minute, its email 3 minutes after Burson's post
  const A2 = NOW - 5 * HOUR;   // the bot's draft, ready after 4 minutes; a person sent it 30 minutes after Burson's post
  const A3 = NOW - 9 * HOUR;   // posted during a stop (from 10 to 6 hours ago): picked up when the bot came back
  const A4 = NOW - 3 * DAY;    // before the run log began (2 days ago)
  const A5 = NOW - 30 * HOUR;  // the bot running; the IMs' draft came first
  const rows = () => [
    row('QA-1', 1, A1),
    row('QA-2', 2, A2, { seen_at: A2 + 2 * MIN, email_at: A2 + 4 * MIN, email_sent_at: A2 + 30 * MIN, email_sent_by: 'lead@team.test' }),
    row('QA-3', 3, A3, { seen_at: NOW - 6 * HOUR + MIN, created_at: NOW - 6 * HOUR + 2 * MIN, email_at: NOW - 6 * HOUR + 3 * MIN,
      email_sent_at: NOW - 6 * HOUR + 3 * MIN }),
    row('QA-4', 4, A4),
    row('QA-5', 5, A5, { email_at: A5 + 6 * MIN, email_sent_at: A5 + 6 * MIN }),
    // no Social Alert from the bot (the IMs sent one): not one of the speed lines' alerts, so in none of the new lines
    row('QA-6', 6, NOW - 2 * HOUR, { email_status: '', email_at: '', email_sent_at: '', email_sent_by: '', email_thread: '', email_input: {},
      decision: '❌ P2, 300 engagements: below the escalation criteria' }),
  ];
  const draft = (n, at) => ({ post_url: url(n), at, subject: `⭐ SOCIAL ALERT ⭐: Search | Issue ${n} | X | 5000 Engagements`, drafted_by: 'im@ops.test' });
  const drafts = () => [draft(1, A1 + 20 * MIN), draft(2, A2 + 25 * MIN), draft(3, A3 + 22 * MIN), draft(4, A4 + 22 * MIN),
    draft(5, A5 + 4 * MIN), draft(6, NOW - 2 * HOUR + 15 * MIN)];
  const opts = extra => Object.assign({ alerts: rows(), drafts, logged: () => [], flows: FLOWS }, extra || {});
  const LOG = () => ({ ok: true, why: '', start: NOW - 2 * DAY, last: NOW, spans: [
    { from: NOW - 2 * DAY, to: NOW - 10 * HOUR, state: 'running', why: '', listed: null },
    { from: NOW - 10 * HOUR, to: NOW - 6 * HOUR, state: 'not running', why: NOT_RUNNING_WHY, listed: null },
    { from: NOW - 6 * HOUR, to: NOW, state: 'running', why: '', listed: null, open: true },
  ] });
  const listedOne = (name, at, link, space) => ({ name, at, space: space || REAL, spaceName: '[S-F] Burson Automated Alerts V3', key: '',
    url: link, issue: 'Listed issue', status: 'New', product: 'Search', tag: 'Product - Perceived bias', stretchFrom: at - HOUR,
    stretchTo: at + HOUR, listedAt: at + HOUR });
  const LISTED = () => [
    listedOne('spaces/AAQAaa_0I9g/messages/l1', NOW - 4 * HOUR, 'https://x.com/other/status/40001'),
    listedOne('spaces/AAQAtestfd1/messages/l2', NOW - 4 * HOUR + 1000, 'https://x.com/other/status/40001', 'spaces/AAQAtestfd1'),  // the same post
    listedOne('spaces/AAQAaa_0I9g/messages/l3', A1, url(1)),  // a post the bot reviewed after all: on the Alert log
    listedOne('spaces/AAQAaa_0I9g/messages/l4', NOW - 3 * DAY, 'https://x.com/other/status/40004'),
    listedOne('spaces/AAQAaa_0I9g/messages/l5', NOW - 2 * HOUR, ''),  // no link: counted as its own message
    listedOne('spaces/AAQAaa_0I9g/messages/l6', NOW - 10 * DAY, 'https://x.com/other/status/40006'),  // older than the window
  ];

  /**
   * A bot whose run-log readers answer from `log` and `listed` (hand-made, as RunLog.gs would read them), and keep
   * every call: w.calls.
   */
  const stubbed = (log, listed) => {
    const w = world();
    w.calls = [];
    w.bot.__calls = w.calls;
    w.bot.__log = log;
    w.bot.__listed = listed;
    w.bot.ev('runLogRead_ = (...a) => { __calls.push(["runLogRead_"].concat(a.map(x => (x && x.getSheetByName ? "ss" : x)))); return __log; }; ' +
      'offListed_ = (...a) => { __calls.push(["offListed_"].concat(a.map(x => (x && x.getSheetByName ? "ss" : x)))); return __listed; };');
    w.ss = w.g.services.SpreadsheetApp.create('bot');
    w.on = () => { const ctx = w.ctx(); ctx.switches = switchesOn(w.bot); return ctx; };
    return w;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // OFF: exactly as before
  // ---------------------------------------------------------------------------------------------------------------

  test('speed honest results: OFF (the default), the Results tab is exactly as before: none of the new lines, and neither the run log nor the "Burson while bot OFF" tab is read (no RUN_LOG property, neither tab looked up, no reader called): cell for cell, merges and row heights the same as a bot whose readers would fail if called; ON in the same world, the section is there and each reader is read once', () => {
    const build = (readers) => {
      const w = world();
      const calls = [];
      w.bot.__calls = calls;
      ['runLogRead_', 'offListed_', 'runLogCheckIn_', 'runLogSpans_', 'runLogStart_', 'resultsHonest_', 'resultsHonestFor_'].forEach(f => {
        w.bot.ev(readers === 'fail' ? `${f} = () => { throw new Error("${f} called"); }`
          : `${f} = (g => (...a) => { __calls.push("${f}"); return g(...a); })(${f})`);
      });
      const props = { reads: [], writes: [] };
      const get = w.g.props.get.bind(w.g.props);
      const has = w.g.props.has.bind(w.g.props);
      const set = w.g.props.set.bind(w.g.props);
      w.g.props.get = k => { props.reads.push(k); return get(k); };
      w.g.props.has = k => { props.reads.push(k); return has(k); };
      w.g.props.set = (k, v) => { props.writes.push(k); return set(k, v); };
      const ss = w.g.services.SpreadsheetApp.create('bot');
      const names = [];
      const byName = ss.getSheetByName.bind(ss);
      ss.getSheetByName = n => { names.push(n); return byName(n); };
      const ctx = w.ctx();
      ctx.switches = w.bot.switchesOff_();  // every switch OFF, row 56 too
      w.bot.refreshSpeed_(ss, ctx, opts());
      return { w, ss, calls, props, names, tab: ss.getSheetByName('Results') };
    };
    const off = build('spy');
    const failing = build('fail');
    eq([off.calls, off.props.reads.filter(k => /^RUN_LOG/.test(k)), off.props.writes.filter(k => /^RUN_LOG/.test(k)),
      off.names.filter(n => n === 'When the bot ran' || n === 'Burson while bot OFF')], [[], [], [], []]);
    const text = JSON.stringify(off.tab.rows);
    eq([SECTION].concat(LABELS).filter(l => text.includes(JSON.stringify(l))), []);
    assert.ok(!/When the bot ran|while the bot was OFF|run log/.test(text));
    eq([off.tab.rows, off.tab.merges, off.tab.heights, off.tab.hidden].map(plainJson),
      [failing.tab.rows, failing.tab.merges, failing.tab.heights, failing.tab.hidden].map(plainJson));
    eq(off.props.writes.slice().sort(), failing.props.writes.slice().sort());
    // ON (the same world, the readers as they are): the section, and each reader read once for the rebuild
    const ctx = off.w.ctx();
    ctx.switches = switchesOn(off.w.bot);
    off.calls.length = 0;
    off.w.bot.refreshSpeed_(off.ss, ctx, opts());
    eq([sectionAt(off.tab) > 0, off.calls.filter(c => c === 'runLogRead_' || c === 'offListed_')], [true, ['runLogRead_', 'offListed_']]);
    eq(withoutSection(off.tab), failing.tab.rows);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // ON: the numbers, their place, and everything else as it was
  // ---------------------------------------------------------------------------------------------------------------

  test('speed honest results: ON, the section sits right under HEADLINE NUMBERS and its note (before WHAT BURSON GOT WRONG), and without it the tab is the OFF tab cell for cell: the alerts the bot was running for (its minutes to the email, the wait for it to pick the alert up, its own work until the email was ready, a person\'s wait to send its draft, who was first), each median with how many it is of; left out: an alert from a stop, one from before the run log began; Burson\'s alerts listed while OFF once per post, never one the bot reviewed', () => {
    const on = stubbed(LOG(), LISTED());
    on.bot.refreshSpeed_(on.ss, on.on(), opts());
    const off = stubbed(LOG(), LISTED());
    const offCtx = off.ctx();
    offCtx.switches = off.bot.switchesOff_();
    off.bot.refreshSpeed_(off.ss, offCtx, opts());
    const tab = on.ss.getSheetByName('Results');
    const offTab = off.ss.getSheetByName('Results');
    // read once each, for the tab's window (7 days back to now), from the bot's sheet
    eq(on.calls, [['runLogRead_', 'ss'], ['offListed_', NOW - 7 * DAY, NOW, 'ss']]);
    eq(off.calls, []);
    // its place: right under the headline numbers' note and its blank row; WHAT BURSON GOT WRONG right after it
    const at = sectionAt(tab);
    const head = tab.rows.findIndex(r => r[0] === 'HEADLINE NUMBERS');
    assert.match(tab.rows[at - 2][0], /^Minutes and "first" count only the alerts both the bot and the IMs sent a Social Alert for/);
    eq([at - head, tab.rows[at - 1].every(v => v === ''), tab.rows[at + BLOCK - 1].every(v => v === ''), tab.rows[at + BLOCK][0]],
      [18, true, true, 'WHAT BURSON GOT WRONG (last 7 days)']);
    // the lines: B the last 24 hours, C the last 7 days
    eq(tab.rows.slice(at, at + 11).map(r => r.slice(0, 3)), [
      [SECTION, 'Last 24 hours', 'Last 7 days'],
      [LABELS[0], '16.5 (2 alerts)', '6 (3 alerts)'],          // 3 and 30; with the 6 of 30 hours ago
      [LABELS[1], '1.5 (2 alerts)', '1 (3 alerts)'],           // picked up after 1 and 2 minutes; and 1
      [LABELS[2], '—', '—'],                                   // no alert the bot asked Burson to fix
      [LABELS[3], '2 (2 alerts)', '2 (3 alerts)'],             // to its email being ready: 3 - 1, and 4 - 2 (the draft); and 6 - 1
      [LABELS[4], '26 (1 draft)', '26 (1 draft)'],             // the draft, ready after 4 minutes, sent after 30
      [LABELS[5], '1 of 2, by 17 min (median)', '1 of 3, by 17 min (median)'],
      [LABELS[6], '1 of 2, by 5 min (median)', '2 of 3, by 3.5 min (median)'],
      [LABELS[7], 1, 1],                                       // the alert from the stop
      [LABELS[8], 0, 1],                                       // the alert from before the run log began
      [LABELS[9], 2, 3],                                       // one post listed twice, one without a link; and one 3 days ago
    ]);
    // the note: what the lines count, since when the run log is kept, before then not known, the stop
    eq(tab.rows[at + 11][0], `${NOTE_HEAD}, kept since ${T(NOW - 2 * DAY)} ET)${NOTE_MID} Before ${T(NOW - 2 * DAY)} ET it is not known ` +
      `whether the bot was running. In the last 7 days: the bot was not running from ${T(NOW - 10 * HOUR)} to ${T(NOW - 6 * HOUR)} ET.`);
    // the usual lines are as they were (the stop's alert and the one before the log in them): the tab without the
    // section is the OFF tab, cell for cell, and its merges are the OFF tab's (those below it moved down) plus the note's
    eq(line(tab, OLD_BOT_LINE), [OLD_BOT_LINE, 30, 6]);
    eq(withoutSection(tab), offTab.rows);
    const moved = offTab.merges.map(m => { const [r, ...rest] = m.split(','); return [Number(r) > at ? Number(r) + BLOCK : Number(r)].concat(rest).join(','); });
    eq(tab.merges.slice().sort(), moved.concat([`${at + 12},1,1,8`]).sort());
    eq(tab.hidden, offTab.hidden);
    // EVERY ALERT is found under it, as the next rebuild and the Analysis tab read it (readSpeedState_): an IM email
    // time a rebuild found is read back from its hidden column
    const state = on.bot.readSpeedState_(tab);
    eq(Array.from(state.keys()).sort(), ['x:30001', 'x:30002', 'x:30003', 'x:30004', 'x:30005', 'x:30006']);
    const h = tab.rows.findIndex(r => r[0] === 'Burson posted (ET)' && r.includes('post key'));
    const r5 = tab.rows.findIndex((r, i) => i > h && r[tab.rows[h].indexOf('post key')] === 'x:30005');
    tab.getRange(r5 + 1, tab.rows[h].indexOf('IM email at (ms)') + 1).setValue(A5 + 2 * MIN);
    on.bot.refreshSpeed_(on.ss, on.on(), opts());
    const r5b = tab.rows.findIndex((r, i) => i > h && r[tab.rows[h].indexOf('post key')] === 'x:30005');
    eq([tab.rows[r5b][tab.rows[h].indexOf('IMs\' time is from')], tab.rows[r5b][tab.rows[h].indexOf('IMs: minutes to email')],
      line(tab, LABELS[6])], ['their email', 2, [LABELS[6], '1 of 2, by 5 min (median)', '2 of 3, by 4.5 min (median)']]);
    // the Analysis tab, made from the Results tab's hidden state, is the same as with row 56 OFF
    eq(offTab.rows[r5 - BLOCK][tab.rows[h].indexOf('post key')], 'x:30005');  // the same row of the OFF tab: 12 rows up
    offTab.getRange(r5 - BLOCK + 1, tab.rows[h].indexOf('IM email at (ms)') + 1).setValue(A5 + 2 * MIN);
    off.bot.refreshSpeed_(off.ss, offCtx, opts());
    on.bot.refreshAnalysis_(on.ss, on.on(), opts());
    off.bot.refreshAnalysis_(off.ss, offCtx, opts());
    eq(plainJson(on.ss.getSheetByName('Analysis').rows), plainJson(off.ss.getSheetByName('Analysis').rows));
  });

  test('speed honest results: the alerts counted, one by one (resultsHonest_ on hand-made posts and logs): the same alerts as the usual speed lines only; a person\'s send of the bot\'s draft (the draft ready when it was made) next to the bot\'s own send (Auto-send included: never a person); the pick-up time from the alert\'s first rows, never a resend\'s; the bot\'s own alert from BigQuery has no pick-up time; paused and failing are left out like not running; inside a run, a stretch still going is not', () => {
    const posts = B.speedPosts_(rows(), drafts(), [], FLOWS);
    posts.forEach(p => { p.im_call = B.speedImCall_(p, NOW); });
    const byId = new Map(rows().map(r => [r.alert_id, r]));
    const h = B.resultsHonest_(posts, byId, LOG(), LISTED(), NOW, 7);
    eq([h.ok, h.start, h.last, h.days, h.windows.week.n, h.windows.week.down, h.windows.week.unknown, h.windows.day.off, h.windows.week.off],
      [true, NOW - 2 * DAY, NOW, 7, 3, 1, 1, 2, 3]);
    eq(plainJson(h.gaps), [{ from: NOW - 10 * HOUR, to: NOW - 6 * HOUR, state: 'not running', why: NOT_RUNNING_WHY, going: false }]);
    const one = (p, rs, log) => B.resultsHonestPost_(p, new Map(rs.map(r => [r.alert_id, r])), log || LOG());
    const post = (rs, extra) => Object.assign(B.speedPosts_(rs, [draft(9, A1 + 40 * MIN)], [], FLOWS)[0], { im_call: 'Social Alert' }, extra || {});
    // Auto-send: the bot sent its own draft later (email_sent_by 'bot'): ready when the draft was made, no person's wait
    const auto = [row('QA-9', 9, A1, { email_at: A1 + 3 * MIN, email_sent_at: A1 + 8 * MIN, email_sent_by: 'bot' })];
    const a = one(post(auto), auto);
    eq([a.kind, a.ready, a.person, a.seen], ['ok', A1 + 3 * MIN, false, A1 + MIN]);
    // a person's send: ready when the draft was made, their wait from then
    const sent = [row('QA-9', 9, A1, { email_at: A1 + 3 * MIN, email_sent_at: A1 + 8 * MIN, email_sent_by: 'lead@team.test' })];
    const s = one(post(sent), sent);
    eq([s.ready, s.person, s.sent], [A1 + 3 * MIN, true, A1 + 8 * MIN]);
    // the pick-up time comes from the first rows, never from a resend's
    const resent = [row('QA-9', 9, A1, { seen_at: A1 + 2 * MIN }), row('QA-10', 9, A1 + 30 * MIN, { resend_of: 'QA-9', seen_at: A1 + MIN / 2,
      email_status: '', email_at: '', email_sent_at: '' })];
    eq(one(post(resent), resent).seen, A1 + 2 * MIN);
    // none recorded: 0, and the waiting and own-work lines leave it out (the others count it)
    const unseen = [row('QA-9', 9, A1, { seen_at: '' })];
    const u = one(post(unseen), unseen);
    eq([u.kind, u.seen], ['ok', 0]);
    const wu = B.resultsHonestWindow_([u], []);
    eq([wu.n, wu.post_email, wu.waited_n, wu.waited, wu.own_n], [1, 3, 0, null, 0]);
    // the bot's own alert of the post from BigQuery: no pick-up time
    eq(one(post(unseen, { bot_from_bq: true }), [row('QA-9', 9, A1)]).seen, 0);
    // not one of the speed lines' alerts: no Social Alert from the IMs, none from the bot, the start not recorded, no IM time
    [{ im_call: 'No Social Alert' }, { bot_alerted: false }, { start_known: false }, { im_draft: null }].forEach(x => {
      eq(one(post(auto, x), auto), null);
    });
    // paused and failing are left out like not running; not known is its own count
    const log = state => ({ ok: true, why: '', start: NOW - 2 * DAY, last: NOW, spans: [{ from: A1 + 30 * 1000, to: A1 + 90 * 1000, state, why: '' }] });
    eq(['paused', 'failing', 'not running', 'not known', 'running'].map(st => one(post(auto), auto, log(st)).kind),
      ['down', 'down', 'down', 'unknown', 'ok']);
    // no log at all, or one that can't be read: not known, all of them
    eq([one(post(auto), auto, { ok: true, why: '', start: 0, last: 0, spans: [] }).kind,
      one(post(auto), auto, { ok: false, why: 'x', start: 0, last: 0, spans: [] }).kind, B.resultsHonest_(posts, byId, null, [], NOW, 7).windows.week.unknown],
    ['unknown', 'unknown', 5]);
    // the open stretch: still going outside a run; inside a run (this run is the last stretch) it is not
    const paused = { ok: true, why: '', start: NOW - 2 * DAY, last: NOW - 2 * MIN, spans: [
      { from: NOW - 2 * DAY, to: NOW - HOUR, state: 'running', why: '' }, { from: NOW - HOUR, to: NOW - 2 * MIN, state: 'paused', why: '', open: true }] };
    eq(B.resultsHonest_(posts, byId, paused, [], NOW, 7).gaps.map(g => g.going), [true]);
    const inRun = Object.assign({}, paused, { last: NOW, spans: paused.spans.concat([{ from: NOW - MIN, to: NOW, state: 'running', why: '', current: true }]) });
    eq(B.resultsHonest_(posts, byId, inRun, [], NOW, 7).gaps.map(g => g.going), [false]);
    // Burson's alerts listed while OFF: once per post (the earliest time), never a post the tab has (its link, a Reddit
    // comment under its post, or, without a link, the moment Burson posted it), only in the window, and only one posted
    // in its own paused stretch (review N2: one listed from before the pause is not one posted while the bot was OFF)
    const reviewed = [{ key: 'x:30001', burson_at: A1 }, { key: 'rd:abc123', burson_at: A2 }, { key: '', burson_at: A3 }];
    const L = (name, at, link, stretch) => Object.assign({ name, at, url: link, stretchFrom: at - HOUR, stretchTo: at + HOUR }, stretch || {});
    eq(B.resultsOffPosts_([
      L('m1', A1, url(1)), L('m2', A2, 'https://www.reddit.com/r/x/comments/abc123/t/def456/'), L('m3', A3, ''), L('m4', A3 + MIN, ''),
      L('m5', NOW - 2 * HOUR, 'https://x.com/other/status/40001'), L('m6', NOW - 3 * HOUR, 'https://twitter.com/other/status/40001'),
      L('m7', NOW - 8 * DAY, 'https://x.com/other/status/40007'), L('m8', NOW + MIN, 'https://x.com/other/status/40008'),
      L('m9', NOW - 4 * HOUR, 'https://x.com/other/status/40009', { stretchFrom: NOW - 4 * HOUR + MIN }),  // before its pause
      L('m10', NOW - 5 * HOUR, 'https://x.com/other/status/40010', { stretchTo: NOW - 5 * HOUR - MIN }),   // after it
      L('m11', NOW - 6 * HOUR, 'https://x.com/other/status/40011', { stretchFrom: 0, stretchTo: 0 }),       // no stretch
      L('m12', NOW - 7 * HOUR, 'https://x.com/other/status/40012', { stretchFrom: NOW - 7 * HOUR, stretchTo: NOW - 7 * HOUR }),  // its very ends
    ], reviewed, NOW - 7 * DAY, NOW).sort(), [A3 + MIN, NOW - 3 * HOUR, NOW - 7 * HOUR].sort());
  });

  test('speed honest results: an alert the bot asked Burson to fix and resend (review N3): its own work is timed from picking up the resend its email came from, the wait for that resend is on its own line, and the wait for the bot to run is still from Burson\'s first post to the bot picking that one up: 1 + 120 + 1 minutes make the 122 from Burson\'s post to the email', () => {
    const t0 = NOW - 5 * HOUR;
    // Burson posts at t0 without a link; the bot picks it up a minute later and asks Burson; Burson resends 2 hours later;
    // the bot picks the resend up a minute after that, and its Social Alert goes out a minute later
    const orig = { alert_id: 'QA-1', source_at: t0, seen_at: t0 + MIN, created_at: t0 + MIN, status: 'superseded', email_status: '' };
    const resend = { alert_id: 'QA-2', resend_of: 'QA-1', source_at: t0 + 120 * MIN, seen_at: t0 + 121 * MIN, created_at: t0 + 121 * MIN,
      email_status: 'sent', email_at: t0 + 122 * MIN, email_sent_at: t0 + 122 * MIN, email_sent_by: 'mailbox@team.test' };
    const p = { start_known: true, bot_alerted: true, im_call: 'Social Alert', bot_email_at: t0 + 122 * MIN, burson_at: t0,
      im_email_at: t0 + 150 * MIN, alert_ids: ['QA-1', 'QA-2'], bot_from_bq: false, key: 'x:1' };
    const byId = new Map([['QA-1', orig], ['QA-2', resend]]);
    const log = { ok: true, why: '', start: NOW - DAY, last: NOW, spans: [{ from: NOW - DAY, to: NOW, state: 'running', why: '', open: true }] };
    const x = B.resultsHonestPost_(p, byId, log);
    eq([x.kind, x.seen, x.work, x.resend, x.ready], ['ok', t0 + MIN, t0 + 121 * MIN, 120 * MIN, t0 + 122 * MIN]);
    const w = B.resultsHonestWindow_([x], []);
    eq([w.post_email, w.waited, w.waited_n, w.resend, w.resend_n, w.own, w.own_n], [122, 1, 1, 120, 1, 1, 1]);
    const h = B.resultsHonest_([p], byId, log, [], NOW, 7);
    eq(B.resultsHonestRows_(h, 7).slice(1, 5).map(r => r[0]), [
      [LABELS[0], '122 (1 alert)', '122 (1 alert)'], [LABELS[1], '1 (1 alert)', '1 (1 alert)'],
      [LABELS[2], '120 (1 alert)', '120 (1 alert)'], [LABELS[3], '1 (1 alert)', '1 (1 alert)']]);
    // an alert with no resend: its own work from when it was picked up, and no wait for a resend
    const plain = B.resultsHonestPost_(Object.assign({}, p, { alert_ids: ['QA-3'] }), new Map([['QA-3', Object.assign({}, resend,
      { alert_id: 'QA-3', resend_of: '', source_at: t0, seen_at: t0 + MIN })]]), log);
    eq([plain.work, plain.resend, B.resultsHonestWindow_([plain], []).own], [t0 + MIN, null, 121]);
    // a resend with no pick-up time recorded: own work from the first alert's, as before, and no wait for a resend line
    const old = B.resultsHonestPost_(p, new Map([['QA-1', orig], ['QA-2', Object.assign({}, resend, { seen_at: '' })]]), log);
    eq([old.work, old.resend], [t0 + MIN, null]);
  });

  test('speed honest results: the bot\'s own email from BigQuery that went out before Burson posted (review N5): nothing waited for the bot, so it is counted with the alerts the bot was running for (its minutes are 0 on the usual line), whatever the run log says between the email and Burson\'s post, and the answer is the same through resultsHonest_ as on its own', () => {
    const et = (d, h, m) => Date.UTC(2026, 10, d, h + 5, m || 0);
    const now = et(18, 15, 0);
    const bq = { alert_id: 'BQ-1', email_status: 'sent', email_at: et(18, 9, 0), email_sent_at: et(18, 9, 0), email_sent_by: 'bot', source_at: et(18, 8, 55) };
    const p = { start_known: true, bot_alerted: true, im_call: 'Social Alert', bot_email_at: et(18, 9, 0), burson_at: et(18, 12, 0),
      im_email_at: et(18, 12, 30), alert_ids: ['BQ-1'], bot_from_bq: true, key: 'x.com/status/1' };
    const byId = new Map([['BQ-1', bq]]);
    // Bot OFF from 10:00 to 11:00, after the bot's email and before Burson's post
    const log = { ok: true, why: '', start: et(1, 0, 0), last: now, spans: [
      { from: et(1, 0, 0), to: et(18, 10, 0), state: 'running', why: '' },
      { from: et(18, 10, 0), to: et(18, 11, 0), state: 'paused', why: 'Bot (Control B2) was OFF' },
      { from: et(18, 11, 1), to: now, state: 'running', why: '', open: true }] };
    const x = B.resultsHonestPost_(p, byId, log);
    eq([x.kind, x.check], ['ok', null]);
    const h = B.resultsHonest_([p], byId, log, [], now, 7);
    eq([h.windows.week.n, h.windows.week.down, h.windows.week.unknown, h.windows.week.post_email, h.windows.week.bot_first], [1, 0, 0, 0, 1]);
    // the bot's email before the run log began: the same
    const later = Object.assign({}, log, { start: et(18, 9, 30), spans: log.spans.slice(1) });
    eq(B.resultsHonestPost_(p, byId, later).kind, 'ok');
    // the bot's email 8.5 days ago, a pause 8.2 days ago, Burson's post 6.9 days ago: on its own and through resultsHonest_ alike
    const DAYS = d => now - d * DAY;
    const p3 = Object.assign({}, p, { bot_email_at: DAYS(8.5), burson_at: DAYS(6.9), im_email_at: DAYS(6.9) + 30 * MIN });
    const r3 = new Map([['BQ-1', Object.assign({}, bq, { email_at: DAYS(8.5), email_sent_at: DAYS(8.5) })]]);
    const log3 = { ok: true, why: '', start: DAYS(30), last: now, spans: [{ from: DAYS(30), to: DAYS(8.2), state: 'running', why: '' },
      { from: DAYS(8.2), to: DAYS(8.1), state: 'paused', why: '' }, { from: DAYS(8.1), to: now, state: 'running', why: '', open: true }] };
    const h3 = B.resultsHonest_([p3], r3, log3, [], now, 7);
    eq([B.resultsHonestPost_(p3, r3, log3).kind, h3.windows.week.n, h3.windows.week.down], ['ok', 1, 0]);
    // the bot's own email from BigQuery AFTER Burson's post is checked as any other: the pause in between leaves it out
    const after = Object.assign({}, p, { bot_email_at: et(18, 11, 30), burson_at: et(18, 9, 30) });
    const ra = new Map([['BQ-1', Object.assign({}, bq, { email_at: et(18, 11, 30), email_sent_at: et(18, 11, 30) })]]);
    eq(B.resultsHonestPost_(after, ra, log).kind, 'down');
  });

  test('speed honest results: the note says what is not known: a run log that can\'t be read (a person\'s tab in the way) or not started yet counts every alert as not known; a stretch still going; more than 5 stretches ("and N more"); a log that reaches back further than the window (no "before" sentence); no run recorded for a while; and when the numbers can\'t be worked out the section says so and every other line is as usual; every cell at most 45,000 characters', () => {
    const base = { ok: true, why: '', start: NOW - 30 * DAY, last: NOW, days: 7, now: NOW, gaps: [] };
    eq(B.resultsHonestNote_(base), `${NOTE_HEAD}, kept since ${T(NOW - 30 * DAY)} ET)${NOTE_MID} In the last 7 days the run log shows no time when the bot ` +
      'was not running, paused or failing.');
    eq(B.resultsHonestNote_(Object.assign({}, base, { ok: false, why: 'a "When the bot ran" tab the bot didn\'t make is in the way' })),
      `${NOTE_HEAD})${NOTE_MID} The "When the bot ran" tab could not be read (a "When the bot ran" tab the bot didn't make is in the way), so it ` +
      'is not known whether the bot was running for any of these alerts: they are all counted as not known.');
    eq(B.resultsHonestNote_(Object.assign({}, base, { start: 0, last: 0 })), `${NOTE_HEAD})${NOTE_MID} The bot has not started its run log ` +
      'yet (its first run with row 56 ON starts it), so it is not known whether the bot was running for any of these alerts: they are all ' +
      'counted as not known.');
    const gap = (i, state, extra) => Object.assign({ from: NOW - (i + 1) * DAY, to: NOW - (i + 1) * DAY + HOUR, state, why: '', going: false }, extra || {});
    const many = [gap(0, 'paused', { to: NOW - 5 * MIN, going: true }), gap(1, 'failing'), gap(2, 'not running'), gap(3, 'not known', { why: 'the run log was OFF (Control row 56)' }),
      gap(4, 'not running'), gap(5, 'paused'), gap(6, 'failing')];
    eq(B.resultsHonestNote_(Object.assign({}, base, { gaps: many, last: NOW - 15 * MIN })).split(`${NOTE_MID} `)[1],
      `In the last 7 days: the bot was paused (Bot OFF on the Control tab) from ${T(NOW - DAY)} to ${T(NOW - 5 * MIN)} ET (still going when last ` +
      `recorded); the bot's runs were failing from ${T(NOW - 2 * DAY)} to ${T(NOW - 2 * DAY + HOUR)} ET; the bot was not running from ` +
      `${T(NOW - 3 * DAY)} to ${T(NOW - 3 * DAY + HOUR)} ET; it is not known whether the bot was running from ${T(NOW - 4 * DAY)} to ` +
      `${T(NOW - 4 * DAY + HOUR)} ET (the run log was OFF (Control row 56)); the bot was not running from ${T(NOW - 5 * DAY)} to ` +
      `${T(NOW - 5 * DAY + HOUR)} ET, and 2 more. No run is recorded after ${T(NOW - 15 * MIN)} ET.`);
    // the rows when nothing is known: every median "—", every alert of the speed lines in "not known"
    const posts = B.speedPosts_(rows(), drafts(), [], FLOWS);
    posts.forEach(p => { p.im_call = B.speedImCall_(p, NOW); });
    const byId = new Map(rows().map(r => [r.alert_id, r]));
    const blocked = B.resultsHonest_(posts, byId, { ok: false, why: 'a "When the bot ran" tab the bot didn\'t make is in the way', start: 0, last: 0, spans: [] }, [], NOW, 7);
    eq(B.resultsHonestRows_(blocked, 7).slice(1, 11).map(r => r[0].slice(1)), [['—', '—'], ['—', '—'], ['—', '—'], ['—', '—'], ['—', '—'],
      ['—', '—'], ['—', '—'], [0, 0], [3, 5], [0, 0]]);
    // a failure to work them out (a reader that throws, though none should): the section says so, the rest is as usual
    const w = stubbed(LOG(), LISTED());
    w.bot.ev('runLogRead_ = () => { throw new Error("the sheet could not be read"); }');
    w.bot.refreshSpeed_(w.ss, w.on(), opts());
    const tab = w.ss.getSheetByName('Results');
    const at = sectionAt(tab);
    eq(tab.rows.slice(at, at + 3).map(r => r.slice(0, 3)), [[SECTION, 'Last 24 hours', 'Last 7 days'],
      ['These numbers couldn\'t be worked out this time: the sheet could not be read. The lines above are counted as usual.', '', ''], ['', '', '']]);
    eq(tab.rows[at + 3][0], 'WHAT BURSON GOT WRONG (last 7 days)');
    const off = stubbed(LOG(), LISTED());
    const offCtx = off.ctx();
    offCtx.switches = off.bot.switchesOff_();
    off.bot.refreshSpeed_(off.ss, offCtx, opts());
    eq(tab.rows.slice(0, at).concat(tab.rows.slice(at + 3)), off.ss.getSheetByName('Results').rows);
    // every cell at most 45,000 characters, even with a reason of 100,000 characters and 2,000 stretches
    const huge = 'x'.repeat(100000);
    const longLog = { ok: true, why: '', start: NOW - 30 * DAY, last: NOW, spans: Array.from({ length: 2000 }, (_, i) => ({
      from: NOW - 6 * DAY + i * 2 * MIN, to: NOW - 6 * DAY + i * 2 * MIN + MIN, state: 'failing', why: huge })) };
    const cells = [].concat(
      B.resultsHonestRows_(B.resultsHonest_(posts, byId, longLog, [], NOW, 7), 7),
      B.resultsHonestRows_(B.resultsHonest_(posts, byId, { ok: false, why: huge, start: 0, last: 0, spans: [] }, [], NOW, 7), 7),
      B.resultsHonestRows_({ failed: huge }, 7)).map(r => r[0]).reduce((a, r) => a.concat(r), []);
    const longest = Math.max.apply(null, cells.map(c => String(c).length));
    assert.ok(longest <= 45000 && longest > 40000, `longest cell ${longest}`);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // End to end: poll() with row 56 ON
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * The Auto-correct world (B25 S-F Burson, read only; Testing with a tester in B30: the bot sends its Social Alert to
   * the tester at once). The IMs' side (BigQuery) is hand-made: their draft 22 minutes after Burson posted, once that
   * time has come. t.post(text): Zapier posts the alert in S-F Burson.
   */
  const acWorld = () => {
    const t = e2e(makeGoogle(NOW));
    t.bot.setup();
    t.set('B30', 'tester@team.test');
    t.set('B25', REAL);
    t.set('B29', 'ON');
    t.chat.addSpace(AC, AC_NAME);
    t.g.clock.now += HOUR;
    t.bot.startAutoCorrect(AC_NAME);
    t.bot.__drafts = [];
    t.bot.ev('speedImDrafts_ = () => __drafts.filter(d => d.at <= Date.now()); speedLogged_ = () => [];');
    t.post = text => {
      const m = t.chat.say(REAL, text, ZAPIER);
      t.bot.__drafts.push({ post_url: B.parseAlert_(text).fields.post_url, at: Date.parse(m.createTime) + 22 * MIN,
        subject: '⭐ SOCIAL ALERT ⭐: Search | An issue | X | 5000 Engagements', drafted_by: 'im@ops.test' });
      return m;
    };
    t.results = () => t.sheet().getSheetByName('Results');
    t.alerts = () => t.bot.sheetBackend_(t.sheet()).loadAlerts();
    t.spans = () => t.sheet().getSheetByName('When the bot ran').rows.slice(4).map(r => [r[4], r[5], r[6]]);
    t.poll();
    return t;
  };

  test('speed honest results: end to end, an 18-hour stop (no run at all) with Burson posting: the bot reads the backlog when it comes back, and the usual "the bot" line jumps (Burson\'s real post times); with row 56 ON the new lines leave those alerts out and count them as left out, and one from before the run log began as not known; every other line, and the whole tab without the section, is the same as with row 56 OFF', () => {
    const run = on => {
      const t = acWorld();
      t.post(F.P0_OK);  // before the run log began
      t.poll();
      t.poll();
      if (on) t.control().getRange(56, 2).setValue('ON');
      t.poll();
      t.poll();
      t.post(F.AIO);  // the bot running: picked up at the next run
      t.poll();
      t.poll();
      t.g.clock.now += HOUR;  // the trigger stops: no run for 18 hours
      t.post(F.PARIS);
      t.g.clock.now += 9 * HOUR;
      t.post(F.MISTAKES_FIXED);
      t.g.clock.now += 9 * HOUR;
      for (let i = 0; i < 3; i++) t.poll();
      return t;
    };
    const on = run(true);
    const off = run(false);
    // the four alerts were each sent (the backlog's when the bot came back), the same in both worlds
    const sent = t => t.alerts().map(a => [a.source_at, a.seen_at, a.email_status, a.email_sent_at]);
    eq(sent(on), sent(off));
    eq(on.alerts().map(a => a.email_status), ['sent', 'sent', 'sent', 'sent']);
    const [p0, aio, paris, fixed] = on.alerts();
    const stop = on.spans().find(s => s[2] === 'not running');
    assert.ok(stop[0] < paris.source_at && fixed.source_at < stop[1] && stop[1] <= paris.seen_at, JSON.stringify(stop));
    // the usual line counts the backlog's hours as the bot's; the new line only the alert it was running for
    const tab = on.results();
    const mins = a => Math.round((a.email_sent_at - a.source_at) / 6000) / 10;
    const raw = [p0, aio, paris, fixed].map(a => (a.email_sent_at - a.source_at) / MIN).sort((x, y) => x - y);
    const median = Math.round((raw[1] + raw[2]) / 2 * 10) / 10;  // of the four, as the line has always counted them
    eq(line(tab, OLD_BOT_LINE), [OLD_BOT_LINE, median, median]);
    assert.ok(line(tab, OLD_BOT_LINE)[2] > 200);
    const at = sectionAt(tab);
    const own = `${Math.round((aio.email_at - aio.seen_at) / 6000) / 10} (1 alert)`;
    eq(tab.rows.slice(at + 1, at + 11).map(r => r.slice(0, 3)), [
      [LABELS[0], `${mins(aio)} (1 alert)`, `${mins(aio)} (1 alert)`],
      [LABELS[1], `${Math.round((aio.seen_at - aio.source_at) / 6000) / 10} (1 alert)`, `${Math.round((aio.seen_at - aio.source_at) / 6000) / 10} (1 alert)`],
      [LABELS[2], '—', '—'],
      [LABELS[3], own, own],
      [LABELS[4], '—', '—'],
      [LABELS[5], '1 of 1, by 21 min (median)', '1 of 1, by 21 min (median)'],
      [LABELS[6], '0 of 1', '0 of 1'],
      [LABELS[7], 2, 2],  // the two from the stop
      [LABELS[8], 1, 1],  // the one from before the run log began
      [LABELS[9], 0, 0],
    ]);
    const start = on.spans()[0][0];
    assert.ok(p0.source_at < start && start < aio.source_at);
    eq(tab.rows[at + 11][0].split(`${NOTE_MID} `)[1], `Before ${T(start)} ET it is not known whether the bot was running. In the last 7 days: ` +
      `the bot was not running from ${T(stop[0])} to ${T(stop[1])} ET.`);
    // everything else is the same as with row 56 OFF
    eq(withoutSection(tab), off.results().rows);
    // run from the editor (refreshResults: outside a run, the run log read from the sheet), the same numbers
    on.bot.refreshResults();
    eq(on.results().rows.slice(at + 1, at + 11).map(r => r.slice(0, 3)), tab.rows.slice(at + 1, at + 11).map(r => r.slice(0, 3)));
  });

  test('speed honest results: end to end, Bot (B2) OFF while Burson posts two alerts: they are never reviewed (as before), and once Bot is ON again and the bot has listed them, the Results tab counts them on their own line (the last 24 hours and the last 7 days), and the pause in its note', () => {
    const t = acWorld();
    t.control().getRange(56, 2).setValue('ON');
    t.poll();
    t.poll();
    t.set('B2', 'OFF');
    t.poll();
    t.post(F.P0_OK);
    t.post(F.AIO);
    t.poll();
    t.poll();
    t.set('B2', 'ON');
    t.poll();
    t.poll();
    t.g.clock.now += 8 * MIN;  // the Results tab is rebuilt every 10 minutes when nothing happens
    t.poll();
    eq(t.alerts().length, 0);  // never reviewed
    const listed = t.sheet().getSheetByName('Burson while bot OFF').rows.slice(4);
    eq(listed.length, 2);
    const tab = t.results();
    const at = sectionAt(tab);
    eq(tab.rows[at + 10].slice(0, 3), [LABELS[9], 2, 2]);
    const paused = t.spans().find(s => s[2] === 'paused');
    assert.ok(tab.rows[at + 11][0].includes(`In the last 7 days: the bot was paused (Bot OFF on the Control tab) from ${T(paused[0])} to ${T(paused[1])} ET.`),
      tab.rows[at + 11][0]);
  });
};
