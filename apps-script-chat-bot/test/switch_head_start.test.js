// The Head start tab (HeadStart.gs): this app's own alerts (Early Detection cards and early signals, Watch alerts,
// Direct BigQuery alerts) next to Burson's alerts and the IMs' Social Alert emails: who alerted a story first and by how
// much. It has no switch: poll() rebuilds it at the end of a run, at most every 10 minutes, and never in a run that is
// still catching up on alerts. It reads the Alert log and writes only its own tab, where it also keeps each story's IM
// time (hidden columns, read back before the next rebuild). A tab of that name the bot didn't make is left alone, and
// the Control tab's Status says so.
'use strict';

module.exports = H => {
  const { test, eq, assert, B, NOW, world, e2e, F, TEST_FEED, TRIAGED, REAL } = H;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const TAB = 'Head start';
  const TITLE = B.ev('HEAD_START_TITLE_');
  // Columns 1 to 14: the story against Burson's first alert on it. 15 to 18: against Burson's alert on the story's own post.
  // The last three columns are hidden: the IMs' time the tab remembers for the story's Burson post (its key, ms, email or draft)
  const POST_COLS = ['Burson on this post (ET)', 'Head start on the post', 'Burson alert on this post', 'Head start on the post (min)'];
  const STATE = ['Burson post key', 'IM time (ms)', 'IM time from'];
  const HEADER = ['Type', 'This app alerted (ET)', 'Story', 'Product', 'Exposure Tag', 'Burson alerted (ET)', 'Head start over Burson',
    'IMs emailed (ET)', 'Head start over the IMs', 'Matched on', 'App alert', 'Burson alert', 'Head start over Burson (min)',
    'Head start over the IMs (min)'].concat(POST_COLS, STATE);
  const STATE_COL = HEADER.indexOf(STATE[0]) + 1;  // 19: the first hidden column
  const POST_LINE = 'Posts this app alerted before Burson alerted the same post (of these stories\' posts that Burson alerted too)';
  const REVERSE_LINE = 'Of Burson\'s alerts, those on a story this app had alerted first (same post or same story)';
  // The Alert log's `ingested` values, from the bot's own constants (never spelled out here)
  const ED = B.ev('ED_ALERT_INGESTED_');
  const WATCH = B.ev('PW_ALERT_INGESTED_');
  const DIRECT = B.ev('BQ_SOURCE_LABELS_');
  const EARLY = B.ev('EWS_WATCH_SIGNAL_');
  const MAIN = 'spaces/MIRROR > (isolated)';
  const AC = 'spaces/AAQAaa_0I9g > spaces/AUTOFIX' + B.ev('AC_PARTITION_SUFFIX_');
  const OTHERS = 'spaces/OTHERS > (isolated)' + B.ev('OS_PARTITION_SUFFIX_');
  const TAG = 'Product - Perceived bias';
  const ONGOING = B.ev('ONGOING_STATUS_SUFFIX_');
  const link = n => `https://x.com/user${n}/status/${70000 + n}`;
  const key = n => `x.com/status/${70000 + n}`;       // the post's record key (Alert.gs recordKey_)
  const postKey = n => `x:${70000 + n}`;              // the post on the Results tab (Speed.gs postKey_)
  /** An Alert-log row about post `n`, in the Mirror space unless `extra` says otherwise; `fields` go on forwarded_fields. */
  const row = (id, at, n, extra, fields) => Object.assign({
    alert_id: id, space: MAIN, source_at: at, created_at: at + MIN, record_key: key(n), status: 'ok', requested: [], email_status: '',
    decision: '', forwarded_fields: Object.assign({ post_url: link(n), social_network: 'X', author: `user${n}`, product: 'Search',
      exposure_tag: TAG, issue_name: `Issue ${n}` }, fields || {}),
  }, extra || {});
  const own = (id, at, n, ingested, fields, extra) => row(id, at, n, Object.assign({ ingested }, extra || {}), fields);
  const burson = (id, at, n, fields, extra) => row(id, at, n, extra, fields);
  const card = (id, at, n, snap, fields) => own(id, at, n, ED, Object.assign({ early_detection: snap || {} }, fields || {}));
  const report = (rows, im) => B.headStartReport_(rows, im === undefined ? null : im, NOW);
  const brief = s => [s.alert_id, s.type, s.matched, s.burson ? s.burson.alert_id : null, s.lead_ms === null ? null : s.lead_ms / MIN];
  // The owner's example: the card was posted on a Saturday at 11 PM ET, Burson's alert reached Google on Tuesday at 2 PM ET
  const SAT_11PM = Date.UTC(2026, 9, 11, 3, 0);
  const TUE_2PM = Date.UTC(2026, 9, 13, 18, 0);

  const sheetOf = w => w.g.services.SpreadsheetApp.create('bot');
  const tabOf = ss => ss.getSheetByName(TAB);
  const at = (tab, label) => tab.rows.findIndex(x => x[0] === label || String(x[0]).indexOf(label) === 0);
  const line = (tab, label) => (tab.rows.find(x => x[0] === label) || []).slice(1, 3);
  /** The stories under a section's header row, as {column name: cell}. */
  const table = (tab, section) => {
    const head = at(tab, section) + 1;
    const out = [];
    for (let i = head + 1; i < tab.rows.length && tab.rows[i][0] !== '' && tab.rows[i][0] !== 'None yet'; i++) {
      out.push(Object.fromEntries(HEADER.map((h, j) => [h, tab.rows[i][j]])));
    }
    return out;
  };
  const FLOW = `${TEST_FEED} > ${TRIAGED}`;  // the rows of the main flow in the Alert log of the sheet setup() makes
  const ZAPIER = { type: 'BOT', sender: 'users/zapier', displayName: 'Zapier' };
  /**
   * The bot as setup() leaves it (Testing, a tester in B30), with `rows` on its Alert log as earlier runs left them:
   * t.poll() is one every-minute run. The Results tab reads the IMs' drafts from `drafts` instead of BigQuery (which
   * the tests can't reach), so its rebuild works as it does live.
   */
  const pollWorld = (rows, drafts) => {
    const t = e2e();
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    const log = t.bot.sheetTable_(t.sheet(), 'Alert log', t.bot.ev('ALERT_COLUMNS_'), 'alert_id', 4000);
    rows.forEach(x => log.append(x));
    t.bot.speedImDrafts_ = () => drafts || [];
    t.bot.speedLogged_ = () => [];
    return t;
  };
  const made = t => !!tabOf(t.sheet());  // the Head start tab is there (it is made by its first rebuild)

  // ---------------------------------------------------------------------------------------------------------------
  // What's an own alert, a story, a Burson alert
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: an own alert is a row whose `ingested` is the Early Detection value, the Watch alert value or a Direct BigQuery source label (its type says which; an early-watch signal is an "Early signal"); Burson\'s rows, another tool\'s alerts and sheet test alerts are not', () => {
    const rows = [
      card('QA-1', NOW - 6 * HOUR, 1),
      card('QA-2', NOW - 5 * HOUR, 2, { signal_type: EARLY }),
      card('QA-3', NOW - 4.5 * HOUR, 3, { signal_type: 'VELOCITY_SPIKE' }),
      own('QA-4', NOW - 4 * HOUR, 4, WATCH),
      own('QA-5', NOW - 3 * HOUR, 5, DIRECT.SPRINKLR),
      own('QA-6', NOW - 2.5 * HOUR, 6, DIRECT.BMIE),
      own('QA-7', NOW - 2 * HOUR, 7, DIRECT.BSIP),
      own('QA-8', NOW - 90 * MIN, 8, B.ev('OTHER_INGESTED_'), null, { space: OTHERS }),
      own('QA-9', NOW - 80 * MIN, 9, B.ev('SHEET_TEST_INGESTED_')),
      own('QA-10', NOW - 70 * MIN, 10, 'Some later source'),
      burson('QA-11', NOW - HOUR, 11),
    ];
    const r = report(rows);
    eq(r.stories.map(s => [s.alert_id, s.type]), [['QA-7', 'Direct (BSIP)'], ['QA-6', 'Direct (BMIE)'], ['QA-5', 'Direct (Sprinklr)'],
      ['QA-4', 'Watch'], ['QA-3', 'Early Detection'], ['QA-2', 'Early signal'], ['QA-1', 'Early Detection']]);
    eq(rows.map(B.headStartOwnType_), ['Early Detection', 'Early signal', 'Early Detection', 'Watch', 'Direct (Sprinklr)', 'Direct (BMIE)',
      'Direct (BSIP)', '', '', '', '']);
    // neither this app's nor Burson's: the other tool's alert and the sheet test alert are in neither count
    eq([r.windows.week.stories, r.windows.week.burson_alerts, r.windows.week.unmatched], [7, 1, 7]);
    // the time is when the alert was posted (source_at: an own card's own post time in Chat), else when its row was written
    const timed = report([Object.assign(card('QA-20', NOW - HOUR, 20), { source_at: '', created_at: NOW - 50 * MIN }),
      Object.assign(card('QA-21', NOW - HOUR, 21), { source_at: 0, created_at: '' })]);
    eq(timed.stories.map(s => [s.alert_id, s.at]), [['QA-20', NOW - 50 * MIN]]);  // a row with no time at all is left out
  });

  test('head start: Burson\'s alerts are exactly the rows ProactiveWatch.gs pwBursonTimes_ counts (a link, a blank `ingested`, not the Other alerts space, a recorded time), timed at the earliest row of the post', () => {
    const rows = [
      burson('QA-1', NOW - 3 * HOUR, 1),
      burson('QA-2', NOW - 3 * HOUR - 40 * 1000, 1, null, { space: AC }),  // the same post in the auto-correct space, seconds earlier
      burson('QA-3', NOW - 2 * HOUR, 2, null, { space: OTHERS }),           // the Other alerts space's: not Burson's
      burson('QA-4', NOW - 2 * HOUR, 3, null, { record_key: '' }),          // no link
      burson('QA-5', NOW - 2 * HOUR, 4, null, { source_at: 0 }),            // from before the time was recorded
      burson('QA-6', NOW - HOUR, 5, null, { ingested: '' }),
      own('QA-7', NOW - HOUR, 6, DIRECT.SPRINKLR),
      own('QA-8', NOW - HOUR, 7, B.ev('OTHER_INGESTED_')),
      // on the first post too, and earlier, but not Burson's: the Other alerts space's copy, this app's own alert, an untimed row
      burson('QA-9', NOW - 5 * HOUR, 1, { issue_name: 'Another tool\'s alert' }, { space: OTHERS }),
      own('QA-10', NOW - 6 * HOUR, 1, WATCH, { issue_name: 'This app\'s own alert' }),
      burson('QA-12', NOW - 7 * HOUR, 1, { issue_name: 'Untimed' }, { source_at: '' }),
    ];
    const theirs = Array.from(B.headStartBurson_(rows).values());
    eq(Object.fromEntries(theirs.map(g => [g.key, g.at])), B.pwBursonTimes_(rows));
    eq(theirs.map(g => [g.key, g.at, g.alert_id, g.name, g.rows.map(x => x.id)]),
      [[key(1), NOW - 3 * HOUR - 40 * 1000, 'QA-2', 'Issue 1', ['QA-2', 'QA-1']], [key(5), NOW - HOUR, 'QA-6', 'Issue 5', ['QA-6']]]);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Ahead of Burson, behind Burson, no Burson alert
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: an own alert ahead of Burson on the same post (the card on Saturday at 11 PM, Burson\'s alert on Tuesday afternoon: "2 d 15 h"), one behind Burson ("behind by 20 min"), and one Burson never alerted (blank cells, never a zero)', () => {
    const rows = [
      // the card rests on three posts; Burson alerted the second of them (in both test spaces: the earliest row counts)
      card('QA-1', SAT_11PM, 1, { post_keys: [key(1), key(2), key(3)], story_title: 'Malware apps on the Play Store' },
        { issue_name: 'Banking malware in Play Store apps', product: 'Play Store' }),
      burson('QA-2', TUE_2PM + 30 * 1000, 2),
      burson('QA-3', TUE_2PM, 2, null, { space: AC }),
      own('QA-4', NOW - 20 * HOUR, 4, WATCH),
      burson('QA-5', NOW - 20 * HOUR - 20 * MIN, 4),
      own('QA-6', NOW - 2 * HOUR, 6, DIRECT.SPRINKLR),
    ];
    const r = report(rows);
    eq(r.stories.map(brief), [['QA-6', 'Direct (Sprinklr)', '', null, null], ['QA-4', 'Watch', 'same post', 'QA-5', -20],
      ['QA-1', 'Early Detection', 'same post', 'QA-3', 63 * 60]]);
    eq(r.stories[2].burson, { key: key(2), at: TUE_2PM, alert_id: 'QA-3', url: link(2), name: 'Issue 2' });
    eq(r.top.map(s => s.alert_id), ['QA-1']);  // only the stories this app alerted first
    const w = r.windows.week;
    eq([w.stories, w.matched, w.matched_pct, w.first, w.first_pct, w.first_median_min, w.behind, w.behind_median_min, w.unmatched],
      [3, 2, 67, 1, 50, 3780, 1, 20, 1]);
    eq([w.burson_alerts, w.burson_after, w.burson_after_pct, w.burson_after_by], [2, 1, 50, { post: 1, story: 0, name: 0, wording: 0 }]);

    const out = B.headStartTabRows_(r).rows;
    const head = out.findIndex(x => String(x[0]).indexOf('EVERY STORY') === 0) + 1;
    eq(out[head], HEADER);
    // (matched on the same post, the post-level cells say the same as the story-level ones: the same alert of Burson's)
    eq(out.slice(head + 1), [
      ['Direct (Sprinklr)', B.speedTime_(NOW - 2 * HOUR), `=HYPERLINK("${link(6)}","Issue 6")`, 'Search', TAG, '', '', '', '', '', 'QA-6', '', '', '',
        '', '', '', '', '', '', ''],
      ['Watch', B.speedTime_(NOW - 20 * HOUR), `=HYPERLINK("${link(4)}","Issue 4")`, 'Search', TAG, B.speedTime_(NOW - 20 * HOUR - 20 * MIN),
        'behind by 20 min', '', '', 'same post', 'QA-4', `=HYPERLINK("${link(4)}","QA-5")`, -20, '',
        B.speedTime_(NOW - 20 * HOUR - 20 * MIN), 'behind by 20 min', `=HYPERLINK("${link(4)}","QA-5")`, -20, '', '', ''],
      ['Early Detection', '2026-10-10 23:00', `=HYPERLINK("${link(1)}","Banking malware in Play Store apps")`, 'Play Store', TAG,
        '2026-10-13 14:00', '2 d 15 h', '', '', 'same post', 'QA-1', `=HYPERLINK("${link(2)}","QA-3")`, 3780, '',
        '2026-10-13 14:00', '2 d 15 h', `=HYPERLINK("${link(2)}","QA-3")`, 3780, '', '', ''],
    ]);
    assert.ok(!out.slice(head + 1).some(x => x.slice(5, 9).concat(x.slice(12)).some(v => v === 0)), 'never a zero for a missing time');
  });

  test('head start: a length of time in words: minutes, hours and minutes, days and hours; "behind by" when this app was later; nothing for none', () => {
    eq([45, 190, 3780, -20, 60, 24 * 60, 59.6, 0.4, -0.4, 0, 2 * 24 * 60 + 29, null, undefined, '', 'soon'].map(B.headStartWords_),
      ['45 min', '3 h 10 min', '2 d 15 h', 'behind by 20 min', '1 h', '1 d', '1 h', 'under 1 min', 'behind by under 1 min', 'the same minute',
        '2 d', '', '', '', '']);
  });

  test('head start: the small rules of a row and its cells: a day or more is rounded to the hour ("2 d 15 h 40 min" reads "2 d 16 h"); the plain minutes are to a tenth; an issue name, product, tag and link that are only among the Social Alert email\'s fields (or a tag only in the row\'s own column) are still read; a story of five alerts names four "and 1 more"; one of Burson\'s alerts without an id is named "Burson\'s alert"; a date in a time cell is a time; the IMs\' time is found by any row of Burson\'s post; one of Burson\'s alerts at the very moment of this app\'s story did not come after it; refreshHeadStart() makes the tab even with nothing to show', () => {
    const T = NOW - 2 * DAY;
    const col = name => HEADER.indexOf(name);
    // a day or more: to the hour, rounded (not cut)
    eq([2 * 24 * 60 + 15 * 60 + 40, 24 * 60 + 23 * 60 + 31, 24 * 60 + 29, 24 * 60 + 30, -(2 * 24 * 60 + 15 * 60 + 40)].map(B.headStartWords_),
      ['2 d 16 h', '2 d', '1 d', '1 d 1 h', 'behind by 2 d 16 h']);
    // the plain minutes: to a tenth of a minute (90 seconds are 1.5, 100 seconds 1.7), the words to the minute
    const quick = report([own('QA-1', T, 1, WATCH), burson('QA-2', T + 90 * 1000, 1)], { [postKey(1)]: { at: T + 100 * 1000, from: 'email' } });
    const quickRow = B.headStartRow_(quick.stories[0]);
    eq(['Head start over Burson', 'Head start over Burson (min)', 'Head start over the IMs', 'Head start over the IMs (min)', 'Head start on the post',
      'Head start on the post (min)'].map(h => quickRow[col(h)]), ['2 min', 1.5, '2 min', 1.7, '2 min', 1.5]);
    eq([quick.windows.week.first_median_min, quick.windows.week.im_median_min], [1.5, 1.7]);

    // The issue name, product, exposure tag and link are read from the row's forwarded fields, else from the Social
    // Alert email's fields (email_input.fields); the tag, failing both, from the row's own exposure_tag column
    const viaEmail = Object.assign(own('QA-1', T, 1, WATCH), { forwarded_fields: {},
      email_input: { fields: { issue_name: 'Named in the email', post_url: link(1), product: 'Maps', exposure_tag: 'Brand - Litigation' } } });
    const both = Object.assign(own('QA-2', T + HOUR, 2, WATCH), { email_input: { fields: { issue_name: 'Another name', post_url: link(9), product: 'Maps' } } });
    const tagColumn = Object.assign(own('QA-3', T + 2 * HOUR, 3, WATCH, { exposure_tag: '' }), { exposure_tag: 'Brand - Litigation' });
    eq([viaEmail, both, tagColumn].map(x => { const f = B.headStartRowFacts_(x); return [f.name, f.url, f.product, f.tag]; }),
      [['Named in the email', link(1), 'Maps', 'Brand - Litigation'], ['Issue 2', link(2), 'Search', TAG], ['Issue 3', link(3), 'Search', 'Brand - Litigation']]);
    eq(report([viaEmail, both, tagColumn]).stories.map(s => [s.alert_id, s.name, s.url, s.product, s.tag]).reverse(),
      [['QA-1', 'Named in the email', link(1), 'Maps', 'Brand - Litigation'], ['QA-2', 'Issue 2', link(2), 'Search', TAG],
        ['QA-3', 'Issue 3', link(3), 'Search', 'Brand - Litigation']]);
    // ... and Burson's alert under a name that is only in its email's fields is still found by that name (same story)
    const NAME = 'Banking malware in Play Store apps';
    const theirs = Object.assign(burson('QA-5', T + 3 * HOUR, 5), { forwarded_fields: { post_url: link(5) },
      email_input: { fields: { issue_name: NAME, issue_status: ONGOING, exposure_tag: 'Another tag' } } });
    eq(report([own('QA-4', T, 4, WATCH, { issue_name: NAME }), theirs]).stories.map(brief), [['QA-4', 'Watch', 'same story', 'QA-5', 180]]);

    // A story of five alerts names four and says how many more; one of four names them all
    const chain = n => Array.from({ length: n }, (x, i) => card(`QA-${i + 1}`, T + i * HOUR, 20 + i, { update_of: i ? `QA-${i}` : '' }));
    eq([5, 4, 7].map(n => B.headStartRow_(report(chain(n)).stories[0])[col('App alert')]),
      ['QA-1, QA-2, QA-3, QA-4 and 1 more', 'QA-1, QA-2, QA-3, QA-4', 'QA-1, QA-2, QA-3, QA-4 and 3 more']);
    // One of Burson's alerts without an id is still linked, as "Burson's alert" (on the story and on the post)
    const anon = B.headStartRow_(report([own('QA-1', T, 1, WATCH), burson('', T + HOUR, 1)]).stories[0]);
    eq([anon[col('Burson alert')], anon[col('Burson alert on this post')]], new Array(2).fill(`=HYPERLINK("${link(1)}","Burson's alert")`));

    // A time cell that holds a date (Sheets can hand one back) is a time, for this app's rows and for Burson's
    const dated = report([Object.assign(own('QA-1', T, 1, WATCH), { source_at: new Date(T) }),
      Object.assign(own('QA-2', T, 2, WATCH), { source_at: '', created_at: new Date(T + HOUR) }),
      Object.assign(burson('QA-3', T, 1), { source_at: new Date(T + 2 * HOUR) })]);
    eq([dated.stories.map(s => [s.alert_id, s.at, s.lead_ms]).reverse(), B.headStartTime_(new Date(T)), B.headStartTime_(new Date(NaN))],
      [[['QA-1', T, 2 * HOUR], ['QA-2', T + HOUR, null]], T, 0]);

    // The IMs' time is found by any row of Burson's post: here its first row (the earlier one) has no link among its
    // fields, and its second row, in the other test space, has
    const split = [own('QA-1', T, 1, WATCH), burson('QA-2', T + HOUR, 1, { post_url: '' }), burson('QA-3', T + HOUR + 30 * 1000, 1, null, { space: AC })];
    eq(report(split, { [postKey(1)]: { at: T + 2 * HOUR, from: 'email' } }).stories.map(s => [s.burson.alert_id, s.im, s.im_key, s.im_lead_ms / MIN]),
      [['QA-2', { at: T + 2 * HOUR, from: 'email' }, postKey(1), 120]]);

    // The reverse view: one of Burson's alerts on the story (here under its name, the weaker rule) at the very moment of
    // this app's alert did not come after it; a millisecond later it did
    const moment = ms => report([own('QA-1', T, 1, WATCH, { issue_name: NAME }), burson('QA-2', T + HOUR, 1),
      burson('QA-3', T + ms, 3, { issue_name: NAME, issue_status: 'NEW' })]).windows.week;
    eq([0, 1].map(ms => { const w = moment(ms); return [w.first, w.burson_alerts, w.burson_after, w.burson_after_by]; }),
      [[1, 2, 1, { post: 1, story: 0, name: 0, wording: 0 }], [1, 2, 2, { post: 1, story: 0, name: 1, wording: 0 }]]);

    // refreshHeadStart(), from the editor, makes the tab even when this app has no alert of its own yet (the
    // every-minute rebuild waits for one), and hands back the numbers
    const w = world();
    const ss = sheetOf(w);
    w.bot.sheetBackend_(ss).appendAlert(burson('QA-1', NOW - HOUR, 1));
    w.g.props.set('STORE_SHEET_ID', ss.getId());
    eq([w.bot.maybeRefreshHeadStart_(ss, w.ctx(), { deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now }), !!tabOf(ss)], [false, false]);
    const numbers = w.bot.refreshHeadStart();
    eq([numbers.week.stories, numbers.week.burson_alerts, tabOf(ss).cell(1, 1), tabOf(ss).rows.filter(x => x[0] === 'None yet').length], [0, 1, TITLE, 2]);
    // With no sheet to work on, the every-minute rebuild does nothing: nothing noted, nothing in the log
    const bare = world();
    eq([bare.bot.maybeRefreshHeadStart_(null, bare.ctx(), { deadline: bare.g.clock.now + 4 * MIN, runStart: bare.g.clock.now }),
      bare.g.props.get('HEAD_START_AT'), bare.g.logs.filter(l => /Head start/.test(l))], [false, undefined, []]);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Stories: an update joins its card; own alerts on the same post are one story
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: an update folds into its story: the cards that update an earlier card (by its Alert-log id, or its BigQuery alert id) and own alerts on the same post count once, timed from the earliest; Burson\'s alert on an update\'s post is measured from the first card', () => {
    const T = NOW - 3 * DAY;
    const rows = [
      card('QA-1', T, 1, { ed_alert_id: 'ed-first', post_keys: [key(1)], update_of: '' }, { issue_name: 'Fake Chrome update installs spyware' }),
      card('QA-2', T + 5 * HOUR, 2, { ed_alert_id: 'ed-second', post_keys: [key(2), key(12)], update_of: 'QA-1' }),
      card('QA-3', T + 9 * HOUR, 3, { ed_alert_id: 'ed-third', post_keys: [key(3)], update_of: 'ed-second' }),
      burson('QA-4', T + 10 * HOUR, 12),  // one of the first update's posts
      // the same post alerted by this app in both test spaces: one story
      own('QA-5', NOW - 30 * HOUR, 5, DIRECT.SPRINKLR),
      own('QA-6', NOW - 30 * HOUR + MIN, 5, DIRECT.SPRINKLR, null, { space: AC }),
      // an update of a card that is no longer among the rows read: a story of its own
      card('QA-7', NOW - 3 * HOUR, 7, { update_of: 'QA-0' }),
      // a Watch alert on one of an Early Detection card's posts: the same story as that card
      card('QA-8', NOW - 12 * HOUR, 8, { post_keys: [key(8), key(9)] }),
      own('QA-9', NOW - 10 * HOUR, 9, WATCH),
    ];
    const r = report(rows);
    eq(r.stories.map(s => [s.alert_id, s.type, s.alert_ids, s.alerts, s.at, s.keys]), [
      ['QA-7', 'Early Detection', ['QA-7'], 1, NOW - 3 * HOUR, [key(7)]],
      ['QA-8', 'Early Detection', ['QA-8', 'QA-9'], 2, NOW - 12 * HOUR, [key(8), key(9)]],
      ['QA-5', 'Direct (Sprinklr)', ['QA-5', 'QA-6'], 2, NOW - 30 * HOUR, [key(5)]],
      ['QA-1', 'Early Detection', ['QA-1', 'QA-2', 'QA-3'], 3, T, [key(1), key(2), key(12), key(3)]],
    ]);
    eq(brief(r.stories[3]), ['QA-1', 'Early Detection', 'same post', 'QA-4', 10 * 60]);  // from the first card, not the update
    eq([r.stories[3].name, r.windows.week.stories, r.windows.week.matched], ['Fake Chrome update installs spyware', 4, 1]);
    eq(B.headStartTabRows_(r).rows.filter(x => x[10] === 'QA-1, QA-2, QA-3').length, 2);  // BIGGEST HEAD STARTS and EVERY STORY
    // an Early Detection card keeps 8 post keys at most
    const many = report([card('QA-1', T, 1, { post_keys: Array.from({ length: 12 }, (x, i) => key(100 + i)) })]);
    eq(many.stories[0].keys.length, 9);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // The same story on another post
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: the same-story rule: Burson\'s alert on another post carries the story\'s exact issue name and the later of the two is an Ongoing Issue (what a review records when it takes an alert for an issue already alerted): "same story", either way round, within 14 days', () => {
    const T = NOW - 5 * DAY;
    const NAME = 'Banking malware in Play Store apps';
    const story = fields => card('QA-1', T, 1, { post_keys: [key(1)] }, Object.assign({ issue_name: NAME }, fields || {}));
    const match = rows => brief(report(rows).stories.find(s => s.alert_id === 'QA-1'));
    // Burson's alert on another post, under another exposure tag (so the two are not alike in wording by the weaker rule)
    const theirs = (at, name, status) => burson('QA-2', at, 2, Object.assign({ issue_name: name, exposure_tag: 'Another tag' },
      status ? { issue_status: status } : {}));
    // Burson two days later, as an Ongoing Issue under the story's name (however it is written)
    eq(match([story(), theirs(T + 2 * DAY, 'banking  malware in Play Store apps', ONGOING)]),
      ['QA-1', 'Early Detection', 'same story', 'QA-2', 2 * 24 * 60]);
    eq(match([story(), theirs(T + 2 * DAY, `${NAME} / ${ONGOING}`, 'ongoing issue')])[2], 'same story');
    // the same name, but Burson's later alert is still New (or says nothing): no review took it for this story
    eq(match([story(), theirs(T + 2 * DAY, NAME, 'NEW')]), ['QA-1', 'Early Detection', '', null, null]);
    eq(match([story(), theirs(T + 2 * DAY, NAME, '')])[2], '');
    // Burson first, and this app's later alert is the Ongoing Issue under Burson's name: the same story, this app behind
    eq(match([story({ issue_status: ONGOING }), theirs(T - 6 * HOUR, NAME, 'NEW')]), ['QA-1', 'Early Detection', 'same story', 'QA-2', -6 * 60]);
    // ... but not when only Burson's EARLIER alert says Ongoing (it was ongoing about something older)
    eq(match([story(), theirs(T - 6 * HOUR, NAME, ONGOING)])[2], '');
    // 14 days either side of the story, no further
    const far = d => match([story(), theirs(T + d, NAME, ONGOING)])[2];
    eq([far(14 * DAY), far(14 * DAY + MIN), far(-14 * DAY - MIN)], ['same story', '', '']);
    // another name: not the same story
    eq(match([story(), theirs(T + DAY, 'Play Store refund delays', ONGOING)])[2], '');
    // the issue's name is on an update of the story: still the story's, measured from its first card
    eq(match([story({ issue_name: 'Suspicious apps' }), card('QA-3', T + HOUR, 3, { update_of: 'QA-1' }, { issue_name: NAME }),
      theirs(T + DAY, NAME, ONGOING)]), ['QA-1', 'Early Detection', 'same story', 'QA-2', 24 * 60]);
  });

  test('head start: the same-story rule on a story of two alerts: the 14 days are measured from the story\'s time (its first alert), not from its update, and a match is measured from the first alert too', () => {
    const T = NOW - 25 * DAY;
    const NAME = 'Banking malware in Play Store apps';
    const first = card('QA-1', T, 1, { post_keys: [key(1)] }, { issue_name: NAME });
    const update = fields => card('QA-3', T + 10 * DAY, 3, { post_keys: [key(3)], update_of: 'QA-1' }, Object.assign({ issue_name: NAME }, fields || {}));
    // Burson's alert on another post under the story's name, under another exposure tag (so no weaker rule can match it)
    const theirs = (at, status) => burson('QA-2', at, 2, { issue_name: NAME, issue_status: status, exposure_tag: 'Another tag' });
    const match = rows => report(rows).stories.map(s => brief(s).concat([s.alert_ids]));
    // Burson's Ongoing alert 20 days after the card: 10 days after the update, but 20 from the story. Not matched
    eq(match([first, update(), theirs(T + 20 * DAY, ONGOING)]), [['QA-1', 'Early Detection', '', null, null, ['QA-1', 'QA-3']]]);
    // ... the same alert 14 days after the card is the story's
    eq(match([first, update(), theirs(T + 14 * DAY, ONGOING)]), [['QA-1', 'Early Detection', 'same story', 'QA-2', 14 * 24 * 60, ['QA-1', 'QA-3']]]);
    // ... and the update on its own (its card not among the rows) is a story timed from itself: 10 days is near enough
    eq(match([update(), theirs(T + 20 * DAY, ONGOING)]), [['QA-3', 'Early Detection', 'same story', 'QA-2', 10 * 24 * 60, ['QA-3']]]);
    // Burson's alert BETWEEN the card and its update, which this app's own review then took for Burson's issue (the
    // update is an Ongoing Issue under that name): the same story, measured from the card. This app was 5 days ahead of
    // Burson, not 5 days behind it
    const r = report([first, theirs(T + 5 * DAY, 'NEW'), update({ issue_status: ONGOING })]);
    eq(r.stories.map(s => brief(s).concat([s.alert_ids, s.at])), [['QA-1', 'Early Detection', 'same story', 'QA-2', 5 * 24 * 60, ['QA-1', 'QA-3'], T]]);
    eq([r.windows.month.first, r.windows.month.first_median_min, r.windows.month.behind, r.windows.month.burson_after], [1, 5 * 24 * 60, 0, 1]);
    eq(B.headStartTabRows_(r).rows.filter(c => c[10] === 'QA-1, QA-3').map(c => [c[1], c[5], c[6], c[9], c[12]]),
      new Array(2).fill([B.speedTime_(T), B.speedTime_(T + 5 * DAY), '5 d', 'same story', 5 * 24 * 60]));
    // without the update's Ongoing status nothing says a review took the two for one issue: no sure match (and none
    // weaker, under two different exposure tags)
    eq(match([first, theirs(T + 5 * DAY, 'NEW'), update()]), [['QA-1', 'Early Detection', '', null, null, ['QA-1', 'QA-3']]]);
  });

  test('head start: a story is measured against Burson\'s FIRST alert on it: the earliest alert the same-post and same-story rules give together, labelled with the rule that gave it; a later alert of Burson\'s on the story\'s own post never hides an earlier one on the same story (the head start is not overstated), and never makes this app first on a story Burson already had', () => {
    const NAME = 'Banking malware in Play Store apps';
    const taken = { issue_name: NAME, issue_status: ONGOING, exposure_tag: 'Another tag' };  // a review took it for the story's issue
    const numbers = w => [w.stories, w.matched, w.first, w.first_median_min, w.behind, w.behind_median_min, w.burson_alerts, w.burson_after,
      w.burson_after_by];
    // The card rests on three posts. Burson alerts the story on another post a day later, and the card's third post
    // four days after the card: the head start is one day, to Burson's first alert on the story, not four
    const T = NOW - 6 * DAY;
    const ahead = [
      card('QA-1', T, 1, { post_keys: [key(1), key(2), key(3)] }, { issue_name: NAME }),
      burson('QA-2', T + DAY, 9, taken),
      burson('QA-3', T + 4 * DAY, 3),
    ];
    let r = report(ahead);
    eq(r.stories.map(brief), [['QA-1', 'Early Detection', 'same story', 'QA-2', 24 * 60]]);
    eq(numbers(r.windows.week), [1, 1, 1, 1440, 0, null, 2, 2, { post: 1, story: 1, name: 0, wording: 0 }]);
    eq(r.top.map(s => [s.alert_id, s.lead_ms / MIN]), [['QA-1', 1440]]);
    // the IMs' time is the one for the Burson alert the story is measured against (the earlier one, on the other post)
    const im = { [postKey(9)]: { at: T + DAY + 30 * MIN, from: 'email' }, [postKey(3)]: { at: T + 4 * DAY + HOUR, from: 'email' } };
    eq(report(ahead, im).stories.map(s => [s.burson.key, s.im, s.im_lead_ms / MIN]), [[key(9), { at: T + DAY + 30 * MIN, from: 'email' }, 24 * 60 + 30]]);
    // the other way round (Burson's alert on the card's own post is the earlier one): that one, as the same post
    eq(report([ahead[0], burson('QA-2', T + 4 * DAY, 9, taken), burson('QA-3', T + DAY, 3)]).stories.map(brief),
      [['QA-1', 'Early Detection', 'same post', 'QA-3', 24 * 60]]);

    // Burson had the story first: its alert on post 8, two hours before this app's Watch alert on post 5, which this
    // app's own review took for Burson's issue (its name, an Ongoing Issue). Burson alerted post 5 ten minutes after
    // this app. This app was two hours behind on the story, not ten minutes ahead of Burson
    const U = NOW - DAY;
    const behind = [
      burson('QA-11', U - 2 * HOUR, 8, { issue_name: NAME, exposure_tag: 'Another tag' }),
      own('QA-12', U, 5, WATCH, { issue_name: NAME, issue_status: ONGOING }),
      burson('QA-13', U + 10 * MIN, 5),
    ];
    r = report(behind);
    eq(r.stories.map(brief), [['QA-12', 'Watch', 'same story', 'QA-11', -120]]);
    // ... and neither of Burson's two alerts is one this app had first
    eq(numbers(r.windows.week), [1, 1, 0, null, 1, 120, 2, 0, { post: 0, story: 0, name: 0, wording: 0 }]);
    eq(r.top, []);
    const cells = B.headStartTabRows_(r).rows;
    eq(['This app alerted first (of those Burson alerted too)', 'Burson alerted first', 'Median time this app was behind (where Burson was first)',
      REVERSE_LINE].map(label => cells.find(c => c[0] === label)[1]),
    ['0 of 1 (0%)', 1, '2 h', '0 of 2 (0%)']);
    eq(cells.filter(c => c[10] === 'QA-12').map(c => [c[5], c[6], c[9], c[11], c[12]]),
      [[B.speedTime_(U - 2 * HOUR), 'behind by 2 h', 'same story', `=HYPERLINK("${link(8)}","QA-11")`, -120]]);
    // ... while the post-level cells of the same row show Burson's alert on the post itself, ten minutes after this app's
    eq(cells.filter(c => c[10] === 'QA-12').map(c => POST_COLS.map(h => c[HEADER.indexOf(h)])),
      [[B.speedTime_(U + 10 * MIN), '10 min', `=HYPERLINK("${link(5)}","QA-13")`, 10]]);
    eq(cells.find(c => c[0] === POST_LINE)[1], '1 of 1 (100%): median head start 10 min');
    assert.match(cells.map(c => String(c[0])).find(c => c.indexOf('Matched on:') === 0),
      /A story is measured against the earliest of Burson's alerts those two give: Burson's first alert on the story, even when Burson alerted the story's own post later\..* One of Burson's alerts counts as on a story this app had alerted first when it came after a story this app was first on, not when Burson already had that story \(/);
    // ... nor are Burson's next alerts on a story it had first (two more under the name, hours after this app's alert)
    r = report(behind.concat([burson('QA-14', U + 3 * HOUR, 14, taken), burson('QA-15', U + 6 * HOUR, 15, taken)]));
    eq([r.stories.map(brief), numbers(r.windows.week).slice(6)],
      [[['QA-12', 'Watch', 'same story', 'QA-11', -120]], [4, 0, { post: 0, story: 0, name: 0, wording: 0 }]]);
    // without Burson's earlier alert on the story, its alert on the same post is all there is: ten minutes ahead
    r = report(behind.slice(1));
    eq([r.stories.map(brief), numbers(r.windows.week).slice(6)],
      [[['QA-12', 'Watch', 'same post', 'QA-13', 10]], [1, 1, { post: 1, story: 0, name: 0, wording: 0 }]]);

    // One alert both rules give (the story's own post, under its name as an Ongoing Issue) is labelled with the surer
    // rule, and so is the same-post one of two alerts at the very same time
    eq(report([card('QA-1', T, 9, null, { issue_name: NAME }), burson('QA-2', T + HOUR, 9, taken)]).stories.map(brief),
      [['QA-1', 'Early Detection', 'same post', 'QA-2', 60]]);
    eq(report([card('QA-1', T, 9, null, { issue_name: NAME }), burson('QA-2', T + HOUR, 1, taken), burson('QA-3', T + HOUR, 9)]).stories.map(brief),
      [['QA-1', 'Early Detection', 'same post', 'QA-3', 60]]);

    // Once a review has tied one of Burson's alerts to the story under its name, Burson's other alerts under that name
    // are on the same story: its first one (here a New one on Sunday, two days before the one a review took for the
    // story's issue) is what the story is measured against. Never one under another exposure tag
    const SUN = SAT_11PM + 15 * HOUR;
    const story = card('QA-1', SAT_11PM, 1, { post_keys: [key(1)] }, { issue_name: NAME });
    const later = burson('QA-3', TUE_2PM, 3, { issue_name: NAME, issue_status: ONGOING });
    eq(report([story, burson('QA-2', SUN, 2, { issue_name: NAME, issue_status: 'NEW' }), later]).stories.map(brief),
      [['QA-1', 'Early Detection', 'same story', 'QA-2', 15 * 60]]);
    eq(report([story, burson('QA-2', SUN, 2, { issue_name: NAME, issue_status: 'Recently Reported', exposure_tag: '' }), later]).stories.map(brief),
      [['QA-1', 'Early Detection', 'same story', 'QA-2', 15 * 60]]);
    eq(report([story, burson('QA-2', SUN, 2, { issue_name: NAME, issue_status: 'NEW', exposure_tag: 'Another tag' }), later]).stories.map(brief),
      [['QA-1', 'Early Detection', 'same story', 'QA-3', 63 * 60]]);
  });

  test('head start: the post-level answer, beside the story-level one: this app\'s alert on a post that carries an ongoing issue\'s name (its own review gave it the name of an issue Burson alerted days before) is "behind by" days on the story, and its row still shows Burson\'s alert on that very post and by how much this app had the post first ("10 min"); the headline numbers count the posts this app alerted before Burson alerted the same post, with the median; blank, never a zero, when Burson alerted none of the story\'s posts', () => {
    const NAME = 'Criticism against AI Overviews';
    const T = NOW - 2 * DAY;
    const LONG = T - 13 * DAY - HOUR;  // Burson's first alert under the name: 13 days and an hour before this app's
    const rows = [
      burson('QA-1', LONG, 9, { issue_name: NAME }),
      own('QA-2', T, 1, DIRECT.SPRINKLR, { issue_name: NAME, issue_status: ONGOING }),  // the bot's review: an ongoing issue under that name
      burson('QA-3', T + 10 * MIN, 1, { issue_name: NAME, issue_status: ONGOING }),     // Burson on the same post, ten minutes later
      own('QA-4', T + HOUR, 4, WATCH),                                                  // a post Burson never alerted
    ];
    const r = report(rows);
    // the story-level answer is as it was: behind Burson's first alert on the story, by 13 days and an hour
    eq(r.stories.map(brief), [['QA-4', 'Watch', '', null, null], ['QA-2', 'Direct (Sprinklr)', 'same story', 'QA-1', -(13 * 24 * 60 + 60)]]);
    // the post-level answer: Burson's alert on the story's own post, ten minutes after this app's
    eq(r.stories.map(s => [s.post, s.post_lead_ms]),
      [[null, null], [{ key: key(1), at: T + 10 * MIN, alert_id: 'QA-3', url: link(1), name: NAME }, 10 * MIN]]);
    const post = w => [w.post_matched, w.post_first, w.post_first_pct, w.post_first_median_min];
    eq([post(r.windows.week), post(r.windows.month)], [[1, 1, 100, 10], [1, 1, 100, 10]]);
    // the story-level numbers and the reverse view stay as they were (the story was Burson's first)
    const w = r.windows.week;
    eq([w.stories, w.matched, w.first, w.behind, w.behind_median_min, w.unmatched, w.burson_alerts, w.burson_after], [2, 1, 0, 1, 13 * 24 * 60 + 60, 1, 1, 0]);
    eq(r.top, []);
    const cells = B.headStartTabRows_(r).rows;
    const lineOf = label => cells.find(c => c[0] === label).slice(1, 3);
    eq(['This app alerted first (of those Burson alerted too)', 'Burson alerted first', 'Median time this app was behind (where Burson was first)',
      'No Burson alert found', POST_LINE, REVERSE_LINE].map(lineOf),
    [['0 of 1 (0%)', '0 of 1 (0%)'], [1, 1], ['13 d 1 h', '13 d 1 h'], [1, 1],
      ['1 of 1 (100%): median head start 10 min', '1 of 1 (100%): median head start 10 min'], ['0 of 1 (0%)', '0 of 2 (0%)']]);
    eq(cells.findIndex(c => c[0] === POST_LINE) - cells.findIndex(c => c[0] === 'No Burson alert found'), 1);  // right under the story-level numbers
    // the story's row: the story-level cells, then the post-level ones
    const story = Object.fromEntries(HEADER.map((h, j) => [h, cells.filter(c => c[10] === 'QA-2').pop()[j]]));
    eq([story['Burson alerted (ET)'], story['Head start over Burson'], story['Matched on'], story['Burson alert'], story['Head start over Burson (min)']],
      [B.speedTime_(LONG), 'behind by 13 d 1 h', 'same story', `=HYPERLINK("${link(9)}","QA-1")`, -(13 * 24 * 60 + 60)]);
    eq(POST_COLS.map(h => story[h]), [B.speedTime_(T + 10 * MIN), '10 min', `=HYPERLINK("${link(1)}","QA-3")`, 10]);
    // a story none of whose posts Burson alerted: blank, never a zero
    const none = cells.filter(c => c[10] === 'QA-4').pop();
    eq(POST_COLS.map(h => none[HEADER.indexOf(h)]), ['', '', '', '']);
    const note = cells.map(c => String(c[0])).find(c => c.indexOf('Matched on:') === 0);
    assert.match(note, /Beside that story-level answer is the post-level one \("Burson on this post", "Head start on the post"\): Burson's first alert on one of the story's own posts\. So a story that carries the name of an issue Burson alerted days before reads "behind by" days on the story, and still shows by how much this app had the post itself before Burson\. A head start is from/);
    assert.match(note, /One of Burson's alerts counts as on a story this app had alerted first when it came after a story this app was first on, not when Burson already had that story \(this app may still have had that very post first: the post-level line counts those\)\./);
    assert.match(note, /\(the same exposure tag and issue names alike\)\. The same-story rules look 14 days either side of the story\. Beside that/);
    eq(B.ev('HEAD_START_STORY_DAYS_'), 14);

    // Matched on the same post, the two answers are one: the same alert, the same head start
    const same = report([own('QA-2', T, 1, WATCH), burson('QA-3', T + 45 * MIN, 1)]);
    eq(same.stories.map(s => [brief(s), s.post.alert_id, s.post_lead_ms / MIN]), [[['QA-2', 'Watch', 'same post', 'QA-3', 45], 'QA-3', 45]]);
    // Burson on the post BEFORE this app: behind on the post too, and not one this app alerted first
    const late = report([burson('QA-1', LONG, 9, { issue_name: NAME }), own('QA-2', T, 1, DIRECT.SPRINKLR, { issue_name: NAME, issue_status: ONGOING }),
      burson('QA-3', T - 20 * MIN, 1)]);
    eq([late.stories.map(s => [s.burson.alert_id, s.post.alert_id, s.post_lead_ms / MIN]), post(late.windows.week)],
      [[['QA-1', 'QA-3', -20]], [1, 0, 0, null]]);
    const lateCells = B.headStartTabRows_(late).rows;
    eq([lateCells.find(c => c[0] === POST_LINE).slice(1, 3), POST_COLS.map(h => lateCells.filter(c => c[10] === 'QA-2').pop()[HEADER.indexOf(h)])],
      [['0 of 1 (0%)', '0 of 1 (0%)'], [B.speedTime_(T - 20 * MIN), 'behind by 20 min', `=HYPERLINK("${link(1)}","QA-3")`, -20]]);
    // ... and at the very same millisecond: neither first nor behind, "the same minute"
    const tie = report([own('QA-2', T, 1, WATCH), burson('QA-3', T, 1)]);
    eq([post(tie.windows.week), B.headStartRow_(tie.stories[0])[HEADER.indexOf('Head start on the post')]], [[1, 0, 0, null], 'the same minute']);
    // A card that rests on several posts: Burson's EARLIEST alert on one of them counts, in both test spaces' rows
    // (a later alert of Burson's on another of its posts doesn't); Burson's alert on another post of the same story
    // (same issue name, an Ongoing Issue) is no alert on the story's own posts
    const several = report([
      card('QA-1', T, 1, { post_keys: [key(1), key(2), key(3)] }, { issue_name: NAME }),
      burson('QA-2', T + 3 * HOUR, 3), burson('QA-3', T + 2 * HOUR + 30 * 1000, 2), burson('QA-4', T + 2 * HOUR, 2, null, { space: AC }),
      burson('QA-5', T + HOUR, 8, { issue_name: NAME, issue_status: ONGOING, exposure_tag: 'Another tag' }),
    ]);
    eq(several.stories.map(s => [brief(s), s.post.alert_id, s.post.key, s.post_lead_ms / MIN]),
      [[['QA-1', 'Early Detection', 'same story', 'QA-5', 60], 'QA-4', key(2), 120]]);
    const other = report([card('QA-1', T, 1, { post_keys: [key(1)] }, { issue_name: NAME }),
      burson('QA-5', T + HOUR, 8, { issue_name: NAME, issue_status: ONGOING, exposure_tag: 'Another tag' })]);
    eq([other.stories.map(s => [brief(s), s.post, s.post_lead_ms]), post(other.windows.week)],
      [[[['QA-1', 'Early Detection', 'same story', 'QA-5', 60], null, null]], [0, 0, null, null]]);
    eq(B.headStartTabRows_(other).rows.find(c => c[0] === POST_LINE).slice(1, 3), ['—', '—']);
    // the 7-day and the 30-day numbers differ, by when this app alerted; the median is of the head starts on the post
    const windows = report([
      own('QA-1', NOW - 2 * DAY, 1, WATCH), burson('QA-2', NOW - 2 * DAY + 30 * MIN, 1),
      own('QA-3', NOW - 3 * DAY, 3, WATCH), burson('QA-4', NOW - 3 * DAY - 5 * MIN, 3),
      own('QA-5', NOW - 20 * DAY, 5, WATCH), burson('QA-6', NOW - 20 * DAY + 90 * MIN, 5),
      own('QA-7', NOW - 21 * DAY, 7, WATCH), burson('QA-8', NOW - 21 * DAY + 4 * HOUR, 7),
      own('QA-9', NOW - 22 * DAY, 9, WATCH),
    ]);
    eq([post(windows.windows.week), post(windows.windows.month)], [[2, 1, 50, 30], [4, 3, 75, 90]]);
    eq(B.headStartTabRows_(windows).rows.find(c => c[0] === POST_LINE).slice(1, 3),
      ['1 of 2 (50%): median head start 30 min', '3 of 4 (75%): median head start 1 h 30 min']);
  });

  test('head start: the head start on a post is from this app\'s own alert on THAT post, not from the story\'s first alert: a post that a later card or update of the story brought is measured from that card (a post Burson alerted before the update brought it reads "behind by", never days ahead), and its row says when this app alerted it; the headline line counts every one of the stories\' posts that Burson alerted too, each against this app\'s alert on it; when Burson alerted several of a story\'s posts, the row shows the one Burson alerted first', () => {
    const T = NOW - 6 * DAY;
    const post = w => [w.post_matched, w.post_first, w.post_first_pct, w.post_first_median_min];
    const cellsOf = (r, ids) => {
      const c = B.headStartTabRows_(r).rows.filter(x => x[10] === ids).pop();
      return POST_COLS.map(h => c[HEADER.indexOf(h)]);
    };
    const lineOf = r => B.headStartTabRows_(r).rows.find(c => c[0] === POST_LINE).slice(1, 3);
    const from = at => ` (from this app's alert on this post, ${B.speedTime_(at)} ET)`;
    // 1. A card on post 1; five days later Burson alerts post 2; ten minutes after that an update of the card brings post 2
    const one = report([
      card('QA-1', T, 1, { post_keys: [key(1)] }),
      burson('QA-2', T + 5 * DAY - 10 * MIN, 2),
      card('QA-3', T + 5 * DAY, 2, { post_keys: [key(2)], update_of: 'QA-1' }),
    ]);
    // the story-level answer is from the story's first card, as it was
    eq(one.stories.map(brief), [['QA-1', 'Early Detection', 'same post', 'QA-2', 5 * 24 * 60 - 10]]);
    // the post-level one is from the update that brought the post: ten minutes AFTER Burson, not five days before
    eq(one.stories.map(s => [s.keys, s.keys_at, s.post.alert_id, s.post.key, s.post_own_at, s.post_lead_ms / MIN, s.post_leads_ms]),
      [[[key(1), key(2)], [T, T + 5 * DAY], 'QA-2', key(2), T + 5 * DAY, -10, [-10 * MIN]]]);
    eq([post(one.windows.week), lineOf(one)], [[1, 0, 0, null], ['0 of 1 (0%)', '0 of 1 (0%)']]);
    eq(cellsOf(one, 'QA-1, QA-3'), [B.speedTime_(T + 5 * DAY - 10 * MIN), `behind by 10 min${from(T + 5 * DAY)}`,
      `=HYPERLINK("${link(2)}","QA-2")`, -10]);
    // 2. A Watch alert on post 1; two days later Burson alerts post 2; a day after that an Early Detection card on posts 1
    // and 2 (the same story: it shares post 1): this app had post 2 a day AFTER Burson
    const two = report([
      own('QA-1', T, 1, WATCH),
      burson('QA-2', T + 2 * DAY, 2),
      card('QA-3', T + 3 * DAY, 1, { post_keys: [key(1), key(2)] }),
    ]);
    eq(two.stories.map(s => [s.alert_ids, s.post.alert_id, s.post_own_at, s.post_lead_ms / HOUR]), [[['QA-1', 'QA-3'], 'QA-2', T + 3 * DAY, -24]]);
    eq([post(two.windows.week), cellsOf(two, 'QA-1, QA-3')[1]], [[1, 0, 0, null], `behind by 1 d${from(T + 3 * DAY)}`]);
    // 3. Burson alerts post 2; a day later this app's card on post 1; two days on, its update brings post 2; a day after
    // that Burson alerts post 1. Post 2: this app three days after Burson. Post 1: this app three days before Burson. Both
    // count, each against its own alert; the row shows the post Burson alerted first
    const three = report([
      burson('QA-1', T - DAY, 2),
      card('QA-2', T, 1, { post_keys: [key(1)] }),
      card('QA-3', T + 2 * DAY, 2, { post_keys: [key(2)], update_of: 'QA-2' }),
      burson('QA-4', T + 3 * DAY, 1),
    ]);
    eq(three.stories.map(s => [brief(s), s.post.alert_id, s.post_lead_ms / DAY, s.post_leads_ms.map(v => v / DAY)]),
      [[['QA-2', 'Early Detection', 'same post', 'QA-1', -24 * 60], 'QA-1', -3, [-3, 3]]]);
    eq([post(three.windows.week), lineOf(three)], [[2, 1, 50, 3 * 24 * 60],
      ['1 of 2 (50%): median head start 3 d', '1 of 2 (50%): median head start 3 d']]);
    eq(cellsOf(three, 'QA-2, QA-3'), [B.speedTime_(T - DAY), `behind by 3 d${from(T + 2 * DAY)}`, `=HYPERLINK("${link(2)}","QA-1")`, -3 * 24 * 60]);
    // A card that rests on several posts from the start: each post Burson alerted too counts, from the card; the row
    // shows the one Burson alerted first, and says nothing more (the post came with the story's first alert)
    const several = report([
      card('QA-1', T, 1, { post_keys: [key(1), key(2), key(3)] }),
      burson('QA-2', T + 3 * HOUR, 3), burson('QA-3', T + 2 * HOUR, 2),
    ]);
    eq([several.stories.map(s => [s.post.alert_id, s.post_own_at, s.post_lead_ms / MIN, s.post_leads_ms.map(v => v / MIN)]),
      post(several.windows.week), lineOf(several)[0], cellsOf(several, 'QA-1')[1]],
    [[['QA-3', T, 120, [120, 180]]], [2, 2, 100, 150], '2 of 2 (100%): median head start 2 h 30 min', '2 h']);
    // a story none of whose posts Burson alerted: no post-level answer, and nothing to count
    const none = report([card('QA-1', T, 1, { post_keys: [key(1), key(2)] })]);
    eq(none.stories.map(s => [s.post, s.post_own_at, s.post_lead_ms, s.post_leads_ms]), [[null, null, null, []]]);
    // the headline line and the line under the title say what is counted and which post a row shows
    eq(POST_LINE, B.ev('HEAD_START_POST_LINE_'));
    assert.match(POST_LINE, /^Posts this app alerted before Burson alerted the same post \(of /);
    const scope = B.headStartTabRows_(three).rows.map(c => String(c[0])).find(c => c.indexOf('What\'s counted:') === 0);
    assert.match(scope, /The head start on a post is from this app's own alert on that post: for a post that a later card or update of the story brought, from that card \(the cell then says when\), not from the story's first alert\. When Burson alerted several of a story's posts, the row shows the one Burson alerted first; the headline line on posts counts each of them\. Times are when each alert was posted\./);
  });

  test('head start: the same-story rule, weaker: the same issue name and no more is labelled "same story (same issue name)": the owner\'s example as it usually goes (a card that was only to be watched, with no exposure tag, and Burson\'s alert days later on another post under that name); never under two different exposure tags, only when no sure rule gives an alert; a story without a match is counted as "No Burson alert found", and the tab says why that isn\'t "not alerted"', () => {
    const NAME = 'Banking malware in Play Store apps';
    const SAME_NAME = 'same story (same issue name)';
    const SIMILAR = 'same story (similar wording)';
    const OTHER_TAG = 'Product - Security or privacy vulnerabilities';
    // The card as its review leaves it when it isn't sure the story is an SLRR matter: to be watched (no Social Alert,
    // so Burson's later alert never takes its name) and without an exposure tag (so the word check can't match it)
    const watched = (when, fields) => card('QA-1', when, 1, { post_keys: [key(1)], disposition: 'monitor', story_title: 'Malware apps on the Play Store' },
      Object.assign({ issue_name: NAME, exposure_tag: '', product: 'Play Store' }, fields || {}));
    const theirs = (when, fields, id, n) => burson(id || 'QA-2', when, n || 2, Object.assign({ issue_name: NAME, issue_status: 'NEW' }, fields || {}));
    const match = rows => brief(report(rows).stories.find(s => s.alert_id === 'QA-1'));
    eq([B.headStartRowFacts_(watched(SAT_11PM)).view.tag, B.headStartRowFacts_(watched(SAT_11PM)).tag_key, B.headStartRowFacts_(theirs(TUE_2PM)).tag_key],
      ['', '', TAG.toLowerCase()]);

    // The owner's example: the card on Saturday at 11 PM, Burson's alert on Tuesday at 2 PM on another post
    const r = report([watched(SAT_11PM), theirs(TUE_2PM)]);
    eq(r.stories.map(brief), [['QA-1', 'Early Detection', SAME_NAME, 'QA-2', 63 * 60]]);
    const w = r.windows.week;
    eq([w.stories, w.matched, w.first, w.first_median_min, w.unmatched, w.burson_alerts, w.burson_after, w.burson_after_by],
      [1, 1, 1, 3780, 0, 1, 1, { post: 0, story: 0, name: 1, wording: 0 }]);
    eq(r.top.map(s => s.alert_id), ['QA-1']);
    const cells = B.headStartTabRows_(r).rows;
    eq(cells.filter(c => c[10] === 'QA-1').map(c => [c[1], c[5], c[6], c[9], c[12]]),
      [['2026-10-10 23:00', '2026-10-13 14:00', '2 d 15 h', SAME_NAME, 3780], ['2026-10-10 23:00', '2026-10-13 14:00', '2 d 15 h', SAME_NAME, 3780]]);
    eq(cells.find(c => c[0] === REVERSE_LINE).slice(1, 3),
      ['1 of 1 (100%): 1 same issue name', '1 of 1 (100%): 1 same issue name']);

    // however the name is written (case, spacing, quotes, a status suffix); with the tag on one side only, either side;
    // with the same tag on both sides (the same name is the surer of the two weaker labels)
    eq(match([watched(SAT_11PM), theirs(TUE_2PM, { issue_name: 'banking  malware in "Play Store" apps / NEW' })])[2], SAME_NAME);
    eq(match([watched(SAT_11PM, { exposure_tag: TAG }), theirs(TUE_2PM, { exposure_tag: '' })])[2], SAME_NAME);
    eq(match([watched(SAT_11PM, { exposure_tag: TAG }), theirs(TUE_2PM)])[2], SAME_NAME);
    // never under two different exposure tags (a name can cover more than one issue), and never another name
    eq(match([watched(SAT_11PM, { exposure_tag: TAG }), theirs(TUE_2PM, { exposure_tag: OTHER_TAG })]), ['QA-1', 'Early Detection', '', null, null]);
    eq(match([watched(SAT_11PM), theirs(TUE_2PM, { issue_name: 'Play Store refund delays' })])[2], '');
    eq(match([watched(SAT_11PM, { issue_name: '' }), theirs(TUE_2PM, { issue_name: '' })])[2], '');  // no name is not the same name
    // Burson first under that name and this app later, neither an Ongoing Issue: the same, this app behind
    eq(match([watched(TUE_2PM), theirs(SAT_11PM)]), ['QA-1', 'Early Detection', SAME_NAME, 'QA-2', -63 * 60]);
    // 14 days either side of the story, no further
    const far = d => match([watched(NOW - 20 * DAY), theirs(NOW - 20 * DAY + d)])[2];
    eq([far(14 * DAY), far(14 * DAY + MIN), far(-14 * DAY), far(-14 * DAY - MIN)], [SAME_NAME, '', SAME_NAME, '']);

    // Weaker than the sure rules: it is tried only when neither gives an alert, however early the alert under the name
    eq(match([watched(SAT_11PM), theirs(SAT_11PM + HOUR), burson('QA-3', TUE_2PM, 1)]), ['QA-1', 'Early Detection', 'same post', 'QA-3', 63 * 60]);
    // Of the two weaker rules together, Burson's earliest alert counts, labelled with the rule that gave it
    const ALIKE = 'Malware found in Play Store banking apps';
    const tagged = watched(SAT_11PM, { exposure_tag: TAG });
    eq(match([tagged, theirs(TUE_2PM), theirs(SAT_11PM + DAY, { issue_name: ALIKE }, 'QA-3', 3)]), ['QA-1', 'Early Detection', SIMILAR, 'QA-3', 24 * 60]);
    eq(match([tagged, theirs(SAT_11PM + DAY), theirs(TUE_2PM, { issue_name: ALIKE }, 'QA-3', 3)]), ['QA-1', 'Early Detection', SAME_NAME, 'QA-2', 24 * 60]);

    // A story no rule finds a Burson alert for is counted as "No Burson alert found" (Burson may have alerted it under
    // a name nothing ties to the story), and the tab says why that is not "not alerted by Burson"
    const none = B.headStartTabRows_(report([watched(SAT_11PM), theirs(TUE_2PM, { issue_name: 'Play Store refund delays' })])).rows;
    eq([none.find(c => c[0] === 'No Burson alert found').slice(1, 3), none.some(c => /not alerted by Burson/i.test(String(c[0])) && c[1] !== '')], [[1, 1], false]);
    const note = none.map(c => String(c[0])).find(c => c.indexOf('Matched on:') === 0);
    assert.match(note, /"No Burson alert found" doesn't mean Burson never alerted the story: Burson's later alert takes a story's issue name only when this app's alert went out as a Social Alert\. An alert that was only to be watched is found again only on its own posts, on an identical issue name, or on similar wording under the same exposure tag, so "this app alerted first" is, if anything, undercounted\./);
    assert.match(note, /Only when they give none, two weaker matches are tried \(check them\): "same story \(same issue name\)" \(the same issue name and no more, never under two different exposure tags\) and "same story \(similar wording\)"/);
    assert.ok(note.length <= 49000);
  });

  test('head start: the same-story rule, weaker: the Alert memory\'s word check (the same exposure tag, issue words alike, no clashing identifiers) is labelled "same story (similar wording)"; it is tried only when neither sure rule (same post, same story) gives an alert, and the earliest of Burson\'s alerts counts; nothing is asked of the Alert memory and nothing is embedded', () => {
    const T = NOW - 5 * DAY;
    const story = (name, fields) => card('QA-1', T, 1, { post_keys: [key(1)] }, Object.assign({ issue_name: name }, fields || {}));
    const match = rows => brief(report(rows).stories.find(s => s.alert_id === 'QA-1'));
    const OWN = 'Banking malware in Play Store apps';
    const ALIKE = 'Malware found in Play Store banking apps';
    const SIMILAR = 'same story (similar wording)';
    const theirs = (at, name, fields) => burson('QA-2', at, 2, Object.assign({ issue_name: name }, fields || {}));
    eq(B.jaccard_(B.issueTokens_(OWN), B.issueTokens_(ALIKE)) >= B.ev('GEN').novelty_min_jaccard, true);
    eq(match([story(OWN), theirs(T + 3 * DAY, ALIKE)]), ['QA-1', 'Early Detection', SIMILAR, 'QA-2', 3 * 24 * 60]);
    eq(match([story(OWN), theirs(T - 2 * HOUR, ALIKE)]), ['QA-1', 'Early Detection', SIMILAR, 'QA-2', -120]);
    // not alike enough; another exposure tag; identifiers that clash (two different CVEs); more than 14 days away
    eq(match([story(OWN), theirs(T + DAY, 'Play Store malware steals banking logins')])[2], '');
    eq(match([story(OWN), theirs(T + DAY, ALIKE, { exposure_tag: 'Product - Security or privacy vulnerabilities' })])[2], '');
    eq(match([story('CVE-2026-11111 exploited in Chrome'), theirs(T + DAY, 'CVE-2026-22222 exploited in Chrome')])[2], '');
    eq(match([story('CVE-2026-11111 exploited in Chrome'), theirs(T + DAY, 'CVE-2026-11111 exploited in Chrome browsers')])[2], SIMILAR);
    eq(match([story(OWN), theirs(T + 15 * DAY, ALIKE)])[2], '');
    // the product is part of the story's view, but the memory's check doesn't compare products: another product still matches
    eq(match([story(OWN), theirs(T + DAY, ALIKE, { product: 'Play Store' })])[2], SIMILAR);
    // it is the memory's own check, on the same view of a story
    const view = name => B.headStartRowFacts_(burson('QA-9', T, 9, { issue_name: name })).view;
    eq([B.amSameStoryWords_(view(OWN), view(ALIKE)) > 0, B.amSameStoryWords_(view(OWN), view('Play Store malware steals banking logins'))], [true, 0]);
    eq(view(OWN), { tag: TAG, prod: 'Search', tok: B.issueTokens_(OWN), idt: { c: [], n: [], a: [] } });
    // ... built from the issue name, the exposure tag and the product: nothing else on the row is read for it
    eq(B.headStartRowFacts_(burson('QA-9', T, 9, { issue_name: OWN, summary: 'CVE-2026-33333 and @someone, 123456 times' })).view, view(OWN));
    eq(B.headStartRowFacts_(burson('QA-9', T, 9, { issue_name: 'the issue of a claim' })).view, null);  // no words to compare: never matched on wording

    // The sure rules first: an alert alike in wording is never taken while the same post or the same story gives one,
    // however much earlier it is. Of the alerts the two sure rules give, Burson's first counts (here a same-story one,
    // two days before Burson alerted the story's own post); of the alerts alike in wording, the earliest
    const rows = [
      story(OWN, { post_url: link(1) }),
      burson('QA-2', T + 4 * DAY, 1),                                                   // the same post, four days on
      burson('QA-3', T + 2 * DAY, 3, { issue_name: OWN, issue_status: ONGOING }),       // the same story, two days on
      burson('QA-4', T + 3 * DAY, 4, { issue_name: OWN, issue_status: ONGOING }),
      burson('QA-5', T + DAY, 5, { issue_name: ALIKE }),                                // alike in wording, a day on
      burson('QA-6', T + 6 * HOUR, 6, { issue_name: ALIKE }),
    ];
    eq(match(rows), ['QA-1', 'Early Detection', 'same story', 'QA-3', 2 * 24 * 60]);
    eq(match(rows.filter(x => !['QA-3', 'QA-4'].includes(x.alert_id))), ['QA-1', 'Early Detection', 'same post', 'QA-2', 4 * 24 * 60]);
    eq(match(rows.filter(x => x.alert_id !== 'QA-2')), ['QA-1', 'Early Detection', 'same story', 'QA-3', 2 * 24 * 60]);
    eq(match(rows.filter(x => !['QA-2', 'QA-3', 'QA-4'].includes(x.alert_id))), ['QA-1', 'Early Detection', SIMILAR, 'QA-6', 6 * 60]);
    // the reverse view: every one of Burson's alerts this app's story came before, by the surest rule that holds
    const w = report(rows).windows.week;
    eq([w.burson_alerts, w.burson_after, w.burson_after_pct, w.burson_after_by], [5, 5, 100, { post: 1, story: 2, name: 0, wording: 2 }]);

    // The Alert memory is never asked, no text is embedded, nothing is fetched or written
    const world1 = world();
    const calls = [];
    world1.bot.alertMemory_ = () => { calls.push('memory'); throw new Error('the report must not ask the Alert memory'); };
    world1.bot.embedTexts_ = () => { calls.push('embed'); throw new Error('the report must not embed text'); };
    const ss = sheetOf(world1);
    const before = [world1.g.fetches.length, world1.vertex.calls.length];
    const out = world1.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows });
    eq([out.written, calls, world1.g.fetches.length, world1.vertex.calls.length, ss.getSheets().map(s => s.getName())],
      [true, [], before[0], before[1], ['Sheet1', TAB]]);
  });

  test('head start: the word check is only run on Burson\'s alerts that share a word of the name under the same tag, and that shortcut never changes a match: the same stories and the same reverse view as the memory\'s check on every pair', () => {
    const words = ['malware', 'outage', 'bias', 'privacy', 'leak', 'refund', 'crash', 'scam', 'lawsuit', 'gemini', 'pixel', 'chrome', 'play',
      'store', 'maps', 'login'];
    let seed = 11;
    const rnd = n => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 8) % n; };
    const named = () => ({ issue_name: Array.from({ length: 3 + rnd(3) }, () => words[rnd(words.length)]).join(' '),
      exposure_tag: [TAG, 'Product - Security or privacy vulnerabilities'][rnd(2)] });
    const rows = [];
    for (let i = 0; i < 80; i++) rows.push(own(`QA-o${i}`, NOW - rnd(40 * 24) * HOUR - i * 1000, 1000 + i, WATCH, named()));
    for (let i = 0; i < 500; i++) rows.push(burson(`QA-b${i}`, NOW - rnd(44 * 24) * HOUR - i * 977, 5000 + i, named()));
    // every pair, by the memory's own check (no post is shared and no alert is an Ongoing Issue: only the weaker rules
    // can match; a pair with the very same name passes the word check too, and is labelled as the same issue name)
    const view = x => B.headStartRowFacts_(x).view;
    const side = x => ({ id: x.alert_id, at: x.source_at, view: view(x), name: B.issueNameKey_(x.forwarded_fields.issue_name) });
    const ours = rows.filter(x => x.ingested).map(side);
    const theirs = rows.filter(x => !x.ingested).map(side);
    const alike = (o, b) => Math.abs(b.at - o.at) <= 14 * DAY && B.amSameStoryWords_(o.view, b.view) > 0;
    const rule = (o, b) => (o.name === b.name ? 'same story (same issue name)' : 'same story (similar wording)');
    const first = o => theirs.filter(b => alike(o, b)).sort((x, y) => x.at - y.at)[0] || null;  // Burson's first alert on it
    const expected = ours.filter(o => o.at >= NOW - 30 * DAY).sort((x, y) => y.at - x.at).map(o => {
      const hit = first(o);
      return [o.id, hit ? hit.id : null, hit ? rule(o, hit) : ''];
    });
    // the reverse view: Burson's alerts that came after a story of this app's that was itself first, each by the surest
    // rule that ties it to such a story
    const led = ours.filter(o => first(o) && first(o).at > o.at);
    const after = theirs.filter(b => b.at >= NOW - 30 * DAY).map(b => led.filter(o => o.at < b.at && alike(o, b)).map(o => rule(o, b)))
      .filter(by => by.length);
    const byName = after.filter(by => by.includes('same story (same issue name)')).length;
    const r = B.headStartReport_(rows, null, NOW);
    eq(r.stories.map(s => [s.alert_id, s.burson ? s.burson.alert_id : null, s.matched]), expected);
    eq([r.windows.month.burson_after, r.windows.month.burson_after_by], [after.length, { post: 0, story: 0, name: byName, wording: after.length - byName }]);
    assert.ok(expected.filter(x => x[1]).length >= 10 && expected.filter(x => !x[1]).length >= 10 && after.length >= 10,
      JSON.stringify([expected.length, after.length]));
    // without the rule that only a story that was first counts, more of Burson's alerts would be called this app's
    assert.ok(theirs.filter(b => b.at >= NOW - 30 * DAY && ours.some(o => o.at < b.at && alike(o, b))).length > after.length);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // The IMs' email
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: IM times present and absent: the IMs\' time for the matched Burson post (their email, else their draft, by the post\'s key on the Results tab) gives the end-to-end head start; absent, the IM columns are blank and the tab says why', () => {
    const T = NOW - 2 * DAY;
    const rows = [
      own('QA-1', T, 1, DIRECT.SPRINKLR), burson('QA-2', T + 2 * HOUR, 1),            // the IMs emailed 3 h 10 min after this app's alert
      own('QA-3', T + HOUR, 3, WATCH), burson('QA-4', T + 3 * HOUR, 3),               // only their draft is known
      own('QA-5', T + 2 * HOUR, 5, WATCH), burson('QA-6', T + HOUR, 5),               // the IMs emailed before this app alerted
      own('QA-7', T + 3 * HOUR, 7, WATCH), burson('QA-8', T + 4 * HOUR, 7),           // no IM time for this post
      own('QA-9', T + 4 * HOUR, 9, WATCH),                                            // no Burson alert: no post to look the IMs up by
    ];
    const im = { [postKey(1)]: { at: T + 190 * MIN, from: 'email' }, [postKey(3)]: { at: T + 4 * HOUR, from: 'draft' },
      [postKey(5)]: { at: T + 90 * MIN, from: 'email' }, [postKey(9)]: { at: T + 5 * HOUR, from: 'email' } };
    const r = report(rows, im);
    eq(r.stories.map(s => [s.alert_id, s.im, s.im_lead_ms === null ? null : s.im_lead_ms / MIN]), [
      ['QA-9', null, null], ['QA-7', null, null], ['QA-5', { at: T + 90 * MIN, from: 'email' }, -30],
      ['QA-3', { at: T + 4 * HOUR, from: 'draft' }, 180], ['QA-1', { at: T + 190 * MIN, from: 'email' }, 190]]);
    const w = r.windows.week;
    eq([r.im_at_hand, w.im_known, w.im_first, w.im_first_pct, w.im_median_min, w.im_from_email], [true, 3, 2, 67, 180, 2]);
    const cells = x => B.headStartTabRows_(x).rows.filter(c => /^QA-\d$/.test(String(c[10]))).slice(-5).map(c => [c[10], c[7], c[8], c[13]]);
    eq(cells(r), [['QA-9', '', '', ''], ['QA-7', '', '', ''], ['QA-5', B.speedTime_(T + 90 * MIN), 'behind by 30 min', -30],
      ['QA-3', B.speedTime_(T + 4 * HOUR), '3 h', 180], ['QA-1', B.speedTime_(T + 190 * MIN), '3 h 10 min', 190]]);
    const note = x => B.headStartTabRows_(x).rows.map(c => c[0]).find(c => String(c).indexOf('Matched on:') === 0);
    assert.match(note(r), /The IMs' time is their email for Burson's post, else their draft, as the Results tab has it \(their email for 2 of 3 in the last 30 days\)/);

    // The time is looked up by BURSON's post, never by the story's own lead post: a card led by post 11 that also rests
    // on post 12, Burson alerting post 12, and the IMs having emailed about both posts (about post 11 for another reason)
    const led = [card('QA-21', T, 11, { post_keys: [key(11), key(12)] }), burson('QA-22', T + 2 * HOUR, 12)];
    const both = { [postKey(11)]: { at: T + 30 * MIN, from: 'email' }, [postKey(12)]: { at: T + 150 * MIN, from: 'draft' } };
    eq(report(led, both).stories.map(s => [s.alert_id, s.matched, s.burson.key, s.im, s.im_lead_ms / MIN]),
      [['QA-21', 'same post', key(12), { at: T + 150 * MIN, from: 'draft' }, 150]]);
    // ... and there is none when the IMs emailed only about the story's lead post, which Burson never alerted
    eq(report(led, { [postKey(11)]: both[postKey(11)] }).stories.map(s => [s.burson.key, s.im, s.im_lead_ms]), [[key(12), null, null]]);

    // A story that Burson alerted on ANOTHER post (any of the same-story rules) has the IMs' time for that post of
    // Burson's too, and its end-to-end head start: this app's alert to the IMs' email about Burson's alert
    const NAME = 'Banking malware in Play Store apps';
    [
      ['same story', { issue_name: NAME, issue_status: ONGOING }],
      ['same story (same issue name)', { issue_name: NAME, issue_status: 'NEW' }],
      ['same story (similar wording)', { issue_name: 'Malware found in Play Store banking apps' }],
    ].forEach(([rule, fields]) => {
      const elsewhere = [own('QA-31', T, 31, WATCH, { issue_name: NAME }), burson('QA-32', T + 5 * HOUR, 32, fields)];
      const times = { [postKey(31)]: { at: T + HOUR, from: 'email' }, [postKey(32)]: { at: T + 6 * HOUR, from: 'email' } };
      const x = report(elsewhere, times);
      eq(x.stories.map(s => [s.matched, s.burson.key, s.im, s.im_lead_ms / MIN]), [[rule, key(32), { at: T + 6 * HOUR, from: 'email' }, 360]], rule);
      eq([x.windows.week.im_known, x.windows.week.im_first, x.windows.week.im_median_min, x.windows.week.im_from_email], [1, 1, 360, 1], rule);
      eq(B.headStartTabRows_(x).rows.filter(c => c[10] === 'QA-31').map(c => [c[5], c[6], c[7], c[8], c[9], c[13]]),
        new Array(2).fill([B.speedTime_(T + 5 * HOUR), '5 h', B.speedTime_(T + 6 * HOUR), '6 h', rule, 360]), rule);
    });

    // Absent: every IM cell blank (never a zero), the numbers say none, the note says why
    const none = report(rows);
    eq([none.im_at_hand, none.stories.map(s => [s.im, s.im_lead_ms]), cells(none).map(c => c.slice(1))],
      [false, rows.filter(x => x.ingested).map(() => [null, null]), rows.filter(x => x.ingested).map(() => ['', '', ''])]);
    eq([none.windows.week.im_known, none.windows.week.im_first, none.windows.week.im_first_pct, none.windows.week.im_median_min], [0, 0, null, null]);
    assert.match(note(none), /The IMs' times weren't at hand for this rebuild \(they come with the Results tab's rebuild in the every-minute run\), so those columns are blank\.$/);
    const lines = B.headStartTabRows_(none).rows;
    eq(['This app\'s alert before the IMs\' email (of the stories with an IM email time)',
      'Median time from this app\'s alert to the IMs\' email (the end-to-end head start)'].map(label => lines.find(c => c[0] === label).slice(1, 3)),
    [['—', '—'], ['—', '—']]);
  });

  test('head start: the IMs\' times come from the Results rebuild of the same run and from nowhere else: their email or draft for Burson\'s post as that rebuild has it, never the bot\'s own draft; a run where the Results tab wasn\'t rebuilt takes nothing from an earlier run\'s rebuild and keeps the times the tab remembers (no Gmail search, no BigQuery read)', () => {
    const w = world();
    const ss = sheetOf(w);
    const T = NOW - 2 * DAY;
    const rows = [
      own('QA-1', T, 1, DIRECT.SPRINKLR), burson('QA-2', T + 2 * HOUR, 1),
      own('QA-3', T + HOUR, 3, WATCH), burson('QA-4', T + 3 * HOUR, 3),
    ];
    const flows = { main: { partition: MAIN, label: 'Mirror space', live: false }, ac: null };
    // the IMs drafted a Social Alert for the first post half an hour after Burson's alert; the second post's draft is the bot's own
    const drafts = () => [
      { post_url: link(1), at: T + 150 * MIN, subject: '⭐ SOCIAL ALERT ⭐: Search | Issue 1 | X | 900 Engagements', drafted_by: 'im1@ops.test' },
      { post_url: link(3), at: T + 200 * MIN, subject: '⭐ SOCIAL ALERT ⭐: Search | Issue 3 | X | 900 Engagements', drafted_by: B.ev('RESULTS_BOT_MARK_') },
    ];
    eq(w.bot.ev('RESULTS_RUN_'), null);
    const run = extra => w.bot.maybeRefreshHeadStart_(ss, w.ctx(), Object.assign({ deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now }, extra || {}));
    const stories = () => table(tabOf(ss), 'EVERY STORY').map(x => [x['App alert'], x['Burson alerted (ET)'], x['IMs emailed (ET)'],
      x['Head start over the IMs'], x['Head start over the IMs (min)']]);
    const store = w.bot.sheetBackend_(ss);  // the Alert log, as poll() leaves it
    rows.forEach(x => store.appendAlert(x));

    // The first rebuild, in a run without a Results rebuild: no IM times
    eq([run(), stories()], [true, [['QA-3', B.speedTime_(T + 3 * HOUR), '', '', ''], ['QA-1', B.speedTime_(T + 2 * HOUR), '', '', '']]]);
    // Ten minutes on, the Results tab is rebuilt in the same run: its posts carry the IMs' time
    w.g.clock.now += 10 * MIN;
    w.bot.refreshSpeed_(ss, w.ctx(), { alerts: rows, drafts, logged: () => [], flows });
    eq(w.bot.ev('RESULTS_RUN_.posts.map(p => [p.key, speedImAt_(p)])'), [[postKey(3), null], [postKey(1), T + 150 * MIN]]);
    eq(B.headStartImTimes_(w.bot.ev('RESULTS_RUN_.posts')), { [postKey(1)]: { at: T + 150 * MIN, from: 'draft' } });
    const fetches = w.g.fetches.length;  // every request the bot makes (Chat, Gmail, BigQuery, Gemini) goes through here
    eq([run(), stories(), w.g.fetches.length], [true, [['QA-3', B.speedTime_(T + 3 * HOUR), '', '', ''],
      ['QA-1', B.speedTime_(T + 2 * HOUR), B.speedTime_(T + 150 * MIN), '2 h 30 min', 150]], fetches]);
    // their email, once the Results tab knows it, replaces their draft; a post without a key or a time gives nothing
    eq(B.headStartImTimes_([{ key: postKey(1), im_email_at: T + 170 * MIN, im_draft: { at: T + 150 * MIN } }, { key: '', im_email_at: T },
      { key: postKey(3), im_draft: null, im_email_at: null }, null]), { [postKey(1)]: { at: T + 170 * MIN, from: 'email' } });
    // A later run without a Results rebuild: that earlier rebuild's posts are not this run's. Nothing is taken from them
    // (here they have been given other times since), and the tab keeps the time it remembers, saying so
    w.g.clock.now += 20 * MIN;
    w.bot.ev('RESULTS_RUN_.posts.forEach(p => { p.im_email_at = 12345; })');
    eq([w.bot.headStartResultsRun_(w.g.clock.now, w.g.clock.now), run(), stories(), w.g.fetches.length], [null, true,
      [['QA-3', B.speedTime_(T + 3 * HOUR), '', '', ''], ['QA-1', B.speedTime_(T + 2 * HOUR), B.speedTime_(T + 150 * MIN), '2 h 30 min', 150]], fetches]);
    assert.match(tabOf(ss).rows.map(x => String(x[0])).find(x => x.indexOf('Matched on:') === 0),
      /The IMs' times are the ones this tab last had: the Results tab wasn't rebuilt in the run of this rebuild, and newer ones come with its rebuild in the every-minute run\. Each is their email for Burson's post, else their draft \(their email for 0 of 1 in the last 30 days\)\./);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // The IMs' times the tab remembers (its hidden state columns)
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: the tab remembers each story\'s IM time in hidden columns, so the 30-day numbers cover 30 days: a time is kept when the Results rebuild no longer shows the Burson post (it covers 7 days); for a post it does show, the run\'s answer wins (a new time, and "no time"); a rebuild with no Results rebuild in its run (refreshHeadStart(), or the 10 more minutes) keeps them', () => {
    const w = world();
    const ss = sheetOf(w);
    const store = w.bot.sheetBackend_(ss);
    const T = NOW - 6 * DAY;
    const rows = [
      own('QA-1', T, 1, DIRECT.SPRINKLR), burson('QA-2', T + 2 * HOUR, 1),            // Burson's alert is 6 days old less 2 hours
      own('QA-3', T + 5 * DAY, 3, WATCH), burson('QA-4', T + 5 * DAY + HOUR, 3),      // Burson's alert is a day old
    ];
    rows.forEach(x => store.appendAlert(x));
    const flows = { main: { partition: MAIN, label: 'Mirror space', live: false }, ac: null };
    const draft = (n, when) => ({ post_url: link(n), at: when, subject: `⭐ SOCIAL ALERT ⭐: Search | Issue ${n} | X | 900 Engagements`, drafted_by: 'im1@ops.test' });
    let imDrafts = [draft(1, T + 150 * MIN), draft(3, T + 5 * DAY + 90 * MIN)];
    // one Results rebuild: the Burson posts it shows
    const results = () => {
      w.bot.refreshSpeed_(ss, w.ctx(), { alerts: rows, drafts: () => imDrafts, logged: () => [], flows });
      return w.bot.ev('RESULTS_RUN_.posts.map(p => p.key)');
    };
    const run = () => w.bot.maybeRefreshHeadStart_(ss, w.ctx(), { deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now });
    const tab = () => tabOf(ss);
    const stories = () => table(tab(), 'EVERY STORY').map(x => [x['App alert'], x['IMs emailed (ET)'], x['Head start over the IMs']].concat(STATE.map(h => x[h])));
    const numbers = () => ['This app\'s alert before the IMs\' email (of the stories with an IM email time)',
      'Median time from this app\'s alert to the IMs\' email (the end-to-end head start)'].map(label => line(tab(), label));
    const note = () => tab().rows.map(x => String(x[0])).find(x => x.indexOf('Matched on:') === 0);
    eq([B.ev('GEN').settings.speed_days, w.g.clock.now], [7, NOW]);
    const QA1 = ['QA-1', B.speedTime_(T + 150 * MIN), '2 h 30 min', postKey(1), T + 150 * MIN, 'draft'];
    const QA3 = min => ['QA-3', B.speedTime_(T + 5 * DAY + min * MIN), `1 h ${min - 60} min`, postKey(3), T + 5 * DAY + min * MIN, 'draft'];

    // Both of Burson's alerts are on the Results tab: both IM times come from this run's Results rebuild, and the tab
    // keeps each in its hidden columns (the Burson post's key, the time in ms, email or draft)
    eq([results(), run(), stories()], [[postKey(3), postKey(1)], true, [QA3(90), QA1]]);
    eq([Array.from(new Set(tab().hidden)), numbers()], [[19, 20, 21], [['2 of 2 (100%)', '2 of 2 (100%)'], ['2 h', '2 h']]]);
    eq(B.headStartImCovered_(w.bot.ev('RESULTS_RUN_.posts')), [postKey(3), postKey(1)]);

    // Two days on, Burson's first alert is older than the Results tab's 7 days: its rebuild no longer shows the post.
    // The tab still has the IMs' time for it, and the 30-day numbers still count it (the story itself is 8 days old)
    w.g.clock.now += 2 * DAY;
    eq([results(), run(), stories()], [[postKey(3)], true, [QA3(90), QA1]]);
    eq(numbers(), [['1 of 1 (100%)', '2 of 2 (100%)'], ['1 h 30 min', '2 h']]);
    assert.match(note(), /The IMs' time is their email for Burson's post, else their draft, as the Results tab has it \(their email for 0 of 2 in the last 30 days\)\. For a Burson alert older than the Results tab's 7 days, the IMs' time is the one this tab last had for it: there is none for an alert that was already older than that when this tab was first made, or when its story first came onto it\.$/);

    // The run's answer wins for a post its Results rebuild shows. A new time: the IMs' first draft for the second post
    // turns out to be an earlier one (and a draft for the first post is not looked at: the rebuild doesn't show it)
    w.g.clock.now += 12 * MIN;
    imDrafts = [draft(3, T + 5 * DAY + 70 * MIN), draft(3, T + 5 * DAY + 90 * MIN), draft(1, T + 100 * MIN)];
    eq([results(), run(), stories()], [[postKey(3)], true, [QA3(70), QA1]]);
    // ... and "no time": the Results tab shows the post and has no IM time for it any more, so the remembered one is
    // dropped; the time for the post it no longer shows is kept (the Results tab has nothing to say about that one)
    w.g.clock.now += 12 * MIN;
    imDrafts = [];
    eq([results(), run(), stories()], [[postKey(3)], true, [['QA-3', '', '', '', '', ''], QA1]]);
    eq(numbers(), [['—', '1 of 1 (100%)'], ['—', '2 h 30 min']]);

    // A rebuild with no Results rebuild in its run keeps what the tab remembers, and says so: refreshHeadStart() from
    // the editor ...
    w.g.props.set('STORE_SHEET_ID', ss.getId());
    w.g.clock.now += 3 * MIN;
    const month = w.bot.refreshHeadStart().month;
    eq([month.im_known, month.im_first, month.im_median_min, stories(), tab().cell(2, 1).match(/Rebuilt (.*) ET\.$/)[1]],
      [1, 1, 150, [['QA-3', '', '', '', '', ''], QA1], B.speedTime_(w.g.clock.now)]);
    assert.match(note(), /The IMs' times are the ones this tab last had: the Results tab wasn't rebuilt in the run of this rebuild, and newer ones come with its rebuild in the every-minute run\. Each is their email for Burson's post, else their draft \(their email for 0 of 1 in the last 30 days\)\. For a Burson alert older than the Results tab's 7 days, /);
    // ... and the every-minute run that has waited 10 more minutes for a Results rebuild (the dropped time stays dropped)
    w.g.props.set('HEAD_START_AT', String(w.g.clock.now));
    w.g.clock.now += 20 * MIN;
    eq([w.bot.headStartResultsRun_(w.g.clock.now, w.g.clock.now), run(), stories(), numbers()],
      [null, true, [['QA-3', '', '', '', '', ''], QA1], [['—', '1 of 1 (100%)'], ['—', '2 h 30 min']]]);
    // The next run with a Results rebuild brings the second post's time back (the IMs' draft is there again)
    w.g.clock.now += 10 * MIN;
    imDrafts = [draft(3, T + 5 * DAY + 90 * MIN)];
    eq([results(), run(), stories()], [[postKey(3)], true, [QA3(90), QA1]]);
    assert.ok(!w.g.logs.some(l => /Head start/.test(l)), 'nothing in the log');
  });

  test('head start: merging the IMs\' times of this run\'s Results rebuild with the ones the tab remembers (headStartImMerge_): for a post the rebuild shows its answer wins, "no time" included; for a post it doesn\'t show, the remembered time is used; a time that isn\'t one is no time', () => {
    const at = h => ({ at: NOW - h * HOUR, from: 'email' });
    const was = h => ({ at: NOW - h * HOUR, from: 'draft' });
    const kept = () => new Map([['a', was(50)], ['c', was(60)], ['d', was(70)]]);
    const run = { a: at(5), b: at(6) };
    // a: the run's time, not the remembered one; b: new; c: the rebuild shows the post and has no time: dropped;
    // d: the rebuild doesn't show the post: remembered
    eq(B.headStartImMerge_(run, ['a', 'b', 'c'], kept()), { a: at(5), b: at(6), d: was(70) });
    // which posts the rebuild shows comes from its posts, with or without an IM time (a post without a link has no key)
    eq(B.headStartImCovered_([{ key: 'a', im_email_at: 5 }, { key: 'c' }, { key: 'a' }, { key: '' }, null, 'x', { im_draft: { at: 5 } }]), ['a', 'c']);
    eq([B.headStartImCovered_(null), B.headStartImCovered_('posts'), B.headStartImCovered_([])], [[], [], []]);
    // without the list, the posts the run has a time for are the ones it shows
    eq(B.headStartImMerge_(run, null, kept()), { a: at(5), b: at(6), c: was(60), d: was(70) });
    // no Results rebuild in this run: what the tab remembers, all of it
    eq(B.headStartImMerge_(null, null, kept()), { a: was(50), c: was(60), d: was(70) });
    // a rebuild that shows every post and has no time for any: none (an answer, so not null)
    eq(B.headStartImMerge_({}, ['a', 'c', 'd'], kept()), {});
    // neither a rebuild nor anything remembered: null (the IMs' times are not at hand)
    eq([B.headStartImMerge_(null, null, new Map()), B.headStartImMerge_(null, null, null), B.headStartImMerge_(undefined, ['a'], {})], [null, null, null]);
    // what's remembered may be a plain object too
    eq(B.headStartImMerge_(run, ['c'], { a: was(50), c: was(60), d: was(70) }), { a: at(5), b: at(6), d: was(70) });
    // a time that isn't one is no time, from either side; `from` is email or draft
    eq(B.headStartImMerge_({ a: { at: 1e20 }, b: 'soon', e: { at: NOW, from: 'fax' } }, [],
      new Map([['c', { at: 'Infinity', from: 'email' }], ['d', null], ['f', { at: String(NOW), from: 'email' }], ['', at(1)], ['a', was(9)]])),
    { e: { at: NOW, from: 'draft' }, f: { at: NOW, from: 'email' } });
    for (const junk of [undefined, 'x', 5, [], [1, 2], true]) {
      assert.doesNotThrow(() => B.headStartImMerge_(junk, junk, junk), JSON.stringify(junk));
      eq(B.headStartImMerge_(junk, junk, junk), null, JSON.stringify(junk));
    }
    // the merged times are what the report takes: the run's time where its rebuild shows the post, else the remembered one
    const T = NOW - 10 * DAY;
    const rows = [own('QA-1', T, 1, WATCH), burson('QA-2', T + HOUR, 1), own('QA-3', NOW - DAY, 3, WATCH), burson('QA-4', NOW - 20 * HOUR, 3)];
    const merged = B.headStartImMerge_({ [postKey(3)]: { at: NOW - 19 * HOUR, from: 'email' } }, [postKey(3)],
      new Map([[postKey(1), { at: T + 2 * HOUR, from: 'draft' }], [postKey(3), { at: NOW - 18 * HOUR, from: 'draft' }]]));
    const r = report(rows, merged);
    eq(r.stories.map(x => [x.alert_id, x.im, x.im_key, x.im_lead_ms / MIN]),
      [['QA-3', { at: NOW - 19 * HOUR, from: 'email' }, postKey(3), 300], ['QA-1', { at: T + 2 * HOUR, from: 'draft' }, postKey(1), 120]]);
    eq([r.im_at_hand, r.windows.week.im_known, r.windows.week.im_median_min, r.windows.month.im_known, r.windows.month.im_median_min, r.windows.month.im_from_email],
      [true, 1, 300, 2, 210, 1]);
  });

  test('head start: the hidden state columns hold only the Burson post\'s key (never read as a formula), the IMs\' time in ms and the word email or draft; they are read back from every story row of both tables; a broken state cell is no state, and reading never throws', () => {
    const T = NOW - 2 * DAY;
    // Burson's posts with links whose key starts like a formula (the key is the link without its scheme), and an ordinary one
    const ODD = ['https://=1+1.example.test/x', 'https://-evil.example.test/p/1', 'https://@at.example.test/p', 'https://+plus.example.test/p/2'];
    const KEYS = ODD.map(B.postKey_).concat([postKey(14)]);
    eq(KEYS, ['=1+1.example.test/x', '-evil.example.test/p/1', '@at.example.test/p', '+plus.example.test/p/2', 'x:70014']);
    const rows = [];
    // stories 0, 2 and 4 are ahead of Burson (in both tables), 1 and 3 behind (in EVERY STORY only)
    KEYS.forEach((k, i) => rows.push(own(`QA-o${i}`, T + i * HOUR, 10 + i, WATCH),
      burson(`QA-b${i}`, T + i * HOUR + (i % 2 ? -30 : 30) * MIN, 10 + i, i < 4 ? { post_url: ODD[i] } : null)));
    rows.push(own('QA-7', T + 7 * HOUR, 7, WATCH), burson('QA-8', T + 8 * HOUR, 7));   // Burson alerted it; no IM time
    rows.push(own('QA-9', T + 9 * HOUR, 9, WATCH));                                      // no Burson alert
    const timeOf = i => T + (i + 2) * HOUR;
    const im = Object.fromEntries(KEYS.map((k, i) => [k, { at: timeOf(i), from: i % 2 ? 'email' : 'draft' }]));
    const r = report(rows, im);
    eq(r.stories.map(x => [x.alert_id, x.im_key, x.im && x.im.at]).reverse(),
      KEYS.map((k, i) => [`QA-o${i}`, k, timeOf(i)]).concat([['QA-7', '', null], ['QA-9', '', null]]));
    const cells = B.headStartTabRows_(r).rows;
    eq(cells.filter(c => c[0] === 'Type').map(c => c.slice(STATE_COL - 1)), [STATE, STATE]);
    eq([STATE_COL, B.ev('HEAD_START_STATE_COL_'), cells[0].length], [19, 19, 21]);  // the last three columns
    // the state cells: the key with an apostrophe before = + - @ (so it is text, never a formula), the ms, the word
    const stateOf = id => cells.filter(c => c[10] === id).map(c => c.slice(STATE_COL - 1));
    eq(KEYS.map((k, i) => stateOf(`QA-o${i}`)), [
      new Array(2).fill(['\'=1+1.example.test/x', timeOf(0), 'draft']), [['\'-evil.example.test/p/1', timeOf(1), 'email']],
      new Array(2).fill(['\'@at.example.test/p', timeOf(2), 'draft']), [['\'+plus.example.test/p/2', timeOf(3), 'email']],
      new Array(2).fill(['x:70014', timeOf(4), 'draft'])]);
    eq([stateOf('QA-7'), stateOf('QA-9')], [new Array(2).fill(['', '', '']), [['', '', '']]]);
    // nothing else is ever in those columns, every cell fits a cell, and the only formulas on the tab are the quoted links
    const LINK = /^=HYPERLINK\("https?:\/\/(?:[^"]|"")*","(?:[^"]|"")*"\)$/;
    const all = [].concat.apply([], cells);
    eq([all.filter(v => typeof v === 'string' && /^[=+\-@]/.test(v) && !LINK.test(v)), Math.max.apply(null, all.map(v => String(v).length)) <= 49000], [[], true]);
    const stateCells = cells.map(c => c.slice(STATE_COL - 1)).filter(c => c.join('') !== '' && c[0] !== STATE[0]);
    assert.ok(stateCells.length === 8 && stateCells.every(c => typeof c[0] === 'string' && typeof c[1] === 'number' && /^(email|draft)$/.test(c[2])),
      JSON.stringify(stateCells));
    // a key too long for a cell is cut to fit one, still as text
    const huge = Object.assign({}, r.stories[r.stories.length - 1], { im_key: `=${'k'.repeat(60000)}` });
    eq([B.headStartRow_(huge)[STATE_COL - 1].length, B.headStartRow_(huge)[STATE_COL - 1].slice(0, 3)], [49000, '\'=k']);

    // Written, the three columns are hidden, and the next rebuild reads every time back by its key as it was
    const w = world();
    const ss = sheetOf(w);
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, im, covered: KEYS });
    const tab = tabOf(ss);
    const sorted = map => Array.from(map.entries()).sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const expected = KEYS.map((k, i) => [k, { at: timeOf(i), from: i % 2 ? 'email' : 'draft' }]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
    eq([Array.from(new Set(tab.hidden)), sorted(w.bot.readHeadStartState_(tab))], [[19, 20, 21], expected]);
    const shown = () => table(tab, 'EVERY STORY').map(x => [x['App alert'], x['IMs emailed (ET)']].concat(STATE.map(h => x[h]))).reverse().slice(0, 5);
    const whole = KEYS.map((k, i) => [`QA-o${i}`, B.speedTime_(timeOf(i)), k, timeOf(i), i % 2 ? 'email' : 'draft']);
    w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows });  // no Results rebuild in this run: all remembered
    eq(shown(), whole);
    // ... from the rows of BOTH tables. Story 1 is in EVERY STORY only: its state is read there. Story 0 is in both:
    // with its state gone from either table, the other still has it
    const rowsOf = id => tab.rows.map((x, i) => (x[10] === id ? i + 1 : 0)).filter(Boolean);
    eq([rowsOf('QA-o0').length, rowsOf('QA-o1').length, rowsOf('QA-o0')[0] < at(tab, 'EVERY STORY'), rowsOf('QA-o1')[0] > at(tab, 'EVERY STORY')], [2, 1, true, true]);
    tab.getRange(rowsOf('QA-o0')[0], STATE_COL, 1, 3).setValues([['', '', '']]);
    eq(sorted(w.bot.readHeadStartState_(tab)), expected);
    tab.getRange(rowsOf('QA-o0')[1], STATE_COL, 1, 3).setValues([['', '', '']]);
    tab.getRange(rowsOf('QA-o0')[0], STATE_COL, 1, 3).setValues([[KEYS[0], timeOf(0), 'draft']]);
    eq(sorted(w.bot.readHeadStartState_(tab)), expected);
    w.bot.refreshHeadStart_(ss, { now: NOW + 2 * HOUR, alerts: rows });
    eq(shown(), whole);

    // A broken state cell is no state: a time that is a text, no real date or missing, a word that is neither email
    // nor draft, a missing key. Only that story's time is lost; the rebuild works and says nothing in the log
    const set = (id, col, values) => rowsOf(id).forEach((row, i) => tab.getRange(row, col).setValue(values[i % values.length]));
    set('QA-o0', STATE_COL + 1, ['soon', 1e20]);        // both of its rows
    set('QA-o1', STATE_COL + 2, ['fax']);
    set('QA-o2', STATE_COL + 1, ['Infinity', -5]);
    set('QA-o3', STATE_COL, ['']);
    set('QA-o4', STATE_COL + 1, ['']);                  // its time is missing in both rows ...
    let state;
    assert.doesNotThrow(() => { state = w.bot.readHeadStartState_(tab); });
    eq(sorted(state), []);
    tab.getRange(rowsOf('QA-o4')[1], STATE_COL + 1).setValue(timeOf(4));  // ... and then whole again in its EVERY STORY row
    eq(sorted(w.bot.readHeadStartState_(tab)), [[KEYS[4], { at: timeOf(4), from: 'draft' }]]);
    let out;
    assert.doesNotThrow(() => { out = w.bot.refreshHeadStart_(ss, { now: NOW + 3 * HOUR, alerts: rows }); });
    eq([out.written, out.windows.week.im_known, shown()], [true, 1, [0, 1, 2, 3].map(i => [`QA-o${i}`, '', '', '', '']).concat([whole[4]])]);
    assert.ok(!w.g.logs.some(l => /Head start/.test(l)), 'nothing in the log');

    // Reading never throws. Sheets failing on the state columns is not "no state": the Map is empty and says it could
    // not be read (`unread`), the log says so, and the rebuild writes nothing, so the tab keeps the time it remembers
    const real = tab.getRange.bind(tab);
    tab.getRange = (row, col, n, m) => { if (col >= STATE_COL) throw new Error('Sheets is down'); return real(row, col, n, m); };
    assert.doesNotThrow(() => { state = w.bot.readHeadStartState_(tab); });
    eq([sorted(state), state.unread, w.g.logs.slice(-1)], [[], true, ['ERROR Head start tab: the IMs\' times it remembers could not be read: Sheets is down']]);
    assert.doesNotThrow(() => { out = w.bot.refreshHeadStart_(ss, { now: NOW + 4 * HOUR, alerts: rows, im: { [KEYS[3]]: im[KEYS[3]] } }); });
    tab.getRange = real;
    eq([out.written, out.unread, shown().map(x => x[1])], [false, true, ['', '', '', '', B.speedTime_(timeOf(4))]]);
    // Sheets answers again: the same rebuild has the run's time and the remembered one
    out = w.bot.refreshHeadStart_(ss, { now: NOW + 4 * HOUR, alerts: rows, im: { [KEYS[3]]: im[KEYS[3]] } });
    eq([out.written, out.unread, shown().map(x => x[1])], [true, undefined, ['', '', '', B.speedTime_(timeOf(3)), B.speedTime_(timeOf(4))]]);
    for (const junk of [null, undefined, 5, 'tab', {}, { getLastRow() { throw new Error('down'); } }, { getLastRow: () => 3, getRange() { throw new Error('down'); } }]) {
      assert.doesNotThrow(() => { state = w.bot.readHeadStartState_(junk); });
      eq([sorted(state), !!state.unread], [[], junk !== null && junk !== undefined]);  // no tab: nothing remembered; anything else: not read
    }
    // A tab from before these columns (its tables' headers end at the minutes): nothing remembered, and the rebuild adds them
    tab.getRange(1, 15, tab.rows.length, 7).clearContent();
    eq([sorted(w.bot.readHeadStartState_(tab)), w.bot.refreshHeadStart_(ss, { now: NOW + 5 * HOUR, alerts: rows, im }).written, shown()], [[], true, whole]);
    // A tab from before the post-level columns: its state columns were 15 to 17, hidden, where the post-level columns
    // are now. The times are still read (the columns are found by their names), and the rebuild puts the state where
    // it is now, hidden, with the post-level columns shown
    tab.rows = tab.rows.map(x => x.slice(0, 14).concat(x.slice(STATE_COL - 1, STATE_COL + 2)));
    tab.hidden = [15, 16, 17];
    eq([tab.rows[at(tab, 'EVERY STORY') + 1].slice(14), sorted(w.bot.readHeadStartState_(tab))], [STATE, expected]);
    eq([w.bot.refreshHeadStart_(ss, { now: NOW + 6 * HOUR, alerts: rows }).written, shown(), Array.from(new Set(tab.hidden)),
      tab.rows[at(tab, 'EVERY STORY') + 1]], [true, whole, [19, 20, 21], HEADER]);
    eq(table(tab, 'EVERY STORY').filter(x => x['App alert'] === 'QA-o0').map(x => POST_COLS.map(h => x[h])),
      [[B.speedTime_(T + 30 * MIN), '30 min', `=HYPERLINK("${ODD[0]}","QA-b0")`, 30]]);
  });

  test('head start: a rebuild whose write fails leaves the tab as it was, with the IMs\' times it remembers (the new cells go in over the old ones in one write, and only then is what is left beyond them cleared): the next rebuild still has those times, and a tab that got shorter or narrower has nothing left over', () => {
    const w = world();
    const ss = sheetOf(w);
    const T = NOW - 9 * DAY;
    const rows = [own('QA-1', T, 1, WATCH), burson('QA-2', T + 2 * HOUR, 1), own('QA-3', T + DAY, 3, WATCH), burson('QA-4', T + DAY + HOUR, 3),
      own('QA-5', T + 2 * DAY, 5, WATCH)];
    const im = { [postKey(1)]: { at: T + 3 * HOUR, from: 'email' }, [postKey(3)]: { at: T + DAY + 2 * HOUR, from: 'draft' } };
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, im });
    const tab = tabOf(ss);
    const shown = () => table(tab, 'EVERY STORY').map(x => [x['App alert'], x['IMs emailed (ET)']].concat(STATE.map(h => x[h])));
    const whole = [['QA-5', '', '', '', ''], ['QA-3', B.speedTime_(T + DAY + 2 * HOUR), postKey(3), T + DAY + 2 * HOUR, 'draft'],
      ['QA-1', B.speedTime_(T + 3 * HOUR), postKey(1), T + 3 * HOUR, 'email']];
    eq(shown(), whole);
    const before = JSON.stringify(tab.rows);
    // Sheets fails on the write of the next rebuild (no Results rebuild in its run: only the tab has those times)
    const real = tab.getRange.bind(tab);
    tab.getRange = (row, col, n, m) => {
      const range = real(row, col, n, m);
      range.setValues = () => { throw new Error('Sheets is down'); };
      return range;
    };
    assert.throws(() => w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows }), /Sheets is down/);
    eq([JSON.stringify(tab.rows) === before, w.bot.isHeadStartTab_(tab), Array.from(w.bot.readHeadStartState_(tab).keys()).sort()],
      [true, true, [postKey(1), postKey(3)]]);
    // from poll(): logged, the run carries on, the tab is as it was
    const store = w.bot.sheetBackend_(ss);
    rows.forEach(x => store.appendAlert(x));
    let res;
    assert.doesNotThrow(() => { res = w.bot.maybeRefreshHeadStart_(ss, w.ctx(), { deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now }); });
    eq([res, w.g.logs.slice(-1), JSON.stringify(tab.rows) === before], [false, ['ERROR Head start tab not refreshed: Sheets is down'], true]);
    // Sheets is back: the next rebuild has every time the tab remembered
    tab.getRange = real;
    eq([w.bot.refreshHeadStart_(ss, { now: NOW + 2 * HOUR, alerts: rows }).written, shown()], [true, whole]);
    assert.match(tab.cell(2, 1), /Rebuilt 2026-10-14 10:00 ET\.$/);
    // A shorter tab (one story now) with cells people left below it and to its right: nothing of the old tab or of
    // theirs is left over, and the one story still has its time
    const length = tab.rows.length;
    tab.getRange(length + 5, 2).setValue('left over below');
    tab.getRange(length + 6, 25).setValue('left over below and to the right');
    tab.getRange(3, 24, 1, 2).setValues([['left over', 'to the right']]);
    eq([w.bot.refreshHeadStart_(ss, { now: NOW + 3 * HOUR, alerts: rows.slice(0, 2) }).written, shown(), tab.rows.length < length,
      tab.rows.every(x => x.length <= 25 && x.slice(HEADER.length).every(v => v === '')), JSON.stringify(tab.rows).indexOf('left over')],
    [true, [whole[2]], true, true, -1]);
    eq([tab.cell(1, 1), tab.rows.filter(x => x[0] === 'Type').length, table(tab, 'BIGGEST HEAD STARTS').map(x => x['App alert'])], [TITLE, 2, ['QA-1']]);
  });

  test('head start: a rebuild that can\'t READ the IMs\' times the tab remembers (a Sheets call fails on its hidden columns, or on the A1 check before them) writes nothing: the tab is left as it was, with every time it remembers, the log says so, and the next rebuild has them all; taken for "nothing remembered", the times of Burson\'s alerts older than the Results tab\'s days would be gone for good', () => {
    const w = world();
    const ss = sheetOf(w);
    const T = NOW - 20 * DAY;
    // six stories with an IM time; four of them on Burson alerts older than the Results tab's 7 days
    const rows = [];
    [0, 1, 2, 3].forEach(i => rows.push(own(`QA-o${i}`, T + i * DAY, 10 + i, WATCH), burson(`QA-b${i}`, T + i * DAY + HOUR, 10 + i)));
    [4, 5].forEach(i => rows.push(own(`QA-o${i}`, NOW - (i - 2) * DAY, 10 + i, WATCH), burson(`QA-b${i}`, NOW - (i - 2) * DAY + HOUR, 10 + i)));
    const imAt = i => (i < 4 ? T + i * DAY : NOW - (i - 2) * DAY) + 2 * HOUR;
    const all = Object.fromEntries([0, 1, 2, 3, 4, 5].map(i => [postKey(10 + i), { at: imAt(i), from: 'email' }]));
    // what a later run's Results rebuild has: only the two Burson posts of the last 7 days
    const recent = { [postKey(14)]: all[postKey(14)], [postKey(15)]: all[postKey(15)] };
    eq(w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, im: all }).windows.month.im_known, 6);
    const tab = tabOf(ss);
    const before = JSON.stringify(tab.rows);
    const remembered = () => Array.from(w.bot.readHeadStartState_(tab).keys()).sort();
    eq(remembered(), Object.keys(all).sort());
    const real = tab.getRange.bind(tab);
    // 1. Sheets fails once on the hidden columns
    let failed = 0;
    tab.getRange = (row, col, n, m) => {
      if (col >= STATE_COL && !failed++) throw new Error('Service Spreadsheets timed out');
      return real(row, col, n, m);
    };
    let out;
    assert.doesNotThrow(() => { out = w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows, im: recent, covered: Object.keys(recent) }); });
    eq([failed, out.written, out.unread, out.blocked, JSON.stringify(tab.rows) === before], [1, false, true, undefined, true]);
    eq(w.g.logs.slice(-2), ['ERROR Head start tab: the IMs\' times it remembers could not be read: Service Spreadsheets timed out',
      'Head start tab not updated this time: the IMs\' times it remembers could not be read, so it is left as it was (the next rebuild tries again)']);
    // the next rebuild (Sheets answers again) has all six: the four older ones from the tab, the two recent ones from the run
    out = w.bot.refreshHeadStart_(ss, { now: NOW + 2 * HOUR, alerts: rows, im: recent, covered: Object.keys(recent) });
    eq([out.written, out.unread, out.windows.month.im_known, remembered()], [true, undefined, 6, Object.keys(all).sort()]);
    // 2. Sheets fails once on the A1 check before the hidden columns are read (the check at the start of the rebuild passed)
    const kept = JSON.stringify(tab.rows);
    const lastRow = tab.getLastRow.bind(tab);
    let calls = 0;
    tab.getLastRow = () => { if (++calls === 2) throw new Error('Service Spreadsheets timed out'); return lastRow(); };
    const logged = w.g.logs.length;
    assert.doesNotThrow(() => { out = w.bot.refreshHeadStart_(ss, { now: NOW + 3 * HOUR, alerts: rows, im: recent, covered: Object.keys(recent) }); });
    tab.getLastRow = lastRow;
    eq([calls >= 2, out.written, out.unread, JSON.stringify(tab.rows) === kept, w.g.logs.length - logged], [true, false, true, true, 2]);
    eq(w.bot.refreshHeadStart_(ss, { now: NOW + 4 * HOUR, alerts: rows, im: recent, covered: Object.keys(recent) }).windows.month.im_known, 6);
    // from poll(): the run carries on, nothing is written, and the tab waits its 10 minutes like any rebuild
    failed = 0;
    const store = w.bot.sheetBackend_(ss);
    rows.forEach(x => store.appendAlert(x));
    const mine = JSON.stringify(tab.rows);
    let res;
    assert.doesNotThrow(() => { res = w.bot.maybeRefreshHeadStart_(ss, w.ctx(), { deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now }); });
    eq([res, failed, JSON.stringify(tab.rows) === mine, remembered()], [false, 1, true, Object.keys(all).sort()]);
    const again = () => w.bot.maybeRefreshHeadStart_(ss, w.ctx(), { deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now });
    failed = 5;  // Sheets answers from here on; a read of the hidden columns would count one more
    eq([again(), failed, JSON.stringify(tab.rows) === mine], [false, 5, true]);  // the next run: not due, nothing is read
    // refreshHeadStart() from the editor says so too, and returns nothing
    failed = 0;
    w.g.props.set('STORE_SHEET_ID', ss.getId());
    eq([w.bot.refreshHeadStart(), failed, JSON.stringify(tab.rows) === mine], [null, 1, true]);
    assert.match(w.g.logs.slice(-1)[0], /^Head start tab not rebuilt: the IMs' times it remembers could not be read/);
    // "Nothing remembered" is still that: no tab yet, a tab from before the hidden columns, broken cells (the tests above)
    eq([w.bot.readHeadStartState_(null).unread, w.bot.readHeadStartState_(tab).unread, remembered()], [undefined, undefined, Object.keys(all).sort()]);
    // once it is due again (10 minutes, and 10 more with no Results rebuild in the run) the every-minute run rebuilds
    // the tab, with every time it remembered
    w.g.clock.now += 21 * MIN;
    eq([again(), JSON.stringify(tab.rows) === mine, remembered()], [true, false, Object.keys(all).sort()]);
  });

  test('head start: a rebuild leaves hidden the columns a person hid (Product and Exposure Tag, say, or the post-level ones): every column is shown again only on a tab narrower than today\'s (one from before the post-level columns, whose hidden state columns were where those are now); the bot\'s three state columns are hidden at every rebuild', () => {
    const w = world();
    const ss = sheetOf(w);
    const rows = [own('QA-1', NOW - DAY, 1, WATCH), burson('QA-2', NOW - DAY + HOUR, 1)];
    const hidden = tab => Array.from(new Set(tab.hidden)).sort((a, b) => a - b);
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows });
    const tab = tabOf(ss);
    eq(hidden(tab), [19, 20, 21]);
    tab.hideColumns(4, 2);    // a person hides Product and Exposure Tag
    w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows });
    eq(hidden(tab), [4, 5, 19, 20, 21]);
    tab.hideColumns(15, 4);   // ... and the post-level columns
    tab.showColumns(19, 3);   // ... and shows the bot's state columns: those are hidden again
    w.bot.refreshHeadStart_(ss, { now: NOW + 2 * HOUR, alerts: rows });
    eq(hidden(tab), [4, 5, 15, 16, 17, 18, 19, 20, 21]);
    // a tab from before the post-level columns (17 columns, its state hidden in 15 to 17): every column is shown, once
    tab.rows = tab.rows.map(x => x.slice(0, 14).concat(x.slice(STATE_COL - 1, STATE_COL + 2)));
    tab.hidden = [15, 16, 17];
    w.bot.refreshHeadStart_(ss, { now: NOW + 3 * HOUR, alerts: rows });
    eq([hidden(tab), tab.rows[at(tab, 'EVERY STORY') + 1]], [[19, 20, 21], HEADER]);
  });

  test('head start: the headline numbers\' rows wrap in all three of their columns (the label, the 7-day and the 30-day value): the 7-day value of the post-level line ("1 of 2 (50%): median head start 30 min") is wider than its column and has a value beside it, so unwrapped it would be cut at the cell\'s edge', () => {
    const w = world();
    const ss = sheetOf(w);
    const rows = [own('QA-1', NOW - 2 * DAY, 1, WATCH), burson('QA-2', NOW - 2 * DAY + 30 * MIN, 1),
      own('QA-3', NOW - 3 * DAY, 3, WATCH), burson('QA-4', NOW - 3 * DAY - 5 * MIN, 3)];
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows });
    const tab = tabOf(ss);
    // every setWrap(true) of the next rebuild, as [row, column, rows, columns]
    const wraps = [];
    const real = tab.getRange.bind(tab);
    tab.getRange = (row, col, n, m) => {
      const range = real(row, col, n, m);
      const setWrap = range.setWrap;
      range.setWrap = on => { if (on) wraps.push([row, col, n || 1, m || 1]); return setWrap.call(range, on); };
      return range;
    };
    w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows });
    tab.getRange = real;
    const first = at(tab, 'HEADLINE NUMBERS') + 2;   // the first numbers row (1-based), under the section's row
    const count = at(tab, 'Matched on:') - at(tab, 'HEADLINE NUMBERS') - 1;
    const line = tab.rows.findIndex(x => x[0] === POST_LINE) + 1;
    eq([tab.rows[line - 1].slice(1, 3), line >= first && line < first + count], [['1 of 2 (50%): median head start 30 min', '1 of 2 (50%): median head start 30 min'], true]);
    const covers = (r, c) => wraps.some(x => x[0] <= r && r < x[0] + x[2] && x[1] <= c && c < x[1] + x[3]);
    eq([1, 2, 3].map(c => covers(line, c)), [true, true, true]);
    eq([[first, 1, count, 3]].map(x => wraps.some(y => y.join() === x.join())), [true]);  // one call, for all the numbers' rows
  });

  test('head start: "Head start on the post" wraps in the stories\' rows of both tables: for a post that a later card or update brought, its words ("behind by 1 h (from this app\'s alert on this post, 2026-10-12 08:00 ET)") are wider than its column and have Burson\'s alert beside them, so unwrapped they would be cut at the cell\'s edge and the "when" the line under the title promises would not show', () => {
    const w = world();
    const ss = sheetOf(w);
    // a card 8 days ago on post 20; its update 2 days ago brings post 21, which Burson had alerted an hour before
    const rows = [card('QA-1', NOW - 8 * DAY, 20, { post_keys: [key(20)] }), burson('QA-2', NOW - 2 * DAY - HOUR, 21),
      card('QA-3', NOW - 2 * DAY, 21, { post_keys: [key(21)], update_of: 'QA-1' })];
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows });
    const tab = tabOf(ss);
    // every setWrap(true) of the next rebuild, as [row, column, rows, columns]
    const wraps = [];
    const real = tab.getRange.bind(tab);
    tab.getRange = (row, col, n, m) => {
      const range = real(row, col, n, m);
      const setWrap = range.setWrap;
      range.setWrap = on => { if (on) wraps.push([row, col, n || 1, m || 1]); return setWrap.call(range, on); };
      return range;
    };
    w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows });
    tab.getRange = real;
    const COL = HEADER.indexOf('Head start on the post') + 1;
    const WORDS = 'behind by 1 h (from this app\'s alert on this post, 2026-10-12 08:00 ET)';
    // the story's row in BIGGEST HEAD STARTS and in EVERY STORY (1-based), Burson's alert in the cell to the right
    const stories = tab.rows.map((x, i) => (x[COL - 1] === WORDS ? i + 1 : 0)).filter(Boolean);
    eq([stories.length, stories.map(r => String(tab.cell(r, COL + 1)))], [2, [`=HYPERLINK("${link(21)}","QA-2")`, `=HYPERLINK("${link(21)}","QA-2")`]]);
    const covers = (r, c) => wraps.some(x => x[0] <= r && r < x[0] + x[2] && x[1] <= c && c < x[1] + x[3]);
    eq(stories.map(r => covers(r, COL)), [true, true]);
  });

  test('head start: a tab whose sheet ends at the first or second hidden column (a person deleted the last state columns and all to their right; in Sheets a read beyond a sheet\'s last column fails) is rebuilt like any tab: only the state columns the sheet still has are read, a row without its time or its email/draft cell is no state, and the rebuild writes the whole layout again. It is not taken for a read that failed, which would leave the tab as it is at every rebuild from then on', () => {
    const w = world();
    const ss = sheetOf(w);
    const T = NOW - 9 * DAY;
    const rows = [own('QA-1', T, 1, WATCH), burson('QA-2', T + 2 * HOUR, 1)];
    const im = { [postKey(1)]: { at: T + 3 * HOUR, from: 'email' } };
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, im });
    const tab = tabOf(ss);
    const remembered = () => Array.from(w.bot.readHeadStartState_(tab).keys());
    eq(remembered(), [postKey(1)]);
    // Sheets' grid, which the fake sheet doesn't have: a read beyond the sheet's last column fails, a write grows the sheet
    const real = tab.getRange.bind(tab);
    let cols = HEADER.length;
    tab.getRange = (row, col, n, m) => {
      const range = real(row, col, n, m);
      const end = col + (m || 1) - 1;
      const read = range.getValues;
      const write = range.setValues;
      range.getValues = () => {
        if (end > cols) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        return read.call(range);
      };
      range.setValues = values => { cols = Math.max(cols, end); return write.call(range, values); };
      return range;
    };
    // the sheet ends at "IM time (ms)" (20 columns), then at "Burson post key" (19 columns)
    [STATE_COL + 1, STATE_COL].forEach((left, i) => {
      tab.rows = tab.rows.map(x => x.slice(0, left));
      cols = left;
      const state = w.bot.readHeadStartState_(tab);
      eq([Array.from(state.keys()), state.unread], [[], undefined], `${left} columns: nothing remembered, and read`);
      const out = w.bot.refreshHeadStart_(ss, { now: NOW + (i + 1) * HOUR, alerts: rows, im });
      eq([out.written, out.unread, cols, tab.rows[at(tab, 'EVERY STORY') + 1], remembered()], [true, undefined, HEADER.length, HEADER, [postKey(1)]],
        `${left} columns: rebuilt whole`);
    });
    assert.match(tab.cell(2, 1), /Rebuilt 2026-10-14 10:00 ET\.$/);
    assert.ok(!w.g.logs.some(l => /could not be read/.test(l)), 'no read failed');
    tab.getRange = real;
  });

  test('head start: a foreign tab\'s cells are never read for the IMs\' times: of a tab named "Head start" that isn\'t the bot\'s (here the bot\'s own, with its title in A1 changed) nothing but A1 is looked at, and the bot\'s new tab takes no time from it', () => {
    const w = world();
    const ss = sheetOf(w);
    const T = NOW - 2 * DAY;
    const rows = [own('QA-1', T, 1, WATCH), burson('QA-2', T + 2 * HOUR, 1)];
    const im = { [postKey(1)]: { at: T + 3 * HOUR, from: 'email' } };
    const shown = () => table(tabOf(ss), 'EVERY STORY').map(x => [x['App alert'], x['IMs emailed (ET)']].concat(STATE.map(h => x[h])));
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, im });
    const theirs = tabOf(ss);
    eq([shown(), Array.from(w.bot.readHeadStartState_(theirs).entries())],
      [[['QA-1', B.speedTime_(T + 3 * HOUR), postKey(1), T + 3 * HOUR, 'email']], [[postKey(1), im[postKey(1)]]]]);
    // its A1 is changed: the tab is no longer known as the bot's. Every cell the bot then looks at is recorded
    theirs.getRange(1, 1).setValue('Head start: my own notes');
    const kept = JSON.stringify(theirs.rows);
    const reads = [];
    const real = theirs.getRange.bind(theirs);
    theirs.getRange = (row, col, n, m) => { reads.push([row, col, n || 1, m || 1].join()); return real(row, col, n, m); };
    eq([Array.from(w.bot.readHeadStartState_(theirs).entries()), reads], [[], ['1,1,1,1']]);
    eq([w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows }).blocked, w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows, im, make: true }).blocked,
      Array.from(new Set(reads)), JSON.stringify(theirs.rows)], [true, true, ['1,1,1,1'], kept]);
    // renamed: the bot makes its own tab, with no IM time (it had none of its own to remember; the other tab's is not its)
    theirs.setName('My head start notes');
    eq([w.bot.refreshHeadStart_(ss, { now: NOW + 2 * HOUR, alerts: rows }).written, shown(), Array.from(new Set(reads)), JSON.stringify(theirs.rows), theirs.getName()],
      [true, [['QA-1', '', '', '', '']], ['1,1,1,1'], kept, 'My head start notes']);
    assert.match(tabOf(ss).rows.map(x => String(x[0])).find(x => x.indexOf('Matched on:') === 0), /The IMs' times weren't at hand for this rebuild .*so those columns are blank\.$/);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // The numbers
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: the 7-day and 30-day numbers, by when this app alerted: stories, those Burson alerted too, this app first and Burson first with their medians and shares, no Burson alert found, before the IMs\' email with its median, and the reverse view of Burson\'s alerts', () => {
    const rows = [
      own('QA-1', NOW - 2 * DAY, 1, WATCH), burson('QA-2', NOW - 2 * DAY + 3 * HOUR, 1),          // first by 180 min
      card('QA-3', NOW - 3 * DAY, 3), burson('QA-4', NOW - 3 * DAY + HOUR, 3),                     // first by 60 min
      own('QA-5', NOW - 4 * DAY, 5, DIRECT.BSIP), burson('QA-6', NOW - 4 * DAY - 30 * MIN, 5),     // behind by 30 min
      own('QA-7', NOW - 5 * DAY, 7, WATCH),                                                        // no Burson alert
      card('QA-8', NOW - 10 * DAY, 8), burson('QA-9', NOW - 8 * DAY, 8),                           // first by 2 days (30 days only)
      own('QA-10', NOW - 20 * DAY, 10, WATCH), burson('QA-11', NOW - 20 * DAY - 2 * HOUR, 10),     // behind by 120 min (30 days only)
      own('QA-12', NOW - 40 * DAY, 12, WATCH), burson('QA-13', NOW - 39 * DAY, 12),                // older than 30 days: in neither
      burson('QA-14', NOW - DAY, 14),                                                              // an alert only Burson had
      own('QA-15', NOW - 15 * DAY, 15, WATCH),                                                     // no Burson alert (30 days only)
      // 30 days and 12 hours old, an hour ahead of Burson: just outside the 30 days, so in neither the table nor a number
      own('QA-16', NOW - 30 * DAY - 12 * HOUR, 16, WATCH), burson('QA-17', NOW - 30 * DAY - 11 * HOUR, 16),
    ];
    const im = { [postKey(1)]: { at: NOW - 2 * DAY + 5 * HOUR, from: 'email' }, [postKey(5)]: { at: NOW - 4 * DAY - 10 * MIN, from: 'draft' },
      [postKey(8)]: { at: NOW - 7 * DAY, from: 'email' } };
    const r = report(rows, im);
    eq(r.stories.map(s => s.alert_id), ['QA-1', 'QA-3', 'QA-5', 'QA-7', 'QA-8', 'QA-15', 'QA-10']);  // the last 30 days, newest first
    eq(r.windows.week, {
      stories: 4, matched: 3, matched_pct: 75, first: 2, first_pct: 67, first_median_min: 120, behind: 1, behind_median_min: 30, unmatched: 1,
      post_matched: 3, post_first: 2, post_first_pct: 67, post_first_median_min: 120,
      im_known: 2, im_first: 1, im_first_pct: 50, im_median_min: 145, im_from_email: 1,
      burson_alerts: 4, burson_after: 2, burson_after_pct: 50, burson_after_by: { post: 2, story: 0, name: 0, wording: 0 },
    });
    eq(r.windows.month, {
      stories: 7, matched: 5, matched_pct: 71, first: 3, first_pct: 60, first_median_min: 180, behind: 2, behind_median_min: 75, unmatched: 2,
      post_matched: 5, post_first: 3, post_first_pct: 60, post_first_median_min: 180,
      im_known: 3, im_first: 2, im_first_pct: 67, im_median_min: 300, im_from_email: 2,
      burson_alerts: 6, burson_after: 3, burson_after_pct: 50, burson_after_by: { post: 3, story: 0, name: 0, wording: 0 },
    });
    // the 30-day edge, as the 7-day one: a story exactly 30 days old is in the table and the 30-day numbers, one a
    // millisecond older is in neither; and exactly 7 days old it is in the 7-day numbers, a millisecond older not
    const edge = ago => { const x = report([own('QA-1', NOW - ago, 1, WATCH)]); return [x.stories.length, x.windows.month.stories, x.windows.week.stories]; };
    eq([edge(30 * DAY), edge(30 * DAY + 1), edge(30 * DAY + 12 * HOUR), edge(7 * DAY), edge(7 * DAY + 1)],
      [[1, 1, 0], [0, 0, 0], [0, 0, 0], [1, 1, 1], [1, 1, 0]]);
    eq(r.top.map(s => [s.alert_id, s.lead_ms / MIN]), [['QA-8', 2880], ['QA-1', 180], ['QA-3', 60]]);  // the longest head start first

    const w = world();
    const ss = sheetOf(w);
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, im });
    const tab = tabOf(ss);
    eq(tab.rows[at(tab, 'HEADLINE NUMBERS')].slice(0, 3), ['HEADLINE NUMBERS', 'Last 7 days', 'Last 30 days']);
    eq(['Stories this app alerted on its own', 'Of those, also alerted by Burson', 'This app alerted first (of those Burson alerted too)',
      'Median head start over Burson (where this app was first)', 'Burson alerted first', 'Median time this app was behind (where Burson was first)',
      'No Burson alert found', POST_LINE, 'This app\'s alert before the IMs\' email (of the stories with an IM email time)',
      'Median time from this app\'s alert to the IMs\' email (the end-to-end head start)', 'Burson\'s alerts in the same days',
      REVERSE_LINE].map(label => line(tab, label)),
    [[4, 7], ['3 of 4 (75%)', '5 of 7 (71%)'], ['2 of 3 (67%)', '3 of 5 (60%)'], ['2 h', '3 h'], [1, 2], ['30 min', '1 h 15 min'], [1, 2],
      ['2 of 3 (67%): median head start 2 h', '3 of 5 (60%): median head start 3 h'],
      ['1 of 2 (50%)', '2 of 3 (67%)'], ['2 h 25 min', '5 h'], [4, 6], ['2 of 4 (50%): 2 same post', '3 of 6 (50%): 3 same post']]);
    // the lines in their order: the story-level numbers, the post-level line, the IMs', then Burson's alerts
    eq(tab.rows.slice(at(tab, 'HEADLINE NUMBERS') + 1, at(tab, 'Matched on:')).map(x => x[0]), ['Stories this app alerted on its own',
      'Of those, also alerted by Burson', 'This app alerted first (of those Burson alerted too)', 'Median head start over Burson (where this app was first)',
      'Burson alerted first', 'Median time this app was behind (where Burson was first)', 'No Burson alert found', POST_LINE,
      'This app\'s alert before the IMs\' email (of the stories with an IM email time)',
      'Median time from this app\'s alert to the IMs\' email (the end-to-end head start)', 'Burson\'s alerts in the same days', REVERSE_LINE]);
    eq(table(tab, 'EVERY STORY').map(x => x['App alert']), ['QA-1', 'QA-3', 'QA-5', 'QA-7', 'QA-8', 'QA-15', 'QA-10']);  // QA-16 is on no row
    eq(table(tab, 'BIGGEST HEAD STARTS').map(x => [x['App alert'], x['Head start over Burson'], x['Head start over Burson (min)']]),
      [['QA-8', '2 d', 2880], ['QA-1', '3 h', 180], ['QA-3', '1 h', 60]]);

    // Nothing of this app's own: every count is 0, every share and median a dash
    const empty = report([burson('QA-1', NOW - DAY, 1)]);
    eq([empty.stories, empty.top, empty.windows.month.stories, empty.windows.month.matched_pct, empty.windows.month.first_median_min,
      empty.windows.month.burson_alerts, empty.windows.month.burson_after_pct], [[], [], 0, null, null, 1, 0]);
    const lines = B.headStartTabRows_(empty).rows;
    eq(lines.slice(4, 16).map(x => x[2]), [0, '—', '—', '—', 0, '—', 0, '—', '—', '—', 1, '0 of 1 (0%)']);
    eq(lines.filter(x => x[0] === 'None yet').length, 2);
  });

  test('head start: a same-millisecond pair is neither "this app first" nor "Burson first": the story is matched and counted in neither, it has no median, none of Burson\'s alerts is one this app had first, and its cell reads "the same minute"', () => {
    const T = NOW - DAY;
    const rows = [own('QA-1', T, 1, WATCH), burson('QA-2', T, 1)];
    const r = report(rows, { [postKey(1)]: { at: T, from: 'email' } });
    eq(r.stories.map(brief), [['QA-1', 'Watch', 'same post', 'QA-2', 0]]);
    eq(r.windows.week, {
      stories: 1, matched: 1, matched_pct: 100, first: 0, first_pct: 0, first_median_min: null, behind: 0, behind_median_min: null, unmatched: 0,
      post_matched: 1, post_first: 0, post_first_pct: 0, post_first_median_min: null,
      im_known: 1, im_first: 0, im_first_pct: 0, im_median_min: 0, im_from_email: 1,
      burson_alerts: 1, burson_after: 0, burson_after_pct: 0, burson_after_by: { post: 0, story: 0, name: 0, wording: 0 },
    });
    eq(r.top, []);
    const w = world();
    const ss = sheetOf(w);
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, im: { [postKey(1)]: { at: T, from: 'email' } } });
    const tab = tabOf(ss);
    eq(table(tab, 'EVERY STORY').map(x => [x['App alert'], x['Burson alerted (ET)'], x['Head start over Burson'], x['Head start over Burson (min)'],
      x['Head start over the IMs'], x['Head start over the IMs (min)'], x['Head start on the post'], x['Head start on the post (min)']]),
    [['QA-1', B.speedTime_(T), 'the same minute', 0, 'the same minute', 0, 'the same minute', 0]]);
    eq([table(tab, 'BIGGEST HEAD STARTS'), tab.rows[at(tab, 'BIGGEST HEAD STARTS') + 2][0]], [[], 'None yet']);
    eq(['Of those, also alerted by Burson', 'This app alerted first (of those Burson alerted too)', 'Median head start over Burson (where this app was first)',
      'Burson alerted first', 'Median time this app was behind (where Burson was first)',
      POST_LINE, 'This app\'s alert before the IMs\' email (of the stories with an IM email time)',
      'Median time from this app\'s alert to the IMs\' email (the end-to-end head start)',
      REVERSE_LINE].map(label => line(tab, label)[0]),
    ['1 of 1 (100%)', '0 of 1 (0%)', '—', 0, '—', '0 of 1 (0%)', '0 of 1 (0%)', 'the same minute', '0 of 1 (0%)']);
    // a millisecond either way and it is one or the other
    eq([1, -1].map(ms => { const x = report([rows[0], burson('QA-2', T + ms, 1)]).windows.week; return [x.first, x.behind, x.burson_after]; }),
      [[1, 0, 1], [0, 1, 0]]);
  });

  test('head start: BIGGEST HEAD STARTS is the ten stories this app alerted longest before Burson, longest first: of 13 stories ahead of Burson by different amounts (and one behind it), exactly the ten longest, in ten rows of the tab\'s table', () => {
    // 13 stories ahead of Burson by 1 to 13 hours, alerted in no order of their head starts, and one story behind
    const leads = [7, 2, 13, 5, 10, 1, 12, 4, 9, 3, 11, 6, 8];
    const rows = [];
    leads.forEach((h, i) => {
      const when = NOW - (i + 2) * DAY;
      rows.push(own(`QA-o${h}`, when, 100 + i, WATCH), burson(`QA-b${h}`, when + h * HOUR, 100 + i));
    });
    rows.push(own('QA-late', NOW - DAY, 99, WATCH), burson('QA-early', NOW - DAY - 20 * HOUR, 99));
    const TEN = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4];
    const r = report(rows);
    eq([r.stories.length, r.windows.month.first, r.windows.month.behind, B.ev('HEAD_START_TOP_')], [14, 13, 1, 10]);
    eq(r.top.map(s => [s.alert_id, s.lead_ms / HOUR]), TEN.map(h => [`QA-o${h}`, h]));
    const w = world();
    const ss = sheetOf(w);
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows });
    const tab = tabOf(ss);
    eq(table(tab, 'BIGGEST HEAD STARTS').map(x => [x['App alert'], x['Burson alert'], x['Head start over Burson'], x['Head start over Burson (min)']]),
      TEN.map(h => [`QA-o${h}`, `=HYPERLINK("${link(100 + leads.indexOf(h))}","QA-b${h}")`, `${h} h`, h * 60]));
    // ten rows between the table's header and the blank row before EVERY STORY, which has all fourteen
    eq([at(tab, 'EVERY STORY') - at(tab, 'BIGGEST HEAD STARTS') - 3, table(tab, 'EVERY STORY').length], [10, 14]);
    assert.match(tab.rows[at(tab, 'BIGGEST HEAD STARTS')][0], /^BIGGEST HEAD STARTS \(last 30 days: the 10 stories this app alerted longest before Burson\)$/);
    // with ten or fewer, all of them
    eq(report(rows.filter(x => !/^QA-[ob](?:1|2|3|4)$/.test(x.alert_id))).top.map(s => s.lead_ms / HOUR), [13, 12, 11, 10, 9, 8, 7, 6, 5]);
    // head starts of the same length: the newer story first
    const even = [[5, 'a'], [2, 'b'], [9, 'c']].map(([days, id], i) => [own(`QA-${id}`, NOW - days * DAY, 200 + i, WATCH),
      burson(`QA-${id}b`, NOW - days * DAY + HOUR, 200 + i)]);
    eq(report([].concat.apply([], even)).top.map(s => [s.alert_id, s.lead_ms / HOUR]), [['QA-b', 1], ['QA-a', 1], ['QA-c', 1]]);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // The tab: the bot's own, safe text, capped cells
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: the tab, top to bottom: the bot\'s title in A1, what\'s counted and when it was rebuilt (ET), HEADLINE NUMBERS, BIGGEST HEAD STARTS, EVERY STORY; made after the report tabs, protected with a warning, rewritten whole on the next rebuild', () => {
    const w = world();
    const ss = sheetOf(w);
    ['Resources', 'Results', 'Follow-up', 'Alert log', 'Relay'].forEach(n => ss.insertSheet(n));
    const rows = [card('QA-1', SAT_11PM, 1, { post_keys: [key(1), key(2)], story_title: 'A card\'s headline' }, { issue_name: '' }),
      burson('QA-2', TUE_2PM, 2)];
    const out = w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows });
    const tab = tabOf(ss);
    eq([out.written, ss.getSheets().map(s => s.getName())], [true, ['Sheet1', 'Resources', 'Results', 'Follow-up', TAB, 'Alert log', 'Relay']]);
    assert.match(TITLE, /^Head start: .*\(written by the Burson QA bot\)$/);
    eq([tab.cell(1, 1), w.bot.isHeadStartTab_(tab), tab.protections.length, tab.protections[0].warningOnly], [TITLE, true, 1, true]);
    assert.match(tab.cell(2, 1), /^What's counted: every story this app alerted on its own in the last 30 days .* Rebuilt 2026-10-14 08:00 ET\.$/);
    eq([at(tab, 'HEADLINE NUMBERS'), at(tab, 'Matched on:'), at(tab, 'BIGGEST HEAD STARTS'), at(tab, 'EVERY STORY')], [3, 16, 18, 22]);
    eq([tab.rows[19], tab.rows[23], tab.rows.length], [HEADER, HEADER, 25]);
    // the story is the card's headline when it has no issue name, linked to its lead post
    eq(table(tab, 'EVERY STORY'), [Object.fromEntries(HEADER.map((h, i) => [h, ['Early Detection', '2026-10-10 23:00',
      `=HYPERLINK("${link(1)}","A card's headline")`, 'Search', TAG, '2026-10-13 14:00', '2 d 15 h', '', '', 'same post', 'QA-1',
      `=HYPERLINK("${link(2)}","QA-2")`, 3780, '', '2026-10-13 14:00', '2 d 15 h', `=HYPERLINK("${link(2)}","QA-2")`, 3780, '', '', ''][i]]))]);
    eq(tab.merges, ['2,1,1,8', '17,1,1,8']);
    eq(Array.from(new Set(tab.hidden)), [19, 20, 21]);  // the three state columns, hidden
    // The next rebuild writes the tab whole: nothing of the last one is left below a shorter table
    tab.getRange(40, 3).setValue('left over');
    w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: [own('QA-9', NOW, 9, WATCH)] });
    eq([tab.rows.length, tab.cell(1, 1), table(tab, 'EVERY STORY').map(x => x['App alert']), tab.rows.filter(x => x[0] === 'None yet').length,
      ss.getSheets().filter(s => s.getName() === TAB).length], [25, TITLE, ['QA-9'], 1, 1]);
    assert.match(tab.cell(2, 1), /Rebuilt 2026-10-14 09:00 ET\.$/);

    // A sheet where this app never alerted on its own gets no tab from the every-minute run; refreshHeadStart() makes one
    const bare = sheetOf(w);
    eq([w.bot.refreshHeadStart_(bare, { now: NOW, alerts: [burson('QA-1', NOW - HOUR, 1)] }).written, bare.getSheets().map(s => s.getName())],
      [false, ['Sheet1']]);
    eq([w.bot.refreshHeadStart_(bare, { now: NOW, alerts: [burson('QA-1', NOW - HOUR, 1)], make: true }).written, bare.getSheets().map(s => s.getName()),
      tabOf(bare).rows.filter(x => x[0] === 'None yet').length], [true, ['Sheet1', TAB], 2]);
  });

  test('head start: a foreign "Head start" tab (one the bot didn\'t make: no title of the bot\'s in A1, or empty) is left untouched: never read, cleared, written or protected, and the log and the note say so until it is renamed', () => {
    const w = world();
    const ss = sheetOf(w);
    const theirs = ss.insertSheet(TAB);
    theirs.getRange(1, 1, 2, 2).setValues([['Head start: my own notes', 'Owner'], ['keep', 'this']]);
    const kept = JSON.stringify(theirs.rows);
    const rows = [own('QA-1', NOW - HOUR, 1, WATCH), burson('QA-2', NOW - 30 * MIN, 1)];
    const untouched = () => [JSON.stringify(theirs.rows), theirs.protections.length, theirs.cleared || [], theirs.merges || [], theirs.formatsCleared || 0,
      ss.getSheets().filter(s => s.getName() === TAB).length];
    eq([w.bot.isHeadStartTab_(theirs), w.bot.headStartTabForeign_(ss)], [false, true]);
    const out = w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows, make: true });
    eq([out.blocked, out.written, out.stories], [true, false, []]);
    eq(untouched(), [kept, 0, [], [], 0, 1]);
    assert.throws(() => w.bot.writeHeadStartTab_(theirs, B.headStartReport_(rows, null, NOW)), /isn't the bot's Head start tab: left as it is/);
    eq(w.bot.ensureHeadStartTab_(ss), null);
    eq(untouched(), [kept, 0, [], [], 0, 1]);
    // from poll(): the same, and it says why
    const store = w.bot.sheetBackend_(ss);
    rows.forEach(x => store.appendAlert(x));
    eq(w.bot.maybeRefreshHeadStart_(ss, w.ctx(), { deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now }), false);
    eq(untouched(), [kept, 0, [], [], 0, 1]);
    const TEXT = 'a tab named "Head start" that the bot didn\'t make is in the way (or its title in A1 was changed). Rename that tab, and the bot makes its own.';
    eq([w.g.props.get('HEAD_START_BLOCKED'), w.bot.headStartBlockedNote_(), w.g.logs.filter(l => /Head start/.test(l))],
      ['true', `The Head start tab isn't being updated: ${TEXT}`,
        ['Head start tab not updated: a "Head start" tab the bot didn\'t make is there (left as it is)',
          'Head start tab not updated: a "Head start" tab the bot didn\'t make is there (left as it is)']]);
    // refreshHeadStart() (from the editor): the same, and it says why
    w.g.props.set('STORE_SHEET_ID', ss.getId());
    eq([w.bot.refreshHeadStart(), untouched(), w.g.logs.slice(-1)], [null, [kept, 0, [], [], 0, 1], [`Head start tab not rebuilt: ${TEXT}`]]);
    // An empty tab with the name isn't the bot's either
    const ss2 = sheetOf(w);
    const blank = ss2.insertSheet(TAB);
    eq([w.bot.isHeadStartTab_(blank), w.bot.refreshHeadStart_(ss2, { now: NOW, alerts: rows }).blocked, blank.rows, blank.protections.length], [false, true, [], 0]);
    // Renamed: the bot makes its own tab beside it, and the note goes
    theirs.setName('My head start notes');
    eq([w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows }).written, tabOf(ss).cell(1, 1), JSON.stringify(theirs.rows), w.g.props.has('HEAD_START_BLOCKED'),
      w.bot.headStartBlockedNote_()], [true, TITLE, kept, false, '']);
    // The bot's own tab with its A1 changed is no longer known as the bot's: left as it is, too
    tabOf(ss).getRange(1, 1).setValue('Edited title');
    const edited = JSON.stringify(tabOf(ss).rows);
    eq([w.bot.refreshHeadStart_(ss, { now: NOW + HOUR, alerts: rows }).blocked, JSON.stringify(tabOf(ss).rows)], [true, edited]);
  });

  test('head start: a "Head start" tab the bot didn\'t make shows where people look, the Control tab\'s Status (B5), as the Results tab\'s does: from the run after the rebuild that found it in the way, Status says the tab isn\'t being updated and what to do (after the Results tab\'s note when both are in the way); once the tab is renamed and a rebuild has run, the note is gone and the bot\'s own tab is there. In the main status and in the standalone Auto-correct space\'s', () => {
    const NOTE = '⚠️ The Head start tab isn\'t being updated: a tab named "Head start" that the bot didn\'t make is in the way (or its title in A1 ' +
      'was changed). Rename that tab, and the bot makes its own.';
    const RESULTS_NOTE = '⚠️ The Results tab isn\'t being updated: a tab named "Results" that the bot didn\'t make is in the way (or its title in A1 ' +
      'and its alerts table were both changed). Rename that tab, and the bot makes its own.';
    const OK = '✅ Working';
    const rows = [own('QA-901', NOW - DAY, 1, WATCH), burson('QA-902', NOW - 20 * HOUR, 1)];  // an own alert on the log
    // The every-minute run in the standalone Auto-correct space: row 32 OFF, B9 (Mirror) blank, B10 set, B4 blank, B25
    // the live Burson space, read only
    const standalone = () => {
      const t = pollWorld(rows);
      t.chat.addSpace('spaces/AAQAautocorrect1', 'SLRR Unified Auto-correct');
      t.set('B25', REAL);
      t.set('B3', 'https://chat.google.com/app/chat/AAQAautocorrect1');
      t.set('B4', '');
      t.set('B9', '');
      t.set('B10', 'SLRR Unified Auto-correct');
      return t;
    };
    [['the main status', () => pollWorld(rows), '✓ SLRR Test Feed (Burson Sim)'],
      ['the standalone Auto-correct space', standalone, '— not used (working in Auto-correct space, B10)']].forEach(([where, make, c3]) => {
      const t = make();
      const before = t.control().rows.slice(0, B.ev('CONTROL_HELP_ROW_') - 1).map(x => x[0]);  // every row's label above "How it works"
      const theirs = t.sheet().insertSheet(TAB);
      theirs.getRange(1, 1, 2, 2).setValues([['Head start: my own notes', 'Owner'], ['keep', 'this']]);
      const kept = JSON.stringify(theirs.rows);
      const tabs = () => t.sheet().getSheets().filter(x => x.getName() === TAB).length;
      // The first run's rebuild (at the end of the run, after Status was written) finds the tab in the way
      t.poll();
      eq([t.get('B5'), t.get('C3'), t.g.props.get('HEAD_START_BLOCKED'), JSON.stringify(theirs.rows)], [OK, c3, 'true', kept], where);
      // From the next run on, Status says so
      t.poll();
      eq([t.get('B5'), JSON.stringify(theirs.rows), theirs.protections.length, tabs()], [NOTE, kept, 0, 1], where);
      // The Results tab's note comes first when a "Results" tab is in the way too
      t.g.props.set('RESULTS_BLOCKED', 'true');
      t.poll();
      eq(t.get('B5'), RESULTS_NOTE, where);
      t.g.props.delete('RESULTS_BLOCKED');
      t.poll();
      eq(t.get('B5'), NOTE, where);
      // Renamed. The note stays until a rebuild has run: the tab is rebuilt ten minutes after its last try
      theirs.setName('My head start notes');
      t.poll();
      eq([t.get('B5'), made(t)], [NOTE, false], where);
      t.g.clock.now += 10 * MIN;
      t.poll();  // this run's rebuild makes the bot's own tab
      eq([made(t) && tabOf(t.sheet()).cell(1, 1), t.g.props.has('HEAD_START_BLOCKED'), JSON.stringify(theirs.rows),
        table(tabOf(t.sheet()), 'EVERY STORY').map(x => [x['App alert'], x['Matched on'], x['Head start over Burson']])],
      [TITLE, false, kept, [['QA-901', 'same post', '4 h']]], where);
      t.poll();
      eq([t.get('B5'), tabs()], [OK, 1], where);
      // no Control row was added, moved or renamed for it
      eq(t.control().rows.slice(0, B.ev('CONTROL_HELP_ROW_') - 1).map(x => x[0]), before, where);
    });
  });

  test('head start: the Control tab\'s "How it works" says the tab exists: one line right after the Results tab\'s, in plain words (this app\'s own alerts next to Burson\'s alert on the same story and the IMs\' email: who alerted first and by how much; it appears once this app has an alert of its own); no Control row above the help moves', () => {
    const help = B.ev('CONTROL_HELP_');
    const i = help.findIndex(l => /^• The Results tab shows what the bot is doing/.test(l));
    eq(help[i + 1], '• The Head start tab shows this app\'s own alerts (Early Detection cards and early signals, Watch alerts, Direct BigQuery alerts) ' +
      'next to Burson\'s alert on the same story and the IMs\' email: who alerted first, and by how much. It appears once this app has an alert ' +
      'of its own, and updates every 10 minutes at most.');
    assert.match(help[i + 2], /^• The Follow-up tab /);
    // two help lines name the tab now: its own, and row 56's ("Speed numbers: leave out when the bot was not running",
    // RunLog.gs), which says that switch adds numbers to it; only its own says the tab exists (it was the only one)
    const row56 = l => l.startsWith('• Speed numbers: leave out when the bot was not running: ');
    eq([help.filter(l => /Head start/.test(l)).length, help.filter(l => /Head start/.test(l) && !row56(l)).length, i > 0], [2, 1, true]);
    // On the tab setup() makes: "How it works" is where it was (row 57, under the blank row 56), every line is under it in
    // order, and the rows kept for the help hold its title and every line
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    const ROW = B.ev('CONTROL_HELP_ROW_');
    eq([ROW, sh.cell(ROW - 9, 1), sh.cell(ROW - 8, 1), sh.cell(ROW - 7, 1), sh.cell(ROW - 6, 1), sh.cell(ROW - 5, 1), sh.cell(ROW - 4, 1),
      sh.cell(ROW - 3, 1), sh.cell(ROW - 2, 1), sh.cell(ROW - 1, 1), sh.cell(ROW, 1)],
      [57, 'Early Detection: also read the AMIE table', 'Early Detection: also read Brandwatch live (not X)', 'Proactive watch: also read the AMIE table', 'Open engine: judgment in place of caps', '', '',
        'Live dashboard', 'Slide deliveries', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is a switch now (it was blank)
    eq(help.map((_, k) => sh.cell(ROW + 1 + k, 1)), help);
    eq([sh.cell(ROW + 1 + i, 1), sh.cell(ROW + 2 + i, 1), sh.rows.length, B.ev('CONTROL_HELP_ROWS_') >= help.length + 1],
      [help[i], help[i + 1], ROW + help.length, true]);
    // the tab has no row or switch of its own: the only places the Control tab names it are that line and row 56's help
    // line (that switch adds numbers to it; it was that line alone)
    eq(sh.rows.map((x, k) => (x.some(v => /head start/i.test(String(v))) ? k + 1 : 0)).filter(Boolean),
      [ROW + 2 + i, ROW + 1 + help.findIndex(row56)]);
    assert.ok(!B.ev('CONTROL_SWITCHES_').some(x => /head ?start/i.test(`${x.key} ${x.label}`)));
  });

  test('head start: formula-safe text and the cell cap: an issue name that starts with "=" (or a product, tag or alert id that starts with = + - @) is never read as a formula, the only formulas are the quoted links, and every cell stays at or under 49,000 characters', () => {
    const T = NOW - DAY;
    const HUGE = 'A'.repeat(60000);
    const rows = [
      own('QA-1', T, 1, WATCH, { issue_name: '=SUM(1,2)', product: '+cmd|\' /C calc\'!A0', exposure_tag: '@tag' }),
      burson('=1+1', T + HOUR, 1),
      own('QA-3', T + HOUR, 3, WATCH, { issue_name: '=HYPERLINK("https://evil.test","x")&"', post_url: '' }),          // no link: text
      own('QA-4', T + 2 * HOUR, 4, WATCH, { issue_name: 'He said "hello", then =1+1', post_url: 'https://x.com/a"b/status/70004' }),
      own('QA-5', T + 3 * HOUR, 5, WATCH, { issue_name: `${HUGE} end`, product: HUGE, exposure_tag: HUGE }),
      own('-QA-6', T + 4 * HOUR, 6, WATCH, { issue_name: '-minus', post_url: `https://x.com/a/status/70006?${HUGE}` }),  // a link too long to link
      own('QA-7', T + 5 * HOUR, 7, WATCH, { issue_name: '   spread\nover\tlines  ', post_url: 'https://x.com/a b/status/1' }),  // a broken link
      card('QA-8', T + 6 * HOUR, 8, { story_title: `=${HUGE}` }, { issue_name: '' }),
    ];
    const r = report(rows);
    const cells = B.headStartTabRows_(r).rows;
    const all = [].concat.apply([], cells);
    eq(Math.max.apply(null, all.map(v => String(v).length)) <= 49000, true);
    assert.ok(Math.max.apply(null, all.map(v => String(v).length)) < 2000, 'a name is cut to a line, not to a cell');
    // every cell that starts like a formula is one of the bot's quoted links, whole: a name can't close the quote
    const LINK = /^=HYPERLINK\("https?:\/\/(?:[^"]|"")*","(?:[^"]|"")*"\)$/;
    const formulas = all.filter(v => typeof v === 'string' && /^[=+\-@]/.test(v));
    eq([formulas.length, formulas.filter(v => !LINK.test(v))], [9, []]);
    const story = id => cells.filter(x => String(x[10]).replace(/^'/, '') === id).pop();
    eq([story('QA-1')[2], story('QA-1')[3], story('QA-1')[4], story('QA-1')[11], story('QA-1')[HEADER.indexOf('Burson alert on this post')]],
      [`=HYPERLINK("${link(1)}","=SUM(1,2)")`, '\'+cmd|\' /C calc\'!A0', '\'@tag', `=HYPERLINK("${link(1)}","=1+1")`, `=HYPERLINK("${link(1)}","=1+1")`]);
    eq([story('QA-3')[2], story('QA-4')[2], story('-QA-6')[2], story('-QA-6')[10], story('QA-7')[2]],
      ['\'=HYPERLINK("https://evil.test","x")&" (no link)', '=HYPERLINK("https://x.com/a""b/status/70004","He said ""hello"", then =1+1")',
        '\'-minus (no link)', '\'-QA-6', 'spread over lines (no link)']);
    assert.match(story('QA-5')[2], /^=HYPERLINK\("https:\/\/x\.com\/user5\/status\/70005","A{199}…"\)$/);
    assert.match(story('QA-8')[2], /^=HYPERLINK\("https:\/\/x\.com\/user8\/status\/70008","=A{198}…"\)$/);
    eq([story('QA-5')[3].length, story('QA-5')[4].length], [200, 200]);
    // written: the same cells, every one at or under 49,000 characters
    const w = world();
    const ss = sheetOf(w);
    w.bot.refreshHeadStart_(ss, { now: NOW, alerts: rows });
    const tab = tabOf(ss);
    tab.rows.forEach((x, i) => x.forEach((v, j) => assert.ok(String(v).length <= 49000, `row ${i + 1} column ${j + 1}`)));
    eq(tab.rows.length, cells.length);
    eq(B.ev('SHEET_CELL_MAX_CHARS_'), 49000);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // The rebuild: when, and that it never gets in the way
  // ---------------------------------------------------------------------------------------------------------------

  test('head start: a rebuild never throws on broken rows: rows that are not rows, broken cells and missing columns are left out or read as blank, and the every-minute rebuild logs a failure and carries on', () => {
    const good = [own('QA-1', NOW - 2 * HOUR, 1, WATCH), burson('QA-2', NOW - HOUR, 1)];
    const broken = [
      null, undefined, 5, 'a row?', [], {}, [1, 2, 3], true,
      { ingested: ED }, { ingested: ED, source_at: 'soon', created_at: null }, { ingested: WATCH, source_at: NOW, forwarded_fields: 'not JSON' },
      { ingested: ED, source_at: NOW - HOUR, forwarded_fields: [1, 2], record_key: 12345, alert_id: { a: 1 } },
      { ingested: ED, source_at: NOW - HOUR, forwarded_fields: { early_detection: 'card', issue_name: { a: 1 }, exposure_tag: ['x'], product: 7 } },
      { ingested: ED, source_at: NOW - HOUR, forwarded_fields: { early_detection: { post_keys: 'x.com/status/1', update_of: { id: 1 }, story_title: 9 } } },
      { ingested: ED, source_at: NOW - HOUR, forwarded_fields: { early_detection: { post_keys: [null, 5, {}, key(1), ''], update_of: 'QA-404', signal_type: 3 } } },
      { ingested: DIRECT.BMIE, source_at: NOW - HOUR, email_input: 'x', forwarded_fields: null, space: 5 },
      { ingested: '', record_key: key(2), source_at: NOW - HOUR, space: null, forwarded_fields: 'x' },
      { ingested: null, record_key: { k: 1 }, source_at: NOW - HOUR, forwarded_fields: { issue_name: 5, issue_status: {}, post_url: [] } },
      { ingested: 0, record_key: key(3), source_at: 'x' }, { ingested: [], record_key: key(4), source_at: NOW },
      Object.assign(Object.create(null), { ingested: WATCH, source_at: NOW - HOUR }),
    ];
    let r;
    assert.doesNotThrow(() => { r = B.headStartReport_(good.concat(broken), { [postKey(1)]: 'soon', x: null }, NOW); });
    eq(brief(r.stories.find(s => s.alert_id === 'QA-1')), ['QA-1', 'Watch', 'same post', 'QA-2', 60]);
    // an IM time that isn't a time is no IM time
    for (const bad of ['soon', null, {}, { at: 0 }, { at: 'x', from: 'email' }, { at: -5 }, [], { at: 1e20, from: 'email' }, { at: 'Infinity' },
      { at: NaN }, { at: Infinity }, { at: 8.64e15 }, { at: true }]) {
      let s;
      assert.doesNotThrow(() => { s = B.headStartReport_(good, { [postKey(1)]: bad }, NOW).stories[0]; }, JSON.stringify(bad));
      eq([s.im, s.im_key, s.im_lead_ms], [null, '', null], JSON.stringify(bad));
    }
    eq(B.headStartImTimes_([{ key: 'a', im_email_at: 1e20 }, { key: 'b', im_draft: { at: 'Infinity' } }, { key: 'c', im_email_at: -5 },
      { key: 'd', im_draft: { at: NaN } }, { key: 'e', im_draft: { at: NOW } }]), { e: { at: NOW, from: 'draft' } });
    assert.doesNotThrow(() => B.headStartTabRows_(r));

    // A time that is not a real date (a number past the last date there is, the text "Infinity", NaN, a negative number
    // and the like) is no time. Such a row of this app's is left out, or timed by its created_at when that is a date;
    // such a row of Burson's doesn't count; and the tab's cells are still made (a time that is no date stops the writer)
    const NOT_TIMES = [1e20, 8.64e15, 'Infinity', NaN, -NOW, Infinity, '-1', 'soon', true, [NOW], {}];
    eq(NOT_TIMES.concat([NOW, String(NOW), 1, 8.64e15 - 1]).map(B.headStartTime_), NOT_TIMES.map(() => 0).concat([NOW, NOW, 1, 8.64e15 - 1]));
    const untimed = [].concat.apply([], NOT_TIMES.map((bad, i) => [
      own(`QA-T${i}`, bad, 30 + i, WATCH, null, { created_at: bad }),             // this app's, with no time at all: left out
      own(`QA-C${i}`, bad, 50 + i, WATCH, null, { created_at: NOW - 3 * HOUR }),  // this app's: timed by its created_at
      burson(`QA-B${i}`, bad, 50 + i),                                            // Burson's only row on that post: it doesn't count
      burson(`QA-D${i}`, bad, 1),                                                 // and one more on the good story's post
    ]));
    let timed;
    assert.doesNotThrow(() => { timed = B.headStartReport_(good.concat(untimed), { [postKey(1)]: { at: NOW, from: 'email' } }, NOW); });
    eq(timed.stories.map(x => [x.alert_id, x.at, x.matched, x.burson ? x.burson.alert_id : null, x.lead_ms]),
      [['QA-1', NOW - 2 * HOUR, 'same post', 'QA-2', HOUR]].concat(NOT_TIMES.map((bad, i) => [`QA-C${i}`, NOW - 3 * HOUR, '', null, null])
        .sort((x, y) => (x[0] < y[0] ? -1 : 1))));
    eq(Array.from(B.headStartBurson_(good.concat(untimed)).values()).map(g => [g.key, g.at, g.rows.map(x => x.id)]), [[key(1), NOW - HOUR, ['QA-2']]]);
    eq([timed.windows.week.stories, timed.windows.week.matched, timed.windows.week.burson_alerts], [NOT_TIMES.length + 1, 1, 1]);
    let cells;
    assert.doesNotThrow(() => { cells = B.headStartTabRows_(timed).rows; });
    eq(cells.filter(c => /^QA-C\d+$/.test(String(c[10]))).map(c => [c[1], c[5], c[6]]), NOT_TIMES.map(() => [B.speedTime_(NOW - 3 * HOUR), '', '']));
    for (const args of [[null, null, NOW], [undefined, undefined, undefined], ['rows', 'im', 'now'], [{}, [], NaN], [[null], new Map(), -1]]) {
      assert.doesNotThrow(() => B.headStartTabRows_(B.headStartReport_.apply(null, args)), JSON.stringify(args));
    }
    eq(B.headStartReport_(null, null, NOW).stories, []);

    // Through the sheet: an Alert log with a broken row, cells that aren't JSON and a missing column
    const w = world();
    const ss = sheetOf(w);
    const log = ss.insertSheet('Alert log');
    const cols = ['alert_id', 'created_at', 'space', 'record_key', 'forwarded_fields', 'source_at', 'ingested'];
    log.getRange(1, 1, 9, cols.length).setValues([cols,
      ['QA-1', NOW - 2 * HOUR, MAIN, key(1), JSON.stringify({ post_url: link(1), issue_name: 'Issue 1' }), NOW - 2 * HOUR, WATCH],
      ['QA-2', NOW - HOUR, MAIN, key(1), '{not json', NOW - HOUR, ''],
      ['', 'yesterday', '', '', '[]', '', ED],
      ['QA-4', NOW - 30 * MIN, MAIN, key(4), '"text"', 'x', ED],
      // times that are no real dates: this app's row is timed by its created_at, or left out; Burson's doesn't count
      ['QA-5', NOW - 20 * MIN, MAIN, key(5), JSON.stringify({ post_url: link(5) }), 1e20, WATCH],
      ['QA-6', NOW - 19 * MIN, MAIN, key(5), JSON.stringify({ post_url: link(5) }), 'Infinity', ''],
      ['QA-7', 1e20, MAIN, key(7), JSON.stringify({ post_url: link(7) }), -5, WATCH],
      ['QA-8', NOW - 17 * MIN, MAIN, key(1), JSON.stringify({ post_url: link(1) }), 1e20, '']]);
    const run = book => w.bot.maybeRefreshHeadStart_(book, w.ctx(), { deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now });
    let made;
    assert.doesNotThrow(() => { made = run(ss); });
    eq([made, table(tabOf(ss), 'EVERY STORY').map(x => [x['App alert'], x['Matched on'], x['Head start over Burson']]), log.rows[0]],
      [true, [['QA-5', '', ''], ['QA-4', '', ''], ['QA-1', 'same post', '1 h']], cols]);  // the Alert log's header is as it was: nothing added
    assert.ok(!w.g.logs.some(l => /Head start/.test(l)), 'the rebuild worked: nothing in the log');
    // Sheets failing: logged, false, the run carries on (never thrown into poll())
    const down = { getSheetByName() { throw new Error('Sheets is down'); } };
    w.g.clock.now += 30 * MIN;
    let res;
    assert.doesNotThrow(() => { res = run(down); });
    eq([res, w.g.logs.slice(-1)], [false, ['ERROR Head start tab not refreshed: Sheets is down']]);
    assert.doesNotThrow(() => { res = [w.bot.maybeRefreshHeadStart_(null, w.ctx(), {}), w.bot.maybeRefreshHeadStart_(ss, null, null)]; });
    eq(res[0], false);
    // No Alert log yet: nothing is made, the Alert log least of all
    const bare = sheetOf(w);
    w.g.props.delete('HEAD_START_AT');
    eq([run(bare), bare.getSheets().map(s => s.getName())], [false, ['Sheet1']]);
  });

  test('head start: rebuilt at most every 10 minutes, in a run where the Results tab was rebuilt (10 more minutes without one and it goes with the IMs\' times it remembers; at once when the Results tab is off), and skipped when less than 30 seconds of the run are left', () => {
    const w = world();
    const ss = sheetOf(w);
    const store = w.bot.sheetBackend_(ss);
    const T = NOW - 2 * DAY;
    const rows = [own('QA-1', T, 1, WATCH), burson('QA-2', T + 2 * HOUR, 1)];
    rows.forEach(x => store.appendAlert(x));
    const props = w.g.services.PropertiesService.getScriptProperties();
    const flows = { main: { partition: MAIN, label: 'Mirror space', live: false }, ac: null };
    const drafts = () => [{ post_url: link(1), at: T + 150 * MIN, subject: '⭐ SOCIAL ALERT ⭐: Search | Issue 1 | X | 900 Engagements', drafted_by: 'im1@ops.test' }];
    const results = () => w.bot.refreshSpeed_(ss, w.ctx(), { alerts: rows, drafts, logged: () => [], flows });
    const run = (left, ctx) => w.bot.maybeRefreshHeadStart_(ss, ctx || w.ctx(), { deadline: w.g.clock.now + (left === undefined ? 4 * MIN : left),
      runStart: w.g.clock.now });
    const rebuilt = () => tabOf(ss).cell(2, 1).match(/Rebuilt (.*) ET\.$/)[1];
    const im = () => table(tabOf(ss), 'EVERY STORY')[0]['IMs emailed (ET)'];
    const START = w.g.clock.now;

    eq([run(), rebuilt(), im(), Number(props.getProperty('HEAD_START_AT'))], [true, B.speedTime_(START), '', START]);  // the first time: at once
    w.g.clock.now += 9 * MIN;
    results();
    eq([run(), rebuilt()], [false, B.speedTime_(START)]);                       // under 10 minutes, even with a Results rebuild
    w.g.clock.now += MIN;
    eq(run(), false);                                                             // 10 minutes on, no Results rebuild in this run: it waits for one
    w.g.clock.now += 2 * MIN;
    results();
    eq([run(20 * 1000), run(29999)], [false, false]);                             // under 30 seconds of the run left: skipped
    eq([run(30 * 1000), rebuilt(), im()], [true, B.speedTime_(START + 12 * MIN), B.speedTime_(T + 150 * MIN)]);
    eq(run(), false);                                                             // once
    w.g.clock.now += 19 * MIN;
    eq(run(), false);                                                             // 19 minutes on and still no Results rebuild: it waits
    w.g.clock.now += MIN;
    // 20 minutes on: rebuilt without a Results rebuild, with the IMs' time the tab remembers
    eq([run(), rebuilt(), im()], [true, B.speedTime_(START + 32 * MIN), B.speedTime_(T + 150 * MIN)]);
    // The Results tab off in the settings: there's no rebuild of it to wait for
    const off = w.ctx();
    off.settings = Object.assign({}, off.settings, { speed_tab: false });
    w.g.clock.now += 9 * MIN;
    eq(run(undefined, off), false);
    w.g.clock.now += MIN;
    eq([run(undefined, off), rebuilt()], [true, B.speedTime_(START + 42 * MIN)]);
    // Without a deadline (an older caller): the context's own
    w.g.clock.now += 10 * MIN;
    const late = Object.assign(off, { deadline: w.g.clock.now + 10 * 1000 });
    eq([w.bot.maybeRefreshHeadStart_(ss, late), w.bot.maybeRefreshHeadStart_(ss, Object.assign(late, { deadline: w.g.clock.now + MIN }))], [false, true]);
    // refreshHeadStart() (from the editor) rebuilds it now, keeps the IMs' time the tab remembers (it has no Results
    // rebuild of its own), and leaves the tab due again, for the next run that has the IMs' times
    w.g.props.set('STORE_SHEET_ID', ss.getId());
    w.g.clock.now += MIN;
    const numbers = w.bot.refreshHeadStart();
    eq([numbers.month.stories, numbers.month.first, numbers.month.im_known, rebuilt(), im(), Number(props.getProperty('HEAD_START_AT'))],
      [1, 1, 1, B.speedTime_(w.g.clock.now), B.speedTime_(T + 150 * MIN), w.g.clock.now - 10 * MIN]);
    results();
    eq([run(), im()], [true, B.speedTime_(T + 150 * MIN)]);
  });

  test('head start: never rebuilt in a run that is still catching up on alerts (a flow held an alert for the next run, handled as many messages as a run may, or ran out of time): nothing is read or noted and the tab stays due, and it is rebuilt in the first run that has caught up; through poll(), the runs of a burst leave the tab alone, and so does a run whose auto-correct or Other alerts flow is catching up', () => {
    const rows = [own('QA-1', NOW - 2 * HOUR, 1, WATCH), burson('QA-2', NOW - HOUR, 1)];
    const w = world();
    const ss = sheetOf(w);
    const store = w.bot.sheetBackend_(ss);
    rows.forEach(x => store.appendAlert(x));
    const opts = flows => ({ deadline: w.g.clock.now + 4 * MIN, runStart: w.g.clock.now, flows });
    // a sheet that says so when it is touched: a run that is catching up reads nothing, notes nothing and logs nothing
    const guard = { getSheetByName() { throw new Error('the sheet was read'); }, getSheets() { throw new Error('the sheet was read'); } };
    const quiet = (ctx, flows) => {
      const logged = w.g.logs.length;
      return [w.bot.maybeRefreshHeadStart_(guard, ctx, opts(flows)), w.g.logs.length - logged, w.g.props.has('HEAD_START_AT'), made({ sheet: () => ss })];
    };
    const idle = () => w.ctx();
    const most = idle().settings.max_messages_per_run;
    const TIME = 'time budget reached; the rest is handled next run';  // what a flow that ran out of time reports (Bot.gs runOnce_)
    eq(quiet(Object.assign(idle(), { slaBusy: true })), [false, 0, false, false]);                      // the run's own flow
    eq(quiet(idle(), [Object.assign(idle(), { slaBusy: true })]), [false, 0, false, false]);            // a flow's ctx
    eq(quiet(idle(), [null, { ctx: Object.assign(idle(), { slaBusy: true }), report: { errors: [] } }]), [false, 0, false, false]);
    eq(quiet(idle(), [idle(), { ctx: idle(), report: { held: 1, errors: [] } }]), [false, 0, false, false]);
    eq(quiet(idle(), [{ ctx: idle(), report: { handled: most, errors: [] } }]), [false, 0, false, false]);
    eq(quiet(idle(), [{ ctx: idle(), report: { handled: 1, errors: ['a request failed', TIME] } }]), [false, 0, false, false]);
    eq([null, {}, { slaBusy: false }, { slaBusy: true }, 'ctx', 5].map(c => B.headStartRunBusy_(c)), [false, false, false, true, false, false]);
    eq([undefined, 'flows', [], [null, undefined, 5, 'x', [], true], [{}], [{ ctx: {}, report: {} }], [{ ctx: 'x', report: 'y' }],
      [{ ctx: { settings: { max_messages_per_run: 5 } }, report: { handled: 4, held: 0, errors: ['Chat is down', `not a ${TIME}`] } }],
      [{ ctx: { settings: {} }, report: { handled: 0 } }], [{ report: { held: 1 } }], [{}, { ctx: { slaBusy: 1 } }],
      [{ ctx: { settings: { max_messages_per_run: 5 } }, report: { handled: 5 } }], [{ report: { errors: [TIME] } }],
    ].map(flows => B.headStartRunBusy_({}, flows)), [false, false, false, false, false, false, false, false, false, true, true, true, true]);
    // A run that has caught up (its flows held nothing, and what failed in it isn't waiting alerts): rebuilt at once
    eq([w.bot.maybeRefreshHeadStart_(ss, idle(), opts([idle(), null, { ctx: idle(), report: { held: 0, handled: most - 1, errors: ['a request failed'] } }])),
      table(tabOf(ss), 'EVERY STORY').map(x => x['App alert']), Number(w.g.props.get('HEAD_START_AT'))], [true, ['QA-1'], w.g.clock.now]);
    // ... and when it is due again in a run that is catching up, it stays due: the first run that has caught up rebuilds it
    w.g.clock.now += 30 * MIN;
    const rebuilt = () => tabOf(ss).cell(2, 1).match(/Rebuilt (.*) ET\.$/)[1];
    const was = [rebuilt(), w.g.props.get('HEAD_START_AT')];
    eq([w.bot.maybeRefreshHeadStart_(ss, Object.assign(idle(), { slaBusy: true }), opts()), rebuilt(), w.g.props.get('HEAD_START_AT')], [false].concat(was));
    w.g.clock.now += MIN;
    eq([w.bot.maybeRefreshHeadStart_(ss, idle(), opts()), rebuilt()], [true, B.speedTime_(w.g.clock.now)]);

    // Through poll(): a burst. A run handles one message here, and three of Burson's alerts are waiting: each of the
    // three runs that handle one is still catching up (more may be waiting), and none of them rebuilds the tab
    const t = pollWorld(rows);
    t.bot.ev('GEN.settings.max_messages_per_run = 1');
    const calls = [];  // each time poll() got to the rebuild: [the run was catching up, the tab was rebuilt]
    const rebuild = t.bot.maybeRefreshHeadStart_;
    t.bot.maybeRefreshHeadStart_ = function (book, ctx) {
      const out = rebuild.apply(this, arguments);
      calls.push([!!ctx.slaBusy, out]);
      return out;
    };
    [F.P0_OK, F.AIO, F.MAPS].forEach(text => t.chat.say(TEST_FEED, text, ZAPIER));
    const handled = () => t.sheet().getSheetByName('Alert log').rows.length - 1 - rows.length;
    const poll = x => { x.poll(); return [made(x), x.g.props.has('HEAD_START_AT')]; };
    eq([poll(t), handled(), poll(t), handled(), poll(t), handled()], [[false, false], 1, [false, false], 2, [false, false], 3]);
    eq([poll(t), handled(), calls], [[true, true], 3, [[true, false], [true, false], [true, false], [false, true]]]);
    eq(table(tabOf(t.sheet()), 'EVERY STORY').map(x => [x['App alert'], x['Matched on']]), [['QA-1', 'same post']]);

    // The other flows of a run count too. What the Other alerts space's run left (an alert held for the next run), then
    // the auto-correct space's (it marked itself busy): no rebuild; a run where every flow has caught up rebuilds it
    const u = pollWorld(rows);
    u.bot.runOtherSpace_ = () => ({ ctx: {}, report: { held: 1, errors: [] } });
    eq(poll(u), [false, false]);
    u.bot.runOtherSpace_ = () => null;
    u.bot.runAutoCorrect_ = () => ({ ctx: { slaBusy: true }, report: { errors: [] } });
    eq(poll(u), [false, false]);
    u.bot.runAutoCorrect_ = () => ({ ctx: { slaBusy: false }, report: { held: 0, errors: [] } });
    eq(poll(u), [true, true]);
  });

  test('head start: the Alert log is only read (never made, its header never touched), back as far as the stories need and no further', () => {
    const w = world();
    const ss = sheetOf(w);
    eq([w.bot.headStartAlertRows_(ss, NOW - DAY), ss.getSheets().map(s => s.getName())], [[], ['Sheet1']]);  // no Alert log: none is made
    const log = ss.insertSheet('Alert log');
    const cols = ['alert_id', 'created_at', 'record_key', 'forwarded_fields', 'source_at', 'ingested', 'my own column'];
    const line = (n, madeAt) => [`QA-${n}`, madeAt, key(n), JSON.stringify({ post_url: link(n) }), madeAt, WATCH, 'note'];
    log.getRange(1, 1, 7, cols.length).setValues([cols, line(1, NOW - 50 * DAY), line(2, NOW - 45 * DAY), line(3, NOW - 40 * DAY),
      line(4, NOW - 60 * DAY), line(5, NOW - DAY), line(6, '')]);
    const before = JSON.stringify(log.rows);
    const read = since => w.bot.headStartAlertRows_(ss, since).map(x => x.alert_id);
    // from the first row made since then to the end (a row out of order, or without a time, in between is read too)
    eq([read(NOW - 44 * DAY), read(NOW - 2 * DAY), read(NOW - 100 * DAY), read(NOW)], [['QA-3', 'QA-4', 'QA-5', 'QA-6'], ['QA-5', 'QA-6'],
      ['QA-1', 'QA-2', 'QA-3', 'QA-4', 'QA-5', 'QA-6'], []]);
    eq(w.bot.headStartAlertRows_(ss, NOW - 2 * DAY)[0].forwarded_fields, { post_url: link(5) });
    eq([JSON.stringify(log.rows), log.protections.length, log.frozenRows], [before, 0, undefined]);
    // a rebuild reads the 30 days of stories and the 14 days before them
    w.bot.refreshHeadStart_(ss, { now: NOW });
    eq([table(tabOf(ss), 'EVERY STORY').map(x => x['App alert']), JSON.stringify(log.rows)], [['QA-5'], before]);
    // A tab named "Alert log" whose header has no alert_id column is not the Alert log: nothing is read from it, and
    // it is left as it is
    const other = w.g.services.SpreadsheetApp.create('other');
    const odd = other.insertSheet('Alert log');
    odd.getRange(1, 1, 3, 4).setValues([['created_at', 'record_key', 'ingested', 'source_at'], [NOW - HOUR, key(1), WATCH, NOW - HOUR],
      [NOW, key(2), WATCH, NOW]]);
    const oddBefore = JSON.stringify(odd.rows);
    eq([w.bot.headStartAlertRows_(other, NOW - DAY), w.bot.refreshHeadStart_(other, { now: NOW }).written, JSON.stringify(odd.rows),
      other.getSheets().map(x => x.getName())], [[], false, oddBefore, ['Sheet1', 'Alert log']]);
  });

  test('head start: the read window, through the sheet: a rebuild reads the Alert log 44 days back (the 30 days of stories and the 14 days the same-story rule looks before them) and no further: Burson\'s alert 43 days old is matched with this app\'s story 29.5 days old, and a row of this app\'s 45 days old, above the window, is not read', () => {
    const w = world();
    const ss = sheetOf(w);
    const log = ss.insertSheet('Alert log');
    const NAME = 'Banking malware in Play Store apps';
    const cols = ['alert_id', 'created_at', 'space', 'record_key', 'forwarded_fields', 'source_at', 'ingested'];
    const entry = (id, when, n, ingested, fields) => [id, when, MAIN, key(n),
      JSON.stringify(Object.assign({ post_url: link(n), issue_name: NAME }, fields || {})), when, ingested];
    log.getRange(1, 1, 4, cols.length).setValues([cols,
      // this app's alert on post 7, 45 days ago: above the window. Were it read, it would be the first alert of the
      // story on post 7 below, and that story would be 45 days old: off the tab
      entry('QA-1', NOW - 45 * DAY, 7, WATCH),
      // Burson's alert on another post 43 days ago, under the name this app's later alert was taken for
      entry('QA-2', NOW - 43 * DAY, 2, '', { exposure_tag: 'Another tag' }),
      entry('QA-3', NOW - 29.5 * DAY, 7, WATCH, { issue_status: ONGOING }),
    ]);
    const before = JSON.stringify(log.rows);
    const out = w.bot.refreshHeadStart_(ss, { now: NOW });  // no `alerts`: the rows are read from the sheet
    eq(out.stories.map(x => [x.alert_id, x.alert_ids, x.at, x.matched, x.burson && x.burson.alert_id, x.lead_ms / DAY]),
      [['QA-3', ['QA-3'], NOW - 29.5 * DAY, 'same story', 'QA-2', -13.5]]);
    eq(table(tabOf(ss), 'EVERY STORY').map(x => [x['App alert'], x['This app alerted (ET)'], x['Matched on'], x['Burson alert'], x['Head start over Burson']]),
      [['QA-3', B.speedTime_(NOW - 29.5 * DAY), 'same story', `=HYPERLINK("${link(2)}","QA-2")`, 'behind by 13 d 12 h']]);
    eq([out.windows.month.stories, out.windows.month.behind, out.windows.month.unmatched, JSON.stringify(log.rows)], [1, 1, 0, before]);
    // what the rebuild read: from Burson's alert on, 44 days back
    eq(w.bot.headStartAlertRows_(ss, NOW - 44 * DAY).map(x => x.alert_id), ['QA-2', 'QA-3']);
    // a read of 30 days would miss Burson's alert (the story would have no Burson alert found), and a read that takes
    // the 45-day-old row in gives a story 45 days old, which is not on the tab
    const read = days => B.headStartReport_(w.bot.headStartAlertRows_(ss, NOW - days * DAY), null, NOW).stories.map(x => [x.alert_id, x.matched]);
    eq([read(30), read(44), read(46)], [[['QA-3', '']], [['QA-3', 'same story']], []]);
  });

  test('head start: nothing is posted or emailed: poll() rebuilds the tab at the end of a run and it changes nothing else (the same Chat posts, emails, drafts, requests, other tabs and log as a run with the rebuild taken out)', () => {
    const T = NOW - 2 * DAY;
    const rows = [
      card('QA-901', T, 1, { post_keys: [key(1), key(2)], story_title: 'A build-up' }, { issue_name: 'Banking malware in Play Store apps' }),
      burson('QA-902', T + 26 * HOUR, 2),
      own('QA-903', T + 3 * HOUR, 3, WATCH, null, { space: OTHERS }),
    ];
    const go = takenOut => {
      const t = e2e();
      t.bot.setup();
      t.set('B30', 'tester@testing.test');
      if (takenOut) t.bot.maybeRefreshHeadStart_ = () => false;
      const log = t.bot.sheetTable_(t.sheet(), 'Alert log', t.bot.ev('ALERT_COLUMNS_'), 'alert_id', 4000);
      rows.forEach(x => log.append(x));
      // three runs: the first makes the tab; five minutes on it is left alone; half an hour on it is rebuilt (here the
      // Results tab can't be rebuilt, BigQuery being out of reach, so it goes without the IMs' times)
      const rebuilt = [];
      const poll = () => {
        t.poll();
        const tab = tabOf(t.sheet());
        rebuilt.push(tab ? [B.speedTime_(t.g.clock.now), tab.cell(2, 1).match(/Rebuilt (.*) ET\.$/)[1]] : null);
      };
      t.chat.say(TEST_FEED, F.P0_OK, { sender: 'users/bot' });
      poll();
      t.g.clock.now += 4 * MIN;
      poll();
      t.g.clock.now += 25 * MIN;
      poll();
      const snap = JSON.stringify({
        chat: Array.from(t.chat.spaces.values()).map(s => [s.name, s.messages.map(m => [m.name, m.text, m.thread.name, m.reactions])]),
        sent: t.g.gmail.sentMessages(), drafts: t.g.gmail.allDrafts(), fetches: t.g.fetches.map(f => [f.method, f.url]),
        sheets: t.sheet().sheets.filter(sh => sh.name !== TAB).map(sh => [sh.name, sh.rows]),
        props: Array.from(t.g.props).filter(([k]) => k !== 'LAST_RUN' && !/^HEAD_START_/.test(k)), logs: t.g.logs,
      });
      return { t, snap, rebuilt };
    };
    const on = go(false);
    const without = go(true);
    assert.strictEqual(on.snap, without.snap);
    // the runs did their usual work beside it: Burson's alert reviewed (its row in the Alert log), its Social Alert sent to the tester
    eq([on.t.sheet().getSheetByName('Alert log').rows.length - 1, on.t.g.gmail.sentMessages().length], [rows.length + 1, 1]);
    const tab = tabOf(on.t.sheet());
    const names = on.t.sheet().sheets.map(s => s.name);
    eq([without.rebuilt, tabOf(without.t.sheet()), without.t.g.props.has('HEAD_START_AT')], [[null, null, null], null, false]);
    eq([on.rebuilt[0][0] === on.rebuilt[0][1], on.rebuilt[1][1], on.rebuilt[2][0] === on.rebuilt[2][1], on.rebuilt[2][1] !== on.rebuilt[0][1]],
      [true, on.rebuilt[0][1], true, true]);
    eq([tab.cell(1, 1), tab.protections[0].warningOnly, names.filter(n => n === TAB).length, names.indexOf(TAB) > names.indexOf('Alert log'),
      Number(on.t.g.props.get('HEAD_START_AT'))], [TITLE, true, 1, true, on.t.g.clock.now]);
    eq(table(tab, 'EVERY STORY').map(x => [x.Type, x['App alert'], x['Matched on'], x['Burson alert'], x['Head start over Burson'], x['IMs emailed (ET)']]),
      [['Watch', 'QA-903', '', '', '', ''], ['Early Detection', 'QA-901', 'same post', `=HYPERLINK("${link(2)}","QA-902")`, '1 d 2 h', '']]);
    assert.ok(!on.t.g.logs.some(l => /Head start/.test(l)), 'a rebuild that works says nothing in the log');
    // it has no switch and no row of its own on the Control tab: only "How it works" says it exists, in one line
    const HELP = B.ev('CONTROL_HELP_ROW_');
    const mentions = on.t.control().rows.map((x, i) => (x.some(v => /head start/i.test(String(v))) ? i + 1 : 0)).filter(Boolean);
    // (row 56's help line names the tab too, since that switch adds numbers to it: two mentions, both in "How it works")
    eq([mentions.length, mentions.every(r => r > HELP), on.t.control().cell(HELP, 1)], [2, true, 'How it works']);
    assert.ok(!B.ev('CONTROL_SWITCHES_').some(s => /head ?start/i.test(`${s.key} ${s.label}`)));
  });

  test('head start: poll() rebuilds the tab AFTER the Results tab, in the same run, which is where the IMs\' times come from: after ONE run the IMs\' email time and the end-to-end head start are on the tab, for the story whose Burson post the IMs emailed about', () => {
    const T = NOW - 2 * DAY;
    const rows = [
      // a card led by post 1 that also rests on post 2; Burson alerted post 2 a day and two hours later (a row of the
      // main flow, as the Results tab counts them), and the IMs drafted their Social Alert for it an hour after that
      card('QA-901', T, 1, { post_keys: [key(1), key(2)], story_title: 'A build-up' }, { issue_name: 'Banking malware in Play Store apps' }),
      burson('QA-902', T + 26 * HOUR, 2, null, { space: FLOW }),
      own('QA-903', T + 3 * HOUR, 3, WATCH),
    ];
    const drafts = [
      { post_url: link(2), at: T + 27 * HOUR, subject: '⭐ SOCIAL ALERT ⭐: Search | Issue 2 | X | 900 Engagements', drafted_by: 'im1@ops.test' },
      // about the card's own lead post, which Burson never alerted: not on the Results tab, and never the story's IM time
      { post_url: link(1), at: T + HOUR, subject: '⭐ SOCIAL ALERT ⭐: Search | Issue 1 | X | 900 Engagements', drafted_by: 'im2@ops.test' },
    ];
    const t = pollWorld(rows, drafts);
    const order = [];  // the report tabs' rebuilds of the run, in the order poll() made them
    ['maybeRefreshSpeed_', 'maybeRefreshHeadStart_'].forEach(name => {
      const real = t.bot[name];
      t.bot[name] = function () {
        const out = real.apply(this, arguments);
        order.push([name, out]);
        return out;
      };
    });
    eq([t.bot.ev('RESULTS_RUN_'), made(t)], [null, false]);
    t.poll();
    eq(order, [['maybeRefreshSpeed_', true], ['maybeRefreshHeadStart_', true]]);
    eq(t.bot.ev('RESULTS_RUN_.posts.map(p => [p.key, speedImAt_(p)])'), [[postKey(2), T + 27 * HOUR]]);
    const tab = tabOf(t.sheet());
    eq(table(tab, 'EVERY STORY').map(x => [x['App alert'], x['Matched on'], x['Burson alerted (ET)'], x['Head start over Burson'], x['IMs emailed (ET)'],
      x['Head start over the IMs'], x['Head start over the IMs (min)']]),
    [['QA-903', '', '', '', '', '', ''],
      ['QA-901', 'same post', B.speedTime_(T + 26 * HOUR), '1 d 2 h', B.speedTime_(T + 27 * HOUR), '1 d 3 h', 27 * 60]]);
    eq(line(tab, 'This app\'s alert before the IMs\' email (of the stories with an IM email time)'), ['1 of 1 (100%)', '1 of 1 (100%)']);
    eq(line(tab, 'Median time from this app\'s alert to the IMs\' email (the end-to-end head start)'), ['1 d 3 h', '1 d 3 h']);
    assert.match(tab.rows.map(x => String(x[0])).find(x => x.indexOf('Matched on:') === 0), /The IMs' time is their email for Burson's post, else their draft, as the Results tab has it \(their email for 0 of 1 in the last 30 days\)/);
    // the next minute's run leaves the tab as it is (it is rebuilt every 10 minutes at most)
    const was = JSON.stringify(tab.rows);
    t.poll();
    eq([order.slice(2).map(x => x[0] + ' ' + x[1]).filter(x => /HeadStart/.test(x)), JSON.stringify(tab.rows)], [['maybeRefreshHeadStart_ false'], was]);
    // Due again ten minutes after its rebuild, it waits for a run that rebuilds the Results tab: the Results rebuild of
    // the run a minute before (an alert had come in) is that run's, not this one's
    const run = () => { order.length = 0; t.poll(); return order.map(x => `${x[0]} ${x[1]}`); };  // one run: what it rebuilt
    t.g.clock.now += 7 * MIN;
    t.chat.say(TEST_FEED, F.P0_OK, ZAPIER);
    eq(run(), ['maybeRefreshSpeed_ true', 'maybeRefreshHeadStart_ false']);   // nine minutes after: not due yet
    eq(run(), ['maybeRefreshSpeed_ false', 'maybeRefreshHeadStart_ false']);  // ten minutes after: due, and no Results rebuild in this run
    eq(JSON.stringify(tab.rows), was);
    // ... and it is rebuilt in the next run that rebuilds the Results tab, with the IMs' time again
    t.g.clock.now += 8 * MIN;
    eq(run(), ['maybeRefreshSpeed_ true', 'maybeRefreshHeadStart_ true']);
    eq([tab.cell(2, 1).match(/Rebuilt (.*) ET\.$/)[1], table(tab, 'EVERY STORY').map(x => [x['App alert'], x['IMs emailed (ET)']])],
      [B.speedTime_(t.g.clock.now), [['QA-903', ''], ['QA-901', B.speedTime_(T + 27 * HOUR)]]]);
  });

  test('head start: poll() gives the rebuild the run\'s own deadline (when the run must be done: RUN_HARD_STOP_MS_ after it began, as the other report tabs get, not the main flow\'s earlier one): with under 30 seconds of the run left the tab is not rebuilt and stays due, with 30 seconds it is rebuilt', () => {
    const rows = [own('QA-901', NOW - DAY, 1, WATCH), burson('QA-902', NOW - 20 * HOUR, 1)];
    const t = pollWorld(rows);
    const HARD = B.ev('RUN_HARD_STOP_MS_');
    assert.ok(B.ev('RUN_BUDGET_MS_') + 60 * 1000 < HARD, 'the main flow\'s own deadline is long past by then');
    // The report tabs before it (the last of them the Analysis tab) take the run to `left` ms before it must be done
    let stop = 0;
    let left = 0;
    const analysis = t.bot.maybeRefreshAnalysis_;
    t.bot.maybeRefreshAnalysis_ = function () {
      const out = analysis.apply(this, arguments);
      t.g.clock.now = stop - left;
      return out;
    };
    const poll = ms => {
      left = ms;
      stop = t.g.clock.now + 60 * 1000 + HARD;  // t.poll() starts the run a minute on
      t.poll();
      return [t.g.clock.now === stop - ms, made(t), t.g.props.has('HEAD_START_AT')];
    };
    eq(poll(29999), [true, false, false]);
    eq(poll(1000), [true, false, false]);
    eq(poll(30 * 1000), [true, true, true]);
    eq(table(tabOf(t.sheet()), 'EVERY STORY').map(x => [x['App alert'], x['Matched on'], x['Head start over Burson']]), [['QA-901', 'same post', '4 h']]);
  });

  test('head start: poll() rebuilds the tab when it rebuilds the other report tabs: in a run that handled an alert, else only while background work may run (an idle run leaves it alone while the API guard is shedding background work)', () => {
    const rows = [own('QA-901', NOW - DAY, 1, WATCH), burson('QA-902', NOW - 20 * HOUR, 1)];
    const t = pollWorld(rows);
    const spike = () => {  // a spike of Gemini calls: background work waits until it has cooled (ApiGuard.gs)
      t.bot.apiGuardNote_('gemini', 30);
      return t.bot.apiGuardAllowBackground_('any', false);
    };
    eq(spike(), false);
    t.poll();  // an idle run
    eq([t.bot.apiGuardAllowBackground_('any', false), made(t), t.g.props.has('HEAD_START_AT')], [false, false, false]);
    // a run that handled one of Burson's alerts, the spike still on: rebuilt, with the other report tabs
    t.chat.say(TEST_FEED, F.P0_OK, ZAPIER);
    t.poll();
    eq([t.bot.apiGuardAllowBackground_('any', false), t.sheet().getSheetByName('Alert log').rows.length - 1 - rows.length, made(t)], [false, 1, true]);
    // and an idle run once the spike has cooled: rebuilt as soon as it is due
    const u = pollWorld(rows);
    eq(spike(), false);
    u.poll();
    eq([u.bot.apiGuardAllowBackground_('any', false), made(u)], [true, true]);
  });
};
