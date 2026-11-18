// Gemini Decisions client (Decisions.gs) and ApiGuard decisions ceilings (ApiGuard.gs) — Section 5A.
// Uses recorded Gemini Decisions API responses and real Nov 6-12, 2026 archive signals (decisions_fixtures.json).
'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function (H) {
  const { assert, NOW, test, eq, makeGoogle, loadBot } = H;
  const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'decisions_fixtures.json'), 'utf8'));
  const TEST_KEY = 'test-only-decisions-key-value-99';

  function makeEnv(responder) {
    const g = makeGoogle(NOW);
    const warnings = [];
    const errors = [];
    const fetches = [];
    let secretCalls = 0;
    let secretReply = () => ({
      code: 200,
      body: { payload: { data: Buffer.from(TEST_KEY, 'utf8').toString('base64') } },
    });
    const origFetch = g.services.UrlFetchApp.fetch;
    g.services.UrlFetchApp.fetch = (url, params) => {
      const u = String(url);
      if (u.includes('secretmanager.googleapis.com/')) {
        secretCalls++;
        fetches.push({ kind: 'secret', url: u, params });
        const s = secretReply(u, params);
        return {
          getResponseCode: () => s.code,
          getContentText: () => (typeof s.body === 'string' ? s.body : JSON.stringify(s.body)),
          getHeaders: () => ({}),
        };
      }
      if (u.includes('/decisions')) {
        fetches.push({ kind: 'decisions', url: u, params });
        const r = responder(u, params, g.clock);
        return {
          getResponseCode: () => r.code,
          getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
          getHeaders: () => ({}),
        };
      }
      return origFetch(url, params);
    };
    const bot = loadBot(g.services, g.clock);
    bot.console = {
      log() {},
      warn: m => warnings.push(String(m)),
      error: m => errors.push(String(m)),
    };
    return {
      g,
      bot,
      fetches,
      warnings,
      errors,
      secretCalls: () => secretCalls,
      setSecret: fn => { secretReply = fn; },
    };
  }

  test('decisions client (5A): Secret Manager key header, endpoint, session caching, and recorded noul / choice / score parsing', () => {
    let reply = { code: 200, body: FX.probe.doc_multi.response.body };
    const env = makeEnv((_u, _p, clock) => {
      clock.now += 340;
      return reply;
    });
    const { bot, g, fetches } = env;

    eq(bot.decUrl_(), 'https://generativelanguage.googleapis.com/v1beta/decisions');
    eq([bot.ev('DEC_API_VERSION_'), bot.ev('DEC_MODEL_'), bot.ev('DEC_SECRET_')], ['v1beta', 'gemini-decision-1', 'agentic_assistant']);

    const session = bot.decSession_(() => 90 * 1000, false);
    const multiReq = FX.probe.doc_multi.request;
    const res1 = bot.decisionsAsk_('Customer audio cuts out on the left earcup.', multiReq.questions, session);
    eq(res1.ok, true);
    eq([res1.tokens, res1.ms, env.secretCalls(), fetches.length], [324, 340, 1, 2]);

    // Verify Secret Manager call matches house pwBwToken_ pattern and key goes only in x-goog-api-key header
    const secCall = fetches[0];
    assert.strictEqual(
      secCall.url,
      `https://secretmanager.googleapis.com/v1/projects/${bot.ev('GCP_PROJECT')}/secrets/agentic_assistant/versions/latest:access`
    );
    eq(secCall.params.headers['x-goog-user-project'], bot.ev('GCP_PROJECT'));
    assert.match(secCall.params.headers.Authorization, /^Bearer /);

    const decCall = fetches[1];
    eq(decCall.url, 'https://generativelanguage.googleapis.com/v1beta/decisions');
    assert.ok(!decCall.url.includes(TEST_KEY), 'key never appears in URL');
    eq(decCall.params.headers['x-goog-api-key'], TEST_KEY);
    const sent = JSON.parse(decCall.params.payload);
    eq([sent.model, sent.input], ['gemini-decision-1', 'Customer audio cuts out on the left earcup.']);

    // Verify parsed noul, choice, and score answers
    eq(res1.answers.is_defect.type, 'noul');
    assert.ok(res1.answers.is_defect.p > 0.93 && res1.answers.is_defect.confidence > 0.93);
    eq([res1.answers.next_action.type, res1.answers.next_action.choice], ['choice', 'human_escalation']);
    assert.ok(res1.answers.next_action.probabilities.replacement_shipment > 0.24);
    eq([res1.answers.churn_risk.type, res1.answers.churn_risk.level, res1.answers.churn_risk.probabilities.length], ['score', 3, 4]);
    assert.ok(res1.answers.churn_risk.score > 2.98);

    // Second call in the same session reuses in-memory session.key without re-calling Secret Manager
    reply = { code: 200, body: FX.probe.doc_quickstart.response.body };
    const res2 = bot.decisionsAsk_(FX.probe.doc_quickstart.request.input, FX.probe.doc_quickstart.request.questions, session);
    eq([res2.ok, res2.answers.is_damaged.p, env.secretCalls(), session.asked], [true, 0.99, 1, 2]);

    // Verify key is never persisted in PropertiesService or CacheService
    for (const [, v] of g.props.entries()) assert.ok(!String(v).includes(TEST_KEY));
    for (const [, v] of g.cache.entries()) assert.ok(!String(v.val || v).includes(TEST_KEY));

    // Verify decSignalAsk_ + decCompact_ + decP0Mass_ across all 8 real archive signals with recorded API responses
    const respIds = Object.keys(FX.signal_responses);
    eq(respIds.length, 8);
    const sigSession = bot.decSession_(() => 120 * 1000, false);
    for (const id of respIds) {
      const row = FX.signals.find(s => s.alert_id === id);
      reply = { code: 200, body: FX.signal_responses[id] };
      const out = bot.decSignalAsk_(row, sigSession);
      eq(out.ok, true, id);
      assert.ok(out.tokens >= 2900, `${id}: expected token count, got ${out.tokens}`);
      ['g', 'r', 'i', 'n', 'cp', 'p0', 's', 'sc'].forEach(k => assert.strictEqual(typeof out.dec[k], 'number', `${id}.${k}`));
      assert.ok(out.dec.l >= 0 && out.dec.l <= 4 && out.dec.sp.length === 5, id);
      assert.ok(out.dec.c.length >= 1 && out.dec.c.length <= 128, id);
    }

    // Verify fallback confidence computation when optional confidence field is omitted (Decision 12(i))
    eq(bot.decAnswer_({ type: 'noul', noul: 0.2 }, { type: 'noul' }), { type: 'noul', p: 0.2, confidence: 0.8 });
    eq(
      bot.decAnswer_({ type: 'choice', choice: 'a', probabilities: { a: 0.7, b: 0.3 } }, { type: 'choice', criteria: { a: 'A', b: 'B' } }),
      { type: 'choice', choice: 'a', p: 0.7, probabilities: { a: 0.7, b: 0.3 }, confidence: 0.7 }
    );
    eq(
      bot.decAnswer_({ type: 'score', score: 1.4, probabilities: { '0': 0.1, '1': 0.6, '2': 0.3 } }, { type: 'score', criteria: ['l0', 'l1', 'l2'] }),
      { type: 'score', score: 1.4, level: 1, probabilities: [0.1, 0.6, 0.3], confidence: 0.6 }
    );
    eq(bot.decAnswer_({ type: 'choice', choice: 'unknown', probabilities: { unknown: 1 } }, { type: 'choice', criteria: { a: 'A', b: 'B' } }), null);
    eq(bot.decAnswer_({ type: 'score', score: 5, probabilities: { '0': 0.5, '1': 0.5 } }, { type: 'score', criteria: ['l0', 'l1'] }), null);
  });

  test('decisions client (5A): ApiGuard decisions rolling ceilings, run-deadline gate, SLA-busy gate, and pre-call counting', () => {
    let midCallCounts = null;
    const env = makeEnv(() => {
      midCallCounts = {
        guard: env.bot.apiGuardDecisionsCounts_(),
        state: env.bot.decState_(env.g.services.PropertiesService.getScriptProperties(), env.g.clock.now),
      };
      return { code: 200, body: FX.probe.doc_quickstart.response.body };
    });
    const { bot, g, fetches } = env;
    const q = FX.probe.doc_quickstart.request.questions;
    const props = g.services.PropertiesService.getScriptProperties();

    // Zero Decisions calls leaves existing Gemini/BigQuery bucket shape untouched (no `d` key)
    bot.apiGuardNote_('gemini', 2);
    const rawBefore = g.services.CacheService.getScriptCache().get('api_guard_v1');
    assert.ok(!rawBefore.includes('"d"'), rawBefore);
    eq(bot.apiGuardDecisionsCounts_(), { decisions10m: 0, decisions60m: 0 });
    eq(bot.apiGuardAllowDecisions_(), true);

    // Gate checks skip without touching Secret Manager or UrlFetchApp
    eq(bot.decisionsAsk_('hi', q, bot.decSession_(() => 60000, true)), { ok: false, skipped: true, why: 'the alerts come first' });
    eq(bot.decisionsAsk_('hi', q, bot.decSession_(() => 19999, false)), { ok: false, skipped: true, why: 'too little of the run left' });
    eq(bot.decisionsAsk_('   ', q, bot.decSession_(() => 60000, false)), { ok: false, skipped: true, why: 'nothing to ask' });
    eq(bot.decisionsAsk_('hi', {}, bot.decSession_(() => 60000, false)), { ok: false, skipped: true, why: 'nothing to ask' });
    eq([env.secretCalls(), fetches.length], [0, 0]);

    // Pre-call counting happens before UrlFetchApp.fetch returns
    const s = bot.decSession_(() => 60000, false);
    eq(bot.decisionsAsk_('hi', q, s).ok, true);
    eq([midCallCounts.guard.decisions10m, midCallCounts.state.asked, s.asked], [1, 1, 1]);
    eq(bot.apiGuardCounts_(), { gemini10m: 2, gemini60m: 2, bq10m: 0, bq60m: 0 }); // Gemini/BQ counts unaffected

    // Per-check cap (DEC_MAX_PER_CHECK_ = 15)
    s.asked = bot.ev('DEC_MAX_PER_CHECK_');
    eq(bot.decisionsAsk_('hi', q, s), { ok: false, skipped: true, why: '15 calls this check' });

    // ApiGuard rolling 10m ceiling (30) and 60m ceiling (90)
    bot.apiGuardNote_('decisions', 29);
    eq([bot.apiGuardDecisionsCounts_().decisions10m, bot.apiGuardAllowDecisions_()], [30, false]);
    eq(bot.decisionsAsk_('hi', q, bot.decSession_(() => 60000, false)), { ok: false, skipped: true, why: 'too many calls lately' });

    g.clock.now += 11 * 60 * 1000; // 10m window cools; 60m has 30 < 90
    eq([bot.apiGuardDecisionsCounts_().decisions10m, bot.apiGuardDecisionsCounts_().decisions60m, bot.apiGuardAllowDecisions_()], [0, 30, true]);
    bot.apiGuardNote_('decisions', 60);
    g.clock.now += 11 * 60 * 1000; // 10m window cools again, but 60m is at 90
    eq([bot.apiGuardDecisionsCounts_().decisions10m, bot.apiGuardDecisionsCounts_().decisions60m, bot.apiGuardAllowDecisions_()], [0, 90, false]);
    g.clock.now += 55 * 60 * 1000; // past 60m: all buckets prune
    eq([bot.apiGuardDecisionsCounts_(), bot.apiGuardAllowDecisions_()], [{ decisions10m: 0, decisions60m: 0 }, true]);

    // Daily cap (DEC_MAX_PER_DAY_ = 150) + Control note text
    const st = bot.decState_(props, g.clock.now);
    st.asked = bot.ev('DEC_MAX_PER_DAY_');
    bot.decSaveState_(props, st);
    eq(bot.decisionsAsk_('hi', q, bot.decSession_(() => 60000, false)), { ok: false, skipped: true, why: '150 calls today' });
    assert.match(bot.decStatusText_(props, g.clock.now), /150 asked today · daily cap of 150 reached, more tomorrow$/);
  });

  test('decisions client (5A / Rule 4): live "too_many_requests" and documented "rate_limit_exceeded" 429s, missing/bad key, HTTP/JSON/slow/throw failures, safety refusals without pause, and key redaction', () => {
    let mode = '429_live';
    const env = makeEnv((_u, _p, clock) => {
      if (mode === '429_live') return { code: FX.error_429_live.status, body: FX.error_429_live.body };
      if (mode === '429_doc') return { code: FX.error_429_documented.status, body: FX.error_429_documented.body };
      if (mode === 'bad_key') return { code: FX.probe.error_bad_key.status, body: FX.probe.error_bad_key.body };
      if (mode === 'bad_req') return { code: FX.probe.error_one_option.status, body: FX.probe.error_one_option.body };
      if (mode === '503') return { code: 503, body: { error: { code: 'service_unavailable', message: 'Overloaded' } } };
      if (mode === 'bad_json') return { code: 200, body: '{not-json' };
      if (mode === 'missing_ans') return { code: 200, body: { answers: {}, usage: { total_input_tokens: 10 } } };
      if (mode === 'slow') {
        clock.now += 10500; // > DEC_SLOW_MS_ (10,000 ms)
        return { code: 200, body: FX.probe.doc_quickstart.response.body };
      }
      if (mode === 'throw_key') {
        throw new Error(`DNS lookup failed while sending header ${TEST_KEY} to host`);
      }
      if (mode.startsWith('refusal:')) {
        const code = mode.split(':')[1];
        return { code: 400, body: { error: { code, message: 'Blocked by policy' } } };
      }
      return { code: 200, body: FX.probe.doc_quickstart.response.body };
    });
    const { bot, g, fetches, warnings } = env;
    const props = g.services.PropertiesService.getScriptProperties();
    const q = FX.probe.doc_quickstart.request.questions;
    const PAUSE = bot.ev('DEC_PAUSE_MS_');
    eq(PAUSE, 15 * 60 * 1000);

    // 1a. Live recorded HTTP 429 ("too_many_requests") pauses for 15 minutes and surfaces in Control note
    const r429Live = bot.decisionsAsk_('mug cracked', q, bot.decSession_(() => 60000, false));
    eq(r429Live, { ok: false, why: 'HTTP 429: too_many_requests', ms: 0 });
    assert.match(bot.decStatusText_(props, g.clock.now), /1 asked today · 1 failed · paused until .* \(HTTP 429: too_many_requests\): signals go on without it$/);
    const fetchCountAfterLive429 = fetches.length;
    const skippedDuringPause = bot.decisionsAsk_('mug cracked', q, bot.decSession_(() => 60000, false));
    eq(skippedDuringPause, { ok: false, skipped: true, why: 'paused after a failure (HTTP 429: too_many_requests)' });
    eq(fetches.length, fetchCountAfterLive429); // zero network calls while paused

    // Advance past the 15-minute cooldown and test 1b: documented HTTP 429 ("rate_limit_exceeded")
    g.clock.now += PAUSE + 1;
    mode = '429_doc';
    const r429Doc = bot.decisionsAsk_('mug cracked', q, bot.decSession_(() => 60000, false));
    eq(r429Doc, { ok: false, why: 'HTTP 429: rate_limit_exceeded', ms: 0 });
    assert.match(bot.decStatusText_(props, g.clock.now), /2 asked today · 2 failed · paused until .* \(HTTP 429: rate_limit_exceeded\): signals go on without it$/);
    eq(
      bot.decisionsAsk_('mug cracked', q, bot.decSession_(() => 60000, false)),
      { ok: false, skipped: true, why: 'paused after a failure (HTTP 429: rate_limit_exceeded)' }
    );

    // 2. Remaining Rule 4 failure modes: bad key, invalid_request, 503, unparseable JSON, missing answer, slow call, network throw with key, missing secret
    const cases = [
      ['bad_key', { ok: false, why: 'HTTP 400: invalid_argument', ms: 0 }],
      ['bad_req', { ok: false, why: 'HTTP 400: invalid_request', ms: 0 }],
      ['503', { ok: false, why: 'HTTP 503: service_unavailable', ms: 0 }],
      ['bad_json', { ok: false, why: 'an answer that couldn\'t be read', ms: 0 }],
      ['missing_ans', { ok: false, why: 'an answer that couldn\'t be read (is_damaged)', ms: 0 }],
      ['slow', { ok: false, why: 'a slow answer (11 s)', ms: 10500 }],
      ['throw_key', { ok: false, why: 'DNS lookup failed while sending header [key] to host' }],
    ];
    for (const [m, expected] of cases) {
      g.clock.now += PAUSE + 1;
      mode = m;
      const out = bot.decisionsAsk_('mug cracked', q, bot.decSession_(() => 60000, false));
      eq(out, expected, m);
      assert.ok(bot.decState_(props, g.clock.now).until > g.clock.now, `${m} sets cooldown`);
    }

    // Missing Secret Manager secret (HTTP 404, then empty secret value) fails open and pauses without throwing
    g.clock.now += PAUSE + 1;
    env.setSecret(() => ({ code: 404, body: { error: { message: 'Secret not found' } } }));
    eq(bot.decisionsAsk_('mug cracked', q, bot.decSession_(() => 60000, false)), { ok: false, why: 'no API key (Secret Manager HTTP 404)' });
    g.clock.now += PAUSE + 1;
    env.setSecret(() => ({ code: 200, body: { payload: { data: Buffer.from('   ', 'utf8').toString('base64') } } }));
    eq(bot.decisionsAsk_('mug cracked', q, bot.decSession_(() => 60000, false)), { ok: false, why: 'no API key (the secret is empty)' });

    // Restore valid secret and verify safety-filter refusals (error code + HTTP 200 prompt_feedback.block_reason): counted, NO pause, next signal succeeds immediately
    env.setSecret(() => ({ code: 200, body: { payload: { data: Buffer.from(TEST_KEY, 'utf8').toString('base64') } } }));
    g.clock.now += PAUSE + 1;
    const checkSession = bot.decSession_(() => 60000, false);
    for (const code of ['safety', 'prohibited_content', 'blocklist', 'image_safety', 'content_blocked']) {
      mode = `refusal:${code}`;
      const ref = bot.decisionsAsk_('self-harm report', q, checkSession);
      eq(ref, { ok: false, refused: true, why: `the safety filter refused the input (${code})`, ms: 0 });
      eq(bot.decState_(props, g.clock.now).until, 0, `${code} must not pause subsequent signals`);
    }
    const pfBlock = bot.decRead_(200, JSON.stringify({ prompt_feedback: { block_reason: 'SAFETY' } }), q, 120);
    eq(pfBlock, { ok: false, refused: true, why: 'the safety filter refused the input (safety)', ms: 120 });
    mode = 'ok';
    const nextOk = bot.decisionsAsk_('mug cracked', q, checkSession);
    eq(nextOk.ok, true);
    assert.match(bot.decStatusText_(props, g.clock.now), /5 refused by the safety filter/);

    // Rule 10: raw key never appears in warnings, state property, or status text even after throw_key
    warnings.forEach(w => assert.ok(!w.includes(TEST_KEY), w));
    assert.ok(!String(props.getProperty('DECISIONS_STATE') || '').includes(TEST_KEY));
    assert.ok(!bot.decStatusText_(props, g.clock.now).includes(TEST_KEY));
  });

  test('decisions input builder (5A / Rule 8): fixture hygiene, real archive signals, adversarial forbidden-data stripping, and question schema', () => {
    const g = makeGoogle(NOW);
    const bot = loadBot(g.services, g.clock);

    // 1. Committed fixture file itself passes email, restricted-ID, and all three Burson leak-guard audits
    const rawFixture = fs.readFileSync(path.join(__dirname, 'decisions_fixtures.json'), 'utf8');
    eq(rawFixture.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [], []);
    assert.ok(!/SPK\||AAQA|1dVGeQjL|19HakS6|MT90an4v|1028310913761|AIza|agentic_assistant|early_detection|all_sundar|raw_brandwatch|reddit_items_raw|bsip|\[BSS\]|SLRR|Zapier/i.test(rawFixture));
    const guardCfg = { terms: ['SLRR Triaged Alerts', 'Mirror Training Space'] };
    eq(Array.from(bot.outboxGuardHits_(rawFixture, guardCfg)), []);
    eq(Array.from(bot.guardHits_(rawFixture, guardCfg)), []);
    eq(Array.from(bot.relayGuardHits_(rawFixture)), []);

    // 2. Every real archive signal builds clean JSON within DEC_INPUT_MAX_CHARS_ and zero Rule 8 leaks
    const allowedTop = new Set(['signal', 'headline', 'accounts', 'posts', 'platforms', 'window', 'pace', 'snippets']);
    const allowedSnip = new Set(['platform', 'posted_at', 'text']);
    const maxChars = bot.ev('DEC_INPUT_MAX_CHARS_');
    assert.ok(FX.signals.length >= 20);
    for (const r of FX.signals) {
      const input = bot.decSignalInput_(r);
      assert.ok(input.length > 0 && input.length <= maxChars, `${r.alert_id}: length ${input.length}`);
      const parsed = JSON.parse(input);
      Object.keys(parsed).forEach(k => assert.ok(allowedTop.has(k), `${r.alert_id}: unexpected key ${k}`));
      assert.ok(Array.isArray(parsed.snippets) && parsed.snippets.length >= 1, r.alert_id);
      parsed.snippets.forEach(s => Object.keys(s).forEach(k => assert.ok(allowedSnip.has(k), `${r.alert_id}: snippet key ${k}`)));

      assert.ok(!/https?:\/\/|www\./i.test(input), `${r.alert_id}: link leaked`);
      assert.ok(!/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,10}\/\S*/i.test(input), `${r.alert_id}: bare domain path leaked`);
      assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(input), `${r.alert_id}: email leaked`);
      assert.ok(!/(^|[^A-Za-z0-9_])@[A-Za-z0-9_]/.test(input), `${r.alert_id}: @handle leaked`);
      assert.ok(!/(^|[^A-Za-z0-9_])u\/[A-Za-z0-9_-]+/i.test(input), `${r.alert_id}: u/ handle leaked`);
      assert.ok(!/\b(?:spaces|users|messages|threads|members)\/[A-Za-z0-9_.-]+/i.test(input), `${r.alert_id}: chat resource leaked`);
      const withoutIso = input.replace(/"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z| UTC|[+-]\d{2}:?\d{2})?"/g, '""');
      assert.ok(!/\d{8,}/.test(withoutIso), `${r.alert_id}: 8+ digit ID leaked`);

      [r.alert_id, r.cluster_id, r.primary_url].forEach(secret => {
        if (secret) assert.ok(!input.includes(secret), `${r.alert_id}: row identifier leaked (${secret})`);
      });
      if (r.signal_key && !String(r.headline || '').includes(r.signal_key)) {
        assert.ok(!input.includes(r.signal_key), `${r.alert_id}: signal_key leaked (${r.signal_key})`);
      }
      const posts = JSON.parse(r.representative_posts_json || '[]');
      const rawPublicText = ([r.headline].concat(posts.map(p => p.snippet || '')).join(' ')).toLowerCase();
      for (const p of posts) {
        if (p.mention_id) assert.ok(!input.includes(p.mention_id), `${r.alert_id}: mention_id leaked`);
        if (p.url) assert.ok(!input.includes(p.url), `${r.alert_id}: post url leaked`);
        const a = String(p.author_id || '').trim();
        if (a.length >= 4 && !rawPublicText.includes(a.toLowerCase())) {
          assert.ok(!input.toLowerCase().includes(a.toLowerCase()), `${r.alert_id}: author_id leaked (${a})`);
        }
      }
    }

    // 3. Adversarial Rule 8 test: forbidden properties on `row` and inline handles/IDs/links/emails/Chat IDs are stripped, while CVE numbers stay
    const poisoned = Object.assign({}, FX.signals[0], {
      headline: 'CVE-2026-125350 reported by @SecResearcher @second.handle and u/net_watcher at https://x.com/SecResearcher/status/1845000000000000001 ' +
        'and status.example.org/incident/99887766 — email analyst@corp.test in spaces/AAQAsecretRoom1 or users/1092837465019283',
      platforms_csv: 'X, Reddit, https://evil.test/drop, spaces/AAQAbad',
      window_start_utc: '2026-11-11T18:00:00Z',
      window_end_utc: '2026-11-11T18:10:00Z',
      author_handle: '@HiddenAuthorHandle',
      author_id: 'hidden_author_9911',
      sender_email: 'im-oncall@corp.test',
      space_id: 'spaces/AAQAinternalSpace',
      message_id: 'spaces/AAQAinternalSpace/messages/msgSecret99',
      im_name: 'Dana InternalIM',
      resources_doc: 'CONFIDENTIAL_RESOURCES_KB_PASSAGE',
      guidance_rule: 'CONFIDENTIAL_GUIDANCE_TAB_TEXT',
      burson_writeup: 'CONFIDENTIAL_BURSON_WRITEUP_BODY',
      gmail_thread: 'CONFIDENTIAL_GMAIL_THREAD_EXCERPT',
      sheet_contents: 'CONFIDENTIAL_SHEET_CELL_VALUE',
      representative_posts_json: JSON.stringify(
        Array.from({ length: 12 }, (_, i) => ({
          mention_id: `MID_SECRET_${i}_9988776655`,
          platform: i % 2 === 0 ? 'X' : 'Reddit',
          author_id: `secret_author_${i}`,
          author_handle: `@secret_author_${i}`,
          url: `https://x.com/secret_author_${i}/status/18450000000000000${10 + i}`,
          posted_at: '2026-11-11T18:05:00Z',
          snippet: `Report ${i + 1}: Chrome CVE-2026-125350 crash cc @helper_account u/mod_user leak@internal.invalid ` +
            `messages/mSecret${i} threads/tSecret${i} members/memSecret${i} id 9876543210123 ` +
            'x'.repeat(300),
        }))
      ),
    });
    const built = bot.decSignalInput_(poisoned);
    assert.ok(built.length > 0 && built.length <= maxChars);
    assert.ok(built.includes('CVE-2026-125350'), '4-7 digit CVE identifier preserved');
    for (const forbidden of [
      'SecResearcher', 'second.handle', 'net_watcher', '1845000000000000001', 'status.example.org', '99887766',
      'analyst@corp.test', 'AAQAsecretRoom1', '1092837465019283', 'evil.test', 'AAQAbad', 'HiddenAuthorHandle',
      'hidden_author_9911', 'im-oncall@corp.test', 'AAQAinternalSpace', 'msgSecret99', 'Dana InternalIM',
      'CONFIDENTIAL_RESOURCES_KB_PASSAGE', 'CONFIDENTIAL_GUIDANCE_TAB_TEXT', 'CONFIDENTIAL_BURSON_WRITEUP_BODY',
      'CONFIDENTIAL_GMAIL_THREAD_EXCERPT', 'CONFIDENTIAL_SHEET_CELL_VALUE', 'MID_SECRET_', 'secret_author_',
      'helper_account', 'mod_user', 'leak@internal.invalid', 'mSecret', 'tSecret', 'memSecret', '9876543210123',
    ]) {
      assert.ok(!built.includes(forbidden), `forbidden token leaked into decSignalInput_: ${forbidden}`);
    }
    const parsedPoisoned = JSON.parse(built);
    eq([parsedPoisoned.platforms, parsedPoisoned.window.length], [['X', 'Reddit'], 'within 15 minutes']);
    assert.ok(parsedPoisoned.snippets.length >= 1 && parsedPoisoned.snippets.length <= 8);

    // Empty row produces '' so decisionsAsk_ skips cleanly
    eq(bot.decSignalInput_({ headline: '@only_handle https://x.com/a/status/1845000000000000001', representative_posts_json: '[]' }), '');

    // 4. decSignalQuestions_ conforms to Gemini Decisions REST specification
    const qs = bot.decSignalQuestions_();
    const qKeys = Object.keys(qs);
    eq(qKeys, ['about_google', 'brand_risk', 'independent_reports', 'routine_noise', 'category', 'severity']);
    qKeys.forEach(k => assert.match(k, /^[A-Za-z0-9_-]{1,64}$/));
    const catKeys = Object.keys(qs.category.criteria);
    eq(catKeys.length, bot.ev('GEN').exposure_tags.length + 2);
    assert.ok(catKeys.length >= 2 && catKeys.length <= 255);
    catKeys.forEach(k => {
      assert.ok(k.length >= 1 && k.length <= 128 && !/^ | $|[^\S ]/.test(k), `bad category option key: ${k}`);
      assert.ok(qs.category.criteria[k].length > 0, `empty description on ${k}`);
    });
    eq(qs.severity.criteria.length, bot.ev('ED_SEVERITIES_').length);
    qs.severity.criteria.forEach((line, idx) => {
      assert.ok(line.startsWith(bot.ev('ED_SEVERITIES_')[idx] + ': ') && line.length > 20);
    });
  });

  // ===========================================================================================================
  // Section 5B — Fast triage at queue time (Control rows 38-40, FastTriage.gs, BigQuery.gs, EarlyWaveSource.gs)
  // ===========================================================================================================

  const { e2e, TEST_FEED } = H;
  const MIN = 60 * 1000;
  const SIGNAL_IDS_WITH_ANSWERS = [
    'ED-CLU-CLU-dc5a8afd13da-202611061731', // P0 group, P1 hint, s=3.73, l=4
    'ED-CLU-CLU-56136e76a9a7-202611072301', // P0 group, P1 hint, s=3.74, l=4
    'ED-CLU-CLU-e9dddc0be913-202611071746', // Android CERT-In, P1 hint, s=2.53, l=3
    'ED-CLU-CLU-3aa05dedf0a7-202611072231', // Chrome adblock, P1 hint, s=0.96, l=1, sc=0.60, n=0.95
    'ED-CLU-CLU-3287667bddd9-202611101231', // Dragon Quest, P1 hint, s=0.19, l=0, sc=0.88, g=0.32
    'ED-CLU-CLU-abe6decf9a2a-202611121446', // XR glasses launch, P1 hint, s=0.22, l=0, sc=0.86, n=0.89
    'ED-VEL-PRIORITY_TOPIC-2cb939f86090a0ffb4ed1cce8c43c295-202611091217', // Velocity P2, s=0.52, l=0, sc=0.62
    'ED-VEL-CLUSTER-1dd1392bf7db140af902df1be556969f-202611080402', // Velocity P2, s=0.25, l=0, sc=0.84, g=0.07
  ];

  function signalWithFacts(bot, rawRow, extra) {
    const r = JSON.parse(JSON.stringify(rawRow));
    const posts = JSON.parse(r.representative_posts_json || '[]');
    const text = [r.headline].concat(posts.map(p => p.snippet || '')).join('\n');
    const groups = bot.ev('EWS_RISK_GROUPS_').map(x => ({
      key: x.key,
      rx: new RegExp(String(x.rx).replace(/^\(\?i\)/, ''), 'i'),
    }));
    const hits = groups.filter(g => g.rx.test(text)).map(g => g.key);
    return Object.assign(r, { risk_groups: hits.join(','), tag_raised: false }, extra || {});
  }

  const MIRROR = 'spaces/AAQAmirrorFt1';
  const MIRROR_NAME = 'SLRR Zapier Training Mirror';
  const ROOM = 'https://chat.google.com/room/AAQAaa_0I9g';

  function makeFastTriageE2e(rowsFn, decResponder) {
    const t = e2e();
    t.chat.addSpace(MIRROR, MIRROR_NAME);
    t.bot.setup();
    t.set('B25', ROOM);
    t.set('B30', 'tester@testing.test');
    t.chat.addDm('tester@testing.test', 'spaces/DMSTANDIN');
    t.bot.startMirror(MIRROR_NAME);
    t.control().getRange(29, 2).setValue('ON'); // Safety valve ON -> Testing mode
    let decCalls = 0;
    let secretCalls = 0;
    const seenOpts = [];
    t.bot.bqEarlyDetectionRows_ = (minutes, opts) => {
      seenOpts.push(opts || null);
      const list = typeof rowsFn === 'function' ? rowsFn(minutes, opts, t.bot) : rowsFn;
      return (list || []).map(r => (opts && opts.facts ? signalWithFacts(t.bot, r) : JSON.parse(JSON.stringify(r))));
    };
    const origFetch = t.g.services.UrlFetchApp.fetch;
    t.g.services.UrlFetchApp.fetch = (url, params) => {
      const u = String(url);
      if (u.includes('secretmanager.googleapis.com/')) {
        secretCalls++;
        const s = decResponder && decResponder.secret
          ? decResponder.secret()
          : { code: 200, body: { payload: { data: Buffer.from(TEST_KEY, 'utf8').toString('base64') } } };
        return {
          getResponseCode: () => s.code,
          getContentText: () => (typeof s.body === 'string' ? s.body : JSON.stringify(s.body)),
          getHeaders: () => ({}),
        };
      }
      if (u.includes('/decisions')) {
        decCalls++;
        const payload = JSON.parse((params && params.payload) || '{}');
        const ans = decResponder ? decResponder(payload, t.g.clock, decCalls) : null;
        return {
          getResponseCode: () => ans.code,
          getContentText: () => (typeof ans.body === 'string' ? ans.body : JSON.stringify(ans.body)),
          getHeaders: () => ({}),
        };
      }
      if (u.startsWith('https://bigquery.googleapis.com/')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ jobComplete: true, schema: { fields: [{ name: 'url', type: 'STRING' }] }, rows: [] }),
          getHeaders: () => ({}),
        };
      }
      return origFetch(url, params);
    };
    t.g.vertex.earlyDetection = payload => {
      const txt = payload.contents[0].parts.map(p => p.text || '').join('\n');
      const hit = FX.signals.find(s => txt.includes(s.alert_id));
      const id = (hit && hit.alert_id) || 'ED-SIGNAL';
      return {
        summary: `Verified review for ${id}.`,
        issue_name: `Issue ${id}`,
        emerging_narrative: `Multiple accounts report ${id}.`,
        early_detection_call: {
          disposition: 'monitor',
          severity: 'medium',
          confidence: 0.88,
          reason: 'Early multi-account cluster worth tracking',
          build_up_signals: 'Multiple low-tier accounts across social platforms',
          watch_for: 'Broader growth or official response',
        },
        temp_check_draft: { recommended: false, query_suggestion: '', scope_note: '' },
        slrr: {
          is_slrr: false,
          confidence: 0.85,
          exposure_tag: 'Product - Other/general criticism',
          product: 'Chrome',
          other_products: [],
          sensitive_topics: [],
          location: 'US',
        },
        known_issue: { matches: false, confidence: 0.9 },
        tns: { needed: false, reason: '' },
        recommended_groups: [],
        story_title: `Story card for ${id}`,
        story: `Accounts discussed ${id} on [the first post](P1).`,
        web_context: 'No external coverage found.',
        next_steps: ['Keep monitoring for volume growth.'],
      };
    };
    return { t, seenOpts, decCalls: () => decCalls, secretCalls: () => secretCalls };
  }

  function matchRecordedResponse(bot, payload) {
    for (const id of SIGNAL_IDS_WITH_ANSWERS) {
      const row = FX.signals.find(s => s.alert_id === id);
      if (bot.decSignalInput_(row) === payload.input) {
        return { code: 200, body: FX.signal_responses[id] };
      }
    }
    return { code: 200, body: FX.probe.six_questions_doc_input.response.body };
  }

  const edCardsOf = t => t.chat.botPosts(MIRROR).filter(m => !m.threadReply && /^client-zeda-/.test(m.clientAssignedMessageId || ''));

  test('fast triage (5B / 9.2): Control rows 38-40 default OFF, waiting notes hold, and with rows 38-40 OFF queueing, ordering, review, and story cards are unchanged', () => {
    const batch = SIGNAL_IDS_WITH_ANSWERS.slice(0, 6).map(id => FX.signals.find(s => s.alert_id === id));

    const runScenario = disableFastTriageHooks => {
      const env = makeFastTriageE2e(() => batch, () => {
        throw new Error('Decisions API must never be called when rows 38-40 are OFF');
      });
      const { t } = env;
      const sh = t.control();
      eq([sh.cell(38, 1), sh.cell(38, 2), sh.validations['38,2'].values], ['Fast triage (Gemini Decisions)', 'OFF', ['ON', 'OFF']]);
      eq([sh.cell(39, 1), sh.cell(39, 2), sh.validations['39,2'].values], ['Fast triage: rank and early watch', 'OFF', ['ON', 'OFF']]);
      eq([sh.cell(40, 1), sh.cell(40, 2), sh.validations['40,2'].values], ['Fast triage: hold back noise', 'OFF', ['ON', 'OFF']]);
      eq([sh.cell(46, 1), sh.cell(46, 2), sh.validations['46,2'].values], ['Write early-wave records to BigQuery', 'OFF', ['ON', 'OFF']]);
      eq([sh.cell(47, 1), sh.cell(48, 1), sh.cell(49, 1), sh.cell(50, 1), sh.cell(51, 1), sh.cell(52, 1), sh.cell(53, 1), sh.cell(54, 1),
        sh.cell(55, 1), sh.cell(56, 1), sh.cell(57, 1)],
        ['Early watch: independent_reports at or above', 'Early Detection: also read the AMIE table', 'Early Detection: also read Brandwatch live (not X)', 'Proactive watch: also read the AMIE table', 'Open engine: judgment in place of caps', '', '',
          'Live dashboard', 'Slide deliveries', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is a switch now (it was blank)

      if (disableFastTriageHooks) {
        t.bot.ftStart_ = () => null;
        t.bot.ftOn_ = () => false;
        t.bot.ftRankOn_ = () => false;
        t.bot.ftHoldOn_ = () => false;
      }

      sh.getRange(19, 2).setValue('ON');
      const propsSvc = t.g.services.PropertiesService.getScriptProperties();
      t.poll(); // Check 1 queues 5 of 6 in original order and reviews the top 2 (by pri, then au, then queued order)
      const qAfter1 = t.bot.edQueueList_(propsSvc);
      const qRowsAfter1 = qAfter1.map(entry => t.bot.edQueueRow_(propsSvc, entry.k));
      t.g.clock.now += 2 * MIN;
      t.poll(); // Run 2 reviews next 2
      t.g.clock.now += 2 * MIN;
      t.poll(); // Run 3 reviews the 5th

      const props = Array.from(t.g.props.entries())
        .filter(([k]) => /^(?:EARLY_DETECTION_|ED_ALERT_|DECISIONS_)/.test(k))
        .sort(([a], [b]) => (a < b ? -1 : 1));
      return {
        env,
        qAfter1,
        qRowsAfter1,
        cards: edCardsOf(t).map(m => m.text),
        alertRows: t.sheet().getSheetByName('Alert log').rows,
        hasFtTab: !!t.sheet().getSheetByName('Fast triage'),
        c19: sh.cell(19, 3),
        props,
      };
    };

    const withCodePresent = runScenario(false);
    const baselineEquiv = runScenario(true);

    eq([withCodePresent.env.decCalls(), withCodePresent.env.secretCalls(), withCodePresent.hasFtTab], [0, 0, false]);
    eq(withCodePresent.env.seenOpts, [null]); // bqEarlyDetectionRows_ called without opts when row 38 is OFF
    withCodePresent.qAfter1.forEach((entry, idx) => {
      eq(Object.keys(entry).sort(), ['at', 'au', 'id', 'k', 'pri', 'sig', 'tries']);
      eq(withCodePresent.qRowsAfter1[idx].dec, undefined);
    });
    eq(withCodePresent.qAfter1, baselineEquiv.qAfter1);
    eq(withCodePresent.qRowsAfter1, baselineEquiv.qRowsAfter1);
    eq(withCodePresent.cards.length, 5);
    eq(withCodePresent.cards, baselineEquiv.cards);
    eq(withCodePresent.alertRows, baselineEquiv.alertRows);
    eq(withCodePresent.c19, baselineEquiv.c19);
    eq(withCodePresent.props, baselineEquiv.props);

    // Waiting notes when parent switches are OFF
    const { t } = withCodePresent.env;
    const sh = t.control();
    sh.getRange(19, 2).setValue('OFF');
    sh.getRange(38, 2).setValue('ON');
    t.g.clock.now += MIN;
    t.poll();
    assert.match(sh.cell(38, 3), /^✓ ON, but waiting: it needs Early wave & velocity check \(row 19\) ON/);
    sh.getRange(38, 2).setValue('OFF');
    sh.getRange(39, 2).setValue('ON');
    sh.getRange(40, 2).setValue('ON');
    t.g.clock.now += MIN;
    t.poll();
    assert.match(sh.cell(39, 3), /^✓ ON, but waiting: it needs Fast triage \(row 38\) ON/);
    assert.match(sh.cell(40, 3), /^✓ ON, but waiting: it needs Fast triage \(row 38\) ON/);
  });

  test('fast triage (5B): producer facts (opts.facts), ordering rules (ftRank_, edQueueRank_, ftQueueUnrank_), and hold-back safety gates (ftP0Group_, ftProtected_, ftHoldWhy_)', () => {
    const g = makeGoogle(NOW);
    const EWS_COLS = [
      ['kind'], ['lane'], ['mid'], ['url'], ['platform'], ['author'],
      ['audience', 'INTEGER'], ['eng', 'INTEGER'], ['posted_ms', 'INTEGER'], ['seen_ms', 'INTEGER'],
      ['txt'], ['topic'], ['chash'], ['sig'], ['risk'], ['brand', 'BOOLEAN'],
    ];
    const origFetch = g.services.UrlFetchApp.fetch;
    g.services.UrlFetchApp.fetch = (url, params) => {
      if (!String(url).startsWith('https://bigquery.googleapis.com/')) return origFetch(url, params);
      const body = JSON.parse(params.payload || '{}');
      const loc = body.location || 'US';
      const rows = loc === 'us-central1'
        ? [1, 2, 3, 4, 5].map(i => ({
          kind: 'post',
          lane: 'sonar',
          mid: `M-${i}`,
          url: i % 2 === 0 ? `https://x.com/u${i}/status/215000000000000000${i}` : `https://www.reddit.com/r/Chrome/comments/1z${i}ab/crash/`,
          platform: i % 2 === 0 ? 'twitter' : 'reddit',
          author: `user_${i}`,
          audience: 250,
          eng: 10,
          posted_ms: g.clock.now - (10 - i) * MIN,
          seen_ms: g.clock.now - (9 - i) * MIN,
          txt: 'Chrome leaked passwords exposed in plaintext after installing the overnight browser update patch',
          topic: 'Chrome',
          chash: `ch_${i}`,
          sig: `sig_${i}`,
          risk: 'privacy_data_leak',
          brand: true,
        }))
        : [];
      return {
        getResponseCode: () => 200,
        getHeaders: () => ({}),
        getContentText: () => JSON.stringify({
          jobComplete: true,
          jobReference: { projectId: 'brand-social-central-data', jobId: `j_${loc}`, location: loc },
          schema: { fields: EWS_COLS.map(c => ({ name: c[0], type: c[1] || 'STRING' })) },
          rows: rows.map(r => ({ f: EWS_COLS.map(c => ({ v: r[c[0]] === undefined || r[c[0]] === null ? null : String(r[c[0]]) })) })),
        }),
      };
    };
    const bot = loadBot(g.services, g.clock);

    // Without opts.facts: row shape is unchanged (no risk_groups / tag_raised). With opts.facts: both are attached
    const plainRows = bot.bqEarlyDetectionRows_(30);
    eq([plainRows.length, plainRows[0].risk_groups, plainRows[0].tag_raised], [1, undefined, undefined]);
    eq(bot.ftProtected_(plainRows[0]), true); // rows lacking facts are never held back

    g.clock.now += 15 * MIN;
    g.props.clear();
    g.cache.clear();
    const factRows = bot.bqEarlyDetectionRows_(30, { facts: true });
    eq([factRows.length, factRows[0].risk_groups, typeof factRows[0].tag_raised], [1, 'privacy_data_leak', 'boolean']);
    eq([bot.ftP0Group_(factRows[0]), bot.ftProtected_(factRows[0])], [true, true]);

    // Pure protection & hold-back rules (Section 3 & Section 4 seed bars: about <= 0.10, noise >= 0.90, conf >= 0.55)
    const baseRow = { priority_hint: 'P1', risk_groups: '', tag_raised: false };
    const lowNotGoogle = { g: 0.10, r: 0.02, i: 0.1, n: 0.4, s: 0.12, l: 0, sc: 0.80 };
    const lowNoise = { g: 0.96, r: 0.04, i: 0.2, n: 0.90, s: 0.65, l: 1, sc: 0.80 };
    eq(bot.ftBars_(), { about: 0.10, noise: 0.90, conf: 0.55, watch: 0.80, accounts: 3, independent: 0.30 });
    eq(bot.ftHoldWhy_(baseRow, lowNotGoogle), 'not about Google (about Google 0.1, severity none 0.8)');
    eq(bot.ftHoldWhy_(baseRow, lowNoise), 'routine noise (routine noise 0.9, severity low 0.8)');
    // the confidence seed is 0.55: held at it, not below it
    eq(bot.ftHoldWhy_(baseRow, Object.assign({}, lowNoise, { sc: 0.55 })), 'routine noise (routine noise 0.9, severity low 0.55)');
    eq(bot.ftHoldWhy_(baseRow, Object.assign({}, lowNoise, { sc: 0.54 })), '');

    const bars = { about: 0.15, noise: 0.85, conf: 0.8 };
    eq(bot.ftHoldWhy_(baseRow, null, bars), ''); // no answer -> fail open
    eq(bot.ftHoldWhy_({ priority_hint: 'P0', risk_groups: '', tag_raised: false }, lowNotGoogle, bars), ''); // P0 priority protected
    eq(bot.ftHoldWhy_({ priority_hint: 'P2', risk_groups: 'safety_csam_selfharm', tag_raised: false }, lowNotGoogle, bars), ''); // P0 group protected
    eq(bot.ftHoldWhy_({ priority_hint: 'P2', risk_groups: '', tag_raised: true }, lowNoise, bars), ''); // taxonomy raise protected
    eq(bot.ftHoldWhy_(baseRow, Object.assign({}, lowNotGoogle, { l: 2 }), bars), ''); // medium+ severity never held back
    eq(bot.ftHoldWhy_(baseRow, Object.assign({}, lowNotGoogle, { sc: 0.79 }), bars), ''); // below conf bar -> not held back
    eq(bot.ftHoldWhy_(baseRow, Object.assign({}, lowNotGoogle, { sc: 0.8 }), bars), 'not about Google (about Google 0.1, severity none 0.8)'); // at conf bar -> held back

    // Pure ordering (ftRank_ and edQueueRank_ + ftQueueUnrank_): P0 group > tier > unanswered (fail-open) > severity > brand_risk > prior order
    const items = [
      { idx: 0, row: { id: 'p1_low', priority_hint: 'P1', risk_groups: '' }, dec: { s: 0.4, r: 0.2 } },
      { idx: 1, row: { id: 'p1_high_r1', priority_hint: 'P1', risk_groups: '' }, dec: { s: 2.8, r: 0.6 } },
      { idx: 2, row: { id: 'p1_high_r2', priority_hint: 'P1', risk_groups: '' }, dec: { s: 2.8, r: 0.9 } },
      { idx: 3, row: { id: 'p1_no_ans', priority_hint: 'P1', risk_groups: '' }, dec: null },
      { idx: 4, row: { id: 'p1_p0group', priority_hint: 'P1', risk_groups: 'privacy_data_leak' }, dec: { s: 1.1, r: 0.3 } },
      { idx: 5, row: { id: 'p2_high', priority_hint: 'P2', risk_groups: '' }, dec: { s: 3.5, r: 0.95 } },
    ];
    eq(items.slice().sort(bot.ftRank_).map(x => x.row.id), [
      'p1_p0group', 'p1_no_ans', 'p1_high_r2', 'p1_high_r1', 'p1_low', 'p2_high',
    ]);

    const props = g.services.PropertiesService.getScriptProperties();
    const rLowManyAu = Object.assign({}, FX.signals[4], { alert_id: 'ED-LOW-AU20', unique_low_tier_authors: 20, risk_groups: '', tag_raised: false });
    const rHighFewAu = Object.assign({}, FX.signals[2], { alert_id: 'ED-HIGH-AU4', unique_low_tier_authors: 4, risk_groups: '', tag_raised: false });
    bot.edQueuePut_(props, rLowManyAu, g.clock.now, bot.ftRankKeys_(rLowManyAu, { s: 0.2, r: 0.05 }));
    bot.edQueuePut_(props, rHighFewAu, g.clock.now + 1000, bot.ftRankKeys_(rHighFewAu, { s: 2.53, r: 0.94 }));
    eq(bot.edQueueList_(props).map(e => e.id), ['ED-HIGH-AU4', 'ED-LOW-AU20']); // severity wins while ranked
    bot.ftQueueUnrank_(props);
    eq(bot.edQueueList_(props).map(e => e.id), ['ED-LOW-AU20', 'ED-HIGH-AU4']); // row 39 OFF -> back to author-count order
  });

  test('fast triage (5B): row 38 alone makes zero Decisions calls and writes nothing; row 38+39 ranks queue & caches answers; row 38+40 holds back noise at Control bars (B41:B43) with C19 count & log line', () => {
    // 1. Row 38 ON alone (while rows 39 and 40 are OFF): makes 0 Decisions calls, writes nothing, and states that it only enables rows 39 and 40
    const sixP1 = [
      'ED-CLU-CLU-3287667bddd9-202611101231', // s=0.19 (pos 1)
      'ED-CLU-CLU-abe6decf9a2a-202611121446', // s=0.22 (pos 2)
      'ED-CLU-CLU-3aa05dedf0a7-202611072231', // s=0.96 (pos 3)
      'ED-VEL-PRIORITY_TOPIC-2cb939f86090a0ffb4ed1cce8c43c295-202611091217', // P2, s=0.52 (pos 4)
      'ED-VEL-CLUSTER-1dd1392bf7db140af902df1be556969f-202611080402', // P2, s=0.25 (pos 5)
      'ED-CLU-CLU-e9dddc0be913-202611071746', // Android CERT-In, P1, s=2.53 (pos 6 — beyond EW_MAX_PER_CHECK_=5 without row 39!)
    ].map(id => FX.signals.find(s => s.alert_id === id));

    const gateOnly = makeFastTriageE2e(() => sixP1, () => {
      throw new Error('Row 38 ON alone must make zero Decisions calls while rows 39 and 40 are OFF');
    });
    gateOnly.t.control().getRange(19, 2).setValue('ON');
    gateOnly.t.control().getRange(38, 2).setValue('ON');
    gateOnly.t.poll();
    eq([gateOnly.decCalls(), gateOnly.secretCalls(), !!gateOnly.t.sheet().getSheetByName('Fast triage')], [0, 0, false]);
    assert.match(gateOnly.t.control().cell(38, 3), /only enables rows 39 and 40; while both are OFF, no Gemini Decisions call is made and nothing is written/);
    const gateQueue = gateOnly.t.bot.edQueueList_(gateOnly.t.g.services.PropertiesService.getScriptProperties());
    eq(gateQueue.length, 3); // 5 queued - 2 reviewed this run = 3 waiting
    assert.ok(!gateQueue.some(e => e.id === 'ED-CLU-CLU-e9dddc0be913-202611071746'));
    gateQueue.forEach(e => {
      eq([e.sv, e.br], [undefined, undefined]);
      const row = gateOnly.t.bot.edQueueRow_(gateOnly.t.g.services.PropertiesService.getScriptProperties(), e.k);
      eq(row.dec, undefined);
    });

    // 2. Order (Rows 38 + 39 ON): asks all 6 candidates, promotes Android CERT-In (s=2.53) to #1, and caches the 6th candidate's answer for the next check
    const ranked = makeFastTriageE2e(() => sixP1, (payload) => matchRecordedResponse(ranked.t.bot, payload));
    ranked.t.control().getRange(19, 2).setValue('ON');
    ranked.t.control().getRange(38, 2).setValue('ON');
    ranked.t.control().getRange(39, 2).setValue('ON');
    ranked.t.poll();
    eq(ranked.decCalls(), 6); // all 6 candidates asked before picking top 5
    const firstTwoCards = edCardsOf(ranked.t);
    eq(firstTwoCards.length, 2);
    assert.ok(firstTwoCards[0].text.includes('ED-CLU-CLU-e9dddc0be913-202611071746'), 'highest-severity signal reviewed & carded first');

    // Next check 15 min later: the 6th unqueued signal ('ED-VEL-CLUSTER-...') is picked up from FT_ANSWER_CACHE_PREFIX_ with 0 new Decisions API calls!
    ranked.t.g.clock.now += 15 * MIN;
    ranked.t.poll();
    eq(ranked.decCalls(), 6);

    // 3. Hold-back (Rows 38 + 40 ON): acts immediately on the Control tab seed bars (B41=0.10, B42=0.90, B43=0.55) and updates when B41:B43 are edited
    const holdSignals = [
      FX.signals.find(s => s.alert_id === 'ED-CLU-CLU-dc5a8afd13da-202611061731'), // P0 group -> protected
      FX.signals.find(s => s.alert_id === 'ED-CLU-CLU-abe6decf9a2a-202611121446'), // n=0.89, l=0, sc=0.86 -> NOT held at seed 0.90, held when B42='0.85'
      FX.signals.find(s => s.alert_id === 'ED-VEL-CLUSTER-1dd1392bf7db140af902df1be556969f-202611080402'), // g=0.07 <= 0.10, l=0, sc=0.84 >= 0.55 -> held back at seed!
      FX.signals.find(s => s.alert_id === 'ED-CLU-CLU-3aa05dedf0a7-202611072231'), // n=0.95 >= 0.90, l=1, sc=0.60 >= 0.55 -> held back at seed (not with B43 at 0.65)
    ];
    const holdSeed = makeFastTriageE2e(() => holdSignals, (payload) => matchRecordedResponse(holdSeed.t.bot, payload));
    holdSeed.t.control().getRange(19, 2).setValue('ON');
    holdSeed.t.control().getRange(38, 2).setValue('ON');
    holdSeed.t.control().getRange(40, 2).setValue('ON');
    holdSeed.t.poll();
    assert.match(holdSeed.t.control().cell(40, 3), /^✓ ON: a low-severity signal that meets the hold-back bars in B41:B43 is dropped without a review/);
    // ED-VEL-CLUSTER (g=0.07) and the Chrome gripe (n=0.95, sc=0.60) held back at seed: C19 counts them among the signals let go, and the
    // run's record names each as held back as noise
    assert.match(holdSeed.t.control().cell(19, 3), / · today: 4 found, 2 cards, 0 under another alert, 2 let go, 0 never reviewed, 0 waiting · the Early Detection tab lists each one$/);
    eq(holdSeed.t.bot.edNotesOfRun_().map(r => holdSeed.t.bot.edNoteObj_(r)).filter(r => r.outcome === 'Held back as noise (no review)').map(r => r.id),
      ['ED-VEL-CLUSTER-1dd1392bf7db140af902df1be556969f-202611080402', 'ED-CLU-CLU-3aa05dedf0a7-202611072231']);
    assert.match(holdSeed.t.g.logs.join('\n'), /early detection: fast triage held back ED-VEL-CLUSTER-1dd1392bf7db140af902df1be556969f-202611080402: not about Google/);
    assert.match(holdSeed.t.g.logs.join('\n'), /early detection: fast triage held back ED-CLU-CLU-3aa05dedf0a7-202611072231: routine noise/);
    eq(edCardsOf(holdSeed.t).map(m => /ED-CLU-CLU-(?:dc5a8afd13da|abe6decf9a2a)/.test(m.text)), [true, true]);  // the P0-group signal and the one below the noise bar: reviewed

    // Editing Control B42 ('Hold-back: routine_noise at or above') from '0.90' to '0.85' also holds back abe6decf9a2a (n=0.89), and B43 (confidence)
    // from '0.55' to '0.65' lets the Chrome gripe (sc=0.60) through to its review, while the P0-group signal stays protected
    const holdEdited = makeFastTriageE2e(() => holdSignals, (payload) => {
      // Force low/noise answers even for the P0-group signal to prove P0 protection holds under worst-case model output
      const p0Row = FX.signals.find(s => s.alert_id === 'ED-CLU-CLU-dc5a8afd13da-202611061731');
      if (holdEdited.t.bot.decSignalInput_(p0Row) === payload.input) {
        return { code: 200, body: FX.signal_responses['ED-VEL-CLUSTER-1dd1392bf7db140af902df1be556969f-202611080402'] };
      }
      return matchRecordedResponse(holdEdited.t.bot, payload);
    });
    holdEdited.t.control().getRange(19, 2).setValue('ON');
    holdEdited.t.control().getRange(38, 2).setValue('ON');
    holdEdited.t.control().getRange(40, 2).setValue('ON');
    holdEdited.t.control().getRange(42, 2).setValue('0.85');
    holdEdited.t.control().getRange(43, 2).setValue('0.65');
    holdEdited.t.poll();

    assert.match(holdEdited.t.control().cell(19, 3), / · today: 4 found, 2 cards, 0 under another alert, 2 let go, 0 never reviewed, 0 waiting · the Early Detection tab lists each one$/);
    eq(holdEdited.t.bot.edNotesOfRun_().map(r => holdEdited.t.bot.edNoteObj_(r)).filter(r => r.outcome === 'Held back as noise (no review)').length, 2);
    eq(edCardsOf(holdEdited.t).length, 2); // P0-group signal + low-confidence Chrome adblock signal both reviewed and carded!
    assert.ok(edCardsOf(holdEdited.t).some(m => m.text.includes('ED-CLU-CLU-dc5a8afd13da-202611061731')), 'P0-group signal never held back');
    assert.ok(edCardsOf(holdEdited.t).some(m => m.text.includes('ED-CLU-CLU-3aa05dedf0a7-202611072231')), 'below-confidence signal never held back');
    const logs = holdEdited.t.g.logs.join('\n');
    assert.match(logs, /early detection: fast triage held back ED-CLU-CLU-abe6decf9a2a-202611121446: routine noise/);
    assert.match(logs, /early detection: fast triage held back ED-VEL-CLUSTER-1dd1392bf7db140af902df1be556969f-202611080402: not about Google/);
    eq(holdEdited.t.sheet().getSheetByName('Fast triage'), null);
  });

  test('fast triage (5B / 9.3): each Rule 4 failure mode in earlyWaveCheck_ falls back to today\'s queueing, ordering, review, and cards', () => {
    const twoReal = [
      FX.signals.find(s => s.alert_id === 'ED-CLU-CLU-abe6decf9a2a-202611121446'),
      FX.signals.find(s => s.alert_id === 'ED-VEL-CLUSTER-1dd1392bf7db140af902df1be556969f-202611080402'),
    ];

    // Baseline OFF cards on the same two signals
    const offEnv = makeFastTriageE2e(() => twoReal, () => ({ code: 500, body: '{}' }));
    offEnv.t.control().getRange(19, 2).setValue('ON');
    offEnv.t.poll();
    const baselineCards = edCardsOf(offEnv.t).map(m => m.text);
    eq(baselineCards.length, 2);

    const failureModes = [
      { name: 'missing_key', secret: () => ({ code: 404, body: { error: { message: 'Not found' } } }), responder: () => ({ code: 200, body: '{}' }), paused: true },
      { name: 'http_429', responder: () => ({ code: 429, body: FX.error_429_live.body }), paused: true },
      { name: 'http_503', responder: () => ({ code: 503, body: { error: { code: 'service_unavailable' } } }), paused: true },
      { name: 'unparseable_body', responder: () => ({ code: 200, body: '<<<not json>>>' }), paused: true },
      { name: 'slow_timeout', responder: (_p, clock) => { clock.now += 11000; return { code: 200, body: FX.probe.six_questions_doc_input.response.body }; }, paused: true },
      { name: 'network_throw', responder: () => { throw new Error('Socket reset by peer'); }, paused: true },
      { name: 'safety_refusal', responder: () => ({ code: 400, body: { error: { code: 'safety', message: 'Blocked' } } }), paused: false },
    ];

    for (const fm of failureModes) {
      const responder = (payload, clock, n) => fm.responder(payload, clock, n);
      if (fm.secret) responder.secret = fm.secret;
      const env = makeFastTriageE2e(() => twoReal, responder);
      // Enable ALL THREE switches (38, 39, 40) AND set B41/B42 bars that WOULD hold both signals back if Decisions succeeded!
      env.t.control().getRange(19, 2).setValue('ON');
      env.t.control().getRange(38, 2).setValue('ON');
      env.t.control().getRange(39, 2).setValue('ON');
      env.t.control().getRange(40, 2).setValue('ON');
      env.t.control().getRange(41, 2).setValue('0.15');
      env.t.control().getRange(42, 2).setValue('0.85');
      env.t.poll();

      eq(JSON.parse(env.t.g.props.get('LAST_RUN')).errors, [], fm.name);
      eq(edCardsOf(env.t).map(m => m.text), baselineCards, `${fm.name}: cards identical to OFF baseline`);
      assert.match(env.t.control().cell(19, 3), /, 0 let go, /, fm.name);  // nothing was held back
      const c38 = env.t.control().cell(38, 3);
      if (fm.paused) {
        assert.match(c38, /paused until .*: signals go on without it/, `${fm.name}: C38 shows cooldown`);
      } else {
        assert.match(c38, /2 refused by the safety filter/, `${fm.name}: C38 counts refusals without pausing`);
        assert.ok(!c38.includes('paused until'), `${fm.name}: safety refusal does not pause`);
      }
    }
  });

  // ===========================================================================================================
  // Section 5C — Early watch tier (EarlyWaveSource.gs, EarlyDetection.gs, BigQuery.gs, FastTriage.gs)
  // ===========================================================================================================

  test('early watch (5C): candidate gates (ewsWatchPick_, ewsWatchNovel_, ewsWatchRaise_) and early-watch card leak-guard & edParseCard_ checks', () => {
    const g = makeGoogle(NOW);
    const bot = loadBot(g.services, g.clock);

    // 1. Seed bars are live (watch=0.80, independent=0.30, conf=0.55, accounts=3) -> ewsWatchRaise_ checks about_google and brand_risk >= watch,
    //    independent_reports >= its own bar, l >= 2, and sc >= conf
    eq([bot.ev('EWS_WATCH_MIN_AUTHORS_'), bot.ev('EWS_WATCH_MIN_LEVEL_'), bot.ev('EW_WATCH_QUEUE_PER_DAY_')], [3, 2, 8]);
    eq(bot.ewsWatchBars_(), { about: 0.80, risk: 0.80, independent: 0.30, conf: 0.55, accounts: 3 });
    // FastTriage.gs' bars: `watch` is the about_google and brand_risk bar; their `about` (the hold-back's) is never the watch's
    eq(bot.ewsWatchBars_({ about: 0.10, noise: 0.90, conf: 0.55, watch: 0.80, accounts: 3, independent: 0.30 }),
      { about: 0.80, risk: 0.80, independent: 0.30, conf: 0.55, accounts: 3 });
    eq(bot.ewsWatchRaise_({ g: 0.99, r: 0.99, i: 0.99, l: 4, sc: 0.95 }), true);
    eq(bot.ewsWatchRaise_({ g: 0.99, r: 0.99, i: 0.62, l: 4, sc: 0.95 }), true);   // i >= 0.30 seed: its own bar, below the 0.80 of the other two
    eq(bot.ewsWatchRaise_({ g: 0.99, r: 0.99, i: 0.29, l: 4, sc: 0.95 }), false);  // i < 0.30 seed
    eq(bot.ewsWatchRaise_({ g: 0.79, r: 0.99, i: 0.99, l: 4, sc: 0.95 }), false);  // about_google < 0.80 seed
    eq(bot.ewsWatchRaise_({ g: 0.99, r: 0.79, i: 0.99, l: 4, sc: 0.95 }), false);  // brand_risk < 0.80 seed
    eq(bot.ewsWatchRaise_({ g: 0.99, r: 0.99, i: 0.99, l: 4, sc: 0.55 }), true);   // sc at the 0.55 seed
    eq(bot.ewsWatchRaise_({ g: 0.99, r: 0.99, i: 0.99, l: 4, sc: 0.54 }), false);  // sc < 0.55 seed
    eq(bot.ewsWatchRaise_({ g: 0.99, r: 0.99, i: 0.99, l: 4 }), false);            // an answer without a confidence raises nothing
    // The eight real signals of Nov 6-12, 2026 at the seeds: the early watch raises 2 of the 3 risks and none of the 5 noise
    // signals; the hold-back drops 3 of the 5 noise signals and none of the risks (what the seeds were chosen for)
    const seedBars = bot.ftBars_();
    const real = Object.keys(FX.signal_responses).map(id => {
      const read = bot.decRead_(200, JSON.stringify(FX.signal_responses[id]), bot.decSignalQuestions_(), 100);
      const dec = bot.decCompact_(read.answers);
      const row = Object.assign({}, FX.signals.find(x => x.alert_id === id), { risk_groups: '', tag_raised: false, priority_hint: 'P2' });
      return { id, risk: dec.l >= 2, raised: bot.ewsWatchRaise_(dec, seedBars), held: !!bot.ftHoldWhy_(row, dec, seedBars) };
    });
    eq([real.length, real.filter(x => x.risk).length, real.filter(x => x.risk && x.raised).length, real.filter(x => !x.risk && x.raised).length,
      real.filter(x => !x.risk && x.held).length, real.filter(x => x.risk && x.held).length], [8, 3, 2, 0, 3, 0]);
    eq(real.filter(x => x.raised).map(x => x.id), ['ED-CLU-CLU-dc5a8afd13da-202611061731', 'ED-CLU-CLU-e9dddc0be913-202611071746']);

    const wBars = { about: 0.8, risk: 0.7, independent: 0.5, conf: 0.8 };
    eq(bot.ewsWatchRaise_({ g: 0.98, r: 0.94, i: 0.62, l: 3, sc: 0.85 }, wBars), true);
    eq(bot.ewsWatchRaise_({ g: 0.8, r: 0.7, i: 0.5, l: 2, sc: 0.8 }, wBars), true);
    eq(bot.ewsWatchRaise_({ g: 0.79, r: 0.94, i: 0.62, l: 3, sc: 0.85 }, wBars), false);
    eq(bot.ewsWatchRaise_({ g: 0.98, r: 0.69, i: 0.62, l: 3, sc: 0.85 }, wBars), false);
    eq(bot.ewsWatchRaise_({ g: 0.98, r: 0.94, i: 0.49, l: 3, sc: 0.85 }, wBars), false);
    eq(bot.ewsWatchRaise_({ g: 0.98, r: 0.94, i: 0.62, l: 1, sc: 0.85 }, wBars), false);
    eq(bot.ewsWatchRaise_({ g: 0.98, r: 0.94, i: 0.62, l: 3, sc: 0.79 }, wBars), false);

    // 2. ewsWatchPick_ and ewsWatchNovel_: respects minAuthors bar (seed 3, or 4 when B45='4'), >= 2 URLs, no copy ring, no cooldown, not already marked/raised
    const vecA = new Array(768).fill(0); vecA[0] = 1;
    const vecB = new Array(768).fill(0); vecB[1] = 1;
    const encA = bot.ewsEnc_(vecA);
    const encB = bot.ewsEnc_(vecB);
    const makeCluster = (id, nAuthors, o) => {
      const opts = o || {};
      const members = Array.from({ length: nAuthors }, (_, idx) => ({
        t: NOW - (nAuthors - idx) * MIN,
        a: `x|author_${id}_${idx}`,
        p: opts.twoPlat && idx === 1 ? 'Reddit' : 'X',
        u: opts.noUrls && idx > 0 ? '' : `https://x.com/a_${id}_${idx}/status/216000000000000000${idx}`,
        h: opts.copyRing ? 'same_hash' : `hash_${id}_${idx}`,
        r: opts.risk || '',
        b: !opts.noBrand,
        s: `Report ${idx + 1} on ${id}`,
        tp: 'Gmail',
      }));
      return {
        id,
        t0: opts.t0 || (NOW - 20 * MIN),
        t1: NOW - MIN,
        n: nAuthors,
        s: opts.vec || encA,
        lab: `Early cluster ${id}`,
        al: opts.al || null,
        m: members,
      };
    };

    const c2 = makeCluster('two_au', 2, { risk: 'security_scam_malware' }); // below floor of 3 -> skipped
    const c3Risk = makeCluster('three_risk', 3, { risk: 'security_scam_malware' }); // 3 accounts + risk -> picked first at minAuthors=3
    const c4Plain = makeCluster('four_plain', 4, { vec: encB }); // 4 accounts on 1 platform (<5) -> picked second
    const c4TwoPlat = makeCluster('four_two_plat', 4, { twoPlat: true, risk: 'security_scam_malware' }); // 4 on 2 platforms == promotion bar -> skipped (ewsPromote_'s)
    const c5 = makeCluster('five_au', 5, { risk: 'security_scam_malware' }); // at promotion bar -> skipped
    const cCopy = makeCluster('copy_ring', 3, { copyRing: true, noBrand: true }); // copy ring without Google brand -> skipped
    const cCool = makeCluster('in_cooldown', 3, { risk: 'security_scam_malware', al: { at: NOW - 10 * MIN, au: 3, id: 'ED-OLD' } });
    const cMarkedSame = makeCluster('marked_3', 3, { risk: 'security_scam_malware' });
    const cMarkedRaised = makeCluster('already_raised', 4, { risk: 'security_scam_malware' });

    const marks = {
      marked_3: [NOW - 5 * MIN, 3, 0], // already asked at 3 accounts -> wait until it grows
      already_raised: [NOW - 5 * MIN, 3, 1], // already raised -> never ask again even at 4
    };
    const picked = bot.ewsWatchPick_([c2, c4Plain, c3Risk, c4TwoPlat, c5, cCopy, cCool, cMarkedSame, cMarkedRaised], [], marks, NOW, 3);
    eq(picked.map(x => x.id), ['three_risk', 'four_plain']);
    const pickedAt4 = bot.ewsWatchPick_([c2, c4Plain, c3Risk], [], marks, NOW, 4);
    eq(pickedAt4.map(x => x.id), ['four_plain']);

    // Novelty check against older stored clusters
    const olderSameVec = makeCluster('older_same', 3, { t0: NOW - 60 * MIN, vec: encA });
    eq(bot.ewsWatchNovel_(picked[0], [olderSameVec, c3Risk, c4Plain]), false); // older cluster has identical centroid
    eq(bot.ewsWatchNovel_(picked[1], [olderSameVec, c3Risk, c4Plain]), true); // orthogonal centroid -> novel

    // 3. Early-watch card states plainly it is an early signal + account count, parses with edParseCard_, and passes leak guards (Rule 13)
    const watchRow = bot.ewsWatchRow_(picked[0], NOW, { line: 'Product - Scams involving Google products', raise: 'P1' });
    eq(watchRow.signal_type, 'EARLY_WATCH');
    assert.match(watchRow.alert_id, /^ED-WAT-three_risk-/);
    const ed = bot.edFromRow_(watchRow);
    const cardText = bot.edStoryCardText_(ed, {
      disposition: 'escalate',
      basis: 'early_detection',
      why: 'Credible early malware reports mentioning Gmail across 3 independent accounts',
      rev: {
        severity: 'high',
        confidence: 0.91,
        story: {
          title: 'Early malware reports targeting Gmail sessions',
          body: 'Three accounts described token-stealing malware on [the first post](P1).',
          steps: ['Open a temp check to track growth.'],
        },
        slrr: { is_slrr: true, confidence: 0.9, product: 'Gmail', exposure_tag: 'Product - Scams involving Google products', sensitive_topics: [] },
      },
    }, NOW);
    eq(cardText.split('\n')[0], '\u26a1 *EARLY SIGNAL* \u00b7 3 accounts so far (a story is usually flagged at 5)');  // the card's first line says so
    const parsedCard = bot.edParseCard_(cardText, []);
    assert.ok(parsedCard && parsedCard.headline === 'Early malware reports targeting Gmail sessions');
    eq(bot.detectAlert_(cardText, bot.parseAlert_(cardText), ''), false);
    const guardCfg = { terms: ['SLRR Triaged Alerts', 'Mirror Training Space'] };
    eq(Array.from(bot.outboxGuardHits_(cardText, guardCfg)), []);
    eq(Array.from(bot.guardHits_(cardText, guardCfg)), []);
    eq(Array.from(bot.relayGuardHits_(cardText)), []);
  });

  test('early watch (5C): 3-account producer watch at the seed Control bars (B43:B45, B47) -> card -> 5-account promotion updates in the first card\'s thread (never a second card), failed-review retry/drop, and 8-of-40 daily cap share', () => {
    const EWS_COLS = [
      ['kind'], ['lane'], ['mid'], ['url'], ['platform'], ['author'],
      ['audience', 'INTEGER'], ['eng', 'INTEGER'], ['posted_ms', 'INTEGER'], ['seen_ms', 'INTEGER'],
      ['txt'], ['topic'], ['chash'], ['sig'], ['risk'], ['brand', 'BOOLEAN'],
    ];
    const makePost = (i, nowMs) => ({
      kind: 'post',
      lane: 'sonar',
      mid: `M-REMUS-${i}`,
      url: `https://x.com/sec_reporter_${i}/status/217000000000000000${i}`,
      platform: 'twitter',
      author: `sec_reporter_${i}`,
      audience: 420,
      eng: 16,
      posted_ms: nowMs - (8 - i) * MIN,
      seen_ms: nowMs - (7 - i) * MIN,
      txt: 'New malware family stealing active Gmail session cookies from Windows browsers without triggering 2FA prompts',
      topic: 'Workspace',
      chash: `ch_remus_${i}`,
      sig: `sig_remus_${i}`,
      risk: 'security_scam_malware',
      brand: true,
    });

    function makeProducerWatchEnv() {
      const t = e2e();
      t.chat.addSpace(MIRROR, MIRROR_NAME);
      t.bot.setup();
      t.set('B25', ROOM);
      t.set('B30', 'tester@testing.test');
      t.chat.addDm('tester@testing.test', 'spaces/DMSTANDIN');
      t.bot.startMirror(MIRROR_NAME);
      t.control().getRange(29, 2).setValue('ON');
      let currentPosts = [];
      let decCalls = 0;
      const origFetch = t.g.services.UrlFetchApp.fetch;
      t.g.services.UrlFetchApp.fetch = (url, params) => {
        const u = String(url);
        if (u.includes('secretmanager.googleapis.com/')) {
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ payload: { data: Buffer.from(TEST_KEY, 'utf8').toString('base64') } }),
            getHeaders: () => ({}),
          };
        }
        if (u.includes('/decisions')) {
          decCalls++;
          // Real recorded high-severity response (g=0.98, r=0.97, i=0.62, l=4, sc=0.95)
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify(FX.signal_responses['ED-CLU-CLU-dc5a8afd13da-202611061731']),
            getHeaders: () => ({}),
          };
        }
        if (u.startsWith('https://bigquery.googleapis.com/')) {
          const body = JSON.parse((params && params.payload) || '{}');
          const loc = body.location || 'US';
          const isEws = /-- ews:/.test(body.query || '');
          const rows = isEws && loc === 'us-central1' ? currentPosts : [];
          const cols = isEws ? EWS_COLS : [['url']];
          return {
            getResponseCode: () => 200,
            getHeaders: () => ({}),
            getContentText: () => JSON.stringify({
              jobComplete: true,
              jobReference: { projectId: 'brand-social-central-data', jobId: `j_${loc}_${t.g.clock.now}`, location: loc },
              schema: { fields: cols.map(c => ({ name: c[0], type: c[1] || 'STRING' })) },
              rows: rows.map(r => ({ f: cols.map(c => ({ v: r[c[0]] === undefined || r[c[0]] === null ? null : String(r[c[0]]) })) })),
            }),
          };
        }
        return origFetch(url, params);
      };
      t.g.vertex.earlyDetection = payload => {
        const txt = payload.contents[0].parts.map(p => p.text || '').join('\n');
        const isUpdate = txt.includes('EARLIER CARD ON THIS STORY');
        return {
          summary: 'Independent security accounts describe session-cookie malware targeting Gmail.',
          issue_name: 'Gmail session-cookie malware reports',
          emerging_narrative: 'Low-tier security accounts converge on Gmail cookie-theft reports.',
          early_detection_call: {
            disposition: 'monitor',
            severity: 'high',
            confidence: 0.9,
            reason: isUpdate ? 'Story crossed the 5-account bar on the same narrative' : 'Credible 3-account early signal',
            build_up_signals: 'Independent accounts with distinct reports',
            watch_for: 'Wider researcher confirmation',
          },
          temp_check_draft: { recommended: true, query_suggestion: 'Gmail AND malware AND cookie', scope_note: 'Last 6h' },
          slrr: {
            is_slrr: true,
            confidence: 0.88,
            exposure_tag: 'Product - Scams involving Google products',
            product: 'Gmail',
            other_products: [],
            sensitive_topics: [],
            location: 'US',
          },
          known_issue: { matches: false, confidence: 0.92 },
          tns: { needed: false, reason: '' },
          recommended_groups: [],
          story_title: 'Gmail session-cookie malware reports',
          story: 'Security accounts reported cookie-stealing malware on [the lead post](P1).',
          web_context: 'No public advisory yet.',
          next_steps: ['Track volume across security accounts.'],
        };
      };
      return { t, setPosts: list => { currentPosts = list; }, decCalls: () => decCalls };
    }

    // 1. With B47 (independent_reports) raised to '0.65': the recorded response has independent_reports=0.62 < 0.65 -> asks 1 story, does not raise
    const belowBar = makeProducerWatchEnv();
    belowBar.t.control().getRange(19, 2).setValue('ON');
    belowBar.t.control().getRange(38, 2).setValue('ON');
    belowBar.t.control().getRange(39, 2).setValue('ON');
    belowBar.t.control().getRange(47, 2).setValue('0.65');
    belowBar.setPosts([1, 2, 3].map(i => makePost(i, belowBar.t.g.clock.now)));
    belowBar.t.poll();
    eq([belowBar.decCalls(), edCardsOf(belowBar.t).length], [1, 0]);
    assert.match(belowBar.t.control().cell(38, 3), /1 early story asked about/);
    eq(belowBar.t.sheet().getSheetByName('Fast triage'), null);

    // 2. At the seed bars, nothing edited (B43 '0.55', B44 '0.80', B47 '0.30'; the recorded response: about_google 0.98, brand_risk 0.97,
    //    independent_reports 0.62, critical at 0.78): 3 accounts -> EARLY_WATCH card -> 5 accounts -> thread update in first card's thread (NEVER a second card!)
    const cal = makeProducerWatchEnv();
    cal.t.control().getRange(19, 2).setValue('ON');
    cal.t.control().getRange(38, 2).setValue('ON');
    cal.t.control().getRange(39, 2).setValue('ON');
    eq([43, 44, 45, 47].map(r => cal.t.control().cell(r, 2)), ['0.55', '0.80', '3', '0.30']);
    cal.setPosts([1, 2, 3].map(i => makePost(i, cal.t.g.clock.now)));
    cal.t.poll();

    eq(cal.decCalls(), 1); // asked once in producer; earlyWaveCheck_ reused row.dec without a second Decisions call!
    const topCards1 = edCardsOf(cal.t);
    eq(topCards1.length, 1);
    const firstCard = topCards1[0];
    eq(firstCard.text.split('\n')[0], '\u26a1 *EARLY SIGNAL* \u00b7 3 accounts so far (a story is usually flagged at 5)');
    // C19 counts the early signal's card among the day's cards; the run's record says which kind it was
    assert.match(cal.t.control().cell(19, 3), / · today: 1 found, 1 card, 0 under another alert, 0 let go, 0 never reviewed, 0 waiting · /);
    eq(cal.t.bot.edNotesOfRun_().map(r => cal.t.bot.edNoteObj_(r)).map(r => [r.kind, /^Card posted: /.test(r.outcome)]), [['Early signal (3-4 accounts)', true]]);

    // 15 minutes later: 2 more distinct accounts report the same story (total 5 -> crosses normal promotion bar!)
    cal.t.g.clock.now += 15 * MIN;
    cal.setPosts([4, 5].map(i => makePost(i, cal.t.g.clock.now)));
    cal.t.poll();

    eq(cal.decCalls(), 2); // 1 call for the newly promoted 5-account CLUSTER_EMERGENCE signal
    const topCards2 = edCardsOf(cal.t);
    eq(topCards2.length, 1, 'must NEVER post a second top-level story card when crossing the normal promotion bar');
    const threadReplies = cal.t.chat.botPosts(MIRROR).filter(m =>
      m.threadReply && m.thread.name === firstCard.thread.name && /^client-zeda-/.test(m.clientAssignedMessageId || '')
    );
    eq(threadReplies.length, 1, 'normal promotion arrives as an Early Detection Update in the first card\'s thread');
    assert.ok(threadReplies[0].text.startsWith('📈 *UPDATE* \u00b7 More on a story already alerted\n'), threadReplies[0].text);
    assert.match(threadReplies[0].text, /\*What's new:\* 5 accounts now, up from 3: the story is now past the usual bar/);
    // The Alert-log rows the flow wrote say which kind of signal each alert was (the Early Detection snapshot's
    // signal_type, EarlyDetection.gs edSnap_): the Head start tab types the story by its first alert's ("Early signal"),
    // and counts the card and its update as one story
    const edRows = cal.t.bot.sheetBackend_(cal.t.sheet()).loadAlerts().filter(r => r.ingested === cal.t.bot.ev('ED_ALERT_INGESTED_'));
    eq(edRows.map(r => [r.forwarded_fields.early_detection.signal_type, cal.t.bot.headStartOwnType_(r)]),
      [[cal.t.bot.ev('EWS_WATCH_SIGNAL_'), 'Early signal'], ['CLUSTER_EMERGENCE', 'Early Detection']]);
    eq(cal.t.bot.headStartReport_(edRows, null, cal.t.g.clock.now).stories.map(s => [s.type, s.alerts, s.alert_ids]),
      [['Early signal', 2, edRows.map(r => r.alert_id)]]);

    // 3. Watch-tier failed review (Decision 11 / Rule 2): posts NO card, retries once more up to ED_QUEUE_MAX_TRIES_ (2), then drops
    const watchSample = Object.assign({}, FX.signals[2], {
      alert_id: 'ED-WAT-clu_fail_test-202611131600',
      signal_type: 'EARLY_WATCH',
      unique_low_tier_authors: 3,
    });
    const failEnv = makeFastTriageE2e(() => [watchSample], (payload) => matchRecordedResponse(failEnv.t.bot, payload));
    failEnv.t.g.vertex.earlyDetection = () => { throw new Error('Vertex 503 overloaded'); };
    failEnv.t.control().getRange(19, 2).setValue('ON');
    failEnv.t.control().getRange(38, 2).setValue('ON');
    failEnv.t.control().getRange(39, 2).setValue('ON');
    failEnv.t.poll(); // Try 1 fails -> stays queued, 0 cards posted
    const propsFail = failEnv.t.g.services.PropertiesService.getScriptProperties();
    eq([edCardsOf(failEnv.t).length, failEnv.t.bot.edQueueList_(propsFail).length, failEnv.t.bot.edQueueList_(propsFail)[0].tries], [0, 1, 1]);
    assert.match(failEnv.t.g.logs.join('\n'), /ED-WAT-clu_fail_test-202611131600 stays queued for one more try \(its review failed\)/);

    failEnv.t.g.clock.now += 2 * MIN;
    failEnv.t.poll(); // Try 2 fails -> hits ED_QUEUE_MAX_TRIES_ (2) -> dropped with 0 cards posted
    eq([edCardsOf(failEnv.t).length, failEnv.t.bot.edQueueList_(propsFail).length], [0, 0]);
    assert.match(failEnv.t.g.logs.join('\n'), /dropped ED-WAT-clu_fail_test-202611131600 \(its review failed 2 times: no card without a review\)/);

    // Turning Row 39 OFF while an EARLY_WATCH signal waits in the queue drops it unreviewed
    const dropOffEnv = makeFastTriageE2e(() => [watchSample], (payload) => matchRecordedResponse(dropOffEnv.t.bot, payload));
    const propsDrop = dropOffEnv.t.g.services.PropertiesService.getScriptProperties();
    dropOffEnv.t.control().getRange(19, 2).setValue('ON');
    dropOffEnv.t.control().getRange(38, 2).setValue('ON');
    dropOffEnv.t.bot.edQueuePut_(propsDrop, watchSample, dropOffEnv.t.g.clock.now, { sv: 3.1, br: 0.9 });
    dropOffEnv.t.poll(); // Row 39 is OFF -> dropped unreviewed
    eq([edCardsOf(dropOffEnv.t).length, dropOffEnv.t.bot.edQueueList_(propsDrop).length], [0, 0]);
    assert.match(dropOffEnv.t.g.logs.join('\n'), /dropped ED-WAT-clu_fail_test-202611131600 \(the early watch is OFF\)/);

    // 4. Daily cap share (EW_WATCH_QUEUE_PER_DAY_ = 8 of EW_MAX_PER_DAY_ = 40): 8th watch queues, 9th watch is held off while regular clusters still queue
    const w1 = Object.assign({}, FX.signals[0], { alert_id: 'ED-WAT-cap1', cluster_id: 'clu_wcap1', signal_key: 'clu_wcap1', signal_type: 'EARLY_WATCH', unique_low_tier_authors: 3 });
    const w2 = Object.assign({}, FX.signals[1], { alert_id: 'ED-WAT-cap2', cluster_id: 'clu_wcap2', signal_key: 'clu_wcap2', signal_type: 'EARLY_WATCH', unique_low_tier_authors: 3 });
    const c1 = FX.signals[2]; // regular CLUSTER_EMERGENCE
    const capEnv = makeFastTriageE2e(() => [w1, w2, c1], (payload) => matchRecordedResponse(capEnv.t.bot, payload));
    const propsCap = capEnv.t.g.services.PropertiesService.getScriptProperties();
    propsCap.setProperty('EARLY_DETECTION_TODAY', JSON.stringify({
      day: capEnv.t.bot.dayKey_(),
      clusters: 0,
      velocity: 0,
      queued: 7,
      watchq: 7, // 1 watch slot left of 8; 33 overall slots left of 40
    }));
    capEnv.t.control().getRange(19, 2).setValue('ON');
    capEnv.t.control().getRange(38, 2).setValue('ON');
    capEnv.t.control().getRange(39, 2).setValue('ON');
    capEnv.t.poll();

    const dayAfter = JSON.parse(propsCap.getProperty('EARLY_DETECTION_TODAY'));
    eq([dayAfter.watchq, dayAfter.queued], [8, 9]); // 1 watch queued (reaching 8/8) + 1 regular cluster queued (reaching 9/40); 2nd watch skipped!
  });

  test('fast triage (5D): cadence telemetry (ewLogCheck_), dynamic C19 label, B31 lookback invariance, and daily-cap producer continuity without Decisions calls', () => {
    const MIN = 60 * 1000;
    const env = makeEnv(() => ({ code: 200, body: FX.probe.six_questions_doc_input.response.body }));
    const { bot, g } = env;

    // 1. Constants remain at 15 min / 10 min pending 1-day live measurement (Decision 13)
    eq([bot.ev('EW_EVERY_MS_'), bot.ev('EWS_EVERY_MS_')], [15 * MIN, 10 * MIN]);

    // 2. Control C19 ON text derives dynamically from EW_EVERY_MS_
    const ewSwitch = bot.ev('CONTROL_SWITCHES_').find(s => s.key === 'earlyWave');
    assert.match(ewSwitch.on(), /^✓ ON: every 15 min, groups new posts from small accounts into stories/);
    eq(
      bot.ev('(() => { const was = EW_EVERY_MS_; return `every ${Math.round((5 * 60 * 1000) / 60000)} min (now ${Math.round(was / 60000)} min)`; })()'),
      'every 5 min (now 15 min)'
    );

    // 3. B31 lookback dropdown validation is untouched; edLookbackMinutes_ absorbs 5-min and 15-min intervals seamlessly
    const probeEnv = makeFastTriageE2e(() => [], () => ({ code: 200, body: FX.probe.six_questions_doc_input.response.body }));
    const sh = probeEnv.t.control();
    eq([sh.validations['31,2'].values, sh.validations['31,2'].allowInvalid], [['15 minutes', '30 minutes', '45 minutes', '60 minutes'], false]);
    const T0 = g.clock.now;
    eq(bot.edLookbackMinutes_({ bq_lookback_minutes: 15 }, T0 - 5 * MIN, T0), 25);   // 5m check + 20m margin > 15m B31
    eq(bot.edLookbackMinutes_({ bq_lookback_minutes: 60 }, T0 - 5 * MIN, T0), 60);   // 60m B31 > 25m
    eq(bot.edLookbackMinutes_({ bq_lookback_minutes: 15 }, T0 - 15 * MIN, T0), 35);  // 15m check + 20m margin

    // 4. ewLogCheck_ records producer timing + rolling 10m/60m Gemini, BigQuery, and Decisions counts + remaining run budget
    const props = g.services.PropertiesService.getScriptProperties();
    const logs = [];
    const fakeCtx = { log: m => logs.push(String(m)) };

    // Before EWS_STATE.last exists and with unbounded left(): logs "time not known" and "all of the run left"
    bot.ewLogCheck_(fakeCtx, props, () => Infinity);
    eq(logs.length, 1);
    assert.match(logs[0], /^early wave check: producer time not known \(read 0, kept 0, embedded 0\) · calls in the last 10 \/ 60 min: Gemini 0 \/ 0, BigQuery 0 \/ 0, Decisions 0 \/ 0 · all of the run left$/);

    // Record real ApiGuard ticks + EWS_STATE.last and verify exact numbers in ewLogCheck_
    bot.apiGuardNote_('gemini', 1);
    bot.apiGuardNote_('bigquery', 2);
    bot.apiGuardNote_('decisions', 1);
    props.setProperty('EWS_STATE', JSON.stringify({
      last: { at: T0, ms: 6140, read: 142, kept: 58, embedded: 31 },
    }));
    logs.length = 0;
    bot.ewLogCheck_(fakeCtx, props, () => 245000);
    eq(logs.length, 1);
    eq(
      logs[0],
      'early wave check: producer 6.1 s (read 142, kept 58, embedded 31) · calls in the last 10 / 60 min: Gemini 1 / 1, BigQuery 2 / 2, Decisions 1 / 1 · 245 s of the run left'
    );

    // 5. Daily cap option (b): at queued === 40 with Rows 19 + 38 + 39 ON, producer keeps reading & clustering,
    //    makes ZERO Decisions calls, queues nothing, returns capped: true even when buffer is empty, and leaves new
    //    stories unmarked so tomorrow's first check after midnight picks them up!
    const vecStory = new Array(768).fill(0);
    vecStory[0] = 0.72;
    vecStory[1] = 0.694;
    let currentPosts = [];
    let bqReads = 0;
    let decCount = 0;
    const capT = H.e2e();
    capT.chat.addSpace(MIRROR, 'Google Mirror');
    capT.bot.setup();
    const origCapFetch = capT.g.services.UrlFetchApp.fetch;
    capT.g.services.UrlFetchApp.fetch = (url, params) => {
      const u = String(url);
      if (u.includes('secretmanager.googleapis.com/')) {
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ payload: { data: Buffer.from(TEST_KEY, 'utf8').toString('base64') } }),
          getHeaders: () => ({}),
        };
      }
      if (u.includes('/decisions')) {
        decCount++;
        return {
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify(FX.signal_responses['ED-CLU-CLU-dc5a8afd13da-202611061731']),
          getHeaders: () => ({}),
        };
      }
      if (u.startsWith('https://bigquery.googleapis.com/')) {
        const body = JSON.parse((params && params.payload) || '{}');
        const loc = body.location || 'US';
        const isEws = /-- ews:/.test(body.query || '');
        if (isEws && loc === 'us-central1') bqReads++;
        const rows = isEws && loc === 'us-central1' ? currentPosts : [];
        const EWS_COLS = [
          ['kind'], ['lane'], ['mid'], ['url'], ['platform'], ['author'],
          ['audience', 'INTEGER'], ['eng', 'INTEGER'], ['posted_ms', 'INTEGER'], ['seen_ms', 'INTEGER'],
          ['txt'], ['topic'], ['chash'], ['sig'], ['risk'], ['brand', 'BOOLEAN'],
        ];
        const cols = isEws ? EWS_COLS : [['url']];
        return {
          getResponseCode: () => 200,
          getHeaders: () => ({}),
          getContentText: () => JSON.stringify({
            jobComplete: true,
            jobReference: { projectId: 'brand-social-central-data', jobId: `j_cap_${loc}_${capT.g.clock.now}`, location: loc },
            schema: { fields: cols.map(c => ({ name: c[0], type: c[1] || 'STRING' })) },
            rows: rows.map(r => ({ f: cols.map(c => ({ v: r[c[0]] === undefined || r[c[0]] === null ? null : String(r[c[0]]) })) })),
          }),
        };
      }
      return origCapFetch(url, params);
    };
    capT.bot.embedTexts_ = texts => texts.map(() => vecStory);
    capT.bot.vecEvergreenOfVecs_ = vecs => vecs.map(() => null);
    capT.bot.vecTagHintsOfVecs_ = vecs => vecs.map(() => ({
      tag: 'Product - Scams involving Google products',
      priority: 'P1',
      similarity: 0.78,
      topics: [],
    }));
    capT.control().getRange(9, 2).setValue(MIRROR);
    capT.control().getRange(19, 2).setValue('ON');
    capT.control().getRange(38, 2).setValue('ON');
    capT.control().getRange(39, 2).setValue('ON');

    const capProps = capT.g.services.PropertiesService.getScriptProperties();
    capProps.setProperty('EARLY_DETECTION_TODAY', JSON.stringify({
      day: capT.bot.dayKey_(),
      clusters: 5,
      velocity: 0,
      queued: 40, // already at EW_MAX_PER_DAY_
    }));

    // Check 1 at cap with empty posts: still reads BigQuery, logs ewLogCheck_, returns capped: true, 0 Decisions calls
    const ctxCap1 = {
      now: () => capT.g.clock.now,
      deadline: capT.g.clock.now + 240000,
      outboundBlocked: true,
      settings: { bq_lookback_minutes: 60 },
      switches: { earlyWave: true, fastTriage: true, fastTriageRank: true, fastTriageHold: false },
      spaces: { burson: { id: MIRROR, externalUserAllowed: false }, analyst: { id: MIRROR, externalUserAllowed: false } },
      store: { alerts: [] },
      log: m => capT.g.logs.push(String(m)),
    };
    // Row 38 ON by itself at the cap (rows 39 and 40 OFF: nothing uses the check's stories): exactly as with row 38 OFF, the
    // check returns early without one BigQuery read. With row 39 (or 40) as well it reads on (below)
    const at = capT.bot.ev('ED_AT_PROP_');
    const alone = capT.bot.earlyWaveCheck_(Object.assign({}, ctxCap1, { switches: { earlyWave: true, fastTriage: true, fastTriageRank: false, fastTriageHold: false } }));
    eq([alone, bqReads, decCount], [{ queued: 0, failed: 0, capped: true }, 0, 0]);
    capProps.deleteProperty(at);
    const off = capT.bot.earlyWaveCheck_(Object.assign({}, ctxCap1, { switches: { earlyWave: true, fastTriage: false, fastTriageRank: true, fastTriageHold: true } }));
    eq([off, bqReads, decCount], [{ queued: 0, failed: 0, capped: true }, 0, 0]);  // rows 39 and 40 without row 38: OFF
    capProps.deleteProperty(at);
    const resEmptyAtCap = capT.bot.earlyWaveCheck_(ctxCap1);
    eq([resEmptyAtCap.capped, resEmptyAtCap.queued, bqReads, decCount], [true, 0, 1, 0]);
    assert.ok(capT.g.logs.some(l => l.startsWith('early wave check: producer ')), 'ewLogCheck_ logged on capped check');

    // Check 2 at cap (15 min later) with 5 distinct accounts reporting a brand-new story:
    // producer clusters and buffers the 5-account story, but queueing stops at cap with 0 Decisions calls!
    capT.g.clock.now += 15 * MIN;
    currentPosts = [1, 2, 3, 4, 5].map(i => ({
      kind: 'post',
      lane: 'sonar',
      mid: `M-CAP-${i}`,
      url: `https://x.com/cap_sec_${i}/status/${99000 + i}`,
      platform: 'twitter',
      author: `cap_sec_${i}`,
      audience: 350 + i * 20,
      eng: 9 + i,
      posted_ms: capT.g.clock.now - (7 - i) * MIN,
      seen_ms: capT.g.clock.now - MIN,
      txt: 'New malware family stealing active Gmail session cookies from Windows browsers without triggering 2FA prompts',
      topic: 'Workspace',
      chash: `ch_cap_${i}`,
      sig: `sig_cap_${i}`,
      risk: 'security_scam_malware',
      brand: true,
    }));
    const resStoryAtCap = capT.bot.earlyWaveCheck_(Object.assign({}, ctxCap1, { deadline: capT.g.clock.now + 240000 }));
    eq([resStoryAtCap.capped, resStoryAtCap.queued, bqReads, decCount, capT.bot.edQueueList_(capProps).length], [true, 0, 2, 0, 0]);

    // Roll day forward past midnight (simulate yesterday's day key on EARLY_DETECTION_TODAY) + 15 min:
    // the warm buffered story was NOT marked seen at the cap, so tomorrow's first check asks Decisions and queues it!
    currentPosts = [];
    capProps.setProperty('EARLY_DETECTION_TODAY', JSON.stringify({
      day: '2026-11-12',
      clusters: 5,
      velocity: 0,
      queued: 40,
    }));
    capT.g.clock.now += 15 * MIN;
    const resNextDay = capT.bot.earlyWaveCheck_(Object.assign({}, ctxCap1, { deadline: capT.g.clock.now + 240000 }));
    eq([resNextDay.capped, resNextDay.queued, decCount, capT.bot.edQueueList_(capProps).length], [false, 1, 1, 1]);
  });

  // =============================================================================================================
  // Section 4, 5 & 6.4 — Control tab bar cells (rows 41-45 and 47), early_wave BigQuery writer (row 46), and record-only guard
  // =============================================================================================================

  test('fast triage (Section 4): Control tab bar cells (rows 41-45 and 47) have strict dropdowns, read on each run, fall back to seed on blank or invalid with a column C note, and never turn a feature off; a confidence cell still at the first build seed moves to the new one once', () => {
    const t = e2e();
    t.bot.setup();
    const sh = t.control();
    const specs = t.bot.ev('FT_BAR_SPECS_');
    eq(specs.map(s => [s.row, s.key, s.label, s.seedText, s.seed]), [
      [41, 'about', 'Hold-back: about_google at or below', '0.10', 0.10],
      [42, 'noise', 'Hold-back: routine_noise at or above', '0.90', 0.90],
      [43, 'conf', 'Hold-back and early watch: answer confidence at or above', '0.55', 0.55],
      [44, 'watch', 'Early watch: about_google and brand_risk, each at or above', '0.80', 0.80],
      [45, 'accounts', 'Early watch: distinct accounts, at least', '3', 3],
      [47, 'independent', 'Early watch: independent_reports at or above', '0.30', 0.30],  // below the BigQuery switch (46): rows 41-46 never move
    ]);
    const PROBS = ['0.05', '0.10', '0.15', '0.20', '0.25', '0.30', '0.35', '0.40', '0.45', '0.50', '0.55', '0.60', '0.65', '0.70', '0.75', '0.80', '0.85', '0.90', '0.95'];
    eq(specs.map(s => s.choices), [PROBS, PROBS, PROBS, PROBS, ['2', '3', '4'], PROBS]);
    eq([sh.cell(46, 1), sh.cell(48, 1), sh.cell(49, 1), sh.cell(52, 1), sh.cell(53, 1), sh.cell(56, 1), sh.cell(57, 1)], ['Write early-wave records to BigQuery', 'Early Detection: also read the AMIE table', 'Early Detection: also read Brandwatch live (not X)', '', '', 'Speed numbers: leave out when the bot was not running', 'How it works']);  // row 56 is a switch now (it was blank)

    // 1. Every bar row has strict dropdown validation (allowInvalid === false) and seed value on setup()
    for (const s of specs) {
      eq([sh.cell(s.row, 1), sh.cell(s.row, 2), sh.validations[`${s.row},2`].values, sh.validations[`${s.row},2`].allowInvalid],
        [s.label, s.seedText, s.choices, false], `row ${s.row}`);
      assert.match(sh.cell(s.row, 3), /^✓ /, `C${s.row} seed note`);
    }
    eq(t.bot.ftBarsFor_(t.bot.readControl_(sh).ftBars).values, { about: 0.10, noise: 0.90, conf: 0.55, watch: 0.80, accounts: 3, independent: 0.30 });

    // 2. Editing each bar cell updates ftBars on the next run and updates column C
    sh.getRange(41, 2).setValue('0.15');
    sh.getRange(42, 2).setValue('0.85');
    sh.getRange(43, 2).setValue('0.75');
    sh.getRange(44, 2).setValue('0.70');
    sh.getRange(45, 2).setValue('4');
    sh.getRange(47, 2).setValue('0.45');
    t.poll();
    eq(t.bot.ftBarsFor_(t.bot.readControl_(sh).ftBars).values, { about: 0.15, noise: 0.85, conf: 0.75, watch: 0.70, accounts: 4, independent: 0.45 });
    assert.match(sh.cell(44, 3), /^✓ Early watch \(row 39\) requires about_google and brand_risk each at or above 0\.70/);
    assert.match(sh.cell(47, 3), /^✓ Early watch \(row 39\) requires independent_reports at or above 0\.45/);
    assert.match(sh.cell(41, 3), /^✓ Hold-back \(row 40\) drops a low-severity signal when about_google is at or below 0\.15/);
    assert.match(sh.cell(45, 3), /^✓ Early watch \(row 39\) looks at stories below the promotion bar with at least 4 distinct accounts/);

    // 3. Blank or invalid value in any bar cell never turns a feature off: uses its seed and states so in Column C
    sh.getRange(41, 2).setValue('');
    sh.getRange(42, 2).setValue('not-a-number');
    sh.getRange(43, 2).setValue('2.50'); // out of (0, 1) range
    sh.getRange(44, 2).setValue('-0.1');
    sh.getRange(45, 2).setValue('9');    // out of [2, 4] range
    sh.getRange(47, 2).setValue('lots');
    t.poll();
    eq(t.bot.ftBarsFor_(t.bot.readControl_(sh).ftBars).values, { about: 0.10, noise: 0.90, conf: 0.55, watch: 0.80, accounts: 3, independent: 0.30 });
    assert.match(sh.cell(41, 3), /^Blank: using seed 0\.10 /);
    assert.match(sh.cell(42, 3), /^⚠️ Couldn't use "not-a-number": using seed 0\.90 /);
    assert.match(sh.cell(43, 3), /^⚠️ Couldn't use "2\.50": using seed 0\.55 /);
    assert.match(sh.cell(44, 3), /^⚠️ Couldn't use "-0\.1": using seed 0\.80 /);
    assert.match(sh.cell(45, 3), /^⚠️ Couldn't use "9": using seed 3 /);
    assert.match(sh.cell(47, 3), /^⚠️ Couldn't use "lots": using seed 0\.30 /);

    // 4. A tab the first build made (rows 41-46 as it left them: one bar for the three early-watch answers in row 44, the confidence bar
    //    seeded 0.80, "How it works" from row 48): on the next run row 44 keeps its value under its new label, row 47 is the
    //    independent_reports bar at its seed, row 48 the AMIE table's switch (OFF), "How it works" moves to row 57, and the
    //    confidence cell still at that build's seed (0.80) moves to 0.55, once. Rows 38-46 keep what people set.
    const older = (conf) => {
      const o = e2e();
      o.bot.setup();
      const tab = o.control();
      tab.getRange(43, 2).setValue(conf);
      tab.getRange(44, 1, 1, 2).setValues([['Early watch: about_google, brand_risk and independent_reports, each at or above', '0.70']]);
      tab.getRange(45, 2).setValue('4');
      tab.getRange(46, 2).setValue('ON');
      tab.getRange(47, 1, 1, 3).setValues([['', '', '']]);
      tab.getRange(48, 1).setValue('How it works');
      o.g.props.delete('FT_BAR_SEED_VERSION');
      o.poll();
      return { o, tab };
    };
    const first = older('0.80');
    eq([41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57].map(r => [first.tab.cell(r, 1), first.tab.cell(r, 2)]), [
      ['Hold-back: about_google at or below', '0.10'], ['Hold-back: routine_noise at or above', '0.90'],
      ['Hold-back and early watch: answer confidence at or above', '0.55'],
      ['Early watch: about_google and brand_risk, each at or above', '0.70'], ['Early watch: distinct accounts, at least', '4'],
      ['Write early-wave records to BigQuery', 'ON'], ['Early watch: independent_reports at or above', '0.30'],
      ['Early Detection: also read the AMIE table', 'OFF'], ['Early Detection: also read Brandwatch live (not X)', 'OFF'], ['Proactive watch: also read the AMIE table', 'OFF'], ['Open engine: judgment in place of caps', 'OFF'], ['', ''], ['', ''],
      ['Live dashboard', 'OFF'], ['Slide deliveries', 'OFF'], ['Speed numbers: leave out when the bot was not running', 'OFF'], ['How it works', '']]);  // row 56 is a switch now (it was blank)
    assert.match(first.tab.cell(43, 3), /^✓ Hold-back \(row 40\) and early watch \(row 39\) require answer confidence at or above 0\.55/);
    eq(first.tab.rows.filter(r => String(r[0]).trim() === 'How it works').length, 1);
    eq(first.o.bot.ftBarsFor_(first.o.bot.readControl_(first.tab).ftBars).values, { about: 0.10, noise: 0.90, conf: 0.55, watch: 0.70, accounts: 4, independent: 0.30 });
    first.tab.getRange(43, 2).setValue('0.80');  // a person puts 0.80 back afterwards: it stays
    first.o.poll();
    first.o.poll();
    eq(first.tab.cell(43, 2), '0.80');
    eq(older('0.70').tab.cell(43, 2), '0.70');  // any other value was a person's: kept
  });

  test('early_wave BigQuery writer (Section 5 & 6.4): row 46 defaults OFF (0 writes), batches <=1 insertAll per table per check with deterministic insertIds and zero PII, writes only the columns it declares (EW_BQ_COLUMNS_), one signals row a signal, fails open pausing only the table that failed for 15m, and codebase has zero record-only paths', () => {
    const EWS_COLS = [
      ['kind'], ['lane'], ['mid'], ['url'], ['platform'], ['author'],
      ['audience', 'INTEGER'], ['eng', 'INTEGER'], ['posted_ms', 'INTEGER'], ['seen_ms', 'INTEGER'],
      ['txt'], ['topic'], ['chash'], ['sig'], ['risk'], ['brand', 'BOOLEAN'],
    ];
    const makePost = (i, nowMs) => ({
      kind: 'post',
      lane: 'sonar',
      mid: `M-BQ-${i}`,
      url: `https://x.com/sec_acct_${i}/status/218000000000000000${i}?utm_source=share`,
      platform: 'twitter',
      author: `@sec_acct_${i}`,
      audience: 500,
      eng: 20,
      posted_ms: nowMs - (8 - i) * MIN,
      seen_ms: nowMs - (7 - i) * MIN,
      txt: 'Chrome update causes password manager sync failure across enterprise profiles',
      topic: 'Chrome',
      chash: `ch_bq_${i}`,
      sig: `sig_bq_${i}`,
      risk: 'widespread_outage_bug',
      brand: true,
    });

    function makeBqWriterEnv() {
      const t = e2e();
      t.chat.addSpace(MIRROR, MIRROR_NAME);
      t.bot.setup();
      t.set('B25', ROOM);
      t.set('B30', 'tester@testing.test');
      t.chat.addDm('tester@testing.test', 'spaces/DMSTANDIN');
      t.bot.startMirror(MIRROR_NAME);
      t.control().getRange(29, 2).setValue('ON');
      let currentPosts = [1, 2, 3, 4, 5].map(i => makePost(i, t.g.clock.now));
      const inserts = [];
      let failTable = '';
      const origFetch = t.g.services.UrlFetchApp.fetch;
      t.g.services.UrlFetchApp.fetch = (url, params) => {
        const u = String(url);
        if (u.includes('secretmanager.googleapis.com/')) {
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ payload: { data: Buffer.from(TEST_KEY, 'utf8').toString('base64') } }),
            getHeaders: () => ({}),
          };
        }
        if (u.includes('/decisions')) {
          return {
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify(FX.signal_responses['ED-CLU-CLU-e9dddc0be913-202611071746']),
            getHeaders: () => ({}),
          };
        }
        if (u.includes('/insertAll')) {
          const m = u.match(/\/datasets\/([^/]+)\/tables\/([^/]+)\/insertAll/);
          const dataset = m ? m[1] : '';
          const table = m ? m[2] : '';
          const body = JSON.parse((params && params.payload) || '{}');
          inserts.push({ url: u, dataset, table, rows: body.rows || [] });
          if (failTable && table === failTable) {
            return {
              getResponseCode: () => 503,
              getHeaders: () => ({}),
              getContentText: () => JSON.stringify({ error: { message: 'Backend unavailable' } }),
            };
          }
          return {
            getResponseCode: () => 200,
            getHeaders: () => ({}),
            getContentText: () => JSON.stringify({ kind: 'bigquery#tableDataInsertAllResponse' }),
          };
        }
        if (u.startsWith('https://bigquery.googleapis.com/')) {
          const body = JSON.parse((params && params.payload) || '{}');
          const loc = body.location || 'US';
          const isEws = /-- ews:/.test(body.query || '');
          const rows = isEws && loc === 'us-central1' ? currentPosts : [];
          const cols = isEws ? EWS_COLS : [['url']];
          return {
            getResponseCode: () => 200,
            getHeaders: () => ({}),
            getContentText: () => JSON.stringify({
              jobComplete: true,
              jobReference: { projectId: 'brand-social-central-data', jobId: `j_${loc}_${t.g.clock.now}`, location: loc },
              schema: { fields: cols.map(c => ({ name: c[0], type: c[1] || 'STRING' })) },
              rows: rows.map(r => ({ f: cols.map(c => ({ v: r[c[0]] === undefined || r[c[0]] === null ? null : String(r[c[0]]) })) })),
            }),
          };
        }
        return origFetch(url, params);
      };
      t.g.vertex.earlyDetection = () => ({
        summary: 'Enterprise profiles report Chrome password sync bug.',
        issue_name: 'Chrome password sync bug',
        emerging_narrative: 'Five accounts report Chrome sync failure.',
        early_detection_call: {
          disposition: 'monitor',
          severity: 'medium',
          confidence: 0.88,
          reason: 'Multi-account cluster on Chrome sync',
          build_up_signals: '5 accounts on X',
          watch_for: 'Broader enterprise reports',
        },
        temp_check_draft: { recommended: false, query_suggestion: '', scope_note: '' },
        slrr: {
          is_slrr: false,
          confidence: 0.85,
          exposure_tag: 'Product - Widespread product outage or bug',
          product: 'Chrome',
          other_products: [],
          sensitive_topics: [],
          location: 'US',
        },
        known_issue: { matches: false, confidence: 0.9 },
        tns: { needed: false, reason: '' },
        recommended_groups: [],
        story_title: 'Chrome password sync failure reports',
        story: 'Five accounts reported Chrome password sync issues on [the first post](P1).',
        web_context: 'No external coverage.',
        next_steps: ['Monitor volume.'],
      });
      return { t, inserts, setFailTable: tbl => { failTable = tbl; }, setPosts: p => { currentPosts = p; } };
    }

    // 1. With row 46 OFF (default): zero insertAll requests are made even when rows 19, 38, 39, 40 are ON
    const offEnv = makeBqWriterEnv();
    offEnv.t.control().getRange(19, 2).setValue('ON');
    offEnv.t.control().getRange(38, 2).setValue('ON');
    offEnv.t.control().getRange(39, 2).setValue('ON');
    offEnv.t.control().getRange(40, 2).setValue('ON');
    eq(offEnv.t.control().cell(46, 2), 'OFF');
    offEnv.t.poll();
    eq([offEnv.inserts.length, edCardsOf(offEnv.t).length], [0, 1]);

    // 2. With row 46 ON: writes batched rows to story_snapshots, story_posts, signals, signal_events, and triage_verdicts
    //    with deterministic insertIds, <=1 request per table per phase, zero PII, and never sets BQ_WRITEBACK_EVER_PROP_
    const onEnv = makeBqWriterEnv();
    onEnv.t.control().getRange(19, 2).setValue('ON');
    onEnv.t.control().getRange(38, 2).setValue('ON');
    onEnv.t.control().getRange(39, 2).setValue('ON');
    onEnv.t.control().getRange(40, 2).setValue('ON');
    onEnv.t.control().getRange(46, 2).setValue('ON');
    onEnv.t.poll();

    eq(edCardsOf(onEnv.t).length, 1);
    eq(onEnv.t.g.props.has('BQ_WRITEBACK_EVER_ON'), false, 'early_wave writes never touch slrr.slrr_alerts write-back state');
    const tablesWritten = onEnv.inserts.map(x => `${x.dataset}.${x.table}`);
    for (const tbl of ['early_wave.story_snapshots', 'early_wave.story_posts', 'early_wave.signals', 'early_wave.signal_events', 'early_wave.triage_verdicts']) {
      assert.ok(tablesWritten.includes(tbl), `expected write to ${tbl}, got ${JSON.stringify(tablesWritten)}`);
    }
    // Every insertAll call targets only early_wave.<tableName>, has non-empty deterministic insertIds, and contains zero emails or handles
    for (const call of onEnv.inserts) {
      eq(call.dataset, 'early_wave');
      assert.ok(call.rows.length >= 1, call.table);
      for (const r of call.rows) {
        assert.ok(typeof r.insertId === 'string' && r.insertId.length >= 5, `${call.table} insertId`);
        const jsonStr = JSON.stringify(r.json);
        assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(jsonStr), `${call.table}: email leaked`);
        assert.ok(!/@sec_acct_/.test(jsonStr), `${call.table}: raw @handle leaked`);
        assert.ok(!/utm_source=/.test(jsonStr), `${call.table}: tracking param leaked`);
      }
    }
    // Deterministic insertId check on identical inputs
    const b = onEnv.t.bot;
    const snap1 = b.ewBqSnapshotRow_({ cluster_id: 'clu_1', snapshot_at: '2026-11-14T20:00:00.000Z', author_count: 5 });
    const snap2 = b.ewBqSnapshotRow_({ cluster_id: 'clu_1', snapshot_at: '2026-11-14T20:00:00.000Z', author_count: 5 });
    eq(snap1.insertId, snap2.insertId);
    assert.match(onEnv.t.control().cell(46, 3), /rows written today/);

    // 2b. Every row the writer sent has exactly the columns it declares for that table (EW_BQ_COLUMNS_: what
    //     verifyEarlyWaveBqLive holds against the live tables), in the declared shape: a list where the column is REPEATED,
    //     a value in every REQUIRED column, JSON columns as JSON text, and each representative post its declared struct
    const COLS = b.ev('EW_BQ_COLUMNS_');
    const POST_COLS = Object.keys(b.ev('EW_BQ_POST_COLUMNS_')).sort();
    eq(Object.keys(COLS).sort(), ['signal_events', 'signals', 'story_posts', 'story_snapshots', 'triage_verdicts']);
    for (const call of onEnv.inserts) {
      for (const r of call.rows) {
        eq(Object.keys(r.json).sort(), Object.keys(COLS[call.table]).sort(), `${call.table}: the row's columns`);
        Object.entries(COLS[call.table]).forEach(([name, spec]) => {
          const v = r.json[name];
          if (/\[\]/.test(spec)) assert.ok(Array.isArray(v), `${call.table}.${name} is a list`);
          else assert.ok(!Array.isArray(v), `${call.table}.${name} is one value`);
          if (/!/.test(spec)) assert.ok(v !== null && v !== undefined && v !== '', `${call.table}.${name} is required`);
          if (/^JSON/.test(spec) && v !== null) assert.doesNotThrow(() => JSON.parse(v), `${call.table}.${name} is JSON text`);
          if (/^TIMESTAMP/.test(spec) && v !== null) assert.match(String(v), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, `${call.table}.${name}`);
        });
        if (call.table === 'signals') r.json.representative_posts.forEach(post => eq(Object.keys(post).sort(), POST_COLS));
      }
    }
    // The schema check that verifyEarlyWaveBqLive runs on each live table: a table with exactly the declared columns fits;
    // a missing column, another type or mode, and a REQUIRED column the rows never fill are each named
    const asFields = cols => Object.entries(cols).map(([name, spec]) => ({
      name, type: spec.replace(/[!\[\]]/g, ''), mode: /\[\]/.test(spec) ? 'REPEATED' : /!/.test(spec) ? 'REQUIRED' : 'NULLABLE',
    }));
    const liveFields = table => asFields(COLS[table]).map(f => (f.name === 'representative_posts' ? Object.assign(f, { fields: asFields(b.ev('EW_BQ_POST_COLUMNS_')) }) : f));
    Object.keys(COLS).forEach(table => eq(b.ewBqSchemaProblems_(table, liveFields(table)), [], table));
    // the standard SQL names BigQuery's console shows for the same types fit too
    eq(b.ewBqSchemaProblems_('signal_events', liveFields('signal_events').concat([{ name: 'note', type: 'STRING', mode: 'NULLABLE' }])), []);
    eq(b.ewBqSchemaProblems_('story_posts', liveFields('story_posts').map(f => Object.assign({}, f,
      { type: { INTEGER: 'INT64', FLOAT: 'FLOAT64', BOOLEAN: 'BOOL' }[f.type] || f.type }))), []);
    eq(b.ewBqSchemaProblems_('signal_events', liveFields('signal_events').filter(f => f.name !== 'reason')
      .map(f => (f.name === 'detail' ? Object.assign({}, f, { type: 'STRING' }) : f.name === 'cluster_id' ? Object.assign({}, f, { mode: 'REPEATED' }) : f))
      .concat([{ name: 'run_id', type: 'STRING', mode: 'REQUIRED' }])),
    ['cluster_id: the table\'s column is a list, the row\'s is one value', 'reason: the table has no such column',
      'detail: the table\'s type is STRING, the row\'s is JSON', 'run_id: the table requires it and the row never writes it']);
    eq(b.ewBqSchemaProblems_('signals', liveFields('signals').map(f => (f.name === 'representative_posts'
      ? Object.assign({}, f, { fields: f.fields.filter(x => x.name !== 'snippet') }) : f))), ['representative_posts.snippet: the table has no such column']);
    eq(Object.keys(b.ev('EW_BQ_ACTIONS_')), ['ranked', 'kept', 'held_back', 'emitted', 'not_emitted']);

    // 2c. One signals row a signal: the signal that was created, queued and carded in the first check is read again from the
    //     producer's buffer at a later check (its "seen" mark gone) and held back there as a repeat of its card; its
    //     signal_events row is written, and no second signals row
    const sigIds = () => onEnv.inserts.filter(x => x.table === 'signals').flatMap(x => x.rows.map(r => r.json.alert_id));
    const firstSigIds = sigIds();
    eq(firstSigIds.length, 1);
    onEnv.t.g.props.delete('EARLY_DETECTION_SEEN');
    onEnv.setPosts([]);
    onEnv.t.g.clock.now += 16 * 60 * 1000;
    const before2c = onEnv.inserts.length;
    onEnv.t.poll();
    const later = onEnv.inserts.slice(before2c);
    const laterEvents = later.filter(x => x.table === 'signal_events').flatMap(x => x.rows.map(r => [r.json.alert_id, r.json.event]));
    eq(laterEvents, [[firstSigIds[0], 'held_repeat']]);
    eq(sigIds(), firstSigIds, 'no second signals row for a signal held in a later check');
    eq(later.filter(x => x.table === 'signals').length, 0);

    // 3. Fail-open on BigQuery error: logs table, reason, and dropped row count, pauses that table for 15m (C46 names it), and
    //    cards still post. Only the table that failed is paused: the other four are written in the same check and after it
    const failEnv = makeBqWriterEnv();
    failEnv.setFailTable('signals');
    failEnv.t.control().getRange(19, 2).setValue('ON');
    failEnv.t.control().getRange(46, 2).setValue('ON');
    failEnv.t.poll();
    eq(edCardsOf(failEnv.t).length, 1, 'card still posted when early_wave BigQuery write fails');
    assert.match(failEnv.t.g.logs.join('\n'), /early wave BigQuery: couldn't write \d+ row\(s\) to early_wave\.signals \(dropped\): .*HTTP 503.*; writes to signals paused for 15 minutes/);
    assert.match(failEnv.t.control().cell(46, 3), /rows? written today · \d+ dropped · ⚠️ signals paused until .* \(.*HTTP 503/);
    eq(failEnv.inserts.map(x => x.table).sort(), ['signal_events', 'signals', 'story_posts', 'story_snapshots']);  // no Decisions call here: no verdicts
    const fb = failEnv.t.bot;
    const fProps = failEnv.t.g.services.PropertiesService.getScriptProperties();
    const fCtx = { now: () => failEnv.t.g.clock.now, log() {} };
    const fState = () => fb.ewBqState_(fProps, failEnv.t.g.clock.now);
    eq(Object.keys(fState().pauses), ['signals']);
    const oneRow = [{ insertId: 'ew:test:1', json: { alert_id: 'ED-TEST-1' } }];
    failEnv.setFailTable('');  // BigQuery is well again, but signals stays paused for its 15 minutes
    const sent = failEnv.inserts.length;
    eq([fb.ewBqWriteTable_(fCtx, fProps, () => 60000, 'signals', oneRow), failEnv.inserts.length - sent], [false, 0]);
    eq([fb.ewBqWriteTable_(fCtx, fProps, () => 60000, 'story_posts', oneRow), failEnv.inserts.length - sent], [true, 1]);
    failEnv.t.g.clock.now += 16 * 60 * 1000;
    eq([fb.ewBqWriteTable_(fCtx, fProps, () => 60000, 'signals', oneRow), Object.keys(fState().pauses)], [true, []]);
    // a pause an earlier build kept for every table at once is the pause of the table it names
    fProps.setProperty('EW_BQ_STATE', JSON.stringify({ day: fb.dayKey_(), written: 3, dropped: 2, until: failEnv.t.g.clock.now + 60000, why: 'HTTP 503', table: 'story_posts' }));
    eq(fState(), { day: fb.dayKey_(), written: 3, dropped: 2, pauses: { story_posts: { until: failEnv.t.g.clock.now + 60000, why: 'HTTP 503' } } });
    // more rows than one request takes: the rest are counted as dropped and logged, never lost silently
    fProps.deleteProperty('EW_BQ_STATE');
    const many = Array.from({ length: 503 }, (_, i) => ({ insertId: `ew:test:${i}`, json: { alert_id: `ED-TEST-${i}` } }));
    const fLogs = [];
    eq(fb.ewBqWriteTable_(Object.assign({}, fCtx, { log: m => fLogs.push(m) }), fProps, () => 60000, 'signal_events', many), true);
    eq([failEnv.inserts[failEnv.inserts.length - 1].rows.length, fState().written, fState().dropped], [500, 500, 3]);
    assert.match(fLogs.join('\n'), /dropped 3 row\(s\) for early_wave\.signal_events \(more than 500 in one check\)/);

    // 4. Section 5E rule preserved: edDecide_ and its three 0.8 confidence bars + 0.92 evergreen override are completely unchanged & ignore row.dec
    const sigCard = FX.signals.find(s => s.alert_id === 'ED-CLU-CLU-e9dddc0be913-202611071746');
    eq([b.ev('ED_ESCALATE_MIN_CONFIDENCE_'), b.ev('ED_SLRR_TAG_MIN_CONFIDENCE_'), b.ev('ED_KNOWN_MIN_CONFIDENCE_')], [0.8, 0.8, 0.8]);
    const fakeDecCtxOff = { now: () => NOW, settings: { react: false }, switches: { fastTriage: false, fastTriageRank: false, fastTriageHold: false } };
    const fakeDecCtxOn = { now: () => NOW, settings: { react: false }, switches: { fastTriage: true, fastTriageRank: true, fastTriageHold: true } };
    const baseParsed = {
      ed: b.edFromRow_(sigCard),
      post: { url: sigCard.primary_url, lang: 'en', text: sigCard.headline },
      bq: { is_evergreen_noise: true, evergreen_topic_label: 'Routine feature requests' },
    };
    const parsedWithNoisyDec = {
      ed: b.edFromRow_(Object.assign({}, sigCard, { dec: { g: 0.01, r: 0.01, i: 0.01, n: 0.99, s: 0.05, l: 0, sc: 0.99 } })),
      post: baseParsed.post,
      bq: baseParsed.bq,
    };
    const rev91 = { disposition: 'escalate', confidence: 0.91, severity: 'high', reason: 'Below 0.92 evergreen override', slrr: { is: false, confidence: 0.5, topics: [], others: [] } };
    const rev92 = { disposition: 'escalate', confidence: 0.92, severity: 'high', reason: 'Meets 0.92 evergreen override', slrr: { is: true, priority: 'P1', confidence: 0.9, tag: 'Product - Privacy & security concerns', product: 'Android', topics: [], others: [] } };
    eq([b.edDecide_(fakeDecCtxOff, baseParsed, rev91, {}, [], NOW).disposition, b.edDecide_(fakeDecCtxOn, parsedWithNoisyDec, rev91, {}, [], NOW).disposition], ['dismiss', 'dismiss']);
    eq([b.edDecide_(fakeDecCtxOff, baseParsed, rev92, { fields: {} }, [], NOW).disposition, b.edDecide_(fakeDecCtxOn, parsedWithNoisyDec, rev92, { fields: {} }, [], NOW).disposition], ['escalate', 'escalate']);

    // 5. Section 6.4 guard: fails if ftHoldReady_, ewsWatchReady_, or Fast triage tab exist anywhere in .gs files,
    //    or if FastTriage.gs, Decisions.gs, or the Control text for rows 38-46 describe a retired, record-only, observe-only, or dry-run mode
    const dir = path.join(__dirname, '..');
    const gsFiles = fs.readdirSync(dir).filter(f => f.endsWith('.gs'));
    for (const file of gsFiles) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.ok(!/\b(?:ftHoldReady_|ewsWatchReady_|ftTabAppend_|ftTabRow_|ftTab_|isFtTab_|FT_TAB_)\b/.test(src), `${file} still references removed symbol`);
    }
    const modeRx = /\b(?:s[h]adow|record-only|recording only|observe-only|dry-run)\b/i;
    for (const file of ['FastTriage.gs', 'Decisions.gs']) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      assert.ok(!modeRx.test(src), `${file} describes record-only mode`);
    }
    const sw38to46 = b.ev('CONTROL_SWITCHES_').filter(s => s.row >= 38);
    for (const s of sw38to46) {
      const texts = [s.label, b.switchOffText_(s), typeof s.on === 'function' ? s.on() : s.on, s.help].join(' ');
      assert.ok(!modeRx.test(texts) && !/bars are not set/i.test(texts), `row ${s.row} Control text describes record-only mode: ${texts}`);
    }
  });

  // =============================================================================================================
  // Section 6 — Live check in LiveVerify.gs (verifyFastTriageLive)
  // =============================================================================================================

  test('live check: verifyEarlyWaveBqLive reads the five early_wave tables\' schemas (reads only: no row written, no sheet cell, no Chat post), says ready only when the writer\'s rows fit every table, names each column that would be refused, and says which action values the triage_verdicts description leaves out', () => {
    const t = e2e();
    t.bot.setup();
    const COLS = t.bot.ev('EW_BQ_COLUMNS_');
    const asFields = cols => Object.entries(cols).map(([name, spec]) => ({
      name, type: spec.replace(/[!\[\]]/g, ''), mode: /\[\]/.test(spec) ? 'REPEATED' : /!/.test(spec) ? 'REQUIRED' : 'NULLABLE',
    }));
    const live = {};
    Object.keys(COLS).forEach(table => { live[table] = { description: '', fields: asFields(COLS[table]) }; });
    live.signals.fields.find(f => f.name === 'representative_posts').fields = asFields(t.bot.ev('EW_BQ_POST_COLUMNS_'));
    live.triage_verdicts.description = 'subject_type: signal or watch_story. action: ranked, kept, held_back, emitted, not_emitted. raw holds the full response.';
    const calls = [];
    const orig = t.g.services.UrlFetchApp.fetch;
    t.g.services.UrlFetchApp.fetch = (url, params) => {
      const u = String(url);
      if (!u.startsWith('https://bigquery.googleapis.com/')) return orig(url, params);
      const m = u.match(/\/projects\/brand-social-central-data\/datasets\/early_wave\/tables\/([a-z_]+)$/);
      calls.push({ table: m ? m[1] : u, method: String((params && params.method) || 'get').toLowerCase(), body: !!(params && params.payload) });
      const tbl = m && live[m[1]];
      if (!tbl) return { getResponseCode: () => 404, getHeaders: () => ({}), getContentText: () => JSON.stringify({ error: { message: 'Not found: Table' } }) };
      return { getResponseCode: () => 200, getHeaders: () => ({}), getContentText: () => JSON.stringify({ description: tbl.description, schema: { fields: tbl.fields } }) };
    };
    const cells = JSON.stringify(t.control().rows);
    const posts = t.chat.botPosts ? JSON.stringify(Array.from(t.chat.spaces.keys()).map(id => t.chat.botPosts(id).length)) : '';

    // 1. Every table as the writer declares it: ready, nothing to fix, every action value described
    const ok = t.bot.verifyEarlyWaveBqLive();
    eq([ok.dataset, ok.ready, ok.tables.map(x => x.table), ok.tables.map(x => x.read), ok.tables.map(x => x.problems)],
      ['brand-social-central-data.early_wave', true, ['story_snapshots', 'story_posts', 'signals', 'signal_events', 'triage_verdicts'],
        [true, true, true, true, true], [[], [], [], [], []]]);
    eq(ok.tables.find(x => x.table === 'triage_verdicts').action_values_not_described, []);
    eq(calls, ['story_snapshots', 'story_posts', 'signals', 'signal_events', 'triage_verdicts'].map(table => ({ table, method: 'get', body: false })));

    // 2. A table whose columns differ (the table the notes never quoted, story_snapshots, under other names), one that can't be
    //    read, a nullable column the writer leaves empty (fine), and a description from before the action values changed
    live.story_snapshots.fields = live.story_snapshots.fields.map(f => (f.name === 'distinct_accounts' ? Object.assign({}, f, { name: 'authors' })
      : f.name === 'created_at' ? Object.assign({}, f, { name: 'first_seen_at', mode: 'REQUIRED' }) : f));
    live.story_posts.fields.push({ name: 'followers', type: 'INTEGER', mode: 'NULLABLE' });
    delete live.signal_events;
    live.triage_verdicts.description = 'subject_type: signal or watch_story. action: ranked, held_back, emitted. raw holds the full response.';
    const bad = t.bot.verifyEarlyWaveBqLive();
    const by = name => bad.tables.find(x => x.table === name);
    eq([bad.ready, by('story_snapshots').problems, by('story_posts').problems, by('story_posts').not_written, by('signal_events').read,
      by('signals').problems, by('triage_verdicts').problems, by('triage_verdicts').action_values_not_described],
    [false, ['created_at: the table has no such column', 'distinct_accounts: the table has no such column',
      'first_seen_at: the table requires it and the row never writes it'], [], ['followers'], false, [], [], ['kept', 'not_emitted']]);
    assert.match(by('signal_events').why, /^HTTP 404: /);
    // the action column's own description counts as well as the table's
    live.triage_verdicts.fields.find(f => f.name === 'action').description = 'ranked, kept, held_back, emitted, not_emitted; null when the call failed';
    eq(t.bot.verifyEarlyWaveBqLive().tables.find(x => x.table === 'triage_verdicts').action_values_not_described, []);

    // Reads only: every request a GET with no body, no cell changed, nothing posted, no writer state
    eq([calls.every(c => c.method === 'get' && !c.body), JSON.stringify(t.control().rows) === cells, t.g.props.has('EW_BQ_STATE')], [true, true, false]);
    if (posts) eq(JSON.stringify(Array.from(t.chat.spaces.keys()).map(id => t.chat.botPosts(id).length)), posts);
  });

  test('live check (6): verifyFastTriageLive reads buffer + queue up to LIVE_VERIFY_FT_MAX_ (5), logs LIVE_VERIFY_FAST_TRIAGE, and writes zero Sheet cells or Chat posts', () => {
    // 1. Empty buffer and empty queue: asks 0 signals, makes 0 Secret Manager or Decisions API calls, logs summary cleanly
    let decCalls = 0;
    const emptyLogs = [];
    const emptyEnv = makeEnv(() => {
      decCalls++;
      return { code: 200, body: FX.probe.six_questions_doc_input.response.body };
    });
    emptyEnv.bot.console.log = m => emptyLogs.push(String(m));
    const emptySummary = emptyEnv.bot.verifyFastTriageLive();
    eq([emptySummary.signals, emptySummary.answered, emptySummary.latency_ms, decCalls, emptyEnv.secretCalls()],
      [{ in_buffer: 0, in_queue: 0, asked: 0 }, 0, null, 0, 0]);
    eq(emptyLogs.length, 1);
    assert.ok(emptyLogs[0].startsWith('LIVE_VERIFY_FAST_TRIAGE '), emptyLogs[0]);

    // 2. Real archive signals across producer 3-hour buffer + review queue (with 1 shared alert_id deduped, capped at LIVE_VERIFY_FT_MAX_ = 5)
    const liveEnv = makeFastTriageE2e(() => [], (payload, _u, _p) => {
      liveEnv.t.g.clock.now += 280;
      return matchRecordedResponse(liveEnv.t.bot, payload);
    });
    const { t } = liveEnv;
    const consoleLogs = [];
    t.bot.console = Object.assign({}, t.bot.console || console, { log: m => consoleLogs.push(String(m)) });

    // Seed 4 real archive signals into producer buffer and 3 into ED_ALERT_QUEUE (1 overlapping -> 6 unique -> capped at 5)
    const bufSignals = SIGNAL_IDS_WITH_ANSWERS.slice(0, 4).map(id => Object.assign({}, FX.signals.find(s => s.alert_id === id), {
      _at: t.g.clock.now - 10 * 60 * 1000,
    }));
    t.bot.ewsCachePut_(t.bot.ewsCache_(), { buf: bufSignals });

    const props = t.g.services.PropertiesService.getScriptProperties();
    const qSignals = [
      FX.signals.find(s => s.alert_id === SIGNAL_IDS_WITH_ANSWERS[3]), // duplicate of bufSignals[3] -> deduped!
      FX.signals.find(s => s.alert_id === SIGNAL_IDS_WITH_ANSWERS[4]), // 5th unique signal -> included!
      FX.signals.find(s => s.alert_id === SIGNAL_IDS_WITH_ANSWERS[5]), // 6th unique signal -> past LIVE_VERIFY_FT_MAX_ (5)
    ];
    qSignals.forEach((r, idx) => t.bot.edQueuePut_(props, r, t.g.clock.now + idx * 1000));

    const controlBefore = JSON.stringify(t.control().rows);
    const tabsBefore = t.sheet().sheets.map(s => s.name).slice();

    const summary = t.bot.verifyFastTriageLive();
    eq([summary.endpoint, summary.model], ['https://generativelanguage.googleapis.com/v1beta/decisions', 'gemini-decision-1']);
    eq(summary.signals, { in_buffer: 4, in_queue: 3, asked: 5 });
    eq([summary.answered, summary.not_answered, liveEnv.decCalls(), liveEnv.secretCalls()], [5, [], 5, 1]);
    eq(summary.results.map(r => r.alert_id), SIGNAL_IDS_WITH_ANSWERS.slice(0, 4).concat([SIGNAL_IDS_WITH_ANSWERS[5]]));
    eq(summary.latency_ms, { min: 280, median: 280, max: 280 });
    eq(summary.bars, { about: 0.10, noise: 0.90, conf: 0.55, watch: 0.80, accounts: 3, independent: 0.30 });
    summary.results.forEach(r => {
      eq([r.ok, r.hold_back, typeof r.raise_early], [true, 'no', 'boolean']);
      assert.ok(r.input_chars > 100 && typeof r.answers.s === 'number');
    });

    // Zero writes to Control tab, zero new tabs created (no Fast triage tab!), zero Chat posts, queue untouched
    eq(JSON.stringify(t.control().rows), controlBefore);
    eq(t.sheet().sheets.map(s => s.name), tabsBefore);
    eq(edCardsOf(t).length, 0);
    eq(t.bot.edQueueList_(props).length, 3);
    assert.ok(consoleLogs.some(l => l.startsWith('LIVE_VERIFY_FAST_TRIAGE ')));
  });
};


