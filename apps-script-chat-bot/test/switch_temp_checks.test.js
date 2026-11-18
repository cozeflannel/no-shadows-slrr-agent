// Temp checks (Control tab row 36, TempCheck.gs): "temp check" and a Brandwatch query's name in a thread of the Mirror
// space (B9) or the Other alerts space (B33) gets the Brand Safety team's temperature check emailed, after the run's
// alerts, in the team's UPDATED STANDARD TEMPLATE (docs.docx): the title and BW source, the TL;DR (total mentions since
// the issue started, the concern level left in the template's words, velocity against the peak hour, Gemini's summary),
// sentiment with its negativity drivers and themes, the source breakdown and the three highest-engaging posts, times in
// PT; from the bot's account to the testers (B30, else the stand-in), the thread told it was sent; "refresh" emails the
// update on the same email thread. Brandwatch is only read (GETs), at most 35 posts a temp check (reposts excluded). A
// request is never relayed to S-F Burson, and nothing of it is posted anywhere but its own thread. OFF (as it starts):
// nothing changes.
'use strict';

module.exports = H => {
  const { test, eq, assert, B, F, e2e, REAL, makeGoogle } = H;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const MIRROR = 'spaces/AAQAmirror1';
  const MIRROR_NAME = 'SLRR Zapier Training Mirror';
  const COPY = 'spaces/AAQAtestcp1';
  const COPY_NAME = 'SLRR Burson Test Copy';
  const MID = 'spaces/AAQAmidterm1';
  const MID_NAME = 'Midterms 2026';
  const MID_LINK = 'https://chat.google.com/app/chat/AAQAmidterm1';
  const ZAP = { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' };
  const DANA = { sender: 'users/analyst9', displayName: 'Dana Lee', email: 'dana@' + ['google', 'com'].join('.') };
  const ALICE = { sender: 'users/burson7', displayName: 'Alice Smith', email: 'alice@agency.test' };
  const HEAD = '\uD83C\uDF21\uFE0F';  // 🌡️
  const QID = 2004162030;
  const QNAME = '[G EVENT] OCT26 2020 Election Query Results';
  const ASK = `temp check ${QNAME}`;
  // 6:05am PT (daylight time) on 10/29, the morning after the query spiked: 13:05 UTC
  const T0 = Date.UTC(2026, 9, 29, 13, 5);
  const HOUR0 = Date.UTC(2026, 9, 28, 13, 0);  // the first hour with mentions
  // Mentions by hour from 13:00 UTC on 10/28: the first 100+ hour is 17:00 UTC (10am PT); the peak 796 at 19:00 UTC
  // (12pm PT); 240 in the last full hour before 6:05am PT (12:00 UTC, 5am PT), 40 so far in the hour after
  const HOURLY = [21, 30, 45, 82, 332, 563, 796, 791, 600, 450, 400, 350, 300, 280, 260, 250, 240, 230, 220, 230, 240, 250, 260, 240, 40];
  const TOTAL = 7322;  // from 17:00 UTC 10/28 through 13:05 UTC 10/29
  const CAM = '2115509087928774881';
  const HQ = '2115507395010908471';
  const MANN = '2115494877882658975';
  const GONE = '2115509390040076427';  // X won't show it: left out
  const SWITCHES = B.ev('CONTROL_SWITCHES_');

  const posts = (t, space) => t.chat.botPosts(space);
  const tops = (t, space) => posts(t, space).filter(m => !m.threadReply);
  const temps = (t, space, thread) => posts(t, space).filter(m => m.text.indexOf(HEAD) === 0 && (!thread || m.thread.name === thread));
  const writesIn = (t, space) => t.chat.calls.filter(c => c.method !== 'get' && String(c.path).indexOf(space + '/') === 0);
  const queue = t => JSON.parse(t.g.props.get('TC_QUEUE') || '[]');
  const schemaOf = c => ((c.payload.generationConfig || {}).responseSchema || {}).properties || {};  // a Gemini call's fields
  const mails = t => t.g.gmail.sentMessages().filter(m => /^Temp Check: /.test(m.subject || ''));  // the temp check emails
  // The thread's note once one was emailed (Dana asked: she's mentioned)
  const SENT = (title, update) => `${HEAD} *Temp check${update ? ' update' : ''} sent:* <users/analyst9> ${title} was emailed ` +
    'to tester@testing.test. Reply "refresh" here for an update.';

  const xm = (guid, sentiment) => ({ pageType: 'twitter', guid, url: null, author: null, title: '', snippet: '', engagementScore: null,
    sentiment: sentiment || 'neutral' });
  const web = (pageType, guid, author, title, snippet, eng, url, sentiment) => ({ pageType, guid, author, title, snippet,
    engagementScore: eng, url, sentiment: sentiment || 'neutral' });
  const COURIER = web('instagram_public', 'DfDC_abjzrO', 'couriernewsroom', 'Who won the 2020 presidential election? Joe Biden.',
    'Who won the 2020 presidential election? Joe Biden.', 2494, 'https://www.instagram.com/p/DfDC_abjzrO/');
  const NUMB = web('bluesky', 'at://numb.comfortab.ly/3abc', 'numb.comfortab.ly', '', 'FRIEND (IN CANADA): What\'s the Gulf called, ' +
    'what\'s the lake called, who won in the US in 2020? GOOGLE: Mexico, Ontario, Biden.', 944, 'https://bsky.app/profile/numb.comfortab.ly/post/3abc');
  const REDDIT = web('reddit', 'reddit-t3-abc', 'ExactlySorta', 'Google won\'t allow its chatbot to directly answer who won the 2020 ' +
    'presidential election', '(but other elections are fine, apparently)', 859, 'https://www.reddit.com/r/technology/comments/abc/', 'negative');
  const embed = (id, handle, text, likes, replies) => ({ id_str: id, text, favorite_count: likes, conversation_count: replies,
    user: { screen_name: handle }, created_at: '2026-10-28T18:00:00.000Z' });
  const GEMINI = {
    summary: 'Posts share screenshots of Gemini declining to name the 2020 winner, and the conversation is slowing after reports of a fix.',
    negativity_drivers: 'Users accuse Google of bowing to political pressure and treating a settled election as contested.',
    themes: 'Others test the behavior themselves and share news coverage of the fix.',
  };

  /**
   * A fake Brandwatch (read-only API) over the fake Google: Secret Manager answers the shared token (or bw.secret: {code,
   * message}); the project's query summary (bw.queries), dashboards summary (bw.dashboards), one query, the hourly volume
   * (bw.hourly: {ms: n}, the hours in the asked window), sentiment, page types, threadEntryTypes, engagementScore by
   * pageType, and the mentions (bw.top; bw.neg with sentiment=negative), each sliced to its pageSize; X's embed data
   * answers bw.x[id] (else 404). bw.fail: {code, message} for every Brandwatch call. Every call is recorded (bw.calls).
   */
  function fakeBw(g) {
    const bw = {
      token: 'bw-shared-token-0f1e2d3c4b5a', secret: null, fail: null, calls: [],
      queries: [
        { id: QID, name: QNAME, creationDate: '2026-10-28T16:04:11.955+0000', percentComplete: 100 },
        { id: 2004161500, name: '[G EVENT] OCT26 Google Doodle Mention, Saturday Night Live', creationDate: '2026-10-27T12:52:25.581+0000', percentComplete: 100 },
        { id: 2004160100, name: '[G EVENT] OCT26 Google Financial Results', creationDate: '2026-10-24T12:04:59.132+0000', percentComplete: 100 },
        { id: 2004100000, name: '[G EVENT] JUL26 Google Financial Results', creationDate: '2026-07-24T20:00:00.000+0000', percentComplete: 100 },
        { id: 2004167929, name: '2026 Election Alerts', creationDate: '2026-10-20T10:00:00.000+0000', percentComplete: 100 },
      ],
      dashboards: [
        { id: 2102200, name: `${QNAME} - [G EVENT]`, projectId: 1998344909, settings: { queryId: QID } },
      ],
      hourly: Object.fromEntries(HOURLY.map((n, i) => [HOUR0 + i * HOUR, n])),
      sentiment: { positive: 220, neutral: 4393, negative: 2709 },
      pageTypes: [['twitter', 'X', 6150], ['bluesky', 'Bluesky', 512], ['reddit', 'Reddit', 366], ['instagram', 'Instagram', 150],
        ['instagram_public', 'Instagram Public', 44], ['facebook_public', 'Facebook Public', 100], ['news', 'News', 0],
        ['48356170072', 'DE_linkedin_data_sources', 0]],
      threadTypes: [['share', 'share', 4247], ['reply', 'reply', 2050], ['post', 'post', 1025]],
      engPageTypes: [['twitter', 'X', 83760], ['bluesky', 'Bluesky', 11960], ['instagram_public', 'Instagram Public', 2990],
        ['threads', 'Threads', 997], ['news', 'News', 0]],
      types: { share: 4466, post: 220 },
      top: [xm(CAM), xm(HQ), COURIER, xm(GONE, 'negative'), NUMB, REDDIT, xm(MANN, 'negative')],
      neg: [xm(MANN, 'negative'), REDDIT],
      x: {
        [CAM]: embed(CAM, 'CameronCorduroy', 'ok nvm, this is definitely some weird shit going on https://t.co/JfNkwDvfdg', 18368, 125),
        [HQ]: embed(HQ, 'HQNewsNow', 'Users are finding that Google\'s AI chat feature refuses to say who won the 2020 election, but gives ' +
          'an answer for any other election year.', 8112, 218),
        [MANN]: embed(MANN, 'CharlesCMann', 'I had real trouble believing that Google was actually doing this, but I just duplicated the ' +
          'result myself.', 4400, 90),
      },
    };
    const prev = g.services.UrlFetchApp.fetch;
    const resp = (code, body) => ({ getResponseCode: () => code, getHeaders: () => ({}),
      getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) });
    const param = (url, name) => { const m = url.match(new RegExp(`[?&]${name}=([^&]*)`)); return m ? decodeURIComponent(m[1]) : null; };
    const volume = (dim, values, agg) => ({ dimension1: 'queries', dimension2: dim, aggregate: agg || 'volume',
      results: [{ id: QID, name: QNAME, data: {}, values }] });
    g.services.UrlFetchApp.fetch = (link, params) => {
      const url = String(link);
      const method = String((params && params.method) || 'get').toLowerCase();
      if (url.startsWith('https://secretmanager.googleapis.com/')) {
        bw.calls.push({ host: 'secret', url, method });
        if (bw.secret) return resp(bw.secret.code, { error: { code: bw.secret.code, message: bw.secret.message } });
        return resp(200, { name: 'v', payload: { data: Buffer.from(bw.token, 'utf8').toString('base64') } });
      }
      if (url.startsWith('https://api.brandwatch.com/')) {
        bw.calls.push({ host: 'brandwatch', url, method });
        if (bw.fail) return resp(bw.fail.code, { errors: [{ code: bw.fail.code, message: bw.fail.message }] });
        const path = url.slice('https://api.brandwatch.com'.length).split('?')[0];
        if (path === '/projects/1998344909/queries/summary') {
          return resp(200, { resultsTotal: bw.queries.length, resultsPage: -1, resultsPageSize: -1, results: bw.queries });
        }
        if (path === '/projects/1998344909/dashboards/summary') {
          return resp(200, bw.dashboards);
        }
        const one = path.match(/^\/projects\/1998344909\/queries\/(\d+)$/);
        if (one) {
          const q = bw.queries.find(x => String(x.id) === one[1]);
          return q ? resp(200, Object.assign({ booleanQuery: '(google*) AND election' }, q))
            : resp(404, { errors: [{ code: 404, message: 'Query not found' }] });
        }
        const from = Date.parse(param(url, 'startDate'));
        const to = Date.parse(param(url, 'endDate'));
        if (path === '/projects/1998344909/data/volume/queries/hours') {
          const values = Object.keys(bw.hourly).map(Number).sort((a, b) => a - b).filter(h => h >= Math.floor(from / HOUR) * HOUR && h < to)
            .map(h => ({ id: new Date(h).toISOString().replace('Z', '+0000'), name: '', data: { timeUnit: 'hours' }, value: bw.hourly[h] }));
          return resp(200, volume('hours', values));
        }
        if (path === '/projects/1998344909/data/volume/queries/sentiment') {
          return resp(200, volume('sentiment', Object.entries(bw.sentiment).map(([id, value]) => ({ id, name: id, data: {}, value }))));
        }
        if (path === '/projects/1998344909/data/volume/queries/pageTypes') {
          return resp(200, volume('pageTypes', bw.pageTypes.map(([id, name, value]) => ({ id, name, data: {}, value }))));
        }
        if (path === '/projects/1998344909/data/volume/queries/threadEntryTypes') {
          return resp(200, volume('threadEntryTypes', bw.threadTypes.map(([id, name, value]) => ({ id, name, data: {}, value }))));
        }
        if (path === '/projects/1998344909/data/engagementScore/queries/pageTypes') {
          return resp(200, volume('pageTypes', bw.engPageTypes.map(([id, name, value]) => ({ id, name, data: {}, value })), 'engagementScore'));
        }
        if (path === '/projects/1998344909/data/volume/queries/days') {
          const kind = param(url, 'threadEntryType');
          return resp(200, volume('days', [{ id: '2026-10-28T00:00:00.000+0000', name: '', data: {}, value: bw.types[kind] || 0 }]));
        }
        if (path === '/projects/1998344909/data/mentions') {
          const size = Number(param(url, 'pageSize') || 100);
          const list = param(url, 'sentiment') === 'negative' ? bw.neg : bw.top;
          return resp(200, { resultsTotal: list.length, resultsPageSize: size, results: list.slice(0, size) });
        }
        return resp(404, { errors: [{ code: 404, message: `fake Brandwatch: no ${path}` }] });
      }
      if (url.startsWith('https://cdn.syndication.twimg.com/')) {
        bw.calls.push({ host: 'x', url, method });
        const post = bw.x[param(url, 'id')];
        return post ? resp(200, post) : resp(404, '');
      }
      return prev(link, params);
    };
    return bw;
  }

  /**
   * setup() at `start`; S-F Burson (B25) and the Mirror space (B9) set; the Burson test copy (B26) set, so the Relay
   * (row 22, ON) sends the analysts' side there, never to S-F Burson; Temp checks (row 36) as `on` says; Gemini's lines
   * set; a Zapier alert in S-F Burson and a run. Returns the world and the alert's copies.
   */
  const world = (on, start) => {
    const t = e2e(makeGoogle(start || T0 - 3 * MIN));  // runs every minute up to the request: the Relay never starts afresh
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    const bw = fakeBw(t.g);
    t.set('B25', REAL);
    t.chat.addSpace(MIRROR, MIRROR_NAME);
    t.chat.addSpace(COPY, COPY_NAME);
    t.bot.startMirror(MIRROR_NAME);
    t.set('B26', COPY_NAME);
    t.control().getRange(22, 2).setValue('ON');
    t.control().getRange(36, 2).setValue(on ? 'ON' : 'OFF');
    t.g.vertex.tempCheck = () => GEMINI;
    t.poll();
    const zap = t.chat.say(REAL, F.P0_OK, ZAP);
    t.poll();
    const alertIn = space => tops(t, space).find(m => m.text === F.P0_OK);
    return { t, bw, zap, inMirror: alertIn(MIRROR), inCopy: alertIn(COPY) };
  };
  /** Someone asks in the Mirror space (`opts`: thread, who, space) a minute before the next run, at `at` (T0 unless given). */
  const ask = (w, text, opts) => {
    const o = opts || {};
    w.t.g.clock.now = (o.at || T0) - MIN;
    const msg = w.t.chat.say(o.space || MIRROR, text, Object.assign(o.thread ? { thread: o.thread } : {}, o.who || DANA));
    w.t.poll();
    return msg;
  };

  const TITLE = '(10/29) 2020 Election Query Results (6am PT)';
  const BW_DASH = 'https://app.brandwatch.com/project/1998344909/dashboards/2102200';
  const BW_LINK = 'https://app.brandwatch.com/project/1998344909/queries';
  const LEVEL_TBD = 'Volume is currently [HIGH / MODERATE / LOW] ([top / bottom XX%] of Google issues in the past 12 months).';
  // The email's plain-text part: the team's UPDATED STANDARD TEMPLATE, line for line
  const EMAIL = [
    TITLE,
    `BW source: Link <${BW_DASH}>`,
    '',
    `TL;DR: There have been 7,322 total mentions regarding 2020 Election Query Results. ${LEVEL_TBD} ` +
      `Velocity is -70% since the peak at 12pm PT on 10/28. ${GEMINI.summary}`,
    '',
    'Sentiment: 60% neutral, 37% negative, and 3% positive.',
    '',
    `Negativity Drivers: ${GEMINI.negativity_drivers}`,
    '',
    `Themes: ${GEMINI.themes}`,
    '',
    'Mentions Volume: Mentions are highest on X (84%), followed by Bluesky (7%) and Reddit (5%), (other sources: 4%).',
    '',
    'Mention Types: Mentions are primarily reposts (58%), followed by comments (28%), with original posts accounting for 14% of all mentions.',
    '',
    'Engagement Volume: Engagement (likes, comments, shares) is highest on X (84%), followed by Bluesky (12%) and Instagram (3%), (other sources: 1%).',
    '',
    'Highest Engaging Posts:',
    '  • CameronCorduroy on X: "ok nvm, this is definitely some weird shit going on https://t.co/JfNkwDvfdg" (18.5K Engagements) ' +
      `<https://x.com/CameronCorduroy/status/${CAM}>`,
    '  • HQNewsNow on X: "Users are finding that Google\'s AI chat feature refuses to say who won the 2020 election, but gives ' +
      `an answer for any other election year." (8.3K Engagements) <https://x.com/HQNewsNow/status/${HQ}>`,
    '  • CharlesCMann on X: "I had real trouble believing that Google was actually doing this, but I just duplicated the ' +
      `result myself." (4.5K Engagements) <https://x.com/CharlesCMann/status/${MANN}>`,
    '  • couriernewsroom on IG: "Who won the 2020 presidential election? Joe Biden." (2.5K Engagements) ' +
      '<https://www.instagram.com/p/DfDC_abjzrO/>',
    '  • numb.comfortab.ly on Bluesky: "FRIEND (IN CANADA): What\'s the Gulf called, what\'s the lake called, who won in the US in 2020? ' +
      'GOOGLE: Mexico, Ontario, Biden." (944 Engagements) <https://bsky.app/profile/numb.comfortab.ly/post/3abc>',
    '  • ExactlySorta on Reddit: "Google won\'t allow its chatbot to directly answer who won the 2020 presidential election: ' +
      '(but other elections are fine, apparently)" (859 Engagements) <https://www.reddit.com/r/technology/comments/abc/>',
  ].join('\n');

  // -----------------------------------------------------------------------------------------------------------------
  // The Control tab row
  // -----------------------------------------------------------------------------------------------------------------

  test('temp checks: row 36 of a new Control tab is the Temp checks switch, OFF with its ON / OFF dropdown (C36: done by hand); row 37 blank, "How it works" from row 38 with a line for it; a tab from before it (row 36 blank, the help at row 37) gets it on its next run without setup(), OFF, the help moved below; a person\'s ON is kept', () => {
    const t = e2e();
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    eq([t.control().cell(36, 1), t.control().cell(36, 2), t.control().cell(36, 3), t.control().validations['36,2'].values],
      ['Temp checks', 'OFF', 'OFF (temp checks are done by hand)', ['ON', 'OFF']]);
    eq([t.control().cell(37, 1), t.control().cell(37, 2), t.control().cell(38, 1), t.control().cell(39, 1), t.control().cell(40, 1),
      t.control().cell(41, 1), t.control().cell(42, 1), t.control().cell(43, 1), t.control().cell(44, 1), t.control().cell(45, 1),
      t.control().cell(46, 1), t.control().cell(47, 1), t.control().cell(48, 1), t.control().cell(49, 1), t.control().cell(50, 1),
      t.control().cell(51, 1), t.control().cell(52, 1), t.control().cell(53, 1), t.control().cell(54, 1), t.control().cell(55, 1),
      t.control().cell(56, 1), t.control().cell(57, 1)],
    ['Group test emails', 'OFF', 'Fast triage (Gemini Decisions)', 'Fast triage: rank and early watch', 'Fast triage: hold back noise',
      'Hold-back: about_google at or below', 'Hold-back: routine_noise at or above', 'Hold-back and early watch: answer confidence at or above',
      'Early watch: about_google and brand_risk, each at or above', 'Early watch: distinct accounts, at least',
      'Write early-wave records to BigQuery', 'Early watch: independent_reports at or above', 'Early Detection: also read the AMIE table',
      'Early Detection: also read Brandwatch live (not X)', 'Proactive watch: also read the AMIE table', 'Open engine: judgment in place of caps', '', '',
      'Live dashboard', 'Slide deliveries', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is a switch now (it was blank)
    const help = t.control().rows.slice(57).map(r => String(r[0] || ''));
    assert.ok(help.some(l => /^• Temp checks: row 36, OFF until you turn it ON\. In a thread in the Mirror space or the Other alerts space \(B33\)/.test(l)));
    assert.ok(help.some(l => /^• Rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 are switches/.test(l)));  // now ends "54, 55 and 56"
    // 32 switches now (row 56, RunLog.gs, came last): tempChecks and bsgTestEmails are one further from the end
    eq([SWITCHES.length, SWITCHES[SWITCHES.length - 13].key, SWITCHES[SWITCHES.length - 12].key, B.switchRows_().slice(-13)],
      [32, 'tempChecks', 'bsgTestEmails', [36, 37, 38, 39, 40, 46, 48, 49, 50, 51, 54, 55, 56]]);
    // The deployed layout: row 36 blank, "How it works" at row 37
    t.control().getRange(36, 1, 1, 3).setValues([['', '', '']]);
    t.control().getRange(37, 1, 1, 3).setValues([['How it works', '', '']]);
    t.control().getRange(35, 2).setValue('Mirror space (B9)');  // a choice a person made in B35: kept
    t.poll();
    eq([t.control().cell(35, 2), t.control().cell(36, 1), t.control().cell(36, 2), t.control().cell(37, 1), t.control().cell(37, 2), t.control().cell(38, 1),
      t.control().cell(39, 1), t.control().cell(40, 1), t.control().cell(46, 1), t.control().cell(47, 1), t.control().cell(48, 1), t.control().cell(49, 1),
      t.control().cell(57, 1)],
    ['Mirror space (B9)', 'Temp checks', 'OFF', 'Group test emails', 'OFF', 'Fast triage (Gemini Decisions)', 'Fast triage: rank and early watch', 'Fast triage: hold back noise', 'Write early-wave records to BigQuery', 'Early watch: independent_reports at or above', 'Early Detection: also read the AMIE table', 'Early Detection: also read Brandwatch live (not X)', 'How it works']);
    t.control().getRange(36, 2).setValue('ON');
    t.poll();
    t.poll();
    eq(t.control().cell(36, 2), 'ON');
    assert.match(t.control().cell(36, 3), /^✓ ON: write "temp check" and a Brandwatch query's name \(or its link\) in a thread in the Mirror space \(B9\) or the Other alerts space \(B33\); after the next run's alerts the bot emails the temp check, in the team's template, to the testers \(B30, else the stand-in\) and says so in the thread \("refresh" for an update\)\. The concern level is left for you to fill in until its 12-month benchmark is built$/);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // OFF: nothing changes
  // -----------------------------------------------------------------------------------------------------------------

  test('temp checks OFF (as it starts): "temp check …" in the Mirror space is an analyst\'s message like any other (the Relay sends it to the Burson test copy, as before); Brandwatch is never called and nothing is posted or emailed for it', () => {
    const w = world(false);
    assert.ok(w.inMirror && w.inCopy, 'the alert is copied into the Mirror space and the Burson test copy');
    ask(w, ASK, { thread: w.inMirror.thread.name });
    eq(posts(w.t, COPY).filter(m => m.thread.name === w.inCopy.thread.name && m.threadReply).map(m => m.text), [`Dana Lee: ${ASK}`]);
    eq([temps(w.t, MIRROR), w.bw.calls.filter(c => c.host !== 'x'), queue(w.t), mails(w.t)], [[], [], [], []]);
    eq(w.t.control().cell(36, 3), 'OFF (temp checks are done by hand)');
  });

  // -----------------------------------------------------------------------------------------------------------------
  // ON: the email, and the thread's note
  // -----------------------------------------------------------------------------------------------------------------

  test('temp checks ON: "temp check <the query\'s name>" in an alert\'s thread in the Mirror space gets the temp check emailed after the run\'s alerts, in the team\'s UPDATED STANDARD TEMPLATE (the title and BW dashboard link; the TL;DR with bold mention counts and 12-month benchmark link; inline cid:tc-chart hourly volume PNG; standalone Sentiment, Negativity Drivers and Themes paragraphs; Mentions Volume, Mention Types and Engagement Volume breakdowns; up to 7 engagement-sorted posts, reposts excluded), from the bot\'s account to the testers only; the thread gets only a short note that it was sent', () => {
    const w = world(true);
    const asked = ask(w, ASK, { thread: w.inMirror.thread.name });
    // the email: the template, from the bot's account, only to the testers (here the stand-in)
    const sent = mails(w.t);
    eq(sent.length, 1);
    eq([sent[0].subject, sent[0].from, sent[0].to, sent[0].cc], ['Temp Check: 2020 Election Query Results', 'Brand Social <bot@runner.test>',
      ['tester@testing.test'], []]);
    eq(sent[0].text, EMAIL);
    [
      `<b>(10/29) 2020 Election Query Results (6am PT)</b><br><b>BW source:</b> <a href="${BW_DASH}" style="color:#1155cc"><b>Link</b></a>`,
      '<b>TL;DR:</b> There have been <b>7,322 total mentions</b> regarding 2020 Election Query Results.',
      '<b>[HIGH / MODERATE / LOW]</b> (<a href="https://lookerstudio.google.com/c/u/0/reporting/f3b19d3c-e8d9-401c-b384-f730c4d66af4/page/p_6ur5ole7kd" style="color:#1155cc">[top / bottom XX%] of Google issues</a> in the past 12 months).',
      '<img src="cid:tc-chart" alt="(10/29) 2020 Election Query Results 6am PT"',
      '<p style="margin:0 0 14px"><b>Sentiment:</b> 60% neutral, 37% negative, and 3% positive.</p>',
      `<p style="margin:0 0 14px"><b>Negativity Drivers:</b> ${GEMINI.negativity_drivers}</p>`,
      `<p style="margin:0 0 14px"><b>Themes:</b> ${GEMINI.themes}</p>`,
      '<p style="margin:0 0 14px"><b>Mentions Volume:</b> Mentions are highest on X (84%), followed by Bluesky (7%) and Reddit (5%), (other sources: 4%).</p>',
      '<p style="margin:0 0 14px"><b>Mention Types:</b> Mentions are primarily reposts (58%), followed by comments (28%), with original posts accounting for 14% of all mentions.</p>',
      '<p style="margin:0 0 14px"><b>Engagement Volume:</b> Engagement (likes, comments, shares) is highest on X (84%), followed by Bluesky (12%) and Instagram (3%), (other sources: 1%).</p>',
      `<a href="https://x.com/CameronCorduroy/status/${CAM}" style="color:#202124;font-weight:bold;text-decoration:underline">CameronCorduroy on X</a>: "ok nvm`,
      '(18.5K Engagements)</li>',
    ].forEach(s => assert.ok(sent[0].html.includes(s), s));
    assert.ok(!sent[0].html.includes(QNAME), 'no parenthetical query name after BW source Link');
    // Inline hourly chart attachment (960x270 = 259,200 px <= 400,000 px limit, 20 completed hours from 10/28 10AM to 10/29 5AM)
    eq(sent[0].inline.map(x => [x.cid, x.mime]), [['tc-chart', 'image/png']]);
    eq(w.t.g.charts.built.length, 1);
    const builtChart = w.t.g.charts.built[0];
    eq([builtChart.width, builtChart.height, builtChart.title, builtChart.colors, builtChart.dataTable.rows.length,
      builtChart.dataTable.rows[0], builtChart.dataTable.rows[builtChart.dataTable.rows.length - 1]],
      [960, 270, '(10/29) 2020 Election Query Results 6am PT', ['#4285f4'], 20, ['(10/28) 10AM', 332], ['(10/29) 5AM', 240]]);
    assert.ok(builtChart.width * builtChart.height <= 400000);
    // the thread: only the note that it was emailed (the bot's own: never relayed, never answered)
    const got = temps(w.t, MIRROR, w.inMirror.thread.name);
    eq(got.map(m => m.text), [SENT(TITLE)]);
    assert.ok(got[0].threadReply);
    assert.match(String(got[0].clientAssignedMessageId), /^client-bqa-/);
    // never relayed: nothing new in the test copy, nothing in S-F Burson; no "not sent" note; not answered as a question
    eq(posts(w.t, COPY).filter(m => m.threadReply).map(m => m.text), []);
    eq([posts(w.t, REAL), writesIn(w.t, REAL)], [[], []]);
    eq(posts(w.t, MIRROR).filter(m => /^Not sent/.test(m.text)), []);
    eq(w.t.g.vertex.calls.filter(c => schemaOf(c).answer), []);
    eq(w.t.sheet().getSheetByName('Relay').rows.filter(r => r.indexOf(asked.name) >= 0), []);
    // Brandwatch: GETs only, in [SLRR] Private: queries/summary, dashboards/summary, hours, then 6 parallel window GETs
    const bwCalls = w.bw.calls.filter(c => c.host === 'brandwatch');
    eq(bwCalls.map(c => c.method), bwCalls.map(() => 'get'));
    eq(bwCalls.map(c => c.url.slice('https://api.brandwatch.com/projects/1998344909'.length).split('?')[0]), [
      '/queries/summary', '/dashboards/summary', '/data/volume/queries/hours',
      '/data/volume/queries/sentiment', '/data/volume/queries/pageTypes', '/data/volume/queries/threadEntryTypes',
      '/data/engagementScore/queries/pageTypes', '/data/mentions', '/data/mentions']);
    assert.ok(bwCalls[2].url.includes(`queryId=${QID}&startDate=${encodeURIComponent('2026-10-26T16:00:00.000Z')}&endDate=`), bwCalls[2].url);
    bwCalls.slice(3).forEach(c => assert.ok(c.url.includes(`startDate=${encodeURIComponent('2026-10-28T17:00:00.000Z')}`), c.url));
    const mentionCalls = bwCalls.filter(c => /\/data\/mentions\?/.test(c.url));
    mentionCalls.forEach(c => ['orderBy=engagementScore', 'orderDirection=desc', 'xthreadEntryType=share'].forEach(p => assert.ok(c.url.includes(p), p)));
    eq(mentionCalls.map(c => Number(c.url.match(/pageSize=(\d+)/)[1])).reduce((a, b) => a + b, 0), 40);
    assert.ok(mentionCalls[1].url.includes('sentiment=negative'));
    eq(w.bw.calls.slice(w.bw.calls.findIndex(c => c.host === 'secret')).filter(c => c.host === 'x').map(c => c.url.match(/[?&]id=(\d+)/)[1]).sort(),
      [CAM, HQ, GONE, MANN].sort());
    // Gemini read the numbers and the posts, and wrote the summary, drivers and themes
    const g = w.t.g.vertex.calls.filter(c => schemaOf(c).negativity_drivers);
    eq(g.length, 1);
    const prompt = g[0].payload.contents[0].parts[0].text;
    ['Issue: 2020 Election Query Results', '7,322 mentions', '37% negative', 'X 84%', 'CameronCorduroy', 'CharlesCMann', 'couriernewsroom',
      'Velocity is -70%', 'No numbers: the write-up already gives', 'Inline post links:'].forEach(s => assert.ok(prompt.includes(s), s));
    // done: nothing waits; C36 says how it went
    eq(queue(w.t), []);
    assert.match(w.t.control().cell(36, 3), / · last 6:05am PT: 2020 Election Query Results \(7,322 mentions, emailed\)$/);
    // the next runs do nothing more (no second email)
    const n = posts(w.t, MIRROR).length;
    w.t.poll();
    w.t.poll();
    eq([posts(w.t, MIRROR).length, mails(w.t).length], [n, 1]);
  });

  test('temp checks: "refresh" in that thread (two hours on) emails the update on the same email thread, still counted from the issue\'s start: the new mentions since the last one and the total (as the team words it), velocity from the new last full hour; "update" works too; a "refresh" in a thread without a temp check is an analyst\'s message as before (relayed)', () => {
    const w = world(true);
    ask(w, ASK, { thread: w.inMirror.thread.name });
    // two hours on: 230 in 13:00 UTC, 210 in 14:00 UTC, 30 so far in 15:00 UTC
    Object.assign(w.bw.hourly, { [HOUR0 + 24 * HOUR]: 230, [HOUR0 + 25 * HOUR]: 210, [HOUR0 + 26 * HOUR]: 30 });
    const callsBefore = w.bw.calls.length;
    ask(w, 'refresh', { thread: w.inMirror.thread.name, at: T0 + 2 * HOUR });
    eq(temps(w.t, MIRROR, w.inMirror.thread.name).map(m => m.text),
      [SENT(TITLE), SENT('(10/29) 2020 Election Query Results (8am PT)', true)]);
    const sent = mails(w.t);
    eq(sent.length, 2);
    eq([sent[1].subject, sent[1].threadId], [sent[0].subject, sent[0].threadId]);  // one email thread for the issue
    eq(sent[1].text.split('\n').slice(0, 4), ['(10/29) 2020 Election Query Results (8am PT)', `BW source: Link <${BW_DASH}>`, '',
      `TL;DR: Since the last update at 6am PT, there have been 430 new mentions (7,752 total mentions) regarding 2020 Election Query ` +
        `Results. ${LEVEL_TBD} Velocity is -74% since the peak at 12pm PT on 10/28. ${GEMINI.summary}`]);
    assert.ok(sent[1].html.includes('<b>430 new mentions</b> (<b>7,752 total mentions</b>)'));
    // no second look for queries/summary or dashboards/summary: both cached
    eq(w.bw.calls.slice(callsBefore).filter(c => c.host === 'brandwatch' && /(?:queries|dashboards)\/summary/.test(c.url)), []);
    ask(w, 'Update', { thread: w.inMirror.thread.name, at: T0 + 2 * HOUR + 10 * MIN });
    eq([temps(w.t, MIRROR, w.inMirror.thread.name).length, mails(w.t).length], [3, 3]);
    // a "refresh" where the bot did no temp check: not one (relayed like any analyst's message)
    const plain = ask(w, 'refresh', { at: T0 + 2 * HOUR + 20 * MIN });
    eq([temps(w.t, MIRROR).length, mails(w.t).length], [3, 3]);
    assert.ok(tops(w.t, COPY).some(m => m.text === 'Dana Lee: refresh'), 'relayed as before');
    eq(temps(w.t, MIRROR, plain.thread.name), []);
  });

  test('temp checks: a "temp check …" in S-F Burson (a Burson person\'s, relayed into the Mirror space) is never worked: only Google people\'s own messages in a Google-only space are; nothing is written in S-F Burson', () => {
    const w = world(true);
    w.t.g.clock.now = T0 - MIN;
    w.t.chat.say(REAL, ASK, Object.assign({ thread: w.zap.thread.name }, ALICE));
    w.t.poll();
    assert.ok(posts(w.t, MIRROR).some(m => m.threadReply && /temp check \[G EVENT\]/.test(m.text)), 'relayed into the Mirror space');
    eq([temps(w.t, MIRROR), queue(w.t), w.bw.calls.filter(c => c.host === 'brandwatch'), writesIn(w.t, REAL), mails(w.t)], [[], [], [], [], []]);
  });

  test('temp checks: in the Other alerts space (B33) a request with part of the query\'s name ("2020 election", the one [G EVENT] query with those words) is emailed the same way, its note in its own thread there', () => {
    const t = e2e(makeGoogle(T0 - 40 * MIN));
    t.chat.addSpace(MID, MID_NAME);
    t.chat.addSpace(MIRROR, MIRROR_NAME);
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    const bw = fakeBw(t.g);
    t.set('B25', REAL);
    t.bot.startMirror(MIRROR_NAME);
    t.control().getRange(29, 2).setValue('ON');  // Testing
    t.control().getRange(33, 2).setValue(MID_LINK);
    t.control().getRange(36, 2).setValue('ON');
    t.g.vertex.tempCheck = () => GEMINI;
    t.poll();
    const msg = t.chat.say(MID, 'Temp check: 2020 election', DANA);
    t.g.clock.now = T0 - MIN;
    t.poll();
    eq(temps(t, MID, msg.thread.name).map(m => m.text), [SENT(TITLE)]);
    eq(mails(t).map(m => m.text), [EMAIL]);
    eq([temps(t, MIRROR), bw.calls.filter(c => c.method !== 'get')], [[], []]);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The bot's other answers
  // -----------------------------------------------------------------------------------------------------------------

  test('temp checks: "temp check" with no query lists the newest [G EVENT] queries to copy; a name no query has gets the closest ones; one several queries share gets them (the newest first); a link or id the project doesn\'t have says so; "since …" it can\'t read says how to write it', () => {
    const w = world(true);
    const which = ask(w, 'temp check');
    eq(temps(w.t, MIRROR, which.thread.name).map(m => m.text), [[
      `${HEAD} *Temp check:* which Brandwatch query? Reply here with "temp check" and its name (or its link). The newest [G EVENT] queries:`,
      '• [G EVENT] OCT26 2020 Election Query Results (made 9:04am PT on 10/28)',
      '• [G EVENT] OCT26 Google Doodle Mention, Saturday Night Live (made 5:52am PT on 10/27)',
      '• [G EVENT] OCT26 Google Financial Results (made 5:04am PT on 10/24)',
      '• [G EVENT] JUL26 Google Financial Results (made 1pm PT on 7/24)'].join('\n')]);
    const none = ask(w, 'temp check doodle snl', { at: T0 + MIN });
    eq(temps(w.t, MIRROR, none.thread.name).map(m => m.text), [[
      `${HEAD} *Temp check:* no Brandwatch query in [SLRR] Private matches "doodle snl". Reply with "temp check" and the exact name (or the query's link). The closest:`,
      '• [G EVENT] OCT26 Google Doodle Mention, Saturday Night Live (made 5:52am PT on 10/27)'].join('\n')]);
    const several = ask(w, 'temp check financial', { at: T0 + 2 * MIN });
    eq(temps(w.t, MIRROR, several.thread.name).map(m => m.text), [[
      `${HEAD} *Temp check:* more than one Brandwatch query matches "financial". Reply with "temp check" and the exact name:`,
      '• [G EVENT] OCT26 Google Financial Results (made 5:04am PT on 10/24)',
      '• [G EVENT] JUL26 Google Financial Results (made 1pm PT on 7/24)'].join('\n')]);
    const missing = ask(w, 'temp check https://app.brandwatch.com/project/1998344909/queries/2004000001', { at: T0 + 3 * MIN });
    eq(temps(w.t, MIRROR, missing.thread.name).map(m => m.text), [`${HEAD} *Temp check:* there's no query 2004000001 in [SLRR] Private ` +
      '(the project the team\'s [G EVENT] queries are in). Reply with "temp check" and the query\'s name.']);
    const bad = ask(w, 'temp check since whenever', { at: T0 + 4 * MIN });
    eq(temps(w.t, MIRROR, bad.thread.name).map(m => m.text), [`${HEAD} *Temp check:* couldn't read the time in "since whenever". Try ` +
      '"since 9am PT" or "since 10/28 9am PT" (within the last month).']);
    // the exact name, its id, or the newest of the same name without the month tag: emailed, the thread told
    const byId = ask(w, `temp check ${QID}`, { at: T0 + 5 * MIN });
    eq(temps(w.t, MIRROR, byId.thread.name).map(m => m.text), [SENT(TITLE)]);
    const newest = ask(w, 'temp check Google Financial Results', { at: T0 + 6 * MIN });
    eq(temps(w.t, MIRROR, newest.thread.name).map(m => m.text), [SENT('(10/29) Google Financial Results (6am PT)')]);
    eq(mails(w.t).map(m => m.text.split('\n')[1]), [`BW source: Link <${BW_DASH}>`, `BW source: Link <${BW_LINK}>`]);
    assert.match(w.t.control().cell(36, 3), / · last 6:11am PT: Google Financial Results \(\d[\d,]* mentions, emailed\)$/);
  });

  test('temp checks: "since 9am PT" (or "since 10/28 9am") counts from that hour ("Since 9am PT on 10/28 there have been …", as the team writes it); with it in a thread that has one, the same query from the new start (not an update), on the same email thread', () => {
    const w = world(true);
    ask(w, `${ASK} since 10/28 9am PT`, { thread: w.inMirror.thread.name });
    const first = mails(w.t)[0].text;
    assert.ok(first.includes('\nTL;DR: Since 9am PT on 10/28 there have been 7,404 total mentions regarding 2020 Election Query Results. '), first);
    ask(w, 'temp check since 4am', { thread: w.inMirror.thread.name, at: T0 + MIN });
    const again = mails(w.t)[1];
    assert.ok(again.text.startsWith(`${TITLE}\n`), again.text);
    assert.ok(again.text.includes('\nTL;DR: Since 4am PT there have been 540 total mentions regarding 2020 Election Query Results. '), again.text);
    eq(again.threadId, mails(w.t)[0].threadId);
    eq(temps(w.t, MIRROR, w.inMirror.thread.name).map(m => m.text), [SENT(TITLE), SENT(TITLE)]);
  });

  test('temp checks: grounded [phrase](#N) citations render as inline post links in HTML and clean prose in plain text (invalid #N safely unlinked); Instagram reels missing a Brandwatch author resolve @handle via lookupPost_ (falling back to "Post on IG", never "instagram.com on IG"); a Charts failure omits the chart without blocking the email', () => {
    const w = world(true);
    const reelUrl = 'https://www.instagram.com/reel/DfGoRHrA0cI/';
    const reelNoPageUrl = 'https://www.instagram.com/reel/DfNoPage999/';
    w.t.g.pages.set('https://www.instagram.com/p/DfGoRHrA0cI/embed/captioned/', {
      code: 200,
      body: '<!DOCTYPE html><html><body><div class="Embed "><div class="HeaderText"><a class="Username" href="https://www.instagram.com/chriskohlernews/">' +
        '<span class="UsernameText">chriskohlernews</span></a></div><div class="Caption">Breaking down Q1 earnings</div></div></body></html>',
    });
    w.bw.top.unshift(
      Object.assign(web('instagram_public', 'DfGoRHrA0cI', null, '', 'Breaking down Q1 earnings', 19500, reelUrl), { domain: 'instagram.com' }),
      Object.assign(web('instagram_public', 'DfNoPage999', null, '', 'Second reel with no embed', 19000, reelNoPageUrl), { domain: 'instagram.com' })
    );
    w.t.g.vertex.tempCheck = () => ({
      summary: 'Discussion centers on [Q1 earnings](#1) and [AI search tests](#3), plus [unlinked claim](#99).',
      negativity_drivers: 'Critics point to [refusal screenshots](#4) and [chatbot limits](#99).',
      themes: 'Creators share [earnings breakdowns](#1) alongside [broader commentary](#2).',
    });
    w.t.g.charts.fail = 'Charts backend unavailable';
    ask(w, ASK, { thread: w.inMirror.thread.name });
    const sent = mails(w.t)[0];
    assert.ok(!sent.html.includes('cid:tc-chart') && sent.inline.length === 0, sent.html);
    assert.ok(sent.html.includes(`<a href="${reelUrl}" style="color:#202124;font-weight:bold;text-decoration:underline">chriskohlernews on IG</a>: ` +
      '"Breaking down Q1 earnings" (19.5K Engagements)'), sent.html);
    assert.ok(sent.html.includes(`<a href="${reelNoPageUrl}" style="color:#202124;font-weight:bold;text-decoration:underline">Post on IG</a>: ` +
      '"Second reel with no embed" (19K Engagements)'), sent.html);
    assert.ok(!sent.text.includes('instagram.com on IG') && !sent.html.includes('instagram.com on IG'), sent.text);
    assert.ok(sent.html.includes(`<a href="${reelUrl}" style="color:#1155cc">Q1 earnings</a>`) &&
      sent.html.includes(`<a href="https://x.com/CameronCorduroy/status/${CAM}" style="color:#1155cc">AI search tests</a>`) &&
      sent.html.includes('plus unlinked claim.'), sent.html);
    assert.ok(!sent.text.includes('(#1)') && !sent.text.includes('(#99)') &&
      sent.text.includes('Negativity Drivers: Critics point to refusal screenshots and chatbot limits.'), sent.text);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // When it can't be done
  // -----------------------------------------------------------------------------------------------------------------

  test('temp checks: Brandwatch refusing the token is tried again next run (C36 says so, nothing posted or emailed), then after 3 runs its thread is told why, the token never shown; Gemini not answering leaves the template\'s own placeholders for the drivers and themes (the numbers still go out); a request waits while the run has no time left, one older than 30 minutes gets a note; switched OFF, nothing waits', () => {
    const w = world(true);
    w.bw.fail = { code: 401, message: `Invalid access token: ${w.bw.token}` };
    const msg = ask(w, ASK, { thread: w.inMirror.thread.name });
    eq([temps(w.t, MIRROR), queue(w.t).length, mails(w.t)], [[], 1, []]);
    assert.match(w.t.control().cell(36, 3), / · ⚠️ Brandwatch HTTP 401 \(the shared token was refused\): Invalid access token: \[token\] \(tried again next run\)$/);
    w.t.poll();
    w.t.poll();
    eq(temps(w.t, MIRROR, msg.thread.name).map(m => m.text), [`${HEAD} *Temp check:* couldn't do it for "${QNAME}": Brandwatch HTTP 401 ` +
      '(the shared token was refused): Invalid access token: [token]. Ask again to try again.']);
    eq([queue(w.t), mails(w.t)], [[], []]);
    assert.ok(!JSON.stringify(posts(w.t, MIRROR)).includes(w.bw.token));
    // Gemini gives no answer: the numbers still go out, the template's placeholders where its lines would be
    w.bw.fail = null;
    w.t.g.vertex.tempCheck = null;
    ask(w, ASK, { at: T0 + 10 * MIN });
    const text = mails(w.t)[0].text;
    assert.ok(text.includes('Velocity is -70% since the peak at 12pm PT on 10/28.\n\nSentiment: 60% neutral, 37% negative, and 3% positive.\n\n' +
      'Negativity Drivers: [example 1, example 2, etc.]\n\nThemes: [Highlight any major positive / neutral themes here].\n'), text);
    // no time left in the run: it waits; older than 30 minutes: a note; OFF: nothing waits
    const holder = w.t.chat.say(MIRROR, 'a thread for the next request', DANA);
    const job = { m: holder.name, sp: MIRROR, th: holder.thread.name, tx: ASK, who: 'Dana Lee', at: w.t.g.clock.now, n: 0, al: 0 };
    w.t.g.props.set('TC_QUEUE', JSON.stringify([job]));
    const before = w.bw.calls.length;
    w.t.bot.runTempChecks_(w.t.g.clock.now - 5 * MIN, { tempChecks: true });
    eq([queue(w.t).length, w.bw.calls.length], [1, before]);
    w.t.g.clock.now += 31 * MIN;
    w.t.bot.runTempChecks_(w.t.g.clock.now, { tempChecks: true });
    eq(posts(w.t, MIRROR).filter(m => m.thread.name === job.th).map(m => m.text), [`${HEAD} *Temp check:* couldn't do it for "${QNAME}": ` +
      'the bot had no time for it within 30 minutes. Ask again to try again.']);
    w.t.g.props.set('TC_QUEUE', JSON.stringify([Object.assign({}, job, { m: `${MIRROR}/messages/yyy`, at: w.t.g.clock.now })]));
    w.t.bot.runTempChecks_(w.t.g.clock.now, { tempChecks: false });
    eq(w.t.g.props.has('TC_QUEUE'), false);
  });

  test('temp checks: Brandwatch busy (the shared login\'s call limit, 429, which other tools use too; or down, 5xx) isn\'t a try: the thread is told once that it waits (another "temp check" there meanwhile makes no second request or note), it\'s tried again every run, and it\'s emailed once Brandwatch answers; busy for 30 minutes, the thread is told why in plain words; Gmail refusing the email is tried again next run, and an email that went out is never sent twice', () => {
    const w = world(true);
    const BUSY = B.ev('TC_BW_BUSY_');
    w.bw.fail = { code: 429, message: 'rate limit exceeded: Limit = 600 per 10 minute(s)' };
    const msg = ask(w, ASK, { thread: w.inMirror.thread.name });
    eq(temps(w.t, MIRROR, msg.thread.name).map(m => m.text), [BUSY]);
    assert.match(w.t.control().cell(36, 3), / · ⚠️ Brandwatch HTTP 429 \(too many calls for now\): rate limit exceeded: Limit = 600 per 10 minute\(s\) \(waiting: tried again every run for up to 30 minutes\)$/);
    // a bare "temp check" in that thread while it waits: that one answers it
    ask(w, 'temp check', { thread: w.inMirror.thread.name, at: T0 + MIN });
    for (let i = 0; i < 3; i++) w.t.poll();
    eq([temps(w.t, MIRROR, msg.thread.name).map(m => m.text), queue(w.t).length, Number(queue(w.t)[0].n) || 0, queue(w.t)[0].tx],
      [[BUSY], 1, 0, ASK]);
    w.bw.fail = null;
    w.t.poll();
    eq(temps(w.t, MIRROR, msg.thread.name).map(m => m.text), [BUSY, SENT(TITLE)]);
    eq([mails(w.t).length, queue(w.t)], [1, []]);
    // down for more than 30 minutes: the thread is told why
    w.bw.fail = { code: 503, message: 'Service Unavailable' };
    const again = ask(w, ASK, { at: T0 + 20 * MIN });
    w.t.g.clock.now += 31 * MIN;
    w.t.poll();
    eq(temps(w.t, MIRROR, again.thread.name).map(m => m.text), [BUSY, `${HEAD} *Temp check:* couldn't do it for "${QNAME}": ` +
      'Brandwatch stayed busy for 30 minutes (the shared login\'s limit of calls; other tools use it too). Ask again to try again.']);
    eq(queue(w.t), []);
    // Gmail refusing the email: nothing went out, so the next run sends it, once
    w.bw.fail = null;
    const sendNow = w.t.g.gmail.handle.bind(w.t.g.gmail);
    let refuse = true;
    w.t.g.gmail.handle = (url, params) => (refuse && /messages\/send/.test(url)
      ? { code: 500, body: { error: { code: 500, message: 'backend error' } } } : sendNow(url, params));
    const third = ask(w, ASK, { at: w.t.g.clock.now + 2 * MIN });
    eq([temps(w.t, MIRROR, third.thread.name), mails(w.t).length, queue(w.t).length], [[], 1, 1]);
    refuse = false;
    w.t.poll();
    w.t.poll();
    eq([temps(w.t, MIRROR, third.thread.name).length, mails(w.t).length, queue(w.t)], [1, 2, []]);
  });

  // -----------------------------------------------------------------------------------------------------------------
  // The pieces
  // -----------------------------------------------------------------------------------------------------------------

  test('temp checks: what counts as a request ("temp check" first, any case; the query by name, link or id; "since …"; a bare "refresh" / "update"), the times "since …" can say (PT unless another zone is named; the latest one not in the future), how names are matched, and the write-up\'s lines', () => {
    const askOf = t => B.tempCheckAsk_(t);
    eq(askOf(ASK), { refresh: false, ref: QNAME, since: '' });
    eq(askOf('Temp check: "2020 election" since 10/28 9am PT'), { refresh: false, ref: '2020 election', since: '10/28 9am PT' });
    eq(askOf('temperature-check on the doodle query'), { refresh: false, ref: 'the doodle query', since: '' });
    eq(askOf('tempcheck 2004162030'), { refresh: false, ref: '2004162030', since: '' });
    eq([askOf('temp check'), askOf('temp check please'), askOf('refresh'), askOf('Update the temp check.'), askOf('refresh since 9am')],
      [{ refresh: false, ref: '', since: '' }, { refresh: false, ref: '', since: '' }, { refresh: true, ref: '', since: '' },
        { refresh: true, ref: '', since: '' }, { refresh: true, ref: '', since: '9am' }]);
    eq(['temp checks are due at 3', 'Update: the alert was resolved', 'can you do a temp check?', 'refresh please', '', 'x'.repeat(700)].map(askOf),
      [null, null, null, null, null, null]);
    const NOW2 = Date.UTC(2026, 10, 2, 14, 5);  // 6:05am PT (standard time) on 11/2
    const since = s => { const v = B.tcParseSince_(s, NOW2); return v ? new Date(v).toISOString() : 0; };
    eq(['9am', '9:30 am PT', '9am ET', '14:00 UTC', 'noon', '10/28 9am', '10/28', 'yesterday 9pm', '12/31 9am', '2/31 9am', 'whenever', '9am 10/1/25'].map(since),
      ['2026-11-01T17:00:00.000Z', '2026-11-01T17:00:00.000Z', '2026-11-02T14:00:00.000Z', '2026-11-02T14:00:00.000Z',
        '2026-11-01T20:00:00.000Z', '2026-10-28T16:00:00.000Z', '2026-10-28T07:00:00.000Z', '2026-11-02T05:00:00.000Z', 0, 0, 0, 0]);
    // PT across daylight time's end (11/1 2am) and start (3/8 2am)
    eq([B.tcOffsetMin_(Date.UTC(2026, 10, 1, 8, 59), 'PT'), B.tcOffsetMin_(Date.UTC(2026, 10, 1, 9), 'PT'),
      B.tcOffsetMin_(Date.UTC(2026, 2, 8, 9, 59), 'PT'), B.tcOffsetMin_(Date.UTC(2026, 2, 8, 10), 'PT')], [-420, -480, -480, -420]);
    eq([B.tcWhen_(Date.UTC(2026, 9, 28, 19), T0), B.tcWhen_(Date.UTC(2026, 9, 29, 12), T0), B.tcClock_(T0), B.tcDay_(T0)],
      ['12pm PT on 10/28', '5am PT', '6:05am', '10/29']);
    const list = [{ id: QID, name: QNAME }, { id: 2004166364, name: '[G EVENT] OCT26 Google Financial Results' },
      { id: 2004100000, name: '[G EVENT] JUL26 Google Financial Results' }, { id: 2004167929, name: '2026 Election Alerts' }];
    const pick = r => (x => (x.query ? x.query.id : { choices: (x.choices || []).map(q => q.id), near: (x.near || []).map(q => q.id) }))(B.tcMatchQuery_(r, list));
    eq([QNAME.toLowerCase(), '2020 Election Query Results', 'OCT26 2020 election', 'Google Financial Results', 'financial', '2026 Election Alerts', 'snl'].map(pick),
      [QID, QID, QID, 2004166364, { choices: [2004166364, 2004100000], near: [] }, 2004167929, { choices: [], near: [] }]);
    eq([B.tcIssueName_(QNAME), B.tcIssueName_('2026 Election Alerts'), B.tcQueryId_('https://app.brandwatch.com/project/1998344909/dashboards/2050478')],
      ['2020 Election Query Results', '2026 Election Alerts', 0]);
    eq([B.tcPcts_([220, 4393, 2709]), B.tcPcts_([1, 1, 1]), B.tcCompact_(18368), B.tcCompact_(999999), B.tcCompact_(944), B.tcNum_(1234567)],
      [[3, 60, 37], [34, 33, 33], '18.4K', '1M', '944', '1,234,567']);
    eq([B.tcMentionsVolumeText_([]), B.tcMentionsVolumeText_([{ label: 'X', n: 10 }]),
      B.tcMentionsVolumeText_([{ label: 'X', n: 9 }, { label: 'Reddit', n: 1 }]),
      B.tcMentionsVolumeText_([{ label: 'X', n: 994 }, { label: 'Reddit', n: 5 }, { label: 'News', n: 1 }]),
      B.tcEngagementVolumeText_([{ label: 'X', n: 84 }, { label: 'Bluesky', n: 12 }, { label: 'Instagram', n: 3 }, { label: 'Threads', n: 1 }])],
      ['none yet.', 'Mentions are highest on X (100%).', 'Mentions are highest on X (90%), followed by Reddit (10%).',
        'Mentions are highest on X (99%), followed by Reddit (1%) and News (<1%).',
        'Engagement (likes, comments, shares) is highest on X (84%), followed by Bluesky (12%) and Instagram (3%), (other sources: 1%).']);
    eq([B.tcMentionTypesText_([]), B.tcMentionTypesText_([{ label: 'reposts', n: 10 }]),
      B.tcMentionTypesText_([{ label: 'reposts', n: 7 }, { label: 'original posts', n: 3 }]),
      B.tcMentionTypesText_([{ label: 'reposts', n: 58 }, { label: 'comments', n: 28 }, { label: 'original posts', n: 14 }])],
      ['none yet.', 'Mentions are primarily reposts (100%).',
        'Mentions are primarily reposts (70%), with original posts accounting for 30% of all mentions.',
        'Mentions are primarily reposts (58%), followed by comments (28%), with original posts accounting for 14% of all mentions.']);
    eq([B.tcVelocityText_(null, T0), B.tcVelocityText_({ peak: { at: HOUR0, n: 50 }, last: { at: HOUR0, n: 50 }, pct: 0 }, T0)],
      ['Velocity: too early to tell (its first full hour isn\'t over).', 'Velocity is at its peak (50 mentions in the last full hour, 6am PT).']);
    // -100% only for a last hour with none: 1 against a peak of 796 is -99%
    const vel = last => B.tcVelocity_([{ at: HOUR0 - 3 * HOUR, n: 796 }, { at: HOUR0 - 2 * HOUR, n: 300 }, { at: HOUR0 - HOUR, n: last }],
      HOUR0 - 3 * HOUR, HOUR0 + 5 * MIN).pct;
    eq([vel(240), vel(1), vel(0)], [-70, -99, -100]);
    eq([B.tcEngText_({ x: true, likes: 24, replies: 1 }), B.tcEngText_({ x: true, likes: 1, replies: 0 }), B.tcEngText_({ eng: 1 }),
      B.tcEngText_({ eng: 18368 }), B.tcEngText_({ eng: null })],
      ['24 likes, 1 reply', '1 like, 0 replies', '1 engagement', '18.4K engagements', 'no engagement data']);
    // the template's pieces: the title (the hour), velocity, the TL;DR's first sentence, a post's line
    eq([B.tcHourLabel_(T0), B.tcHourLabel_(Date.UTC(2026, 9, 28, 19, 59)), B.tcHourLabel_(Date.UTC(2026, 10, 2, 8))], ['6am', '12pm', '12am']);
    const peakAt = Date.UTC(2026, 9, 28, 19);
    eq([B.tcTemplateVelocity_({ peak: { at: peakAt, n: 796 }, last: { at: HOUR0, n: 240 }, pct: -70 }, T0),
      B.tcTemplateVelocity_({ peak: { at: peakAt, n: 796 }, last: { at: HOUR0, n: 240 }, pct: -70 }, peakAt + 3 * HOUR),
      B.tcTemplateVelocity_({ peak: { at: HOUR0, n: 520 }, last: { at: HOUR0, n: 520 }, pct: 0 }, T0), B.tcTemplateVelocity_(null, T0)],
      ['Velocity is -70% since the peak at 12pm PT on 10/28.', 'Velocity is -70% since the peak at 12pm PT today.',
        'Velocity is at its peak (520 mentions/hr).', 'Velocity is at its peak (its first full hour isn\'t over yet).']);
    const dd = { issue: 'Atlantic Ocean', now: T0, total: 25100, start: { at: HOUR0, why: 'spike' } };
    eq([B.tcLead_(dd), B.tcLead_(Object.assign({}, dd, { start: { at: Date.UTC(2026, 9, 28, 16), why: 'since' } })),
      B.tcLead_(Object.assign({}, dd, { update: { at: Date.UTC(2026, 9, 29, 16, 2), tot: 24446 } }))],
      ['There have been 25,100 total mentions regarding Atlantic Ocean.', 'Since 9am PT on 10/28 there have been 25,100 total mentions regarding Atlantic Ocean.',
        'Since the last update at 9am PT, there have been 654 new mentions (25.1K total mentions) regarding Atlantic Ocean.']);
    eq(B.tcEmailPost_({ source: 'Instagram', author: 'couriernewsroom', text: 'Who won?', url: 'https://www.instagram.com/p/x/', eng: 1600 }),
      { html: '<a href="https://www.instagram.com/p/x/" style="color:#202124;font-weight:bold;text-decoration:underline">couriernewsroom on IG</a>: "Who won?" (1.6K Engagements)',
        text: 'couriernewsroom on IG: "Who won?" (1.6K Engagements) <https://www.instagram.com/p/x/>' });
    eq(B.tcEmailPost_({ source: 'Instagram', author: 'instagram.com', text: 'Who won?', url: 'https://www.instagram.com/p/x/', eng: 1600 }),
      { html: '<a href="https://www.instagram.com/p/x/" style="color:#202124;font-weight:bold;text-decoration:underline">Post on IG</a>: "Who won?" (1.6K Engagements)',
        text: 'Post on IG: "Who won?" (1.6K Engagements) <https://www.instagram.com/p/x/>' });
    eq(B.tcSentText_({ u: '' }, { title: TITLE, update: false, pct: 40 }, { to: ['a@testing.test', 'b@testing.test'], threadId: '18c2f0a1b2c3d4e5' }),
      `${HEAD} *Temp check sent:* ${TITLE} was emailed to a@testing.test and b@testing.test. ` +
      '<https://mail.google.com/mail/u/0/#all/18c2f0a1b2c3d4e5|Open the email>. Brandwatch is still filling the query (40% done), ' +
      'so the counts will grow. Reply "refresh" here for an update.');
    // the bot knows its own posts (even without their ids), and a request is never the Relay's to send while it's ON
    assert.ok(B.isBotFormattedText_(SENT(TITLE)) && B.isBotFormattedText_(`${HEAD} *Temp check:* which Brandwatch query?`));
    assert.ok(!B.isBotFormattedText_(ASK));
    const ctx = on => ({ switches: { tempChecks: on }, botUser: 'users/bot', outboundBlocked: true,
      spaces: { burson: { id: MIRROR, externalUserAllowed: false } } });
    const m = { name: `${MIRROR}/messages/a1`, senderType: 'HUMAN', senderName: 'users/analyst9', text: ASK, thread: `${MIRROR}/threads/a1` };
    eq([B.relayAnalyst_(ctx(true), m), B.relayAnalyst_(ctx(false), m), B.relayAnalyst_(ctx(true), Object.assign({}, m, { text: 'Morning team' }))],
      [false, true, true]);
    eq(B.tempCheckRequestOf_(Object.assign(ctx(true), { spaces: { burson: { id: REAL, externalUserAllowed: true } } }), m), null);
  });

  test('temp checks (new sources step 2c): with rows 49 and 19 ON the mentions a temp check reads are counted in BWL_DAY (Temp checks\' part of "all features"); its requests, its email and its thread posts are byte for byte those of a check with the rows OFF, also when the count cannot be saved', () => {
    const run = mode => {
      const w = world(true);
      const b = w.t.bot;
      let day = null;  // BWL_DAY right after the temp check (later in the run, row 49 OFF on this tab stops the count)
      const orig = b.runTempChecks_;
      b.runTempChecks_ = function () {
        if (mode !== 'off') b.ewsRunSwitches_({ edBwLive: true, earlyWave: true });  // as rows 49 and 19 ON set them
        const r = orig.apply(this, arguments);
        day = JSON.parse(w.t.g.props.get('BWL_DAY') || 'null');
        return r;
      };
      if (mode === 'fail') {
        const set = w.t.g.props.set.bind(w.t.g.props);
        w.t.g.props.set = (k, v) => { if (k === 'BWL_DAY') throw new Error('Service invoked too many times: properties'); return set(k, v); };
      }
      ask(w, ASK);
      return { calls: w.bw.calls.map(c => c.url), mails: JSON.stringify(mails(w.t)), posts: JSON.stringify(posts(w.t, MIRROR).map(m => m.text)), day };
    };
    const off = run('off');
    const on = run('on');
    const fail = run('fail');
    eq([on.calls, on.mails, on.posts], [off.calls, off.mails, off.posts]);
    eq([fail.calls, fail.mails, fail.posts], [off.calls, off.mails, off.posts]);
    assert.ok(JSON.parse(off.mails).length === 1, 'the temp check went out');
    eq([off.day, fail.day, on.day.af], [null, null, { temp: 7 + 2 }]);  // its two reads of mentions returned 7 and 2
  });
};
