// Tests for the Apps Script Burson QA bot, run in Node against fake Google services (test/fakes.js).
//
//   node apps-script-chat-bot/test/run_tests.js            all tests
//   node apps-script-chat-bot/test/run_tests.js resend     only tests whose name contains "resend"
//
// Also run by tests/test_apps_script_bot.py, so `pytest` covers the bot too.
'use strict';
const assert = require('assert');
const F = require('./fixtures');
const { makeGoogle, loadBot, decodeMime, CHAT_POSTS, FakeSpreadsheet } = require('./fakes');

const NOW = Date.UTC(2026, 9, 14, 12, 0);  // 2026-10-14 08:00 ET: the fixtures' posts are 1-2 days old
const B = loadBot();                        // pure functions only (no services needed)
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
// Values made inside the bot's vm context have that context's prototypes, so compare plain JSON copies.
const plain = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const eq = (actual, expected, msg) => (msg === undefined
  ? assert.deepStrictEqual(plain(actual), plain(expected))
  : assert.deepStrictEqual(plain(actual), plain(expected), msg));
const ANALYST_NAME = 'SLRR Triaged Alerts';
const GUARD = { terms: [ANALYST_NAME, 'ANALYST', 'AAQAaLn375E'] };
const bursonTexts = [];          // every text any test posted in a Burson space: audited for leaks at the end
const bursonReactions = new Set();  // every emoji the bot put on a Burson-space message

const parse = text => B.parseAlert_(text);
const review = (text, opts) => B.reviewAlert_(parse(text), Object.assign({ now: NOW, history: [] }, opts || {}));
const fixFields = r => r.fixes.map(x => x.field);
const llmCheck = (id, proposed, confidence, finding) =>
  ({ checks: [{ id, ok: false, confidence, finding: finding || 'The post is about AI Overviews', proposed_value: proposed }] });

// More test alerts
const MAPS_LOW = F.MAPS.replace('HIGH (4200 engagements)', 'LOW (300 engagements)').replace(',4200,', ',300,');
const MAPS_LOW_RESENT = F.MAPS.split('Product - Memes & humorous content').join('Product - Meme about Google products');
const NO_LINK_OTHER_AUTHOR = F.NO_LINK.split('WasSamLowryEsq').join('someoneElse');
const MISTAKES_NO_LINK = F.MISTAKES.replace('[Link]: https://x.com/edervolcelazz/status/2109566527900926417\n', '');
const MAPS_LOW_OK = MAPS_LOW.split('Product - Memes & humorous content').join('Product - Meme about Google products');  // correct; P2 at 300

// =============================================================================================================
// Parsing, review, rebuild
// =============================================================================================================

test('every fixture is detected as an alert, with the key fields read', () => {
  for (const [name, text] of Object.entries(F)) assert.ok(B.detectAlert_(text, parse(text), ''), name);
  const aio = parse(F.AIO).fields;
  assert.strictEqual(aio.priority, 'P1');
  assert.strictEqual(aio.product, 'AI Overviews (AIM, Web Guide)');
  assert.strictEqual(aio.engagement_level, 'HIGH');
  assert.strictEqual(aio.total_engagement, 29425);
  assert.strictEqual(aio.author, '@TheChiefNerd');
  assert.strictEqual(aio.followers, 284712);
  assert.strictEqual(aio.issue_status, 'NEW');
  const paris = parse(F.PARIS).fields;
  assert.strictEqual(paris.kof, true);
  eq(paris.kof_lists, ['Tech Journalists']);
  eq(paris.risk_tags, ['Violence & Gore', 'World Politics']);
  const mistakes = parse(F.MISTAKES);
  assert.strictEqual(mistakes.fields.product, 'Gems');
  assert.strictEqual(mistakes.fields.social_network, 'Instagram');
  assert.strictEqual(mistakes.extra.header_parts.product, 'Gems');
  assert.strictEqual(B.recordKey_(mistakes.fields), 'x.com/status/2109566527900926417');
});

test('chat text that is not an alert is not detected', () => {
  for (const t of ['Good morning team!', 'Why is the product wrong?', '[Product]: Search', '🤖 This alert needs one fix:']) {
    assert.ok(!B.detectAlert_(t, parse(t), ''), t);
  }
});

test('correct alerts need no fixes', () => {
  for (const name of ['AIO', 'P0_OK', 'MISTAKES_FIXED']) {
    const r = review(F[name]);
    eq(fixFields(r), [], name);
    eq(r.missing, [], name);
  }
});

test('mistakes are found: removed product, network vs link, priority vs tag, engagement vs count', () => {
  const r = review(F.MISTAKES);
  eq(fixFields(r), ['product', 'social_network', 'priority', 'engagement_level']);
  const by = Object.fromEntries(r.fixes.map(x => [x.field, x]));
  assert.strictEqual(by.product.new, 'Gemini App');
  assert.strictEqual(by.social_network.new, 'X');
  assert.match(by.social_network.reason, /x\.com/);
  assert.strictEqual(by.priority.new, 'P0');
  assert.strictEqual(by.engagement_level.new, 'HIGH');
  assert.match(by.engagement_level.reason, /29,425/);
});

test('renamed exposure tags and Sensitive Topics; a KOF author\'s alert keeps the level for its count (or VIRAL KOF), as Burson writes it', () => {
  eq(review(F.MAPS).fixes.map(x => [x.field, x.new]), [['exposure_tag', 'Product - Meme about Google products']]);
  const r = review(F.PARIS);
  eq(r.fixes.map(x => [x.field, x.new]), [
    ['exposure_tag', 'Product - Dangerous results (e.g. medical/legal)'],
    ['risk_tags', ['Violence / Weapons', 'Politics']],
  ]);
  // Burson's KOF alerts name the list and keep the count's level (SLRR log: no KOF/INF alert says VIRAL KOF)
  const kof = review(F.WAYMO_KOF);
  eq([kof.fields.kof, kof.fields.kof_lists, kof.fields.engagement_level, fixFields(kof)], [true, ['Viral KOFs (KOFs)'], 'VERY LOW', []]);
  const viral = review(F.WAYMO_KOF.replace('[Engagement]: VERY LOW (11 engagements)', '[Engagement]: VIRAL KOF (11 engagements)'));
  eq(fixFields(viral), []);
  const inf = parse(F.WAYMO_KOF.replace('[KOF]: Viral KOFs (KOFs)', '[KOF]: Exec following #4 (INFs), CAM Tech/AI (INFs)')).fields;
  eq([inf.kof, inf.kof_lists], [true, ['Exec following #4 (INFs)', 'CAM Tech/AI (INFs)']]);
  const owned = parse(F.WAYMO_KOF.replace('[KOF]: Viral KOFs (KOFs)', '[KOF]: Google Owned Channels')).fields;
  eq([owned.kof, owned.kof_lists], [false, undefined]);
});

test('missing link is something only Burson can fix', () => {
  const r = review(F.NO_LINK);
  eq(r.missing, [{ field: 'post_url', problem: 'missing' }]);
  eq(r.fixes, []);
});

test('"New" issue already alerted in the last 14 days -> Ongoing Issue (and the [Name]/[Code] lines follow)', () => {
  const earlier = parse(F.P0_OK);
  const history = [{ exposure_tag: 'Product - Perceived bias', record_key: 'x.com/status/1', created_at: NOW - 3 * 86400e3,
    issue_tokens: B.issueTokens_(earlier.fields.issue_name) }];
  const text = F.P0_OK.split('2109952063492993159').join('2109952063492990000');
  const r = review(text, { history });
  eq(r.fixes.map(x => [x.field, x.new]), [['issue_status', 'Ongoing Issue']]);
  eq(r.silentFixes.map(x => x.field), ['alert_name']);
  const out = B.rebuildAlert_(text, parse(text), r.fields, r.changed);
  assert.match(out, /\[Name\]: Alleged Bias in Search Reporting for Paris Riots 2026 \/ Ongoing Issue\n/);
  assert.match(out, /\[Code\]: .*,Search,Ongoing Issue\n/);
  assert.strictEqual(B.processedText_(r, GUARD),
    'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Issue status updated to Ongoing Issue.');
  // older than 14 days, or the same post: no change
  eq(fixFields(review(text, { history: [Object.assign({}, history[0], { created_at: NOW - 15 * 86400e3 })] })), []);
  eq(fixFields(review(text, { history: [Object.assign({}, history[0], { record_key: B.recordKey_(parse(text).fields) })] })), []);
});

test('rebuild changes only the corrected lines and keeps Burson\'s layout', () => {
  const p = parse(F.MISTAKES);
  const r = review(F.MISTAKES);
  const out = B.rebuildAlert_(F.MISTAKES, p, r.fields, r.changed);
  const before = F.MISTAKES.split('\n');
  const after = out.split('\n');
  assert.strictEqual(after.length, before.length);
  const changed = after.map((l, i) => (l !== before[i] ? i : -1)).filter(i => i >= 0).map(i => after[i]);
  eq(changed, [
    '🚨THIS ALERT MEETS P0 CRITERIA🚨',
    '🟥SOCIAL ALERT🟥: Gemini App | Criticism against AI Overviews | X | 29425 Engagements',
    '[Engagement]: HIGH (29425 engagements)',
    '[Product]: Gemini App',
    '[Social Network]: X',
    '[Code]: Product - Perceived bias,29425,edervolcelazz,-,Gemini App,Ongoing Issue',
  ]);
  assert.strictEqual(B.rebuildAlert_(F.P0_OK, parse(F.P0_OK), parse(F.P0_OK).fields, []), F.P0_OK);
  eq(fixFields(review(out)), []);  // the corrected copy is itself a correct alert
});

test('Gemini: confident findings of every kind become fixes; less confident ones are analyst notes', () => {
  let r = review(F.P0_OK, { llm: llmCheck('product_fit', 'AI Overviews', 0.95) });
  eq(r.fixes.map(x => [x.field, x.new, x.source]), [['product', 'AI Overviews', 'llm']]);
  r = review(F.P0_OK, { llm: llmCheck('product_fit', 'AI Overviews', 0.8) });
  eq(r.fixes, []);
  eq(r.unsure.map(u => [u.field, u.proposed]), [['product', 'AI Overviews']]);
  r = review(F.P0_OK, { llm: llmCheck('kof_fit', 'Yes', 0.95, 'The author is a well-known tech journalist') });
  eq(r.fixes.map(x => [x.field, x.new]), [['kof', true]]);  // the engagement level stays the count's
  r = review(F.WAYMO_KOF, { llm: llmCheck('kof_fit', 'No', 0.95, 'Only 11 engagements') });  // Burson's list decides: no fix
  eq([r.fixes, r.unsure, r.fields.kof], [[], [], true]);
  r = review(F.P0_OK, { llm: llmCheck('product_fit', 'Not A Real Product', 0.99) });  // not in the taxonomy
  eq(r.fixes, []);
  r = review(F.PARIS, { llm: llmCheck('sensitive_topics_fit', 'None', 0.99) });  // removing every topic: a note, not a fix
  assert.ok(!r.fixes.some(x => x.source === 'llm'));
  r = review(F.P0_OK, { llmError: 'timeout' });
  eq(r.notes, ['AI checks were unavailable, so this alert was reviewed with the rules only']);
});

test('Gemini wording fixes (issue name, summary) reach the analyst copy, and Burson is told the new wording', () => {
  const name = 'Claims of bias in Search results about the Paris riots';
  let r = review(F.P0_OK, { llm: llmCheck('issue_name_neutral', name, 0.93, 'The issue name repeats the post\'s claim as fact') });
  eq(r.fixes.map(x => [x.field, x.new]), [['issue_name', name]]);
  const out = B.rebuildAlert_(F.P0_OK, parse(F.P0_OK), r.fields, r.changed);
  assert.match(out, new RegExp(`⬛SOCIAL ALERT⬛: Search \\| ${name} \\| X \\| 1 Engagements`));
  assert.match(out, new RegExp(`\\[Name\\]: ${name} / New / not previously reported over the past 14 days`));
  assert.strictEqual(B.processedText_(r, GUARD),
    `The alert has been updated, so there is no need to resend it. The following updates were made:\n- Issue title updated to "${name}".`);
  const summary = 'An X user (@WasSamLowryEsq, 652 followers) claimed Search showed a one-sided set of results for "Paris riots 2026."';
  r = review(F.P0_OK, { llm: llmCheck('summary_grammar', summary, 0.95, 'The summary has grammar problems.') });
  assert.ok(B.rebuildAlert_(F.P0_OK, parse(F.P0_OK), r.fields, r.changed).includes(summary));
  assert.match(B.processedText_(r, GUARD), /^The alert has been updated, so there is no need to resend it\. The following updates were made:\n- Summary updated to "An X user/);
});

test('the Gemini prompt carries the taxonomy, treats the alert as untrusted, and keeps findings about the alert', () => {
  const p = B.assessPrompts_(parse(F.MISTAKES));
  assert.match(p.system, /UNTRUSTED DATA/);
  assert.match(p.system, /\[P0\] Product - Perceived bias/);
  assert.match(p.system, /id=product_fit/);
  assert.match(p.system, /never mention teams, people, escalation/);
  assert.match(p.prompt, /^<alert>\n\{.*"product":"Gems".*\}\n<\/alert>$/s);
});

// =============================================================================================================
// What the bot says, and the guard
// =============================================================================================================

test('Burson is told plainly what was wrong and what the bot changed ("X was listed incorrectly; we changed it to Y.", no arrows or reasons), and that the alert was processed: never asked to resend', () => {
  const r = review(F.MISTAKES);
  const text = B.processedText_(r, GUARD);
  assert.strictEqual(text, [
    'The alert has been updated, so there is no need to resend it. The following updates were made:',
    '- Product updated to Gemini App.',
    '- Social Network updated to X.',
    '- Priority banner updated to P0.',
    '- Engagement updated to HIGH.',
  ].join('\n'));
  assert.ok(!/→|->/.test(text));
  assert.strictEqual(B.processedText_({ fixes: [], missing: [{ field: 'post_url', problem: 'missing' }] }, GUARD),
    'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Link was missing. Please include it in future alerts.');
  assert.strictEqual(B.processedText_({ fixes: [{ field: 'video_timestamp', old: '', new: '[04:12]' }], missing: [] }, GUARD),
    'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Timestamp updated to [04:12] (where Google comes up in the video).');
  for (const t of [text, B.safeGenericText_(true)]) assert.ok(!/resend (?:the alert|it) here|please change/i.test(t), t);
});

test('reasons and suggested wording that would leak are left out, line by line', () => {
  const fixes = [
    { field: 'product', old: 'Gems', new: 'Gemini App', reason: 'forwarded to the analyst space' },
    { field: 'social_network', old: 'Instagram', new: 'X', reason: 'the link is on x.com' },
    { field: 'summary', old: 'x', new: 'Forwarded to the clean data space.', reason: 'to reduce reliance on Burson' },
  ];
  const text = B.processedText_({ fixes, missing: [] }, GUARD);
  eq(B.guardHits_(text, GUARD), []);
  assert.match(text, /- Product updated to Gemini App\.\n- Social Network updated to X\.\n- Summary updated\.$/);
});

test('the fixed answer never repeats a Gemini reason that would leak', () => {
  const row = B.voiceRow_({ requested: [{ field: 'product', old: 'Gems', new: 'Gemini App', reason: 'forwarded to the analyst space, see go/slrr' }] }, true);
  const a = B.safeAnswer_('I forwarded this to the analysts.', row, GUARD);
  assert.strictEqual(a.text, 'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Product updated to Gemini App.');
});

test('the guard catches internal details (second space, forwarding, reducing reliance, internal emails/ids)', () => {
  const leaks = ['I forwarded it', 'the analyst space', 'the clean data space', 'the second space', 'another chat',
    'reducing reliance on Burson', 'replace Burson', 'phase out Burson', 'see go/slrr-db', 'ask jane@ops.test',
    'write to someone@agency.test', 'SLRR Triaged Alerts', 'TRG-1001', 'brand-social-sends', 'posted in "this is fine"',
    'the Watchdog email'];
  for (const t of leaks) assert.ok(B.guardHits_(t, GUARD).length, t);
});

test('the guard never flags the alert taxonomy, Burson\'s own values, or human escalation status updates', () => {
  const fine = ['Please update the alert and resend it here.', 'The product should be Gemini App.', 'AIM, Web Guide',
    'Employees - Hate speech toward or criticism of Googlers', 'Product: "Google Chat" → "Workspace"',
    'Gmail phishing is covered by Product - Scams involving Google products', 'this is fine as written', 'Jonathan',
    'Thanks for flagging this! Everything looks good — we have the escalation email in review now.',
    'Update: the escalation email has been sent out for this alert. Thanks team! 📦',
    'Update: the Trust & Safety form has been filled out for this alert. ✍️'];
  for (const t of fine) eq(B.guardHits_(t, GUARD), [], t);
  assert.ok(B.guardHits_('Exposure Tag: "Forwarded Alert"', GUARD).length);
  eq(B.guardHits_('Exposure Tag: "Forwarded Alert"', Object.assign({ allow: ['Forwarded Alert'] }, GUARD)), []);
});

test('answers: Gemini\'s answer only if it passes the guard, else a fixed answer', () => {
  const row = B.voiceRow_({ requested: B.requestedItems_(review(F.MISTAKES)) }, true);  // Never wait on Burson ON
  assert.strictEqual(B.safeAnswer_('Gems was retired, so use Gemini App.', row, GUARD).text, 'Gems was retired, so use Gemini App.');
  for (const bad of ['I forwarded the fixed alert to the analysts.', 'The SLRR Triaged Alerts space has it.', '', null]) {
    const a = B.safeAnswer_(bad, row, GUARD);
    assert.ok(a.blocked.length, String(bad));
    assert.match(a.text, /^The alert has been updated, so there is no need to resend it\. The following updates were made:\n- Product updated to Gemini App\./);
  }
  assert.match(B.safeAnswer_('', { requested: [] }, GUARD).text, /does not need any updates/);
  assert.match(B.safeAnswer_('', null, GUARD).text, /Which field are you asking about\?/);
});

test('the answer context given to Gemini is safe for Burson and includes live escalation status', () => {
  const row = B.voiceRow_({  // Never wait on Burson ON
    requested: B.requestedItems_(review(F.MISTAKES)),
    forwarded_fields: B.snapshotFields_(review(F.MISTAKES).fields),
    email_status: 'drafted',
  }, true);
  const p = B.answerPrompts_('Should i escalate this or is it handled/', row);
  const context = p.prompt.split('QUESTION (untrusted')[0];
  eq(B.guardHits_(context, GUARD), []);
  assert.match(context, /\[What was wrong with this alert and what we changed: it was already processed with these changes, so Burson doesn't need to resend it\]\nProduct updated to Gemini App\./);
  assert.match(context, /\[Current status of this alert\]\nEscalation status: This alert is being escalated — we have the escalation email in review right now\./);
  assert.match(context, /\[Correct values for this alert\][^[]*Product: Gemini App/);
  assert.match(p.system, /^You help the Burson team/);
  assert.match(p.prompt, /QUESTION \(untrusted, JSON-encoded\):\n"Should i escalate this or is it handled\/"$/);
});

const RES = () => B.usableResources_(B.ev('GEN').settings.resources, GUARD);

test('Resources tab rows Burson may be given: named https documents, nothing internal', () => {
  const rows = [
    { name: 'SLRR Collection Requirements', url: 'https://docs.google.com/document/d/abc/edit', covers: 'every field' },
    { name: 'KOF lists', url: 'https://docs.google.com/spreadsheets/d/def/edit', covers: '' },
    { name: '', url: 'https://docs.google.com/document/d/nameless/edit' },
    { name: 'Plain http', url: 'http://example.com/doc' },
    { name: 'Wiki', url: 'go/slrr-wiki' },
    { name: 'Ask us', url: 'https://docs.google.com/document/d/x/edit', covers: 'questions to jane@ops.test' },
    { name: 'Our space', url: 'https://chat.google.com/room/AAQAother1' },
    { name: 'SLRR Triaged Alerts notes', url: 'https://docs.google.com/document/d/y/edit' },
  ];
  eq(B.usableResources_(rows, GUARD).map(r => r.name), ['SLRR Collection Requirements', 'KOF lists']);
  eq(RES().map(r => r.name), ['SLRR Collection Requirements', 'KOF lists']);  // the YAML's starting rows pass
});

test('answers keep only links from the Resources tab (as Chat links)', () => {
  const urls = ['https://docs.google.com/document/d/abc/edit'];
  const known = 'It comes from the alert requirements: https://docs.google.com/document/d/abc/edit.';
  eq(B.keepKnownLinks_(known, urls), known);
  eq(B.keepKnownLinks_('Check https://made.up/doc for details.', urls), 'Check for details.');
  eq(B.keepKnownLinks_('See [the requirements](https://docs.google.com/document/d/abc/edit) or [this](https://x.example/y).', urls),
    'See <https://docs.google.com/document/d/abc/edit|the requirements> or this.');
  eq(B.keepKnownLinks_('<https://x.example/y|Other doc> and <https://docs.google.com/document/d/abc/edit|the requirements>', urls),
    'Other doc and <https://docs.google.com/document/d/abc/edit|the requirements>');
});

test('answers cite the resource a rule comes from; the fixed answer links the resources too', () => {
  const res = RES();
  const row = { requested: B.requestedItems_(review(F.MISTAKES)) };
  const cite = `That's in the alert requirements (*SLRR Collection Requirements*): ${res[0].url}`;
  eq(B.safeAnswer_(cite, row, GUARD, res), { text: cite, blocked: [] });
  const fixed = B.safeAnswer_('', row, GUARD, res).text;
  assert.ok(fixed.endsWith(`\nResources:\n- <${res[0].url}|SLRR Collection Requirements>\n- <${res[1].url}|KOF lists>`), fixed);
  eq(B.guardHits_(fixed, Object.assign({ allow: res.map(r => r.url) }, GUARD)), []);
  assert.ok(!B.safeAnswer_('', row, GUARD, []).text.includes('Resources:'));

  const p = B.answerPrompts_('where does the KOF rule come from?', row, res);
  const context = p.prompt.split('QUESTION (untrusted')[0];
  assert.ok(context.includes(`[Resources Burson can open: where the alert requirements come from]\n- SLRR Collection Requirements: ${res[0].url} (covers: `));
  assert.ok(context.includes(`- KOF lists: ${res[1].url}`));
  eq(B.guardHits_(context, Object.assign({ allow: res.map(r => r.url) }, GUARD)), []);
  assert.match(p.system, /answer directly and confidently: don't hedge and don't say you're not sure/);
  assert.match(p.system, /give that resource's link exactly as written in CONTEXT\. Never give any other link/);
  assert.match(B.answerPrompts_('why?', row, []).system, /Don't give links\./);
});

test('questions, pushback and acknowledgements', () => {
  for (const q of ['Why?', 'why is the product wrong', 'Should it be X instead', '@lois what tag?']) assert.ok(B.isQuestion_(q), q);
  for (const q of ['ok', 'Thanks!', 'The product is right']) assert.ok(!B.isQuestion_(q), q);
  for (const a of ['ok', 'Ok, will fix now 👍', 'done, resent the alert', 'Thanks!', 'sorry my bad, fixing', 'I’ll resend shortly',
    '👍', 'I\'ll take this one']) {
    assert.ok(B.isShortAck_(a), a);
  }
  for (const a of ['ok but the product is wrong', 'The product is right, the post is about Gems', 'no']) assert.ok(!B.isShortAck_(a), a);
  for (const t of ['The product is right', 'that tag is correct', 'KOF should be yes', 'wrong network']) assert.ok(B.mentionsAlertField_(t), t);
  for (const t of ['Lois is on it today', 'brb']) assert.ok(!B.mentionsAlertField_(t), t);
});

test('analyst footer and the resend update note', () => {
  const r = review(F.MISTAKES);
  assert.strictEqual(B.forwardFooter_(r), 'QA corrected:\n- Product updated to Gemini App (was Gems)\n- Social Network updated to X (was Instagram)\n' +
    '- Priority banner updated to P0 (was P2)\n- Engagement updated to HIGH (was LOW)');
  assert.strictEqual(B.forwardFooter_(review(F.NO_LINK), true), 'QA: Link missing (processed without waiting for Burson; Burson was told)');
  assert.strictEqual(B.forwardFooter_(review(F.P0_OK)), '');
  const before = B.snapshotFields_(review(F.NO_LINK).fields);
  assert.strictEqual(B.updateNote_(before, review(F.NO_LINK_RESENT)),
    'Burson resent this alert with updates:\n- Link: <https://x.com/WasSamLowryEsq/status/2109952063492993159|Alleged Bias in Search Reporting for Paris Riots 2026>');
  assert.strictEqual(B.updateNote_(B.snapshotFields_(r.fields), review(F.MISTAKES_FIXED)), null);
  const grown = F.MISTAKES_FIXED.split('29425').join('35000');
  assert.match(B.updateNote_(B.snapshotFields_(r.fields), review(grown)), /- Engagement count updated to 35000 \(was 29425\)/);
  const reworded = F.MISTAKES_FIXED.split('Criticism against AI Overviews').join('Users criticize AI Overviews');
  assert.strictEqual(B.updateNote_(B.snapshotFields_(r.fields), review(reworded)), null);  // rewording isn't news
});

// =============================================================================================================
// Config.gs and the Control tab
// =============================================================================================================

test('spaces can be given as links, ids or names', () => {
  const cases = {
    'spaces/AAQAaa_0I9g': { id: 'spaces/AAQAaa_0I9g' },
    ' AAQAaa_0I9g ': { id: 'spaces/AAQAaa_0I9g' },
    'https://mail.google.com/chat/u/0/#chat/space/AAQAaa_0I9g': { id: 'spaces/AAQAaa_0I9g' },
    'https://mail.google.com/mail/u/0/#chat/space/AAQAaLn375E': { id: 'spaces/AAQAaLn375E' },
    'https://chat.google.com/room/AAQAaa_0I9g?cls=7': { id: 'spaces/AAQAaa_0I9g' },
    'https://chat.google.com/u/0/app/chat/AAQAaa_0I9g': { id: 'spaces/AAQAaa_0I9g' },
    'SLRR Test Feed (Burson Sim)': { name: 'SLRR Test Feed (Burson Sim)' },
  };
  for (const [input, want] of Object.entries(cases)) eq(B.parseSpaceRef_(input), want, input);
  assert.throws(() => B.parseSpaceRef_('', 'The Burson space'), /^Error: The Burson space is blank\. Paste the space's link there\.$/);
});

test('space safety checks (S-F Burson is the Control tab\'s B25, never a constant)', () => {
  const real = { id: 'spaces/AAQAaa_0I9g', name: '[S-F] Burson Automated Alerts V3', externalUserAllowed: true };
  const sfb = { id: real.id };  // B25, as the run resolved it
  const testFeed = { id: 'spaces/TEST', name: 'SLRR Test Feed (Burson Sim)' };
  const analyst = { id: 'spaces/AAQAaLn375E', name: ANALYST_NAME };
  const vendor = Object.assign({}, analyst, { externalUserAllowed: true });
  eq(B.checkSpacePair_(testFeed, analyst, sfb), { problems: [], bad: [] });
  eq(B.checkSpacePair_(real, analyst, sfb), { problems: [], bad: [] });
  const same = B.checkSpacePair_(testFeed, testFeed, sfb);
  assert.match(same.problems[0], /same space/);
  eq(same.bad, ['burson', 'analyst']);
  const realAsAnalyst = B.checkSpacePair_(testFeed, real, sfb);
  assert.match(realAsAnalyst.problems.join(' '), /can't be the Burson alerts space/);
  eq(realAsAnalyst.bad, ['analyst']);
  // a Google-only space set as S-F Burson (B25) can't be the analyst space either; with B25 blank, the real space is
  // still refused as the analyst space, for allowing people outside Google
  const googleOnlySfb = { id: 'spaces/AAQAaLn375E' };
  assert.match(B.checkSpacePair_(testFeed, analyst, googleOnlySfb).problems.join(' '), /can't be the Burson alerts space/);
  eq(B.checkSpacePair_(testFeed, real, null).problems.map(p => /can't be the Burson alerts space/.test(p)), [false]);
  assert.match(B.checkSpacePair_(testFeed, real, null).problems[0], /allows people outside Google/);
  eq([B.isSfBurson_(sfb, real.id), B.isSfBurson_(null, real.id), B.isSfBurson_({ id: '' }, ''), B.isSfBurson_(sfb, 'spaces/TEST')],
    [true, false, false, false]);
  assert.match(B.checkSpacePair_(testFeed, vendor).problems[0], /allows people outside Google, so Burson could see it/);
  // A space that couldn't be opened is skipped; the other one is still checked.
  eq(B.checkSpacePair_(undefined, analyst), { problems: [], bad: [] });
  eq(B.checkSpacePair_(undefined, vendor).bad, ['analyst']);
  eq(B.checkSpacePair_(testFeed, undefined), { problems: [], bad: [] });
});

test('Control tab values and status lines', () => {
  eq(B.parseControl_('ON', ' SLRR Test Feed (Burson Sim) ', 'spaces/AAQAaLn375E'),
    { on: true, burson: 'SLRR Test Feed (Burson Sim)', analyst: 'spaces/AAQAaLn375E' });
  for (const v of ['on', ' ON ', true]) assert.strictEqual(B.parseControl_(v, '', '').on, true, String(v));
  for (const v of ['OFF', '', null, 'maybe', false]) assert.strictEqual(B.parseControl_(v, '', '').on, false, String(v));
  assert.strictEqual(B.okStatusText_([]), '✅ Working');
  assert.strictEqual(B.pausedStatusText_(), '⏸ Paused: Bot is OFF. Set it to ON to restart.');
  assert.strictEqual(B.problemStatusText_(new Error('The Burson space is blank. Paste the space\'s link there.')),
    '⚠️ The Burson space is blank. Paste the space\'s link there. The bot tries again every minute.');
  let s = B.bumpStats_(null, { alerts: 2, fix_requests: 1, answers: 1, forwarded: 2 }, '2026-10-14');
  s = B.bumpStats_(s, { alerts: 1, forwarded: 1 }, '2026-10-14');
  assert.strictEqual(B.todayText_(s, '2026-10-14'), '3 alerts reviewed · 1 sent back to Burson for fixes · 1 question answered');
  assert.strictEqual(B.todayText_(s, '2026-10-14', true), '3 alerts reviewed · 1 corrected (Burson told) · 1 question answered');
  assert.strictEqual(B.todayText_(s, '2026-10-15'), 'No alerts yet today');
  eq(B.bumpStats_(s, { alerts: 1 }, '2026-10-15'), { day: '2026-10-15', alerts: 1, fix_requests: 0, answers: 0, forwarded: 0 });
});

// =============================================================================================================
// Chat.gs / Gemini.gs / Sheets.gs pure parts
// =============================================================================================================

test('Chat messages are normalized', () => {
  const m = B.normalizeMessage_({
    name: 'spaces/S/messages/M', text: 'hi @bot', createTime: '2026-10-14T12:00:01.123456Z',
    sender: { name: 'users/1', type: 'BOT' }, thread: { name: 'spaces/S/threads/T' }, threadReply: true,
    clientAssignedMessageId: 'client-bqa-x',
    annotations: [{ type: 'USER_MENTION', userMention: { user: { name: 'users/bot' } } }, { type: 'RICH_LINK' }],
    emojiReactionSummaries: [{ emoji: { unicode: '✍️' }, reactionCount: 2 }, { emoji: { customEmoji: {} }, reactionCount: 1 }],
  });
  eq(m, {
    name: 'spaces/S/messages/M', text: 'hi @bot', cardText: '', createTime: Date.UTC(2026, 9, 14, 12, 0, 1, 123), senderName: 'users/1',
    senderDisplay: '', senderEmail: '', senderType: 'BOT', thread: 'spaces/S/threads/T', threadReply: true, clientId: 'client-bqa-x',
    mentions: ['users/bot'], reactions: [{ emoji: '✍️', count: 2 }], attachments: [],
  });
  const withFile = B.normalizeMessage_({ sender: { name: 'users/2', displayName: 'Alice', email: 'alice@agency.test' },
    attachment: [{ contentName: 'shot.png', contentType: 'image/png' }] });
  eq([withFile.senderDisplay, withFile.senderEmail, withFile.attachments], ['Alice', 'alice@agency.test', [{ name: 'shot.png', type: 'image/png' }]]);
  assert.strictEqual(B.normalizeMessage_({ formattedText: '*x*' }).text, '*x*');
  assert.strictEqual(B.normalizeMessage_({ cardsV2: [{ card: { header: { title: 'Alert' }, sections: [{ widgets: [
    { textParagraph: { text: '<b>[Product]:</b> Search<br>[KOF]: No &amp; more' } }] }] } }] }).cardText, 'Alert\n[Product]: Search\n[KOF]: No & more');
});

test('Gemini responses are parsed (thoughts skipped), and empty or blocked ones throw', () => {
  const wrap = parts => ({ candidates: [{ content: { parts }, finishReason: 'STOP' }] });
  eq(B.parseGeminiJson_(wrap([{ text: 'thinking…', thought: true }, { text: '{"a":1}' }])), { a: 1 });
  eq(B.parseGeminiJson_(wrap([{ text: '```json\n{"a":2}\n```' }])), { a: 2 });
  assert.throws(() => B.parseGeminiJson_({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }), /MAX_TOKENS/);
  assert.throws(() => B.parseGeminiJson_({ promptFeedback: { blockReason: 'SAFETY' } }), /blocked: SAFETY/);
  assert.throws(() => B.parseGeminiJson_(wrap([{ text: 'not json' }])), /invalid JSON/);
  assert.strictEqual(B.geminiUrl_('gemini-3.8-flash', 'global', 'p'),
    'https://aiplatform.googleapis.com/v1/projects/p/locations/global/publishers/google/models/gemini-3.8-flash:generateContent');
  assert.match(B.geminiUrl_('m', 'us-central1', 'p'), /^https:\/\/us-central1-aiplatform\.googleapis\.com\//);
});

test('sheet rows: JSON columns round-trip, nothing becomes a formula, and a moved row is never overwritten', () => {
  const rows = [];  // data rows; sheet row = index + 2
  const strip = v => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v);
  const io = {
    lastRow: () => rows.length + 1,
    read: (first, count) => rows.slice(first - 2, first - 2 + count).map(r => r.slice()),
    append: values => { rows.push(values.map(strip)); return rows.length + 1; },
    write: (row, values) => { rows[row - 2] = values.map(strip); },
    keyAt: (row, col) => (rows[row - 2] ? rows[row - 2][col - 1] : null),
    findRow: (col, value) => { const i = rows.findIndex(r => String(r[col - 1]) === String(value)); return i >= 0 ? i + 2 : null; },
  };
  const header = B.ev('ALERT_COLUMNS_');
  const id = header.indexOf('alert_id');
  const status = header.indexOf('status');
  const t = B.tableOver_(io, header, 'alert_id', 100);
  const a = t.append({ alert_id: 'QA-1', created_at: 5, requested: [{ field: 'product' }], forwarded_fields: { kof: true },
    burson_done: false, exposure_tag: '=HYPERLINK("x")' });
  const b = t.append({ alert_id: 'QA-2', created_at: 6 });
  assert.strictEqual(a._row, 2);
  t.update(a, { burson_done: true });
  const [back] = t.load();
  eq([back.alert_id, back.created_at, back.requested, back.forwarded_fields, back.burson_done, back.exposure_tag, back.issue_tokens],
    ['QA-1', 5, [{ field: 'product' }], { kof: true }, true, '=HYPERLINK("x")', []]);
  assert.strictEqual(B.encodeCell_('exposure_tag', '=1+1'), "'=1+1");
  rows.splice(0, 1);  // someone deletes the first row: QA-2 moves up
  t.update(b, { status: 'fixed' });
  eq(rows.map(r => [r[id], r[status]]), [['QA-2', 'fixed']]);
  rows.splice(0, 1);  // and then deletes QA-2 too: it's written back, never over another row
  t.update(b, { status: 'superseded' });
  eq(rows.map(r => [r[id], r[status]]), [['QA-2', 'superseded']]);
});

// =============================================================================================================
// The bot, against fake Chat + Gemini (Bot.gs + Chat.gs + Gemini.gs + Store.gs)
// =============================================================================================================

function collectBurson(chat, spaces) {
  spaces.forEach(s => {
    if (!chat.spaces.has(s)) return;
    chat.botPosts(s).forEach(m => { if (!bursonTexts.includes(m.text)) bursonTexts.push(m.text); });
    chat.spaces.get(s).messages.forEach(m => m.reactions.filter(r => r.user === chat.botUser).forEach(r => bursonReactions.add(r.emoji)));
  });
}

function world(opts) {
  opts = opts || {};
  const g = makeGoogle(NOW);
  const bot = loadBot(g.services, g.clock);
  const BUR = 'spaces/BURSON', ANA = 'spaces/ANALYST';
  g.chat.addSpace(BUR, 'SLRR Test Feed (Burson Sim)');
  g.chat.addSpace(ANA, ANALYST_NAME);
  const settings = Object.assign({}, bot.ev('GEN').settings, opts.settings || {});
  const backend = bot.memoryBackend_();
  const memo = new Map();
  const recent = new Map();
  let cursor = null;
  const draftsCfg = opts.drafts
    ? Object.assign({ on: !settings.dry_run, live: false, mailbox: 'bot@runner.test', from: 'Brand Social <bot@runner.test>' },
      typeof opts.drafts === 'object' ? opts.drafts : {})
    : null;
  if (draftsCfg && typeof draftsCfg.live === 'boolean') {
    bot.setRunLive_(!!draftsCfg.live && !draftsCfg.standIn && !(draftsCfg.testers && draftsCfg.testers.length));
  }
  const w = {
    g, bot, chat: g.chat, vertex: g.vertex, gmail: g.gmail, backend, BUR, ANA, storeLoads: 0,
    noWait: !!opts.noWait,  // "Never wait on Burson" (Control row 23) ON in the next runs' ctx.switches; a test may flip it
    ctx() {
      let store = null;
      return {
        settings,
        spaces: { burson: { id: BUR, name: 'SLRR Test Feed (Burson Sim)' }, analyst: { id: ANA, name: ANALYST_NAME } },
        get store() {
          if (!store) { store = bot.makeStore_(backend, () => g.clock.now, `${BUR} > ${ANA}`); w.storeLoads++; }
          return store;
        },
        chat: { list: (s, since, max, newest) => bot.chatListMessages_(s, since, max, newest), post: (s, t, o) => bot.chatPostMessage_(s, t, o), react: (n, e) => bot.chatReact_(n, e),
          dm: (email, t, key) => { const s = bot.chatFindDm_(email); if (!s) return false; bot.chatPostMessage_(s, t, { key }); return true; } },
        gemini: bot.geminiClient_(),
        gmail: draftsCfg ? bot.gmailClient_({ onlyTo: (Array.isArray(draftsCfg.testers) && draftsCfg.testers.length ? draftsCfg.testers : draftsCfg.standIn) || '' }) : null,
        drafts: draftsCfg,
        cursor: { get: () => cursor, set: v => { cursor = v; } },
        recent: { has: n => recent.has(n), add: (n, t) => recent.set(n, t) },
        memo: { get: k => (memo.has(k) ? memo.get(k) : null), set: (k, v) => memo.set(k, v) },
        now: () => g.clock.now, deadline: g.clock.now + 180000, botUser: 'users/bot', log: t => g.logs.push(t),
        resources: opts.resources !== undefined ? opts.resources : settings.resources,
        bq: opts.bq,  // (parsed) => BigQuery enrichment, e.g. {author_alerts: [...]} from the SLRR alert log
        post: opts.post === true ? (url => bot.lookupPost_(url)) : opts.post,  // the post lookup (Post.gs), on w.g.pages
        guidance: opts.guidance,  // the leads' current guidance (Control.gs readGuidance_ rows / emails)
        knowledge: opts.knowledge,  // the knowledge base (Knowledge.gs loadKnowledge_: {docs: [{name, url, covers, text}]})
        switches: w.noWait ? Object.assign(bot.switchesOff_(), { noWait: true }) : undefined,  // Never wait on Burson ON
      };
    },
    run() {
      g.clock.now += 1000;
      const report = bot.runOnce_(w.ctx());
      collectBurson(g.chat, [BUR]);
      return report;
    },
    paste(text, opts2) { return g.chat.say(BUR, text, Object.assign({ sender: 'users/zapier', type: 'BOT' }, opts2 || {})); },
    reply(msg, text, opts2) { return g.chat.say(BUR, text, Object.assign({ thread: msg.thread.name }, opts2 || {})); },
    bursonPosts: () => g.chat.botPosts(BUR),
    analystPosts: () => g.chat.botPosts(ANA),
    alertRows: () => backend.alerts,
  };
  return w;
}

test('correct alert: 👍, forwarded exactly as sent, nothing said to Burson', () => {
  const w = world();
  const alert = w.paste(F.P0_OK);
  const r = w.run();
  assert.strictEqual(r.alerts, 1);
  eq(w.chat.botReactions(alert.name), ['👍']);
  eq(w.bursonPosts(), []);
  eq(w.analystPosts().map(m => [m.text, m.threadReply]), [[F.P0_OK, false]]);
  assert.strictEqual(w.alertRows()[0].status, 'ok');
});

test('wrong alert: processed right away with the bot\'s corrections, no ⬇️ (no updated post is waited for); its thread says what the bot changed and that it was processed; analysts get the corrected alert', () => {
  const w = world({ noWait: true });
  const alert = w.paste(F.MISTAKES);
  w.run();
  eq(w.chat.botReactions(alert.name), ['👍']);  // drafts off: people take the action from here
  const [ask] = w.bursonPosts();
  assert.strictEqual(ask.thread.name, alert.thread.name);
  assert.strictEqual(ask.text, B.processedText_(review(F.MISTAKES), GUARD));
  const [fwd] = w.analystPosts();
  const corrected = B.rebuildAlert_(F.MISTAKES, parse(F.MISTAKES), review(F.MISTAKES).fields, review(F.MISTAKES).changed);
  assert.strictEqual(fwd.text, corrected + '\n\n' + B.forwardFooter_(review(F.MISTAKES)));
  const [row] = w.alertRows();
  eq([row.status, row.burson_done, row.forward_message, row.requested.length, row.author], ['fix_requested', true, fwd.name, 4, 'edervolcelazz']);
  w.run();  // nothing new: no duplicates
  assert.strictEqual(w.bursonPosts().length, 1);
  assert.strictEqual(w.analystPosts().length, 1);
});

test('quiet runs don\'t open the log at all', () => {
  const w = world();
  w.paste(F.MISTAKES);
  w.run();
  const loads = w.storeLoads;
  w.run(); w.run(); w.run();
  assert.strictEqual(w.storeLoads, loads);
});

test('Burson resends anyway: recognized as the same alert, ⬇️ on the original (the resend is the updated post), nothing more said to Burson (the original\'s thread already says it was processed), nothing new for analysts', () => {
  const w = world({ noWait: true });
  const original = w.paste(F.MISTAKES);
  w.run();
  const resend = w.paste(F.MISTAKES_FIXED);
  const r = w.run();
  assert.strictEqual(r.resends, 1);
  eq(w.chat.botReactions(resend.name), ['👍']);
  eq(w.chat.botReactions(original.name), ['👍', '⬇']);
  assert.strictEqual(w.bursonPosts().length, 1);
  assert.strictEqual(w.analystPosts().length, 1);
  const [first, second] = w.alertRows();
  eq([first.status, second.status, second.resend_of, second.forward_message], ['superseded', 'fixed', first.alert_id, first.forward_message]);
});

test('a resend (drafts off) that still has a mistake: told what the bot changed on it, in the resend\'s thread; never asked to resend', () => {
  const w = world({ noWait: true });
  w.paste(F.MISTAKES);
  w.run();
  const partly = w.paste(F.MISTAKES_PARTLY_FIXED);
  w.run();
  const ask = w.bursonPosts()[1];
  assert.strictEqual(ask.thread.name, partly.thread.name);
  assert.strictEqual(ask.text, 'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Engagement updated to HIGH.');
  assert.strictEqual(w.analystPosts().length, 1);
  const final = w.paste(F.MISTAKES_FIXED);
  w.run();
  eq(w.chat.botReactions(partly.name), ['👍', '⬇']);
  eq(w.chat.botReactions(final.name), ['👍']);
  assert.strictEqual(w.bursonPosts().length, 2);
  eq(w.alertRows().map(a => a.status), ['superseded', 'superseded', 'fixed']);
});

test('resend never re-asks a field Burson set to what the bot asked for, even if Gemini now disagrees', () => {
  const w = world();
  w.paste(F.MISTAKES);
  w.run();
  w.vertex.assess = () => llmCheck('product_fit', 'AI Overviews', 0.97, 'about AI Overviews');
  w.paste(F.MISTAKES_FIXED);
  w.run();
  assert.strictEqual(w.bursonPosts().length, 1);
  assert.strictEqual(w.alertRows()[1].status, 'fixed');
});

test('resend never gets another round of wording edits once Burson has reworded it', () => {
  const w = world({ noWait: true });
  w.vertex.assess = () => llmCheck('summary_grammar', 'A clean rewrite of the summary.', 0.95, 'The summary has grammar problems');
  w.paste(F.P0_OK);
  w.run();
  assert.strictEqual(w.bursonPosts()[0].text, 'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Summary updated to "A clean rewrite of the summary.".');
  w.vertex.assess = () => llmCheck('summary_grammar', 'Yet another rewrite.', 0.95, 'Still not great');
  w.paste(F.P0_OK.replace('criticized Search', 'criticised Google Search'));
  w.run();
  assert.strictEqual(w.bursonPosts().length, 1);
  assert.strictEqual(w.alertRows()[1].status, 'fixed');
});

test('missing link: processed without it (Burson is told it was missing); a resend with the link is matched and analysts get the link in the thread', () => {
  const w = world({ noWait: true });
  const original = w.paste(F.NO_LINK);
  w.run();
  assert.strictEqual(w.bursonPosts()[0].text, 'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Link was missing. Please include it in future alerts.');
  const [fwd] = w.analystPosts();
  assert.match(fwd.text, /QA: Link missing \(processed without waiting for Burson; Burson was told\)$/);
  w.paste(F.NO_LINK_RESENT);
  w.run();
  eq(w.chat.botReactions(original.name), ['👍', '⬇']);
  const note = w.analystPosts()[1];
  assert.strictEqual(note.thread.name, fwd.thread.name);
  assert.strictEqual(note.text, 'Burson resent this alert with updates:\n- Link: <https://x.com/WasSamLowryEsq/status/2109952063492993159|Alleged Bias in Search Reporting for Paris Riots 2026>');
  assert.strictEqual(w.bursonPosts().length, 1);
});

test('a different alert is never mistaken for a resend (different author, or the open request had a link)', () => {
  const w = world();
  w.paste(F.NO_LINK);
  w.run();
  w.paste(NO_LINK_OTHER_AUTHOR);  // same issue name, no link, different author: a new alert
  w.run();
  assert.strictEqual(w.analystPosts().filter(m => !m.threadReply).length, 2);
  const v = world();
  v.paste(F.MISTAKES);  // has a link
  v.run();
  v.paste(MISTAKES_NO_LINK);  // same issue, no link: not a resend of the one with a link
  v.run();
  assert.strictEqual(v.analystPosts().filter(m => !m.threadReply).length, 2);
  eq(v.alertRows().map(a => a.status), ['fix_requested', 'fix_requested']);
});

test('a resend whose priority or engagement went up is sent to analysts as a new alert', () => {
  const w = world({ noWait: true });
  const original = w.paste(MAPS_LOW);
  w.run();
  assert.strictEqual(w.bursonPosts()[0].text, 'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Exposure Tag updated to Product - Meme about Google products.');
  const resend = w.paste(MAPS_LOW_RESENT);
  w.run();
  eq([w.chat.botReactions(resend.name), w.chat.botReactions(original.name)], [['👍'], ['👍', '⬇']]);
  const posts = w.analystPosts();
  assert.strictEqual(posts.length, 2);
  assert.strictEqual(posts[1].threadReply, false);
  assert.match(posts[1].text, /\[Engagement\]: HIGH \(4200 engagements\)/);
  assert.match(posts[1].text, /QA: updated alert \(engagement is now HIGH, was LOW\)$/);
  assert.strictEqual(w.alertRows()[1].forward_message, posts[1].name);  // analyst reactions now follow the new copy
});

test('questions in an alert thread are answered there (Gemini, guarded)', () => {
  const w = world({ noWait: true });
  const alert = w.paste(F.MISTAKES);
  w.run();
  w.vertex.answer = () => 'Gems is no longer used, so the product should be *Gemini App*.';
  w.reply(alert, 'Why is the product wrong?');
  w.run();
  const answer = w.bursonPosts()[1];
  eq([answer.text, answer.thread.name], ['Gems is no longer used, so the product should be *Gemini App*.', alert.thread.name]);
  const prompt = w.vertex.calls[w.vertex.calls.length - 1].payload.contents[0].parts[0].text;
  assert.match(prompt, /Product updated to Gemini App\./);
  assert.match(prompt, /"Why is the product wrong\?"/);

  w.vertex.answer = () => 'I forwarded the corrected alert to the SLRR Triaged Alerts space.';
  w.reply(alert, 'Where does this go after?');
  w.run();
  assert.match(w.bursonPosts()[2].text, /^The alert has been updated, so there is no need to resend it\. The following updates were made:/);

  w.vertex.fail = () => ({ code: 503, body: { error: { message: 'overloaded' } } });
  w.reply(alert, 'What should the engagement be?');
  w.run();
  assert.match(w.bursonPosts()[3].text, /^The alert has been updated, so there is no need to resend it\. The following updates were made:/);
});

test('"where did you get that rule?" gets a straight answer with the documents\' links (and no made-up link)', () => {
  const w = world();
  const alert = w.paste(F.MISTAKES);
  w.run();
  const [reqs, kofs] = RES();
  w.vertex.answer = () => 'KOF is *Yes* or *No*: it\'s Yes when the author is on a KOF list. That comes from the alert ' +
    `requirements (*SLRR Collection Requirements*): ${reqs.url} and the lists themselves are here: ${kofs.url} ` +
    'You can also check https://made.up/kof-guide';
  w.reply(alert, 'can you advise on where you got the information regarding how KOFs should be formatted? so i know for future reference');
  w.run();
  const answer = w.bursonPosts()[1].text;
  assert.ok(answer.includes(reqs.url) && answer.includes(kofs.url), answer);
  assert.ok(!answer.includes('made.up'), answer);
  const prompt = w.vertex.calls[w.vertex.calls.length - 1].payload.contents[0].parts[0].text;
  assert.ok(prompt.includes(`- KOF lists: ${kofs.url}`), prompt);
  assert.match(w.vertex.calls[w.vertex.calls.length - 1].payload.systemInstruction.parts[0].text, /don't say you're not sure/);
});

test('replies in a fix thread: "ok, will fix" is left as it is (👍 is for alerts), pushback gets an answer, chatter and messages for others are left alone', () => {
  const w = world();
  const alert = w.paste(F.MISTAKES);
  w.run();
  const ack = w.reply(alert, 'Ok, will fix now 👍');
  const rAck = w.run();
  eq([w.chat.botReactions(ack.name), rAck.acks], [[], 1]);
  assert.strictEqual(w.bursonPosts().length, 1);
  w.reply(alert, 'The product is right, the post is about Gems');
  w.run();
  assert.strictEqual(w.bursonPosts().length, 2);
  const chatter = w.reply(alert, 'Lois is on it today');
  const other = w.reply(alert, 'Hey @Lois can you check this one?', { mentions: ['users/lois'] });
  const topLevel = w.chat.say(w.BUR, 'Good morning team! Lois signing in.');
  const r = w.run();
  assert.strictEqual(r.handled, 3);
  assert.strictEqual(w.bursonPosts().length, 2);
  eq([w.chat.botReactions(chatter.name), w.chat.botReactions(other.name), w.chat.botReactions(topLevel.name)], [[], [], []]);
});

test('thread replies on a correct alert: questions answered, other replies left alone', () => {
  const w = world();
  const alert = w.paste(F.P0_OK);
  w.run();
  const thanks = w.reply(alert, 'thanks');
  w.reply(alert, 'Is the tag right on this one?');
  w.run();
  eq(w.chat.botReactions(thanks.name), []);
  assert.strictEqual(w.bursonPosts().length, 1);
});

test('the bot never answers itself, and a re-run posts nothing twice', () => {
  const w = world();
  const alert = w.paste(F.MISTAKES);
  w.run();
  w.reply(alert, 'why?');
  w.run();
  for (let i = 0; i < 3; i++) w.run();
  assert.strictEqual(w.bursonPosts().length, 2);
  assert.strictEqual(w.analystPosts().length, 1);
});

test('the tester pasting alerts from the bot\'s own account works the same', () => {
  const w = world();
  const alert = w.paste(F.MISTAKES, { sender: 'users/bot', type: 'HUMAN' });
  w.run();
  w.reply(alert, 'why HIGH?', { sender: 'users/bot' });
  w.run();
  assert.strictEqual(w.bursonPosts().length, 2);
  assert.strictEqual(w.analystPosts().length, 1);
});

test('a Zapier message that happens to start with 🤖 is still reviewed and forwarded', () => {
  const w = world();
  const alert = w.paste('🤖 ' + F.P0_OK);
  w.run();
  eq(w.chat.botReactions(alert.name), ['👍']);
  assert.strictEqual(w.analystPosts().length, 1);
});

test('a failed Burson post is retried without forwarding twice', () => {
  const w = world({ noWait: true });
  let failures = 0;
  w.chat.fail = (method, path) => (method === 'post' && path === 'spaces/BURSON/messages' && failures++ < 3
    ? { code: 500, body: { error: { message: 'backend error' } } } : null);
  const alert = w.paste(F.MISTAKES);
  const r1 = w.run();
  assert.strictEqual(r1.errors.length, 1);
  assert.strictEqual(w.analystPosts().length, 1);
  assert.strictEqual(w.bursonPosts().length, 0);
  assert.strictEqual(w.alertRows()[0].burson_done, false);
  w.run();
  assert.strictEqual(w.analystPosts().length, 1);
  assert.strictEqual(w.bursonPosts().length, 1);
  eq(w.chat.botReactions(alert.name), ['👍']);
  assert.strictEqual(w.alertRows()[0].burson_done, true);
});

test('a post whose response was lost is not duplicated (request id)', () => {
  const w = world();
  let lost = false;
  w.chat.fail = (method, path, query, body) => {
    if (lost || method !== 'post' || path !== 'spaces/ANALYST/messages') return null;
    lost = true;
    w.chat.fail = null;
    w.chat.handle(`https://chat.googleapis.com/v1/${path}?` + Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'),
      { method: 'post', payload: JSON.stringify(body) });
    return { code: 503, body: { error: { message: 'unavailable' } } };
  };
  w.paste(F.P0_OK);
  w.run();
  assert.strictEqual(w.analystPosts().length, 1);
});

test('after 3 failed attempts an alert is forwarded as received, never dropped', () => {
  const w = world();
  w.chat.fail = (method, path, query, body) => (method === 'post' && path === 'spaces/ANALYST/messages' && !/forwarded as received/.test(body.text)
    ? { code: 400, body: { error: { message: 'bad request' } } } : null);
  const alert = w.paste(F.MISTAKES);
  w.run(); w.run();
  assert.strictEqual(w.analystPosts().length, 0);
  w.run();
  const [raw] = w.analystPosts();
  assert.strictEqual(raw.text, F.MISTAKES + '\n\nQA: couldn\'t review this alert automatically, so it was forwarded as received.');
  eq(w.chat.botReactions(alert.name), ['👍']);
  w.run();
  assert.strictEqual(w.analystPosts().length, 1);
});

test('a message that can\'t even be forwarded as received is given up on and reported, not retried forever', () => {
  const w = world();
  w.chat.fail = (method, path) => (method === 'post' && path === 'spaces/ANALYST/messages' ? { code: 403, body: { error: { message: 'no access' } } } : null);
  w.paste(F.P0_OK);
  w.run(); w.run();
  const r3 = w.run();
  assert.strictEqual(r3.dead, 1);
  assert.match(r3.errors.join(' '), /gave up on a message after 3 tries/);
  const r4 = w.run();
  eq([r4.handled, r4.errors.length], [0, 0]);
  w.paste(F.AIO);  // later messages still flow once the analyst space works again
  w.chat.fail = null;
  w.run();
  assert.strictEqual(w.analystPosts().length, 1);
});

test('a Zapier message the bot can\'t read still reaches analysts, with its 👍', () => {
  const w = world();
  const msg = w.paste('Zapier summary: 14 alerts sent today.');
  w.run();
  assert.strictEqual(w.analystPosts()[0].text, 'Zapier summary: 14 alerts sent today.\n\nQA: couldn\'t read this message\'s format, so it was forwarded as received.');
  eq(w.chat.botReactions(msg.name), ['👍']);
});

test('the last check replaces anything that would leak with a generic request', () => {
  const w = world();
  const ctx = w.ctx();
  w.bot.postTo_(ctx, w.BUR, 'We forwarded this to the analyst space.', null, 'leak-test');
  w.bot.postTo_(ctx, w.BUR, 'Exposure Tag: "Forwarded Alert" → "Product - Perceived bias"', null, 'allowed', ['Forwarded Alert']);
  eq(w.bursonPosts().map(m => m.text), [B.safeGenericText_(), 'Exposure Tag: "Forwarded Alert" → "Product - Perceived bias"']);
  w.bot.postTo_(ctx, w.ANA, 'Forwarded to the analyst space', null, 'analyst-ok');  // the analyst space isn't checked
  assert.strictEqual(w.analystPosts()[0].text, 'Forwarded to the analyst space');
});

test('dry run: nothing in the Burson space; what the bot would do goes under the forward', () => {
  const w = world({ noWait: true, settings: { dry_run: true } });
  const alert = w.paste(F.MISTAKES);
  w.run();
  eq(w.bursonPosts(), []);
  eq(w.chat.botReactions(alert.name), []);
  const [fwd, note] = w.analystPosts();
  assert.strictEqual(note.thread.name, fwd.thread.name);
  assert.match(note.text, /^Dry run \(Burson space actions\):\n- React 👍 on Burson's message\n- Reply in the thread:\nThe alert has been updated, so there is no need to resend it\. The following updates were made:/);
  assert.strictEqual(w.alertRows()[0].status, 'ok');  // nothing was told, so no resend is matched to it
});

test('analyst legend reactions are copied to Burson\'s post; 👎 feedback never is', () => {
  const w = world({ noWait: true });
  const original = w.paste(F.MISTAKES);
  w.run();
  const [fwd] = w.analystPosts();
  w.chat.addReaction(fwd.name, '✍️');
  w.chat.addReaction(fwd.name, '😂');
  w.run();
  eq(w.chat.botReactions(original.name), ['👍', '✍']);
  w.chat.addReaction(fwd.name, '👎');
  w.run();
  eq(w.chat.botReactions(original.name), ['👍', '✍']);
  assert.strictEqual(w.alertRows()[0].feedback, 'agent_wrong');
  const reactCalls = () => w.chat.calls.filter(c => c.method === 'post' && c.path.endsWith('/reactions')).length;
  const before = reactCalls();
  w.run(); w.run();
  assert.strictEqual(reactCalls(), before);  // nothing changed: nothing re-sent
  const resend = w.paste(F.MISTAKES_FIXED);  // the resend becomes the live post
  w.run();
  w.chat.addReaction(fwd.name, '📦');
  w.run();
  eq(w.chat.botReactions(resend.name), ['👍', '✍', '📦']);
  eq(w.chat.botReactions(original.name), ['👍', '✍', '⬇']);
});

test('reaction copying still sees the newest forwards in a busy analyst space', () => {
  const w = world();
  for (let i = 0; i < 1005; i++) w.chat.say(w.ANA, `analyst chatter ${i}`, { sender: 'users/analyst1' });
  const alert = w.paste(F.P0_OK);
  w.run();
  const fwd = w.analystPosts()[0];
  w.chat.addReaction(fwd.name, '❌');
  w.run();
  eq(w.chat.botReactions(alert.name), ['👍', '❌']);
});

test('custom message ids refused: posts are still deduplicated and recognized as the bot\'s', () => {
  const w = world();
  w.chat.fail = (method, path, query) => (method === 'post' && /\/messages$/.test(path) && query.messageId
    ? { code: 400, body: { error: { message: 'Invalid argument: message_id' } } } : null);
  const alert = w.paste(F.MISTAKES);
  w.run();
  assert.ok(Number(w.g.props.get('CHAT_CLIENT_IDS_OFF')) > 0);
  eq([w.bursonPosts().length, w.analystPosts().length], [1, 1]);
  assert.ok(w.bursonPosts().every(m => !m.clientAssignedMessageId));
  w.reply(alert, 'why?');
  w.run(); w.run();
  eq([w.bursonPosts().length, w.analystPosts().length], [2, 1]);
});

test('newest-first listing refused: reaction copying falls back to the default order', () => {
  const w = world();
  w.chat.fail = (method, path, query) => (method === 'get' && query.orderBy ? { code: 400, body: { error: { message: 'Invalid order_by' } } } : null);
  const alert = w.paste(F.P0_OK);
  w.run();
  w.chat.addReaction(w.analystPosts()[0].name, '❌');
  const r = w.run();
  eq([r.errors, w.chat.botReactions(alert.name)], [[], ['👍', '❌']]);
});

test('a reaction refused in one emoji form is retried in the other', () => {
  const w = world({ noWait: true });
  w.chat.fail = (method, path, query, body) => (method === 'post' && path.endsWith('/reactions') && body.emoji.unicode.includes('\uFE0F')
    ? { code: 400, body: { error: { message: 'Invalid emoji' } } } : null);
  const original = w.paste(F.MISTAKES);
  w.run();
  w.paste(F.MISTAKES_FIXED);
  w.run();
  eq(w.chat.botReactions(original.name), ['👍', '⬇']);  // ⬇️ refused with its variation selector, then sent without
});

test('reactions that fail never hold up the alert', () => {
  const w = world();
  w.chat.fail = (method, path) => (method === 'post' && path.endsWith('/reactions') ? { code: 403, body: { error: { message: 'forbidden' } } } : null);
  w.paste(F.MISTAKES);
  const r = w.run();
  eq([r.errors.length, w.bursonPosts().length, w.analystPosts().length], [0, 1, 1]);
});

test('a burst of messages is worked through over several runs without stalling', () => {
  const w = world({ settings: { max_messages_per_run: 40 } });
  for (let i = 0; i < 100; i++) w.chat.say(w.BUR, `chatter ${i}`);
  w.paste(F.P0_OK);
  w.run();
  assert.strictEqual(w.analystPosts().length, 0);
  w.run(); w.run();
  assert.strictEqual(w.analystPosts().length, 1);
});

// =============================================================================================================
// End to end: setup() and the every-minute poll(), managed from the Control tab (fake Chat, Gemini and Sheets)
// =============================================================================================================

const TEST_FEED = 'spaces/AAQAtestfd1';
const TRIAGED = 'spaces/AAQAaLn375E';
const REAL = 'spaces/AAQAaa_0I9g';
const VENDOR = 'spaces/AAQAvendor01';
const CELL = { B2: [2, 2], B3: [3, 2], B4: [4, 2], B5: [5, 2], B6: [6, 2], B7: [7, 2], B8: [8, 2], B9: [9, 2], C3: [3, 3], C4: [4, 3], C9: [9, 3],
  B10: [10, 2], C10: [10, 3], B25: [25, 2], C25: [25, 3], B26: [26, 2], C26: [26, 3], B29: [29, 2], C29: [29, 3], B30: [30, 2], C30: [30, 3] };

// "Never wait on Burson" (Control row 23, key noWait) ON for the every-minute run: whatever the Control tab says, the
// switches read from it have noWait ON (the row itself is Agent A's: Control.gs CONTROL_SWITCHES_)
function forceNoWait(bot) {
  bot.ev('readSwitches_ = (read => sh => Object.assign(read(sh), { noWait: true }))(readSwitches_)');
  return bot;
}

function e2e(g, opts) {
  g = g || makeGoogle(NOW);
  opts = opts || {};
  if (!g.chat.spaces.size) {
    if (!opts.noTestFeed) g.chat.addSpace(TEST_FEED, 'SLRR Test Feed (Burson Sim)');
    g.chat.addSpace(TRIAGED, ANALYST_NAME);
    g.chat.addSpace(REAL, '[S-F] Burson Automated Alerts V3', { external: true });
    g.chat.addSpace(VENDOR, 'Shared With Vendors', { external: true });
  }
  const bot = loadBot(g.services, g.clock);
  const sheet = () => g.spreadsheets.get(g.props.get('STORE_SHEET_ID'));
  const control = () => sheet().getSheetByName('Control');
  if (opts.noWait) forceNoWait(bot);  // Never wait on Burson ON
  const t = {
    g, bot, chat: g.chat, sheet, control,
    get: name => control().cell(...CELL[name]),
    set: (name, value) => control().getRange(...CELL[name]).setValue(value),
    poll() {
      g.clock.now += 60000;
      bot.poll();
      collectBurson(g.chat, [TEST_FEED, REAL]);
    },
  };
  return t;
}

test('setup(): one run creates the control sheet (ready for testing), starts the bot, and says hello to analysts', () => {
  const g = makeGoogle(NOW);
  const leftovers = {  // what the archived prototype left in the live project's script properties
    ONCALL_BURSON: 'Alex Cox (Hi, team Australia taking over for the next 3 hours!)',
    ONCALL_IM: 'Prashant Mistry (xWF) (signing off from EMEA, thanks team!)',
    PROCESSED_RING: '["spaces/AAQAaa_0I9g/messages/0hG2hGtvyaI.0hG2hGtvyaI"]',
    'PROCESSED_spaces/AAQAaa_0I9g/messages/0hG2hGtvyaI.0hG2hGtvyaI': '1',
    'SELF_POST_spaces/AAQAaLn375E/messages/abc.abc': '1',
    CASE_1001: '{}', CASE_SEQ: '1001', RECENT_CASES: '["1001"]', 'THREAD_spaces/AAQAaLn375E/threads/abc': '1001',
    MY_EMAIL: 'bot@runner.test', MY_USER_NAME: 'users/bot', CLEAN_SPACE_ID: 'spaces/OLDTRIAGE', SOURCE_SPACE_ID: 'spaces/AAQAtestfd1',
    REACT_IN_LIVE_BURSON: 'false',
  };
  Object.entries(leftovers).forEach(([k, v]) => g.props.set(k, v));
  g.props.set('SOMEONE_ELSES_SETTING', 'kept');
  g.triggers.push({ handler: 'pollAlerts', minutes: 1 }, { handler: 'sweepReactions', minutes: 5 });
  const t = e2e(g);
  const s = t.bot.setup();
  eq([s.spaces, s.gemini, s.runs_as, s.old_prototype_entries_cleared], [`SLRR Test Feed (Burson Sim) → ${ANALYST_NAME}`, 'working', 'bot@runner.test', 14]);
  // The knowledge base is read during setup: here Drive doesn't know the two starting documents (as when they aren't
  // shared with the bot's account), and the summary and each row's Bot status say so
  assert.strictEqual(s.knowledge, 'Read 0 of 2 documents (0 characters). 2 couldn\'t be read: see the Bot status column on the Resources tab.');
  eq(Object.keys(leftovers).filter(k => g.props.has(k)), []);
  eq(Array.from(g.props.keys()).sort(), ['BOT_USER', 'FT_BAR_SEED_VERSION', 'GUIDANCE_TAB_MADE', 'KNOWLEDGE_STATE', 'LAST_ANALYST_NAME', 'LAST_ANALYST_SPACE', 'RESOURCES_TAB_MADE',
    'SOMEONE_ELSES_SETTING', 'SPACE_ID:SLRR Test Feed (Burson Sim)', 'STORE_SHEET_ID']);
  assert.strictEqual(s.control_sheet, 'https://docs.google.com/spreadsheets/d/sheet1');
  eq(t.sheet().sheets.map(sh => sh.name), ['Control', 'Resources', 'Guidance', 'Alert log', 'Message log', 'Knowledge cache (bot)']);
  const cacheTab = t.sheet().getSheetByName('Knowledge cache (bot)');
  eq([cacheTab.isSheetHidden(), cacheTab.protections[0].warningOnly, cacheTab.rows[0]],
    [true, true, ['Link', 'Part', 'Text (written by the Burson QA bot)']]);
  eq(t.sheet().getSheetByName('Guidance').rows, [['Guidance', 'Applies to', 'Until', 'Added by']]);  // no example rows: every row is live
  const resources = t.sheet().getSheetByName('Resources');
  eq(resources.rows.map(r => r.slice(0, 4)), [['Name', 'Link', 'What it covers', 'Burson can see it?'],
    ['SLRR Collection Requirements', RES()[0].url, B.ev('GEN').settings.resources[0].covers, 'Yes'],
    ['KOF lists', RES()[1].url, B.ev('GEN').settings.resources[1].covers, 'Yes']]);
  eq(resources.rows.map(r => r[4]), ['Bot status',
    '\u2717 The bot\'s account (bot@runner.test) can\'t open it: share it with that account (Viewer is enough), or check the link.',
    '\u2717 The bot\'s account (bot@runner.test) can\'t open it: share it with that account (Viewer is enough), or check the link.']);
  eq(['B2', 'B3', 'B4', 'C3', 'C4', 'B5', 'B8'].map(t.get),
    ['ON', 'SLRR Test Feed (Burson Sim)', TRIAGED, '\u2713 SLRR Test Feed (Burson Sim)', `\u2713 ${ANALYST_NAME}`, '\u2705 Working', 'bot@runner.test']);
  eq(t.control().validations['2,2'].values, ['ON', 'OFF']);
  eq([9, 10, 11, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57].map(r => t.control().cell(r, 1)), ['Mirror space', 'Auto-correct space',
    'Auto-send Social Alerts', 'Track post-alert outcomes', 'Relay with S-F Burson', 'Never wait on Burson', 'Post in S-F Burson',
    'S-F Burson space', 'Burson test copy', 'Draft follow-ups', 'Draft answers to questions', 'Safety valve', 'Testing: send to',
    'BigQuery lookback', 'Work directly in B25 (Google-only)', 'Other alerts space', 'Proactive watch', 'Watch alerts', 'Temp checks', 'Group test emails',
    'Fast triage (Gemini Decisions)', 'Fast triage: rank and early watch', 'Fast triage: hold back noise',
    'Hold-back: about_google at or below', 'Hold-back: routine_noise at or above',
    'Hold-back and early watch: answer confidence at or above',
    'Early watch: about_google and brand_risk, each at or above',
    'Early watch: distinct accounts, at least', 'Write early-wave records to BigQuery',
    'Early watch: independent_reports at or above', 'Early Detection: also read the AMIE table', 'Early Detection: also read Brandwatch live (not X)', 'Proactive watch: also read the AMIE table', 'Open engine: judgment in place of caps', '', '',
    'Live dashboard', 'Slide deliveries', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is now a switch
  eq([t.get('B29'), t.control().validations['29,2'].values], ['OFF', ['ON', 'OFF']]);  // starts OFF, like every switch
  eq([t.control().cell(32, 2), t.control().validations['32,2'].values], ['OFF', ['ON', 'OFF']]);  // row 32 too: a person turns it ON
  eq([t.control().cell(34, 2), t.control().validations['34,2'].values], ['OFF', ['ON', 'OFF']]);  // and row 34 (Proactive watch)
  eq([t.control().cell(36, 2), t.control().validations['36,2'].values], ['OFF', ['ON', 'OFF']]);  // and row 36 (Temp checks)
  eq([t.control().cell(37, 2), t.control().validations['37,2'].values], ['OFF', ['ON', 'OFF']]);  // and row 37 (Group test emails)
  // Watch alerts (B35): OFF, with its strict dropdown; only a person chooses where the watch's alerts go
  eq([t.control().cell(35, 2), t.control().validations['35,2'].values, t.control().validations['35,2'].allowInvalid],
    ['OFF', ['OFF', 'Other alerts space (B33)', 'Mirror space (B9)', 'Auto-correct space (B10)'], false]);
  // Other alerts space (B33): blank, with no dropdown (a space link, like B9 and B10); C33 says what it's for
  eq([t.control().cell(33, 2), t.control().cell(33, 3), t.control().validations['33,2']], ['', t.bot.ev('OS_HINT_'), undefined]);
  // BigQuery lookback (B31): starts at the longest, 60 minutes, with its strict 15 / 30 / 45 / 60 minutes dropdown; C31 what the bot uses
  eq([t.control().cell(31, 2), t.control().validations['31,2'].values, t.control().validations['31,2'].allowInvalid],
    ['60 minutes', ['15 minutes', '30 minutes', '45 minutes', '60 minutes'], false]);
  assert.match(t.control().cell(31, 3), /^✓ Direct BigQuery alerts \(row 15\) and Early detection \(row 19\) look at posts from the last hour$/);
  eq([t.get('B25'), t.get('C25')], ['', t.bot.ev('SFB_BLANK_NOTE_')]);  // S-F Burson is only ever pasted there by a person
  assert.match(t.get('C25'), /^⚠️ Not set: paste S-F Burson's link \(the real Burson space\)\. Until then the Mirror, Auto-correct and Relay are paused, and the bot posts nothing in any space people outside Google can join\.$/);
  eq([t.control().cell(26, 2), t.control().cell(26, 3)], ['', t.bot.ev('RTC_BLANK_NOTE_')]);
  assert.match(t.control().cell(58, 1), /^• Every minute the bot reads the Burson space/);
  assert.match(t.control().cell(61, 1), /^• S-F Burson space \(B25\): which space is the real Burson space/);
  assert.match(t.control().cell(63, 1), /^• The Resources tab is the bot's knowledge base\. Gemini reads every document listed there/);
  assert.ok(t.sheet().getSheetByName('Alert log').protections[0].warningOnly);
  eq(g.triggers, [{ handler: 'poll', minutes: 1 }]);
  assert.strictEqual(g.props.get('BOT_USER'), 'users/bot');
  eq(t.chat.botPosts(TRIAGED).map(m => m.text),
    ['The Burson QA bot is set up. Every alert posted in SLRR Test Feed (Burson Sim) comes here, already checked.\n' +
      '- Control tab: <https://docs.google.com/spreadsheets/d/sheet1|Control Sheet>']);
  t.set('B2', 'OFF');
  t.bot.setup();  // safe to re-run: same trigger, no second hello, the Control tab keeps what people set
  eq(g.triggers, [{ handler: 'poll', minutes: 1 }]);
  assert.strictEqual(t.chat.botPosts(TRIAGED).length, 1);
  assert.strictEqual(t.get('B2'), 'OFF');
  assert.strictEqual(t.get('B5'), '⏸ Paused: Bot is OFF. Set it to ON to restart.');
});

test('orphan triggers: poll() deletes a trigger left for a function no longer in the project (one listed in ORPHAN_HANDLERS_), keeps the bot\'s own, never deletes one whose function exists, and looks at most every 6 hours; with none listed (as now) it deletes nothing', () => {
  const retire = w => w.bot.ev("ORPHAN_HANDLERS_.push('retiredPoll')");  // a handler whose code was removed
  const t = e2e();
  retire(t);
  t.bot.setup();
  t.g.triggers.push({ handler: 'retiredPoll', minutes: 15 }, { handler: 'onTnsTestFormSubmit', source: 'form1', event: 'formSubmit' });
  t.poll();
  eq(t.g.triggers.map(x => x.handler), ['poll', 'onTnsTestFormSubmit']);
  t.g.triggers.push({ handler: 'retiredPoll', minutes: 15 });  // put back: the next look is 6 hours away
  t.poll();
  eq(t.g.triggers.map(x => x.handler), ['poll', 'onTnsTestFormSubmit', 'retiredPoll']);
  t.g.cache.delete('ORPHAN_TRIGGER_SWEEP');  // 6 hours later (the cache entry expired)
  t.poll();
  eq(t.g.triggers.map(x => x.handler), ['poll', 'onTnsTestFormSubmit']);
  // a handler whose function is in the project is never deleted, even when listed
  const u = e2e();
  retire(u);
  u.bot.setup();
  u.bot.ev('function retiredPoll() {}');
  u.g.triggers.push({ handler: 'retiredPoll', minutes: 15 });
  u.poll();
  eq(u.g.triggers.map(x => x.handler), ['poll', 'retiredPoll']);
  // setup() deletes it too
  const v = e2e();
  retire(v);
  v.g.triggers.push({ handler: 'retiredPoll', minutes: 15 });
  v.bot.setup();
  eq(v.g.triggers, [{ handler: 'poll', minutes: 1 }]);
  // with nothing listed, a trigger the bot doesn't own by name is left alone
  const w = e2e();
  w.bot.setup();
  w.g.triggers.push({ handler: 'retiredPoll', minutes: 15 });
  w.poll();
  eq(w.g.triggers.map(x => x.handler), ['poll', 'retiredPoll']);
});

test('the retired dry-run mode never comes back: its name is in no file git tracks (both Apps Script projects, the Python agent, the Console, the add-on, config, docs, SQL, infra and these tests); the word is left only in the topic keyword for posts about being "...banned" and in the CSS styling of buttons and cards', () => {
  const fs = require('fs');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const retired = /s[h]adow/i;  // spelled with [h] so that a search of the repo for the word doesn't find this file
  const root = path.join(__dirname, '..', '..');
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0')
    .filter(f => f && !/\.(png|jpe?g|gif|ico|svg|webp|pdf|woff2?|ttf|eot|zip|gz|sqlite|db|pyc)$/i.test(f));
  const allowed = new RegExp([
    String.raw`s[h]adow \?-\?ban`, String.raw`s[h]adow[ -]?ban\w*`,  // the topic keyword (posts about being "...banned")
    String.raw`box-?s[h]adow`, String.raw`transition-s[h]adow`, String.raw`\bs[h]adow-(?:sm|md|lg|xl|2xl|inner|none)\b`,  // CSS
  ].join('|'), 'gi');
  const hits = [];
  files.forEach(f => {
    const full = path.join(root, f);
    if (!fs.existsSync(full)) return;  // deleted in the working tree, not committed yet
    fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
      if (retired.test(line.replace(allowed, ''))) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  });
  assert.ok(files.length > 300, `${files.length} files read`);
  eq(hits, []);
});

test('no real email address, key, token or personal path is in any file git tracks (scripts/repo_safety_scan.js, also the pre-commit hook): recipients live on the Control sheet, keys in Secret Manager', () => {
  const scan = require('../../scripts/repo_safety_scan.js');
  eq(scan.scanRepo(false), []);
  // What the scanner catches and what it lets through (the samples are built in pieces so this file stays clean)
  const at = '@';
  const what = text => scan.scanText(text).map(h => h.what);
  eq(what(`send it to someone${at}corp-domain.com please`), ['an email address at corp-domain.com']);
  eq(what(`tester${at}testing.test, nobody${at}testing.invalid, chat${at}system.gserviceaccount.com`), []);
  eq(what('npx @google/clasp push; react@18.3.1; @types/node'), []);
  eq(what('key = ' + 'AI' + 'za' + 'B'.repeat(35)), ['a Google API key']);
  eq(what('-----BEGIN ' + 'PRIVATE ' + 'KEY-----'), ['a private key']);
  eq(what('cd ' + '/Us' + 'ers/' + 'someone/Desktop/project'), ['a personal home directory path']);
  eq(what('cd /home/user/project && ls'), []);
  // an address put together from pieces so a search doesn't see it (two at a real domain sat in the tests that way)
  eq(what(['addr = f"viewer@', '{', "'exa", "mple' + '.c", "om'}", '"'].join('')), ['an email address assembled from pieces']);
  eq(what(['const d = "exa', 'mple" + ".o', 'rg";'].join('')), ['an email address assembled from pieces']);
  eq(what('const file = name + ".json"; const url = base + "/v1"; const who = "viewer@" + VIEWER_DOMAIN;'), []);
});

test('setup() with a space it can\'t find still installs the bot and explains the problem on the Control tab', () => {
  const t = e2e(null, { noTestFeed: true });
  const s = t.bot.setup();
  assert.match(s.spaces, /^PROBLEM/);
  eq(t.g.triggers, [{ handler: 'poll', minutes: 1 }]);
  assert.strictEqual(t.get('B5'), '⚠️ No space named "SLRR Test Feed (Burson Sim)" (Burson space). Paste the space\'s link instead. The bot tries again every minute.');
  assert.strictEqual(t.get('C3'), '✗ check this link');
  t.chat.addSpace(TEST_FEED, 'SLRR Test Feed (Burson Sim)');  // the space appears (or someone fixes the link)
  t.poll();
  eq([t.get('B5'), t.get('C3')], ['✅ Working', '✓ SLRR Test Feed (Burson Sim)']);
});

test('end to end in the test spaces: alert, question, fixed resend, analyst reaction, and the Control tab keeps up', () => {
  const t = e2e(null, { noWait: true });
  t.bot.setup();
  t.set('B30', 'tester@testing.test');
  t.g.vertex.answer = () => 'Gems is no longer used, so use *Gemini App*.';
  const alert = t.chat.say(TEST_FEED, F.MISTAKES, { sender: 'users/bot' });  // the tester pastes from the bot's account
  t.poll();
  // The Social Alert goes out at once with the bot's corrections applied, as it would live but only to the stand-in, so
  // the alert gets the emojis for the distros it would have gone to; Burson is told what changed and that it's processed
  eq(t.chat.botReactions(alert.name), ['📰', '📦']);
  assert.match(t.chat.botPosts(TEST_FEED)[0].text, /^The alert has been updated, so there is no need to resend it\. The following updates were made:\n- Product updated to Gemini App\./);
  assert.ok(!/escalation email in review/.test(t.chat.botPosts(TEST_FEED)[0].text));
  const forwards = () => t.chat.botPosts(TRIAGED).slice(1).filter(m => !m.threadReply);  // top-level forwards after setup hello
  const notes = () => t.chat.botPosts(TRIAGED).slice(1).filter(m => m.threadReply);
  assert.match(forwards()[0].text, /^🚨THIS ALERT MEETS P0 CRITERIA🚨/);
  eq([notes(), t.g.gmail.allDrafts().length], [[], 0]);  // no draft and no note: nothing is left for a person to do
  const [sent] = t.g.gmail.sentMessages();
  eq([sent.to, sent.cc, sent.bcc], [['tester@testing.test'], [], []]);
  assert.match(sent.subject, /^\S+SOCIAL ALERT\S+: Gemini App \| /);  // the real subject: no [TEST] tag
  assert.match(sent.text, /\n\nWould have gone to: To: Gemini App alert POCs; Cc: GCPA, standard CC list$/);
  assert.match(sent.html, /Would have gone to: To: Gemini App alert POCs; Cc: GCPA, standard CC list<\/div><\/body><\/html>$/);
  t.chat.say(TEST_FEED, 'why is the product wrong?', { thread: alert.thread.name, sender: 'users/bot' });
  t.poll();
  assert.strictEqual(t.chat.botPosts(TEST_FEED)[1].text, 'Gems is no longer used, so use *Gemini App*.');
  const resend = t.chat.say(TEST_FEED, F.MISTAKES_FIXED, { sender: 'users/bot' });
  t.poll();
  eq([t.chat.botReactions(resend.name), t.chat.botReactions(alert.name)], [[], ['📰', '📦', '⬇']]);  // already actioned: no 👍
  assert.strictEqual(t.chat.botPosts(TEST_FEED).length, 2);  // no redundant thank-you message on resend
  eq([forwards().length, t.g.gmail.sentMessages().length], [1, 1]);  // nothing forwarded or sent again
  t.chat.addReaction(forwards()[0].name, '✍️');
  t.poll();
  eq(t.chat.botReactions(resend.name), ['📰', '📦', '✍']);  // the updated post carries the alert's emojis, then ✍️
  assert.strictEqual(t.chat.botPosts(TEST_FEED).length, 2);
  const log = t.sheet().getSheetByName('Alert log');
  const statusCol = log.rows[0].indexOf('status');
  eq(log.rows.slice(1).map(r => r[statusCol]), ['superseded', 'fixed']);
  eq(t.get('B5'), '✅ Working');
  assert.match(t.get('B7'), /^2 alerts reviewed · 1 (?:sent back to Burson for fixes|corrected \(Burson told\)) · 1 question answered$/);
  assert.match(t.get('B6'), /^Oct 14, \d{1,2}:\d\d (AM|PM) EDT$/);
});

test('the Resources tab: an older install gets it on its next run, link chips work, a deleted tab stays deleted', () => {
  const t = e2e();
  t.bot.setup();
  const tabs = () => t.sheet().sheets.map(sh => sh.name);
  const answerPrompts = () => t.g.vertex.calls.filter(c => c.payload.generationConfig.responseSchema.properties.answer)
    .map(c => c.payload.contents[0].parts[0].text);
  t.sheet().sheets = t.sheet().sheets.filter(sh => sh.name !== 'Resources');  // an install from before the tab existed
  t.g.props.delete('RESOURCES_TAB_MADE');
  const alert = t.chat.say(TEST_FEED, F.MISTAKES, { sender: 'users/bot' });
  t.poll();
  t.chat.say(TEST_FEED, 'where do the KOF rules come from?', { thread: alert.thread.name, sender: 'users/bot' });
  t.poll();
  eq(tabs(), ['Control', 'Resources', 'Guidance', 'Alert log', 'Message log', 'Knowledge cache (bot)', 'Alert memory (bot)']);
  assert.ok(answerPrompts()[0].includes(`- KOF lists: ${RES()[1].url}`), answerPrompts()[0]);

  const tab = t.sheet().getSheetByName('Resources');  // a pasted link Sheets shows as the document's title (a chip)
  tab.rows[1][1] = 'SLRR Collection Requirements';
  tab.links['2,2'] = 'https://docs.google.com/document/d/chipdoc/edit';
  t.chat.say(TEST_FEED, 'what does the engagement level depend on?', { thread: alert.thread.name, sender: 'users/bot' });
  t.poll();
  assert.ok(answerPrompts()[1].includes('- SLRR Collection Requirements: https://docs.google.com/document/d/chipdoc/edit'), answerPrompts()[1]);

  t.sheet().sheets = t.sheet().sheets.filter(sh => sh.name !== 'Resources');  // deleted on purpose
  t.chat.say(TEST_FEED, 'and the issue status?', { thread: alert.thread.name, sender: 'users/bot' });
  t.poll();
  assert.ok(!tabs().includes('Resources'));
  assert.ok(!answerPrompts()[2].includes('[Resources'), answerPrompts()[2]);
  eq(t.chat.botPosts(TEST_FEED).length, 4);  // the fix request + three answers
});

test('Bot OFF pauses it; back ON it starts from that moment', () => {
  const t = e2e();
  t.bot.setup();
  t.set('B30', 'tester@testing.test');
  t.set('B2', 'OFF');
  const skipped = t.chat.say(TEST_FEED, F.MISTAKES, { sender: 'users/bot' });
  t.poll();
  assert.strictEqual(t.get('B5'), '⏸ Paused: Bot is OFF. Set it to ON to restart.');
  t.set('B2', 'ON');
  t.poll();
  eq([t.chat.botReactions(skipped.name), t.chat.botPosts(TRIAGED).length], [[], 1]);  // posted while off: skipped
  const fresh = t.chat.say(TEST_FEED, F.P0_OK, { sender: 'users/bot' });
  t.poll();
  eq([t.chat.botReactions(fresh.name), t.chat.botPosts(TRIAGED).filter(m => !m.threadReply).length, t.get('B5')],
    [['📰', '📦', '🌎'], 2, '✅ Working']);  // handled: forwarded, and its Social Alert sent to the stand-in
});

test('switching the Burson space on the Control tab: no old backlog, and test and live alerts never mix', () => {
  const t = e2e();
  t.bot.setup();
  t.set('B30', 'tester@testing.test');
  t.set('B25', REAL);  // S-F Burson, as it would be set before going live
  t.set('B29', 'ON');  // the Safety valve: Testing (every email only to the stand-in), even with B26 blank
  t.chat.say(TEST_FEED, F.MISTAKES, { sender: 'users/bot' });
  t.poll();
  const old = t.chat.say(REAL, F.AIO, { sender: 'users/zapier', type: 'BOT' });  // already in the real space...
  t.g.clock.now += 3600e3;                                                     // ...an hour before the switch
  t.set('B3', 'https://mail.google.com/chat/u/0/#chat/space/AAQAaa_0I9g');
  t.poll();
  eq([t.get('C3'), t.get('B5'), t.chat.botReactions(old.name)], ['✓ [S-F] Burson Automated Alerts V3', '✅ Working', []]);
  const live = t.chat.say(REAL, F.MISTAKES_FIXED, { sender: 'users/zapier', type: 'BOT' });  // same post as the test alert
  t.poll();
  // a new alert here with its own Social Alert (still only to the stand-in), not a "resend" of the test one (no ⬇️); its
  // emojis stay on the analysts' copy: nothing goes on S-F Burson's post while Post in S-F Burson is OFF (Outbox.gs)
  const liveCopy = t.chat.botPosts(TRIAGED).filter(m => !m.threadReply).slice(-1)[0];
  eq([t.chat.botReactions(live.name), t.chat.botReactions(liveCopy.name), t.g.gmail.sentMessages().map(m => m.to)],
    [[], ['\ud83d\udcf0', '\ud83d\udce6'], [['tester@testing.test'], ['tester@testing.test']]]);
  assert.strictEqual(t.chat.botPosts(TRIAGED).filter(m => !m.threadReply).length, 3);  // hello + test forward + live forward
  eq(t.chat.botPosts(REAL), []);
});

test('problems on the Control tab are explained there, and nothing goes to a space that failed the checks', () => {
  const t = e2e();
  t.bot.setup();
  t.set('B30', 'tester@testing.test');
  t.set('B25', REAL);  // S-F Burson (B25): the analyst space can't be it
  t.chat.say(TEST_FEED, F.MISTAKES, { sender: 'users/bot' });
  const feedOk = '✓ SLRR Test Feed (Burson Sim)';
  const cases = [
    ['SLRR Test Feed (Burson Sim)', '⚠️ The Burson space and the analyst space are the same space. Change one of them.', ['✗ see Status', '✗ see Status']],
    ['https://chat.google.com/room/AAQAaa_0I9g', '⚠️ The analyst space can\'t be the Burson alerts space.', [feedOk, '✗ see Status']],
    [VENDOR, '⚠️ The analyst space "Shared With Vendors" allows people outside Google, so Burson could see it.', [feedOk, '✗ see Status']],
  ];
  for (const [value, status, notes] of cases) {
    t.set('B4', value);
    for (let i = 0; i < 3; i++) t.poll();
    assert.ok(t.get('B5').startsWith(status), t.get('B5'));
    eq([t.get('C3'), t.get('C4')], notes);
  }
  // 9 failed runs in a row, but the analyst space was wrong each time, so the failure notice had nowhere safe to go.
  eq([TEST_FEED, REAL, VENDOR, TRIAGED].map(s => t.chat.botPosts(s).length), [0, 0, 0, 1]);  // just the setup hello
  t.set('B4', TRIAGED);
  t.set('B3', 'spaces/NOPENOPE123');
  t.poll();
  eq([t.get('B5'), t.get('C3'), t.get('C4')], ['⚠️ Can\'t open the Burson space (spaces/NOPENOPE123). Check the link, and that ' +
    'bot@runner.test is a member of that space. The bot tries again every minute.', '\u2717 check this link', `\u2713 ${ANALYST_NAME}`]);
  // The analyst space passes its checks again, so analysts are told (once) that alerts aren't flowing.
  assert.match(t.chat.botPosts(TRIAGED)[1].text, /^The Burson QA bot has had problems for 10 runs in a row/);
  t.set('B3', '');
  t.poll();
  eq([t.get('B5'), t.get('C3')], ['⚠️ The Burson space is blank. Paste the space\'s link there. The bot tries again every minute.', '✗ check this link']);
  eq([t.chat.botPosts(TRIAGED).length, t.chat.botPosts(TEST_FEED).length], [2, 0]);
  t.set('B3', 'SLRR Test Feed (Burson Sim)');
  t.poll();
  eq([t.get('B5'), t.get('C3'), t.get('C4')], ['✅ Working', feedOk, `✓ ${ANALYST_NAME}`]);
  const after = t.chat.botPosts(TRIAGED).slice(2).map(m => m.text);
  assert.match(after[0], /^🚨THIS ALERT MEETS P0 CRITERIA🚨/);  // the alert pasted before the problems is still handled
  eq(after.slice(1), ['The Burson QA bot is running again and catching up on alerts.']);  // its email went to the stand-in
  eq([t.chat.botPosts(TEST_FEED).length, t.g.gmail.sentMessages().length], [1, 1]);  // its fix request, and its Social Alert
});

test('repeated failed runs are reported to analysts (never Burson) and on the Control tab, and so is the recovery', () => {
  const t = e2e();
  t.bot.setup();
  t.chat.fail = (method, path) => (method === 'get' && path === TEST_FEED + '/messages' ? { code: 403, body: { error: { message: 'PERMISSION_DENIED' } } } : null);
  for (let i = 0; i < 5; i++) t.poll();
  assert.strictEqual(t.g.props.get('FAIL_STREAK'), '5');
  assert.strictEqual(t.get('B5'), `⚠️ Chat API 403 on reading ${TEST_FEED}: PERMISSION_DENIED The bot tries again every minute.`);
  const notice = t.chat.botPosts(TRIAGED)[1].text;
  assert.match(notice, /^The Burson QA bot has had problems for 5 runs in a row/);
  assert.ok(notice.endsWith('- Status and controls: <https://docs.google.com/spreadsheets/d/sheet1|Control Sheet>'), notice);
  for (let i = 0; i < 3; i++) t.poll();
  assert.strictEqual(t.chat.botPosts(TRIAGED).length, 2);  // told once, not every run
  eq(t.chat.botPosts(TEST_FEED), []);
  t.chat.fail = null;
  t.poll();
  assert.strictEqual(t.chat.botPosts(TRIAGED)[2].text, 'The Burson QA bot is running again and catching up on alerts.');
  eq([t.g.props.get('FAIL_STREAK'), t.get('B5')], ['0', '✅ Working']);
});

test('if the bot\'s sheet is deleted, analysts are still told, in the analyst space of the last good run', () => {
  const t = e2e();
  t.bot.setup();
  t.poll();
  t.g.spreadsheets.clear();
  for (let i = 0; i < 5; i++) t.poll();
  assert.match(t.chat.botPosts(TRIAGED)[1].text, /^The Burson QA bot has had problems for 5 runs in a row, [^]*Can't open the bot's sheet sheet1/);
  eq([t.chat.botPosts(TRIAGED).length, t.chat.botPosts(TEST_FEED).length], [2, 0]);
});

test('listMySpaces() gives links to paste; tryAlert() previews without posting', () => {
  const t = e2e(null, { noWait: true });
  assert.ok(t.bot.listMySpaces().includes('SLRR Test Feed (Burson Sim)  →  https://mail.google.com/chat/u/0/#chat/space/AAQAtestfd1'));
  t.bot.tryAlert();
  assert.ok(t.g.logs.some(l => l.includes('===== Burson would see (in the alert\'s thread) =====\nThe alert has been updated, so there is no need to resend it. The following updates were made:')));
  assert.ok(t.g.logs.some(l => l.includes('===== Social Alert draft =====\nSubject: 🟥SOCIAL ALERT🟥: Gemini App')));
  eq([t.chat.botPosts(TEST_FEED), t.chat.botPosts(TRIAGED)], [[], []]);
});

// =============================================================================================================
// V2: Escalate.gs, Email.gs, Mail.gs, Drafts.gs (Social Alert Gmail drafts + T&S + Workspace form)
// =============================================================================================================

test('escalation_ and planRecipients_: P0/P1/P2 rules, Regional Leads (EMEA parent + APAC P0), Channel Owner, T&S', () => {
  // 1. P1 AI Overviews with 29,425 engagements -> escalated, adds 2K+ conditional recipients
  const aio = review(F.AIO);
  const escAio = B.escalation_(aio.fields, { now: NOW });
  assert.strictEqual(escAio.escalated, true);
  assert.strictEqual(escAio.priority, 'P1');
  const planAio = B.planRecipients_(escAio, escAio.text, []);
  eq(planAio.to, []);
  assert.ok(planAio.cc.includes('ai-overviews@alerts.test'));
  assert.ok(planAio.cc.includes('ai-overviews-high@alerts.test'));  // 2K+ conditional add-on
  assert.ok(planAio.cc.includes('search@alerts.test'));
  assert.ok(planAio.cc.includes('default-cc@alerts.test'));          // default_cc

  // 2. P0 Paris Riots -> escalated, France + EMEA parent leads in CC, viral KOF triggers T&S
  const paris = review(F.PARIS);
  const escParis = B.escalation_(paris.fields, { now: NOW });
  assert.strictEqual(escParis.escalated, true);
  assert.strictEqual(escParis.priority, 'P0');
  eq(escParis.non_us_markets, ['France']);
  eq(escParis.ts_reasons, ['viral KOF', 'AI hallucination']);  // Search + dangerous results: IMs file T&S on these too
  const planParis = B.planRecipients_(escParis, escParis.text, []);
  assert.ok(planParis.groups.includes('Regional Leads'));
  assert.ok(planParis.cc.includes('france-leads@alerts.test'));      // France lead from knowledge_docs/comms_region
  assert.ok(planParis.cc.includes('emea-leads@alerts.test'));         // EMEA parent lead from knowledge_docs/comms_region
  assert.ok(planParis.cc.includes('civics@alerts.test'));      // Civics (Politics topic)

  // 3. P2 LOW engagement -> NOT escalated
  const mapsLow = review(MAPS_LOW);
  const escLow = B.escalation_(mapsLow.fields, { now: NOW });
  assert.strictEqual(escLow.escalated, false);

  // 4. Owned social post (@madebygoogle) -> Channel Owner resolved from 1,002 channel owners
  const owned = Object.assign({}, aio.fields, {
    exposure_tag: 'Content - Negative reaction to owned social post',
    summary: 'Negative replies on https://www.instagram.com/madebygoogle',
  });
  const escOwned = B.escalation_(owned, { now: NOW });
  const planOwned = B.planRecipients_(escOwned, escOwned.text, []);
  assert.ok(planOwned.groups.includes('Channel Owner'));
  assert.ok(planOwned.cc.includes('madebygoogle-owner@alerts.test'));
});

test('Social Alert draft lifecycle: created on escalation, group emojis add recipients, sent -> auto-applied emojis in both spaces, ongoing issue threads reply', () => {
  const w = world({ noWait: true, drafts: { live: false, mailbox: 'im@ops.test', from: 'Brand Social <im@ops.test>' } });

  // 1. Non-escalated alert with a tag mistake (P2 LOW) is forwarded to analysts, corrected, and processed right away: ❌
  //    (no Social Alert needed; nothing waits on Burson), and Burson is told what changed; no Gmail draft
  const lowMsg = w.paste(MAPS_LOW);
  w.run();
  assert.strictEqual(w.gmail.allDrafts().length, 0);
  assert.strictEqual(w.analystPosts().length, 1);
  eq(w.chat.botReactions(lowMsg.name), ['❌']);

  // 2. Resend where engagement jumped to HIGH (4,200) -> escalated! New forward + Gmail draft created
  w.paste(MAPS_LOW_RESENT);
  const r2 = w.run();
  assert.strictEqual(r2.drafts, 1);
  assert.strictEqual(w.gmail.allDrafts().length, 1);
  const d1 = w.gmail.allDrafts()[0];
  assert.strictEqual(d1.subject, '[TEST] 🟥SOCIAL ALERT🟥: Maps | Google Maps Street View Dog Meme | Reddit | 4200 Engagements');
  eq(d1.to, ['im@ops.test']);  // test space addresses only to mailbox
  assert.ok(!/Test draft|TEST DRAFT|maxkaplan@google\.com/.test(d1.html + d1.text));  // nothing added above the email
  assert.ok(d1.text.startsWith('SOCIAL ALERT\n'));
  assert.strictEqual(w.bursonPosts().length, 1);  // only the initial fix request, no status thank-you

  // 3. Analyst reacts ❌ on the Maps forward -> draft deleted from Gmail + ❌ applied (no narration: the ❌ says it)
  const mapsFwd = w.analystPosts().filter(m => !m.threadReply)[1];
  w.chat.addReaction(mapsFwd.name, '❌');
  w.run();
  assert.strictEqual(w.gmail.allDrafts().length, 0);
  assert.ok(!w.analystPosts().some(m => /draft deleted/i.test(m.text)));
  assert.strictEqual(w.bursonPosts().length, 1);

  // 4. Live mode, no stand-in: P0 alert creates draft addressed to real To/Cc, analyst reacts 💼 (People Comms) to add recipients, then sends it
  const live = world({ noWait: true, drafts: { live: true, mailbox: 'im@ops.test', from: 'Brand Social <sender@alerts.test>' } });
  const p0Msg = live.paste(F.P0_OK);
  live.run();
  eq(live.bursonPosts(), []);
  eq(live.chat.botReactions(p0Msg.name), ['👍']);  // receipt confirmed; the action waits on a person sending the draft
  const [liveDraft] = live.gmail.allDrafts();
  assert.strictEqual(liveDraft.subject, '⬛SOCIAL ALERT🟥'.replace('🟥', '⬛') + ': Search | Alleged Bias in Search Reporting for Paris Riots 2026 | X | 1 Engagements');
  assert.ok(liveDraft.to.includes('search@alerts.test'));
  assert.ok(liveDraft.cc.includes('france-leads@alerts.test'));  // France regional lead
  assert.ok(!liveDraft.cc.includes('people-comms@alerts.test'));

  // Analyst reacts 💼 (people_comms) -> added to live draft's Cc header while keeping existing headers/body
  const [p0Fwd] = live.analystPosts().filter(m => !m.threadReply);
  live.chat.addReaction(p0Fwd.name, '💼');
  const rUpd = live.run();
  assert.strictEqual(rUpd.drafts_updated, 1);
  const updatedDraft = live.gmail.draft(liveDraft.id);
  assert.ok(updatedDraft.cc.includes('people-comms@alerts.test'));
  assert.ok(!live.analystPosts().some(m => /Added to the Social Alert draft/.test(m.text)));

  // Analyst sends the draft in Gmail -> next run detects SENT and marks 📦 + the teams it went to (💼 People Comms, 🌎 Regional
  // Leads) in BOTH spaces. GCPA has no address on file, so a real email can't have reached it: no 📰 without the stand-in.
  const sentMsgId = live.gmail.send(liveDraft.id, 'im@ops.test', '<sent-p0-paris@mail.test>');
  const rSent = live.run();
  assert.strictEqual(rSent.drafts_sent, 1);
  eq(live.chat.botReactions(p0Fwd.name), ['📦', '💼', '🌎']);
  eq(live.chat.botReactions(p0Msg.name), ['👍', '💼', '📦', '🌎']);
  assert.ok(!live.analystPosts().some(m => /Social Alert sent by/.test(m.text)));
  eq(live.bursonPosts(), []);
  assert.strictEqual(live.alertRows()[0].email_status, 'sent');
  assert.strictEqual(live.alertRows()[0].email_message_id, sentMsgId);

  // 5. Follow-up alert on the same issue 2 hours later with HIGH engagement -> threads as a reply (Re: ..., same threadId, In-Reply-To)
  live.g.clock.now += 2 * 3600 * 1000;
  const followUp = F.P0_OK
    .replace('https://x.com/WasSamLowryEsq/status/2109952063492993159', 'https://x.com/AnotherUser/status/2109952063492999999')
    .replace('VERY LOW (1 engagements)', 'HIGH (4200 engagements)')
    .replace(',1,WasSamLowryEsq,', ',4200,AnotherUser,');
  live.paste(followUp);
  live.run();
  const [replyDraft] = live.gmail.allDrafts();
  assert.strictEqual(replyDraft.threadId, liveDraft.threadId);
  assert.strictEqual(replyDraft.inReplyTo, sentMsgId);
  assert.strictEqual(replyDraft.subject, 'Re: ' + liveDraft.subject);
  assert.ok(live.analystPosts().some(m => m.text.includes('Social Alert update draft (replying to the earlier email)')));
});

// The T&S Intake Form (go/WD-Triage) and how the tests read a pre-filled link
const TNS_REAL = 'https://docs.google.com/forms/d/e/1FAIpQLScd0beRIurDyc5beuY9_tYDEvp-UFAIKY2FWTdLvsUV4whSkw/viewform';
const tnsParams = url => new URLSearchParams(String(url).split('?')[1]);
const tnsLink = text => {
  const m = String(text).match(/<(https:\/\/docs\.google\.com\/forms\/[^|>]+)\|Open the (?:test copy of the )?T&S Intake Form, pre-filled>/);
  return m && m[1];
};
const tnsSubmit = answers => ({ response: { getItemResponses: () => answers.map(([t, v]) => ({ getItem: () => ({ getTitle: () => t }), getResponse: () => v })) } });

test('T&S note while testing: a pre-filled link to a test copy of the T&S form in the tester\'s Drive, never the real form; submitting the copy sends the tester a stand-in confirmation, and the bot marks ✍️; Workspace form note on Workspace alerts', () => {
  const w = world({ noWait: true, drafts: { live: false, mailbox: 'im@ops.test', from: 'Brand Social <im@ops.test>' } });
  // 1. Paris P0 has KOF: Yes -> viral KOF -> T&S note included automatically in draft note
  const paris = w.paste(F.PARIS);
  w.run();
  const notes = w.analystPosts().filter(m => m.threadReply).map(m => m.text).join('\n');
  assert.match(notes, /T&S form needed \(viral KOF, AI hallucination\): <https:\/\/docs\.google\.com\/forms\/d\/e\/pub-form1\/viewform\?usp=pp_url&[^|]+\|Open the test copy of the T&S Intake Form, pre-filled>/);
  assert.ok(!notes.includes('1FAIpQLScd0be'), 'the real form never shows up while testing');
  // The copy: the real form's questions and choices, not shared (sign-in required), with its submit trigger
  const form = w.g.forms.get('form1');
  eq([w.g.forms.size, form.title, form.requireLogin, form.published, form.accepting], [1, 'T&S Intake Form (test copy, only you)', true, true, true]);
  eq(form.items.map(it => [it.type, it.title, it.required, (it.choices || []).length]), [
    ['list', 'Google Product:', true, 13], ['list', 'Topic Impacted:', true, 8], ['text', 'Link / URL(s) in question:', true, 0],
    ['paragraph', 'What\'s the Issue? ', true, 0], ['paragraph', 'Additional screenshots/notes etc:', false, 0],
    ['choice', '[Title_Prefix] WD Intake Request', true, 6]]);
  eq(form.items[5].choices, ['Marketing', 'T&S Analysis & Investigations', 'VRP (Special Collections)', 'Ads Tactical Intel  (Scaled Collections)', 'CART', 'gUP']);
  eq(w.g.triggers.filter(t => t.handler === 'onTnsTestFormSubmit').map(t => t.source), ['form1']);
  // What the link fills in, by the copy's own question ids
  const q = tnsParams(tnsLink(notes));
  const id = title => form.items.find(it => it.title === title).entry;
  eq([q.get(id('[Title_Prefix] WD Intake Request')), q.get(id('Google Product:')), q.get(id('Topic Impacted:')), q.get(id('Link / URL(s) in question:'))],
    ['Marketing', 'Search', 'Violence, Extremism & Hate', 'https://x.com/paris_tech_press/status/1845000000000000003']);
  assert.match(q.get(id('What\'s the Issue? ')), /^A French journalist .* protests in Paris\. 340 engagements on X\.$/);
  assert.match(notes, /- Intake Request: Marketing\n- Google Product: Search\n- Topic Impacted: Violence, Extremism & Hate\n- Link: <https:\/\/x\.com\/paris_tech_press\/status\/1845000000000000003\|Search Autocomplete Violent Suggestions in Paris>/);
  assert.match(notes, /- Urgent: live, also email tns-urgent@alerts\.test with the link \(not while testing\)\./);

  // 2. The tester submits the copy: a stand-in for T&S's "Issue [#…]: WD Intake Request" email, to the tester only; once
  //    it's in the mailbox (mail to yourself lands there too) the bot marks ✍️ as it would for the real one
  w.bot.ensureControlTab_(w.bot.openStore_(true), 'bot@runner.test').getRange(30, 2).setValue('tester@testing.test');
  w.bot.onTnsTestFormSubmit(tnsSubmit([['Google Product:', 'Search'], ['Link / URL(s) in question:', 'https://x.com/paris_tech_press/status/1845000000000000003'],
    ['[Title_Prefix] WD Intake Request', 'Marketing']]));
  const conf = w.g.gmail.sent.slice(-1)[0];
  eq([conf.to, conf.cc, /^Issue \[#TEST-\d{7}\]: WD Intake Request \(test copy\)$/.test(conf.subject)], [['tester@testing.test'], [], true]);
  assert.match(conf.text, /Nothing was sent to Trust & Safety\.[\s\S]*Link \/ URL\(s\) in question: https:\/\/x\.com\/paris_tech_press\/status\/1845000000000000003/);
  assert.ok(!w.chat.botReactions(paris.name).includes('✍'));
  w.g.gmail.receive(conf.subject, conf.text, 'tester@testing.test');
  w.run();
  eq(w.chat.botReactions(paris.name), ['👍', '✍']);  // as for the real confirmation email (the fake drops U+FE0F)

  // 3. Workspace alert -> includes Workspace form note; the test copy is reused, never made twice
  const wsAlert = F.AIO.replace('[Product]: AI Overviews (AIM, Web Guide)', '[Product]: Workspace')
    .replace(',AI Overviews (AIM, Web Guide),', ',Workspace,');
  w.paste(wsAlert);
  w.run();
  const wsNotes = w.analystPosts().filter(m => m.threadReply).map(m => m.text).join('\n');
  assert.match(wsNotes, /Workspace form \(test space — not submitted to live form\): Platform=X \(Twitter\), Engagement=High/);
  eq(w.g.forms.size, 1);
});

test('T&S pre-filled link: Google Product and Topic Impacted are always one of the form\'s choices; the screenshot\'s link; under 2,000 characters; live it\'s the real form; no test copy -> no link at all', () => {
  const w = world();
  const B2 = w.bot;
  const choices = key => B2.ev('TNS_QUESTIONS_').find(x => x.key === key).choices;
  const G = B2.ev('GEN');

  // Google Product: every product the bot knows lands on one of the form's choices
  const product = (p, extra) => B2.tnsProduct_(Object.assign({ product: p }, extra || {}), {});
  G.products.forEach(p => assert.ok(choices('product').includes(product(p.name)), p.name));
  eq([product('AI Overviews (AIM, Web Guide)'), product('AI Mode'), product('Gemini (Imagen, Nano Banana, Veo, Lyria)'), product('Gemini App'),
    product('Google Maps'), product('Gmail'), product('Ads/Merchant Center'), product('Play Store'), product('Search'), product('YouTube'),
    product('Pixel'), product('Pixel', { summary: 'Pixel Studio made an offensive image.' }), product('Gemini Model', { summary: 'AI Studio said …' }),
    product('Brand')],
  ['Search (AI Overviews)', 'Search (AI Mode)', 'Gemini', 'Gemini', 'Geo (Maps)', 'Workspace', 'Ads', 'Play', 'Search', 'Other',
    'Other', 'Pixel (Studio Image)', 'AI Studio', 'Other']);

  // Topic Impacted: every exposure tag with every Sensitive Topic lands on one of the form's choices
  const topic = (tag, topics, summary) => B2.tnsTopic_({ exposure_tag: tag, summary: summary || '' }, { sensitive_topics: topics || [] });
  G.exposure_tags.forEach(t => [[]].concat(G.sensitive_topics.map(s => [s.name])).forEach(s =>
    assert.ok(choices('topic').includes(topic(t.name, s)), `${t.name} / ${s}`)));
  eq([topic('Product - Perceived bias', ['Politics']), topic('Product - Unexpected Responses', ['Child Safety']),
    topic('Product - Dangerous results (e.g. medical/legal)', ['Violence / Weapons']), topic('Product - Scams involving Google products'),
    topic('Product - Privacy & security concerns'), topic('Product - Unexpected Responses', ['Politics'], 'Gemini on the war in Gaza'),
    topic('Product - Unexpected Responses', ['Politics'], 'Gemini on who won the election'),
    topic('Product - Factual inaccuracies (not dangerous/offensive)'), topic('Brand - Other/general criticism')],
  ['Global Perception of Bias', 'Vulnerable or Marginalized Groups', 'Violence, Extremism & Hate', 'Frauds, Scams and Misuse of User Data',
    'Frauds, Scams and Misuse of User Data', 'Geopolitical Dynamics', 'Major Civic Events', 'Information Quality', 'Miscellaneous']);

  // What goes in each question: the screenshot is its link (never "[object Object]"), the video timestamp when the
  // summary lacks it
  const input = {
    fields: { product: 'AI Overviews (AIM, Web Guide)', exposure_tag: 'Product - Dangerous results (e.g. medical/legal)',
      summary: 'AI Overviews told a user to mix bleach and vinegar.', post_url: 'https://x.com/someone/status/1845000000000000009',
      social_network: 'X', total_engagement: 29425, video_timestamp: '[04:12]' },
    escalation: {}, screenshot: { url: 'https://i.imgur.com/abc.png', label: 'Screenshot of the post' },  // as screenshotFor_ gives it
  };
  const issue = 'AI Overviews told a user to mix bleach and vinegar. 29,425 engagements on X. Timestamp in the video: [04:12].';
  eq(B2.tnsFormValues_(input), { team: 'Marketing', product: 'Search (AI Overviews)', topic: 'Information Quality',
    url: input.fields.post_url, issue, notes: 'Screenshot of the post: https://i.imgur.com/abc.png' });

  // While testing: the test copy; a long summary (Japanese: 9 characters per letter in a link) is shortened so the whole
  // link stays under 2,000 characters (the Chat note is cut at 4,000); the post's link and the notes are never cut
  const url = B2.tnsPrefillUrl_(input);
  assert.ok(url.startsWith('https://docs.google.com/forms/d/e/pub-form1/viewform?usp=pp_url&'), url);
  assert.ok(!/object/i.test(decodeURIComponent(url)));
  const form = w.g.forms.get('form1');
  const id = title => form.items.find(it => it.title === title).entry;
  const longUrl = B2.tnsPrefillUrl_(Object.assign({}, input, { fields: Object.assign({}, input.fields,
    { summary: '検索のオートコンプリートが暴力的なクエリを提案しています。'.repeat(40) }) }));
  const long = tnsParams(longUrl);
  assert.ok(longUrl.length <= 2000 && longUrl.length > 1500, String(longUrl.length));
  eq([long.get(id('Link / URL(s) in question:')), long.get(id('Additional screenshots/notes etc:')), /^検索/.test(long.get(id('What\'s the Issue? '))),
    /…$/.test(long.get(id('What\'s the Issue? ')))], [input.fields.post_url, 'Screenshot of the post: https://i.imgur.com/abc.png', true, true]);
  eq([w.g.forms.size, B2.setupTnsTestForm(), w.g.forms.size], [1, 'https://docs.google.com/forms/d/e/pub-form1/viewform', 1]);  // found, not remade

  // Live (no stand-in): the real form with its question ids; no test copy is made
  const wl = world();
  wl.bot.ev('GEN').email.stand_in = '';
  wl.bot.setRunLive_(true);
  const liveUrl = wl.bot.tnsPrefillUrl_(input);
  assert.ok(liveUrl.startsWith(TNS_REAL + '?usp=pp_url&entry.891514386=Marketing&'), liveUrl);
  const live = tnsParams(liveUrl);
  eq([live.get('entry.966872365'), live.get('entry.595767202'), live.get('entry.214972794'), live.get('entry.2113132974'), live.get('entry.392523390')],
    ['Search (AI Overviews)', 'Information Quality', input.fields.post_url, issue, 'Screenshot of the post: https://i.imgur.com/abc.png']);
  eq(wl.g.forms.size, 0);
  const liveText = wl.bot.tnsFormText_(Object.assign({ ai_reasons: { tns: 'AI hallucination' } }, input));
  assert.match(liveText, /<https:\/\/docs\.google\.com\/forms\/d\/e\/1FAIpQLScd0be[^|]+\|Open the T&S Intake Form, pre-filled>/);
  assert.ok(!/Testing:|test copy/.test(liveText));
  // If the form's question ids ever change: the script property TNS_FORM_ENTRIES (only real ids are taken)
  wl.g.props.set('TNS_FORM_ENTRIES', JSON.stringify({ url: 'entry.555', team: 'not an id', bogus: 'entry.1' }));
  const over = tnsParams(wl.bot.tnsPrefillUrl_(input));
  eq([over.get('entry.555'), over.get('entry.214972794'), over.get('entry.891514386'), over.get('entry.1')], [input.fields.post_url, null, 'Marketing', null]);

  // While testing, if the copy can't be made: no link at all (never the real form), tried again an hour later
  const wf = world();
  wf.g.forms.fail = 'You do not have permission to call FormApp.create';
  eq(wf.bot.tnsPrefillUrl_(input), '');
  const text = wf.bot.tnsFormText_(Object.assign({ ai_reasons: { tns: 'AI hallucination' } }, input));
  assert.match(text, /^T&S form needed \(AI hallucination\)\. The test copy of the T&S form isn't set up yet: run setupTnsTestForm\(\)/);
  assert.ok(!text.includes('docs.google.com'), text);
  wf.g.forms.fail = '';
  eq(wf.bot.tnsPrefillUrl_(input), '');
  wf.g.clock.now += 61 * 60 * 1000;
  assert.ok(wf.bot.tnsPrefillUrl_(input).startsWith('https://docs.google.com/forms/d/e/pub-form1/viewform?'));
  eq(wf.g.forms.size, 1);
});

test('only Zapier posts reach analysts: never a person\'s alert, a thread reply, or the test copier\'s chatter', () => {
  const w = world();
  const personal = w.paste(F.P0_OK, { sender: 'users/burson2', type: 'HUMAN' });  // a Burson person posting an alert themselves
  const copy = (row, user, message) => w.chat.say(w.BUR, `Logged from Source (Row ${row})\nUser: ${user}\nMessage: ${message}`, { sender: 'users/bot' });
  copy(5, 'Diksha Singh', 'Hi, TEAM 👋 APAC (India) is taking over monitoring and alerting.');
  copy(6, 'Zapier', 'Zap sent by @Chris Kief');  // the copier only got Zapier's credit line: nothing to forward
  copy(9, 'Diksha Singh', 'Do Not Forward - NTK only\n\n' + F.P0_OK);
  w.run();
  eq([w.analystPosts(), w.bursonPosts(), w.chat.botReactions(personal.name)], [[], [], []]);

  const alert = w.paste(F.AIO);
  w.run();
  const bursonBefore = w.bursonPosts().length;
  w.paste(F.P0_OK, { thread: alert.thread.name });               // a Zapier post inside an alert's thread
  w.reply(alert, F.P0_OK, { sender: 'users/burson2' });           // a person pasting an alert in the thread
  w.run();
  eq([w.analystPosts().filter(m => !m.threadReply).length, w.bursonPosts().length], [1, bursonBefore]);

  const copied = copy(12, 'Zapier', F.P0_OK + '\n\nZap sent by @Chris Kief');  // the copier's Zapier rows are Zapier posts
  w.run();
  const forwards = w.analystPosts().filter(m => !m.threadReply);
  eq([forwards.length, w.chat.botReactions(copied.name)], [2, ['👍']]);
  assert.strictEqual(forwards[1].text, F.P0_OK);  // read without the copier's header or Zapier's credit line

  // In the analyst space, old test-feed reposts never set the on-call IM and are never answered
  w.chat.say(w.ANA, 'Logged from Source (Row 8)\nUser: Aratrika Dasgupta (xWF)\nMessage: Hi team! Signing in on alerts till 1:30 pm IST. Any questions?', { sender: 'users/bot' });
  const before = w.analystPosts().length;
  w.run();
  eq([w.analystPosts().length, w.ctx().memo.get('im_user')], [before, null]);
});

test('a Zapier alert posted as a card is read from the card', () => {
  const w = world();
  const html = F.P0_OK.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const cardsV2 = [{ cardId: 'alert', card: { sections: [{ widgets: [{ textParagraph: { text: html } }] }] } }];
  const zap = w.chat.say(w.BUR, 'Zap sent by @Chris Kief', { sender: 'users/zapier', type: 'BOT', cardsV2 });
  w.run();
  const [fwd] = w.analystPosts().filter(m => !m.threadReply);
  eq([w.chat.botReactions(zap.name), fwd.text], [['👍'], F.P0_OK]);
});

test('the email\'s T&S field says whether T&S was submitted: No on the draft, Yes once ✍️ is added', () => {
  const liveCfg = { drafts: { live: true, mailbox: 'im@ops.test', from: 'Brand Social <sender@alerts.test>' } };
  const live = world(liveCfg);
  live.paste(F.PARIS);  // viral KOF: T&S is suggested in the analyst thread, but nothing has been submitted yet
  live.run();
  const [draft] = live.gmail.allDrafts();
  assert.match(draft.text, /^T&S: No$/m);
  assert.match(draft.html, />T&S<\/td><td[^>]*>No<\/td>/);
  assert.ok(!/Yes \(viral KOF\)/.test(draft.html + draft.text));
  live.chat.addReaction(live.analystPosts().filter(m => !m.threadReply)[0].name, '✍️');
  live.run();
  const after = live.gmail.draft(draft.id);
  assert.match(after.text, /^T&S: Yes$/m);
  assert.match(after.html, />T&S<\/td><td[^>]*>Yes<\/td>/);
  eq([after.to, after.cc, after.subject], [draft.to, draft.cc, draft.subject]);  // only that row changed
  assert.ok(!live.analystPosts().some(m => m.text.includes('change *T&S* to *Yes*')));

  const test = world({ drafts: { live: false, mailbox: 'im@ops.test', from: 'Brand Social <im@ops.test>' } });
  test.paste(F.PARIS);
  test.run();
  const [testDraft] = test.gmail.allDrafts();
  assert.match(testDraft.text, /T&S: No/);
  test.chat.addReaction(test.analystPosts().filter(m => !m.threadReply)[0].name, '✍️');
  test.run();
  assert.match(test.gmail.draft(testDraft.id).text, /T&S: Yes/);

  // A draft Gmail rewrote after someone edited it is left alone; the analyst is asked to set the field by hand
  const edited = world(liveCfg);
  edited.paste(F.PARIS);
  edited.run();
  const [d] = edited.gmail.allDrafts();
  const stored = edited.gmail.drafts.get(d.id);
  stored.raw = Buffer.from(d.mime.replace(/Content-Transfer-Encoding: base64/g, 'Content-Transfer-Encoding: 7bit'), 'utf8').toString('base64url');
  edited.chat.addReaction(edited.analystPosts().filter(m => !m.threadReply)[0].name, '✍️');
  edited.run();
  assert.ok(edited.analystPosts().some(m => m.text.includes('Please change *T&S* to *Yes* in the draft before sending')));
});

test('human Q&A in both spaces: answers "Should i escalate this or is it handled/" in Burson and "what do I need to do again?" in the analyst space', () => {
  const w = world({ drafts: { live: false, mailbox: 'tester@testing.test', from: 'Brand Social <tester@testing.test>' } });
  // IM signs in in the analyst space -> @mentioned on the next escalated alert
  w.chat.say(w.ANA, 'Hi team, signing in as Incident Manager for the next 3 hours!', { sender: 'users/im_lead' });
  w.run();

  const alert = w.paste(F.AIO);
  w.run();
  const [fwd] = w.analystPosts().filter(m => !m.threadReply);
  const replies = w.analystPosts().filter(m => m.threadReply && m.thread.name === fwd.thread.name);
  assert.strictEqual(replies.length, 1);
  assert.match(replies[0].text, /^<users\/im_lead> Social Alert draft is in Gmail Drafts: review and send it, or delete it to skip\./);
  assert.match(replies[0].text, /- Why: High engagement \(29,425 on X\)/);
  assert.match(replies[0].text, /- To: none \(multi-product alert — all product teams in CC\)/);
  assert.match(replies[0].text, /- Cc: .*AI Overviews alert POCs.*Search alert POCs/);

  // 1. In the Burson space: user asks "Should i escalate this or is it handled/"
  w.vertex.answer = () => 'We already have the escalation email in review for this one since it hit 29,425 engagements on X, so you\'re all set!';
  w.reply(alert, 'Should i escalate this or is it handled/');
  w.run();
  const burReply = w.bursonPosts()[w.bursonPosts().length - 1];
  assert.strictEqual(burReply.text, 'We already have the escalation email in review for this one since it hit 29,425 engagements on X, so you\'re all set!');

  // 2. In the Analyst clean-data space: analyst asks "what do I need to do again?" in the forwarded alert's thread
  w.vertex.answer = () => 'Here is what you need to do for this AI Overviews alert:\n1. Open *Gmail Drafts* in tester@testing.test and send the draft from Brand Social.\n2. Or delete the draft in Gmail if you want to skip escalation.';
  w.chat.say(w.ANA, 'what do I need to do again?', { thread: fwd.thread.name, sender: 'users/im_lead' });
  const rAna = w.run();
  assert.strictEqual(rAna.answers, 1);
  const anaReplies = w.analystPosts().filter(m => m.threadReply && m.thread.name === fwd.thread.name);
  assert.strictEqual(anaReplies.length, 2);
  assert.match(anaReplies[1].text, /Open \*Gmail Drafts\* in tester@testing\.test/);
});

test('Mirror.gs: copies only top-level Zapier alerts from live Burson into the mirror training space, leaves live Burson untouched, and blocks all outbound Chat posts out of the mirror space', () => {
  const t = e2e(null, { noWait: true });
  t.bot.setup();
  t.set('B30', 'tester@testing.test');
  t.set('B25', REAL);  // S-F Burson: where the Mirror copies Zapier's alerts from
  t.set('B29', 'ON');  // the Safety valve: Testing (the stand-in), even with B26 blank
  const MIRROR = 'spaces/AAQAmirror1';
  t.chat.addSpace(MIRROR, 'SLRR Zapier Training Mirror');

  // Old Zapier message in REAL an hour before mirroring is turned on -> not pulled from backlog
  t.chat.say(REAL, F.P0_OK, { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
  t.g.clock.now += 3600e3;

  // Enable mirroring to the training space via startMirror
  const started = t.bot.startMirror('SLRR Zapier Training Mirror');
  assert.strictEqual(started.mirror, MIRROR);
  assert.strictEqual(t.get('B9'), 'SLRR Zapier Training Mirror');
  assert.strictEqual(t.chat.botPosts(MIRROR).length, 0);

  // Now live activity happens in S-F Burson (B25):
  // 1. Human chatter (must NOT be mirrored)
  t.chat.say(REAL, 'Morning team, watching the queue!', { sender: 'users/human1', type: 'HUMAN', displayName: 'Alice' });
  // 2. Human manually pasting an alert (must NOT be mirrored)
  t.chat.say(REAL, F.AIO, { sender: 'users/human1', type: 'HUMAN', displayName: 'Alice' });
  // 3. Zapier top-level alert with a "Zap sent by" footer (MUST be mirrored cleanly)
  const zapLive = t.chat.say(REAL, F.MISTAKES + '\nZap sent by @burson_ops', { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
  // 4. Thread reply on that Zapier alert in live Burson (must NOT be mirrored)
  t.chat.say(REAL, 'Looking into this now', { thread: zapLive.thread.name, sender: 'users/human1', type: 'HUMAN' });
  // 5. Reaction on the live Zapier alert (must NOT be mirrored)
  t.chat.addReaction(zapLive.name, '👀', 'users/human1');

  t.poll();

  // Live Burson space has ZERO bot posts and ZERO bot reactions
  eq(t.chat.botPosts(REAL), []);
  eq(t.chat.botReactions(zapLive.name), []);

  // Analyst space (TRIAGED) has ZERO new forwards (only the initial setup hello) because outbound is blocked
  assert.strictEqual(t.chat.botPosts(TRIAGED).length, 1);

  // Mirror space has the 1 mirrored top-level Zapier message (stripped of "Zap sent by") + what the bot changed (and that
  // it's processed), and the alert's emojis: 📰 📦 for the Social Alert, sent (with the fixes) only to the stand-in
  const mirrorAll = t.chat.botPosts(MIRROR);
  const mirrorTop = mirrorAll.filter(m => !m.threadReply);
  const mirrorReplies = mirrorAll.filter(m => m.threadReply);
  assert.strictEqual(mirrorTop.length, 1);
  assert.strictEqual(mirrorTop[0].text, F.MISTAKES);
  eq(t.chat.botReactions(mirrorTop[0].name), ['📰', '📦']);
  assert.strictEqual(mirrorReplies.length, 1);  // no draft note, nothing for a person to do
  assert.match(mirrorReplies[0].text, /^The alert has been updated, so there is no need to resend it\. The following updates were made:/);
  eq([t.g.gmail.allDrafts().length, t.g.gmail.sentMessages().map(m => m.to)], [0, [['tester@testing.test']]]);
  assert.match(t.g.gmail.sentMessages()[0].text, /^T&S: No$/m);

  // Reacting ✍️ on the mirrored alert in the Mirror space records T&S on the alert
  t.chat.addReaction(mirrorTop[0].name, '✍️', 'users/trainer');
  t.poll();
  const log = t.sheet().getSheetByName('Alert log');
  assert.ok(log.rows.slice(1).some(r => String(r[log.rows[0].indexOf('email_groups')]).split(' ').includes('tns')));

  // One-sided training conversation: trainer replies in the mirror thread asking a question -> bot answers in the mirror thread, nothing leaves the space
  t.g.vertex.answer = () => 'Gems was retired, so use *Gemini App*.';
  t.chat.say(MIRROR, 'why should this be Gemini App?', { thread: mirrorTop[0].thread.name, sender: 'users/trainer', type: 'HUMAN' });
  t.poll();
  const mirrorRepliesAfter = t.chat.botPosts(MIRROR).filter(m => m.threadReply);
  assert.strictEqual(mirrorRepliesAfter[mirrorRepliesAfter.length - 1].text, 'Gems was retired, so use *Gemini App*.');
  eq(t.chat.botPosts(REAL), []);
  assert.strictEqual(t.chat.botPosts(TRIAGED).length, 1);
});

// =============================================================================================================
// The auto-correct test space (AutoCorrect.gs): the bot fixes live alerts itself, beside the unchanged Mirror space
// =============================================================================================================

test('auto-correct space: the change note says who changed what ("- Product: Gems to Gemini App"; added / removed values; no arrows), what only Burson can supply and why the bot couldn\'t, never a double-check or the summary; its emails say which space they came from, and the space must be a Google-only space of its own', () => {
  const head = 'The agentic assistant reviewed this alert and made these changes:';
  eq(B.changeNoteText_(review(F.MISTAKES)), `${head}\n- Product: Gems to Gemini App\n- Social Network: Instagram to X\n` +
    '- Priority banner: P2 to P0\n- Engagement: LOW to HIGH');
  assert.ok(!/→|->|\(was |updated/.test(B.changeNoteText_(review(F.MISTAKES))));
  // a missing link: why the bot couldn't fix it, whether Never wait on Burson is ON or OFF
  eq([B.changeNoteText_(review(F.NO_LINK)), B.changeNoteText_(review(F.NO_LINK), { findLinks: true })],
    ['Not fixed: Burson\'s alert has no link to the post (Auto-find missing links, row 14, is OFF)',
      'Not fixed: Burson\'s alert has no link to the post, and the listening feeds had no match']);
  eq(B.changeNoteText_(review(F.P0_OK)), '');  // nothing changed: no note at all
  // a value the alert didn't have, one taken out, another field Burson only can fix; the summary and a double-check never
  const mixed = { fixes: [{ field: 'summary', old: 'A summary Burson wrote that was wrong.', new: 'X user posted a video of AI Overviews.' },
    { field: 'post_url', old: '', new: 'https://x.com/a/status/2109952063492993159' }, { field: 'risk_tags', old: ['Politics'], new: [] }],
  silentFixes: [{ field: 'other_products', old: [], new: ['Search'] }, { field: 'alert_name', old: 'a', new: 'b' }],
  missing: [{ field: 'post_date', problem: 'is in the future' }],
  unsure: [{ field: 'exposure_tag', proposed: 'Product - Perceived bias', confidence: 0.5 }] };
  eq(B.changeNoteText_(mixed), `${head}\n- Link: added https://x.com/a/status/2109952063492993159\n- Sensitive Topic: removed Politics\n` +
    '- Other Google Products: added Search\nNot fixed: Time/Date Post Went Live is in the future');
  eq(B.changeNoteText_({ fixes: mixed.fixes.slice(0, 1), silentFixes: [], missing: [], unsure: mixed.unsure }), '');
  eq(B.changedFields_(review(F.MISTAKES)).map(x => x.field), ['product', 'social_network', 'priority', 'engagement_level']);
  eq(B.noteChanges_(mixed).map(x => x.field), ['post_url', 'risk_tags', 'other_products']);
  // every way the note can start is the bot's own, and so are the heads notes had before (they stay in the space)
  [head, 'Not fixed: Link missing', 'Sources: Reuters', 'Burson resent this alert. These values are not in the alert above:\n- x',
    'The post\'s own media wasn\'t reviewed: reviewing it crashed the bot', 'Gemini couldn\'t review the post\'s video, so it had only the alert text',
    'The agentic assistant reviewed this alert. The card above was posted before the review; the email uses these corrections:',
    'Updates made to this alert:\n- x', 'Still needs Burson: Link missing', 'Processed without waiting for Burson: Link missing',
    'Double-check: Product', 'Burson resent this alert with updates:\n- x']
    .forEach(t => assert.ok(B.isBotFormattedText_(t), t));
  assert.ok(!B.isBotFormattedText_('The agentic assistant is wrong here, the product is Search'));

  const reply = { subject: '[Auto-correct test] SOCIAL ALERT: x' };
  eq([B.taggedSubject_('SOCIAL ALERT: x', 'Auto-correct test', null), B.taggedSubject_('Re: ' + reply.subject, 'Auto-correct test', reply),
    B.taggedSubject_('SOCIAL ALERT: x', '', null)],
    ['[Auto-correct test] SOCIAL ALERT: x', 'Re: [Auto-correct test] SOCIAL ALERT: x', 'SOCIAL ALERT: x']);

  const main = { mirror: { id: 'spaces/MIR' }, burson: { id: 'spaces/MIR' }, analyst: { id: 'spaces/MIR' } };
  assert.match(B.autoCorrectProblem_({ id: REAL, name: '[S-F] Burson' }, {}, main, { id: REAL }), /can't be the live Burson space/);
  // S-F Burson is B25's space, whatever it is: a Google-only one is refused too
  assert.match(B.autoCorrectProblem_({ id: 'spaces/ACX', name: 'Auto-correct' }, {}, main, { id: 'spaces/ACX' }), /can't be the live Burson space/);
  assert.match(B.autoCorrectProblem_({ id: VENDOR, name: 'Shared With Vendors', externalUserAllowed: true }, {}, main), /outside Google/);
  assert.match(B.autoCorrectProblem_({ id: 'spaces/MIR', name: 'Mirror' }, {}, main), /a space of its own/);
  eq(B.autoCorrectProblem_({ id: 'spaces/ACX', name: 'Auto-correct' }, {}, main), '');
  eq([B.autoCorrectTodayText_({ alerts: 1, corrected: 1, emails: 1, answers: 0 }), B.autoCorrectTodayText_(null)],
    ['today: 1 alert, 1 corrected, 1 Social Alert sent, 0 questions answered', 'no alerts yet today']);
});

test('auto-correct space: its chat client can never post or react in the live Burson space (or any space but its own), and its records never mix with the Mirror\'s', () => {
  const chat = B.guardedChat_({ burson: { id: REAL, name: 'live' }, analyst: { id: 'spaces/ACX', name: 'Auto' }, sourceReadOnly: true }, { dry_run: false });
  assert.throws(() => chat.post(REAL, 'hi', {}), /Refusing to post in spaces\/AAQAaa_0I9g/);
  assert.throws(() => chat.react(`${REAL}/messages/abc.abc`, '👍'), /Refusing to react in spaces\/AAQAaa_0I9g/);
  assert.throws(() => chat.post(TRIAGED, 'hi', {}), /Refusing to post/);

  const backend = B.memoryBackend_();
  const mirror = B.makeStore_(backend, () => NOW, 'spaces/MIR > (isolated)');
  const ac = B.makeStore_(backend, () => NOW, `${REAL} > spaces/ACX (auto-correct)`, 'ac|');
  mirror.markDone(`${REAL}/messages/1`, 'alert', 'QA-1');
  ac.markDone(`${REAL}/messages/2`, 'alert', 'QA-2');
  eq([mirror.isDone(`${REAL}/messages/1`), ac.isDone(`${REAL}/messages/1`), mirror.isDone(`${REAL}/messages/2`), ac.isDone(`${REAL}/messages/2`)],
    [true, false, false, true]);
  const again = B.makeStore_(backend, () => NOW, `${REAL} > spaces/ACX (auto-correct)`, 'ac|');  // next run, read back from the log
  eq([again.isDone(`${REAL}/messages/2`), again.isDone(`${REAL}/messages/1`)], [true, false]);
  ac.addAlert({ alert_id: 'QA-2', source_message: `${REAL}/messages/2` });
  eq([mirror.alertBySource(`${REAL}/messages/2`), ac.alertBySource(`${REAL}/messages/2`).alert_id], [null, 'QA-2']);
});

test('auto-correct space (B10) beside the Mirror space: each live Zapier alert is posted there already corrected, with what changed in its thread, and worked there like an IM; the live Burson space is only read, and the Mirror space works exactly as before', () => {
  const t = e2e(null, { noWait: true });
  t.bot.setup();
  t.set('B30', 'tester@testing.test');
  t.set('B25', REAL);  // S-F Burson: the live space both read
  t.set('B29', 'ON');  // the Safety valve: Testing (the stand-in), even with B26 blank
  const MIRROR = 'spaces/AAQAmirror1';
  const AC = 'spaces/AAQAautofx1';
  t.chat.addSpace(MIRROR, 'SLRR Zapier Training Mirror');
  t.chat.addSpace(AC, 'SLRR Auto-correct Test');

  // A Zapier alert from before either space was set isn't pulled from the backlog
  t.chat.say(REAL, F.P0_OK, { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
  t.g.clock.now += 3600e3;
  t.bot.startMirror('SLRR Zapier Training Mirror');
  const started = t.bot.startAutoCorrect('SLRR Auto-correct Test');
  eq([started.autocorrect, t.control().cell(10, 1), t.control().cell(10, 2), t.control().cell(11, 1),
    t.control().cell(31, 1), t.control().cell(32, 1), t.control().cell(33, 1), t.control().cell(34, 1), t.control().cell(35, 1),
    t.control().cell(36, 1), t.control().cell(37, 1), t.control().cell(38, 1), t.control().cell(39, 1), t.control().cell(40, 1),
    t.control().cell(41, 1), t.control().cell(42, 1), t.control().cell(43, 1), t.control().cell(44, 1), t.control().cell(45, 1),
    t.control().cell(46, 1), t.control().cell(47, 1), t.control().cell(48, 1), t.control().cell(49, 1),
    t.control().cell(50, 1), t.control().cell(51, 1), t.control().cell(52, 1), t.control().cell(53, 1), t.control().cell(54, 1),
    t.control().cell(55, 1), t.control().cell(56, 1), t.control().cell(57, 1)],
  [AC, 'Auto-correct space', 'SLRR Auto-correct Test', 'Auto-send Social Alerts', 'BigQuery lookback',
    'Work directly in B25 (Google-only)', 'Other alerts space', 'Proactive watch', 'Watch alerts', 'Temp checks', 'Group test emails',
    'Fast triage (Gemini Decisions)', 'Fast triage: rank and early watch', 'Fast triage: hold back noise',
    'Hold-back: about_google at or below', 'Hold-back: routine_noise at or above',
    'Hold-back and early watch: answer confidence at or above',
    'Early watch: about_google and brand_risk, each at or above',
    'Early watch: distinct accounts, at least', 'Write early-wave records to BigQuery',
    'Early watch: independent_reports at or above', 'Early Detection: also read the AMIE table', 'Early Detection: also read Brandwatch live (not X)', 'Proactive watch: also read the AMIE table', 'Open engine: judgment in place of caps', '', '',
    'Live dashboard', 'Slide deliveries', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is now a switch
  eq([t.chat.botPosts(AC), t.control().cell(10, 3)], [[], '✓ SLRR Auto-correct Test · no alerts yet today']);

  // Live activity in the real Burson space: chatter, an alert a person pasted, a Zapier alert with mistakes, an IM's
  // reply in its thread and an IM's reaction
  t.chat.say(REAL, 'Morning team, watching the queue!', { sender: 'users/human1', type: 'HUMAN', displayName: 'Alice' });
  t.chat.say(REAL, F.AIO, { sender: 'users/human1', type: 'HUMAN', displayName: 'Alice' });
  const zapLive = t.chat.say(REAL, F.MISTAKES + '\nZap sent by @burson_ops', { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
  t.chat.say(REAL, 'Product should be Gemini App, please update and resend', { thread: zapLive.thread.name, sender: 'users/im1', type: 'HUMAN' });
  t.chat.addReaction(zapLive.name, '⬇️', 'users/im1');
  t.poll();

  // The live Burson space: nothing from the bot, from either space
  eq([t.chat.botPosts(REAL), t.chat.botReactions(zapLive.name)], [[], []]);

  // The Mirror space, exactly as before: the copy, what the bot changed (processed), 📰 📦
  const mirrorTop = t.chat.botPosts(MIRROR).filter(m => !m.threadReply);
  const mirrorReplies = t.chat.botPosts(MIRROR).filter(m => m.threadReply);
  eq([mirrorTop.length, mirrorTop[0].text, t.chat.botReactions(mirrorTop[0].name), mirrorReplies.length], [1, F.MISTAKES, ['📰', '📦'], 1]);
  assert.match(mirrorReplies[0].text, /^The alert has been updated, so there is no need to resend it\. The following updates were made:/);
  assert.strictEqual(t.chat.botPosts(TRIAGED).length, 1);  // only the setup hello

  // The auto-correct space: the corrected alert in Burson's own format (no footer), what changed in its thread, and
  // AlertMemory prevents sending a duplicate second Social Alert to B30 when Mirror already emailed it in the same tier
  const acTop = t.chat.botPosts(AC).filter(m => !m.threadReply);
  const acReplies = t.chat.botPosts(AC).filter(m => m.threadReply);
  // (its first line is the bot's own: the fake's message ids give no link to Burson's message, so there's none here)
  assert.strictEqual(acTop.length, 1);
  assert.strictEqual(acTop[0].text, '✅ *Reviewed and corrected by the agentic assistant*\n' + F.MISTAKES_FIXED);
  eq(t.chat.botReactions(acTop[0].name), ['❌']);
  // (the note's last line says which alert requirement the alert met, and why no Social Alert went out from here: the
  // Mirror flow's alert for the same post, QA-1001, already has it. That alert has no card in this space, so the line
  // says the other flow sent it, never "a repeat of". The alert is on an ongoing issue and its author is no KOF: its
  // engagements are the requirement it meets, not its P0 tag)
  eq(acReplies.map(m => m.text), [
    'The agentic assistant reviewed this alert and made these changes:\n- Product: Gems to Gemini App\n- Social Network: Instagram to X\n' +
      '- Priority banner: P2 to P0\n- Engagement: LOW to HIGH\n' +
      '*Alert requirements:* met for a Social Alert (29,425 engagements), but none was sent: the other flow already sent it (QA-1001).',
  ]);
  // One Social Alert total (Mirror's), only to the tester — zero duplicate email from B10!
  const sent = t.g.gmail.sentMessages();
  eq(sent.map(m => m.to), [['tester@testing.test']]);
  // Its own rows in the Alert log, and its own line on the Control tab
  const log = t.sheet().getSheetByName('Alert log');
  const col = name => log.rows[0].indexOf(name);
  const acRows = log.rows.slice(1).filter(r => / \(auto-correct\)$/.test(String(r[col('space')])));
  eq(acRows.map(r => [r[col('space')], r[col('source_message')], r[col('forward_message')]]), [[`${REAL} > ${AC} (auto-correct)`, zapLive.name, acTop[0].name]]);
  assert.strictEqual(t.control().cell(10, 3), '✓ SLRR Auto-correct Test · today: 1 alert, 1 corrected, 0 Social Alerts sent, 0 questions answered');

  // A question in the auto-correct space is answered in its thread
  t.g.vertex.answer = () => 'Gems was retired, so the product is *Gemini App*.';
  t.chat.say(AC, 'why is this Gemini App?', { thread: acTop[0].thread.name, sender: 'users/trainer', type: 'HUMAN' });
  t.poll();
  assert.strictEqual(t.chat.botPosts(AC).filter(m => m.threadReply).pop().text, 'Gems was retired, so the product is *Gemini App*.');

  // Burson resends the alert in the live space (its IMs asked for the fixes): the same alert, nothing new is posted
  t.chat.say(REAL, F.MISTAKES_FIXED, { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
  t.poll();
  eq([t.chat.botPosts(AC).filter(m => !m.threadReply).length, t.chat.botPosts(REAL)], [1, []]);

  // A T&S alert: the pre-filled T&S test-form link goes in the corrected alert's thread
  t.chat.say(REAL, F.AIO, { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
  t.poll();
  const acAio = t.chat.botPosts(AC).filter(m => !m.threadReply)[1];
  const aioNotes = t.chat.botPosts(AC).filter(m => m.threadReply && m.thread.name === acAio.thread.name).map(m => m.text);
  assert.ok(aioNotes.some(x => /^T&S form needed/.test(x)), aioNotes.join('\n---\n'));
  eq(t.chat.botPosts(REAL), []);

  // Clearing B10 stops it; the Mirror space carries on
  t.control().getRange(10, 2).setValue('');
  const before = t.chat.botPosts(AC).length;
  t.chat.say(REAL, F.P0_OK.split('2109952063492993159').join('2109952063492990000'), { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
  t.poll();
  eq([t.chat.botPosts(AC).length, t.control().cell(10, 3)], [before, t.bot.ev('AC_HINT_')]);
  assert.strictEqual(t.chat.botPosts(MIRROR).filter(m => !m.threadReply).length, 4);
  eq(t.chat.botPosts(REAL), []);
});

test('auto-correct space: the live Burson space, the Mirror space or a space Burson can join is refused in B10 (C10 says why), and nothing is posted anywhere', () => {
  const t = e2e();
  t.bot.setup();
  t.set('B25', REAL);
  const MIRROR = 'spaces/AAQAmirror1';
  t.chat.addSpace(MIRROR, 'SLRR Zapier Training Mirror');
  t.bot.startMirror('SLRR Zapier Training Mirror');
  assert.throws(() => t.bot.startAutoCorrect('[S-F] Burson Automated Alerts V3'), /can't be the live Burson space/);
  for (const [ref, why] of [['[S-F] Burson Automated Alerts V3', /^✗ The auto-correct space can't be the live Burson space/],
    ['SLRR Zapier Training Mirror', /^✗ The auto-correct space must be a space of its own/], ['Shared With Vendors', /^✗ .*outside Google/]]) {
    t.control().getRange(10, 2).setValue(ref);
    t.chat.say(REAL, F.MISTAKES, { sender: 'users/zapier', type: 'BOT', displayName: 'Zapier' });
    t.poll();
    assert.match(t.control().cell(10, 3), why);
    eq([t.chat.botPosts(REAL), t.chat.botPosts(VENDOR)], [[], []]);
  }
  assert.ok(t.chat.botPosts(MIRROR).every(m => !/auto-correct/i.test(m.text)));
});

test('the bot makes the team calls: AI-picked teams go on the email with no one asked to react or add anything by hand; testing names every distro on the stand-in email; a real send marks only who it reached', () => {
  const aiTeams = () => ({ checks: [], recommended_groups: [
    { code: 'exec_comms', reason: 'The post blames Sundar Pichai by name.' },
    { code: 'gsoc', reason: 'It calls for a protest outside a Google office' },
    { code: 'not_a_team', reason: 'ignored' },
  ] });

  // Testing: sent at once, to the stand-in only. Its last line names every distro, GCPA and GSOC included (no address on
  // file yet), and the alert gets all their emojis, 📰 first as on the IMs' alerts. Nothing is posted for a person.
  const test = world({ drafts: { live: false, standIn: 'tester@testing.test', mailbox: 'tester@testing.test',
    from: 'Brand Social <tester@testing.test>' } });
  test.vertex.assess = aiTeams;
  const t0 = test.paste(F.P0_OK);
  test.run();
  const [sent] = test.gmail.sentMessages();
  eq([sent.to, sent.cc, test.gmail.allDrafts().length], [['tester@testing.test'], [], 0]);
  assert.ok(sent.text.endsWith('\n\nWould have gone to: To: Search alert POCs; Cc: Executive Comms, Regional Leads, GCPA, GSOC, standard CC list'), sent.text);
  eq(test.chat.botReactions(t0.name), ['📰', '📦', '1⃣', '🦺', '🌎']);
  eq(test.analystPosts().filter(m => m.threadReply), []);

  // Real distros (no stand-in): the AI-called Exec Comms team is already on the draft; its note asks nobody to add anything.
  const live = world({ drafts: { live: true, mailbox: 'im@ops.test', from: 'Brand Social <sender@alerts.test>' } });
  live.vertex.assess = aiTeams;
  const p0 = live.paste(F.P0_OK);
  live.run();
  const [draft] = live.gmail.allDrafts();
  const G = live.bot.ev('GEN').distribution.groups;
  const execs = G.find(g => g.action_code === 'exec_comms').recipients;
  const civics = G.find(g => g.action_code === 'civics').recipients;
  assert.ok(execs.every(e => draft.cc.includes(e)), 'the AI-called Exec Comms team is already on the draft');
  const [fwd] = live.analystPosts().filter(m => !m.threadReply);
  const note = live.analystPosts().find(m => m.threadReply).text;
  assert.match(note, /- To: Search alert POCs \(10\)\n- Cc: Executive Comms, Regional Leads \+ standard CC/);
  assert.ok(!/by hand|add them|Quick reactions|Recommended|to add\)|not_a_team/i.test(note), note);

  // The analyst takes Exec Comms off in Gmail and sends: 1️⃣ is left off, 📦 for the Search POCs and 🌎 for the France
  // lead. GCPA and GSOC have no address, so this email didn't reach them: no 📰 or 🦺.
  live.gmail.send(draft.id, 'im@ops.test', '<sent-teams@mail.test>', { drop: execs });
  live.run();
  eq(live.chat.botReactions(fwd.name), ['📦', '🌎']);
  eq(live.chat.botReactions(p0.name), ['👍', '📦', '🌎']);  // 👍 while the draft waited on a person
  assert.ok(civics.every(e => !draft.cc.includes(e)), 'bias with no Sensitive Topic does not add Civics');
});

test('❌ No action taken is the bot\'s call too: a correct alert below the escalation criteria, and a draft deleted in Gmail without being sent', () => {
  const w = world({ drafts: { live: false, mailbox: 'im@ops.test', from: 'Brand Social <im@ops.test>' } });
  const low = w.paste(MAPS_LOW_OK);
  w.run();
  const [lowFwd] = w.analystPosts().filter(m => !m.threadReply);
  eq([w.chat.botReactions(low.name), w.chat.botReactions(lowFwd.name), w.gmail.allDrafts().length, w.bursonPosts(),
    w.analystPosts().filter(m => m.threadReply).map(m => m.text)],
    [['❌'], ['❌'], 0, [], []]);  // the ❌ says it all; the reason goes to the run log
  assert.ok(w.g.logs.some(l => /❌ no Social Alert needed \(P2, 300 engagements: below the escalation criteria\)/.test(l)));
  w.run();  // the next run neither copies ❌ again nor tells Burson anything
  eq([w.chat.botReactions(low.name), w.bursonPosts()], [['❌'], []]);

  const p0 = w.paste(F.P0_OK);
  w.run();
  const [draft] = w.gmail.allDrafts();
  const p0Fwd = w.analystPosts().filter(m => !m.threadReply)[1];
  w.gmail.discard(draft.id);
  w.run();
  assert.ok(w.chat.botReactions(p0.name).includes('❌'));
  assert.ok(w.chat.botReactions(p0Fwd.name).includes('❌'));
  assert.ok(!w.analystPosts().some(m => /deleted without being sent/.test(m.text)));
  eq(w.bursonPosts(), []);
});

test('AI escalation veto: non-P0 alert that Gemini judges does not warrant a Social Alert is marked ❌ without creating a draft, while P0 is never vetoed', () => {
  const w = world({ drafts: { live: false, mailbox: 'im@ops.test', from: 'Brand Social <im@ops.test>' } });
  // P1 high-engagement alert vetoed by Gemini (e.g. Google is only mentioned in passing)
  w.vertex.assess = () => ({
    checks: [],
    social_alert: { warranted: false, confidence: 0.95, reason: 'Google is only mentioned in passing; the post is about another company' },
  });
  const privacy = F.AIO.split('Product - Factual inaccuracies (not dangerous/offensive)').join('Product - Privacy & security concerns');
  const aioMsg = w.paste(privacy);
  w.run();
  assert.strictEqual(w.gmail.allDrafts().length, 0);
  const [aioFwd] = w.analystPosts().filter(m => !m.threadReply);
  eq([w.chat.botReactions(aioMsg.name), w.chat.botReactions(aioFwd.name)], [['❌'], ['❌']]);
  eq(w.analystPosts().filter(m => m.threadReply), []);  // no narration; the veto's reason goes to the run log
  assert.ok(w.g.logs.some(l => /❌ no Social Alert needed \(AI review: Google is only mentioned in passing/.test(l)));

  // An AI Overviews inaccuracy Gemini vetoes still goes to T&S ("✍️ T&S only", as IMs do): no draft and no ❌, just the form
  // details for the person filing it, and 👍 (receipt confirmed, no action yet) until the T&S confirmation brings ✍️
  const wrongMsg = w.paste(F.AIO.split('1845000000000000001').join('1845000000000000009'));
  w.run();
  assert.strictEqual(w.gmail.allDrafts().length, 0);
  eq(w.chat.botReactions(wrongMsg.name), ['👍']);
  const tnsNote = w.analystPosts().filter(m => m.threadReply).map(m => m.text).pop();
  assert.match(tnsNote, /^T&S form needed \(AI hallucination\)/);
  assert.ok(!/No Social Alert needed/.test(tnsNote), tnsNote);

  // P0 alert is NEVER vetoed even if Gemini says warranted: false
  const p0Msg = w.paste(F.P0_OK);
  w.run();
  assert.strictEqual(w.gmail.allDrafts().length, 1);
  assert.ok(!w.chat.botReactions(p0Msg.name).includes('❌'));
});

test('emoji parity with the IM on the live examples: 📰 📦 ⚖️ ✍️ (SaraJonesUSA) and 📰 ⚖️ (helpfulmeerkat, Brand: no 📦), and a Sensitive Topic alert is never ❌ by the AI', () => {
  const SARA = [
    'THIS ALERT MEETS P2 CRITERIA', '',
    '⬛SOCIAL ALERT⬛: Search | Alleged Index Censorship of Pro-Trump Content | X | 3 Engagements',
    '[Name]: Alleged Index Censorship of Pro-Trump Content / New / not previously reported over the past 14 days',
    '[Engagement]: VERY LOW (3 engagement)', '[Product]: Search', '[Social Network]: X',
    '[Exposure Tag]: Product - SEO/Publisher Concerns', '[Sensitive Topic]: Politics', '[KOF]: No', '',
    'X user SaraJonesUSA (14 K followers) posted a link to his blog praising Donald Trump and accuses Google of failing to index ' +
      'it, calling it electoral interference, and tags officials to request an investigation.', '',
    '[Link]: https://x.com/SaraJonesUSA/status/2110803467409166432', '',
    '[Time/Date Post Went Live]: October 13, 2026, 11:42 AM', '',
    '[Code]: Product - SEO/Publisher Concerns,3,SaraJonesUSA,Politics,Search,New / not previously reported over the past 14 days',
  ].join('\n');
  const MEERKAT = [
    'THIS ALERT MEETS P2 CRITERIA', '',
    '⬛SOCIAL ALERT⬛: Brand | Alleged Election Interference | X | 0 Engagements',
    '[Name]: Alleged Election Interference / New / not previously reported over the past 14 days',
    '[Engagement]: VERY LOW (0 engagement)', '[Product]: Brand', '[Social Network]: X',
    '[Exposure Tag]: Brand - Conspiratorial theories about Google', '[Sensitive Topic]: Politics', '[KOF]: No', '',
    'X user helpfulmeerkat (46 followers) accuses Anthropic of planning to interfere in an upcoming election. Google and Meta are ' +
      'also named, with the user arguing they should face similar actions.', '',
    '[Link]: https://x.com/helpfulmeerkat/status/2111095982725468221', '',
    '[Time/Date Post Went Live]: October 13, 2026, 7:04 AM', '',
    '[Code]: Brand - Conspiratorial theories about Google,0,helpfulmeerkat,Politics,Brand,New / not previously reported over the past 14 days',
  ].join('\n');

  // Run as the bot runs now: each Social Alert is sent at once, as the IM would, but only to the stand-in.
  const testing = { live: false, standIn: 'tester@testing.test', mailbox: 'tester@testing.test', from: 'Brand Social <tester@testing.test>' };

  // SaraJonesUSA: the AI calls T&S (election-integrity claim against Search); sent -> 📰 📦 ⚖️; T&S confirmation -> ✍️
  const w = world({ drafts: testing });
  w.vertex.assess = () => ({ checks: [], recommended_groups: [{ code: 'tns', reason: 'Claims Search interferes with an election' }] });
  const sara = w.paste(SARA);
  w.run();
  const [saraEmail] = w.gmail.sentMessages();
  eq([saraEmail.to, w.gmail.allDrafts().length], [['tester@testing.test'], 0]);
  assert.ok(saraEmail.text.endsWith('Would have gone to: To: Search alert POCs; Cc: Civics, GCPA, standard CC list'), saraEmail.text);
  eq(w.chat.botReactions(sara.name), ['📰', '📦', '⚖']);  // exactly the IM's set, no 👍
  w.gmail.receive('WD Intake Request - Marketing', 'Submitted link: https://x.com/SaraJonesUSA/status/2110803467409166432');
  w.run();
  eq(w.chat.botReactions(sara.name), ['📰', '📦', '⚖', '✍']);

  // helpfulmeerkat: Gemini calls it vocal fringe, but a Politics alert is always escalated -> sent -> 📰 ⚖️ (no 📦: Brand has no POCs)
  const w2 = world({ drafts: testing });
  w2.vertex.assess = () => ({ checks: [], social_alert: { warranted: false, confidence: 0.95, signal_class: 'vocal_fringe',
    reason: 'Post mainly targets Anthropic' } });
  const meerkat = w2.paste(MEERKAT);
  w2.run();
  const [meerkatEmail] = w2.gmail.sentMessages();
  assert.ok(meerkatEmail, 'the Politics alert still gets its Social Alert');
  assert.match(meerkatEmail.text, /Would have gone to: [^\n]*Cc: Civics, GCPA, standard CC list$/);
  eq(w2.chat.botReactions(meerkat.name), ['📰', '⚖']);  // exactly the IM's set
});

test('automatic ✍️ T&S marking: when the "WD Intake Request" confirmation email arrives in Gmail, the bot marks ✍️ in both spaces and sets T&S: Yes on the draft', () => {
  const w = world({ noWait: true, drafts: { live: true, mailbox: 'im@ops.test', from: 'Brand Social <sender@alerts.test>' } });
  const parisMsg = w.paste(F.PARIS);
  w.run();
  const [parisFwd] = w.analystPosts().filter(m => !m.threadReply);
  const [draft] = w.gmail.allDrafts();
  assert.match(draft.text, /^T&S: No$/m);
  assert.ok(!w.chat.botReactions(parisMsg.name).includes('✍'));

  // The T&S form confirmation email arrives in the mailbox with the alert's link
  w.gmail.receive('WD Intake Request - Marketing', 'Submitted link: https://x.com/paris_tech_press/status/1845000000000000003');
  const r = w.run();
  assert.strictEqual(r.tns_marked, 1);
  eq(w.chat.botReactions(parisFwd.name), ['✍']);
  eq(w.chat.botReactions(parisMsg.name), ['👍', '✍']);  // 👍: the draft waits on a person to send it
  assert.match(w.gmail.draft(draft.id).text, /^T&S: Yes$/m);
});

test('Media.gs + multimodal video/audio review: YouTube links and page og:video/og:audio are sent to Gemini, a >2-min video with no timestamp gets the one Gemini found (the bot adds it, Burson is told, nothing waits), and media errors fall back to text-only', () => {
  // 1. Direct media detection: YouTube URL, direct mp4/mp3, and page og:video / og:audio
  eq(B.mediaFor_({ post_url: 'https://youtu.be/dQw4w9WgXcQ?t=10' }), {
    kind: 'video', label: 'the YouTube video', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    parts: [{ fileData: { mimeType: 'video/mp4', fileUri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } }],
  });
  eq(B.mediaFor_({ post_url: 'https://cdn.example.com/clip.mp3' }), {
    kind: 'audio', label: 'the linked audio file', uri: 'https://cdn.example.com/clip.mp3',
    parts: [{ fileData: { mimeType: 'audio/mp3', fileUri: 'https://cdn.example.com/clip.mp3' } }],
  });

  const w = world({ noWait: true });
  const pageUrl = 'https://www.tiktok.com/@creator/video/1234567890';
  w.g.pages.set(pageUrl, '<html><head><meta property="og:video:secure_url" content="https://cdn.tiktok.com/v/1234567890.mp4"></head></html>');
  eq(w.bot.mediaFor_({ post_url: pageUrl }), {
    kind: 'video', label: 'the post\'s video', uri: 'https://cdn.tiktok.com/v/1234567890.mp4',
    parts: [{ fileData: { mimeType: 'video/mp4', fileUri: 'https://cdn.tiktok.com/v/1234567890.mp4' } }],
  });

  // 2. Long YouTube video (>120s) without a timestamp in the summary -> Gemini watches the video, reports duration &
  //    timestamp -> the bot adds the timestamp itself (a [Timestamp] line before [Link]) and tells Burson; nothing waits
  const ytAlert = F.P0_OK
    .replace('[Social Network]: X', '[Social Network]: YouTube')
    .replace('https://x.com/WasSamLowryEsq/status/2109952063492993159', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    .replace(',X,VERY LOW,1,WasSamLowryEsq,https://x.com/WasSamLowryEsq/status/2109952063492993159,', ',YouTube,VERY LOW,1,WasSamLowryEsq,https://www.youtube.com/watch?v=dQw4w9WgXcQ,');
  w.vertex.assess = () => ({
    checks: [],
    media_review: { watched: true, duration_seconds: 245, google_timestamp: '02:15', what_happens: 'Google Search appears at 02:15' },
  });
  w.paste(ytAlert);
  w.run();
  const lastCall = w.vertex.calls[w.vertex.calls.length - 1].payload;
  assert.strictEqual(lastCall.contents[0].parts[0].fileData.fileUri, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.strictEqual(lastCall.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_LOW');
  assert.strictEqual(w.bursonPosts()[0].text,
    'The alert has been updated, so there is no need to resend it. The following updates were made:\n- Timestamp updated to [02:15] (where Google comes up in the video).');
  const ytFwd = w.analystPosts().filter(m => !m.threadReply).slice(-1)[0];
  assert.match(ytFwd.text, /\n\[Timestamp\]: \[02:15\]\n\[Link\]: https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ\n/);
  assert.match(ytFwd.text, /QA corrected:\n- Timestamp updated to \[02:15\]/);
  const ytRow = w.alertRows().slice(-1)[0];
  eq([ytRow.requested.map(x => [x.field, x.new, x.problem]), ytRow.forwarded_fields.video_timestamp], [[['video_timestamp', '[02:15]', undefined]], undefined]);

  // 3. Fallback: if Vertex rejects the media URI (e.g. 400 Cannot fetch), Gemini.gs retries text-only automatically
  let calls = 0;
  w.vertex.fail = payload => {
    calls++;
    if (payload.contents[0].parts.some(p => p.fileData)) return { code: 400, body: { error: { message: 'Cannot fetch fileUri' } } };
    return null;
  };
  w.vertex.assess = () => ({ checks: [] });
  const ytAlert2 = ytAlert.replace('dQw4w9WgXcQ', 'abc123xyz00').replace('dQw4w9WgXcQ', 'abc123xyz00');
  w.paste(ytAlert2);
  const rFallback = w.run();
  assert.strictEqual(rFallback.errors.length, 0);
  assert.strictEqual(calls, 2);  // 1st call with video part failed -> 2nd call text-only succeeded
});

test('mined live Burson history: legacy exposure tag/topic/product aliases resolve cleanly, and assessPrompts_ injects relevant historical precedents', () => {
  // 1. Legacy exposure tags from the 32,000-row CSV map to current canonical names
  assert.strictEqual(B.lookupTag_('Product - General criticism').name, 'Product - Other/general criticism');
  assert.strictEqual(B.lookupTag_('Brand - General criticism of Google brand').name, 'Brand - Other/general criticism');
  assert.strictEqual(B.lookupTag_('Content - Threshold met for negativity on owned post').name, 'Content - Negative reaction to owned social post');
  assert.strictEqual(B.lookupTag_('Brand - Value Earnings & Finance').name, 'Brand - Value & Earnings');

  // 2. Legacy sensitive topics map to canonical topics
  assert.strictEqual(B.lookupTopic_('Race/Ethnicity').name, 'Hate Speech');
  assert.strictEqual(B.lookupTopic_('Misinformation').name, 'Medical Content / Medical Misinformation');
  assert.strictEqual(B.lookupTopic_('Public leak of internal documents').name, 'Privacy');

  // 3. Legacy products map or redirect cleanly (e.g. GemPix/Nano Banana -> Nano Banana; Employees -> deprecated -> Brand)
  assert.strictEqual(B.lookupProduct_('GemPix/Nano Banana').name, 'Nano Banana');
  assert.strictEqual(B.lookupProduct_('Gemini 2.5 Flash Image (GemPix)').name, 'Nano Banana');
  const empAlert = F.P0_OK
    .replace('[Product]: Search', '[Product]: Employees')
    .replace('[Exposure Tag]: Product - Perceived bias', '[Exposure Tag]: Content - Threshold met for negativity on owned post');
  const rev = B.reviewAlert_(B.parseAlert_(empAlert));
  assert.strictEqual(rev.fields.product, 'Brand');
  assert.strictEqual(rev.fields.exposure_tag, 'Content - Negative reaction to owned social post');

  // 4. Dynamic Precedent Retrieval injects matching historical analyst lessons into assessPrompts_
  const parsed = B.parseAlert_(F.P0_OK);
  const precs = B.relevantPrecedents_(parsed, 6);
  assert.strictEqual(precs.length, 6);
  assert.ok(precs.some(p => p.kind === 'fix'));
  assert.ok(precs.some(p => p.kind === 'no_action'));
  const prompts = B.assessPrompts_(parsed);
  assert.match(prompts.system, /HISTORICAL ANALYST PRECEDENTS \(real past decisions on similar alerts\):/);
  assert.match(prompts.system, /30\+ comments with >=30% negativity/);
});

test('BigQuery Mode A (Sprinklr/BMIE enrichment) and Mode B (direct Sprinklr & BMIE alert synthesis with deduplication)', () => {
  // Mode A: Sprinklr owned post below 30 comments / 30% negativity is automatically vetoed from escalation
  const ownedText = F.P0_OK
    .replace('[Product]: Search', '[Product]: Gemini App')
    .replace('[Exposure Tag]: Product - Perceived bias', '[Exposure Tag]: Content - Negative reaction to owned social post');
  const parsedOwned = B.parseAlert_(ownedText);
  parsedOwned.bq = {
    is_owned_post: true,
    sprinklr_account: 'Gemini App',
    sprinklr_total_comments: 19,
    sprinklr_neg_comments: 4,
    sprinklr_neg_pct: 21.1,
    sprinklr_baseline_pct: 8.5,
    sprinklr_top_neg_comments: 'Why is this broken | Pricing is too high',
  };
  const revBelow = B.reviewAlert_(parsedOwned);
  assert.ok(revBelow.socialAlert);
  assert.strictEqual(revBelow.socialAlert.warranted, false);
  assert.match(revBelow.socialAlert.reason, /19 comments at 21\.1% negativity/);

  // Mode A: BMIE KOF match upgrades KOF=No -> Yes and Engagement Level -> VIRAL KOF
  const parsedBmie = B.parseAlert_(F.AIO);
  parsedBmie.bq = {
    bmie_alert_source: 'ALL SLRR KOFs/INF',
    bmie_engagement_tier: 'MODERATE',
    bmie_kof: 'Tech Journalists',
    bmie_sentiment: 'negative',
  };
  const revBmie = B.reviewAlert_(parsedBmie);
  assert.strictEqual(revBmie.fields.kof, true);
  assert.strictEqual(revBmie.fields.engagement_level, 'HIGH');  // a KOF keeps the level for its count

  // Mode A: assessPrompts_ includes LIVE BIGQUERY GROUND TRUTH when parsed.bq is present
  const pWithBq = B.assessPrompts_(parsedOwned);
  assert.match(pWithBq.system, /LIVE BIGQUERY GROUND TRUTH/);
  assert.match(pWithBq.system, /19 total comments, 4 negative/);
  assert.match(pWithBq.system, /Why is this broken/);

  // Mode B: Sprinklr owned post (30+ comments, >=30% negativity) synthesizes a valid, detectable SLRR alert
  const sprinklrAlertText = B.formatSprinklrOwnedAlertText_({
    post_id: '7290105899',
    post_url: 'https://twitter.com/GeminiApp/status/2111147479248855484',
    account_name: 'Gemini App',
    platform: 'X',
    Product: 'Gemini',
    brand: 'Google',
    total_comments: 89,
    neg_comments: 30,
    neg_pct: 33.7,
    post_caption: 'With Gemini 4 Argon, you can use Canvas to turn dense PDFs into web apps.',
    post_published_date: '2026-10-16 14:00:00',
    top_neg_comments: 'Canvas keeps crashing on PDFs | Rate limits are way too low',
  });
  const parsedSprinklr = B.parseAlert_(sprinklrAlertText);
  assert.ok(B.detectAlert_(sprinklrAlertText, parsedSprinklr, ''));
  assert.strictEqual(parsedSprinklr.fields.product, 'Gemini App');
  assert.strictEqual(parsedSprinklr.fields.exposure_tag, 'Content - Negative reaction to owned social post');
  assert.match(parsedSprinklr.fields.summary, /89 comments with 33\.7% negative sentiment/);

  // Mode B: BMIE earned row synthesizes a valid, detectable SLRR alert
  const bmieAlertText = B.formatBmieEarnedAlertText_({
    url: 'https://x.com/techcritic/status/2111999888777666555',
    authorHandle: '@techcritic',
    SocialNetwork: 'X',
    product: 'Chrome',
    alert_source: 'Chrome Overall',
    engagementScore: 1450,
    engagement: 'MODERATE',
    KOF: 'Chrome | KOFs from SLRR data',
    followers: 92400,
    snippet: 'The new Chrome update broke all my extensions.',
    postTime: '2026-10-16 15:20:00',
  });
  const parsedBmieCard = B.parseAlert_(bmieAlertText);
  assert.ok(B.detectAlert_(bmieAlertText, parsedBmieCard, ''));
  assert.strictEqual(parsedBmieCard.fields.product, 'Chrome');
  assert.strictEqual(parsedBmieCard.fields.kof, true);
  // A KOF's card with a real count takes the level for its count (Review rule 9, as Burson writes it); VIRAL KOF is for no count
  assert.strictEqual(parsedBmieCard.fields.engagement_level, 'MODERATE');
  assert.strictEqual(parsedBmieCard.fields.total_engagement, 1450);

  // Shared URL Deduplication: if Zapier/Burson already posted the URL, Mode B skips it (zero redundancy)
  const existingAlerts = [{ record_key: B.recordKey_({ post_url: 'https://x.com/GeminiApp/status/2111147479248855484' }) }];
  assert.strictEqual(B.shouldIngestBqUrl_('https://twitter.com/GeminiApp/status/2111147479248855484', existingAlerts, new Set()), false);
  assert.strictEqual(B.shouldIngestBqUrl_('https://x.com/techcritic/status/2111999888777666555', existingAlerts, new Set()), true);
});

test('DSD & Brandy AI/Vector/Multimodal upgrades: gs:// & inline base64 media, story_accuracy check, Vector DB evergreen noise & semantic ongoing issue, Critic/Arbiter signal_class, BSIP KOL, non-English translation, and BigQuery ML.GENERATE_TEXT fallback', () => {
  // 1. Media.gs: gs:// Cloud Storage URI from DSD.video_candidates (bq.gcs_video_uri) and inline base64 (<= 18 MB)
  eq(B.mediaFor_({ post_url: 'https://x.com/user/status/2110793592830906680' }, null, {
    bq: { gcs_video_uri: 'gs://brand-social-dsd-curation/x_2110793592830906680.mp4', gcs_video_mime: 'video/mp4' },
  }), {
    kind: 'video', label: 'the Cloud Storage video', uri: 'gs://brand-social-dsd-curation/x_2110793592830906680.mp4',
    parts: [{ fileData: { mimeType: 'video/mp4', fileUri: 'gs://brand-social-dsd-curation/x_2110793592830906680.mp4' } }],
  });
  eq(B.mediaFor_({ post_url: 'https://cdn.example.com/voice_note.m4a' }, null, {
    fetchBinary: () => ({ base64: 'AAAAIGZ0eXBNNEEg', bytes: 1024, mimeType: 'audio/mp4' }),
  }), {
    kind: 'audio', label: 'the linked audio file', uri: 'https://cdn.example.com/voice_note.m4a',
    parts: [{ inlineData: { mimeType: 'audio/mp4', data: 'AAAAIGZ0eXBNNEEg' } }],
  });

  // 2. Multimodal Post-Write Story Accuracy Check: when media_review.story_accuracy === 'needs_review', the summary is fixed
  const rAcc = review(F.AIO, {
    llm: {
      checks: [],
      _media: { label: 'the post\'s video', kind: 'video' },  // the video went with this call (Gemini.gs)
      media_review: {
        watched: true,
        duration_seconds: 85,
        google_timestamp: '00:14',
        what_happens: 'The creator shows an edited screenshot of an AI Overview and states in the audio that it is a parody.',
        transcript: 'Just kidding folks, I photoshopped this AI Overview!',
        on_screen_text: 'PARODY SCREENSHOT',
        tone: 'satirical',
        google_angle: 'Parody meme about AI Overviews',
        story_accuracy: 'needs_review',
        corrected_summary: 'X user @TheChiefNerd (284,712 followers) shared a satirical video with a photoshopped AI Overview screenshot.',
        accuracy_note: 'The video audio explicitly states the screenshot is a parody, which the summary omits',
      },
    },
  });
  assert.ok(rAcc.fixes.some(x => x.field === 'summary'));
  assert.strictEqual(rAcc.fields.summary, 'X user @TheChiefNerd (284,712 followers) shared a satirical video with a photoshopped AI Overview screenshot.');
  assert.strictEqual(rAcc.media.story_accuracy, 'needs_review');
  assert.strictEqual(rAcc.media.tone, 'satirical');

  // 3. Vertex AI Vector Intelligence (`bqEvergreenFields_` + `AlertMemory` 14-day semantic Ongoing Issue):
  //    a) Evergreen noise topic (`google_as_verb` at cosine similarity 0.85, strict) -> is_evergreen_noise = true -> vetoed (`warranted: false`)
  const vecNoise = B.bqEvergreenFields_({
    id: 'google_as_verb',
    label: 'Google used as a verb / without using Google',
    strict: true,
    sim: 0.85,
  });
  assert.strictEqual(vecNoise.is_evergreen_noise, true);
  assert.strictEqual(vecNoise.evergreen_cosine_distance, 0.15);
  const parsedNoise = B.parseAlert_(F.AIO);
  parsedNoise.bq = vecNoise;
  const revNoise = B.reviewAlert_(parsedNoise);
  assert.strictEqual(revNoise.socialAlert.warranted, false);
  assert.match(revNoise.socialAlert.reason, /evergreen noise topic/);

  //    b) Non-strict evergreen topic + 14-day semantic Ongoing Issue match (`AlertMemory` `memoryStory`) -> New becomes Ongoing Issue
  const vecOngoing = B.bqEvergreenFields_({
    id: 'product_quality_drop',
    label: 'Perceived drop in product quality',
    strict: false,
    sim: 0.86,
  });
  assert.strictEqual(vecOngoing.is_evergreen_noise, false);
  const parsedOngoing = B.parseAlert_(F.AIO);
  parsedOngoing.bq = vecOngoing;
  const revOngoing = B.reviewAlert_(parsedOngoing, {
    memoryStory: { issue_name: 'Hallucinated AI Overview medical advice', alert_id: 'QA-1001', sim: 0.89, how: 'vector' },
  });
  assert.strictEqual(revOngoing.fields.issue_status, 'Ongoing Issue');

  // 4. Brandy "Thick-Skin Pragmatist" Critic/Arbiter proportionality (`signal_class: 'routine_snark'` / `'vocal_fringe'`)
  const rSnark = review(F.AIO, {
    llm: {
      checks: [],
      social_alert: {
        warranted: true,  // even if the model forgot to set warranted=false, signal_class=routine_snark enforces warranted=false
        confidence: 0.94,
        reason: 'Routine snark with a few hours of outrage half-life',
        signal_class: 'routine_snark',
        outrage_half_life: 'hours',
      },
    },
  });
  assert.strictEqual(rSnark.socialAlert.warranted, false);
  assert.strictEqual(rSnark.socialAlert.signal_class, 'routine_snark');

  // 5. Brandy BSIP KOL/KOF lookup + DSD non-English post translation
  const parsedBsip = B.parseAlert_(F.AIO);
  parsedBsip.bq = {
    sonar_interactions: 31200,
    sonar_criticality: 'HIGH',
    sonar_smart_tags: 'Product - Hallucination/inaccurate results',
    bsip_language: 'es',
    bsip_is_kol: true,
    bsip_kof_vertical: 'LATAM Tech Press',
  };
  const revBsip = B.reviewAlert_(parsedBsip, {
    llm: {
      checks: [],
      translation: {
        is_non_english: true,
        language: 'Spanish',
        english_text: 'This AI Overview gave a completely wrong answer about historical dates.',
      },
    },
  });
  assert.strictEqual(revBsip.fields.kof, true);
  assert.strictEqual(revBsip.fields.engagement_level, 'HIGH');  // a KOF keeps the level for its count
  assert.ok(revBsip.notes.some(n => n.includes('Translated from Spanish:')));
  const bqPrompt = B.assessPrompts_(parsedBsip);
  assert.match(bqPrompt.system, /BSIP Sonar Live Events: 31200 total interactions/);
  assert.match(bqPrompt.system, /kof_vertical="LATAM Tech Press"/);

  // 6. Tier-3 Fallback: when Direct Vertex AI returns 503 across all tries, Gemini.gs falls back to BigQuery ML.GENERATE_TEXT (`DSD.gemini_analyzer`)
  const g = makeGoogle(NOW);
  let bqCalled = false;
  const origFetch = g.services.UrlFetchApp.fetch;
  g.services.UrlFetchApp.fetch = (url, params) => {
    if (url.includes('aiplatform.googleapis.com/')) {
      return { getResponseCode: () => 503, getContentText: () => '{"error":"Vertex overloaded"}', getHeaders: () => ({}) };
    }
    if (url.includes('bigquery.googleapis.com/') && params && params.payload && params.payload.includes('ML.GENERATE_TEXT')) {
      bqCalled = true;
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({
          jobComplete: true,
          schema: { fields: [{ name: 'res', type: 'STRING' }] },
          rows: [{ f: [{ v: JSON.stringify({ answer: 'Answered via BigQuery ML.GENERATE_TEXT fallback!' }) }] }],
        }),
        getHeaders: () => ({}),
      };
    }
    return origFetch(url, params);
  };
  const botWithBqFallback = loadBot(g.services, g.clock);
  const ans = botWithBqFallback.geminiClient_().answer('What is the KOF rule?', null, []);
  assert.strictEqual(bqCalled, true);
  assert.strictEqual(ans, 'Answered via BigQuery ML.GENERATE_TEXT fallback!');
});

test('👍 = "confirming receipt, no action yet taken": a correct alert gets it right away only when the bot can\'t action it in the same pass (no timer)', () => {
  const testing = { live: false, standIn: 'tester@testing.test', mailbox: 'tester@testing.test', from: 'Brand Social <tester@testing.test>' };

  // Testing: the Social Alert goes out at once -> its action emojis only, as on the IMs' posts; no timer adds 👍 later
  const w = world({ drafts: testing });
  const quick = w.paste(F.P0_OK);
  w.run();
  eq(w.chat.botReactions(quick.name), ['📰', '📦', '🌎']);
  w.g.clock.now += 11 * 60 * 1000;
  w.run();
  eq(w.chat.botReactions(quick.name), ['📰', '📦', '🌎']);

  // The send fails (Gmail refuses it: a 429, so nothing went out): receipt is confirmed at once (👍); the retry sends it and adds the action emojis
  const v = world({ drafts: testing });
  v.gmail.fail = (method, path) => (path === 'messages/send' ? { code: 429, body: { error: { message: 'rate limit exceeded' } } } : null);
  const waiting = v.paste(F.P0_OK);
  v.run();
  eq([v.chat.botReactions(waiting.name), v.alertRows()[0].email_status, v.gmail.sentMessages().length], [['👍'], 'pending', 0]);
  v.gmail.fail = null;
  v.run();
  eq([v.chat.botReactions(waiting.name), v.alertRows()[0].email_status, v.gmail.sentMessages().length],
    [['👍', '📰', '📦', '🌎'], 'sent', 1]);

  // No stand-in: the draft waits on a person to send it -> 👍 right away, once
  const d = world({ drafts: { live: false, mailbox: 'im@ops.test', from: 'Brand Social <im@ops.test>' } });
  const slow = d.paste(F.AIO);
  d.run();
  eq(d.chat.botReactions(slow.name), ['👍']);
  d.run();
  eq(d.chat.botReactions(slow.name), ['👍']);
});

test('Android face-unlock example: Burson is told the corrections in the thread (no ⬇️), the email goes out at once and gets 📰 📦 💬 (a Privacy topic on an alert escalated on 2K+ engagements alone adds no ⚖️); 🧑‍💻 is a DM to the stand-in while testing; ➕ for an address on no list', () => {
  const ANDROID = [
    'THIS ALERT MEETS P1 CRITERIA', '',
    '🟥SOCIAL ALERT🟥: Android (Android OS & Google TV) | Criticism of Android face unlock security | TikTok | 16548 Engagements',
    '[Name]: Criticism of Android face unlock security / New / not previously reported over the past 14 days',
    '[Engagement]: HIGH (16548 engagements)', '[Product]: Android (Android OS & Google TV)', '[Social Network]: TikTok',
    '[Exposure Tag]: Product - Product failures - general software/service issues', '[Sensitive Topic]: Privacy', '[KOF]: No', '',
    'TikTok user customadventurist compared Face ID with Android face unlock, alleging Android phones can be unlocked with a ' +
      'photograph because they rely on the selfie camera rather than a 3D facial scanner.', '',
    '[Link]: https://www.tiktok.com/@customadventurist/video/7697406404025486605', '',
    '[Time/Date Post Went Live]: October 13, 2026, 4:08 PM', '',
    '[Code]: Product - Product failures - general software/service issues,16548,customadventurist,Privacy,Android (Android OS & Google TV),' +
      'New / not previously reported over the past 14 days',
  ].join('\n');
  const testing = { live: false, standIn: 'tester@testing.test', mailbox: 'bot@runner.test', from: 'Brand Social <bot@runner.test>' };

  // 1. The tag becomes Product - Privacy & security concerns (Burson is told in the thread, no ⬇️), and the Social Alert
  //    goes out with it at once, to the stand-in only. At 16,548 engagements it would be escalated anyway, so the Privacy topic adds no
  //    Civics (IMs added ⚖️ to ~1 in 4 such alerts since March; this IM did); a privacy concern isn't a product failure: no 🧑‍💻.
  const w = world({ noWait: true, drafts: testing });
  w.vertex.assess = () => llmCheck('exposure_tag_fit', 'Product - Privacy & security concerns', 0.95, 'The post is about face unlock security');
  const msg = w.paste(ANDROID);
  w.run();
  assert.match(w.bursonPosts()[0].text, /- Exposure Tag updated to Product - Privacy & security concerns\./);
  eq(w.chat.botReactions(msg.name), ['📰', '📦', '💬']);
  const [email] = w.gmail.sentMessages();
  assert.match(email.text, /^Exposure Tag: Product - Privacy & security concerns$/m);
  assert.match(email.text, /\n\nWould have gone to: To: [^\n]*alert POCs, gUP \(social customer support\); Cc: GCPA, standard CC list$/);

  // 2. Taken as written (a NEW product failure with a Sensitive Topic): the escalation protocol applies. Testing: the DM goes
  //    to the stand-in, its last line naming the leads it would have gone to, then 🧑‍💻. Nothing about it is posted in a space.
  //    A second alert on the same issue within 14 days isn't pinged again.
  const v = world({ noWait: true, drafts: testing });
  v.chat.addDm('tester@testing.test', 'spaces/DMSTANDIN');
  const asIs = v.paste(ANDROID);
  v.run();
  const [dm] = v.chat.botPosts('spaces/DMSTANDIN');
  assert.match(dm.text, /^\*Escalation protocol\* \(P0 \+ Sensitive Topics \+ Product Failure\)/);
  assert.match(dm.text, /- Why: NEW issue \(Sensitive: Privacy\)/);
  assert.ok(dm.text.endsWith('\n\nWould have gone to: Kelsey Lange (lead1@alerts.test), Jon Silver (lead2@alerts.test)'), dm.text);
  eq(v.chat.botReactions(asIs.name), ['📰', '📦', '💬', '🧑‍💻']);
  eq(v.analystPosts().filter(m => m.threadReply), []);
  const sameIssue = ANDROID.split('general software/service issues').join('physical safety issues')
    .split('7697406404025486605').join('7697406404025486999');
  const again = v.paste(sameIssue);
  v.run();
  assert.ok(!v.chat.botReactions(again.name).includes('🧑‍💻'), 'pinged once per issue');
  assert.strictEqual(v.chat.botPosts('spaces/DMSTANDIN').length, 1);

  // No DM, and the stand-in is the account the bot runs as (nobody can DM themselves in Chat): the stand-in gets the
  // escalation message by email instead (only to the stand-in), and 🧑‍💻 goes on; no notice on the Control tab
  const self = Object.assign({}, testing, { mailbox: 'tester@testing.test', from: 'Brand Social <tester@testing.test>' });
  const u = world({ noWait: true, drafts: self });
  const noDm = u.paste(ANDROID);
  const before = u.gmail.sentMessages().length;
  const rNoDm = u.run();
  assert.ok(u.chat.botReactions(noDm.name).includes('🧑‍💻'));
  const byEmail = u.gmail.sentMessages().slice(before).filter(m => /Escalation protocol/.test(m.subject));
  eq(byEmail.map(m => m.to), [['tester@testing.test']]);
  assert.match(byEmail[0].subject, /^\[Testing\] Escalation protocol: /);
  assert.match(byEmail[0].text, /Would have gone to: Kelsey Lange \(lead1@alerts\.test\), Jon Silver \(lead2@alerts\.test\)/);
  assert.match(byEmail[0].text, /Chat can't DM tester@testing\.test \(the account the bot runs as\), so it came by email\.$/);
  eq(rNoDm.notices || [], []);
  // ...and when that email can't go either (Gmail refuses it), no 🧑‍💻, and the Control tab is told why
  const w2 = world({ noWait: true, drafts: self });
  w2.gmail.fail = (method, path, query, body) => {
    if (!/messages\/send$/.test(String(path))) return null;
    const raw = Buffer.from(String((body && body.raw) || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return /Escalation protocol/.test(raw) ? { code: 500, body: { error: { message: 'Backend Error' } } } : null;
  };
  const neither = w2.paste(ANDROID);
  const rNeither = w2.run();
  assert.ok(!w2.chat.botReactions(neither.name).includes('🧑‍💻'));
  assert.match((rNeither.notices || [])[0] || '', /^Couldn't send the escalation-protocol DM for QA-\d+ to tester@testing\.test \(no direct message with that account; by email: .+\), so it has no \ud83e\uddd1\u200d\ud83d\udcbb\.$/);
  // The bot runs as another account that has no DM with the tester yet: it falls back to email so the tester still gets it
  const x = world({ noWait: true, drafts: testing });
  const other = x.paste(ANDROID);
  const xBefore = x.gmail.sentMessages().length;
  const rOther = x.run();
  assert.ok(x.chat.botReactions(other.name).includes('🧑‍💻'));
  const xEmails = x.gmail.sentMessages().slice(xBefore).filter(m => /Escalation protocol/.test(m.subject));
  eq(xEmails.map(m => m.to), [['tester@testing.test']]);
  assert.match(xEmails[0].text, /Chat can't DM tester@testing\.test \(no direct message with the bot's account\), so it came by email\.$/);
  eq(rOther.notices || [], []);

  // 3. Real distros (no stand-in), real Burson space: Jon is DM'd (Kelsey has no DM with the bot yet) -> 🧑‍💻. On send, an
  //    address that's on no list -> ➕. GCPA has no address on file, so a real email didn't reach it: no 📰.
  const live = world({ noWait: true, drafts: { live: true, mailbox: 'im@ops.test', from: 'Brand Social <sender@alerts.test>' } });
  live.chat.addDm('lead2@alerts.test', 'spaces/DMJON');
  const liveMsg = live.paste(ANDROID);
  live.run();
  const [jonDm] = live.chat.botPosts('spaces/DMJON');
  assert.match(jonDm.text, /\*Escalation protocol\* \(P0 \+ Sensitive Topics \+ Product Failure\)/);
  assert.match(jonDm.text, /View Post: <https:\/\/www\.tiktok\.com\/@customadventurist\/video\/7697406404025486605\|Criticism of Android face unlock security>/);
  assert.ok(!/Would have gone to/.test(jonDm.text));
  eq(live.chat.botReactions(liveMsg.name), ['🧑‍💻']);
  assert.ok(!live.analystPosts().some(m => /DM'd|escalation protocol applies/i.test(m.text)));
  const [liveDraft] = live.gmail.allDrafts();
  live.gmail.send(liveDraft.id, 'im@ops.test', '<sent-android@mail.test>', { addCc: ['someone-new@ops.test'] });
  live.run();
  eq(live.chat.botReactions(liveMsg.name), ['🧑‍💻', '📦', '💬', '➕']);
});

// The user's alerts from 2026-10-18 (post dates moved into the fixtures' week)
const ANDREW = [
  'Automated Alert via Burson (beta)',
  'Note: This is an automated message, all alerts can be found in Brand Safety Tracking (go/Brand-Safety-Tracking)',
  'THIS ALERT MEETS P1 CRITERIA',
  '🟥SOCIAL ALERT🟥: Brand | Alleged Google data collection | Instagram | 3111 Engagements',
  '[Name]: Alleged Google data collection / Ongoing Issue', '[Engagement]: HIGH (3,111 engagement)', '[Product]: Brand',
  '[Social Network]: Instagram', '[Exposure Tag]: Brand - Privacy & security concerns', '[Sensitive Topic]: Privacy', '[KOF]: No',
  'Instagram user andrewjpdiaz (186K followers) shared a post alleging that Google secretly records users\' audio to "feed ad ' +
    'targeting profiles." The author claims that Google enables audio recording toggles by default on user accounts and ' +
    'provides a tutorial on how to disable the "Include voice and audio activity" and "Include Visual Search History" settings ' +
    'to shut off this "massive data pipeline."',
  '[Link]: https://www.instagram.com/p/DenPQ0sDPMi',
  '[Time/Date Post Went Live]: 10/13/2026,4:00 PM',
  '[Code]: Brand - Privacy & security concerns,3111,andrewjpdiaz,Privacy,Brand,Ongoing Issue',
].join('\n');
const STAND_IN = { live: false, standIn: 'tester@testing.test', mailbox: 'bot@runner.test', from: 'Brand Social <bot@runner.test>' };

test('⚖️ Civics follows a Sensitive Topic when the topic (or a KOF author) is why the alert is urgent, as IMs do since March: under 2K or a KOF -> ⚖️; 2K+ alone -> only Medical / Violence, or Gemini\'s call', () => {
  const civics = (text, ai) => {
    const esc = B.escalation_(review(text).fields, { now: NOW });
    const plan = B.planRecipients_(esc, esc.text, ai || []);
    return plan.groups.includes('Civics');
  };
  const at = (text, n) => text.split('3111').join(String(n)).replace('HIGH (3,111 engagement)', `LOW (${n} engagements)`);
  eq([civics(ANDREW), civics(at(ANDREW, 900)), civics(ANDREW.replace('[KOF]: No', '[KOF]: Viral KOFs (KOFs)'))], [false, true, true]);
  const medical = ANDREW.replace('[Sensitive Topic]: Privacy', '[Sensitive Topic]: Medical Content / Medical Misinformation')
    .replace(',Privacy,Brand,', ',Medical Content / Medical Misinformation,Brand,');
  eq([civics(medical), civics(ANDREW, ['civics'])], [true, true]);  // any engagement; Gemini's call adds it too
});

test('andrewjpdiaz (Brand privacy, 3,111 engagements): 📰 💬 like the IM: no ⚖️ for an alert escalated on engagement alone, gUP for a post about Google account settings', () => {
  const w = world({ drafts: STAND_IN });
  let prompt = '';
  w.vertex.assess = payload => {
    prompt = payload.systemInstruction.parts[0].text;
    return { checks: [], recommended_groups: [
      { code: 'gcpa', reason: 'Reputational claims about Google data collection' },
      { code: 'gup', reason: 'The post tells users which Google Account settings to turn off' },
    ] };
  };
  const msg = w.paste(ANDREW);
  w.run();
  eq(w.chat.botReactions(msg.name), ['📰', '💬']);
  const [email] = w.gmail.sentMessages();
  assert.match(email.text, /\n\nWould have gone to: To: Brand alert POCs, gUP \(social customer support\); Cc: GCPA, standard CC list$/);
  assert.match(prompt, /a privacy or data-collection post about people's Google accounts and settings is gUP's area/);
  assert.match(prompt, /WEB SEARCH: if you have a web search tool/);
  eq(w.bursonPosts(), []);
});

test('a KOF alert as Burson writes it ([KOF]: Viral KOFs (KOFs), VERY LOW): escalated as a KOF, no engagement or KOF change asked, no T&S form for a KOF alone', () => {
  const w = world({ drafts: STAND_IN });
  w.vertex.assess = () => llmCheck('kof_fit', 'No', 0.95, 'Only 11 engagements');  // Gemini can't un-list a KOF
  const msg = w.paste(F.WAYMO_KOF);
  w.run();
  eq(w.chat.botReactions(msg.name), ['📰', '📦']);
  eq(w.bursonPosts(), []);
  assert.strictEqual(w.gmail.sentMessages().length, 1);
  assert.ok(!w.analystPosts().some(m => /T&S form needed/.test(m.text)));
});

/** Gemini for the follow-up tests: GCPA on everything; its follow-up call once it's shown the author's earlier alerts. */
function followUpGemini(w, followUp) {
  const prompts = [];
  w.vertex.assess = payload => {
    const system = payload.systemInstruction.parts[0].text;
    prompts.push(system);
    const out = { checks: [], recommended_groups: [{ code: 'gcpa', reason: 'Criticism of Waymo from a viral KOF' }] };
    if (/EARLIER ALERTS \(/.test(system)) out.follow_up = followUp;
    return out;
  };
  return prompts;
}

test('follow-up by the same author to an alert that already went out, adding nothing new: no second Social Alert, ❌ (as the IM left it); Gemini saw the earlier alert', () => {
  const w = world({ drafts: STAND_IN });
  const prompts = followUpGemini(w, { of: 1, adds_new: false, confidence: 0.93, reason: 'Asks Grok about the same remote-operator claim' });
  const original = w.paste(F.WAYMO_KOF);
  w.run();
  eq(w.chat.botReactions(original.name), ['📰', '📦']);
  w.g.clock.now += 2 * 3600 * 1000;
  const followUp = w.paste(F.WAYMO_FOLLOW_UP);
  w.run();
  eq(w.chat.botReactions(followUp.name), ['❌']);
  assert.strictEqual(w.gmail.sentMessages().length, 1);
  eq(w.bursonPosts(), []);
  const last = prompts[prompts.length - 1];
  assert.match(last, /\[1\] today · alerted \(📰 📦\) · Waymo · Product - Other\/general criticism · 11 engagements · "Criticism against Waymo" · https:\/\/x\.com\/ICannot_Enough\/status\/2111814207448514693/);
  assert.ok(w.g.logs.some(l => /❌ no Social Alert needed \(follow-up by the same author to QA-\d+, which was already alerted: Asks Grok/.test(l)), w.g.logs.join('\n'));
});

test('follow-up that adds something new (or Gemini is down): the update goes out on the original Social Alert\'s thread', () => {
  const w = world({ drafts: STAND_IN });
  followUpGemini(w, { of: 1, adds_new: true, confidence: 0.9, reason: 'Shares a new incident video' });
  w.paste(F.WAYMO_KOF);
  w.run();
  w.g.clock.now += 2 * 3600 * 1000;
  const followUp = w.paste(F.WAYMO_FOLLOW_UP);
  w.run();
  const [first, update] = w.gmail.sentMessages();
  eq([update && update.threadId, w.chat.botReactions(followUp.name)], [first.threadId, ['📰', '📦']]);
  assert.strictEqual(update.inReplyTo, first.messageId);

  // Gemini unavailable: Burson's "follow-up post" + the same issue name tie it to the original; without a judgment on
  // whether it adds anything, it isn't dropped: the KOF update goes on the original thread
  const v = world({ drafts: STAND_IN });
  v.paste(F.WAYMO_KOF);
  v.run();
  v.g.clock.now += 2 * 3600 * 1000;
  v.vertex.fail = () => ({ code: 503, body: { error: { message: 'unavailable' } } });
  const down = v.paste(F.WAYMO_FOLLOW_UP);
  v.run();
  const sent = v.gmail.sentMessages();
  eq([sent.length, sent[1] && sent[1].threadId, v.chat.botReactions(down.name)], [2, sent[0].threadId, ['📰', '📦']]);
});

test('follow-up guards: an original only in the SLRR alert log still counts; 2K+ engagements of its own goes out as an update; the same post alerted again gets ❌', () => {
  // The bot never saw the original (alerted before it ran / in another space): the SLRR alert log has it
  const log = [{ date_added: '2026-10-14T04:00:00.000Z', url: 'https://x.com/ICannot_Enough/status/2111814207448514693',
    issue_name: 'Criticism against Waymo', exposure_tag: 'Product - Other/general criticism', risk_tag: '-', product: 'Waymo',
    engagements: 11, overview: 'X user ICannot_Enough (307.1K followers) shared a video criticizing Waymo\'s remote operations.',
    emojis: '📦 Product 📰 GCPA' }];
  const w = world({ drafts: STAND_IN, bq: () => ({ author_alerts: log }) });
  const prompts = followUpGemini(w, { of: 1, adds_new: false, confidence: 0.9, reason: 'Same claim, asked again' });
  const msg = w.paste(F.WAYMO_FOLLOW_UP);
  w.run();
  eq([w.chat.botReactions(msg.name), w.gmail.sentMessages().length], [['❌'], 0]);
  assert.match(prompts[0], /\[1\] today · alerted \(📦 Product 📰 GCPA\) · Waymo/);

  // A follow-up with 2K+ engagements of its own: not dropped (an ongoing issue at 2K+ still alerts)
  const v = world({ drafts: STAND_IN });
  followUpGemini(v, { of: 1, adds_new: false, confidence: 0.95, reason: 'Same claim' });
  v.paste(F.WAYMO_KOF);
  v.run();
  v.g.clock.now += 2 * 3600 * 1000;
  const viral = v.paste(F.WAYMO_FOLLOW_UP.replace('| 1 Engagements', '| 5200 Engagements')
    .replace('VERY LOW (1 engagement)', 'HIGH (5200 engagements)').replace(',1,ICannot_Enough,', ',5200,ICannot_Enough,'));
  v.run();
  eq([v.gmail.sentMessages().length, v.chat.botReactions(viral.name)], [2, ['📰', '📦']]);

  // The same post alerted again (another Zapier message): ❌, no second email, whatever Gemini says
  const u = world({ drafts: STAND_IN });
  followUpGemini(u, null);
  u.paste(F.WAYMO_KOF);
  u.run();
  u.g.clock.now += 3600 * 1000;
  const again = u.paste(F.WAYMO_KOF + '\n');
  u.run();
  eq([u.chat.botReactions(again.name), u.gmail.sentMessages().length], [['❌'], 1]);
});

test('earlierAlerts_ / followUpOf_: same author or same post in the last 14 days (bot), the author\'s log alerts (never the same post), rule fallback without Gemini', () => {
  const now = NOW;
  const f = parse(F.WAYMO_FOLLOW_UP).fields;
  const row = (id, url, hoursAgo, extra) => Object.assign({ alert_id: id, author: 'ICannot_Enough', exposure_tag: 'Product - Other/general criticism',
    record_key: B.recordKey_({ post_url: url }), created_at: now - hoursAgo * 3600e3, email_status: 'sent', email_thread: 'th1', mirrored: '📰 📦',
    fields: { post_url: url, product: 'Waymo', issue_name: 'Criticism against Waymo', summary: 'shared a video', total_engagement: 11 } }, extra || {});
  const history = [row('QA-1', 'https://x.com/ICannot_Enough/status/1', 2), row('QA-2', 'https://x.com/someoneElse/status/2', 1, { author: 'someoneElse' }),
    row('QA-3', 'https://x.com/ICannot_Enough/status/3', 15 * 24)];  // too old
  const bq = { author_alerts: [
    { date_added: '2026-10-10T04:00:00.000Z', url: 'https://x.com/ICannot_Enough/status/9', issue_name: 'Waymo vs Tesla', emojis: '📰 GCPA 📦 Product' },
    { date_added: '2026-10-14T04:00:00.000Z', url: f.post_url, issue_name: 'Criticism against Waymo' },  // this very post: never
  ] };
  const earlier = B.earlierAlerts_(f, history, bq, now);
  eq(earlier.map(e => [e.n, e.source, e.alert_id || e.url, e.outcome, e.days_ago]),
    [[1, 'bot', 'QA-1', 'alerted', 0], [2, 'log', 'https://x.com/ICannot_Enough/status/9', 'alerted', 4]]);
  eq(B.followUpOf_(earlier, { of: 2, adds_new: false, confidence: 0.9 }, f, now).original.n, 2);
  assert.strictEqual(B.followUpOf_(earlier, { of: null, confidence: 0.9 }, f, now), null);  // Gemini: not a follow-up
  const rule = B.followUpOf_(earlier, undefined, f, now);  // no Gemini: "follow-up post" + same issue name
  eq([rule.by, rule.original.alert_id, rule.adds_new, rule.corroborated], ['rule', 'QA-1', null, true]);
  const standalone = Object.assign({}, f, { summary: 'X user ICannot_Enough posted that Waymo is overrated.', issue_name: 'Waymo vs Tesla' });
  assert.strictEqual(B.followUpOf_(earlier, undefined, standalone, now), null);
  assert.ok(B.ev('FOLLOW_UP_RX_').test('replied to a post they previously made about the vehicle'));
});

test('web grounding: reviews carry Vertex AI Web Grounding for Enterprise (Burson answers never search); a refused tool is retried without it and stays off; sources are read from groundingMetadata', () => {
  const w = world();
  w.paste(F.P0_OK);
  w.run();
  eq(w.vertex.calls[0].payload.tools, [{ enterpriseWebSearch: {} }]);
  eq(B.geminiPayload_('s', 'p', { type: 'OBJECT' }, { grounding: 'google' }).tools, [{ googleSearch: {} }]);
  assert.strictEqual(B.geminiPayload_('s', 'p', { type: 'OBJECT' }, {}).tools, undefined);

  // Vertex AI refuses the tool: the same review is retried without it (and works); the next ones don't ask again
  const v = world();
  v.vertex.fail = payload => (payload.tools ? { code: 400, body: { error: { message: 'Web Grounding for Enterprise (enterpriseWebSearch) is not enabled' } } } : null);
  v.paste(F.P0_OK);
  const r = v.run();
  eq([r.errors, v.vertex.calls.map(c => !!c.payload.tools)], [[], [true, false]]);
  v.paste(F.MAPS);
  v.run();
  eq(v.vertex.calls.map(c => !!c.payload.tools), [true, false, false]);

  // A question from Burson in an alert's thread: answered without web search
  const q = world();
  const alert = q.paste(F.P0_OK);
  q.run();
  q.reply(alert, 'Why does this need a Sensitive Topic?');
  q.run();
  const answerCall = q.vertex.calls.find(c => ((c.payload.generationConfig.responseSchema || {}).properties || {}).answer);
  assert.ok(answerCall, 'the question was answered');
  assert.strictEqual(answerCall.payload.tools, undefined);

  eq(B.webSources_({ candidates: [{ groundingMetadata: { webSearchQueries: ['waymo remote operators philippines'],
    groundingChunks: [{ web: { title: 'businessinsider.com', uri: 'https://vertexaisearch.cloud.google.com/x' } }] } }] }),
  { queries: ['waymo remote operators philippines'], sources: [{ title: 'businessinsider.com', uri: 'https://vertexaisearch.cloud.google.com/x' }] });
  assert.strictEqual(B.webSources_({ candidates: [{}] }), null);
});

test('who the bot may DM: Testing (runMode_, or no mode known, or the auto-correct flow) only the stand-in, from any space; LIVE only the leads, from the Mirror space too; Testing with no stand-in, nobody; a failed DM shows on the Control tab for an hour', () => {
  const g = makeGoogle(NOW);
  const bot = loadBot(g.services, g.clock);
  bot.ev('GEN').email.stand_in = 'tester@testing.test';
  g.chat.addDm('tester@testing.test', 'spaces/DMSTANDIN');
  g.chat.addDm('lead2@alerts.test', 'spaces/DMJON');
  const LIVE_MODE = { live: true, why: '' };
  const TESTING = { live: false, why: 'the Burson test copy, B26, is set' };
  const mirror = mode => ({ burson: { id: 'spaces/MIRROR' }, analyst: { id: 'spaces/MIRROR' }, outboundBlocked: true, sfBurson: { id: REAL }, mode });
  const real = mode => ({ burson: { id: REAL }, analyst: { id: 'spaces/ANALYST' }, sfBurson: { id: REAL }, mode });
  const ac = { burson: { id: REAL }, analyst: { id: 'spaces/AC' }, sourceReadOnly: true, sfBurson: { id: REAL }, mode: LIVE_MODE };
  // Testing: the stand-in only, from any space; never a lead; nothing in a dry run; the auto-correct flow is never LIVE
  eq([bot.guardedChat_(mirror(TESTING), {}).dm('tester@testing.test', 'hi', 'k1'),
    bot.guardedChat_(mirror(TESTING), {}).dm('lead2@alerts.test', 'hi', 'k2'),
    bot.guardedChat_(real(undefined), {}).dm('lead2@alerts.test', 'hi', 'k3'),
    bot.guardedChat_(mirror(TESTING), { dry_run: true }).dm('tester@testing.test', 'hi', 'k4'),
    bot.guardedChat_(ac, {}).dm('lead2@alerts.test', 'hi', 'k5')],
  [true, false, false, false, false]);
  eq([g.chat.botPosts('spaces/DMSTANDIN').length, g.chat.botPosts('spaces/DMJON').length], [1, 0]);
  // LIVE: the leads only, from the Mirror space as from S-F Burson; never the stand-in (the auto-correct flow: the stand-in)
  eq([bot.guardedChat_(mirror(LIVE_MODE), {}).dm('lead2@alerts.test', 'hi', 'k6'),
    bot.guardedChat_(real(LIVE_MODE), {}).dm('lead2@alerts.test', 'hi', 'k7'),
    bot.guardedChat_(real(LIVE_MODE), {}).dm('tester@testing.test', 'hi', 'k8'),
    bot.guardedChat_(ac, {}).dm('tester@testing.test', 'hi', 'k9')],
  [true, true, false, true]);
  // Testing with no stand-in in the config: nobody at all
  bot.ev('GEN').email.stand_in = '';
  eq([bot.guardedChat_(mirror(TESTING), {}).dm('tester@testing.test', 'hi', 'k10'),
    bot.guardedChat_(mirror(TESTING), {}).dm('lead2@alerts.test', 'hi', 'k11')], [false, false]);

  const saved = {};
  const props = { getProperty: k => (k in saved ? saved[k] : null), setProperty: (k, v) => { saved[k] = v; } };
  eq([bot.recentNotice_(props, []), bot.recentNotice_(props, ['DM failed']), bot.recentNotice_(props, [])], ['', 'DM failed', 'DM failed']);
  saved.LAST_NOTICE = JSON.stringify({ at: 0, text: 'old' });
  eq(bot.recentNotice_(props, []), '');
});

// =============================================================================================================
// The post itself (Post.gs), the whole video and audio (Media.gs), the screenshot in the Social Alert, the KOF ❌ checks
// =============================================================================================================

const POSTS = require('./posts.json');  // real responses from X's embed endpoint, Bluesky's public API and TikTok's oEmbed
const X_API = id => `https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${B.xEmbedToken_(id)}`;
const BSKY_API = (who, rk) => 'https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=' +
  `${encodeURIComponent(`at://${who}/app.bsky.feed.post/${rk}`)}&depth=0&parentHeight=2`;
const SHOT = 'https://api.screenshotmachine.com?key=813bd0&url=https%3A%2F%2Fx.com%2FICannot_Enough%2Fstatus%2F2111814207448514693' +
  '&device=desktop&dimension=1024x768&format=png&delay=2000';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const withShot = text => `${text}\n\nPlease note: screenshots are not available for Reddit, TikTok, Facebook, YouTube or Instagram.\n\n${SHOT}`;

test('Post.gs: the post itself from X and Bluesky public data (thread, quote, video files), TikTok captions, post ids', () => {
  const fu = B.xPostFromEmbed_(POSTS.x_followup);
  eq([fu.author, fu.reply_to.author, fu.thread_ids], ['ICannot_Enough', 'Ground_Signal', ['2111839363516756085', '2111814207448514693']]);
  const orig = B.xPostFromEmbed_(POSTS.x_original);
  eq([orig.video.duration_s, orig.video.variants.map(v => v.bitrate), orig.quoted.author, orig.thread_ids],
    [193, [2176000, 832000, 256000], 'ethanteicher', []]);  // 1080p (10 Mbps) is never needed: Gemini samples at low resolution
  assert.ok(orig.text.includes('<checks notes>'), orig.text);
  const bv = B.bskyPostFromThread_(POSTS.bsky_video.thread);
  eq([bv.platform, bv.id, bv.video.size, bv.video.did], ['Bluesky', '3mobtlvo7ec25', 6665627, 'did:plc:udnac33pmf2iwcblpeai5a5p']);
  const bq = B.bskyPostFromThread_(POSTS.bsky_quote.thread);
  eq([bq.quoted.author, bq.quoted.id, bq.video], ['theverge.com', '3mpvrzaqy422r', null]);
  const tt = B.tiktokPostFromOembed_(POSTS.tiktok_oembed, 'https://www.tiktok.com/@moreperfectunion/video/7551106238768090399');
  eq([tt.platform, tt.author, /data centers/.test(tt.text), /^https:/.test(tt.thumbnail), tt.video], ['TikTok', 'moreperfectunion', true, true, null]);
  eq([B.postIdOf_('https://x.com/a/status/123456789?s=20'), B.postIdOf_('https://bsky.app/profile/did:plc:x/post/3mobtlvo7ec25'),
    B.postIdOf_('https://www.instagram.com/p/DOsB-Trk_TW')], ['123456789', '3mobtlvo7ec25', '']);
  eq(B.extractPostIdFromUrl_('https://bsky.app/profile/did:plc:763ol76nichmx2jeatobsflu/post/3lz3jp7hssh2j'), '3lz3jp7hssh2j');  // was "profile"

  // lookupPost_ on (fake) live endpoints; Bluesky's video file comes from the author's own server
  const g = makeGoogle(NOW);
  const bot = loadBot(g.services, g.clock);
  g.pages.set(X_API('2111840627885252950'), JSON.stringify(POSTS.x_followup));
  g.pages.set(BSKY_API('iwillnotbesilenced.bsky.social', '3mobtlvo7ec25'), JSON.stringify(POSTS.bsky_video));
  g.pages.set('https://plc.directory/did:plc:udnac33pmf2iwcblpeai5a5p', JSON.stringify(POSTS.bsky_plc));
  eq(bot.lookupPost_('https://x.com/ICannot_Enough/status/2111840627885252950').thread_ids[1], '2111814207448514693');
  assert.match(bot.lookupPost_('https://bsky.app/profile/iwillnotbesilenced.bsky.social/post/3mobtlvo7ec25').video.url,
    /^https:\/\/scarletina\.us-east\.host\.bsky\.network\/xrpc\/com\.atproto\.sync\.getBlob\?did=did%3Aplc%3Audnac33pmf2iwcblpeai5a5p&cid=bafkrei/);
  eq([bot.lookupPost_('https://www.reddit.com/r/x/comments/abc/def/'), bot.lookupPost_('https://x.com/nobody/status/999999999')], [null, null]);
});

test('feed text: for posts the bot can\'t open (Instagram, Facebook, Reddit), Gemini checks the write-up against the post as Pendulum and Brandwatch captured it, read from BigQuery (never the Brandwatch API)', () => {
  // 1. Post ids: Reddit's sits before the title slug; TikTok photo posts
  eq([B.extractPostIdFromUrl_('https://www.reddit.com/r/GooglePixel/comments/1x9vsi4/pixel_10_pro_gps_rma/'),
    B.extractPostIdFromUrl_('https://www.tiktok.com/@yummyidn/photo/7698237093679533332'),
    B.extractPostIdFromUrl_('https://instagram.com/p/DenPSReF9id')], ['1x9vsi4', '7698237093679533332', 'DenPSReF9id']);

  // 2. Pendulum's pieces of the post's text: post text, title, OCR, transcript, image description, then anything else;
  //    no blanks, no repeats, capped
  const pieces = B.parseFeedSnippets_(JSON.stringify([
    { source: 'image_caption', text: 'A man typing on a laptop.' },
    { source: 'ocr', text: 'Man Considers Himself A Hacker' },
    { source: 'description', text: '  Read the article   at BabylonBee.com ' },
    { source: 'ocr', text: 'man considers himself a hacker' },
    { source: 'transcript', text: '   ' },
    { source: 'other_source', text: 'x' },
  ]));
  eq(pieces.map(p => [p.source, p.text]), [['description', 'Read the article at BabylonBee.com'], ['ocr', 'Man Considers Himself A Hacker'],
    ['image_caption', 'A man typing on a laptop.'], ['other_source', 'x']]);
  eq([B.parseFeedSnippets_('not json'), B.parseFeedSnippets_(null), B.parseFeedSnippets_('{"a":1}')], [[], [], []]);
  const long = B.parseFeedSnippets_(JSON.stringify([{ source: 'description', text: 'a'.repeat(5000) }, { source: 'ocr', text: 'b' }]));
  eq([long.length, long[0].text.length <= B.ev('FEED_TEXT_MAX_')], [1, true]);

  // 3. Gemini's prompt: each piece with where it was found, Brandwatch's copy, and Pendulum's summary as another AI's reading
  const parsed = B.parseAlert_(F.MISTAKES);
  parsed.bq = { feed_snippets: pieces.slice(0, 3), bmie_snippet: 'You can now create drone-style footage', feed_summary: 'Instagram user x posted a meme.',
    feed_issue_name: 'Meme about Gmail passwords' };
  const sys = B.assessPrompts_(parsed, null).system;
  assert.match(sys, /THE POST AS THE LISTENING FEEDS CAPTURED IT/);
  assert.match(sys, /- Post text: "Read the article at BabylonBee\.com"/);
  assert.match(sys, /- Text in the image or video \(read off it\): "Man Considers Himself A Hacker"/);
  assert.match(sys, /- What the image shows \(a machine description\): "A man typing on a laptop\."/);
  assert.match(sys, /- Post text as Brandwatch captured it: "You can now create drone-style footage"/);
  assert.match(sys, /- Pendulum's own summary \(another AI's reading of the post, not the post\): "Instagram user x posted a meme\."/);
  assert.match(sys, /- Pendulum's issue name: "Meme about Gmail passwords"/);
  assert.ok(sys.indexOf('LISTENING FEEDS') > sys.indexOf('WEB SEARCH'));  // after the post's own data, before earlier alerts
  parsed.bq = { feed_post_text: 'We filed multiple support tickets' };  // only Burson's collection copy
  assert.match(B.assessPrompts_(parsed, null).system, /- Post text \(as Burson's collection stored it\): "We filed multiple support tickets"/);
  parsed.bq = { sonar_interactions: 5 };
  assert.ok(!/LISTENING FEEDS/.test(B.assessPrompts_(parsed, null).system));  // nothing from the feeds: no section
  eq([B.feedBrief_({ feed_snippets: pieces.slice(0, 2), feed_summary: 's', bmie_snippet: 'x' }), B.feedBrief_({ feed_post_text: 't' }), B.feedBrief_(null)],
    ['Pendulum: description, ocr · Pendulum summary · Brandwatch', "Burson's collection: post text", '']);

  // 4. The lookups (fake BigQuery): Pendulum's table (us-central1) and Google's Brandwatch alert table (US), matched on the
  //    post id inside a Reddit link; every request goes to BigQuery
  const g = makeGoogle(NOW);
  const calls = [];
  const origFetch = g.services.UrlFetchApp.fetch;
  g.services.UrlFetchApp.fetch = (url, params) => {
    if (!String(url).startsWith('https://bigquery.googleapis.com/')) return origFetch(url, params);
    const body = JSON.parse(params.payload);
    calls.push({ url, location: body.location || 'US', sql: body.query, params: body.queryParameters || [] });
    const central = body.location === 'us-central1';
    const cols = central
      ? [['sonar_summary', 'Reddit user asks about GPS on the Pixel 10.'], ['sonar_issue_name', 'Pixel 10 GPS'],
        ['sonar_snippets_json', JSON.stringify([{ source: 'description', text: 'My Pixel 10 Pro GPS is broken, RMA?' }])],
        ['sonar_interactions', '12', 'INTEGER']]
      : [['bmie_snippet', 'Pixel 10 Pro GPS broken'], ['bmie_alert_source', 'Today in Android']];
    return {
      getResponseCode: () => 200, getHeaders: () => ({}),
      getContentText: () => JSON.stringify({ jobComplete: true, schema: { fields: cols.map(c => ({ name: c[0], type: c[2] || 'STRING' })) },
        rows: [{ f: cols.map(c => ({ v: c[1] })) }] }),
    };
  };
  const bot = loadBot(g.services, g.clock);
  const reddit = bot.parseAlert_(F.MISTAKES.replace('https://x.com/edervolcelazz/status/2109566527900926417',
    'https://www.reddit.com/r/GooglePixel/comments/1x9vsi4/pixel_10_pro_gps_rma/'));
  const enr = bot.enrichAlertFromBigQuery_(reddit, bot.ev('GEN').settings);
  eq([enr.feed_summary, enr.feed_issue_name, enr.feed_snippets.map(s => s.text), enr.bmie_snippet, enr.sonar_interactions],
    ['Reddit user asks about GPS on the Pixel 10.', 'Pixel 10 GPS', ['My Pixel 10 Pro GPS is broken, RMA?'],
      'Pixel 10 Pro GPS broken', 12]);
  eq(calls.map(c => [c.url.startsWith('https://bigquery.googleapis.com/'), c.location]), [[true, 'US'], [true, 'us-central1']]);
  const central = calls[1];
  assert.match(central.sql, /JSON_VALUE\(payload, "\$\.detail\.post\.snippet\.text"\)/);
  assert.match(central.sql, /STRPOS\(post_url, CONCAT\("\/", @post_id, "\/"\)\) > 0/);
  eq(central.params.find(p => p.name === 'post_id').parameterValue.value, '1x9vsi4');
  assert.match(calls[0].sql, /COALESCE\(dsd\.snippet, bwm\.snippet\)/);
  assert.match(B.feedTextPrompt_(enr), /- Post text: "My Pixel 10 Pro GPS is broken, RMA\?"\n- Post text as Brandwatch captured it: "Pixel 10 Pro GPS broken"/);

  // 5. Burson never hears where the bot got it: Gemini is told not to name the feeds, and the guard holds back anything that does
  assert.match(sys, /never mention these feeds, Pendulum, Brandwatch or BigQuery/);
  for (const t of ['Pendulum\'s summary says the video is about Chrome.', 'Per BigQuery, the post is from 2024.', 'The listening feed shows no link.']) {
    assert.ok(B.guardHits_(t, GUARD).length, t);
  }
});

test('Media.gs: Gemini gets the whole video: the largest file Vertex AI can read from its link (15 MB), else a Cloud Storage copy deleted after the review, else a frame', () => {
  const post = B.xPostFromEmbed_(POSTS.x_original);
  const real = { '1280x720': 18399254, '640x360': 6664800, '480x270': 2600117 };  // X's actual file sizes for this video
  const sizeOf = url => real[Object.keys(real).find(k => url.includes(k))];
  const m = B.mediaFor_({ post_url: post.url }, null, { post, sizeOf });
  eq([m.kind, m.label, m.uri.includes('640x360'), m.duration_s, m.staged], ['video', 'the post\'s video (3:13 long)', true, 193, undefined]);
  // 25 minutes: every file is over 15 MB, so the smallest goes to Cloud Storage for the review
  const long = Object.assign({}, post, { video: Object.assign({}, post.video, { duration_s: 1500 }) });
  const copies = [];
  const big = B.mediaFor_({ post_url: post.url }, null, { post: long, sizeOf: () => null,
    stage: (url, mime) => { copies.push([url, mime]); return 'gs://bucket/burson-qa-bot/staging/1.mp4'; } });
  eq([big.uri, big.staged, copies.length, copies[0][0].includes('480x270'), copies[0][1]],
    ['gs://bucket/burson-qa-bot/staging/1.mp4', ['gs://bucket/burson-qa-bot/staging/1.mp4'], 1, true, 'video/mp4']);
  // No bucket (or over 50 MB): a frame of the video instead, as its bytes (H4: never an image link)
  const img = url => ({ base64: 'QUJD', bytes: 3, mimeType: /\.png/.test(url) ? 'image/png' : 'image/jpeg' });
  const frame = B.mediaFor_({ post_url: post.url }, null, { post: long, sizeOf: () => null, stage: () => '', fetchBinary: img });
  eq([frame.kind, frame.uri, frame.parts, frame.label], ['image', post.video.poster, [{ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }],
    'a frame from the post\'s video (the video itself couldn\'t be attached)']);
  // 38 minutes: the smallest file's bitrate says 73 MB, its real size (checked once) is 31 MB: copied, watched in full
  const asked = [];
  const hour = Object.assign({}, post, { video: Object.assign({}, post.video, { duration_s: 2293 }) });
  const copied = B.mediaFor_({ post_url: post.url }, null, { post: hour, sizeOf: url => { asked.push(url); return url.includes('480x270') ? 31000000 : null; },
    stage: url => (url.includes('480x270') ? 'gs://bucket/burson-qa-bot/staging/2.mp4' : '') });
  eq([copied.kind, copied.uri, copied.duration_s, asked.length, asked[0].includes('480x270')], ['video', 'gs://bucket/burson-qa-bot/staging/2.mp4', 2293, 1, true]);
  // Two hours: even the smallest file is far over 50 MB: a frame, without checking sizes
  const twoHours = Object.assign({}, post, { video: Object.assign({}, post.video, { duration_s: 7200 }) });
  const none = [];
  eq([B.mediaFor_({ post_url: post.url }, null, { post: twoHours, sizeOf: url => { none.push(url); return null; }, stage: () => 'gs://b/x.mp4', fetchBinary: img }).kind, none.length],
    ['image', 0]);
  // Photos; a TikTok cover; YouTube is still watched directly
  eq(B.mediaFor_({ post_url: 'https://x.com/a/status/1' }, null, { post: { platform: 'X', photos: ['https://pbs.twimg.com/media/a.jpg', 'https://pbs.twimg.com/media/b.png'] }, fetchBinary: img }).parts
    .map(p => p.inlineData.mimeType), ['image/jpeg', 'image/png']);
  eq(B.mediaFor_({ post_url: 'https://www.tiktok.com/@a/video/1' }, null,
    { post: B.tiktokPostFromOembed_(POSTS.tiktok_oembed, 'https://www.tiktok.com/@a/video/1'), fetchBinary: img }).label, 'the video\'s cover image');

  // End to end: the copy is made, Gemini reads it from gs://, watches all of it, and the copy is deleted right after
  const w = world({ drafts: STAND_IN, post: () => long });
  w.g.pages.set(long.video.variants[2].url, { bytes: Buffer.alloc(2048, 7), headers: { 'Content-Type': 'video/mp4' } });
  w.vertex.assess = () => ({ checks: [], media_review: { watched: true, duration_seconds: 1500, what_happens: 'A compilation of stalled Waymos, ending with a satirical song' } });
  w.paste(F.WAYMO_KOF);
  w.run();
  const call = w.vertex.calls[0].payload;
  const uri = call.contents[0].parts[0].fileData.fileUri;
  assert.match(uri, /^gs:\/\/brand-social-central-data-slrr-automations\/burson-qa-bot\/staging\/\d+-[a-z0-9]+\.mp4$/);
  eq(call.generationConfig.mediaResolution, 'MEDIA_RESOLUTION_LOW');
  assert.match(call.systemInstruction.parts[0].text, /attached above is the post's video \(25:00 long\)\. Watch and listen to all of it, start to finish/);
  const name = encodeURIComponent(uri.replace('gs://brand-social-central-data-slrr-automations/', ''));
  eq(w.g.fetches.filter(f => f.url.startsWith('https://storage.googleapis.com/')).map(f => [f.method, f.url.includes(name)]), [['post', true], ['delete', true]]);
  assert.match(w.analystPosts()[0].text, /QA: Gemini watched and listened to the post's video \(25:00 long\): A compilation of stalled Waymos/);
  // Only the bot's own staging copies are ever deleted
  const g = makeGoogle(NOW);
  const bot = loadBot(g.services, g.clock);
  bot.unstageMedia_(['gs://b/burson-qa-bot/staging/1.mp4', 'gs://b/pipelines/keep.mp4', 'https://x.com/a']);
  eq(g.fetches.map(f => [f.method, f.url]), [['delete', 'https://storage.googleapis.com/storage/v1/b/b/o/burson-qa-bot%2Fstaging%2F1.mp4']]);
});

test('Social Alert emails carry the screenshot of the post (Burson\'s screenshot link), inline under the summary; T&S Yes still works on that draft', () => {
  const text = withShot(F.WAYMO_KOF);
  const parsed = B.parseAlert_(text);
  eq([parsed.extra.screenshot_url, parsed.fields.post_url], [SHOT, 'https://x.com/ICannot_Enough/status/2111814207448514693']);
  const noLink = B.parseAlert_(text.replace(/\[Link\]:[^\n]*\n/, '')).fields.post_url;
  assert.ok(!/screenshotmachine/.test(String(noLink || '')), noLink);  // never the post's link
  const w = world({ drafts: STAND_IN });
  w.g.pages.set(SHOT, { bytes: PNG, headers: { 'Content-Type': 'image/png' } });
  const msg = w.paste(text);
  w.run();
  const [sent] = w.gmail.sentMessages();
  eq([sent.inline.length, sent.inline[0].cid, sent.inline[0].mime, sent.inline[0].base64], [1, 'post-screenshot', 'image/png', PNG.toString('base64')]);
  assert.match(sent.html, /<img src="cid:post-screenshot" alt="Screenshot of the post"/);
  assert.match(sent.mime, /^Content-Type: multipart\/related; boundary="bqr-[^"]+"; type="multipart\/alternative"\r$/m);
  assert.match(sent.text, /\n\nWould have gone to: /);  // the plain-text copy and the footer are unchanged
  eq(w.chat.botReactions(msg.name), ['📰', '📦']);
  // The screenshot can't be fetched: the email goes without it
  const v = world({ drafts: STAND_IN });
  v.paste(text);
  v.run();
  eq([v.gmail.sentMessages().length, v.gmail.sentMessages()[0].inline.length, /cid:post-screenshot/.test(v.gmail.sentMessages()[0].html)], [1, 0, false]);
  // ✍️ on a draft with the screenshot (multipart/related around multipart/alternative): only the T&S row changes
  const input = w.alertRows()[0].email_input;
  const shot = { cid: 'post-screenshot', mime: 'image/png', name: 'post.png', base64: PNG.toString('base64'), label: 'Screenshot of the post' };
  const email = B.socialAlertEmail_(input, B.planRecipients_(input.escalation, input.escalation.text, []), { test: true, mailbox: 'bot@runner.test', screenshot: shot });
  const raw = B.buildMime_({ from: 'Brand Social <bot@runner.test>', to: email.to, subject: email.subject, text: email.text, html: email.html, inline: email.inline });
  const yes = decodeMime(Buffer.from(B.setTnsInMime_(raw, 'Yes'), 'utf8').toString('base64url'));
  eq([/^T&S: Yes$/m.test(yes.text), /T&(?:amp;)?S<\/td><td[^>]*>Yes</.test(yes.html), yes.inline[0].base64], [true, true, PNG.toString('base64')]);
});

test('Gemini can\'t open the video (too long, private, blocked): it looks at a still picture of the post (Burson\'s screenshot, else a frame of the video), then the alert text alone', () => {
  const post = B.xPostFromEmbed_(POSTS.x_original);
  const tried = (w, refuse) => {
    const seen = [];
    w.vertex.fail = payload => {
      const media = payload.contents[0].parts.filter(p => p.fileData || p.inlineData)
        .map(p => (p.fileData ? p.fileData.mimeType : `inline ${p.inlineData.mimeType}`));
      seen.push(media.join(',') || 'text');
      return media.some(refuse) ? { code: 400, body: { error: { message: 'The video is too long' } } } : null;
    };
    w.vertex.assess = () => ({ checks: [], media_review: { watched: true, what_happens: 'A stalled Waymo blocking a street' } });
    return seen;
  };
  // The video is refused: Burson's screenshot instead
  const w = world({ drafts: STAND_IN, post: () => post });
  w.g.pages.set(SHOT, { bytes: PNG, headers: { 'Content-Type': 'image/png' } });
  const seen = tried(w, m => m.startsWith('video/'));
  w.paste(withShot(F.WAYMO_KOF));
  w.run();
  eq(seen, ['video/mp4', 'inline image/png']);
  assert.match(w.analystPosts()[0].text, /QA: Gemini looked at a screenshot of the post \(Burson's\): A stalled Waymo/);
  // No screenshot: a frame of the video (downloaded: it goes as its bytes); every picture refused: the alert text alone
  // (and no "looked at" note)
  const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0xff, 0xd9]);
  const v = world({ drafts: STAND_IN, post: () => post });
  v.g.pages.set(post.video.poster, { bytes: JPG, headers: { 'Content-Type': 'image/jpeg' } });
  const seenV = tried(v, m => m.startsWith('video/'));
  v.paste(F.WAYMO_KOF);
  v.run();
  eq(seenV, ['video/mp4', 'inline image/jpeg']);
  assert.match(v.analystPosts()[0].text, /Gemini looked at a frame from the post's video \(the video itself couldn't be reviewed\): A stalled Waymo/);
  const u = world({ drafts: STAND_IN, post: () => post });
  u.g.pages.set(post.video.poster, { bytes: JPG, headers: { 'Content-Type': 'image/jpeg' } });
  const seenU = tried(u, () => true);
  u.paste(F.WAYMO_KOF);
  u.run();
  eq([seenU, /Gemini (?:looked at|watched)/.test(u.analystPosts()[0].text), u.gmail.sentMessages().length], [['video/mp4', 'inline image/jpeg', 'text'], false, 1]);
});

// Burson's screenshot of an Instagram post (signed out): Instagram's welcome and sign-in prompt over the post
const IG_SHOT = 'https://api.screenshotmachine.com?key=813bd0&url=https%3A%2F%2Fwww.instagram.com%2Fp%2FDenPQ0sDPMi' +
  '&device=desktop&dimension=1024x768&format=png&delay=2000';
const IG_EMBED = 'https://www.instagram.com/p/DenPQ0sDPMi/embed/captioned/';
const IG_IMG = 'https://scontent-iad3-1.cdninstagram.com/v/t51.2885-15/post_n.jpg?stp=dst-jpg_e35_p1080x1080&_nc_ht=x&oh=00_AB&oe=6720';
const IG_IMG_SMALL = IG_IMG.replace('p1080x1080', 'p640x640');
// Instagram's public embed page for a post (the page embedded posts load), trimmed to what the bot reads
const igEmbedHtml = o => {
  const x = Object.assign({ img: IG_IMG, small: IG_IMG_SMALL, comments: true, caption: 'Google is secretly recording your ' +
    'audio &amp; feeding ad targeting profiles. Here&#39;s how to turn it off' }, o || {});
  const amp = s => s.replace(/&/g, '&amp;');
  return '<!DOCTYPE html><html><head><title>Instagram</title></head><body><div class="Embed " data-media-id="1">' +
    '<div class="Header"><a class="Avatar InsideRing" href="https://www.instagram.com/andrewjpdiaz/"><img ' +
    'src="https://scontent.cdninstagram.com/avatar.jpg" alt="andrewjpdiaz"></a><div class="HeaderText"><a class="Username" ' +
    'href="https://www.instagram.com/andrewjpdiaz/"><span class="UsernameText">andrewjpdiaz</span></a></div></div>' +
    (x.img ? '<div class="EmbeddedMedia"><a class="EmbeddedMedia" href="https://www.instagram.com/p/DenPQ0sDPMi/"><img ' +
      `class="EmbeddedMediaImage" alt="Photo by Andrew" src="${amp(x.small)}" srcset="${amp(x.small)} 640w,${amp(x.img)} 1080w" />` +
      '</a></div>' : '') + (x.extra || '') +
    (x.caption ? '<div class="Caption"><a class="CaptionUsername" href="https://www.instagram.com/andrewjpdiaz/">andrewjpdiaz</a>' +
      `<br /><br />${x.caption}${x.comments ? '<div class="CaptionComments">View all 312 comments</div>' : ''}</div>` : '') +
    '</div></body></html>';
};
const IG_TEXT = `${ANDREW}\n\nPlease note: screenshots are not available for Reddit, TikTok, Facebook, YouTube or Instagram.\n\n${IG_SHOT}`;

test('Burson\'s screenshot of a platform that shows a sign-in prompt to anyone not signed in (Instagram, Facebook, Threads, LinkedIn, TikTok, Reddit, YouTube) is never used; X\'s and Bluesky\'s still are', () => {
  eq([B.screenshotTarget_(IG_SHOT), B.screenshotTarget_(SHOT), B.screenshotTarget_('https://api.screenshotmachine.com?key=1'),
    B.screenshotTarget_('https://api.screenshotmachine.com?url=%E0%A4%A&key=1')],
  ['https://www.instagram.com/p/DenPQ0sDPMi', 'https://x.com/ICannot_Enough/status/2111814207448514693', '', '']);
  const walled = (shot, fields) => B.screenshotSignInWalled_(shot, fields);
  const shotOf = url => `https://api.screenshotmachine.com?key=1&url=${encodeURIComponent(url)}`;
  eq([
    walled(IG_SHOT, {}), walled(SHOT, {}), walled(SHOT, { social_network: 'Instagram' }),  // the screenshot's own page wins
    walled(shotOf('https://m.facebook.com/story.php?id=1'), {}), walled(shotOf('https://www.threads.com/@a/post/B'), {}),
    walled(shotOf('https://www.linkedin.com/posts/a'), {}), walled(shotOf('https://www.tiktok.com/@a/video/1'), {}),
    walled(shotOf('https://old.reddit.com/r/a/comments/1'), {}), walled(shotOf('https://youtu.be/nSwmcs37Jd4'), {}),
    walled(shotOf('https://bsky.app/profile/a/post/3mobtlvo7ec25'), {}),
    // no page in the link (or one that can't be read): the alert's link, else its network (Burson's names and aliases)
    walled('https://api.screenshotmachine.com?key=1', { post_url: 'https://www.instagram.com/p/DenPQ0sDPMi' }),
    walled('https://api.screenshotmachine.com?url=%E0%A4%A&key=1', { social_network: 'IG' }),
    walled('https://api.screenshotmachine.com?key=1', { social_network: 'X' }),
    // a page the bot doesn't know as a network (a short link, a link encoded twice): the alert's link, else its network
    walled(shotOf('https://instagr.am/p/DenPQ0sDPMi'), { post_url: 'https://www.instagram.com/p/DenPQ0sDPMi' }),
    walled(`https://api.screenshotmachine.com?key=1&url=${encodeURIComponent(encodeURIComponent('https://www.instagram.com/p/DenPQ0sDPMi'))}`, { social_network: 'instagram' }),
    walled(shotOf('https://www.nytimes.com/2026/10/21/tech/google.html'), { post_url: 'https://www.nytimes.com/2026/10/21/tech/google.html', social_network: 'News' }),
  ], [true, false, false, true, true, true, true, true, true, false, true, true, false, true, true, false]);
  const parsed = B.parseAlert_(IG_TEXT);
  eq([parsed.extra.screenshot_url, parsed.fields.post_url, B.bursonScreenshotUrl_(parsed)], [IG_SHOT, 'https://www.instagram.com/p/DenPQ0sDPMi', '']);
  eq(B.bursonScreenshotUrl_(B.parseAlert_(withShot(F.WAYMO_KOF))), SHOT);
  // The email's picture: the post's own image when the bot has it, else none (never the sign-in prompt)
  eq(B.screenshotFor_(parsed), null);
  parsed.post = B.instagramPostFromEmbed_(igEmbedHtml(), parsed.fields.post_url, 'DenPQ0sDPMi');
  eq(B.screenshotFor_(parsed), { url: IG_IMG, label: 'Image from the post' });
  // A queued email (saved before this change) with Burson's Instagram screenshot: dropped; X's kept; the post's image kept
  const input = (url, net) => ({ fields: { post_url: 'https://www.instagram.com/p/DenPQ0sDPMi', social_network: net || 'Instagram' },
    screenshot: { url, label: 'Screenshot of the post' } });
  eq([B.savedScreenshot_(input(IG_SHOT)), B.savedScreenshot_(input('https://api.screenshotmachine.com?key=1')),
    B.savedScreenshot_(input(SHOT, 'X')).url, B.savedScreenshot_(input(IG_IMG)).url, B.savedScreenshot_({}),
    B.savedScreenshot_({ escalation: { platform: 'Instagram' }, screenshot: { url: 'https://api.screenshotmachine.com?key=1' } })],
  [null, null, SHOT, IG_IMG, null, null]);
  eq([B.tnsFormValues_(input(IG_SHOT)).notes, B.tnsFormValues_(input(SHOT, 'X')).notes], ['', `Screenshot of the post: ${SHOT}`]);
  const g = makeGoogle(NOW);
  const bot = loadBot(g.services, g.clock);
  g.pages.set(IG_SHOT, { bytes: PNG, headers: { 'Content-Type': 'image/png' } });
  eq([bot.emailScreenshot_(input(IG_SHOT)), g.fetches.length], [null, 0]);  // never even fetched
});

test('Post.gs: an Instagram post from its public embed page (its first image or a reel\'s cover, author, caption); the sign-in page or an empty shell is null; a link preview\'s user agent; cached', () => {
  eq([B.igCode_('https://www.instagram.com/p/DenPQ0sDPMi'), B.igCode_('https://instagram.com/reel/DemYWfcCMiM/?igsh=x'),
    B.igCode_('https://www.instagram.com/ryankellycomedy/reel/DenONU1O4fm/'), B.igCode_('https://www.instagram.com/tv/CdE12fg/'),
    B.igCode_('https://www.instagram.com/andrewjpdiaz/'), B.igCode_('https://www.instagram.com/stories/a/3111/'),
    B.igCode_('https://x.com/a/status/1'), B.igCode_('https://www.instagram.com/reels/audio/1234567890/')],
  ['DenPQ0sDPMi', 'DemYWfcCMiM', 'DenONU1O4fm', 'CdE12fg', '', '', '', '']);
  const url = 'https://www.instagram.com/p/DenPQ0sDPMi';
  const post = B.instagramPostFromEmbed_(igEmbedHtml(), url, 'DenPQ0sDPMi');
  eq(post, { platform: 'Instagram', id: 'DenPQ0sDPMi', url, author: 'andrewjpdiaz',
    text: 'Google is secretly recording your audio & feeding ad targeting profiles. Here\'s how to turn it off',
    photos: [IG_IMG], thumbnail: '', video: null, reply_to: null, parent: null, quoted: null, thread_ids: [] });
  // A reel: its cover is the thumbnail (Instagram shows the video only to people signed in)
  const reel = B.instagramPostFromEmbed_(igEmbedHtml(), 'https://www.instagram.com/reel/DemYWfcCMiM/', 'DemYWfcCMiM');
  eq([reel.photos, reel.thumbnail], [[], IG_IMG]);
  eq(B.instagramPostFromEmbed_(igEmbedHtml({ extra: '<span class="WatchOnInstagram">Watch on Instagram</span>' }), url, 'x').thumbnail, IG_IMG);
  // A photo is still a photo when the page's data mentions a video elsewhere; a caption with no comments line is read
  const mixed = B.instagramPostFromEmbed_(igEmbedHtml({ comments: false, extra: '<script>{"is_video":true}</script>' }), url, 'x');
  eq([mixed.photos, mixed.thumbnail, mixed.text], [[IG_IMG], '', post.text]);
  // Only Instagram's own images; the caption alone still counts; the sign-in page, a shell, nothing: null
  eq(B.instagramPostFromEmbed_(igEmbedHtml({ img: 'https://evil.example/x.jpg', small: 'https://evil.example/s.jpg' }), url, 'x').photos, []);
  const placeholder = 'https://static.cdninstagram.com/rsrc.php/v4/yR/r/placeholder.png';
  eq(B.instagramPostFromEmbed_(igEmbedHtml({ img: placeholder, small: placeholder }), url, 'x').photos, []);
  eq([B.instagramPostFromEmbed_(igEmbedHtml({ img: '' }), url, 'x').text.slice(0, 18), B.instagramPostFromEmbed_(igEmbedHtml({ img: '', caption: '' }), url, 'x'),
    B.instagramPostFromEmbed_('<html><head><title>Login • Instagram</title></head><body><div id="react-root"></div></body></html>', url, 'x'),
    B.instagramPostFromEmbed_('<div class="EmbedIsBroken">This post is unavailable</div>', url, 'x'), B.instagramPostFromEmbed_('', url, 'x')],
  ['Google is secretly', null, null, null, null]);
  // lookupPost_: one fetch of the embed page as a link preview (no redirects: a redirect is the sign-in page), then cached
  const g = makeGoogle(NOW);
  const bot = loadBot(g.services, g.clock);
  g.pages.set(IG_EMBED, igEmbedHtml());
  eq([bot.lookupPost_(url).photos, bot.lookupPost_(`${url}/?igsh=abc`).author], [[IG_IMG], 'andrewjpdiaz']);
  eq(g.fetches.map(f => [f.url, /^facebookexternalhit\//.test(f.headers['User-Agent'])]), [[IG_EMBED, true]]);
  const h = makeGoogle(NOW);
  const shut = loadBot(h.services, h.clock);
  h.pages.set(IG_EMBED, { code: 302, body: '', headers: { Location: 'https://www.instagram.com/accounts/login/' } });
  eq([shut.lookupPost_(url), shut.lookupPost_(url), h.fetches.length], [null, null, 2]);  // a null isn't cached
  // A redirect to the post's own embed page (a reel's, also as a path alone) is followed, once: a reel linked as /p/ is a video
  const REEL_EMBED = 'https://www.instagram.com/reel/DemYWfcCMiM/embed/captioned/';
  const P_EMBED = 'https://www.instagram.com/p/DemYWfcCMiM/embed/captioned/';
  [REEL_EMBED, '/reel/DemYWfcCMiM/embed/captioned/'].forEach(location => {
    const k = makeGoogle(NOW);
    const moved = loadBot(k.services, k.clock);
    k.pages.set(P_EMBED, { code: 301, body: '', headers: { location } });
    k.pages.set(REEL_EMBED, igEmbedHtml());
    const got = moved.lookupPost_('https://www.instagram.com/p/DemYWfcCMiM/');
    eq([got.photos, got.thumbnail, moved.lookupPost_('https://www.instagram.com/reel/DemYWfcCMiM/').thumbnail, k.fetches.map(f => f.url)],
      [[], IG_IMG, IG_IMG, [P_EMBED, REEL_EMBED]], location);
  });
  const login = makeGoogle(NOW);
  const walledBot = loadBot(login.services, login.clock);
  login.pages.set(P_EMBED, { code: 302, body: '', headers: { location: '/accounts/login/?next=%2Fp%2FDemYWfcCMiM%2F' } });
  eq([walledBot.lookupPost_('https://www.instagram.com/p/DemYWfcCMiM/'), login.fetches.length], [null, 1]);
  eq(shut.lookupPost_('https://www.instagram.com/andrewjpdiaz/'), null);
  // Gemini's prompt: no counts (the embed page has none), and that only the first image is shown
  const prompt = B.postPrompt_(post);
  assert.match(prompt, /- Instagram post by @andrewjpdiaz: "Google is secretly recording your audio & feeding/);
  assert.ok(!/likes/.test(prompt), prompt);
  assert.match(prompt, /- Media: 1 photo \(Instagram shows only the first one to anyone not signed in: the post may have more\)/);
  assert.match(B.postPrompt_(reel), /- Media: a video \(Instagram shows only its cover image to anyone not signed in\)/);
  // The page fallback skips Instagram's and Facebook's own logo (their sign-in pages' og:image)
  const logo = '<meta property="og:image" content="https://static.cdninstagram.com/rsrc.php/v4/yR/r/logo.png">';
  eq([B.pageMedia_(url, () => logo), B.pageMedia_(url, () => logo.replace('static.cdninstagram.com/rsrc.php/v4/yR/r/logo.png', 'scontent.cdninstagram.com/v/p.jpg'))],
    [null, { url: 'https://scontent.cdninstagram.com/v/p.jpg', mime: 'image/jpeg' }]);
});

test('the user\'s Instagram alert (2026-10-21) with Burson\'s screenshot of Instagram\'s sign-in prompt: neither the email nor Gemini gets it; with the post\'s own image, the email shows that', () => {
  // Instagram won't show the post to Google's servers: no picture at all, and the run log says why
  const w = world({ drafts: STAND_IN });
  w.g.pages.set(IG_SHOT, { bytes: PNG, headers: { 'Content-Type': 'image/png' } });
  w.paste(IG_TEXT);
  w.run();
  const [sent] = w.gmail.sentMessages();
  eq([sent.inline.length, /screenshot/i.test(sent.html), w.g.fetches.some(f => f.url === IG_SHOT)], [0, false, false]);
  const media = w.vertex.calls.map(c => JSON.stringify(c.payload.contents || []));
  assert.ok(!media.some(s => /inlineData|screenshotmachine/.test(s)), 'Gemini saw no screenshot');
  assert.ok(w.g.logs.some(l => l === 'Burson\'s screenshot not used: the platform shows a sign-in prompt to anyone not signed in'), w.g.logs.join('\n'));
  eq(w.alertRows()[0].email_input.screenshot, undefined);
  // Instagram shows the post: the email has its image (Gemini looks at it too), not the sign-in prompt
  const v = world({ drafts: STAND_IN, post: true });
  v.g.pages.set(IG_SHOT, { bytes: PNG, headers: { 'Content-Type': 'image/png' } });
  v.g.pages.set(IG_EMBED, igEmbedHtml());
  v.g.pages.set(IG_IMG, { bytes: PNG, headers: { 'Content-Type': 'image/jpeg' } });
  v.paste(IG_TEXT);
  v.run();
  const [email] = v.gmail.sentMessages();
  eq([email.inline.length, v.g.fetches.some(f => f.url === IG_SHOT)], [1, false]);
  assert.match(email.html, /<img src="cid:post-screenshot" alt="Image from the post"/);
  const contents = v.vertex.calls.map(c => c.payload.contents[0].parts);
  assert.ok(contents.some(parts => parts.some(p => p.inlineData && p.inlineData.data === PNG.toString('base64'))), 'Gemini looked at the post\'s image');
  assert.ok(!JSON.stringify(contents).includes(IG_IMG), 'as its bytes, never as a link (H4)');
  assert.ok(v.g.logs.some(l => l === 'Burson\'s screenshot not used: the platform shows a sign-in prompt to anyone not signed in (the email shows "Image from the post" instead)'));
});

// Nothing waits on Burson (the bot processes every alert right away with its own corrections and tells Burson)
test('no waiting on Burson, as testing runs (Social Alerts to the stand-in): a wrong alert that needs no Social Alert gets ❌ at once with the bot\'s corrections, and Burson is told what changed and that it\'s processed; Burson\'s resend anyway isn\'t processed twice', () => {
  const w = world({ noWait: true, drafts: STAND_IN });
  const original = w.paste(MAPS_LOW);
  w.run();
  eq(w.chat.botReactions(original.name), ['❌']);
  const [told] = w.bursonPosts();
  eq([told.text, told.thread.name], ['The alert has been updated, so there is no need to resend it. The following updates were made:\n' +
    '- Exposure Tag updated to Product - Meme about Google products.', original.thread.name]);
  const [row] = w.alertRows();
  eq([row.status, /^❌ /.test(row.decision), w.gmail.sentMessages().length], ['fix_requested', true, 0]);
  // Burson resends it anyway, fixed: the same alert (⬇️ on the original), nothing done twice: no second ❌, decision,
  // forward, email or post in Burson's thread
  const resend = w.paste(MAPS_LOW_OK);
  const r = w.run();
  eq([r.resends, w.chat.botReactions(original.name), w.chat.botReactions(resend.name)], [1, ['❌', '⬇'], []]);
  eq([w.bursonPosts().length, w.analystPosts().filter(m => !m.threadReply).length, w.gmail.sentMessages().length], [1, 1, 0]);
  eq(w.alertRows().map(x => [x.status, x.decision || '']), [['superseded', row.decision], ['fixed', row.decision]]);  // the alert's decision
  eq(w.g.logs.filter(l => /❌ no Social Alert needed/.test(l)).length, 1);
  // Asked about it in the resend's thread: the answer knows what the bot changed and that the alert was processed (❌)
  w.reply(resend, 'Is the exposure tag right on this one?');
  w.run();
  const prompt = w.vertex.calls[w.vertex.calls.length - 1].payload.contents[0].parts[0].text;
  assert.match(prompt, /Exposure Tag updated to Product - Meme about Google products\./);
  assert.match(prompt, /no escalation email is needed \(❌\)/);
  // Burson resends it again (and again): still the same alert, never processed again, nothing more said
  for (const n of [2, 3]) {
    const again = w.paste(MAPS_LOW_OK);
    eq(w.run().resends, 1, `resend ${n}`);
    eq([w.chat.botReactions(again.name), w.bursonPosts().filter(m => m.thread.name === again.thread.name).length], [[], 0], `resend ${n}`);
  }
  eq([w.analystPosts().filter(m => !m.threadReply).length, w.gmail.sentMessages().length], [1, 0]);
  eq(w.alertRows().map(x => x.status), ['superseded', 'superseded', 'superseded', 'fixed']);
  eq(w.g.logs.filter(l => /❌ no Social Alert needed/.test(l)).length, 1);
  // A missing link doesn't hold it up either: processed without it, and Burson is told
  const v = world({ noWait: true, drafts: STAND_IN });
  const noLink = v.paste(MAPS_LOW_OK.replace(/\[Link\]:[^\n]*\n/, ''));
  v.run();
  eq([v.chat.botReactions(noLink.name), /^❌ /.test(v.alertRows()[0].decision)], [['❌'], true]);
  assert.match(v.bursonPosts()[0].text, /^The alert has been updated, so there is no need to resend it\. The following updates were made:\n[\s\S]*- Link was missing\. Please include it in future alerts\.$/);
});

test('no waiting on Burson: a resend that still has a mistake is told what the bot changed; when that post fails, the next run sends it (never forwarding or deciding twice)', () => {
  const w = world({ noWait: true });
  w.paste(F.MISTAKES);
  w.run();
  let failures = 0;
  w.chat.fail = (method, path) => (method === 'post' && path === 'spaces/BURSON/messages' && failures++ < 3
    ? { code: 500, body: { error: { message: 'backend error' } } } : null);
  const partly = w.paste(F.MISTAKES_PARTLY_FIXED);
  const r1 = w.run();
  eq([r1.errors.length, w.alertRows()[1].burson_done], [1, false]);
  w.run();
  const told = w.bursonPosts().filter(m => m.thread.name === partly.thread.name);
  eq(told.map(m => m.text), ['The alert has been updated, so there is no need to resend it. The following updates were made:\n- Engagement updated to HIGH.']);
  eq([w.alertRows()[1].burson_done, w.analystPosts().filter(m => !m.threadReply).length], [true, 1]);
  w.run();
  eq(w.bursonPosts().filter(m => m.thread.name === partly.thread.name).length, 1);
});

test('no waiting on Burson: an alert whose link the bot found (Auto-find missing links) and that Burson resends twice, still without it, is decided once', () => {
  const REDDIT = 'https://www.reddit.com/r/GoogleMaps/comments/1abcde/street_view_dog/';
  const noLink = MAPS_LOW.replace(`[Link]: ${REDDIT}\n`, '');
  const w = world({ drafts: STAND_IN });
  const finder = () => ({ post_url: REDDIT, author: '', confidence: 0.97, how: 'author and issue name' });
  const run = () => { w.g.clock.now += 1000; const r = w.bot.runOnce_(Object.assign(w.ctx(), { switches: Object.assign(w.bot.switchesOff_(), { autoFindLinks: true, noWait: true }), findLink: finder })); collectBurson(w.chat, [w.BUR]); return r; };
  const original = w.paste(noLink);
  run();
  eq(w.chat.botReactions(original.name), ['❌']);
  const told = w.bursonPosts().length;
  for (const n of [1, 2]) {
    const again = w.paste(noLink);
    eq(run().resends, 1, `resend ${n}`);
    eq(w.chat.botReactions(again.name), [], `resend ${n}`);
  }
  eq([w.bursonPosts().length, w.analystPosts().filter(m => !m.threadReply).length], [told, 1]);
  eq(w.g.logs.filter(l => /❌ no Social Alert needed/.test(l)).length, 1);
});

test('no waiting on Burson for a long video\'s timestamp: the one Gemini found goes in the corrected alert, the Social Alert email and Burson\'s thread at once', () => {
  const w = world({ drafts: STAND_IN });
  // the post's video goes with the review (M7: a media_review counts only when the video was attached)
  w.g.pages.set('https://x.com/WasSamLowryEsq/status/2109952063492993159', '<meta property="og:video" content="https://video.twimg.com/v/clip.mp4">');
  w.vertex.assess = () => ({ checks: [], media_review: { watched: true, duration_seconds: 245, google_timestamp: '02:15', what_happens: 'Search comes up at 02:15' } });
  w.noWait = true;  // Never wait on Burson ON (Control row 23)
  const msg = w.paste(F.P0_OK);
  w.run();
  const [email] = w.gmail.sentMessages();
  assert.match(email.text, /\nLink: https:\/\/x\.com\/WasSamLowryEsq\/status\/2109952063492993159\nTimestamp in the video: \[02:15\]\n/);
  assert.match(email.html, /<p style="margin-top: 0; margin-bottom: 15px;">Timestamp in the video: \[02:15\]<\/p>/);
  eq(w.chat.botReactions(msg.name).slice(0, 2), ['📰', '📦']);  // sent at once (then the team emojis)
  eq(w.bursonPosts().map(m => m.text), ['The alert has been updated, so there is no need to resend it. The following updates were made:\n' +
    '- Timestamp updated to [02:15] (where Google comes up in the video).']);
  assert.match(w.analystPosts()[0].text, /\n\[Timestamp\]: \[02:15\]\n\[Link\]: https:\/\/x\.com\//);
  // Burson's alert already gives it (in the summary, or a Timestamp line): nothing added, nothing said, no extra line
  eq([B.videoStamp_({ video_timestamp: '[02:15]', summary: 'At [02:15] the user searches.' }), B.videoStamp_({ video_timestamp: ' [02:15] ' }),
    B.videoStamp_({}), B.videoStamp_({ video_timestamp: '[2:15]', summary: 'At 12:15 PM ET the user posted a video.' })],
  ['', '[02:15]', '', '[2:15]']);  // a time of day in the summary isn't a timestamp
  const r = review(F.P0_OK.replace('criticized Search', 'criticized Search at [01:40]'), { llm: { checks: [],
    media_review: { watched: true, duration_seconds: 245, google_timestamp: '02:15' } } });
  eq([r.fixes, r.missing], [[], []]);
});

test('every switch starts OFF, on a new Control tab and on one made before; the bot never sets one ON, and a SWITCH_DEFAULTS property an earlier build left changes nothing (it is left as it is)', () => {
  const B11_24 = c => c.rows.slice(10, 24).map(r => [r[0], r[1]]);
  const t = e2e();
  t.bot.setup();
  eq(B11_24(t.control()).map(r => r[1]), Array(14).fill('OFF'));
  eq([t.control().cell(11, 1), t.control().cell(16, 1)], ['Auto-send Social Alerts', 'Write back to SLRR BigQuery']);
  // A tab from before, with one switch someone turned ON, and the property a build that turned switches ON had set
  const g = makeGoogle(NOW);
  const old = e2e(g);
  old.bot.setup();
  old.control().getRange(14, 2).setValue('ON');
  const before = B11_24(old.control());
  g.props.set('SWITCH_DEFAULTS', '2');
  const now = e2e(g);
  now.poll();
  now.bot.setup();
  eq([B11_24(now.control()), g.props.get('SWITCH_DEFAULTS')], [before, '2']);
  g.props.delete('SWITCH_DEFAULTS');
  now.poll();
  eq([B11_24(now.control()), g.props.has('SWITCH_DEFAULTS')], [before, false]);
  now.control().getRange(14, 2).setValue('OFF');
  now.poll();
  eq(now.control().cell(14, 2), 'OFF');
  assert.match(now.control().cell(14, 3), /^OFF \(/);
});

test('Gemini may ❌ a KOF alert it\'s 90%+ sure needs no Social Alert when a no-alert check holds that the bot can back up (an alert that went out, the leads\' guidance); its own reading alone (mistake, not actionable) only with kof_no_alert_judgment; P0 and Sensitive Topic alerts stay protected', () => {
  const run = (llm, opts) => {
    const w = world(Object.assign({ drafts: STAND_IN }, opts || {}));
    if (opts && opts.gen) Object.assign(w.bot.ev('GEN').settings, opts.gen);
    w.vertex.assess = () => Object.assign({ checks: [] }, llm);
    const msg = w.paste((opts && opts.text) || F.WAYMO_KOF);
    w.run();
    return { reactions: w.chat.botReactions(msg.name), sent: w.gmail.sentMessages().length, logs: w.g.logs };
  };
  const no = (checks, confidence) => ({
    social_alert: { warranted: false, confidence: confidence || 0.95, reason: 'Generic snark about Waymo' },
    no_alert_checks: Object.assign({ duplicate: false, comment_on_alerted: false, alerted_elsewhere: false, guidance: false, mistake: false,
      not_actionable: false, evidence: 'The post only jokes about Waymo, with no claim or incident' }, checks),
  });
  const JUDGE = { gen: { kof_no_alert_judgment: true } };
  // Gemini's own reading alone (not actionable, a mistake): the KOF alert still goes out, with Gemini's view in the run log
  const a = run(no({ not_actionable: true }));
  eq([a.reactions, a.sent], [['📰', '📦'], 1]);
  assert.ok(a.logs.some(l => /KOF alert goes out; Gemini's own reading \(not enough on its own to ❌\): not actionable: The post only jokes about Waymo/.test(l)), a.logs.join('\n'));
  eq(run(no({ mistake: true })).sent, 1);
  // ...unless kof_no_alert_judgment is on
  const judged = run(no({ not_actionable: true }), JUDGE);
  eq([judged.reactions, judged.sent], [['❌'], 0]);
  assert.ok(judged.logs.some(l => /❌ no Social Alert needed \(AI review \(KOF\): not actionable: The post only jokes about Waymo/.test(l)), judged.logs.join('\n'));
  // Under 90% sure, no check, a check it can't back up (no guidance, no earlier alert), or no evidence: it goes out
  eq([run(no({ not_actionable: true }, 0.85), JUDGE).sent, run(no({}), JUDGE).sent, run(no({ guidance: true })).sent, run(no({ comment_on_alerted: true })).sent,
    run(no({ not_actionable: true, evidence: '' }), JUDGE).sent], [1, 1, 1, 1, 1]);
  // The leads' current guidance backs it up when there is some
  const GUIDE = [{ source: 'tab', text: 'Hold KOF criticism of Waymo this week', applies_to: 'Waymo', until: '' }];
  const held = no({ guidance: true, evidence: 'The Guidance tab says to hold KOF criticism of Waymo this week' });
  const guided = run(held, { guidance: GUIDE });
  eq([guided.reactions, guided.sent], [['❌'], 0]);
  assert.ok(guided.logs.some(l => /❌ no Social Alert needed \(AI review \(KOF\): the leads' current guidance: The Guidance tab says/.test(l)), guided.logs.join('\n'));
  // A comment on a post whose alert went out (here only in the SLRR alert log): ❌ even when Gemini didn't say whether it
  // adds anything new (the follow-up rule on its own needs that); not when Gemini found something new
  const log = [{ date_added: '2026-10-14T04:00:00.000Z', url: 'https://x.com/ICannot_Enough/status/2111814207448514693',
    issue_name: 'Criticism against Waymo', exposure_tag: 'Product - Other/general criticism', risk_tag: '-', product: 'Waymo',
    engagements: 11, emojis: '📦 Product 📰 GCPA' }];
  const comment = followUp => Object.assign(no({ comment_on_alerted: true, evidence: 'It asks Grok about the video that was already alerted' }), { follow_up: followUp });
  const onLog = { text: F.WAYMO_FOLLOW_UP, bq: () => ({ author_alerts: log }) };
  const c1 = run(comment({ of: 1, adds_new: null, confidence: 0.6 }), onLog);
  eq([c1.reactions, c1.sent], [['❌'], 0]);
  assert.ok(c1.logs.some(l => /❌ no Social Alert needed \(AI review \(KOF\): a comment on an alerted post: It asks Grok/.test(l)), c1.logs.join('\n'));
  eq(run(comment({ of: 1, adds_new: true, confidence: 0.9, reason: 'Shares a new incident' }), onLog).sent, 1);
  // ...and only when more than Gemini's guess ties the two (the thread, Burson's wording or issue name), or it's 80%+ sure
  const tie = extra => ({ noAlertChecks: { comment_on_alerted: true, evidence: 'e' }, fields: { engagement_level: 'VERY LOW' },
    followUp: Object.assign({ by: 'ai', original: { outcome: 'alerted', risk_tags: [] }, adds_new: null, confidence: 0.6, corroborated: false }, extra) });
  const low = { engagement_total: 1, sensitive_topics: [], priority: 'P2' };
  eq([B.kofNoAlertWhy_(tie({}), low), B.kofNoAlertWhy_(tie({ corroborated: true }), low), B.kofNoAlertWhy_(tie({ confidence: 0.85 }), low),
    B.kofNoAlertWhy_(tie({ corroborated: true, original: { outcome: 'not alerted' } }), low)],
  ['', 'a comment on an alerted post: e', 'a comment on an alerted post: e', '']);
  // A Sensitive Topic (or P0) is escalated whatever the checks say; kof_no_alert: false turns the KOF ❌ off
  const sensitive = F.WAYMO_KOF.replace('[Sensitive Topic]: -', '[Sensitive Topic]: Violence / Weapons')
    .replace(',ICannot_Enough,-,Waymo,', ',ICannot_Enough,Violence / Weapons,Waymo,');
  eq([run(no({ mistake: true }), { text: sensitive, gen: JUDGE.gen }).sent, run(held, { guidance: GUIDE, gen: { kof_no_alert: false } }).sent], [1, 1]);
  eq([B.kofOnly_({ track: 'URGENT', priority: 'P2', reasons: ['KOF', 'HIGH_ENGAGEMENT'] }),
    B.kofOnly_({ track: 'URGENT', priority: 'P2', reasons: ['KOF', 'SENSITIVE_TOPIC'] }), B.kofOnly_({ track: 'URGENT', priority: 'P0', reasons: ['KOF'] })],
  [true, false, false]);
});

test('a reply under an alerted post (by anyone) is a follow-up for certain: ❌ when it adds nothing; the same post in the SLRR log from an earlier day is ❌ too', () => {
  const w = world({ drafts: STAND_IN, post: true });
  w.g.pages.set(X_API('2111840627885252950'), JSON.stringify(POSTS.x_followup));
  const prompts = followUpGemini(w, { of: 1, adds_new: false, confidence: 0.9, reason: 'Asks Grok about the same remote-operator claim' });
  w.paste(F.WAYMO_KOF);
  w.run();
  w.g.clock.now += 2 * 3600 * 1000;
  // Someone else's reply under the alerted post: X's public data shows the thread
  const reply = F.WAYMO_FOLLOW_UP.split('ICannot_Enough (307.1K followers) shared a follow-up post').join('Ground_Watcher (12K followers) posted a reply')
    .replace(',1,ICannot_Enough,', ',1,Ground_Watcher,');
  const msg = w.paste(reply);
  w.run();
  eq([w.chat.botReactions(msg.name), w.gmail.sentMessages().length], [['❌'], 1]);
  const last = prompts[prompts.length - 1];
  assert.match(last, /\[1\] today · alerted \(📰 📦\) · THIS POST REPLIES UNDER IT \(same thread\) · by @ICannot_Enough · Waymo/);
  assert.match(last, /THE POST ITSELF[\s\S]*- It is a reply to @Ground_Signal: "@ICannot_Enough Waymo told Sen\. Markey/);
  assert.ok(w.g.logs.some(l => /❌ no Social Alert needed \(a reply in the thread of QA-\d+, which was already alerted: Asks Grok/.test(l)), w.g.logs.join('\n'));
  assert.ok(w.g.logs.includes('post: X @ICannot_Enough · a reply (thread: 2111839363516756085, 2111814207448514693)'), w.g.logs.join('\n'));

  // A reply under a post alerted by someone else, found in the SLRR alert log (related_alerts)
  const f = parse(reply).fields;
  const post = B.xPostFromEmbed_(POSTS.x_followup);
  const linked = B.earlierAlerts_(f, [], { related_alerts: [{ date_added: '2026-10-14T04:00:00.000Z', url: 'https://x.com/ICannot_Enough/status/2111814207448514693',
    author_handle: 'ICannot_Enough', issue_name: 'Criticism against Waymo', emojis: '📦 Product 📰 GCPA' }] }, NOW, post);
  eq(linked.map(e => [e.source, e.in_thread, e.outcome, e.author]), [['log', true, 'alerted', 'ICannot_Enough']]);
  eq(B.followUpOf_(linked, { of: 1, adds_new: false, confidence: 0.9 }, f, NOW).by, 'thread');
  eq(B.followUpOf_(linked, undefined, f, NOW).adds_new, null);  // no Gemini: a follow-up, but not judged: it isn't dropped

  // The same post, in the SLRR alert log since yesterday (alerted before the bot saw it): ❌, no second email
  const v = world({ drafts: STAND_IN, bq: () => ({ slrr_first_alerted: '2026-10-13T04:00:00.000Z', slrr_emojis: '📦 Product 📰 GCPA',
    slrr_issue_name: 'Criticism against Waymo', slrr_engagements: 11 }) });
  const again = v.paste(F.WAYMO_KOF);
  v.run();
  eq([v.chat.botReactions(again.name), v.gmail.sentMessages().length], [['❌'], 0]);
  assert.ok(v.g.logs.some(l => /\(the same post was already alerted \(https:\/\/x\.com\/ICannot_Enough\/status\/2111814207448514693, SLRR alert log\)\)/.test(l)), v.g.logs.join('\n'));
  // ...but not when the log has it from today: that can be this very alert, logged by an IM
  const u = world({ drafts: STAND_IN, bq: () => ({ slrr_first_alerted: '2026-10-14T04:00:00.000Z' }) });
  u.paste(F.WAYMO_KOF);
  u.run();
  eq(u.gmail.sentMessages().length, 1);
});

test('the leads\' current guidance reaches Gemini: the Guidance tab (a passed Until date drops the row) and their recent emails about alerts (no one else\'s)', () => {
  const g = makeGoogle(NOW);
  const bot = loadBot(g.services, g.clock);
  const ss = g.services.SpreadsheetApp.create('bot');
  const tab = bot.ensureGuidanceTab_(ss);
  tab.appendRow(['Hold KOF criticism of Waymo', 'Waymo', '2026-10-20', 'Kelsey']);
  tab.appendRow(['Escalate every Pixel 11 leak', '', '10/1/2026', 'Jon']);  // ended
  tab.appendRow(['Skip posts from @parodyacct', '@parodyacct', 'until further notice', 'Jon']);
  tab.appendRow(['', '', '', '']);
  const rows = bot.readGuidanceRows_(ss, NOW);
  eq(rows.map(r => [r.text, r.until]), [['Hold KOF criticism of Waymo', '2026-10-20'], ['Skip posts from @parodyacct', 'until further notice']]);
  g.gmail.receive('Re: alerts this week', 'Team, please don\'t escalate Waymo memes from KOFs until Friday.', 'Kelsey Lange <lead1@alerts.test>');
  g.gmail.receive('Lunch?', 'escalate the pizza order', 'Someone <someone@ops.test>');
  const memo = new Map();
  const ctx = { settings: bot.ev('GEN').settings, gmail: bot.gmailClient_(), memo: { get: k => memo.get(k) || null, set: (k, v) => memo.set(k, v) },
    now: () => g.clock.now, log: () => {} };
  const emails = bot.leadGuidanceEmails_(ctx);
  eq(emails.map(e => [e.from, e.date, e.subject, e.text]),
    [['Kelsey Lange', '2026-10-14', 'Re: alerts this week', 'Team, please don\'t escalate Waymo memes from KOFs until Friday.']]);
  g.gmail.receive('More guidance', 'Escalate every Gemini outage', 'Jon Silver <lead2@alerts.test>');
  eq(bot.leadGuidanceEmails_(ctx).length, 1);  // read again only after 30 minutes
  eq(bot.leadGuidanceEmails_(Object.assign({}, ctx, { settings: { guidance_from_email: false } })), []);
  const parsed = parse(F.WAYMO_KOF);
  parsed.guidance = rows.concat(emails);
  const system = B.assessPrompts_(parsed, null).system;
  assert.match(system, /CURRENT GUIDANCE FROM THE SLRR LEADS[^\n]*\n- Hold KOF criticism of Waymo \[applies to: Waymo\] \[until 2026-10-20\]\n/);
  assert.match(system, /- Email from Kelsey Lange \(2026-10-14\), "Re: alerts this week": Team, please don't escalate Waymo memes/);
  assert.match(system, /NO-ALERT CHECKS \(no_alert_checks\)[\s\S]*`comment_on_alerted`[\s\S]*`alerted_elsewhere`[\s\S]*`guidance`[\s\S]*`knowledge_base`[\s\S]*`mistake`/);
  eq(Object.keys(B.ev('ASSESS_SCHEMA_').properties.no_alert_checks.properties),
    ['duplicate', 'comment_on_alerted', 'alerted_elsewhere', 'guidance', 'knowledge_base', 'mistake', 'not_actionable', 'evidence']);
  assert.ok(!/CURRENT GUIDANCE FROM THE SLRR LEADS \(the Guidance tab/.test(B.assessPrompts_(parse(F.WAYMO_KOF), null).system));  // none: no section
});

test('Gemini\'s prompt has the post itself (its words, the reply it sits under, the post it quotes) and asks it to watch and listen to the whole clip', () => {
  const parsed = parse(F.WAYMO_FOLLOW_UP);
  parsed.post = B.xPostFromEmbed_(POSTS.x_followup);
  const p = B.assessPrompts_(parsed, { kind: 'video', label: 'the post\'s video (3:13 long)', parts: [] });
  assert.match(p.system, /THE POST ITSELF[^\n]*\n- X post by @ICannot_Enough · posted 2026-10-18T15:23:36\.000Z · 0 likes · 1 replies: "@Ground_Signal Hey @grok/);
  assert.match(p.system, /- It is a reply to @Ground_Signal: "@ICannot_Enough Waymo told Sen\. Markey[^"]*" \(a reply itself, to @ICannot_Enough's post 2111814207448514693\)/);
  assert.match(p.system, /attached above is the post's video \(3:13 long\)\. Watch and listen to all of it, start to finish: every second of a video or audio clip/);
  parsed.post = B.xPostFromEmbed_(POSTS.x_original);
  const q = B.assessPrompts_(parsed, null).system;
  assert.match(q, /- It quotes @ethanteicher: "This is why we have argued/);
  assert.match(q, /- Media: a video \(3:13 long\)/);
  parsed.post = { platform: 'YouTube', id: 'abc', url: 'https://www.youtube.com/watch?v=abc' };
  assert.ok(!/THE POST ITSELF/.test(B.assessPrompts_(parsed, null).system));  // Gemini watches YouTube itself
});

// =============================================================================================================
// Testing: emails go to the stand-in only. The Speed tab: the bot vs the IMs, alert by alert
// =============================================================================================================

test('testing: Gmail refuses any email addressed to anyone but the stand-in (To, Cc or Bcc; sends, drafts and updates); the Workspace form is never submitted', () => {
  const g = makeGoogle(NOW);
  const bot = loadBot(Object.assign({}, g.services, { FormApp: { openById: () => { throw new Error('form opened'); }, ItemType: {} } }), g.clock);
  const gm = bot.gmailClient_({ onlyTo: 'tester@testing.test' });
  const mime = (to, cc, bcc) => bot.buildMime_({ from: 'Brand Social <tester@testing.test>', to, cc: cc || [], bcc: bcc || [], subject: 'Social Alert',
    text: 'x', html: '<p>x</p>' });
  gm.sendMessage(mime(['Lucas Hammonds <TESTER@testing.test>']));
  assert.throws(() => gm.sendMessage(mime(['tester@testing.test'], ['gcpa-team@alerts.test'])),
    /Testing: emails go only to tester@testing\.test\. This one was addressed to gcpa-team@alerts\.test, so it was not sent/);
  assert.throws(() => gm.sendMessage(mime(['tester@testing.test'], [], ['someone@ops.test'])), /someone@ops\.test/);
  const many = Array.from({ length: 12 }, (_, i) => `search-pocs-${i}@alerts.test`);  // a long, folded To header
  assert.throws(() => gm.createDraft(mime(['tester@testing.test'].concat(many))), /search-pocs-0@alerts\.test/);
  assert.throws(() => gm.updateDraft('d1', mime(['waymo@alerts.test'])), /waymo@alerts\.test/);
  assert.throws(() => gm.sendMessage(mime([])), /addressed to no one/);
  eq([g.gmail.sentMessages().length, g.gmail.allDrafts().length], [1, 0]);
  // Not testing (no stand-in): drafts to the real distros are allowed
  bot.gmailClient_().createDraft(mime(['search@alerts.test'], ['gcpa-team@alerts.test']));
  eq(g.gmail.allDrafts().length, 1);
  // The Workspace form: never while testing, even from the live Burson space
  const ws = { fields: { product: 'Workspace', social_network: 'X', post_url: 'https://x.com/a/status/1', engagement_level: 'LOW' } };
  assert.match(bot.submitWorkspaceForm_(ws, true), /^Workspace form/);
  bot.ev('GEN').email.stand_in = '';
  bot.setRunLive_(true);
  assert.match(bot.submitWorkspaceForm_(ws, true), /^Workspace form submission failed/);  // it tried (the fake form refuses)
});

test('Speed: one post across link formats; each bot alert is paired with the IMs\' first draft for that post (any subject), their email found in Gmail by the post\'s id, and the summary counts speed and calls', () => {
  eq([B.postKey_('https://twitter.com/ICannot_Enough/status/2111814207448514693?s=20'), B.postKey_('https://x.com/i/web/status/2111814207448514693'),
    B.postKey_('https://www.instagram.com/ryankellycomedy/reel/DenONU1O4fm/'), B.postKey_('https://www.instagram.com/p/DenONU1O4fm'),
    B.postKey_('https://www.instagram.com/reels/DemYWfcCMiM/'), B.postKey_('https://youtu.be/nSwmcs37Jd4'), B.postKey_('https://www.youtube.com/shorts/nSwmcs37Jd4'),
    B.postKey_('https://www.tiktok.com/@moreperfectunion/video/7551106238768090399?lang=en'), B.postKey_('https://bsky.app/profile/a.bsky.social/post/3mobtlvo7ec25'),
    B.postKey_('https://www.reddit.com/r/google/comments/1abc2de/some_title/kx9yz01/'), B.postKey_('https://redd.it/1abc2de'), B.postKey_('')],
  ['x:2111814207448514693', 'x:2111814207448514693', 'ig:DenONU1O4fm', 'ig:DenONU1O4fm', 'ig:DemYWfcCMiM', 'yt:nSwmcs37Jd4', 'yt:nSwmcs37Jd4',
    'tt:7551106238768090399', 'bsky:3mobtlvo7ec25', 'rd:1abc2de/kx9yz01', 'rd:1abc2de', '']);
  eq([B.samePost_('rd:1abc2de/kx9yz01', 'rd:1abc2de'), B.samePost_('rd:1abc2de/kx9yz01', 'rd:1abc2de/zz9'), B.postToken_('rd:1abc2de/kx9yz01'),
    B.postToken_('ig:DenONU1O4fm'), B.speedSubjectIssue_('🟥SOCIAL ALERT🟥: Search | Criticism of "Search" Quality | X | 3596 Engagements'),
    B.postKey_('https://www.facebook.com/reel/1627146842439200'), B.postKey_('https://www.facebook.com/somepage/posts/pfbid0abc123'),
    B.postKey_('https://www.facebook.com/permalink.php?story_fbid=987654&id=1')],
  [true, false, 'kx9yz01', 'DenONU1O4fm', 'Criticism of Search Quality', 'fb:1627146842439200', 'fb:pfbid0abc123', 'fb:987654']);

  const T = NOW - 2 * 86400e3;
  const min = n => T + n * 60000;
  const row = (id, url, at, extra) => Object.assign({ alert_id: id, created_at: min(at), source_at: T, email_status: 'sent', email_sent_at: min(at + 0.5),
    forwarded_fields: { post_url: url, social_network: 'X', author: 'a', product: 'Waymo', issue_name: 'Waymo issue' } }, extra || {});
  const alerts = [
    row('QA-1', 'https://x.com/a/status/11111', 1, { seen_at: min(0.6) }),                           // both: bot 1.5 min, IM draft 20, email 24
    row('QA-5', 'https://x.com/a/status/11111', 90, { source_at: min(80), resend_of: 'QA-1', email_status: '' }),  // Burson's resend: same post
    row('QA-2', 'https://x.com/b/status/22222', 2, { email_status: '' }),                            // IM only
    row('QA-3', 'https://x.com/c/status/33333', 1),                                                  // bot only: no IM draft, email or log a day on
    row('QA-4', 'https://x.com/d/status/44444', 1, { email_status: '' }),                            // neither
    row('QA-6', 'https://x.com/e/status/55555', 3, { email_status: '' }),                            // IM sent it without the Assistant (SLRR log)
    row('QA-7', 'https://x.com/f/status/66666', 1, { source_at: '' }),                               // older: no recorded start
    row('QA-8', 'https://x.com/g/status/77777', 1, { source_at: '' }), row('QA-9', 'https://x.com/g/status/77777', 60),  // first seen before
  ];
  const drafts = [
    { post_url: 'https://twitter.com/a/status/11111?s=46', at: min(20), subject: '⭐ SOCIAL ALERT ⭐: Waymo | Other words | X | 9 Engagements', drafted_by: 'im@ops.test' },
    { post_url: 'https://x.com/b/status/22222', at: min(40), subject: 'no pipes', drafted_by: 'im2@ops.test' },
    { post_url: 'https://x.com/a/status/11111', at: T - 3 * 86400e3, subject: 'an earlier alert of the same post', drafted_by: 'im@ops.test' },
  ];
  const grouped = B.speedPosts_(alerts, drafts, [{ url: 'https://x.com/e/status/55555', day: B.etDay_(T) }]);
  eq(grouped.filter(p => !p.start_known).map(p => p.key).sort(), ['x:66666', 'x:77777']);  // counted, not timed: the bot would look instant
  const posts = grouped.filter(p => p.start_known);
  eq(posts.map(p => [p.key, p.alert_id, p.bot_call, p.burson_at === T, p.im_draft && p.im_draft.at, p.im_logged]), [
    ['x:11111', 'QA-1', 'Social Alert', true, min(20), false], ['x:22222', 'QA-2', 'No Social Alert', true, min(40), false],
    ['x:33333', 'QA-3', 'Social Alert', true, null, false], ['x:44444', 'QA-4', 'No Social Alert', true, null, false],
    ['x:55555', 'QA-6', 'No Social Alert', true, null, true]]);
  eq(posts[0].alert_ids, ['QA-1', 'QA-5']);  // Burson's resend is the same alert
  // The IMs' emails: by the post's id; the bot's own threads never count; a post checked a minute ago waits (5, 10, 20 … min)
  const searches = [];
  const gmail = { messageSummaries: q => {
    searches.push(q);
    if (q.includes('"11111"')) return [{ at: min(24), subject: 'Edited: Waymo remote ops', threadId: 't9' }, { at: min(2), subject: 'bot', threadId: 'own' }];
    return [];
  } };
  B.speedImEmails_(posts, new Map([['x:22222', { checks: 1, checked: NOW - 60000 }]]), gmail, NOW, {}, new Set(['own']));
  posts.forEach(p => { p.im_call = B.speedImCall_(p, NOW); });
  eq(posts.map(p => [p.im_email_at, p.im_call, p.im_checks, B.resultsSameCall_(p)]), [[min(24), 'Social Alert', 1, 'Yes'],
    [null, 'Social Alert', 1, 'No'], [null, 'No Social Alert', 0, 'No'], [null, 'No Social Alert', 0, 'Yes'],
    [null, 'Social Alert', 1, 'No']]);
  assert.match(searches[0], /^from:\(sender@alerts\.test\) "11111" after:\d+$/);
  eq(searches.length, 2);  // 11111 and 55555 (logged); 22222 was checked a minute ago; 33333 and 44444 show no IM sign a day on
  // The Results numbers: speed on the alerts both sent with both times known; calls on the alerts the IMs decided
  const s = B.resultsWindow_(posts);
  eq([s.alerts, s.timed, s.bot_median, s.im_median, s.bot_first, s.im_first, s.bot_lead, s.im_lead, s.im_from_email],
    [5, 1, 1.5, 24, 1, 0, 22.5, null, 1]);
  eq([s.decided, s.same, s.same_pct, s.im_only, s.bot_only, s.pending, s.bot_sent, s.im_sent], [5, 2, 40, 2, 1, 0, 2, 3]);
  // The issue-name fallback only takes the email sent within 30 minutes of the IM's draft (many alerts share an issue name)
  const p2 = Object.assign({}, posts[0], { key: 'link-only', im_draft: { at: min(20), subject: 'S | Criticism against Waymo | X | 9' } });
  const late = { messageSummaries: q => (/subject:/.test(q) ? [{ at: min(55), subject: 'Criticism against Waymo (another alert)' }] : []) };
  eq(B.speedFindImEmail_(p2, late, 'sender@alerts.test', new Set()), null);
});

test('Speed tab, now Results, end to end: an old Speed tab is renamed in place and its Gmail lookups carry over; the bot\'s email vs the IM\'s draft and email for the same post, timed from the live Burson post (the Mirror notes it)', () => {
  const w = world({ noWait: true, drafts: STAND_IN });
  const live = NOW - 3 * 60000;  // the original Zapier post in the live Burson space, 3 minutes before the copy
  const msg = w.paste(F.WAYMO_KOF);
  w.bot.rememberMirrorSource_(msg.name, live);
  w.run();
  const sent = w.gmail.sentMessages()[0];
  const row = w.alertRows()[0];
  eq([row.source_at, sent.to.length, /tester@testing\.test/i.test(sent.to[0])], [live, 1, true]);
  // An IM drafted it 25 minutes after Burson posted, with another subject, and sent it 31 minutes after
  w.g.clock.now = live + 31 * 60000;
  w.gmail.receive('⭐ SOCIAL ALERT ⭐: Waymo | Remote operators in the Philippines | X | 11 Engagements',
    'SOCIAL ALERT\n\nX user ICannot_Enough …\n\nLink: https://x.com/ICannot_Enough/status/2111814207448514693', 'Brand Social <sender@alerts.test>');
  w.g.clock.now = live + 40 * 60000;
  // An alert from before the bot recorded when Burson posted it: counted, not timed
  w.alertRows().push({ alert_id: 'QA-0999', created_at: live - 3600e3, space: row.space, email_status: 'sent', email_sent_at: live - 3590e3,
    forwarded_fields: { post_url: 'https://x.com/old/status/99999', social_network: 'X' } });
  // The Speed tab as the last version left it (after Guidance): its alerts table at row 24, with what Gmail found (30 min)
  const ss = w.g.services.SpreadsheetApp.create('bot');
  ['Resources', 'Guidance', 'Speed'].forEach(n => ss.insertSheet(n));
  const old = ss.getSheetByName('Speed');
  old.getRange(1, 1).setValue('Bot vs IMs: how fast the Social Alert email goes out');
  old.getRange(24, 1, 2, 17).setValues([['Burson posted (ET)', 'Post', 'Product', 'Issue', 'Who sent a Social Alert', 'Bot: minutes to email',
    'IMs: minutes to email', 'Faster', 'Bot: wait · review · send (min)', 'IMs\' time is from', 'IMs\' subject', 'IM', 'Bot alert', 'post key',
    'IM email at (ms)', 'IM checks', 'IM checked at (ms)'], [w.bot.speedTime_(live), 'X', 'Waymo', '', 'Both', 3, 30, '', '', 'their email', '', '',
    row.alert_id, 'x:2111814207448514693', live + 30 * 60000, 1, live + 30 * 60000]]);
  old.hideColumns(14, 4);
  const drafts = () => [{ post_url: 'https://x.com/ICannot_Enough/status/2111814207448514693', at: live + 25 * 60000,
    subject: '⭐ SOCIAL ALERT ⭐: Waymo | Remote operators | X | 11 Engagements', drafted_by: 'smuscat@ops.test' }];
  const searchedFor = (from, token) => w.g.gmail.calls.slice(from).filter(c => String((c.query && c.query.q) || '').includes(token)).length;
  const calls = w.g.gmail.calls.length;
  const out = w.bot.refreshSpeed_(ss, w.ctx(), { drafts, logged: () => [], alerts: w.alertRows() });
  eq([ss.getSheets().map(s => s.getName()), searchedFor(calls, '2111814207448514693'), out.older],
    [['Sheet1', 'Resources', 'Guidance', 'Results'], 0, 1]);  // renamed in place; Gmail's earlier find is reused, not searched again
  const tab = ss.getSheetByName('Results');
  const line = label => (tab.rows.find(x => x[0] === label) || []).slice(0, 3);
  const botMin = Math.round((row.email_sent_at - live) / 6000) / 10;
  const lead = Math.round((live + 30 * 60000 - row.email_sent_at) / 6000) / 10;
  eq([tab.rows[0][0], tab.rows[0][4], line('HEADLINE NUMBERS'), line('Alerts Burson posted that the bot reviewed'), line('Social Alerts the bot sent'),
    line('Social Alerts the IMs sent'), line('Same Social Alert call as the IMs (alerts the IMs have decided)'),
    line('Waiting on the IMs\' call (alert under a day old)'), line('Typical minutes from Burson\'s post to the email (median): the bot'),
    line('Typical minutes from Burson\'s post to the email (median): the IMs'), line('The bot\'s email went out first')],
  ['Results: what the bot did with Burson\'s alerts, next to what the IMs did', `Updated ${w.bot.speedTime_(w.g.clock.now)} ET`,
    ['HEADLINE NUMBERS', 'Last 24 hours', 'Last 7 days'], ['Alerts Burson posted that the bot reviewed', 2, 2], ['Social Alerts the bot sent', 2, 2],
    ['Social Alerts the IMs sent', 1, 1], ['Same Social Alert call as the IMs (alerts the IMs have decided)', '1 of 1 (100%)', '1 of 1 (100%)'],
    ['Waiting on the IMs\' call (alert under a day old)', 1, 1], ['Typical minutes from Burson\'s post to the email (median): the bot', botMin, botMin],
    ['Typical minutes from Burson\'s post to the email (median): the IMs', 30, 30],
    ['The bot\'s email went out first', `1 of 1, by ${lead} min (median)`, `1 of 1, by ${lead} min (median)`]]);
  assert.match(tab.rows[1][0], /^What's counted: every alert Burson posted in the live space in the last 7 days .* 1 alert from before the bot recorded when Burson posted it is counted but not timed\.$/);
  eq(line('Mistakes the bot fixed itself'), ['Mistakes the bot fixed itself', 0, 0]);  // the Mirror space fixes them too
  eq([tab.rows[3].slice(0, 2), tab.rows[4][0], tab.merges.includes('5,1,1,8')], [['WHAT\'S HAPPENING', 'Written by Gemini from the numbers below.'],
    'The bot reviewed the alerts Burson posted. It compared its Social Alert calls with the IMs\' calls.', true]);
  // The alerts table, one row per post, under the summary
  const h = tab.rows.findIndex(x => x[0] === 'Burson posted (ET)' && x.includes('post key'));
  // the header row is read afresh each time: a rebuild clears the last one's cells in place (the fake sheet's row arrays too)
  const col = (name, i) => tab.rows[h + (i || 1)][tab.rows[h].indexOf(name)];
  eq([col('Burson posted (ET)'), col('What Burson got wrong'), col('Bot\'s call'), col('IMs\' call'), col('Same call?'), col('Bot: minutes to email'),
    col('IMs: minutes to email'), col('Who sent first'), col('IMs\' time is from'), col('IMs\' subject'), col('IM'), col('Bot alert ids'), col('post key'),
    col('IM email at (ms)'), col('Bot: minutes to email', 2), col('IMs\' call', 2), tab.rows.length - h - 1],
  [w.bot.speedTime_(live), 'No mistakes', 'Social Alert', 'Social Alert', 'Yes', botMin, 30, `Bot, by ${lead} min`, 'their email',
    '⭐ SOCIAL ALERT ⭐: Waymo | Remote operators | X | 11 Engagements', 'smuscat', row.alert_id, 'x:2111814207448514693', live + 30 * 60000,
    'start not recorded', 'Not yet', 2]);
  assert.match(col('Post'), /^=HYPERLINK\("https:\/\/x\.com\/ICannot_Enough\/status\/2111814207448514693","X @ICannot_Enough"\)$/);
  assert.match(col('Why (bot)'), /KOF/);
  eq([18, 21, 14, 17].map(c => tab.hidden.includes(c)), [true, true, false, false]);  // the Speed tab's hidden columns are shown again
  // The next rebuild finds the alerts table wherever it is now: what Gmail found is still reused
  const again = w.g.gmail.calls.length;
  w.bot.refreshSpeed_(ss, w.ctx(), { drafts, logged: () => [], alerts: w.alertRows() });
  eq([searchedFor(again, '2111814207448514693'), col('IM email at (ms)')], [0, live + 30 * 60000]);
});

// The Results tab's test data: Burson's posts as the two test spaces logged them (the Mirror space's rows and the
// auto-correct space's), with one row from an old test feed that is left out
const R_T = NOW - 2 * 86400e3;  // two days ago: the IMs' calls on these are settled
const R_MIN = n => R_T + n * 60000;
const R_MAIN = 'spaces/MIRROR > (isolated)';
const R_AC = 'spaces/AAQAaa_0I9g > spaces/AUTOFIX (auto-correct)';
const R_FLOWS = { main: { partition: R_MAIN, label: 'Mirror space', live: false }, ac: { partition: R_AC, label: 'Auto-correct space' } };
const R_IDS = { a: 20001, b: 20002, c: 20003, d: 20004, e: 20005, f: 20006, g: 20007, h: 20008 };
function resultsRow(id, space, post, at, extra) {
  const r = Object.assign({
    alert_id: id, space, source_at: at, created_at: at + (space === R_AC ? 30000 : 60000), status: 'ok', requested: [], email_status: '', decision: '',
    forwarded_fields: { post_url: `https://x.com/${post}user/status/${R_IDS[post]}`, social_network: 'X', author: `${post}user`, product: 'Search',
      issue_name: `Issue ${post.toUpperCase()}` },
  }, extra || {});
  if (r.noLink) { delete r.forwarded_fields.post_url; delete r.noLink; }
  return r;
}
function resultsRows() {
  const PRODUCT = { field: 'product', old: 'Gems', new: 'Gemini App', reason: 'Gems is no longer used' };
  const SUMMARY = { field: 'summary', old: 'X user posted bad', new: 'An X user (@auser) said Gemini App got a fact wrong.', reason: 'grammar' };
  const TAG = { field: 'exposure_tag', old: 'Product - Meme', new: 'Product - Meme about Google products', reason: 'that tag was renamed' };
  const LINK = { field: 'post_url', problem: 'missing' };
  const sent = (at, escalation) => ({ email_status: 'sent', email_sent_at: at, email_at: at, email_thread: 'thread-' + at, email_input: { escalation } });
  const HIGH = { priority: 'P1', reasons: ['HIGH_ENGAGEMENT'], engagement_total: 5000, platform: 'X' };
  const below = n => `❌ P2, ${n} engagements: below the escalation criteria`;
  return [
    // a: both spaces sent the Social Alert (the auto-correct space first) and fixed the product; it also rewrote the summary
    resultsRow('QA-1', R_MAIN, 'a', R_MIN(0), Object.assign({ requested: [PRODUCT], status: 'fix_requested' }, sent(R_MIN(3), HIGH))),
    resultsRow('QA-2', R_AC, 'a', R_MIN(0), Object.assign({ requested: [PRODUCT, SUMMARY], status: 'fix_requested' }, sent(R_MIN(2), HIGH))),
    // b: neither space sent one (P2, 300 engagements); the IMs did
    resultsRow('QA-3', R_MAIN, 'b', R_MIN(60), { decision: below(300) }),
    resultsRow('QA-4', R_AC, 'b', R_MIN(60), { decision: below(300) }),
    // c: the Mirror space sent one (a P0 tag), the auto-correct space didn't (Gemini's call); the IMs didn't either
    resultsRow('QA-5', R_MAIN, 'c', R_MIN(120), sent(R_MIN(123), { priority: 'P0', exposure_tag: 'Product - Perceived bias', reasons: ['P0_TOPIC'] })),
    resultsRow('QA-6', R_AC, 'c', R_MIN(120), { decision: '❌ AI review: not warranted' }),
    // d: no link (only Burson can add it), then Burson's resend with the link; the IMs logged it (no draft)
    resultsRow('QA-7', R_MAIN, 'd', R_MIN(180), { noLink: true, requested: [LINK], status: 'superseded' }),
    resultsRow('QA-8', R_AC, 'd', R_MIN(180), { noLink: true, requested: [LINK], status: 'superseded' }),
    resultsRow('QA-9', R_MAIN, 'd', R_MIN(200), { resend_of: 'QA-7', status: 'fixed' }),
    resultsRow('QA-10', R_AC, 'd', R_MIN(200), { resend_of: 'QA-8', status: 'fixed', decision: below(50) }),
    // e: two hours ago, only in the auto-correct space: a renamed tag fixed; a Social Alert with a T&S form
    resultsRow('QA-11', R_AC, 'e', NOW - 2 * 3600e3, Object.assign({ requested: [TAG], status: 'fix_requested' },
      sent(NOW - 2 * 3600e3 + 90000, { priority: 'P1', reasons: ['KOF'], is_kof: true, ts_reasons: ['Child Safety'] }))),
    // f: an old test feed's row: left out
    resultsRow('QA-12', 'spaces/BURSON > spaces/ANALYST', 'f', R_MIN(30), sent(R_MIN(31), HIGH)),
    // g: three hours ago, only in the Mirror space: a T&S form, no Social Alert; the IMs haven't decided (under a day)
    resultsRow('QA-13', R_MAIN, 'g', NOW - 3 * 3600e3, { decision: 'T&S form only (Child safety)' }),
  ];
}
const R_DRAFTS = () => [
  { post_url: 'https://x.com/auser/status/20001', at: R_MIN(20), subject: '⭐ SOCIAL ALERT ⭐: Gemini App | Issue A | X | 5000 Engagements', drafted_by: 'im1@ops.test' },
  { post_url: 'https://x.com/buser/status/20002', at: R_MIN(90), subject: '⭐ SOCIAL ALERT ⭐: Search | Issue B | X | 300 Engagements', drafted_by: 'im2@ops.test' },
  { post_url: 'https://x.com/euser/status/20005', at: NOW - 2 * 3600e3 + 25 * 60000, subject: '🟥SOCIAL ALERT🟥: Search | Issue E | X | 900 Engagements',
    drafted_by: 'im3@ops.test' },
];
const R_LOGGED = () => [{ url: 'https://x.com/duser/status/20004', day: B.etDay_(R_T) }];
const R_OPTS = extra => Object.assign({ alerts: resultsRows(), drafts: R_DRAFTS, logged: R_LOGGED, flows: R_FLOWS }, extra || {});

test('Results: a Burson post both test spaces handled is one alert: the bot\'s call is a Social Alert when either space sent one, its time is the first email, what Burson got wrong comes from the auto-correct row; a resend joins the alert it resends; an old test feed\'s rows are left out', () => {
  const posts = B.speedPosts_(resultsRows(), R_DRAFTS(), R_LOGGED(), R_FLOWS);
  eq(posts.map(p => [p.key, p.alert_ids, p.bot_call, p.flows_differ, !!p.flows.main, !!p.flows.ac]), [
    ['x:20005', ['QA-11'], 'Social Alert', false, false, true],
    ['x:20007', ['QA-13'], 'No Social Alert', false, true, false],
    ['x:20004', ['QA-8', 'QA-7', 'QA-10', 'QA-9'], 'No Social Alert', false, true, true],
    ['x:20003', ['QA-6', 'QA-5'], 'Social Alert', true, true, true],
    ['x:20002', ['QA-4', 'QA-3'], 'No Social Alert', false, true, true],
    ['x:20001', ['QA-2', 'QA-1'], 'Social Alert', false, true, true]]);
  const [e, , d, c, b, a] = posts;
  eq([a.burson_at, a.bot_email_at, a.fixes.map(x => x.field), a.flows.main.fixes.map(x => x.field), a.flows.main.sent_at, a.im_draft.at, a.why,
    B.resultsWrongText_(a)], [R_T, R_MIN(2), ['product', 'summary'], ['product'], R_MIN(3), R_MIN(20), 'High engagement (5,000 on X)',
    'Product: Gems to Gemini App · Summary rewritten']);
  // d had no link (the IMs' email and draft can't be matched on it) until Burson resent it: one alert, from the first post
  eq([d.burson_at, d.url, d.missing, d.im_logged, B.resultsReason_(d), B.resultsWrongText_(d)],
    [R_MIN(180), 'https://x.com/duser/status/20004', [{ field: 'post_url', problem: 'missing' }], true,
      'P2, 50 engagements: below the escalation criteria', 'Link missing']);
  eq([c.why, c.bot_email_at, B.resultsFlowCalls_(c, 'Mirror space'), b.im_draft.at, e.tns, e.why],
    ['P0 criteria (Product - Perceived bias)', R_MIN(123), 'Mirror: Social Alert · Auto-correct: no Social Alert (AI review: not warranted)',
      R_MIN(90), true, 'Viral KOF author']);
  // When the main run's partition isn't known (an older caller), no row is dropped
  eq([B.speedPosts_(resultsRows(), [], [], null).length, B.resultsFlowOf_({ space: 'spaces/A > spaces/B (auto-correct)' }, R_FLOWS),
    B.resultsFlowOf_({ space: 'spaces/BURSON > spaces/ANALYST' }, R_FLOWS)], [7, 'ac', '']);
  // poll()'s flows: the Mirror space (or the Main space without one) and the auto-correct space; null for one that isn't running
  eq([B.resultsFlows_({ partition: R_MAIN, outboundBlocked: true }, { partition: R_AC, sourceReadOnly: true }, { mirror: { id: 'spaces/MIRROR' } }),
    B.resultsFlows_({ partition: 'spaces/BURSON > spaces/ANALYST' }, null, {}), B.resultsFlows_(null, null, null)],
  [R_FLOWS, { main: { partition: 'spaces/BURSON > spaces/ANALYST', label: 'Main space', live: false }, ac: null }, { main: null, ac: null }]);
});

test('Results tab: headline numbers for the last 24 hours and 7 days, what Burson got wrong by field, the two test spaces side by side, by day, and where the bot and the IMs differed, with the bot\'s reason', () => {
  const w = world({ noWait: true });
  const ss = w.g.services.SpreadsheetApp.create('bot');
  w.bot.refreshSpeed_(ss, w.ctx(), R_OPTS());
  const tab = ss.getSheetByName('Results');
  const line = label => (tab.rows.find(x => x[0] === label) || []).slice(1, 3);
  eq(['Alerts Burson posted that the bot reviewed', 'Alerts with at least one mistake', 'Mistakes the bot fixed itself',
    'Details missing from Burson\'s alerts (e.g. a link: the bot went on without them)', 'Social Alerts the bot sent', 'Social Alerts the IMs sent',
    'Same Social Alert call as the IMs (alerts the IMs have decided)', 'The IMs sent a Social Alert, the bot didn\'t',
    'The bot sent a Social Alert, the IMs didn\'t', 'Waiting on the IMs\' call (alert under a day old)',
    'Typical minutes from Burson\'s post to the email (median): the bot', 'Typical minutes from Burson\'s post to the email (median): the IMs',
    'The bot\'s email went out first', 'The IMs\' email went out first', 'T&S forms the bot prepared'].map(line),
  [[2, 6], ['1 (50%)', '3 (50%)'], [1, 3], [0, 1], [1, 3], [1, 4], ['1 of 1 (100%)', '2 of 5 (40%)'], [0, 2], [0, 1], [1, 1], [1.5, 1.8], [25, 22.5],
    ['1 of 1, by 23.5 min (median)', '2 of 2, by 20.8 min (median)'], ['0 of 1', '0 of 2'], [2, 2]]);
  const at = label => tab.rows.findIndex(x => x[0] === label);
  const rows = (from, n, width) => tab.rows.slice(from, from + n).map(x => x.slice(0, width));
  assert.match(tab.rows[1][0], /in its test spaces \(Mirror space and Auto-correct space\)\. One alert is one Burson post, matched with the IMs' Social Alert on the post's link, not the subject line\./);
  eq(rows(at('WHAT BURSON GOT WRONG (last 7 days)'), 5, 3), [['WHAT BURSON GOT WRONG (last 7 days)', 'Mistakes', 'Latest example'],
    ['Exposure Tag', 1, 'Product - Meme to Product - Meme about Google products'], ['Link missing', 1, ''], ['Product', 1, 'Gems to Gemini App'],
    ['Summary rewritten', 1, '']]);
  const sp = at('THE TWO TEST SPACES (last 7 days)');
  eq(rows(sp, 10, 3), [['THE TWO TEST SPACES (last 7 days)', 'Mirror space: the bot fixes it and tells Burson', 'Auto-correct space: the bot fixes it itself'],
    ['Alerts handled', 5, 5], ['Alerts with mistakes it found', 2, 3], ['Alerts where Burson was told what changed', 2, '—'], ['Alerts posted already corrected', '—', 2],
    ['Social Alerts sent', 2, 2], ['Typical minutes from Burson\'s post to the checked alert in the space (median)', 1, 0.5],
    ['Typical minutes from Burson\'s post to the Social Alert email (median)', 3, 1.8], ['Alerts both spaces handled', 4, ''],
    ['Alerts where the two spaces made a different Social Alert call', 1, '']]);
  eq([tab.rows[sp + 10][0], tab.rows[sp + 11][0], tab.rows[sp + 11][3], tab.rows[sp + 11][4]], ['Different calls', B.speedTime_(R_MIN(120)), 'Issue C',
    'Mirror: Social Alert · Auto-correct: no Social Alert (AI review: not warranted)']);
  const byDay = at('BY DAY (ET)');
  eq(rows(byDay + 1, 3, 8), [[B.resultsDayLabel_(B.etDay_(NOW)), 2, 1, 1, 1, '1 of 1 (100%)', 1.5, 25],
    [B.resultsDayLabel_(B.etDay_(NOW - 86400e3)), 0, 0, 0, 0, '—', '—', '—'], [B.resultsDayLabel_(B.etDay_(R_T)), 4, 2, 2, 3, '1 of 4 (25%)', 2, 20]]);
  eq([B.resultsDayLabel_('2026-10-19'), tab.rows.slice(byDay + 1, byDay + 8).length], ['Mon Oct 19', 7]);
  const dif = at('WHERE THE BOT AND THE IMs DIFFERED (last 7 days)');
  eq(tab.rows.slice(dif + 1, dif + 6).map(x => [x[0], x[3], x[4]]), [
    ['The IMs sent a Social Alert, the bot didn\'t: 2', 'Issue', 'The bot\'s reason'],
    [B.speedTime_(R_MIN(180)), 'Issue D', 'P2, 50 engagements: below the escalation criteria'],
    [B.speedTime_(R_MIN(60)), 'Issue B', 'P2, 300 engagements: below the escalation criteria'],
    ['The bot sent a Social Alert, the IMs didn\'t: 1', 'Issue', 'The bot\'s reason'],
    [B.speedTime_(R_MIN(120)), 'Issue C', 'P0 criteria (Product - Perceived bias)']]);
  assert.match(tab.rows[dif + 2][1], /^=HYPERLINK\("https:\/\/x\.com\/duser\/status\/20004","X @duser"\)$/);
  // Every alert, newest first, after the summary
  const h = tab.rows.findIndex(x => x[0] === 'Burson posted (ET)' && x.includes('post key'));
  const col = (name, i) => tab.rows[h + i][tab.rows[h].indexOf(name)];
  eq([tab.rows[h - 1][0], tab.rows.length - h - 1, col('Test spaces', 1), col('Test spaces', 4), col('Same call?', 2), col('IMs\' call', 3),
    col('Why (bot)', 2), col('What Burson got wrong', 6), col('Bot alert ids', 6)],
  ['EVERY ALERT (last 7 days, newest first; one row per Burson post, both test spaces together)', 6, 'Auto-correct',
    'Mirror + Auto-correct (different calls)', 'Not yet', 'Social Alert', 'T&S form only (Child safety)', 'Product: Gems to Gemini App · Summary rewritten',
    'QA-2, QA-1']);
  eq([tab.merges, tab.hidden.includes(18)], [['2,1,1,8', '5,1,1,8', `${at('HEADLINE NUMBERS') + 17},1,1,8`], true]);
});

test('Results: rebuilt right after a run that handled an alert or sent an email (at most once a minute; one that had to wait comes on the next run), otherwise every 10 minutes, never with under a minute left; BigQuery reads are reused for 5 minutes', () => {
  const w = world();
  const ss = w.g.services.SpreadsheetApp.create('bot');
  const store = w.bot.sheetBackend_(ss);  // the Alert log, as poll() leaves it
  resultsRows().forEach(r => store.appendAlert(r));
  const BQ = 'https://bigquery.googleapis.com/bigquery/v2/projects/brand-social-central-data/queries';
  w.g.pages.set(BQ, { code: 200, body: { jobComplete: true, schema: { fields: [] }, rows: [] } });
  const bq = () => w.g.fetches.filter(f => f.url === BQ).length;
  const props = w.g.services.PropertiesService.getScriptProperties();
  const run = (activity, left) => w.bot.maybeRefreshSpeed_(ss, w.ctx(), { activity, flows: R_FLOWS,
    deadline: w.g.clock.now + (left === undefined ? 4 * 60000 : left) });
  const shown = () => (ss.getSheetByName('Results').rows.find(x => x[0] === 'Alerts Burson posted that the bot reviewed') || [])[2];
  eq([run(true), bq(), shown()], [true, 2, 6]);  // the IMs' drafts and the SLRR log; the old test feed's row is left out
  w.g.clock.now += 30000;
  eq([run(true), props.getProperty('RESULTS_DIRTY')], [false, 'true']);  // 30 seconds on: it waits for the minute
  w.g.clock.now += 31000;
  eq([run(false), props.getProperty('RESULTS_DIRTY'), bq()], [true, null, 2]);  // the next run rebuilds it; BigQuery's reads are reused
  w.g.clock.now += 5 * 60000;
  eq(run(false), false);  // nothing new: every 10 minutes
  w.g.clock.now += 5 * 60000;
  eq([run(false), bq()], [true, 4]);  // 10 minutes on, with BigQuery read again
  w.g.clock.now += 20 * 60000;
  eq([run(true, 50000), props.getProperty('RESULTS_DIRTY')], [false, 'true']);  // under a minute left in this run: the next one
  eq(run(false), true);
  // BigQuery failing: the last reads, noted under the title
  w.g.clock.now += 10 * 60000;
  w.g.pages.set(BQ, { code: 500, body: { error: { message: 'backend error' } } });
  eq(run(false), true);
  assert.match(ss.getSheetByName('Results').rows[1][0], /The IMs' drafts and the SLRR alert log are as of \d{4}-\d\d-\d\d \d\d:\d\d ET: BigQuery couldn't be read since\.$/);
  // An older caller (no opts): every 10 minutes, with ctx.deadline; the main run's partition is remembered
  w.g.pages.set(BQ, { code: 200, body: { jobComplete: true, schema: { fields: [] }, rows: [] } });
  eq(w.bot.maybeRefreshSpeed_(ss, w.ctx()), false);
  w.g.clock.now += 10 * 60000;
  eq([w.bot.maybeRefreshSpeed_(ss, w.ctx()), shown()], [true, 6]);
  // Off in the settings: never
  w.g.clock.now += 60 * 60000;
  const off = w.ctx();
  off.settings = Object.assign({}, off.settings, { speed_tab: false });
  eq(w.bot.maybeRefreshSpeed_(ss, off, { activity: true, deadline: w.g.clock.now + 4 * 60000 }), false);
  // The bot's Speed tab (its title in A1) is renamed (kept where it is), unless a Results tab is there already
  const ss2 = w.g.services.SpreadsheetApp.create('bot2');
  ss2.insertSheet('Speed').getRange(1, 1).setValue('Bot vs IMs: how fast the Social Alert email goes out');
  ss2.insertSheet('Other');
  eq([w.bot.ensureResultsTab_(ss2).getName(), ss2.getSheets().map(s => s.getName())], ['Results', ['Sheet1', 'Results', 'Other']]);
  ss2.insertSheet('Speed');
  eq([w.bot.ensureResultsTab_(ss2) === ss2.getSheetByName('Results'), ss2.getSheets().map(s => s.getName())], [true, ['Sheet1', 'Results', 'Other', 'Speed']]);
});

test('Results summary: Gemini writes it from the facts (the prompt has them, and only them); reused while the numbers are the same, rewritten at most every 25 minutes when they change', () => {
  const w = world();
  const ss = w.g.services.SpreadsheetApp.create('bot');
  let asked = 0;
  w.vertex.synopsis = payload => {
    asked++;
    const f = JSON.parse(payload.contents[0].parts[0].text.match(/^<facts>\n([\s\S]+)\n<\/facts>$/)[1]);
    const wk = f.last_7_days;
    return `Burson posted ${wk.alerts_burson_posted} alerts in the last 7 days, and ${wk.alerts_with_mistakes} of them (${wk.alerts_with_mistakes_pct}%) had ` +
      `a mistake. The bot made the same Social Alert call as the IMs on ${wk.same_call_as_ims} of ${wk.alerts_ims_decided}. When both sent one, ` +
      `the bot's email went out after ${wk.bot_typical_minutes_to_email} minutes, against ${wk.ims_typical_minutes_to_email} for the IMs.`;
  };
  const out = w.bot.refreshSpeed_(ss, w.ctx(), R_OPTS());
  const tab = ss.getSheetByName('Results');
  const text = 'Burson posted 6 alerts in the last 7 days, and 3 of them (50%) had a mistake. The bot made the same Social Alert call as the IMs on 2 of 5. ' +
    'When both sent one, the bot\'s email went out after 1.8 minutes, against 22.5 for the IMs.';
  eq([out.synopsis.by, tab.rows[4][0], tab.rows[3].slice(0, 2), asked], ['gemini', text, ['WHAT\'S HAPPENING', 'Written by Gemini from the numbers below.'], 1]);
  const call = w.vertex.calls.filter(c => c.payload.generationConfig.responseSchema.properties.synopsis).pop();
  assert.match(call.payload.systemInstruction.parts[0].text, /Use ONLY the facts in the JSON\. Every number you write must appear in the JSON exactly as given/);
  eq([call.payload.tools, out.facts.most_common_mistakes_last_7_days.length, out.facts.test_spaces_last_7_days.different_social_alert_call,
    out.facts.examples_ims_alerted_bot_did_not.map(x => x.bot_reason)],
  [undefined, 4, 1, ['P2, 50 engagements: below the escalation criteria', 'P2, 300 engagements: below the escalation criteria']]);  // no web search
  // The same numbers a minute later: Gemini isn't asked again
  w.g.clock.now += 60000;
  w.bot.refreshSpeed_(ss, w.ctx(), R_OPTS());
  eq([asked, tab.rows[4][0]], [1, text]);
  // A new alert changes the numbers: the last summary stays, marked as older than the tables, for up to 25 minutes
  const more = resultsRows().concat([resultsRow('QA-14', R_AC, 'h', NOW - 30 * 60000)]);
  w.bot.refreshSpeed_(ss, w.ctx(), R_OPTS({ alerts: more }));
  eq([asked, tab.rows[4][0], tab.rows[3][1]], [1, text, `Written by Gemini at ${B.speedTime_(NOW).slice(11)} ET; the numbers below are newer.`]);
  w.g.clock.now += 25 * 60000;
  const out2 = w.bot.refreshSpeed_(ss, w.ctx(), R_OPTS({ alerts: more }));
  eq([asked, out2.synopsis.by, tab.rows[3][1]], [2, 'gemini', 'Written by Gemini from the numbers below.']);
  assert.match(tab.rows[4][0], /^Burson posted 7 alerts in the last 7 days, and 3 of them \(43%\) had a mistake\./);
});

test('Results summary: a number Gemini made up (one that isn\'t in the facts), or Gemini failing, gives the computed summary of the same facts instead', () => {
  const w = world({ noWait: true });
  w.vertex.synopsis = () => 'Burson posted 6 alerts this week. The bot saved the team 14 hours.';
  const ss = w.g.services.SpreadsheetApp.create('bot');
  const out = w.bot.refreshSpeed_(ss, w.ctx(), R_OPTS());
  const tab = ss.getSheetByName('Results');
  eq([out.synopsis.by, out.synopsis.why, tab.rows[4][0], tab.rows[3][1]], ['computed', 'numbers', B.resultsFallbackSynopsis_(out.facts),
    'Computed from the numbers below (Gemini\'s summary had a number that isn\'t in them).']);
  eq(B.resultsSynopsisCheck_('Burson posted 6 alerts this week. The bot saved the team 14 hours.', out.facts), { ok: false, why: 'numbers', bad: ['14'] });
  eq(tab.rows[4][0], 'In the last 7 days the bot reviewed 6 alerts Burson posted, 2 of them in the last 24 hours. 3 of them (50%) had at least one ' +
    'mistake: the bot fixed 3 mistakes itself, and 1 detail was missing, such as a link (the bot went on without waiting). The most common: Exposure Tag (1), ' +
    'Link missing (1), Product (1). On the 5 alerts the IMs have decided, the bot made the same Social Alert call 2 times (40%): the IMs sent 2 that ' +
    'the bot didn\'t, and the bot sent 1 that the IMs didn\'t. On the 2 alerts both sent, the bot\'s email typically went out 1.8 minutes after Burson ' +
    'posted, against 22.5 for the IMs, and the bot was first on 2, typically by 20.8 minutes. In the Mirror space the bot told Burson what it changed on 2 alerts; ' +
    'in the Auto-correct space it posted 2 already corrected, and the two spaces made a different Social Alert call on 1.');
  eq(B.resultsSynopsisCheck_(tab.rows[4][0], out.facts).ok, true);  // the computed summary passes the same check
  // Gemini failing (after its retries): the computed summary; it's tried again only after 25 minutes
  const w2 = world({ noWait: true });
  w2.vertex.fail = p => (p.generationConfig.responseSchema.properties.synopsis ? { code: 503, body: { error: { code: 503, message: 'overloaded' } } } : null);
  const ss2 = w2.g.services.SpreadsheetApp.create('bot');
  const out2 = w2.bot.refreshSpeed_(ss2, w2.ctx(), R_OPTS());
  const tries = w2.vertex.calls.length;
  eq([out2.synopsis.by, out2.synopsis.why, ss2.getSheetByName('Results').rows[3][1], ss2.getSheetByName('Results').rows[4][0], tries],
    ['computed', 'unavailable', 'Computed from the numbers below (Gemini was unavailable).', B.resultsFallbackSynopsis_(out2.facts), 2]);
  w2.g.clock.now += 10 * 60000;
  w2.bot.refreshSpeed_(ss2, w2.ctx(), R_OPTS());
  eq(w2.vertex.calls.length, tries);
  // Gemini's text is kept to one plain paragraph: arrows become "to", markdown and bullets go; a one-liner or an essay isn't used
  eq([B.resultsCleanSynopsis_('**Mistakes:** Gems → Gemini App\n- 3 alerts'), B.resultsSynopsisCheck_('Six alerts.', out.facts).why,
    B.resultsSynopsisCheck_('Fine. '.repeat(9), out.facts).why], ['Mistakes: Gems to Gemini App 3 alerts', 'format', 'format']);
  // With the Mirror space alone, the bot fixed the mistakes itself too (it also told Burson): it never waits on Burson
  const mirrorOnly = B.speedPosts_(resultsRows().filter(r => r.space === R_MAIN), R_DRAFTS(), R_LOGGED(), R_FLOWS);
  mirrorOnly.forEach(p => { p.im_call = B.speedImCall_(p, NOW); });
  const mf = B.resultsFacts_(B.resultsSummary_(mirrorOnly, NOW, 7, 'Mirror space'), true);  // Never wait on Burson ON
  eq([mf.last_7_days.mistakes_bot_fixed_itself, mf.last_7_days.details_missing_from_bursons_alerts, mf.test_spaces_last_7_days], [1, 1, undefined]);
  assert.match(B.resultsFallbackSynopsis_(mf), / 2 of them \(40%\) had at least one mistake: the bot fixed 1 mistake itself, and 1 detail was missing, such as a link \(the bot went on without waiting\)\. /);
});

// =============================================================================================================
// The knowledge base: the Resources tab's documents, read in full, for every review and answer (Knowledge.gs)
// =============================================================================================================

/** A line padded to 99 characters with "·" (not a word, so the search ignores it): passages are exactly 18 lines. */
const pad99 = s => (s + ' ' + '·'.repeat(99)).slice(0, 99);
const KB_DOC1 = 'SLRR Collection Requirements\n\nKOF: an author on any KOF list counts as a KOF, whatever the engagement.\n' +
  'Exposure tags: one per alert; the priority banner must match the tag.';
/** Three test documents: a short one Burson can see, a KOF list (5 passages) and a playbook (3 passages, one per section). */
function KB() {
  const kof = ['[Tab: KOFs]', 'Handle | List'].concat(Array.from({ length: 88 }, (_, i) =>
    (i === 48 ? '@TheChiefNerd | Viral KOFs (KOFs)' : `@user${i} | Tech Journalists`))).map(pad99).join('\n');
  const section = (lead, body) => [lead].concat(Array.from({ length: 17 }, (_, i) => `${body} (${i})`)).map(pad99);
  const playbook = [].concat(
    section('Waymo posts about remote operators go to the Waymo comms team', 'Waymo remote operator posts are routed to Waymo comms'),
    section('Any AI Overview that gives dangerous medical advice is P0 and goes to Search comms',
      'AI Overviews health answers with dangerous medical advice need a screenshot'),
    section('Doodle complaints go to the Doodle team', 'Doodle complaints are routed to the Doodle team')).join('\n');
  return { docs: [
    { name: 'SLRR Collection Requirements', url: 'https://docs.google.com/document/d/1KbRequirementsDoc00001/edit',
      covers: 'The alert requirements', burson: true, label: 'Google Doc', text: KB_DOC1 },
    { name: 'KOF lists', url: 'https://docs.google.com/spreadsheets/d/1KbKofListsSheet00000001/edit', covers: 'Who counts as a KOF',
      burson: false, label: 'Google Sheet (1 tab)', text: kof },
    { name: 'Escalation playbook', url: 'https://docs.google.com/document/d/1KbEscalationPlaybookDoc01/edit',
      covers: 'Which team gets which alert', burson: false, label: 'Google Doc', text: playbook },
  ] };
}
/** A Drive file the fake Drive API knows: its metadata, and its plain-text export when `text` is given. */
function driveFile(g, id, meta, text) {
  g.pages.set(B.driveMetaUrl_(id), { code: 200, body: JSON.stringify(Object.assign({ id, name: 'Doc',
    mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-10-14T10:00:00.000Z', version: '1' }, meta)) });
  if (text !== undefined) g.pages.set(B.driveExportUrl_(id), { code: 200, body: text, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

test('knowledge base: what a Resources link is (a Doc, a Sheet and its tab, Slides, a Drive file, a web page) and what the bot can\'t open; web pages and Sheets as text', () => {
  const kind = u => plain(B.resourceLink_(u));
  eq(kind('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp/edit?tab=t.0'), { kind: 'doc', id: '1AbCdEfGhIjKlMnOp', gid: '' });
  eq(kind('https://docs.google.com/spreadsheets/d/1b54g1c6R8Y2j1xnVQavmLJQZn04qgPfgyeTzBdFt_1k/edit#gid=12345'),
    { kind: 'sheet', id: '1b54g1c6R8Y2j1xnVQavmLJQZn04qgPfgyeTzBdFt_1k', gid: '12345' });
  eq(kind('https://docs.google.com/presentation/u/0/d/1SlidesIdXYZ123/edit'), { kind: 'slides', id: '1SlidesIdXYZ123', gid: '' });
  eq(kind('https://drive.google.com/file/d/1FileIdABCDEFG/view?usp=sharing'), { kind: 'drive', id: '1FileIdABCDEFG' });
  eq(kind('https://drive.google.com/open?id=1FileIdABCDEFG'), { kind: 'drive', id: '1FileIdABCDEFG' });
  eq(['https://support.google.com/gemini/answer/13594961', 'go/slrr-wiki', 'http://go/slrr-wiki', 'https://go.dev/doc',
    'https://chat.google.com/room/AAQAother1', 'see Kelsey', ''].map(u => kind(u).kind), ['web', 'golink', 'golink', 'web', 'chat', 'none', 'none']);
  const page = B.htmlToText_('<html><head><title>T</title><style>p{}</style></head><body><h1>KOF rules</h1><p>Authors on the ' +
    '<b>Viral KOFs</b> list &amp; INFs count.</p><ul><li>One</li><li>Two</li></ul><script>x()</script><table><tr><td>A</td><td>B</td>' +
    '</tr></table></body></html>');
  eq(page, 'KOF rules\nAuthors on the Viral KOFs list & INFs count.\n\n- One\n- Two\nA | B');
  eq(B.decodeEntities_('Tom &amp; Jerry&#39;s &#x2014;&nbsp;&bogus;'), 'Tom & Jerry\'s — &bogus;');
  eq(B.sheetToText_('KOFs', [['Handle', 'List', ''], ['@TheChiefNerd', 'Viral KOFs (KOFs)', ''], ['', '', ''], [' ICannot_Enough ', 'CAM Tech/AI (INFs)', 3]]),
    '[Tab: KOFs]\nHandle | List\n@TheChiefNerd | Viral KOFs (KOFs)\nICannot_Enough | CAM Tech/AI (INFs) | 3');
  eq(B.sheetToText_('Empty', [['', '']]), '');
  // A long text goes in cell-sized pieces, never splitting an emoji
  const long = 'a'.repeat(44999) + '😀' + 'b'.repeat(10);
  const cells = plain(B.knowledgeCells_(long));
  eq([cells.length, cells[0].length, cells.join('') === long], [2, 44999, true]);
});

test('knowledge base: every document goes in whole when they fit; otherwise the short ones whole and the passages that bear on the alert (the author\'s KOF row, the product\'s rules), never the rest', () => {
  const q = { text: 'AI Overviews gave dangerous medical advice about a health question', phrases: ['AI Overviews'], handles: ['@TheChiefNerd'] };
  const k = B.knowledgeFor_(KB(), q, { budget: 3600 });
  eq([k.docs[0], k.docs[1].name, k.docs[1].whole, k.docs[1].lookup, k.docs[2].name, k.docs[2].whole, k.docs[2].chars > 500],
    [{ name: 'SLRR Collection Requirements', url: KB().docs[0].url, whole: true, chars: KB_DOC1.length },
      'KOF lists', false, 'looked up: 1 row for the author',
      'Escalation playbook', false, true]);
  assert.ok(k.text.startsWith('[1] SLRR Collection Requirements: The alert requirements (the whole document below)\n' +
    '[2] KOF lists: Who counts as a KOF (a KOF list, looked up by the alert\'s author: 1 matching row below, with its tab\'s header row)\n' +
    '[3] Escalation playbook: Which team gets which alert (the parts that bear on this, below)\n\n'), k.text.slice(0, 450));
  assert.ok(k.text.includes(`=== [1] SLRR Collection Requirements ===\n${KB_DOC1}`));
  assert.ok(k.text.includes('@TheChiefNerd | Viral KOFs (KOFs)') && k.text.includes('Any AI Overview that gives dangerous medical advice is P0'));
  assert.ok(!k.text.includes('@user1 |') && !k.text.includes('Doodle complaints') && !k.text.includes('Waymo posts about remote operators'));
  eq(B.knowledgeFor_(KB(), q, { budget: 100000 }).docs.map(d => d.whole), [true, true, true]);
  eq(B.knowledgeFor_(KB(), q, { budget: 100000, onlyUrls: new Set([KB().docs[0].url]) }).docs.map(d => d.name), ['SLRR Collection Requirements']);
  eq([B.knowledgeFor_({ docs: [] }, q, {}), B.knowledgeFor_(null, q, {})], [{ text: '', docs: [] }, { text: '', docs: [] }]);
  // An alert's search words: its own names, the author, its text
  const aq = plain(B.knowledgeQuery_(parse(F.AIO)));
  assert.ok(aq.handles.includes('@TheChiefNerd') && aq.phrases.includes('AI Overviews (AIM, Web Guide)'), JSON.stringify(aq));
  eq(B.knowledgeHandleFromUrl_('https://x.com/ICannot_Enough/status/2111814207448514693'), 'ICannot_Enough');
});

test('knowledge base: the review works the alert by the documents (they beat the playbook; the leads\' guidance beats both) and names the ones it used; only documents it was given count', () => {
  const parsed = parse(F.AIO);
  parsed.knowledge = B.knowledgeFor_(KB(), B.knowledgeQuery_(parsed), { budget: 100000 });
  parsed.guidance = [{ source: 'tab', text: 'Hold AI Overviews memes this week', applies_to: 'AI Overviews', until: '' }];
  const system = B.assessPrompts_(parsed, null).system;
  const at = s => system.indexOf(s);
  const guidanceAt = at('CURRENT GUIDANCE FROM THE SLRR LEADS (the Guidance tab first');
  assert.ok(at('PLAYBOOK:') >= 0 && at('PLAYBOOK:') < at('KNOWLEDGE BASE: the team') &&
    at('KNOWLEDGE BASE: the team') < at('CHECKS (return one result per id') && at('CHECKS (return one result per id') < guidanceAt,
  [at('PLAYBOOK:'), at('KNOWLEDGE BASE: the team'), at('CHECKS (return one result per id'), guidanceAt].join());
  assert.ok(system.includes('=== [2] KOF lists ===\n[Tab: KOFs]'));
  assert.match(system, /Where a document and the playbook above disagree, follow the document\. The CURRENT GUIDANCE FROM THE SLRR LEADS \(below, when there is any\) overrides both while it applies\./);
  assert.match(system, /overrides the playbook and the knowledge base, for the alerts it covers only/);
  assert.match(system, /In `knowledge_used`, list each document you relied on, by its name as listed above/);
  assert.ok(!B.assessPrompts_(parse(F.AIO), null).system.includes('KNOWLEDGE BASE: the team'));  // no documents: no section
  eq(Object.keys(B.ev('ASSESS_SCHEMA_').properties.knowledge_used.items.properties), ['document', 'used_for']);
  eq(B.knowledgeUsed_({ knowledge_used: [{ document: 'slrr collection requirements', used_for: 'the exposure tag' }, { document: '[3]', used_for: 'teams' },
    { document: 'A made-up handbook', used_for: 'x' }, { document: 'SLRR Collection Requirements' }] }, parsed.knowledge),
  [{ document: 'SLRR Collection Requirements', used_for: 'the exposure tag' }, { document: 'Escalation playbook', used_for: 'teams' }]);
  eq([B.knowledgeUsed_(null, parsed.knowledge), B.knowledgeUsed_({ knowledge_used: [{ document: 'KOF lists' }] }, null)], [[], []]);
  eq([B.knowledgePrompt_(null), B.knowledgePrompt_({ text: '', docs: [] })], ['', '']);
});

test('knowledge base: each review gets the documents (the run log says which), Gemini\'s knowledge_used is kept on the Alert log row, and a KOF alert can be ❌ on a document\'s say-so only with kof_no_alert_judgment ON', () => {
  const w = world({ drafts: STAND_IN, knowledge: KB() });
  w.vertex.assess = () => ({ checks: [], knowledge_used: [{ document: 'KOF lists', used_for: 'the author is on Viral KOFs' }, { document: 'Not given', used_for: 'x' }] });
  w.paste(F.AIO);
  w.run();
  const review = w.vertex.calls.find(c => c.payload.generationConfig.responseSchema.properties.checks);
  const system = review.payload.systemInstruction.parts[0].text;
  assert.ok(system.includes('KNOWLEDGE BASE: the team\'s reference documents') && system.includes('@TheChiefNerd | Viral KOFs (KOFs)'));
  eq(w.alertRows()[0].knowledge_used, [{ document: 'KOF lists', used_for: 'the author is on Viral KOFs' }]);
  assert.ok(w.g.logs.includes('knowledge: SLRR Collection Requirements (whole) · KOF lists (whole) · Escalation playbook (whole)'), w.g.logs.join('\n'));
  assert.ok(w.g.logs.includes('knowledge used: KOF lists (the author is on Viral KOFs)'), w.g.logs.join('\n'));

  const kofRun = (llm, judgment) => {
    const k = world({ drafts: STAND_IN, knowledge: KB() });
    if (judgment) k.bot.ev('GEN').settings.kof_no_alert_judgment = true;
    k.vertex.assess = () => Object.assign({ checks: [] }, llm);
    const msg = k.paste(F.WAYMO_KOF);
    k.run();
    return { reactions: k.chat.botReactions(msg.name), sent: k.gmail.sentMessages().length, logs: k.g.logs };
  };
  const skip = used => ({
    social_alert: { warranted: false, confidence: 0.95, reason: 'Waymo remote-operator posts go to the Waymo comms team' },
    no_alert_checks: { knowledge_base: true, evidence: 'The Escalation playbook sends Waymo remote-operator posts to the Waymo comms team, not a Social Alert' },
    knowledge_used: used,
  });
  // A document's say-so is Gemini's own reading (it names one on almost every review): with kof_no_alert_judgment OFF,
  // as it ships, the KOF alert goes out
  const sent = kofRun(skip([{ document: 'Escalation playbook', used_for: 'Waymo posts' }]));
  eq([sent.reactions, sent.sent], [['📰', '📦'], 1]);
  assert.ok(!sent.logs.some(l => /AI review \(KOF\)/.test(l)), sent.logs.join('\n'));
  const held = kofRun(skip([{ document: 'Escalation playbook', used_for: 'Waymo posts' }]), true);
  eq([held.reactions, held.sent], [['❌'], 0]);
  assert.ok(held.logs.some(l => /❌ no Social Alert needed \(AI review \(KOF\): the knowledge base \(Escalation playbook\): The Escalation playbook sends/.test(l)),
    held.logs.join('\n'));
  // A document Gemini wasn't given, or none named, doesn't back it up: the KOF alert goes out
  eq([kofRun(skip([{ document: 'Some other handbook' }]), true).sent, kofRun(skip([]), true).sent], [1, 1]);
});

test('knowledge base: Burson\'s answers use only the documents marked Yes in "Burson can see it?"; analyst answers use them all and know which the bot relied on', () => {
  const kb = KB();
  const resources = kb.docs.map(d => ({ name: d.name, url: d.url, covers: d.covers, burson: d.burson }));
  const w = world({ drafts: STAND_IN, knowledge: kb, resources });
  w.vertex.assess = () => ({ checks: [], knowledge_used: [{ document: 'Escalation playbook', used_for: 'who gets it' }] });
  const alert = w.paste(F.AIO);
  w.run();
  w.reply(alert, 'why is this one escalated?');
  w.run();
  const answers = () => w.vertex.calls.filter(c => c.payload.generationConfig.responseSchema.properties.answer);
  const toBurson = answers()[0].payload.contents[0].parts[0].text;
  assert.ok(toBurson.includes(`[What those documents say: the parts that bear on this question]\n[1] SLRR Collection Requirements`), toBurson);
  assert.ok(toBurson.includes(KB_DOC1));
  assert.ok(!toBurson.includes('@TheChiefNerd | Viral KOFs (KOFs)') && !toBurson.includes('Doodle complaints') && !toBurson.includes(kb.docs[1].url) &&
    !toBurson.includes(kb.docs[2].url), 'internal documents never reach Burson');
  const [fwd] = w.analystPosts().filter(m => !m.threadReply);
  w.chat.say(w.ANA, 'who should get this one?', { thread: fwd.thread.name, sender: 'users/im_lead' });
  w.run();
  const last = answers()[answers().length - 1].payload;
  const toAnalyst = last.contents[0].parts[0].text;
  assert.ok(toAnalyst.includes('[Knowledge base documents the bot relied on for this alert]\n- Escalation playbook: who gets it'), toAnalyst);
  assert.ok(toAnalyst.includes('@TheChiefNerd | Viral KOFs (KOFs)') && toAnalyst.includes('Doodle complaints'));
  assert.match(last.systemInstruction.parts[0].text, /when it covers the question, answer from it and name the document you used/);
});

test('knowledge base: a Resources tab from before gets "Burson can see it?" and "Bot status" once: the starting documents are Yes, every other row stays internal, and people\'s own choice is kept', () => {
  const t = e2e();
  t.bot.setup();
  const res = t.sheet().getSheetByName('Resources');
  res.rows = [['Name', 'Link', 'What it covers'], ['SLRR Collection Requirements', RES()[0].url, 'requirements'],
    ['Channel owners', 'https://docs.google.com/spreadsheets/d/1ChannelOwnersSheet0001/edit', 'Who owns each channel'], ['KOF lists', '', 'chip']];
  res.links = { '4,2': RES()[1].url };  // a pasted link Sheets shows as a chip
  const rows = t.bot.readResourceRows_(t.sheet());
  eq(res.rows.map(r => r.slice(0, 4)), [['Name', 'Link', 'What it covers', 'Burson can see it?'],
    ['SLRR Collection Requirements', RES()[0].url, 'requirements', 'Yes'],
    ['Channel owners', 'https://docs.google.com/spreadsheets/d/1ChannelOwnersSheet0001/edit', 'Who owns each channel', ''], ['KOF lists', '', 'chip', 'Yes']]);
  eq(res.rows[0][4], 'Bot status');
  eq(plain(rows).map(r => [r.row, r.name, r.burson]), [[2, 'SLRR Collection Requirements', true], [3, 'Channel owners', false], [4, 'KOF lists', true]]);
  eq(t.bot.usableResources_(rows, GUARD).map(r => r.name), ['SLRR Collection Requirements', 'KOF lists']);
  res.rows[1][3] = 'No';  // set by a person: kept (the columns are only added once)
  eq(plain(t.bot.readResourceRows_(t.sheet())).map(r => r.burson), [false, false, true]);
});

test('knowledge base end to end: each run reads new Resources rows (Docs, Sheets, web pages) as the bot\'s account, Bot status says what it couldn\'t read and why, the text is kept in the bot\'s own hidden "Knowledge cache (bot)" tab, and a document is read again when Drive says it changed', () => {
  const t = e2e();
  t.bot.setup();
  const g = t.g;
  const res = t.sheet().getSheetByName('Resources');
  const status = () => res.rows.slice(1).map(r => String(r[4] || ''));
  const kb = () => t.bot.loadKnowledge_(t.sheet());
  // The documents (test fixtures): a Google Doc, the KOF Google Sheet linked to its SLRR Global INFs tab, a public page, a
  // PDF, a Doc not shared with the bot
  const DOC = '1KbEscalationPlaybookDoc01';
  const DOC_TEXT = 'Escalation playbook\n\nWaymo remote-operator posts go to the Waymo comms team.\nAI Overviews with dangerous medical advice are P0.';
  driveFile(g, DOC, { name: 'Escalation playbook', modifiedTime: '2026-10-14T10:00:00.000Z', version: '7' }, DOC_TEXT);
  const SHEET = '1KbKofListsSheet00000001';
  driveFile(g, SHEET, { name: 'KOF lists', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: '2026-10-13T09:00:00.000Z', version: '3' });
  const kof = new FakeSpreadsheet(SHEET, 'KOF lists');
  kof.sheets[0].setName('P0 KOFs');  // another tab: the row links to SLRR Global INFs, so this one isn't read
  kof.sheets[0].rows = [['Handle', 'List'], ['@SomeoneOnlyOnP0', 'P0 KOFs']];
  const inf = kof.insertSheet('SLRR Global INFs');
  inf.sheetId = 777;
  inf.rows = [['Handle', 'List'], ['@TheChiefNerd', 'Viral KOFs (KOFs)'], ['@ICannot_Enough', 'CAM Tech/AI (INFs)']];
  g.spreadsheets.set(SHEET, kof);
  const PAGE = 'https://support.google.com/websearch/answer/14901683';
  g.pages.set(PAGE, '<html><head><title>AI Overviews help</title></head><body><h1>About AI Overviews</h1><p>AI Overviews show a snapshot &amp; links.</p></body></html>');
  const PDF = '1KbScannedPolicyPdf000001';
  driveFile(g, PDF, { name: 'Policy.pdf', mimeType: 'application/pdf' });
  const UNSHARED = '1KbNotSharedDoc000000001';  // Drive answers 404 to the bot's account
  res.rows = [res.rows[0],
    ['Escalation playbook', `https://docs.google.com/document/d/${DOC}/edit`, 'Who gets which alert', '', ''],
    ['KOF lists', `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=777`, 'Who counts as a KOF', 'Yes', ''],
    ['AI Overviews help', PAGE, 'What AI Overviews are', 'Yes', ''],
    ['Team wiki', 'go/slrr-wiki', '', '', ''],
    ['Old policy', `https://drive.google.com/file/d/${PDF}/view`, '', '', ''],
    ['Private notes', `https://docs.google.com/document/d/${UNSHARED}/edit`, '', '', ''],
    ['Coming soon', '', '', '', '']];
  t.poll();
  const when = 'Oct 14, 8:01 AM EDT';
  const SHEET_TEXT = '[Tab: SLRR Global INFs]\nHandle | List\n@TheChiefNerd | Viral KOFs (KOFs)\n@ICannot_Enough | CAM Tech/AI (INFs)';
  const PAGE_TEXT = 'About AI Overviews\nAI Overviews show a snapshot & links.';
  eq(status(), [
    `✓ Read ${when} · Google Doc · ${DOC_TEXT.length} characters`,
    `✓ Read ${when} · Google Sheet, tab "SLRR Global INFs" · ${SHEET_TEXT.length} characters`,
    `✓ Read ${when} · web page · ${PAGE_TEXT.length} characters`,
    '✗ Go/ links only open on Google\'s network, not for the bot: open the document and paste its full link from the address bar.',
    '✗ The bot can\'t read PDFs: in Drive, right-click it, choose Open with > Google Docs, and link the Google Doc that makes.',
    '\u2717 The bot\'s account (bot@runner.test) can\'t open it: share it with that account (Viewer is enough), or check the link.',
    '✗ No link: paste the document\'s link in column B.']);
  eq(kb().docs.map(d => [d.name, d.label, d.burson, d.text]), [['Escalation playbook', 'Google Doc', false, DOC_TEXT],
    ['KOF lists', 'Google Sheet, tab "SLRR Global INFs"', true, SHEET_TEXT], ['AI Overviews help', 'web page', true, PAGE_TEXT]]);
  const drive = g.fetches.filter(f => f.url.startsWith('https://www.googleapis.com/drive/v3/files/'));
  assert.ok(drive.length >= 5 && drive.every(f => f.headers.Authorization === 'Bearer TOKEN'), JSON.stringify(drive));
  assert.ok(!g.fetches.some(f => /slrr-wiki/.test(f.url)));
  assert.ok(t.sheet().getSheetByName('Knowledge cache (bot)').isSheetHidden());

  // An alert's review gets the documents; the documents Gemini relied on go on its Alert log row
  g.vertex.assess = () => ({ checks: [], knowledge_used: [{ document: 'Escalation playbook', used_for: 'routing' }] });
  t.chat.say(TEST_FEED, F.AIO, { sender: 'users/bot' });
  t.poll();
  const reviews = g.vertex.calls.filter(c => c.payload.generationConfig.responseSchema.properties.checks);
  const system = reviews[reviews.length - 1].payload.systemInstruction.parts[0].text;
  assert.ok(system.includes(`=== [1] Escalation playbook ===\n${DOC_TEXT}`) && system.includes('@TheChiefNerd | Viral KOFs (KOFs)'), system.slice(0, 2000));
  assert.ok(!system.includes('@SomeoneOnlyOnP0'), 'only the linked tab of the KOF sheet is read');
  const log = t.sheet().getSheetByName('Alert log');
  eq(JSON.parse(log.rows[log.rows.length - 1][log.rows[0].indexOf('knowledge_used')]), [{ document: 'Escalation playbook', used_for: 'routing' }]);

  // The document is edited: within 15 minutes of the last check the copy stays; after that Drive says it changed and it's read again
  const EDITED = 'Escalation playbook\n\nWaymo remote-operator posts now go to the Waymo safety team.';
  driveFile(g, DOC, { name: 'Escalation playbook', modifiedTime: '2026-10-14T12:30:00.000Z', version: '8' }, EDITED);
  t.poll();
  assert.ok(kb().docs[0].text.includes('Waymo comms team'));
  for (let i = 0; i < 15; i++) t.poll();
  eq(kb().docs[0].text, EDITED);
  assert.match(status()[0], new RegExp(`^✓ Read Oct 14, 8:1\\d AM EDT · Google Doc · ${EDITED.length} characters$`));

  // A row taken off the tab: its text goes too. A long document is kept across cells and read back whole.
  res.rows = res.rows.filter(r => r[0] !== 'AI Overviews help');
  const LONG = '1KbLongHandbookDoc000001';
  const longText = Array.from({ length: 1200 }, (_, i) => `Rule ${i}: ${'x'.repeat(80)}`).join('\n');
  driveFile(g, LONG, { name: 'Handbook' }, longText);
  res.rows.push(['Handbook', `https://docs.google.com/document/d/${LONG}/edit`, '', '', '']);
  t.poll();
  assert.ok(!t.sheet().getSheetByName('Knowledge cache (bot)').rows.some(r => r[0] === PAGE));
  const parts = t.sheet().getSheetByName('Knowledge cache (bot)').rows.filter(r => r[0] === `https://docs.google.com/document/d/${LONG}/edit` && Number(r[1]) > 0);
  assert.ok(parts.length === 3 && parts.every(r => String(r[2]).length <= 45000), parts.map(r => String(r[2]).length).join());
  eq(kb().docs.map(d => d.name), ['Escalation playbook', 'KOF lists', 'Handbook']);
  eq(kb().docs[2].text, longText);

  // Out of reading time in a run: a new document waits for the next run, and says so
  const LATER = '1KbReadNextRunDoc0000001';
  driveFile(g, LATER, { name: 'Later' }, 'Read on the next run.');
  res.rows.push(['Later', `https://docs.google.com/document/d/${LATER}/edit`, '', '', '']);
  const r1 = t.bot.refreshKnowledge_(t.sheet(), { deadline: g.clock.now - 1 });
  eq([r1.waiting, status()[status().length - 1]], [1, '… Not read yet: the bot reads it on its next run.']);
  t.poll();
  assert.match(status()[status().length - 1], /^✓ Read .* · Google Doc · 21 characters$/);

  // refreshKnowledge() reads them all now and logs what it found; status() and tryAlert() show the knowledge base too
  const forced = t.bot.refreshKnowledge();
  eq([forced.docs, forced.readable, forced.failed], [7, 4, 3]);
  assert.ok(g.logs.some(l => l.startsWith('Read 4 of 7 documents (') && l.includes('Team wiki: ✗ Go/ links only open')), g.logs.slice(-3).join('\n'));
  const s = t.bot.status();
  assert.match(s.knowledge, /^Read 4 of 7 documents \([\d,]+ characters\)\. 3 couldn't be read: see the Bot status column on the Resources tab\.$/);
  assert.ok(s.knowledge_documents.includes('Coming soon: ✗ No link: paste the document\'s link in column B.'), JSON.stringify(s.knowledge_documents));
  t.bot.tryAlert();
  assert.ok(g.logs.some(l => /^Gemini: ok\nKnowledge base given: Escalation playbook \(whole\) · KOF lists \(whole\) · Handbook \([\d,]+ characters\) · Later \(whole\)\nDocuments Gemini relied on: Escalation playbook \(routing\)/.test(l)),
    g.logs.filter(l => l.startsWith('Gemini:')).join('\n'));
});

test('knowledge base: a Sheets link to one tab reads only that tab, as the KOF lists row does for "SLRR Global INFs": all ~3,000 KOFs are kept (more than the old 400,000-character limit) and an alert\'s author is found among them; a whole-spreadsheet link reads every tab; a link to a tab that\'s gone says so', () => {
  const t = e2e();
  t.bot.setup();
  const g = t.g;
  const SHEET = '1KbKofListsSheet00000001';
  driveFile(g, SHEET, { name: 'KOF lists', mimeType: 'application/vnd.google-apps.spreadsheet' });
  const kof = new FakeSpreadsheet(SHEET, 'KOF lists');
  kof.sheets[0].setName('P0 KOFs');
  kof.sheets[0].rows = [['Handle', 'List'], ['@SomeoneOnlyOnP0', 'P0 KOFs']];
  const global = kof.insertSheet('SLRR Global INFs');
  global.sheetId = 4242;
  global.rows = [['Handle', 'Name', 'List', 'Network', 'Followers', 'Notes', 'Profile']].concat(Array.from({ length: 3000 }, (_, i) =>
    [`@kof${i}`, `Person Number ${i}`, 'SLRR Global INFs', 'X / Twitter', `${(i * 37) % 900 + 100}K followers`,
      'Technology journalist who covers AI, search and the cloud; based in the United States', `https://x.com/kof${i}`]));
  g.spreadsheets.set(SHEET, kof);
  const res = t.sheet().getSheetByName('Resources');
  const status = () => res.rows.slice(1).map(r => String(r[4] || ''));
  res.rows = [res.rows[0],
    ['KOF lists', `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=4242`, 'Who counts as a KOF', 'Yes', ''],
    ['KOF lists, every tab', `https://docs.google.com/spreadsheets/d/${SHEET}/edit?usp=sharing`, '', '', ''],
    ['An old tab link', `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=999`, '', '', '']];
  t.poll();
  const docs = t.bot.loadKnowledge_(t.sheet()).docs;
  const one = docs.find(d => d.name === 'KOF lists');
  assert.ok(one.text.length > 400000, String(one.text.length));
  assert.ok(one.text.startsWith('[Tab: SLRR Global INFs]\nHandle | Name | List | Network | Followers | Notes | Profile\n@kof0 | Person Number 0 |'));
  assert.ok(one.text.includes('\n@kof2999 | Person Number 2999 |') && !one.text.includes('P0 KOFs'), 'every KOF, and only that tab');
  assert.match(status()[0], /^✓ Read Oct 14, \d{1,2}:\d\d [AP]M EDT · Google Sheet, tab "SLRR Global INFs" · [\d,]+ characters$/);
  const every = docs.find(d => d.name === 'KOF lists, every tab');
  assert.ok(every.text.startsWith('[Tab: P0 KOFs]') && every.text.includes('[Tab: SLRR Global INFs]'));
  assert.match(status()[1], / · Google Sheet \(2 tabs\) · /);
  eq(status()[2], '✗ The tab this link points to isn\'t in the spreadsheet anymore: open the tab you want and paste its link from the ' +
    'address bar, or link the whole spreadsheet (Share > Copy link) to read every tab.');
  // An alert by one of the 3,000: the review's documents (100,000 characters) hold that KOF's row
  const k = t.bot.knowledgeFor_({ docs: [one] }, { text: 'a post about AI answers in search', phrases: [], handles: ['@kof2718'] }, { budget: 100000 });
  eq(k.docs.map(d => d.whole), [false]);
  assert.ok(k.text.includes('@kof2718 | Person Number 2718 | SLRR Global INFs |'), k.text.slice(0, 600));
});

test('knowledge base: a copy made the old way (the KOF lists link to its SLRR Global INFs tab, read with every tab) is read again on the next run after the update, without waiting for Drive\'s 15-minute check; each read is in the run log; then it waits for Drive again', () => {
  const t = e2e();
  t.bot.setup();
  const g = t.g;
  const SHEET = '1KbKofListsSheet00000001';
  driveFile(g, SHEET, { name: 'KOF lists', mimeType: 'application/vnd.google-apps.spreadsheet' });
  const kof = new FakeSpreadsheet(SHEET, 'KOF lists');
  kof.sheets[0].setName('P0 KOFs');
  kof.sheets[0].rows = [['Handle', 'List'], ['@SomeoneOnlyOnP0', 'P0 KOFs']];
  const global = kof.insertSheet('SLRR Global INFs');
  global.sheetId = 4242;
  global.rows = [['Handle', 'List'], ['@TheChiefNerd', 'Viral KOFs (KOFs)']];
  g.spreadsheets.set(SHEET, kof);
  const URL = `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=4242`;
  const res = t.sheet().getSheetByName('Resources');
  res.rows = [res.rows[0], ['KOF lists', URL, 'Who counts as a KOF', 'Yes', '']];
  const readLine = /^knowledge base: KOF lists: ✓ Read Oct 14, \d{1,2}:\d\d [AP]M EDT · Google Sheet, tab "SLRR Global INFs" · \d+ characters$/;
  t.poll();
  eq(g.logs.filter(l => readLine.test(l)).length, 1);
  // What the build before kept: every tab, from a reader with no mark, and a state from then (next Drive check 15 minutes out)
  const cache = t.sheet().getSheetByName('Knowledge cache (bot)');
  const metaRow = cache.rows.find(r => r[0] === URL && Number(r[1]) === 0);
  const meta = JSON.parse(metaRow[2]);
  delete meta.reader;
  meta.label = 'Google Sheet (2 tabs)';
  metaRow[2] = JSON.stringify(meta);
  cache.rows.find(r => r[0] === URL && Number(r[1]) === 1)[2] = '[Tab: SLRR Global INFs]\nHandle | List\n@TheChiefNerd | Viral KOFs (KOFs)\n\n' +
    '[Tab: P0 KOFs]\nHandle | List\n@SomeoneOnlyOnP0 | P0 KOFs';
  const state = JSON.parse(g.props.get('KNOWLEDGE_STATE'));
  delete state.reader;
  g.props.set('KNOWLEDGE_STATE', JSON.stringify(state));
  assert.ok(t.bot.loadKnowledge_(t.sheet()).docs[0].text.includes('@SomeoneOnlyOnP0'));
  const driveCalls = () => g.fetches.filter(f => f.url === t.bot.driveMetaUrl_(SHEET)).length;
  const before = driveCalls();
  t.poll();
  assert.ok(driveCalls() > before);
  eq(t.bot.loadKnowledge_(t.sheet()).docs.map(d => [d.label, d.text]),
    [['Google Sheet, tab "SLRR Global INFs"', '[Tab: SLRR Global INFs]\nHandle | List\n@TheChiefNerd | Viral KOFs (KOFs)']]);
  assert.match(String(res.rows[1][4]), /^✓ Read Oct 14, \d{1,2}:\d\d [AP]M EDT · Google Sheet, tab "SLRR Global INFs" · \d+ characters$/);
  eq(g.logs.filter(l => readLine.test(l)).length, 2);
  const after = driveCalls();
  t.poll();  // read the new way: nothing more until Drive's next check
  eq([driveCalls(), g.logs.filter(l => readLine.test(l)).length], [after, 2]);
});

/** A Google Doc the fake Drive knows, for the tab-safety tests below. */
const SAFE_DOC = '1KbEscalationPlaybookDoc01';
const SAFE_DOC_URL = `https://docs.google.com/document/d/${SAFE_DOC}/edit`;
const SAFE_DOC_TEXT = 'Escalation playbook\n\nWaymo remote-operator posts go to the Waymo comms team.';

test('knowledge base: renaming the Resources tab (even to "Knowledge", as happened live) loses nothing: the bot still finds it by its header row, writes only its Bot status column, never makes a second Resources tab, and keeps the text in its own tab', () => {
  const t = e2e();
  t.bot.setup();
  const ss = t.sheet();
  driveFile(t.g, SAFE_DOC, { name: 'Escalation playbook' }, SAFE_DOC_TEXT);
  const res = ss.getSheetByName('Resources');
  res.rows.push(['Escalation playbook', SAFE_DOC_URL, 'Who gets which alert', 'No', '']);
  res.setName('Knowledge');
  const typed = () => res.rows.map(r => r.slice(0, 4));  // what people write: Name · Link · What it covers · Burson can see it?
  const before = typed();
  t.bot.refreshKnowledge();
  t.poll();
  t.bot.setup();
  t.poll();
  eq(ss.sheets.map(sh => sh.name), ['Control', 'Knowledge', 'Guidance', 'Alert log', 'Message log', 'Knowledge cache (bot)']);
  eq(typed(), before);
  assert.match(String(res.rows[3][4]), new RegExp(`^✓ Read Oct 14, \\d{1,2}:\\d\\d [AP]M EDT · Google Doc · ${SAFE_DOC_TEXT.length} characters$`));
  eq(t.bot.loadKnowledge_(ss).docs.map(d => [d.name, d.burson, d.text]), [['Escalation playbook', false, SAFE_DOC_TEXT]]);
  eq(t.bot.readResourceRows_(ss).map(r => [r.row, r.name, r.burson]),
    [[2, 'SLRR Collection Requirements', true], [3, 'KOF lists', true], [4, 'Escalation playbook', false]]);
});

test('knowledge base: the bot never reads, clears, hides or writes a tab it didn\'t make, even one named "Knowledge cache (bot)" (here the Resources tab, renamed to it): Bot status, setup() and status() say what\'s in the way, and once it\'s renamed the bot makes its own tab', () => {
  const t = e2e();
  t.bot.setup();
  const ss = t.sheet();
  driveFile(t.g, SAFE_DOC, { name: 'Escalation playbook' }, SAFE_DOC_TEXT);
  const res = ss.getSheetByName('Resources');
  res.rows.push(['Escalation playbook', SAFE_DOC_URL, 'Who gets which alert', '', '']);
  ss.sheets = ss.sheets.filter(sh => sh.name !== 'Knowledge cache (bot)');  // someone deletes the bot's tab...
  res.setName('Knowledge cache (bot)');                                      // ...and gives the Resources tab its name
  const typed = () => res.rows.map(r => r.slice(0, 4));
  const before = typed();
  const protections = res.protections.length;
  const inTheWay = 'a tab named "Knowledge cache (bot)" that the bot didn\'t make is in the way. Rename that tab, and the bot makes its own.';
  t.poll();
  const forced = t.bot.refreshKnowledge();
  const s = t.bot.setup();
  t.poll();
  eq(ss.sheets.map(sh => sh.name), ['Control', 'Knowledge cache (bot)', 'Guidance', 'Alert log', 'Message log']);  // nothing made, nothing doubled
  eq(typed(), before);
  eq([res.isSheetHidden(), res.protections.length], [false, protections]);
  eq(res.rows.slice(1).map(r => r[4]), [1, 2, 3].map(() => `✗ Not read: ${inTheWay}`));
  eq([forced.blocked, s.knowledge, t.bot.status().knowledge], [true, `Nothing read: ${inTheWay}`, `Nothing read: ${inTheWay}`]);
  eq(t.bot.loadKnowledge_(ss).docs, []);
  assert.throws(() => t.bot.writeKnowledgeTab_(res, new Map()), /isn't the bot's storage tab: left as it is/);
  eq(typed(), before);

  res.setName('Resources');  // renamed back: the next run makes the bot's own tab and reads the documents
  t.poll();
  eq(ss.sheets.map(sh => sh.name), ['Control', 'Resources', 'Guidance', 'Alert log', 'Message log', 'Knowledge cache (bot)']);
  eq(typed(), before);
  assert.match(String(res.rows[3][4]), /^✓ Read Oct 14, \d{1,2}:\d\d [AP]M EDT · Google Doc · \d+ characters$/);
  eq(t.bot.loadKnowledge_(ss).docs.map(d => d.name), ['Escalation playbook']);
});

test('knowledge base: the live mix-up and its fix: the earlier build wrote its text over the Resources tab people had renamed "Knowledge" and made a new Resources tab; this build never touches "Knowledge", and rows put back from version history are read on the next run', () => {
  const t = e2e();
  t.bot.setup();
  const ss = t.sheet();
  driveFile(t.g, SAFE_DOC, { name: 'Escalation playbook' }, SAFE_DOC_TEXT);
  // What the earlier build left: the person's tab, renamed "Knowledge", holding that build's text; the Resources tab that
  // build made (the two starting rows); none of this build's storage tab
  ss.sheets = ss.sheets.filter(sh => sh.name !== 'Knowledge cache (bot)');
  const made = ss.getSheetByName('Resources');
  const old = ss.insertSheet('Knowledge', 2);
  old.rows = [['Link', 'Part', 'Text'], [RES()[0].url, 0, JSON.stringify({ url: RES()[0].url, status: 'ok', name: 'SLRR Collection Requirements' })],
    [RES()[0].url, 1, 'The earlier build\'s copy']];
  const oldRows = JSON.stringify(old.rows);
  t.poll();
  eq([JSON.stringify(old.rows) === oldRows, old.isSheetHidden(), old.protections.length], [true, false, 0]);
  eq(ss.sheets.map(sh => sh.name), ['Control', 'Resources', 'Knowledge', 'Guidance', 'Alert log', 'Message log', 'Knowledge cache (bot)']);

  // The fix: the person's rows, copied from version history (a tab from before the knowledge base: three columns), in
  // place of the tab the earlier build made. Found by its header row even before it's renamed.
  ss.sheets = ss.sheets.filter(sh => sh !== made);
  const back = ss.insertSheet('Copy of Resources', 1);
  back.rows = [['Name', 'Link', 'What it covers'], ['SLRR Collection Requirements', RES()[0].url, 'The alert requirements'],
    ['Escalation playbook', SAFE_DOC_URL, 'Who gets which alert']];
  t.poll();
  eq(back.rows.map(r => r.slice(0, 4)), [['Name', 'Link', 'What it covers', 'Burson can see it?'],
    ['SLRR Collection Requirements', RES()[0].url, 'The alert requirements', 'Yes'], ['Escalation playbook', SAFE_DOC_URL, 'Who gets which alert', '']]);
  assert.match(String(back.rows[2][4]), /^✓ Read Oct 14, \d{1,2}:\d\d [AP]M EDT · Google Doc · \d+ characters$/);
  eq(t.bot.loadKnowledge_(ss).docs.map(d => [d.name, d.burson]), [['Escalation playbook', false]]);
  back.setName('Resources');
  t.poll();
  eq(ss.sheets.map(sh => sh.name), ['Control', 'Resources', 'Knowledge', 'Guidance', 'Alert log', 'Message log', 'Knowledge cache (bot)']);
  eq(t.bot.loadKnowledge_(ss).docs.map(d => d.name), ['Escalation playbook']);
  assert.strictEqual(JSON.stringify(old.rows), oldRows);
});

test('chatMarkupText_ & Q&A replies: converts CommonMark **bold**, __bold__, # headings, and * bullets to Google Chat markup without touching code spans or URLs', () => {
  const md = [
    '### Action Checklist',
    '**1. Review and send the email draft:** Go to Gmail Drafts in tester@testing.test. Check the drafted Social Alert to confirm all details look accurate, ensure the **From** field is set to **Brand Social**, and hit **Send**.',
    '**2. Submit the Trust & Safety form:** Because the author is on the **Viral KOFs** list, the bot will post a pre-filled [T&S Intake Form](https://docs.testing.test/forms/1) link in the chat space. Review the fields and click **Submit**.',
    '**3. (Optional) To skip:** If you determine no action is needed, simply delete the draft in Gmail.',
    '* Keep inline `**literal**` and https://docs.testing.test/path/*star*/view and FOO__BAR untouched, while __double_under__ becomes bold.',
  ].join('\n');
  const out = B.chatMarkupText_(md);
  assert.ok(!out.includes('**1.'), out);
  assert.ok(!out.includes('**From**'), out);
  assert.ok(!out.includes('**Brand Social**'), out);
  assert.ok(!out.includes('**Send**'), out);
  assert.ok(!out.includes('**Submit**'), out);
  assert.ok(!out.includes('###'), out);
  assert.ok(out.includes('*Action Checklist*'), out);
  assert.ok(out.includes('*1. Review and send the email draft:*'), out);
  assert.ok(out.includes('ensure the *From* field is set to *Brand Social*, and hit *Send*.'), out);
  assert.ok(out.includes('*Viral KOFs*'), out);
  assert.ok(out.includes('<https://docs.testing.test/forms/1|T&S Intake Form>'), out);
  assert.ok(out.includes('*3. (Optional) To skip:*'), out);
  assert.ok(out.includes('- Keep inline `**literal**` and https://docs.testing.test/path/*star*/view and FOO__BAR untouched, while *double_under* becomes bold.'), out);

  // End-to-end analyst Q&A in B4/B10 and Burson Q&A strip Markdown ** before posting to Chat
  const w = world({ drafts: { live: false, mailbox: 'tester@testing.test', from: 'Brand Social <tester@testing.test>' } });
  const src = w.paste(F.AIO);
  w.run();
  const [fwd] = w.analystPosts().filter(m => !m.threadReply);
  w.vertex.answer = () => '**1. Review and send the email draft:** Ensure **From** is **Brand Social** and hit **Send**.';
  w.chat.say(w.ANA, 'what do I need to do?', { thread: fwd.thread.name, sender: 'users/im_lead' });
  w.run();
  const anaMsg = w.analystPosts().filter(m => m.threadReply && m.thread.name === fwd.thread.name).pop();
  eq(anaMsg.text, '*1. Review and send the email draft:* Ensure *From* is *Brand Social* and hit *Send*.');
  assert.ok(!anaMsg.text.includes('**'));

  w.vertex.answer = () => '**All set:** this alert is already **handled** and needs no changes.';
  w.reply(src, 'Is anything else needed on this alert?');
  w.run();
  const burMsg = w.bursonPosts().pop();
  eq(burMsg.text, '*All set:* this alert is already *handled* and needs no changes.');
  assert.ok(!burMsg.text.includes('**'));
});

test('multi-product alerts: parses compound [Product] lines, enriches via Gemini other_products without nagging Burson, rebuilds cards, routes all product POCs, and shows all products in emails and Early Catch notes', () => {
  // 1. Compound [Product] line splits outside parentheses while keeping single comma-containing product names intact
  const multiAlert = F.P0_OK.replace('[Product]: Search', '[Product]: Gemini App, AI Overviews (AIM, Web Guide)');
  const pMulti = parse(multiAlert);
  eq(pMulti.fields.product, 'Gemini App');
  eq(plain(pMulti.fields.other_products), ['AI Overviews (AIM, Web Guide)']);

  const slashSingleAlert = F.P0_OK.replace('[Product]: Search', '[Product]: Ads/Merchant Center');
  const pSlashSingle = parse(slashSingleAlert);
  eq(pSlashSingle.fields.product, 'Ads/Merchant Center');
  eq(pSlashSingle.fields.other_products, undefined);

  const parenSingleAlert = F.P0_OK.replace('[Product]: Search', '[Product]: AI Overviews (AIM, Web Guide)');
  const pParenSingle = parse(parenSingleAlert);
  eq(pParenSingle.fields.product, 'AI Overviews (AIM, Web Guide)');
  eq(pParenSingle.fields.other_products, undefined);

  // 2. Gemini proposes other_products on a single-product Zapier card -> silentFix (never asks Burson to resend),
  //    rebuilds card header + [Product] line with both products, and round-trips cleanly
  const pixelAlert = F.P0_OK
    .replace('Search | Alleged Bias in Search Reporting for Paris Riots 2026 | X | 1 Engagements',
      'Pixel | Pixel 9 Emergency Dialer Freeze After Android Update | X | 1 Engagements')
    .replace('[Product]: Search', '[Product]: Pixel')
    .replace('[Name]: Alleged Bias in Search Reporting for Paris Riots 2026 / New / not previously reported over the past 14 days',
      '[Name]: Pixel 9 Emergency Dialer Freeze After Android Update / New / not previously reported over the past 14 days');
  const parsedPx = parse(pixelAlert);
  const androidCanon = 'Android (Android OS & Google TV)';
  const revPx = review(pixelAlert, {
    llm: {
      checks: B.ev('GEN').llm_checks.map(c => ({ id: c.id, ok: true, confidence: 0.98, finding: '' })),
      other_products: ['Android', 'Pixel', 'Brand'],
      social_alert: { warranted: true, confidence: 0.96, reason: 'Safety-critical emergency dialer freeze', signal_class: 'structural_threat' },
    },
  });
  eq(revPx.fixes, []);
  eq(revPx.silentFixes.map(x => x.field), ['other_products']);
  eq(plain(revPx.fields.other_products), [androidCanon]);
  const rebuiltPx = B.rebuildAlert_(pixelAlert, parsedPx, revPx.fields, revPx.changed);
  assert.ok(rebuiltPx.includes(`SOCIAL ALERT\u2b1b: Pixel, ${androidCanon} | Pixel 9 Emergency Dialer Freeze After Android Update`), rebuiltPx);
  assert.ok(rebuiltPx.includes(`[Product]: Pixel, ${androidCanon}`), rebuiltPx);
  const reparsedPx = parse(rebuiltPx);
  eq(reparsedPx.fields.product, 'Pixel');
  eq(plain(reparsedPx.fields.other_products), [androidCanon]);
  assert.match(B.changeNoteText_(revPx), /\n- Other Google Products: added Android \(Android OS & Google TV\)/);

  // 3. Escalation, recipient routing, Social Alert email, and T&S single-select dropdown compatibility
  const escPx = B.escalation_(revPx.fields, { now: NOW });
  eq(plain(escPx.other_products), [androidCanon]);
  const planPx = B.planRecipients_(escPx, escPx.text, []);
  assert.ok(planPx.groups.includes('Pixel') && planPx.groups.includes(androidCanon), JSON.stringify(planPx.groups));
  const inputPx = B.emailInput_(revPx.fields, escPx, false);
  const mailPx = B.socialAlertEmail_(inputPx, planPx, { standIn: 'reviewer@testing.test' });
  assert.ok(mailPx.subject.includes(`Pixel, ${androidCanon} | Pixel 9 Emergency Dialer Freeze After Android Update`), mailPx.subject);
  assert.ok(mailPx.html.includes(`>Product</td><td style="padding: 8px; border: 1px solid #ddd; font-size: 14px;">Pixel, Android (Android OS &amp; Google TV)</td>`), mailPx.html);
  assert.ok(mailPx.text.includes(`\nProduct: Pixel, ${androidCanon}\n`), mailPx.text);
  // T&S form dropdown stays a single valid choice, falling back to secondary product when primary maps to Other
  const tnsFallback = B.tnsFormValues_(B.emailInput_(
    { product: 'Brand', other_products: ['Gemini App'], issue_name: 'Hallucination screenshot', post_url: 'https://x.com/u/status/99' },
    { product: 'Brand', other_products: ['Gemini App'], exposure_tag: 'Product - Dangerous results (e.g. medical/legal)' }, false));
  eq(tnsFallback.product, 'Gemini');

  // 4. Watch / Other alerts & BSIP Direct BigQuery cards show all applicable products
  const slrrLine = B.otherSlrrLine_({
    tri: { slrr: { is: true, tag: 'Product - Dangerous results (e.g. medical/legal)', priority: 'P0', product: 'Gemini App', others: ['AI Overviews'], topics: [], confidence: 0.95 } },
    slrr: null,
  });
  assert.ok(slrrLine.includes('Gemini App, AI Overviews'), slrrLine);
  const bsipCard = B.formatBsipSonarAlertText_({
    url: 'https://x.com/user1/status/777',
    handle: '@user1',
    network: 'X',
    alert_names_json: JSON.stringify(['Gemini App - Accuracy', 'AI Overviews - Quality']),
    tags: 'Product - Factual inaccuracies (not dangerous/offensive)',
    total: 850,
    issue_name: 'Cross-product AI answer mismatch',
    post_time: '2026-10-14T12:00:00Z',
  });
  assert.ok(bsipCard.includes('[Product]: Gemini App, AI Overviews'), bsipCard);
});

// =============================================================================================================
// The switches (Control tab rows 11-21) and what each turns on: one file each, test/switch_*.test.js, given these
// helpers. They run before the leak audit below, so what they post in a Burson space is audited too.
// =============================================================================================================

/**
 * Marks someone on the Relay names tab, as a person would (how they show on what's copied from S-F Burson: "Name
 * (Burson)" or "Name (Google)"): their org (Burson or Google) and, when given, their name; their row is added when the relay hasn't seen them.
 */
function markAs(t, user, org, name) {
  const nm = t.bot.relayNames_(t.sheet());  // the tab as the bot reads it (its one-time clean-up done first)
  if (!nm.names.has(user)) {
    nm.addName({ user, name: name || '', org, seen_in: 'S-F Burson', example: '' });
    return;
  }
  const tab = t.sheet().getSheetByName('Relay names');
  const head = tab.rows[0];
  const r = tab.rows.findIndex(row => row[head.indexOf('user')] === user);
  tab.getRange(r + 1, head.indexOf('org') + 1).setValue(org);
  if (name) tab.getRange(r + 1, head.indexOf('name') + 1).setValue(name);
}

// The leak audit's own lists (below; not the bot's guard): what a text in a Burson space must never hold. The first
// words of the notes the bot posts under a card in the Auto-correct space (ThreadNotes.gs; Voice.gs THREAD_NOTE_HEADS_)
// are on it: at the start of a text or of a line, after an emoji and one of Chat's marks (bold, italic, struck through)
// or not, and as a note has them anywhere, the colon inside the mark or after it (never "the alert requirements" in a
// sentence: the bot's answers to Burson say that). H.leakDenied: for the test files.
const LEAK_DENY_ = /\bforward(?:ed|ing|s)?\b|analyst\s+space|clean(?:\s+data)?\s+space|triage(?:d)?\s+(?:space|alerts)|second\s+space|reduc(?:e|ing)\s+reliance|replace\s+burson|\bgo\/|@\w+\.com|brand-social-sends|AAQAaLn375E|ANALYST|SLRR Triaged Alerts/i;
const LEAK_NOTE_HEADS_ = /(?:^|\n)[ \t]*(?:[^\x00-\x7F]{1,8}[ \t]+)?[*_~]?(?:Also flagged by the watch|Part of a story|Alert requirements)(?![A-Za-z0-9])|[Ff]lagged by the watch(?![A-Za-z0-9])|Part of a story[*_~]?:|Alert requirements(?:, final)?[*_~]?:|(?<![A-Za-z0-9])Same story: \d[\d,]* more posts?(?![A-Za-z0-9])|(?<![A-Za-z0-9])Growing:\*? \d[\d,]* accounts now(?![A-Za-z0-9])/;
const leakDenied = t => LEAK_DENY_.test(t) || LEAK_NOTE_HEADS_.test(t);
// The bot's own answer to a question of Burson's is no such note, though it can open with the same words (Gemini writes
// it from a context whose rules stand under "[Alert requirements]"), and it goes to Burson as it always did (Outbox.gs
// outboxOwnAnswerKey_). A test that lets such an answer reach a Burson space names its text with
// H.ownAnswerInBurson(text): the audit takes that very text for the answer it is. Everything else on the lists still
// counts against it.
const LEAK_OWN_ANSWERS_ = new Set();
const ownAnswerInBurson = text => { LEAK_OWN_ANSWERS_.add(String(text)); };
// What the audit below holds against a text posted in a Burson space (H.leakAuditDenied: so its rule is tested too)
const leakAuditDenied = t => LEAK_DENY_.test(t) || (LEAK_NOTE_HEADS_.test(t) && !LEAK_OWN_ANSWERS_.has(t));

const H = { assert, F, B, NOW, test, eq, plain, parse, review, world, e2e, collectBurson, makeGoogle, loadBot, decodeMime,
  CHAT_POSTS, FakeSpreadsheet, GUARD, ANALYST_NAME, TEST_FEED, TRIAGED, REAL, VENDOR, CELL, RES, KB, driveFile, resultsRow,
  resultsRows, MAPS_LOW, MISTAKES_NO_LINK, bursonTexts, markAs, leakDenied, ownAnswerInBurson, leakAuditDenied };
require('fs').readdirSync(__dirname).filter(f => /^switch_.+\.test\.js$/.test(f)).sort().forEach(f => require('./' + f)(H));

// =============================================================================================================
// Leak audit: everything any test posted in a Burson space, checked with a separate list (not the bot's guard)
// =============================================================================================================

test('nothing posted in a Burson space mentions the second analyst space, forwarding, reducing reliance on Burson, or internal emails/ids, or starts as a note the bot posts under a card in the Auto-correct space', () => {
  assert.ok(bursonTexts.length >= 8, `only ${bursonTexts.length} Burson texts collected`);
  for (const t of bursonTexts) assert.ok(!leakAuditDenied(t), t);
  const legend = new Set(B.ev('GEN').legend.map(a => a.emoji));
  for (const e of bursonReactions) {
    assert.ok(legend.has(e) || legend.has(e + '\uFE0F'), `unexpected reaction ${e}`);
    assert.notStrictEqual(e, '👎');
  }
});

test('every message the bot posts (its replies and the Mirror\'s copies) is read with Chat\'s own markup, so a <link|text> shows as its text, *bold* is bold and <users/…> is a mention', () => {
  assert.ok(CHAT_POSTS.length >= 50, `only ${CHAT_POSTS.length} posts seen`);
  const bad = CHAT_POSTS.filter(p => p.markupSyntax !== 'MARKUP_SYNTAX_CHAT');
  eq(bad.slice(0, 3), []);
  assert.ok(CHAT_POSTS.some(p => /<https:\/\/docs\.google\.com\/forms\/[^|>]+\|Open the (?:test copy of the )?T&S Intake Form, pre-filled>/.test(p.text)));
});

// =============================================================================================================

const only = process.argv[2];
let failed = 0;
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  try {
    t.fn();
    console.log('ok   ' + t.name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + t.name + '\n     ' + String((e && e.stack) || e).split('\n').slice(0, 20).join('\n     '));
  }
}
const ran = tests.filter(t => !only || t.name.includes(only)).length;
console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed ? 1 : 0);
