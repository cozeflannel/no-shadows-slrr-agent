/**
 * Tests for the Control tab's "Testing: send to" cell (row 30, B30/C30), any-domain tester support, blank-B30 hold
 * behavior, and dynamic runtime loading of the read-only `Brand safety groups` worksheet (`BrandSafetyGroups.gs`).
 */
'use strict';
const POSTS = require('./posts.json');

module.exports = function ({ assert, F, B, NOW, test, eq, world, e2e, decodeMime, TEST_FEED }) {
  const MIN = 60 * 1000;
  const WAYMO = '2111814207448514693';
  const X_API = id => `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${B.xEmbedToken_(id)}`;
  const xPost = (id, likes) => JSON.stringify(Object.assign({}, POSTS.x_original, { id_str: id, favorite_count: likes, mediaDetails: [] }));
  const setPost = (w, id, likes) => { w.g.pages.set(X_API(id), xPost(id, likes)); w.g.cache.delete('post:x:' + id); };
  const withSwitches = (w, switches) => {
    const base = w.ctx;
    w.ctx = () => { const c = base(); if (switches !== undefined) c.switches = Object.assign(c.switches || {}, switches); return c; };
    return w;
  };

  test('testers (B30): up to 5 valid email addresses of any domain, in the order written, each once, in lower case; malformed tokens and extras past 5 are set aside', () => {
    const p1 = B.testersFrom_('Alice <ALICE@testing.test>; bob@external-org.test, Carol <carol@PERSONAL.test>\n' +
      'dave@agency.test  erin@ops.test, alice@testing.test, frank@testing.test, grace@testing.test');
    eq(p1.testers, ['alice@testing.test', 'bob@external-org.test', 'carol@personal.test', 'dave@agency.test', 'erin@ops.test']);
    eq(p1.used, ['alice@testing.test', 'bob@external-org.test', 'carol@personal.test', 'dave@agency.test', 'erin@ops.test']);
    eq(p1.over, ['frank@testing.test', 'grace@testing.test']);
    eq([p1.invalid, p1.real, p1.blank], [[], [], false]);

    const p2 = B.testersFrom_('tester1@testing.test, someone@personal-mail.test, bad@nodomain, not-an-address, Another <tester2@corp.test>');
    eq(p2.testers, ['tester1@testing.test', 'someone@personal-mail.test', 'tester2@corp.test']);
    eq(p2.invalid, ['bad@nodomain']);
  });

  test('testers (B30): every real recipient address from Brand safety groups is refused (distros, standard CC, leads, Brand Social sender, T&S urgent)', () => {
    const gen = B.ev('GEN');
    eq(gen.email.stand_in, '');
    const realSet = B.realRecipientSet_();
    assert.ok(realSet.has('tns-urgent@alerts.test'));
    assert.ok(realSet.has('lead1@alerts.test'));
    assert.ok(realSet.has('lead2@alerts.test'));
    assert.ok(realSet.has('sender@alerts.test'));
    assert.ok(realSet.has('search@alerts.test'));

    const p = B.testersFrom_('qa@testing.test, lead2@alerts.test, tns-urgent@alerts.test, sender@alerts.test, helper@external.test');
    eq(p.testers, ['qa@testing.test', 'helper@external.test']);
    eq(p.real, ['lead2@alerts.test', 'tns-urgent@alerts.test', 'sender@alerts.test']);
  });

  test('testers (B30): C30 says who gets emails while Testing; blank or unusable B30 returns [] and explains nothing is sent until B30 has an address', () => {
    const t = e2e(null, { blankStandIn: true });
    t.bot.setup();
    eq(t.get('C30'), 'Blank: while Testing, enter up to 5 email addresses (comma-separated) to receive test emails and alerts (nothing is sent while B30 is blank)');

    const sh = t.control();
    eq(t.bot.testersFor_('one@testing.test, two@external.test', sh).testers, ['one@testing.test', 'two@external.test']);
    eq(t.get('C30'), '\u2713 While Testing, every email goes only to one@testing.test, two@external.test');

    eq(t.bot.testersFor_('a@testing.test, b@testing.test, c@testing.test, d@testing.test, e@testing.test, f@testing.test, bad@nodomain, lead2@alerts.test', sh).testers,
      ['a@testing.test', 'b@testing.test', 'c@testing.test', 'd@testing.test', 'e@testing.test']);
    eq(t.get('C30'), '\u2713 While Testing, every email goes only to a@testing.test, b@testing.test, c@testing.test, d@testing.test, e@testing.test \u00b7 ' +
      'invalid email (skipped): bad@nodomain \u00b7 real recipient (refused): lead2@alerts.test \u00b7 past the first 5 (skipped): f@testing.test');

    eq(t.bot.testersFor_('bad@nodomain', sh).testers, []);
    eq(t.get('C30'), '\u26a0\ufe0f No usable email address: nothing is sent while Testing until you enter up to 5 email addresses in B30 \u00b7 invalid email (skipped): bad@nodomain');

    eq(t.bot.testersFor_('just words here', sh).testers, []);
    eq(t.get('C30'), '\u26a0\ufe0f No usable email address: nothing is sent while Testing until you enter up to 5 email addresses in B30');
  });

  test('testers: Gmail\'s lock covers the whole list (To, Cc and Bcc), refuses anyone else and an email to no one; a list with nobody on it locks everything; only \'\' (LIVE) opens it', () => {
    const mimeFor = (to, cc = [], bcc = []) => B.buildMime_({ from: 'bot@runner.test', to, cc, bcc, subject: 'S', text: 'T', html: '<p>T</p>' });
    B.onlyToGuard_(mimeFor(['a@testing.test'], ['b@testing.test']), ['a@testing.test', 'b@testing.test']);
    assert.throws(() => B.onlyToGuard_(mimeFor(['a@testing.test', 'c@testing.test']), ['a@testing.test', 'b@testing.test']),
      /Testing: emails go only to a@testing\.test and b@testing\.test\. This one was addressed to c@testing\.test, so it was not sent\./);
    assert.throws(() => B.onlyToGuard_(mimeFor([]), ['a@testing.test']),
      /Testing: emails go only to a@testing\.test\. This one was addressed to no one, so it was not sent\./);
    assert.throws(() => B.onlyToGuard_(mimeFor(['tester@testing.test']), []),
      /Testing: emails go only to nobody@testing\.invalid\. This one was addressed to tester@testing\.test, so it was not sent\./);
    B.onlyToGuard_(mimeFor(['anyone@alerts.test']), '');
  });

  test('testers in a run: buildCtx_ gives the flow this run\'s testers (B30), Gmail locked to all of them; LIVE never has any; the DM rule is the same list', () => {
    const t = e2e(null, { noWait: true });
    t.bot.setup();
    t.set('B30', 'one@testing.test, second@external.test');
    t.chat.addDm('one@testing.test', 'spaces/DMEX');
    t.chat.addDm('second@external.test', 'spaces/DMSEC');
    t.chat.addDm('lead2@alerts.test', 'spaces/DMJON');
    t.chat.say(TEST_FEED, F.PARIS, { sender: 'users/bot' });
    t.poll();
    eq(t.chat.botPosts('spaces/DMEX').length, 1);
    eq(t.chat.botPosts('spaces/DMSEC').length, 1);
    eq(t.chat.botPosts('spaces/DMJON').length, 0);
  });

  test('testers: the test Social Alert is one email to all of them (all in To, nothing in Cc or Bcc), with the line naming who it would have gone to; 24h watch updates go to all of them too', () => {
    const testers = ['tester@testing.test', 'two@external.test', 'third@testing.test'];
    const w = withSwitches(world({ noWait: true, post: true, drafts: { standIn: testers[0], testers, live: false, mailbox: 'bot@runner.test', from: 'Brand Social <sender@alerts.test>' } }),
      { watchSent: true, draftFollowUps: true });
    setPost(w, WAYMO, 46);
    w.paste(F.WAYMO_KOF);
    w.run();
    const sent = w.gmail.sentMessages();
    eq(sent.length, 1);
    eq([sent[0].to, sent[0].cc, sent[0].bcc], [testers, [], []]);
    assert.match(sent[0].text, /Would have gone to: To: /);

    setPost(w, WAYMO, 120000);
    w.g.clock.now += 30 * MIN;
    w.run();
    const after = w.gmail.sentMessages();
    eq(after.length, 2);
    eq([after[1].to, after[1].cc, after[1].bcc], [testers, [], []]);
    const notes = w.analystPosts().filter(m => m.threadReply && /^Update: /.test(m.text)).map(m => m.text);
    assert.ok(notes.some(n => n.includes('(testing: only to the testers).')));
  });

  test('testers: the escalation-protocol message goes to each of them, by Chat DM where the bot has one with them, and to the others in one email', () => {
    const testers = ['tester@testing.test', 'two@testing.test', 'third@testing.test'];
    const w = world({ noWait: true, drafts: { standIn: testers[0], testers, live: false, mailbox: 'tester@testing.test', from: 'Brand Social <sender@alerts.test>' } });
    w.chat.addDm('two@testing.test', 'spaces/DMEX');
    const msg = w.paste(F.PARIS);
    const r = w.run();
    assert.ok(w.chat.botReactions(msg.name).includes('\ud83e\uddd1\u200d\ud83d\udcbb'));
    eq(w.chat.botPosts('spaces/DMEX').length, 1);
    const leadEmails = w.gmail.sentMessages().filter(m => /Escalation protocol/.test(m.subject));
    eq(leadEmails.map(m => m.to), [['tester@testing.test', 'third@testing.test']]);
    assert.match(leadEmails[0].text, /Chat can't DM tester@testing\.test and third@testing\.test \(no direct message with the bot's account\), so it came by email\.$/);
    eq(r.notices || [], []);
  });

  test('testers: with Auto-submit T&S form ON, the urgent test email goes to all of them in one email, and the note under the alert names them', () => {
    const testers = ['tester@testing.test', 'two@external.test'];
    const w = withSwitches(world({ noWait: true, drafts: { standIn: testers[0], testers, live: false, mailbox: 'bot@runner.test', from: 'Brand Social <sender@alerts.test>' } }),
      { autoTns: true });
    w.chat.addDm('tester@testing.test', 'spaces/DML');
    w.chat.addDm('two@external.test', 'spaces/DME');
    w.bot.setupTnsTestForm();
    w.paste(F.PARIS);
    w.run();
    const urgent = w.gmail.sentMessages().filter(m => /^URGENT T&S:/.test(m.subject));
    eq(urgent.map(m => m.to), [testers]);
    assert.match(urgent[0].text, /Testing: this went only to the testers\. Live it goes to tns-urgent@alerts\.test\./);
    const notes = w.analystPosts().filter(m => m.threadReply);
    assert.ok(notes.some(m => m.text.includes('The alert regarding viral KOF, AI hallucination has been submitted to T&S for review.')));
  });

  test('testers: on a Social Alert\'s thread a "[Team] ..." reply from any tester counts as that team\'s; a tester\'s other message is our side; anyone else is Others', () => {
    const testers = ['tester@testing.test', 'two@testing.test'];
    const w = withSwitches(world({ noWait: true, drafts: { standIn: testers[0], testers, live: false, mailbox: 'tester@testing.test', from: 'Brand Social <sender@alerts.test>' } }),
      { trackOutcomes: true, draftFollowUps: true, draftAnswers: true });
    w.paste(F.P0_OK);
    w.run();
    const row = w.alertRows()[0];
    w.gmail.reply(row.email_thread, { from: 'Second Tester <two@testing.test>',
      body: '[GCPA] Do we have a holding statement for this post?' });
    w.g.clock.now += 30 * MIN;
    w.run();
    let cur = w.alertRows()[0];
    eq(cur.outcome, 'Comms replied');
    eq(Object.keys(cur.email_input.followup.replied), ['GCPA']);
    eq(B.followupStatus_(cur, w.g.clock.now).status, 'Question waiting');

    w.gmail.reply(row.email_thread, { from: 'Second Tester <two@testing.test>',
      body: 'Yes, sharing the holding statement shortly.' });
    w.g.clock.now += 30 * MIN;
    w.run();
    cur = w.alertRows()[0];
    eq(cur.outcome, 'Comms replied');
    eq(Object.keys(cur.email_input.followup.replied), ['GCPA']);
    eq(B.followupStatus_(cur, w.g.clock.now).status, 'Answered');

    w.gmail.reply(row.email_thread, { from: 'Random <random-eng@ops.test>',
      body: 'Looking into it.' });
    w.g.clock.now += 30 * MIN;
    w.run();
    cur = w.alertRows()[0];
    eq(Object.keys(cur.email_input.followup.replied).sort(), ['GCPA', 'Others']);
  });

  test('testers end to end (poll()): B30 accepts any email domain; cleared B30 holds Social Alerts in pending until an email is entered in B30; C30 updates even while paused', () => {
    const t = e2e(null, { noWait: true, blankStandIn: true });
    t.bot.setup();
    t.set('B30', 'one@testing.test, second@external-org.test, bad@nodomain');
    t.chat.say(TEST_FEED, F.AIO, { sender: 'users/bot' });
    t.poll();
    eq(t.get('C30'), '\u2713 While Testing, every email goes only to one@testing.test, second@external-org.test \u00b7 invalid email (skipped): bad@nodomain');
    assert.match(t.get('C29'), /every email goes only to one@testing\.test, second@external-org\.test \(B30\)/);
    const sent1 = t.g.gmail.sentMessages();
    eq(sent1.length, 1);
    eq(sent1[0].to, ['one@testing.test', 'second@external-org.test']);

    // Clear B30 -> holds new Social Alert safely in pending with zero emails sent
    t.set('B30', '');
    t.chat.say(TEST_FEED, F.P0_OK, { sender: 'users/bot' });
    t.poll();
    eq(t.get('C30'), 'Blank: while Testing, enter up to 5 email addresses (comma-separated) to receive test emails and alerts (nothing is sent while B30 is blank)');
    const sentWhileBlank = t.g.gmail.sentMessages().filter(m => !/Escalation protocol/.test(m.subject));
    eq(sentWhileBlank.length, 1);

    // Enter a new email in B30 -> the held Social Alert goes out on the very next poll()
    t.set('B30', 'resumed@anydomain.test');
    t.poll();
    const sentAfterFill = t.g.gmail.sentMessages().filter(m => !/Escalation protocol/.test(m.subject));
    eq(sentAfterFill.length, 2);
    eq(sentAfterFill[1].to, ['resumed@anydomain.test']);

    // While paused (B2 OFF), editing B30 still updates C30 on the next poll
    t.set('B2', 'OFF');
    t.set('B30', 'paused-tester@external.test');
    t.poll();
    eq(t.get('C30'), '\u2713 While Testing, every email goes only to paused-tester@external.test');
  });

  test('testers: a Control tab from before row 30 gets it on its next run (blank, the help below it), a value already in B30 is kept, a cleared label is put back', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    sh.getRange(30, 1, 1, 3).setValues([['', '', '']]);
    sh.getRange(31, 1, 1, 3).setValues([['How it works', '', '']]);
    t.poll();
    eq([sh.cell(30, 1), sh.cell(30, 2), sh.cell(31, 1), sh.cell(31, 2), sh.cell(32, 1), sh.cell(32, 2), sh.cell(33, 1), sh.cell(33, 2),
      sh.cell(34, 1), sh.cell(34, 2), sh.cell(35, 1), sh.cell(35, 2), sh.cell(36, 1), sh.cell(36, 2), sh.cell(37, 1), sh.cell(37, 2), sh.cell(38, 1), sh.cell(38, 2),
      sh.cell(39, 1), sh.cell(39, 2), sh.cell(40, 1), sh.cell(40, 2),
      sh.cell(41, 1), sh.cell(41, 2), sh.cell(42, 1), sh.cell(42, 2), sh.cell(43, 1), sh.cell(43, 2), sh.cell(44, 1), sh.cell(44, 2), sh.cell(45, 1), sh.cell(45, 2),
      sh.cell(46, 1), sh.cell(46, 2), sh.cell(47, 1), sh.cell(47, 2), sh.cell(48, 1), sh.cell(48, 2), sh.cell(49, 1), sh.cell(49, 2), sh.cell(50, 1), sh.cell(50, 2),
      sh.cell(51, 1), sh.cell(51, 2), sh.cell(52, 1), sh.cell(53, 1), sh.cell(54, 1), sh.cell(54, 2), sh.cell(55, 1), sh.cell(55, 2),
      sh.cell(56, 1), sh.cell(57, 1)],
      ['Testing: send to', '', 'BigQuery lookback', '60 minutes', 'Work directly in B25 (Google-only)', 'OFF', 'Other alerts space', '',
        'Proactive watch', 'OFF', 'Watch alerts', 'OFF', 'Temp checks', 'OFF', 'Group test emails', 'OFF', 'Fast triage (Gemini Decisions)', 'OFF',
        'Fast triage: rank and early watch', 'OFF', 'Fast triage: hold back noise', 'OFF',
        'Hold-back: about_google at or below', '0.10', 'Hold-back: routine_noise at or above', '0.90',
        'Hold-back and early watch: answer confidence at or above', '0.55',
        'Early watch: about_google and brand_risk, each at or above', '0.80',
        'Early watch: distinct accounts, at least', '3',
        'Write early-wave records to BigQuery', 'OFF', 'Early watch: independent_reports at or above', '0.30',
        'Early Detection: also read the AMIE table', 'OFF', 'Early Detection: also read Brandwatch live (not X)', 'OFF', 'Proactive watch: also read the AMIE table', 'OFF', 'Open engine: judgment in place of caps', 'OFF', '', '',
        'Live dashboard', 'OFF', 'Slide deliveries', 'OFF', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is a switch now (it was blank)

    sh.getRange(30, 1).setValue('');
    sh.getRange(30, 2).setValue('keepme@external.test');
    t.poll();
    eq([sh.cell(30, 1), sh.cell(30, 2), sh.cell(30, 3)],
      ['Testing: send to', 'keepme@external.test', '\u2713 While Testing, every email goes only to keepme@external.test']);
  });

  test('BrandSafetyGroups.gs: reads Brand safety groups tab dynamically, maps products/Executives/operational slots, registers new products, caches 10m, and never writes to the tab', () => {
    const t = e2e(null, { noWait: true, blankStandIn: true });
    t.bot.setup();
    const ss = t.sheet();
    const bsg = ss.insertSheet('Brand safety groups');
    const rawRows = [
      ['Google Group Name', 'Google Group Email'],
      ['Search', 'live-search-247@groups.test'],
      ['AI Overviews', 'live-aio-247@groups.test'],
      ['Executives', 'live-execs-247@groups.test'],
      ['Civics', 'live-civics@groups.test'],
      ['Brand Social Sender', 'live-sender@groups.test'],
      ['T&S Urgent', 'live-tns-urgent@groups.test'],
      ['Default CC', 'live-cc@groups.test'],
      ['Project Astra Next', 'live-astra-next@groups.test'],
    ];
    bsg.getRange(1, 1, rawRows.length, 2).setValues(rawRows);
    const beforeSnapshot = JSON.stringify(bsg.rows);

    const count = t.bot.syncBrandSafetyGroups_(ss, { force: true });
    eq(count, 8);
    eq(JSON.stringify(bsg.rows), beforeSnapshot);  // strictly read-only

    const gen = t.bot.ev('GEN');
    const searchProd = gen.distribution.products.find(p => p.name === 'Search');
    const execProd = gen.distribution.products.find(p => p.name === 'Executives');
    const execGroup = gen.distribution.groups.find(g => g.action_code === 'exec_comms');
    const astraProd = gen.distribution.products.find(p => p.name === 'Project Astra Next');
    eq(searchProd.pa, ['live-search-247@groups.test']);
    eq(execProd.pa, ['live-execs-247@groups.test']);
    eq(execGroup.recipients, ['live-execs-247@groups.test']);
    eq(astraProd.pa, ['live-astra-next@groups.test']);
    eq([gen.email.from_email, gen.email.tns_urgent, gen.email.default_cc],
      ['live-sender@groups.test', 'live-tns-urgent@groups.test', ['live-cc@groups.test']]);

    // Real recipients from the live sheet are immediately protected against accidental entry in B30
    const checkB30 = t.bot.testersFrom_('live-search-247@groups.test, safe-qa@testing.test');
    eq(checkB30.testers, ['safe-qa@testing.test']);
    eq(checkB30.real, ['live-search-247@groups.test']);

    // Cached for 10 minutes unless forced
    bsg.getRange(2, 2).setValue('updated-search-247@groups.test');
    t.bot.syncBrandSafetyGroups_(ss);
    eq(t.bot.ev('GEN').distribution.products.find(p => p.name === 'Search').pa, ['live-search-247@groups.test']);
    t.bot.syncBrandSafetyGroups_(ss, { force: true });
    eq(t.bot.ev('GEN').distribution.products.find(p => p.name === 'Search').pa, ['updated-search-247@groups.test']);
  });
};
