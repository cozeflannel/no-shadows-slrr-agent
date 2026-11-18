// Follow-up tab (FollowUp.gs, under Control tab row 21) and its two action switches:
//   row 27  Draft follow-ups (draftFollowUps)
//   row 28  Draft answers to questions (draftAnswers)
'use strict';

const DEPLOYED_4A113FE = require('./control_tab_deployed_4a113fe.json');

module.exports = H => {
  const { test, eq, assert, B, NOW, world, e2e, F, decodeMime, RES, KB } = H;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const STAND_IN = { live: false, standIn: 'tester@testing.test', mailbox: 'bot@runner.test', from: 'Brand Social <bot@runner.test>' };
  const LIVE = { live: true, mailbox: 'im@ops.test', from: 'Brand Social <sender@alerts.test>' };
  const COMMS = 'people-comms@alerts.test';     // People Comms
  const SEARCH_POC = 'search@alerts.test'; // Search alert POCs

  const withSwitches = (w, switches) => {
    const base = w.ctx;
    w.ctx = () => { const c = base(); if (switches !== undefined) c.switches = switches; return c; };
    return w;
  };
  const tracking = (switches, opts) => withSwitches(world(opts || { drafts: STAND_IN }),
     Object.assign({ trackOutcomes: true }, switches || {}));
  const later = (w, minutes) => { w.g.clock.now += minutes * MIN; return w.run(); };
  const sendAlert = (w, text) => {
    const msg = w.paste(text || F.P0_OK);
    const r = w.run();
    return { msg, r, row: w.alertRows()[w.alertRows().length - 1] };
  };
  const draftMessages = w => w.gmail.drafts
    ? Array.from(w.gmail.drafts.values()).filter(d => !d.sent && !d.deleted)
    : w.gmail.calls.filter(c => c.method === 'post' && c.path === 'drafts');

  // ---------------------------------------------------------------------------------------------------------------
  // Deadlines: parsing, business days (ET), and second-draft timing
  // ---------------------------------------------------------------------------------------------------------------

  test('Follow-up deadlines: parses minutes, hours, days, bare hours and 1-5 business days; rejects out-of-range or unreadable strings and falls back to the default with a warning', () => {
    eq(B.followupParseDeadline_('30 minutes'), { ms: 30 * MIN });
    eq(B.followupParseDeadline_('1 hour'), { ms: HOUR });
    eq(B.followupParseDeadline_('4 hours'), { ms: 4 * HOUR });
    eq(B.followupParseDeadline_('4'), { ms: 4 * HOUR });
    eq(B.followupParseDeadline_('1.5 hrs'), { ms: 1.5 * HOUR });
    eq(B.followupParseDeadline_('2 days'), { ms: 2 * DAY });
    eq(B.followupParseDeadline_('1 business day'), { bdays: 1 });
    eq(B.followupParseDeadline_('3 working days'), { bdays: 3 });
    eq(B.followupParseDeadline_('0 minutes'), null);
    eq(B.followupParseDeadline_('8 days'), null);
    eq(B.followupParseDeadline_('6 business days'), null);
    eq(B.followupParseDeadline_('soonish'), null);

    const d = B.followupDeadlines_({ P0: '45 mins', P1: 'not a time', P2: '2 business days' });
    eq(d.P0, { text: '45 mins', ms: 45 * MIN });
    eq(d.P1, { text: '4 hours', bad: 'not a time', ms: 4 * HOUR });
    eq(d.P2, { text: '2 business days', bdays: 2 });
    assert.match(B.followupDeadlineNote_(d.P0), /^A team reply is due 45 min after the Social Alert went out\.$/);
    assert.match(B.followupDeadlineNote_(d.P1), /^⚠️ Couldn't read "not a time": using 4 hours/);
    assert.match(B.followupDeadlineNote_(d.P2), /^A team reply is due the same time 2 weekdays later \(ET; no holidays\)\.$/);
  });

  test('Follow-up business days and second-draft time: Friday -> Monday at the same ET time, Saturday/Sunday -> Monday, and P2\'s second follow-up waits until a day after the Monday deadline', () => {
    // 2026-10-16 is Friday: 14:30 UTC is 10:30 AM EDT
    const fri = Date.UTC(2026, 9, 16, 14, 30);
    const mon = Date.UTC(2026, 9, 19, 14, 30);
    const tue = Date.UTC(2026, 9, 20, 14, 30);
    eq(B.followupBusinessDays_(fri, 1), mon);
    eq(B.followupBusinessDays_(fri, 2), tue);
    // Saturday Oct 17 10:30 AM EDT -> Monday Oct 19 10:30 AM EDT
    const sat = Date.UTC(2026, 9, 17, 14, 30);
    eq(B.followupBusinessDays_(sat, 1), mon);

    // P0 (1h) and P1 (4h): second follow-up is 24h after send; P2 (1 business day >= 24h): 24h after the deadline
    const p0Due = B.followupDue_(fri, 'P0');
    const p2Due = B.followupDue_(fri, 'P2');
    eq([p0Due, B.followupDayAt_(fri, p0Due)], [fri + HOUR, fri + DAY]);
    eq([p2Due, B.followupDayAt_(fri, p2Due)], [mon, mon + DAY]);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Teams, replies, [Team] testing tags, and quote stripping
  // ---------------------------------------------------------------------------------------------------------------

  test('Follow-up teams and replies: planRecipients_ keeps full per-team members; replies map to teams, non-team senders go to Others, and [Team] replies from the stand-in work in testing mode only', () => {
    const w = tracking();
    const { row } = sendAlert(w, F.P0_OK); // Search, P0, LATAM -> Search alert POCs, Regional Leads, Standard CC
    const teams = B.followupTeams_(row).map(t => t.name);
    eq(teams, ['Search alert POCs', 'Regional Leads', 'Standard CC']);

    // In testing mode, the stand-in can send "[Team] ..." replies, including "On it..." before a Gmail quote header
    w.gmail.reply(row.email_thread, {
      from: 'tester@testing.test',
      body: '[GCPA] On it, we are drafting a holding statement.\n\nOn Wed, Oct 14, 2026 at 8:00 AM Brand Social <bot@runner.test> wrote:\n> alert',
    });
    later(w, 30);
    let updated = w.alertRows()[0];
    eq(updated.outcome, 'Comms replied');
    eq(Object.keys(updated.email_input.followup.replied), ['GCPA']);
    eq(updated.email_input.followup.replied.GCPA.who, 'GCPA (testing)');
    const notes = w.analystPosts().filter(m => /^Outcome: /.test(m.text)).map(m => m.text);
    eq(notes, ['Outcome: Comms replied\n- From: GCPA (testing reply on the Social Alert\'s email thread)\n- Message: "On it, we are drafting a holding statement."']);

    // A non-team address maps to Others; a testing "[Search] ..." reply resolves the alert
    w.gmail.reply(row.email_thread, { from: 'Someone Else <random-eng@ops.test>', body: 'Looping in the on-call engineer.' });
    w.gmail.reply(row.email_thread, { from: 'tester@testing.test', body: '[Search] We rolled back the change, it is resolved.' });
    later(w, 30);
    updated = w.alertRows()[0];
    eq(updated.outcome, 'Resolved · Comms replied · Product replied');
    eq(Object.keys(updated.email_input.followup.replied).sort(), ['GCPA', 'Others', 'Search alert POCs']);
    eq(updated.email_input.followup.resolved_by, 'Search alert POCs');

    // In live mode (no stand-in), "[GCPA] ..." from our own mailbox is ignored as our own message, not a team reply
    w.bot.ev('GEN').email.stand_in = '';
    const liveCtx = Object.assign(w.ctx(), { drafts: LIVE });
    const tagLive = w.bot.followupTagOf_(liveCtx, { labels: ['SENT'], headers: { from: 'im@ops.test' }, snippet: '[GCPA] On it' }, updated, B.followupTeams_(updated));
    eq(tagLive, null);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Statuses & concrete Next step rules
  // ---------------------------------------------------------------------------------------------------------------

  test('Follow-up statuses and Next step rules: Not checked yet -> Waiting -> Overdue (with P0/surge/press lead escalation) -> Question waiting -> Answered -> Ask for update at 24h -> Resolved, plus T&S 2-hour check', () => {
    const w = tracking();
    const { row } = sendAlert(w, F.PARIS); // P0 Search + T&S (Violence / Weapons)
    // Before the first 30-min thread read: Not checked yet
    let st = B.followupStatus_(row, w.g.clock.now);
    let tns = B.followupTnsText_(row, w.g.clock.now);
    eq(st.status, 'Not checked yet');
    eq(B.followupNextStep_(st, tns, w.g.clock.now), 'Nothing yet: wait for its thread to be read');
    assert.match(tns.text, /waiting for the confirmation$/);

    // At 30 min: checked, no replies yet, inside P0's 1h deadline -> Waiting
    later(w, 30);
    let cur = w.alertRows()[0];
    st = B.followupStatus_(cur, w.g.clock.now);
    eq(st.status, 'Waiting');
    assert.match(B.followupStatusText_(st, w.g.clock.now), /^Waiting: a reply is due by Oct 14, 9:00 AM \(P0: 1 hour\)$/);
    assert.match(B.followupNextStep_(st, B.followupTnsText_(cur, w.g.clock.now), w.g.clock.now), /^Nothing yet: a reply is due by Oct 14, 9:00 AM$/);

    // At 2 hours with no reply and no T&S confirmation -> Overdue (P0 lead escalation + T&S check)
    later(w, 90);
    cur = w.alertRows()[0];
    st = B.followupStatus_(cur, w.g.clock.now);
    tns = B.followupTnsText_(cur, w.g.clock.now);
    eq([st.status, tns.check], ['Overdue', true]);
    assert.match(B.followupStatusText_(st, w.g.clock.now), /^Overdue: no reply seen on the thread in 2 h \(P0: 1 hour\)$/);
    assert.match(B.followupNextStep_(st, tns, w.g.clock.now),
      /^Escalate to the on-shift lead now \(a P0 with no reply\), and follow up with .+ · check the T&S submission went through$/);

    // T&S confirmation arrives -> records tns_at and clears the T&S check
    w.gmail.receive('WD Intake Request - Marketing', 'Submitted link: https://x.com/paris_tech_press/status/1845000000000000003');
    later(w, 1);
    cur = w.alertRows()[0];
    tns = B.followupTnsText_(cur, w.g.clock.now);
    eq(tns.check, false);
    assert.match(tns.text, /confirmed 2 h 1 min after the send$/);

    // A team asks a question on the thread -> Question waiting
    w.gmail.reply(cur.email_thread, { from: 'tester@testing.test', body: '[People Comms] Thanks for flagging. Do we have an approved holding statement for this?' });
    later(w, 29);
    cur = w.alertRows()[0];
    st = B.followupStatus_(cur, w.g.clock.now);
    eq(st.status, 'Question waiting');
    eq(B.followupNextStep_(st, tns, w.g.clock.now),
      'Answer People Comms\'s question: "Thanks for flagging. Do we have an approved holding statement for this?"');

    // Someone on our side answers on the thread -> Answered (not resolved yet)
    w.gmail.reply(cur.email_thread, { from: 'tester@testing.test', body: 'Yes, sharing the holding statement doc now. Let me know if you need anything else.' });
    later(w, 30);
    cur = w.alertRows()[0];
    st = B.followupStatus_(cur, w.g.clock.now);
    eq(st.status, 'Answered');
    assert.match(B.followupNextStep_(st, tns, w.g.clock.now),
      /^Nothing yet: People Comms replied; ask for an update if it isn't resolved by Oct 15, 8:00 AM$/);

    // 24 hours after the send while still not resolved -> Next step says "Ask People Comms for an update"
    later(w, 22 * 60);
    cur = w.alertRows()[0];
    st = B.followupStatus_(cur, w.g.clock.now);
    eq(B.followupNextStep_(st, tns, w.g.clock.now), 'Ask People Comms for an update');

    // Team marks it resolved -> Resolved ("None: closed") (after 6h, Outcomes checks every 2h)
    w.gmail.reply(cur.email_thread, { from: `Search PR <${SEARCH_POC}>`, body: 'This is resolved now, the post was corrected.' });
    later(w, 120);
    cur = w.alertRows()[0];
    st = B.followupStatus_(cur, w.g.clock.now);
    eq([st.status, B.followupNextStep_(st, tns, w.g.clock.now)], ['Resolved', 'None: closed']);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Row 27: Draft follow-ups (overdue + 24h second draft, testing stand-in guard, open follow-up Social Alert guard)
  // ---------------------------------------------------------------------------------------------------------------

  test('Row 27 (Draft follow-ups): creates one Gmail draft at overdue and one more at 24h while unresolved, never sends them, addresses only tester@testing.test while testing, and holds back if a follow-up Social Alert is still open on the thread', () => {
    const w = tracking({ draftFollowUps: true });
    const { row } = sendAlert(w, F.P0_OK); // P0: due in 1 hour
    const sentBefore = w.gmail.sentMessages().length;

    // watchOutcome_ scheduled the first check at the 30-min mark, then followThrough_ moves the next check to the 1h deadline
    later(w, 30);
    eq(w.gmail.calls.filter(c => c.method === 'post' && c.path === 'drafts').length, 0);

    // At 60 min (the 1h P0 deadline): creates the 'overdue' follow-up draft in Gmail Drafts (never sent)
    const rOverdue = later(w, 30);
    const createCalls = () => w.gmail.calls.filter(c => c.method === 'post' && c.path === 'drafts');
    eq([createCalls().length, w.gmail.sentMessages().length, rOverdue.errors], [1, sentBefore, []]);
    const mime1 = decodeMime(createCalls()[0].body.message.raw);
    eq([mime1.to, mime1.cc, createCalls()[0].body.message.threadId], [['tester@testing.test'], [], row.email_thread]);
    assert.match(mime1.text, /Following up on this Social Alert.*a P0 reply is expected within 1 hour/s);
    assert.match(mime1.text, /Testing: live, this reply would go to everyone the Social Alert went to\. It's a draft: nothing was sent\./);

    let cur = w.alertRows()[0];
    let st = B.followupStatus_(cur, w.g.clock.now);
    assert.match(B.followupNextStep_(st, B.followupTnsText_(cur, w.g.clock.now), w.g.clock.now),
      /follow-up drafted Oct 14, 9:00 AM$/);

    // Subsequent runs before 24h never create another overdue draft
    later(w, 60);
    later(w, 120);
    eq(createCalls().length, 1);

    // If a follow-up Social Alert on the same thread is still pending in Drafts.gs, row 27 holds back at 24h
    w.ctx().store.addAlert({
      alert_id: 'QA-FOLLOWUP-OPEN', email_thread: row.email_thread, email_status: 'pending', email_at: w.g.clock.now,
    });
    w.ctx().memo.set('open_drafts', JSON.stringify(['QA-FOLLOWUP-OPEN']));
    later(w, 20 * 60); // 24h reached
    eq(createCalls().length, 1);

    // Once the follow-up Social Alert is no longer open, the next read creates the 'day' (second) follow-up draft, once
    w.ctx().memo.set('open_drafts', JSON.stringify([]));
    later(w, 120);
    eq([createCalls().length, w.gmail.sentMessages().length], [2, sentBefore]);
    const mime2 = decodeMime(createCalls()[1].body.message.raw);
    eq(mime2.to, ['tester@testing.test']);
    assert.match(mime2.text, /Checking in on this Social Alert.*we still haven't seen a reply on this thread/s);

    cur = w.alertRows()[0];
    st = B.followupStatus_(cur, w.g.clock.now);
    assert.match(B.followupNextStep_(st, B.followupTnsText_(cur, w.g.clock.now), w.g.clock.now),
      /follow-up drafted Oct 14, 9:00 AM · second follow-up drafted Oct 15, 10:00 AM$/);

    // Never creates a third draft
    later(w, 120);
    eq(createCalls().length, 2);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Row 28: Draft answers to questions (high-confidence Gemini draft vs. needs an IM)
  // ---------------------------------------------------------------------------------------------------------------

  test('Row 28 (Draft answers to questions): reads the full message body, drafts a reply when Gemini can answer with confidence >= 0.9, and makes no draft ("needs an IM: …") when Gemini cannot answer from context', () => {
    const w = tracking({ draftAnswers: true }, { drafts: STAND_IN, resources: RES, files: KB });
    const { row } = sendAlert(w, F.P0_OK);
    const createCalls = () => w.gmail.calls.filter(c => c.method === 'post' && c.path === 'drafts');

    // Team asks a question whose full body is longer than the 200-char Gmail snippet
    const tail = ' Also, please confirm which regional teams and alert POCs were included when this was escalated so we can coordinate with them today?';
    const fullBody = `[GCPA] Why did the bot escalate this post?${' We want to align our regional response with the escalation criteria.'.repeat(2)}${tail}`;
    w.gmail.reply(row.email_thread, { from: 'tester@testing.test', body: fullBody });

    let capturedPrompt = '';
    w.vertex.teamAnswer = payload => {
      capturedPrompt = payload.contents[0].parts[0].text;
      return {
        can_answer: true,
        confidence: 0.95,
        answer: 'This post was escalated as a P0 under Product - Perceived bias, which routes to Search alert POCs and Regional Leads.',
        missing: '',
      };
    };

    later(w, 30);
    assert.ok(capturedPrompt, 'teamAnswer was called');
    assert.match(capturedPrompt, /coordinate with them today\?"$/);
    eq([createCalls().length, w.gmail.sentMessages().length], [1, 1]);
    const mime = decodeMime(createCalls()[0].body.message.raw);
    eq(mime.to, ['tester@testing.test']);
    assert.match(mime.text, /This post was escalated as a P0 under Product - Perceived bias/);

    let cur = w.alertRows()[0];
    let st = B.followupStatus_(cur, w.g.clock.now);
    assert.match(B.followupNextStep_(st, B.followupTnsText_(cur, w.g.clock.now), w.g.clock.now),
      /answer drafted Oct 14, 8:30 AM$/);

    // Our side replies on the thread, clearing the first question; then a second question asks something outside context
    w.gmail.reply(row.email_thread, { from: 'tester@testing.test', body: 'Sent the details above.' });
    w.gmail.reply(row.email_thread, { from: 'tester@testing.test', body: '[Search] Did the VP approve taking down the blog post yet?' });
    w.vertex.teamAnswer = () => ({
      can_answer: false,
      confidence: 0.92,
      answer: '',
      missing: 'whether the VP approved taking down the blog post',
    });

    later(w, 30);
    eq(createCalls().length, 1); // no second draft created
    cur = w.alertRows()[0];
    st = B.followupStatus_(cur, w.g.clock.now);
    eq(st.status, 'Question waiting');
    assert.match(B.followupNextStep_(st, B.followupTnsText_(cur, w.g.clock.now), w.g.clock.now),
      /needs an IM: whether the VP approved taking down the blog post$/);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Follow-up tab: creation, layout, 7-day summary, by-team table, and user edits in B5:B7
  // ---------------------------------------------------------------------------------------------------------------

  test('Follow-up tab: not created while row 21 is OFF; created after Results when ON, shows both spaces, preserves user edits in B5:B7, and applies edited deadlines to statuses and row 27 drafts', () => {
    const t = e2e();
    t.bot.setup();
    t.set('B30', 'tester@testing.test');
    t.g.pages.set('https://bigquery.googleapis.com/bigquery/v2/projects/brand-social-central-data/queries',
      { code: 200, body: { jobComplete: true, schema: { fields: [] }, rows: [] } });
    t.poll();
    eq(t.sheet().getSheetByName('Follow-up'), null);

    // Turn ON row 21 (Track post-alert outcomes) and row 27 (Draft follow-ups)
    t.control().getRange(21, 2).setValue('ON');
    t.control().getRange(27, 2).setValue('ON');
    t.chat.say(H.TEST_FEED, F.P0_OK, { sender: 'users/bot' });
    t.poll();

    const sh = t.sheet().getSheetByName('Follow-up');
    assert.ok(sh, 'Follow-up tab created');
    const names = t.sheet().getSheets().map(s => s.getName());
    eq(names.indexOf('Follow-up'), names.indexOf('Results') + 1);
    eq([sh.cell(5, 1), sh.cell(5, 2), sh.cell(6, 1), sh.cell(6, 2), sh.cell(7, 1), sh.cell(7, 2)],
      ['P0', '1 hour', 'P1', '4 hours', 'P2', '1 business day']);

    // A person edits B5 (P0 deadline) to "2 hours" and B6 (P1 deadline) to an invalid string "whenever"
    sh.getRange(5, 2).setValue('2 hours');
    sh.getRange(6, 2).setValue('whenever');

    // 15 minutes later: rebuilds Follow-up tab (10-min quiet refresh), reading B5:B7 into FOLLOWUP_DEADLINES
    t.g.clock.now += 15 * MIN;
    t.poll();
    eq([sh.cell(5, 2), sh.cell(6, 2), sh.cell(7, 2)], ['2 hours', 'whenever', '1 business day']); // user edits preserved!
    assert.match(sh.cell(5, 3), /^A team reply is due 2 h after the Social Alert went out\.$/);
    assert.match(sh.cell(6, 3), /^⚠️ Couldn't read "whenever": using 4 hours/);

    // At 60 minutes after send: still Waiting under the 2-hour P0 deadline, so no overdue draft yet
    t.g.clock.now += 45 * MIN;
    t.poll();
    const headRow = sh.rows.findIndex(r => r[0] === 'Sent (ET)' && r[8] === 'Status');
    assert.ok(headRow > 0);
    assert.match(sh.rows[headRow + 1][8], /^Waiting: a reply is due by Oct 14, 10:02 AM \(P0: 2 hours\)$/);

    // At 2 hours after send: now Overdue under the edited 2-hour deadline, and row 27 drafts the follow-up
    t.g.clock.now += 65 * MIN;
    t.poll();
    assert.match(sh.rows[headRow + 1][8], /^Overdue: no reply seen on the thread/);
    assert.match(sh.rows[headRow + 1][9], /follow-up drafted/);
  });

  test('Follow-up tab: a "Follow-up" tab people made is never read or written (no protection added, C21 says it\'s in the way); once renamed, the bot makes its own (title in A1) and leaves theirs as it was', () => {
    const t = e2e();
    t.bot.setup();
    t.g.pages.set('https://bigquery.googleapis.com/bigquery/v2/projects/brand-social-central-data/queries',
      { code: 200, body: { jobComplete: true, schema: { fields: [] }, rows: [] } });
    const theirs = t.sheet().insertSheet('Follow-up');
    theirs.getRange(1, 1, 3, 2).setValues([['My follow-ups', 'Owner'], ['Pixel battery post', 'Dana'], ['P0', '45 minutes']]);
    const before = JSON.stringify(theirs.rows);
    t.control().getRange(21, 2).setValue('ON');
    t.chat.say(H.TEST_FEED, F.P0_OK, { sender: 'users/bot' });
    t.poll();
    for (let i = 0; i < 2; i++) { t.g.clock.now += 11 * MIN; t.poll(); }
    eq([JSON.stringify(theirs.rows), theirs.protections.length, t.sheet().getSheets().filter(s => s.getName() === 'Follow-up').length],
      [before, 0, 1]);
    eq(t.g.props.get('FOLLOWUP_BLOCKED'), 'true');
    assert.match(t.control().cell(21, 3), / · Follow-up tab not updated: a "Follow-up" tab the bot didn't make is in the way \(rename it\)$/);

    theirs.setName('My follow-ups');
    t.g.clock.now += MIN;
    t.poll();
    const mine = t.sheet().getSheetByName('Follow-up');
    assert.ok(mine && mine !== theirs, 'the bot made its own tab');
    eq([mine.cell(1, 1), mine.cell(5, 2), mine.protections.length, JSON.stringify(theirs.rows)],
      [B.ev('FOLLOWUP_TITLE_'), '1 hour', 1, before]);
    eq(t.g.props.get('FOLLOWUP_BLOCKED'), undefined);
    t.g.clock.now += MIN;
    t.poll();
    assert.doesNotMatch(t.control().cell(21, 3), /tab the bot didn't make/);
  });

  // ---------------------------------------------------------------------------------------------------------------
  // Deployed Control tab migration (deployed-2026-10-23 / 4a113fe)
  // ---------------------------------------------------------------------------------------------------------------

  for (const [label, variant] of [['all switches OFF', DEPLOYED_4A113FE.all_off], ['live_today (B25 and B26 set, 11 switches ON)', DEPLOYED_4A113FE.live_today]]) {
    test(`Control tab migration from deployed-2026-10-23 (4a113fe), ${label}: rows 1-26 (including B25:C26) stay intact without dropdowns on B25/B26, rows 27-29 are added OFF with dropdowns (C29: Testing), row 31 the BigQuery lookback (60 minutes, with its dropdown), and "How it works" moves to row 33`, () => {
      const t = e2e();
      t.bot.setup();
      const sh = t.control();
      sh.rows = JSON.parse(JSON.stringify(variant.rows));
      sh.validations = {};
      Object.entries(variant.validations).forEach(([k, values]) => { sh.validations[k] = { values }; });

      t.poll();
      for (let r = 11; r <= 24; r++) {
        eq(sh.cell(r, 2), variant.on.includes(r) ? 'ON' : 'OFF', `row ${r} value`);
      }
      eq([sh.cell(25, 1), sh.cell(25, 2), sh.cell(26, 1), sh.cell(26, 2)],
        ['S-F Burson space', variant.b25, 'Burson test copy', variant.b26]);
      eq(sh.validations['25,2'], undefined);
      eq(sh.validations['26,2'], undefined);
      eq([sh.cell(27, 1), sh.cell(27, 2), sh.cell(28, 1), sh.cell(28, 2), sh.cell(29, 1), sh.cell(29, 2)],
        ['Draft follow-ups', 'OFF', 'Draft answers to questions', 'OFF', 'Safety valve', 'OFF']);
      eq([sh.validations['27,2'].values, sh.validations['28,2'].values, sh.validations['29,2'].values],
        [['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF']]);
      // never LIVE by the update alone: B26 set (live_today), or no S-F Burson (all OFF)
      assert.match(sh.cell(29, 3), variant.b26 ? /^OFF · 🧪 Testing \(the Burson test copy, B26, is set\)/ : /^OFF · 🧪 Testing \(/);
      assert.ok(!/^🔴 LIVE/.test(t.get('B5')), t.get('B5'));
      const BAR_SPECS = B.ev('FT_BAR_SPECS_');
      const barRow = r => { const s = BAR_SPECS.find(x => x.row === r); return [s.label, s.seedText, B.ftBarFrom_(s, s.seedText).note]; };
      eq([sh.cell(30, 1), sh.cell(30, 2), sh.cell(31, 1), sh.cell(31, 2), sh.cell(32, 1), sh.cell(32, 2), sh.cell(32, 3), sh.cell(33, 1),
        sh.cell(33, 2), sh.cell(34, 1), sh.cell(34, 2), sh.cell(34, 3), sh.cell(35, 1), sh.cell(35, 2), sh.cell(35, 3), sh.cell(36, 1),
        sh.cell(36, 2), sh.cell(36, 3), sh.cell(37, 1), sh.cell(37, 2), sh.cell(37, 3), sh.cell(38, 1), sh.cell(38, 2), sh.cell(38, 3),
        sh.cell(39, 1), sh.cell(39, 2), sh.cell(39, 3), sh.cell(40, 1), sh.cell(40, 2), sh.cell(40, 3),
        [sh.cell(41, 1), sh.cell(41, 2), sh.cell(41, 3)], [sh.cell(42, 1), sh.cell(42, 2), sh.cell(42, 3)],
        [sh.cell(43, 1), sh.cell(43, 2), sh.cell(43, 3)], [sh.cell(44, 1), sh.cell(44, 2), sh.cell(44, 3)],
        [sh.cell(45, 1), sh.cell(45, 2), sh.cell(45, 3)],
        sh.cell(46, 1), sh.cell(46, 2), sh.cell(46, 3), [sh.cell(47, 1), sh.cell(47, 2), sh.cell(47, 3)],
        [sh.cell(48, 1), sh.cell(48, 2), sh.cell(48, 3)], [sh.cell(49, 1), sh.cell(49, 2), sh.cell(49, 3)], [sh.cell(50, 1), sh.cell(50, 2), sh.cell(50, 3)], [sh.cell(51, 1), sh.cell(51, 2), sh.cell(51, 3)], sh.cell(52, 1), sh.cell(53, 1),
        [sh.cell(54, 1), sh.cell(54, 2), sh.cell(54, 3)], [sh.cell(55, 1), sh.cell(55, 2), sh.cell(55, 3)], sh.cell(56, 1), sh.cell(57, 1)],
        ['Testing: send to', '', 'BigQuery lookback', '60 minutes', 'Work directly in B25 (Google-only)', 'OFF',
          B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 32)), 'Other alerts space', '', 'Proactive watch', 'OFF',
          B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 34)), 'Watch alerts', 'OFF', B.pwAlertsOffText_(), 'Temp checks',
          'OFF', B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 36)), 'Group test emails', 'OFF',
          B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 37)), 'Fast triage (Gemini Decisions)', 'OFF',
          B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 38)), 'Fast triage: rank and early watch', 'OFF',
          B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 39)), 'Fast triage: hold back noise', 'OFF',
          B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 40)),
          barRow(41), barRow(42), barRow(43), barRow(44), barRow(45),
          'Write early-wave records to BigQuery', 'OFF',
          B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 46)), barRow(47),
          ['Early Detection: also read the AMIE table', 'OFF', B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 48))],
          ['Early Detection: also read Brandwatch live (not X)', 'OFF', B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 49))],
          ['Proactive watch: also read the AMIE table', 'OFF', B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 50))],
          ['Open engine: judgment in place of caps', 'OFF', B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 51))],
          '', '',
          ['Live dashboard', 'OFF', B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 54))],
          ['Slide deliveries', 'OFF', B.switchOffText_(B.ev('CONTROL_SWITCHES_').find(s => s.row === 55))],
          'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is a switch now (it was blank)
      eq([sh.validations['32,2'].values, sh.validations['33,2'], sh.validations['34,2'].values, sh.validations['36,2'].values, sh.validations['37,2'].values,
        sh.validations['38,2'].values, sh.validations['39,2'].values, sh.validations['40,2'].values, sh.validations['46,2'].values, sh.validations['48,2'].values, sh.validations['49,2'].values, sh.validations['50,2'].values, sh.validations['51,2'].values,
        sh.validations['54,2'].values, sh.validations['55,2'].values],
      [['ON', 'OFF'], undefined, ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'], ['ON', 'OFF'],
        ['ON', 'OFF'], ['ON', 'OFF']]);  // rows 32, 34, 36-40, 46, 48-51, 54 and 55 are switches: OFF until a person turns them ON; B33 a space
      // B35 (Watch alerts): OFF, with its own dropdown; only a person chooses where the watch's alerts go
      eq(sh.validations['35,2'].values, ['OFF', 'Other alerts space (B33)', 'Mirror space (B9)', 'Auto-correct space (B10)']);
      // B31 (a help line's row on the deployed tab) gets its 15 / 30 / 45 / 60 minutes dropdown, and C31 says what the bot uses
      eq([sh.validations['31,2'].values, sh.cell(31, 3)], [['15 minutes', '30 minutes', '45 minutes', '60 minutes'], B.bqLookbackFrom_('60 minutes').note]);
      const help = B.ev('CONTROL_HELP_');
      eq(help.map((_, i) => sh.cell(58 + i, 1)), help);
      for (let r = 58 + help.length; r <= sh.rows.length; r++) {
        eq([sh.cell(r, 1), sh.cell(r, 2), sh.cell(r, 3)], ['', '', ''], `leftover row ${r}`);
      }
    });
  }
};
