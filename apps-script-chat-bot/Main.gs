/**
 * Main.gs — installing the bot, and the every-minute run.
 *
 * Day to day, the bot is managed from the Control tab of its Google Sheet: Bot ON/OFF, the two spaces, which space is
 * S-F Burson (B25), and a status the bot keeps up to date. Nobody needs this editor after setup. The functions here are
 * for whoever installs it:
 *
 *   setup()         Run once. Creates the sheet (pre-filled for testing), starts the every-minute run, posts a
 *                   one-line "set up" note in the analyst space, reads the Resources tab's documents (the knowledge
 *                   base), and logs the sheet's link. Safe to run again to repair the install: nothing is sent twice.
 *   status()        Prints what the bot is doing (the Control tab plus details of the last run).
 *   listMySpaces()  The spaces this account is in, with links to paste into the Control tab.
 *   tryAlert()      Shows what the bot would say about TRY_ALERT_TEXT (below), without posting anything.
 *   refreshKnowledge()  Reads every document on the Resources tab now (Knowledge.gs). The first time, it asks for the
 *                   Drive permission. The bot keeps them current by itself after that.
 *   refreshResults()  Rebuilds the Results tab now: what the bot did vs the IMs (Speed.gs; refreshSpeed() is its alias).
 *                   With Learn from IM calls ON (Control tab row 17), the Learned precedents tab too; each run's reviews
 *                   read it (buildCtx_'s ctx.learned) only while that switch is ON.
 *   refreshAnalysis() Rebuilds the Analysis tab now: side-by-side chatbot vs. Google analyst responses (Chat & IM calls),
 *                   the bot's triage logic, and Knowledge Base snippets (Analysis.gs; runBotAnalysis() is its alias).
 *   startAutoCorrect()  Turns on the second test space on row 10 (AutoCorrect.gs).
 *   stopAutoCorrect()   Turns off the second test space on row 10 (AutoCorrect.gs).
 *   setupTnsTestForm()  While testing: makes (or finds) the test copy of the T&S form in your Drive and logs its link
 *                   (TnsForm.gs). The bot also makes it by itself the first time a T&S note needs it.
 *   poll()          The every-minute run, started by setup(). With Direct BigQuery alerts ON (Control row 15) it first
 *                   posts new Sprinklr, DSD / Brandwatch and Sonar posts from BigQuery in the test feed or Mirror space (BigQuery.gs
 *                   pollBigQuerySources_), so the run reviews them like Burson's; a failure there never stops the run.
 *                   With Early detection ON (Control row 19), after the alerts and at most every 15 minutes, it takes the
 *                   new signals of the bot's own early-wave producer (BigQuery.gs earlyWaveCheck_; EarlyWaveSource.gs
 *                   reads the new low-tier posts in the approved BigQuery source tables and builds the story clusters
 *                   and velocity spikes itself), queues them, and reviews and posts each as a card for full triage
 *                   (EarlyDetection.gs edDrainQueue_); a failure there never stops the run. Direct BigQuery alerts
 *                   look back only the BigQuery lookback (Control tab B31: 15 to 60 minutes); the early-wave check takes
 *                   the signals made since its last check (at least that lookback, at most 3 hours). With Proactive watch ON
 *                   (Control row 34), after the other spaces it looks (every 5 minutes at most) at what is new in each
 *                   of its sources (Sonar, Brandwatch, Sprinklr, Tubular, the DSD story selection feed, the Other alerts
 *                   space's alerts and the Brandwatch query "2026 Election Alerts" from Brandwatch's API), with the
 *                   watches ON on the Watches tab (ProactiveWatch.gs runProactiveWatch_): it records what it flags
 *                   on the Watch detections tab and posts only where Watch alerts (Control row 35) says.
 */

const TRIGGER_HANDLER_ = 'poll';
// the archived prototype's triggers (checkSourceSpaceForNewMessages: an orphan that fails every minute)
const LEGACY_HANDLERS_ = ['pollAlerts', 'sweepReactions', 'checkSourceSpaceForNewMessages'];
// Triggers left behind by code that is no longer in this project: their function is gone, so each run of them only
// fails ("Script function not found"). poll() deletes them (sweepOrphanTriggers_), and so does setup(). List a handler
// here when its code is removed; none is listed now (the last one was deleted from the live project on Nov 6, 2026).
const ORPHAN_HANDLERS_ = [];
const ORPHAN_SWEEP_SEC_ = 6 * 3600;                         // poll() looks for them at most this often
const RUN_BUDGET_MS_ = 180 * 1000;                          // Apps Script stops a run at 6 minutes
const SETUP_LOCK_WAIT_MS_ = 5 * 60 * 1000;                  // setup() waits this long for a run in progress (3-7 min)
const FAIL_NOTICE_AT_ = 5;                                  // failed runs in a row before analysts are told
const CHAT_SPACE_URL_ = 'https://mail.google.com/chat/u/0/#chat/space/';

// ---------------------------------------------------------------------------------------------------------------
// Things you run
// ---------------------------------------------------------------------------------------------------------------

function setup() {
  if (webViewerCall_()) throw new Error('Not available from the dashboard');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(SETUP_LOCK_WAIT_MS_)) {  // a run is still going after 5 minutes: nothing is changed
    throw new Error('A run is in progress, try again in a few minutes (setup() didn\'t change anything).');
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const email = Session.getEffectiveUser().getEmail();
    const ss = openStore_(true);
    if (typeof syncBrandSafetyGroups_ === 'function') syncBrandSafetyGroups_(ss, { force: true });
    const control = ensureControlTab_(ss, email);
    ensureResourcesTab_(ss);
    ensureGuidanceTab_(ss);
    sheetBackend_(ss);  // creates the log tabs
    removeTriggers_(LEGACY_HANDLERS_.concat(ORPHAN_HANDLERS_, [TRIGGER_HANDLER_]));
    const cleared = deletePrototypeState_();
    ScriptApp.newTrigger(TRIGGER_HANDLER_).timeBased().everyMinutes(1).create();

    let gemini = 'working';
    try {
      geminiGenerate_('Reply with {"ok": true}.', 'ping', { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] });
    } catch (e) {
      gemini = 'NOT WORKING, so alerts get the rule checks only: ' + e.message;
    }

    let knowledge;  // the Resources tab's documents (Knowledge.gs)
    try {
      knowledge = knowledgeSummaryText_(refreshKnowledge_(ss, { force: true, deadline: Date.now() + KNOWLEDGE_FULL_MS_ }));
    } catch (e) {
      knowledge = 'NOT READ, so reviews go without the Resources tab\'s documents: ' + e.message;
    }

    let spaces;
    try {
      const wanted = readControl_(control);
      const sfb = sfBursonFor_(control, wanted, true);  // B25 (blank on a new tab): C25 says what the bot found
      // Work directly in B25 (Control row 32, ON with B25 Google-only): the bot works right in B25 (directCfg_)
      const direct = directB25For_(wanted.switches, sfb);
      if (direct.space) setSfBurson_(null);  // not the real S-F Burson: Chat.gs lets the hello through
      const cfg = direct.space ? directCfg_(direct.space) : resolveSetup_(wanted, true, sfb.space);
      const hello = chatPostMessage_(cfg.analyst.id,
        `The Burson QA bot is set up. Every alert posted in ${cfg.burson.name} comes here, already checked.\n` +
        `- Control tab: ${typeof chatLink_ === 'function' ? chatLink_(ss.getUrl(), 'Control Sheet') : ss.getUrl()}`,
        { key: `setup:${cfg.burson.id}>${cfg.analyst.id}` });
      const me = hello.senderName || chatMyUserId_(cfg.burson.id, email);
      if (me) props.setProperty('BOT_USER', me);
      if (!direct.space) rememberAnalystSpace_(cfg);
      writeControlStatus_(control, { bursonNote: direct.space ? DIRECT_B25_B3_NOTE_ : '✓ ' + cfg.burson.name,
        analystNote: direct.space ? '' : '✓ ' + cfg.analyst.name,
        status: wanted.on ? okStatusText_() : pausedStatusText_(), lastCheck: nowLabel_(), today: todayText_(readStats_(), dayKey_(), wanted.switches.noWait) });
      spaces = direct.space ? `${cfg.burson.name} (B25, worked directly: row 32)` : `${cfg.burson.name} → ${cfg.analyst.name}`;
    } catch (e) {
      writeControlStatus_(control, Object.assign({}, e && e.notes, { status: problemStatusText_(e), lastCheck: nowLabel_(), today: '' }));
      spaces = 'PROBLEM (also shown on the Control tab): ' + e.message;
    }
    const summary = {
      control_sheet: ss.getUrl(),
      spaces,
      gemini,
      knowledge,
      runs_as: email,
      old_prototype_entries_cleared: cleared,
      next: 'Open the control sheet and share it (as Editor) with the people who manage the bot. Then paste an alert ' +
        'into the Burson space to try it. Everything else is done from the Control tab.',
    };
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    lock.releaseLock();
  }
}

function status() {
  if (webViewerCall_()) throw new Error('Not available from the dashboard');
  const props = PropertiesService.getScriptProperties();
  const info = {};
  try {
    const ss = openStore_(false);
    info.control_sheet = ss.getUrl();
    const control = controlTab_(ss);
    const wanted = readControl_(control);
    info.bot = wanted.on ? 'ON' : 'OFF';
    const sfb = sfBursonFor_(null, wanted, true);  // B25, read only (C25 is left to the runs)
    info.sf_burson_space = sfb.space ? `${sfb.space.name} (${sfb.space.id})`
      : sfb.blank ? 'not set: the Control tab\'s B25 is blank' : `not found: ${sfb.error}`;
    const rtc = testCopyFor_(null, wanted, sfb, true);  // B26, read only (C26 is left to the runs)
    info.burson_test_copy = rtc.space ? `${rtc.space.name} (${rtc.space.id})`
      : rtc.blank ? 'not set: the Control tab\'s B26 is blank (the Relay works with S-F Burson itself)' : `not used: ${rtc.error}`;
    // Work directly in B25 (Control row 32): ON with B25 Google-only, the bot works right in B25 (directCfg_)
    const direct = directB25For_(wanted.switches, sfb);
    info.work_directly_in_b25 = direct.state;
    const acOnly = !direct.space && !String(wanted.mirror || '').trim() && !!String(wanted.autocorrect || '').trim() &&
      (!String(wanted.burson || '').trim() || !String(wanted.analyst || '').trim());
    if (acOnly) {
      info.burson_space = 'not used (working in Auto-correct space, B10)';
      info.analyst_space = 'not used (working in Auto-correct space, B10)';
      info.read_up_to = 'via Auto-correct space (B10)';
    } else {
      const cfg = direct.space ? directCfg_(direct.space) : resolveSetup_(wanted, true, sfb.space);
      info.burson_space = `${cfg.burson.name} (${cfg.burson.id})`;
      info.analyst_space = direct.space ? `${cfg.analyst.name} (the same space: row 32)` : `${cfg.analyst.name} (${cfg.analyst.id})`;
      const cursor = Number(props.getProperty('CURSOR:' + cfg.burson.id)) || null;
      info.read_up_to = cursor ? new Date(cursor).toISOString() : 'not started';
    }
    info.mirror_space = wanted.mirror || (typeof MIRROR_TARGET_SPACE !== 'undefined' ? MIRROR_TARGET_SPACE : '') || 'off';
    info.autocorrect_space = wanted.autocorrect || 'off';
    info.other_alerts_space = wanted.otherSpace || 'off';
    const waChoice = pwAlertsChoice_(wanted.watchAlerts);
    info.proactive_watch = !wanted.switches.proactiveWatch ? 'OFF'
      : waChoice ? `ON (its flags go out as watch alerts: ${pwAlertsWhere_(waChoice)})` : 'ON (Watch alerts, row 35, is OFF: nothing is posted)';
    info.watch_alerts = waChoice ? pwAlertsWhere_(waChoice) : 'OFF';
    info.bigquery_lookback = `${bqLookbackFrom_(wanted.bqLookback).minutes} minutes (Control tab B31)`;
    if (control) {
      info.mirror_status = String(control.getRange(MIRROR_ROW_, 3).getDisplayValue() || '').trim();
      info.autocorrect_status = String(control.getRange(AC_ROW_, 3).getDisplayValue() || '').trim();
      info.other_alerts_status = String(control.getRange(OS_ROW_, 3).getDisplayValue() || '').trim();
      const pw = switchRows_()[CONTROL_SWITCHES_.findIndex(s => s.key === 'proactiveWatch')];
      info.proactive_watch_status = String(control.getRange(pw, 3).getDisplayValue() || '').trim();
      info.watch_alerts_status = String(control.getRange(PW_ALERTS_ROW_, 3).getDisplayValue() || '').trim();
    }
    info.knowledge_documents = readResourceRows_(ss).filter(r => r.name || r.url)
      .map(r => `${r.name || r.url}: ${r.status || '(not read yet)'}`);
  } catch (e) {
    info.problem = e.message;
  }
  info.running = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === TRIGGER_HANDLER_);
  info.failed_runs_in_a_row = Number(props.getProperty('FAIL_STREAK') || 0);
  info.custom_message_ids = clientIdsOff_() ? 'off for a day (Chat refused them; request ids still prevent duplicates)' : 'on';
  try { info.last_run = JSON.parse(props.getProperty('LAST_RUN') || 'null'); } catch (e) { info.last_run = null; }
  try { info.autocorrect_today = JSON.parse(props.getProperty(AC_STATS_PROP_) || 'null'); } catch (e) { info.autocorrect_today = null; }
  try { info.other_alerts_today = JSON.parse(props.getProperty(OS_STATS_PROP_) || 'null'); } catch (e) { info.other_alerts_today = null; }
  try { info.proactive_watch_today = JSON.parse(props.getProperty(PW_DAY_PROP_) || 'null'); } catch (e) { info.proactive_watch_today = null; }
  try {
    const pwAll = pwSourceStats_(props);
    const pwFails = pwLaneFails_(pwLast_(props));  // a look failing as a whole: its sources say so, as on their tab
    info.proactive_watch_sources = pwSources_().map(s => `${s.name}: ${pwSourceStatus_(s, pwAll[s.key], Date.now(), pwFails[s.lane]).text}`);
  } catch (e) { info.proactive_watch_sources = null; }
  try {
    info.knowledge = knowledgeSummaryText_(JSON.parse(props.getProperty(KNOWLEDGE_STATE_PROP_) || 'null'));
  } catch (e) {
    info.knowledge = null;
  }
  console.log(JSON.stringify(info, null, 2));
  return info;
}

function listMySpaces() {
  if (webViewerCall_()) throw new Error('Not available from the dashboard');
  const lines = chatListSpaces_().filter(s => s.spaceType === 'SPACE')
    .map(s => `${s.displayName || '(no name)'}  →  ${CHAT_SPACE_URL_}${String(s.name).replace(/^spaces\//, '')}` +
      (s.externalUserAllowed ? '   (allows people outside Google)' : ''))
    .sort((a, b) => a.localeCompare(b));
  console.log(lines.join('\n'));
  return lines;
}

/** Edit this to any alert text, then run tryAlert(). */
const TRY_ALERT_TEXT = [
  'THIS ALERT MEETS P2 CRITERIA',
  '',
  '🟨SOCIAL ALERT🟨: Gems | Criticism against AI Overviews | Instagram | 29425 Engagements',
  '[Name]: Criticism against AI Overviews / Ongoing Issue',
  '[Engagement]: LOW (29425 engagements)',
  '[Product]: Gems',
  '[Social Network]: Instagram',
  '[Exposure Tag]: Product - Perceived bias',
  '[Sensitive Topic]: -',
  '[KOF]: No',
  '',
  'X user edervolcelazz (195 followers) shared a post featuring an AI Overview with an offensive reply.',
  '',
  '[Link]: https://x.com/edervolcelazz/status/2109566527900926417',
  '',
  '[Time/Date Post Went Live]: October 12, 2026, 1:47 AM',
  '',
  '[Code]: Product - Perceived bias,29425,edervolcelazz,-,Gems,Ongoing Issue',
].join('\n');

function tryAlert() {
  if (webViewerCall_()) throw new Error('Not available from the dashboard');
  const parsed = parseAlert_(TRY_ALERT_TEXT);
  if (!detectAlert_(TRY_ALERT_TEXT, parsed, '')) {
    console.log('This text doesn\'t look like a Zapier alert (too few "[Label]: value" lines).');
    return;
  }
  let knowledgeNote = 'none (the Resources tab\'s documents haven\'t been read: run refreshKnowledge())';
  try {  // the knowledge base, as a review gets it (Knowledge.gs)
    parsed.knowledge = knowledgeForCtx_({ knowledge: loadKnowledge_(openStore_(false)), deadline: Date.now() + 60 * 1000,
      log: t => console.log(t) }, knowledgeQuery_(parsed), { budget: KNOWLEDGE_REVIEW_CHARS_, pin: true });
    if (parsed.knowledge.docs.length) knowledgeNote = knowledgeBrief_(parsed.knowledge);
  } catch (e) {
    knowledgeNote = 'unavailable (' + e.message + ')';
  }
  let llm = null;
  let llmError = null;
  try { llm = geminiClient_().assess(parsed); } catch (e) { llmError = e.message; }
  let control = null;  // Never wait on Burson (Control row 23): previewed as the bot would do it now (OFF without a tab)
  try {
    const ss = openStore_(false);
    if (typeof syncBrandSafetyGroups_ === 'function') syncBrandSafetyGroups_(ss);
    control = controlTab_(ss);
  } catch (e) { control = null; }
  const noWait = switchOn_({ switches: readSwitches_(control) }, 'noWait');
  if (noWait) parsed.noWait = true;  // a long video's missing timestamp is the bot's own fix (Review.gs rule 12)
  const review = reviewAlert_(parsed, { llm, llmError, settings: GEN.settings, history: [] });
  const used = review.knowledgeUsed.map(u => u.document + (u.used_for ? ` (${u.used_for})` : '')).join('; ') || 'none named';
  const items = { fixes: review.fixes, missing: review.missing };
  const burson = items.fixes.length + items.missing.length
    ? (noWait ? processedText_(items, { terms: [] }) : fixRequestText_(items, { terms: [] }, false))
    : (noWait ? '(no reply: the alert gets its emojis)' : '(no reply; just 👍 on the alert)');
  const rebuilt = rebuildAlert_(TRY_ALERT_TEXT, parsed, review.fields, review.changed);
  const analyst = joinText_(noWait ? withTimestamp_(rebuilt, review.fields, review.changed) : rebuilt, forwardFooter_(review, noWait));
  const esc = escalation_(review.fields, {});
  let draftPreview = `Not escalated (${esc.reason})`;
  if (esc.escalated) {
    const input = emailInput_(review.fields, esc, noWait, review.changed);
    const plan = planRecipients_(esc, esc.text, []);
    const email = socialAlertEmail_(input, plan, { test: false, mailbox: GEN.email.from_email, sendId: 'PREVIEW' });
    draftPreview = `Subject: ${email.subject}\nTo (${email.to.length}): ${email.to.join(', ')}\nCc (${email.cc.length}): ${email.cc.join(', ')}\n\n${email.text}`;
  }
  console.log(`Gemini: ${llm ? 'ok' : 'unavailable (' + llmError + ')'}\n` +
    `Knowledge base given: ${knowledgeNote}\nDocuments Gemini relied on: ${used}\n\n` +
    `===== Burson would see (in the alert's thread) =====\n${burson}\n\n===== Analysts would get =====\n${analyst}\n\n` +
    `===== Social Alert draft =====\n${draftPreview}`);
}

// ---------------------------------------------------------------------------------------------------------------
// The every-minute run
// ---------------------------------------------------------------------------------------------------------------

function poll() {
  if (webViewerCall_()) throw new Error('Not available from the dashboard');
  openEntry_();  // the run-time record (OpenEngine.gs, always): a run that finds the lock taken is counted too
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(1000)) return;  // the previous run is still going
  } catch (e) {  // e.g. "There are too many LockService operations against the same script": this minute is skipped
    console.log('run skipped: the script lock couldn\'t be checked (' + ((e && e.message) || e) + ')');
    return;
  }
  const runStart = Date.now();
  if (!claimRun_(runStart)) {  // a run that started less than RUN_OWNER_MAX_MS_ ago still owns it: nothing is done
    lock.releaseLock();
    return;
  }
  openRunStart_(runStart);  // this run's record: its outside calls are counted (OpenEngine.gs)
  engRunStart_();  // the Engine tab's numbers for this run (EngineTab.gs; row 51 only)
  const tookOver = runTookOver_;  // a run that died: the record counts it from its claim's start
  if (runTookOver_) {  // the run before ended partway (out of memory, a time limit): a failed run, as an error makes one
    try {
      healthFail_(new Error(`the run that started at ${runOwnerWhen_(runTookOver_)} ended without finishing: Apps Script ` +
        'stopped it (out of memory, a time limit or an internal error)'), null);
    } catch (e) {
      console.error('could not count the run that ended: ' + ((e && e.message) || e));
    }
  }
  const props = PropertiesService.getScriptProperties();
  sweepOrphanTriggers_();  // never throws
  let control = null;
  let cfg = null;
  let ss = null;
  let wanted = null;
  let sfb = null;  // this run's S-F Burson (Control tab B25): sfBursonFor_
  let direct = null;  // this run's Work directly in B25 (Control tab row 32): directB25For_
  let sfbFlows = null;  // the S-F Burson the Mirror, Relay, test copy and Auto-correct see: sfb, or none (row 32)
  let rtc = null;  // this run's Burson test copy (Control tab B26): TestCopy.gs testCopyFor_
  let testers = null;  // this run's testers (Control tab B30): testersFor_
  let lookback = null;  // this run's BigQuery lookback (Control tab B31): bqLookbackFor_
  let ftBars = null;  // this run's fast-triage bars (Control tab B41:B45 and B47): ftBarsFor_
  let mode = null;  // this run's mode (runMode_): {live, why}, once the spaces are known
  let mainCtx = null;
  let acStandalone = false;
  let acToday = null;  // working alone in the Auto-correct space: what this run wrote in Today (B7), before that flow ran
  let activity = 0;  // alerts handled and emails sent this run (either space): the Results tab rebuilds right after
  let followActivity = 0;  // new replies seen, drafts made, Social Alerts sent (either space): the Follow-up tab rebuilds right after
  let relayRan = false;  // the relay ran this run (when the run fails before it does, it starts afresh: relayFailStop_)
  try {
    outboxRunStart_();  // Outbox.gs: what this run withholds from, or queues for, S-F Burson (counted for the run log)
    edNotesStart_();    // EarlyDetectionNotes.gs: what became of each Early Detection signal in this run
    setSfBurson_(null);  // Config.gs: no S-F Burson is known until B25 is read below
    setTestCopy_(null);  // Config.gs: no Burson test copy until B26 is read below
    setRunLive_(false);  // Config.gs: Testing until runMode_ says otherwise (fail closed)
    ss = openStore_(false);
    // The shared alert memory (AlertMemory.gs), once this run for every flow below (the Mirror, the Auto-correct and
    // Other alerts spaces, the Watch alerts, the Early wave, Direct BigQuery): read only when a flow needs it, written
    // in the finally below. No post or story is emailed twice, whichever flow or source meets it
    alertMemoryStart_(ss, { deadline: runStart + RUN_HARD_STOP_MS_ });
    if (typeof syncBrandSafetyGroups_ === 'function') syncBrandSafetyGroups_(ss);
    control = controlTab_(ss) || ensureControlTab_(ss, Session.getEffectiveUser().getEmail());
    ensureSwitchRows_(control);  // rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 on a tab from before them (OFF)
    ensureSfBursonRow_(control);  // row 25 (S-F Burson space, blank) on a tab from before it
    ensureTestCopyRow_(control);  // row 26 (Burson test copy, blank) on a tab from before it
    ensureTestersRow_(control);   // row 30 (Testing: send to, blank) on a tab from before it
    ensureBqLookbackRow_(control);  // row 31 (BigQuery lookback, 60 minutes) on a tab from before it
    ensureOtherSpaceRow_(control);  // row 33 (Other alerts space, blank) on a tab from before it
    ensureWatchAlertsRow_(control);  // row 35 (Watch alerts, OFF) on a tab from before it
    ensureFtBarRows_(control);    // rows 41-45 and 47 (fast-triage bars, seeds) on a tab from before them; the help is at row 57
    wanted = readControl_(control);
    ewsRunSwitches_(wanted.switches);  // EarlyWaveSource.gs: which new rows (48-51) are ON this run; unset: all OFF
    // When the bot ran (Control row 56, RunLog.gs): this run taken into the run log, before anything else can fail. With
    // row 56 OFF it only clears its own memory (no read, no write). Never throws
    runLogBegin_(ss, runStart, tookOver, wanted.switches, wanted.on, control);
    testers = testersFor_(wanted.testers, control);  // C30 is kept current even while the bot is paused
    lookback = bqLookbackFor_(wanted.bqLookback, control);  // and C31
    ftBars = ftBarsFor_(wanted.ftBars, control);  // and C41:C45, C47
    if (!wanted.on) {  // paused: skip the Burson space; when it's back ON it starts from that moment
      relaySeen_(false);  // Relay.gs: OFF or paused is noted before anything that can fail
      props.setProperty('PAUSED', 'true');
      props.setProperty('AC_PAUSED', 'true');  // the auto-correct test space too (AutoCorrect.gs)
      props.setProperty('OS_PAUSED', 'true');  // and the Other alerts space (OtherSpace.gs)
      props.setProperty(PW_PAUSED_PROP_, 'true');  // and the Proactive watch (ProactiveWatch.gs): it starts afresh
      props.setProperty('FAIL_STREAK', '0');
      if (typeof noteSheetTestPaused_ === 'function') noteSheetTestPaused_(ss);
      writeControlStatus_(control, { status: pausedStatusText_(), lastCheck: nowLabel_(), today: todayText_(readStats_(), dayKey_(), wanted.switches.noWait) });
      return;
    }
    // The Early Detection tab (EarlyDetectionTab.gs, setting early_detection_tab): made once, with row 19 ON, before any
    // flow writes C19, so C19 never points at a tab that isn't there; after that no Sheets call here. Never throws
    if (wanted.switches.earlyWave) maybeMakeEdTab_(ss);
    // S-F Burson (Control tab B25), once this run, for every flow and Chat.gs (Config.gs setSfBurson_); C25 says what the
    // bot found. Blank or not found, everything that needs it is paused (fail closed). Never throws.
    sfb = sfBursonFor_(control, wanted);
    // Work directly in B25 (Control row 32, directB25For_): ON with B25 a space people outside Google can't join, the bot
    // works right in B25, as in a Mirror space (directCfg_). B25 isn't the real S-F Burson then: no S-F Burson this run
    // (setSfBurson_(null): Chat.gs and guardedChat_ hold nothing back in B25 and queue nothing for it), never LIVE, and
    // B3, B4, B9, B10, B26, the Relay and the Burson outbox aren't used (their column C says so). The real S-F Burson
    // (people outside Google can join it) is never worked this way, whatever row 32 says.
    direct = directB25For_(wanted.switches, sfb);
    if (direct.space) setSfBurson_(null);
    sfbFlows = direct.space ? { space: null, blank: false, error: DIRECT_B25_MODE_WHY_, direct: true } : sfb;
    if (typeof postSheetTestAlert_ === 'function') {
      try {
        postSheetTestAlert_(ss, wanted, sfbFlows || sfb);
      } catch (e) {
        console.error('sheet test alert post: ' + ((e && e.stack) || e));
      }
    }
    // The Burson test copy (Control tab B26), once this run, checked (TestCopy.gs); C26 says what the bot found. Never throws.
    rtc = direct.space ? directB25TestCopyOff_(control, wanted) : testCopyFor_(control, wanted, sfb);
    relaySeen_(wanted.switches.relay && !!sfbFlows.space);  // Relay.gs: OFF, or no S-F Burson, is noted before anything can fail
    if (wanted.switches.relay && !sfbFlows.space) {
      noteSwitch_('relay', direct.space ? `not relaying: ${DIRECT_B25_MODE_WHY_}` : 'not relaying: it needs the S-F Burson space (B25)');
    }
    // The knowledge base (Knowledge.gs): a new or changed Resources row is read before this run's reviews; Drive is asked
    // every 15 minutes whether a document changed. Never more than KNOWLEDGE_RUN_MS_; a failure never stops the run. Each
    // document read goes in the run log, with its Bot status.
    try {
      refreshKnowledge_(ss, { deadline: runStart + KNOWLEDGE_RUN_MS_, log: true });
    } catch (e) {
      console.error('knowledge base not refreshed: ' + ((e && e.message) || e));
    }
    // The Burson test copy (B26, TestCopy.gs): S-F Burson copied into it as it is (Zapier's alerts, and everyone's
    // replies, messages and emojis, in S-F Burson's own order), whether or not the Relay is ON, before the Relay sends
    // the analysts' side there. Its own few seconds; its failures are its own (C26, the run log). B26 blank or not usable: it stops.
    let copyRun = null;
    try {
      if (rtc.space && !(GEN.settings && GEN.settings.dry_run)) copyRun = testCopyRun_(ss, control, rtc, sfb.space);
      else if (!rtc.space) testCopyStop_();
    } catch (e) {
      console.error('Burson test copy: ' + ((e && e.stack) || e));
    }
    // The Mirror space (B9, Mirror.gs; set without S-F Burson: paused, a problem to fix, B5). With the Relay switched ON
    // (row 22) the Relay copies S-F Burson into it in S-F Burson's own order, Zapier's alerts included, so the Mirror's
    // own copying waits until the Relay has run, and happens then only if the Relay didn't copy (below). Working
    // directly in B25 (row 32): not used (C9 says so)
    const relayMayCopy = !!(wanted.switches.relay && sfbFlows.space && !(GEN.settings && GEN.settings.dry_run));
    let mirror = direct.space ? directB25MirrorOff_(control, wanted) : mirrorZapierPosts_(control, wanted, sfb, { defer: relayMayCopy });
    acStandalone = !direct.space && !mirror && !!String(wanted.autocorrect || '').trim() &&
      (!String(wanted.burson || '').trim() || !String(wanted.analyst || '').trim());
    if (acStandalone) {
      mode = { live: false, why: AC_STANDALONE_MODE_WHY_ };
      const needs = sfb.space ? [] : sfbNeeds_(wanted, null);
      const memNote = amControlNote_();  // AlertMemory.gs: its memory couldn't be read lately ('' when it could)
      const resultsNote = resultsBlockedNote_();  // Speed.gs: a "Results" tab the bot didn't make is in the way ('' when not)
      const headStartNote = headStartBlockedNote_();  // HeadStart.gs: the same for a "Head start" tab ('' when not)
      const edTabNote = edTabBlockedNote_();  // EarlyDetectionTab.gs: the same for an "Early Detection" tab ('' when not)
      writeControlStatus_(control, {
        bursonNote: '\u2014 not used (working in Auto-correct space, B10)',
        analystNote: '',
        status: needs.length ? `\u26a0\ufe0f ${sfbProblemText_(sfb, needs)}`
          : (memNote ? `\u26a0\ufe0f ${memNote}` : resultsNote ? `\u26a0\ufe0f ${resultsNote}`
            : headStartNote ? `\u26a0\ufe0f ${headStartNote}` : edTabNote ? `\u26a0\ufe0f ${edTabNote}` : okStatusText_()),
        lastCheck: nowLabel_(),
        // Today (B7): the Auto-correct flow's own count, the one C10 shows (the main flow's counters never move
        // here). The flow runs below, in this run's finally, which brings B7 up to date with what it handled
        today: (acToday = autoCorrectTodayCell_(props, dayKey_()) + amTodayText_()),
      });
      props.setProperty('FAIL_STREAK', '0');
      return;
    }
    if (direct.space) {
      cfg = directCfg_(direct.space);  // one space, as the Mirror's: the bot posts and reacts right in B25
    } else if (mirror && mirror.outboundBlocked) {
      cfg = { burson: mirror.space, analyst: mirror.space, mirror: mirror.space, outboundBlocked: true, sfBurson: sfb.space };
    } else if (mirror) {
      cfg = resolveSetup_(Object.assign({}, wanted, { burson: mirror.space.id }), false, sfb.space);
      cfg.mirror = mirror.space;
      cfg.sfBurson = sfb.space;
      rememberAnalystSpace_(cfg);
    } else {
      cfg = resolveSetup_(wanted, false, sfb.space);
      cfg.sfBurson = sfb.space;
      rememberAnalystSpace_(cfg);
    }
    // A Burson space (B3) people outside Google can join that isn't S-F Burson (B25 another space, blank or not found):
    // nothing is written there this run (guardedChat_ holds every write back, and Chat.gs refuses it too); C3 and B5 say so
    const outside = !cfg.outboundBlocked && !!cfg.burson.externalUserAllowed && !isSfBurson_(cfg.sfBurson, cfg.burson.id);
    if (outside) noteOutsideSpace_(cfg.burson.id);
    // Testing or LIVE (the Safety valve, row 29, and B26: runMode_), once this run, for both flows' ctx (the auto-correct
    // flow is never LIVE), Chat.gs's DM rule and the switch texts. Working directly in B25 (row 32): always Testing
    mode = direct.space ? { live: false, why: DIRECT_B25_MODE_WHY_ } : runMode_(wanted.switches, wanted.testCopy, sfb.space, cfg);
    cfg.mode = mode;
    cfg.testers = testers.testers;
    // Post in S-F Burson (Control row 24, Outbox.gs): the Burson outbox rows someone set to Send are written now, each
    // once (the switch read again right before each), only while LIVE; nothing else is ever written in S-F Burson. Its
    // failures are its own. Working directly in B25 (row 32): no S-F Burson this run, so nothing is sent (rows wait)
    try {
      if (!direct.space) sendBursonOutbox_(ss, control, wanted, sfb.space, mode);
      else if (wanted.switches.postBurson) noteSwitch_('postBurson', `not used: ${DIRECT_B25_MODE_WHY_}, and posts there itself`);
    } catch (e) {
      console.error('Burson outbox: ' + ((e && e.stack) || e));
    }
    const ctx = buildCtx_(cfg, ss, wanted.switches);
    // The BigQuery lookback (B31, held to 15-60 minutes): how far back Direct BigQuery alerts and the Early wave check
    // look this run (BqLookback.gs bqLookbackMinutes_ holds it to that again)
    ctx.settings.bq_lookback_minutes = lookback ? lookback.minutes : BQ_LOOKBACK_DEFAULT_MIN_;
    ctx.ftBars = ftBars ? ftBars.bars : ftBars_();
    startFrom_(props, cfg, ctx);
    // The Burson test copy (B26): while it's usable the Relay sends the analysts' side there, straight through, and
    // nothing to S-F Burson; set but not usable, the analysts' side waits (nothing queued for S-F Burson either)
    ctx.testCopy = rtc.space;
    ctx.testCopyWanted = !!wanted.testCopy;
    // Post in S-F Burson (row 24) from the Mirror space (Outbox.gs forwardOwnBurson_): the bot's own Burson replies and
    // emojis go on the matching message in the test copy (its pairs, read by this run's copy) or on the Burson outbox
    ctx.copyState = copyRun && copyRun.state;
    if (cfg.outboundBlocked) ctx.ownGuard = { terms: (guardFor_(ctx).terms || []).concat(outboxGuard_(wanted).terms) };
    // Relay with S-F Burson (Control row 22, Relay.gs), before the bot's own pass, each step with its own few seconds:
    // S-F Burson comes into the Mirror space as it is, in its own order (Zapier's alerts, everyone's replies and
    // messages); with Post in S-F Burson ON (row 24) the analysts' are queued on the Burson outbox tab (with a Burson test
    // copy, B26: sent straight there instead), only ones written before this run read the switches; then the emojis both
    // ways (the switch read again first). Its failures are its own. Not running (OFF, no Mirror space, a dry run, a failed
    // run), it starts afresh when it's back: nothing written in between goes either way.
    if (cfg.outboundBlocked) ctx.relayAdded = relayAddedLoader_(ss, cfg.burson.id);  // the emojis it brought over
    if (switchOn_(ctx, 'relay') && cfg.outboundBlocked && !ctx.settings.dry_run) relayBotUser_(ctx, control.getRange(8, 2).getValue());
    let relayCopied = false;  // the Relay copied S-F Burson into the Mirror space this run (Zapier's alerts included)
    let relayAlerts = 0;
    let relayInError = '';  // it couldn't (S-F Burson unreadable, or an alert didn't go): the run fails, as the Mirror's does
    if (relayOn_(ctx)) {
      let relayError = '';
      const t0 = ctx.now();
      const by = ms => Math.min(ctx.deadline - RELAY_MIN_LEFT_MS_, t0 + ms);
      // each step on its own: one failing never stops the others
      const step = (what, fn) => {
        try {
          return fn();
        } catch (e) {
          console.error(`relay (${what}): ${(e && e.stack) || e}`);
          relayError = relayError || `couldn't ${what}: ${(e && e.message) || e}`;
          return null;
        }
      };
      const relay = step('read the Relay tab', () => relayState_(ss, cfg.burson.id, relayCopyId_(ctx)));
      if (relay) {
        relayRan = true;
        relay.guard = relayGuard_(ctx, wanted);
        relay.copy = copyRun && copyRun.state;  // the Test copy tab's pairs, read by this run's copy (TestCopy.gs)
        ctx.relayState = relay;  // its pairs: which S-F Burson message a Mirror one is (Outbox.gs forwardOwnBurson_)
        ctx.relayAdded = () => relay.addedIn;
        // the switches (and B26) read again, every few seconds, before each row is queued or sent to the test copy
        ctx.relayCanQueue = relayLiveCheck_(control, ctx.testCopy ? wanted.testCopy : '');
        const toCopy = !!relayCopyId_(ctx);
        const inbound = step('bring S-F Burson\'s messages over', () => relayInbound_(ctx, relay, mirror && mirror.copies, by(RELAY_IN_BUDGET_MS_)));
        // The relay copies S-F Burson into the Mirror space this run, not the Mirror (below). It couldn't read S-F Burson
        // (relayError says why: nothing before this step sets it), or an alert didn't go: the run fails, as the Mirror's would
        relayCopied = true;
        relayInError = inbound ? inbound.alertError || '' : relayError;
        if (inbound) relayAlerts = inbound.alerts || 0;
        if (inbound && (inbound.in || inbound.alerts || inbound.failed)) console.log(`relay in: ${JSON.stringify(inbound)}`);
        if (inbound && inbound.error) relayError = relayError || `couldn't bring a message from S-F Burson over: ${inbound.error}`;
        const outbound = step(toCopy ? 'send the analysts\' messages to the Burson test copy' : 'queue the analysts\' messages',
          () => relayOutbound_(ctx, relay, by(RELAY_IN_BUDGET_MS_ + RELAY_OUT_BUDGET_MS_), runStart));
        if (outbound && (outbound.queued || outbound.sent || outbound.held)) console.log(`relay out: ${JSON.stringify(outbound)}`);
        if (outbound && outbound.error) {
          relayError = relayError || `couldn't ${toCopy ? 'send an analyst\'s message to the Burson test copy' : 'queue an analyst\'s message'}: ${outbound.error}`;
        }
        if (!relayStillOn_(control)) {  // turned OFF (or paused) during this run: no emoji goes
          relayStop_();
        } else {
          const emojis = step('relay the emojis', () => relayEmojis_(ctx, relay, by(RELAY_IN_BUDGET_MS_ + RELAY_OUT_BUDGET_MS_ + RELAY_EMOJI_BUDGET_MS_)));
          if (emojis && (emojis.in || emojis.out)) console.log(`relay emojis: ${JSON.stringify(emojis)}`);
          if (emojis && emojis.error) relayError = relayError || `couldn't relay an emoji: ${emojis.error}`;
        }
      }
      noteSwitch_('relay', relayError ? `⚠️ ${truncate_(relayError, 150)} (tried again every run)`
        : `last relay ${new Date(ctx.now()).toISOString().slice(11, 16)} UTC · the Relay tab has each one`);
    } else {
      if (!switchOn_(ctx, 'relay') || !cfg.outboundBlocked || ctx.settings.dry_run) relayStop_();
      if (switchOn_(ctx, 'relay')) noteSwitch_('relay', relayWhyOff_(ctx));
    }
    // The Mirror's own copying, when it waited for the Relay. The Relay copied: C9 says so. It couldn't (S-F Burson
    // unreadable, or an alert didn't go): C9 says why and the run fails, as when the Mirror's own copying fails, and it's
    // tried again next run, nothing after it copied ahead of it. It didn't run: the Mirror copies the alerts now, before
    // the bot's pass, and throws as before when S-F Burson can't be read
    if (mirror && mirror.deferred) {
      if (relayInError) {
        writeMirrorNote_(control, `⚠️ ${truncate_(relayInError, 160)}`);
        throw new Error(relayInError);
      }
      if (relayCopied) writeMirrorNote_(control, mirrorRelayNote_(mirror.space));
      else mirror = mirrorCopyNow_(control, mirror.space, sfb);
    }
    // Direct BigQuery alerts (Control row 15): ON turns the direct poll on for this run, with all three sources (this
    // run's copy of the settings only). Its failures are its own: the alerts in the Burson space come first.
    if (switchOn_(ctx, 'directBq')) {
      Object.assign(ctx.settings, { bq_direct_poll: true, bq_poll_sprinklr: true, bq_poll_bmie: true, bq_poll_bsip: true });
    }
    let bqPolled = null;
    if (typeof apiGuardAllowBackground_ !== 'function' || apiGuardAllowBackground_('any', false)) {
      try {
        bqPolled = pollBigQuerySources_(ctx, cfg.burson.id);
      } catch (e) {
        console.error('direct BigQuery alerts: ' + ((e && e.message) || e));
      }
    }
    const oeBefore = openFetches_();  // Burson's pass: its outside calls, for Burson's reserve (OpenEngine.gs)
    const report = runOnce_(ctx);
    openBursonPass_(oeBefore);
    const slaBusy = !!(report && (report.held > 0 || report.handled >= ctx.settings.max_messages_per_run ||
      (report.errors || []).some(e => /^time budget/.test(String(e)))));
    ctx.slaBusy = slaBusy;
    const zapierMirrored = ((mirror && mirror.copied) || 0) + relayAlerts;  // the Mirror's copies, or the Relay's
    if (zapierMirrored) report.zapier_mirrored = zapierMirrored;
    if (bqPolled && (bqPolled.sprinklr || bqPolled.bmie)) {
      report.bq_sprinklr = bqPolled.sprinklr;
      report.bq_bmie = bqPolled.bmie;
    }
    if (bqPolled && bqPolled.bsip) report.bq_bsip = bqPolled.bsip;
    if (bqPolled) engAdd_('direct', (Number(bqPolled.sprinklr) || 0) + (Number(bqPolled.bmie) || 0) + (Number(bqPolled.bsip) || 0));
    // Early detection (Control row 19): ON reads BigQuery low-tier clusters and multi-grain velocity spikes at most every
    // 15 minutes into a review queue (BigQuery.gs earlyWaveCheck_), then reviews queued signals and posts each one as a
    // single story card, at most 2 a run (EarlyDetection.gs edDrainQueue_). After the alerts; its failures stay isolated.
    // the open engine (row 51): a check that was due but is skipped says so on the Early Detection tab (edCheckSkipped_)
    if (switchOn_(ctx, 'earlyWave') && !(typeof apiGuardAllowBackground_ !== 'function' || apiGuardAllowBackground_('any', slaBusy))) {
      edCheckSkipped_(ctx, slaBusy ? 'busy' : 'guard');
    }
    if (switchOn_(ctx, 'earlyWave') && (typeof apiGuardAllowBackground_ !== 'function' || apiGuardAllowBackground_('any', slaBusy))) {
      ctx._ewBqDeferEvents = true;
      try {
        engCheck_(earlyWaveCheck_(ctx));  // its numbers for the Engine tab (row 51 only)
      } catch (e) {
        console.error('early detection check: ' + ((e && e.message) || e));
      }
      try {
        const drained = edDrainQueue_(ctx, report);
        if (drained && (drained.posted || drained.dropped || drained.dismissed)) console.log(`early detection review: ${JSON.stringify(drained)}`);
      } catch (e) {
        console.error('early detection review: ' + ((e && e.message) || e));
      } finally {
        delete ctx._ewBqDeferEvents;
        if (Array.isArray(ctx._ewBqEvents) && ctx._ewBqEvents.length) {
          const evs = ctx._ewBqEvents.slice();
          delete ctx._ewBqEvents;
          ewBqFlush_(ctx, props, () => (ctx.deadline ? ctx.deadline - ctx.now() : Infinity), { signal_events: evs });
        }
      }
    }
    ctx.recent.save();
    mainCtx = ctx;
    activity += activityOf_(report);
    followActivity += followupActivityOf_(report);

    const day = dayKey_();
    const today = bumpStats_(readStats_(), report, day);
    props.setProperty(STATS_PROP_, JSON.stringify(today));
    props.setProperty('LAST_RUN', JSON.stringify(Object.assign({ at: new Date().toISOString() }, report,
      { errors: report.errors.slice(0, 5).map(e => truncate_(e, 300)) })));
    if (report.handled || report.mirrored || report.zapier_mirrored || report.bq_sprinklr || report.bq_bmie || report.bq_bsip || report.drafts || report.drafts_sent || report.drafts_updated || report.watch_updates || report.outcomes || report.followups || report.errors.length) {
      console.log(JSON.stringify(report));
    }

    const issues = report.errors.filter(e => !/^time budget/.test(e));
    const notice = recentNotice_(props, report.notices || []);
    // S-F Burson (B25): blank or not found while something set needs it, or a Burson space (B3) people outside Google can
    // join that isn't it: B5 says what to fix (before anything else), and C3 why nothing is posted there
    const needs = sfb.space ? [] : sfbNeeds_(wanted, cfg.outboundBlocked ? null : cfg.burson);
    const sfbStatus = outside && sfb.space ? outsideBursonStatusText_(cfg.burson, sfb.space)
      : needs.length ? `⚠️ ${sfbProblemText_(sfb, needs)}` : '';
    const statusNotes = direct.space ? { bursonNote: DIRECT_B25_B3_NOTE_ }  // Work directly in B25 (row 32): B3 isn't used
      : cfg.outboundBlocked
        ? { bursonNote: '✓ ' + cfg.burson.name }
        : { bursonNote: outside ? outsideBursonNote_(cfg.burson) : '✓ ' + cfg.burson.name, analystNote: '✓ ' + cfg.analyst.name };
    const memNote = amControlNote_();  // AlertMemory.gs: its memory couldn't be read lately ('' when it could)
    // Speed.gs: a tab named Results that the bot didn't make is in the way, so the Results tab isn't updated ('' when it is)
    const resultsNote = resultsBlockedNote_();
    // HeadStart.gs: the same for a tab named Head start that the bot didn't make ('' when its last rebuild found none)
    const headStartNote = headStartBlockedNote_();
    // EarlyDetectionTab.gs: the same for a tab named Early Detection ('' when the last write found none)
    const edTabNote = edTabBlockedNote_();
    const status = sfbStatus || (issues.length ? `⚠️ Something needs another try: ${truncate_(issues[0], 240)} The bot keeps retrying.`
      : (notice ? `⚠️ ${notice}` : memNote ? `⚠️ ${memNote}` : resultsNote ? `⚠️ ${resultsNote}`
        : headStartNote ? `⚠️ ${headStartNote}` : edTabNote ? `⚠️ ${edTabNote}`
          : direct.space ? directB25StatusText_(cfg.burson) : okStatusText_()));
    writeControlStatus_(control, Object.assign(statusNotes, {
      status: mode && mode.live ? `${LIVE_STATUS_PREFIX_}${status}` : status,
      lastCheck: nowLabel_(), today: todayText_(today, day, wanted.switches.noWait) + amTodayText_(),
    }));
    if (issues.length) healthFail_(new Error(issues[0]), cfg.outboundBlocked ? null : cfg);
    else healthOk_(ctx);
  } catch (e) {
    runLogFailed_(e);  // RunLog.gs: this run stopped with an error (memory only; recorded at its end with row 56 ON)
    console.error('run failed: ' + ((e && e.stack) || e));
    if (!relayRan) relayFailStop_();  // Relay.gs: it didn't run, so it starts afresh (nothing written meanwhile goes)
    if (control) {
      try {
        writeControlStatus_(control, Object.assign({}, e && e.notes, {
          status: problemStatusText_(e), lastCheck: nowLabel_(),
          today: todayText_(readStats_(), dayKey_(), !!(wanted && wanted.switches && wanted.switches.noWait)),
        }));
      } catch (err) {
        console.error('could not update the Control tab: ' + err);
      }
    }
    healthFail_(e, cfg && cfg.outboundBlocked ? null : cfg);
  } finally {
    try {
      if (ss && control && wanted && wanted.on) {
        const bgBusy = !!(mainCtx && mainCtx.slaBusy);
        // The Other alerts space (Control tab B33, OtherSpace.gs): a Google-only space with other alerts, worked directly
        // and always Testing, with no S-F Burson. Its own status (C33) and time budget; it never touches the run above.
        // The Results, Follow-up and Analysis tabs leave its alerts out, so its activity doesn't rebuild them
        const os = runOtherSpace_(control, wanted, ss, cfg, runStart, sfb);
        // The auto-correct test space (Control tab B10): the live Burson space (S-F Burson, B25), read only, with each
        // alert corrected by the bot and posted there. Its own status (C10) and time budget; it never touches the run above.
        // Working directly in B25 (row 32): no S-F Burson this run (sfbFlows), so it doesn't run, and C10 says why
        const allowAcEarlyWave = !String(wanted.mirror || '').trim() &&
          (!mainCtx || Boolean(earlyWaveRefusal_(mainCtx)));
        const allowAcDirectBq = !String(wanted.mirror || '').trim() &&
          (!mainCtx || Boolean(bqDirectRefusal_(mainCtx, cfg && cfg.burson && cfg.burson.id)));
        const ac = runAutoCorrect_(control, wanted, ss, cfg, runStart, sfbFlows || sfb, {
          standalone: acStandalone,
          allowEarlyWave: allowAcEarlyWave,
          allowDirectBq: allowAcDirectBq,
          lookbackMinutes: lookback ? lookback.minutes : BQ_LOOKBACK_DEFAULT_MIN_,
        });
        if (ac) activity += activityOf_(ac.report);
        if (ac) followActivity += followupActivityOf_(ac.report);
        // Working alone in the Auto-correct space: Today (B7) says what C10 says, this run's alerts included (it was
        // written above, before the flow ran). Written only when the flow changed it; a write that fails is logged and
        // the steps below still run (the next run writes the cell)
        if (acStandalone && acToday !== null) {
          const todayNow = autoCorrectTodayCell_(props, dayKey_()) + amTodayText_();
          if (todayNow !== acToday) {
            try { control.getRange(7, 2).setValue(todayNow); } catch (e) { console.error('could not update Today (B7): ' + ((e && e.message) || e)); }
          }
        }
        // Temp checks (Control row 36, TempCheck.gs): what analysts asked for in a thread of the Mirror space or the Other
        // alerts space (queued by their flows above), worked now, after the alerts, in what's left of the run (one that
        // can't be done waits for the next run): emailed to this run's testers (B30, else the stand-in), the thread told
        // it was; OFF, nothing waits. Never throws
        runTempChecks_(runStart, wanted.switches, { testers: testers && testers.testers });
        // Proactive watch (Control row 34, ProactiveWatch.gs): Gemini checks Pendulum's posts in BigQuery; what it
        // flags goes on its own tabs. Nothing is posted or emailed unless Watch alerts (row 35, WatchAlerts.gs) says
        // where its flags go: B33, B9, or B10, where their flows work them next run like any alert.
        if (wanted.switches.proactiveWatch) {
          const waChoice = pwAlertsChoice_(wanted.watchAlerts);
          const toOther = waChoice === 'other';
          const toAc = waChoice === 'autocorrect';
          const alerts = pwAlertsDest_(
            wanted.watchAlerts,
            toOther ? pwOtherSpaceFor_(os, wanted, cfg, sfb) : null,
            cfg,
            toAc ? pwAutoCorrectSpaceFor_(ac, wanted, cfg, sfbFlows || sfb) : null
          );
          // where stories go first in the Auto-correct space, a story's card that sent no Social Alert is no post's own
          // alert for the watch either (WatchAlerts.gs pwStoryCardOnly_); everywhere else the watch does as before
          if (toAc && alerts && ac && ac.ctx && ac.ctx.bqPastStoryCards === true) alerts.bqPastStoryCards = true;
          // the open engine (row 51): the Watch posts a new card there only while fewer than 3 of the bot's own wait
          if (toAc && alerts && openOn_()) alerts.bgWaiting = Number(ac && ac.report && ac.report.bg_waiting) || 0;
          const otherBusy = Boolean(toOther && os && os.report &&
            ((os.report.errors || []).some(e => /^time budget/.test(String(e))) || os.report.held > 0));
          const acBusy = Boolean(toAc && ac && ac.report &&
            ((ac.report.errors || []).some(e => /^time budget/.test(String(e))) || ac.report.held > 0 ||
              ac.report.analyst_backlog ||
              (ac.ctx && ac.ctx.settings && ac.report.handled >= ac.ctx.settings.max_messages_per_run)));
          runProactiveWatch_(ss, runStart, { alerts, control, otherBusy, acBusy, slaBusy: bgBusy });
        } else {
          proactiveWatchOff_();
          pwAlertsIdle_(control, wanted.watchAlerts, false);
        }
        // Proactive watch: also read the AMIE table (Control row 50, ProactiveWatch.gs): OFF forgets its check, its keys,
        // its mark and its row's numbers (writes only what is there). Never throws
        if (!wanted.switches.watchAmie) pwAmieOff_();
        // Early Detection: also read Brandwatch live (Control row 49, BrandwatchLive.gs): right after the Watch, never in
        // front of it; it reads only while rows 49 and 19 are ON, and hands what it read to Early Detection's next check.
        // OFF forgets where it had read to (never the day's counts or the ticks). Never throws
        if (wanted.switches.edBwLive) bwLiveRun_(runStart, wanted.switches);
        else bwLiveOff_(wanted.switches);
        // Early Detection: also read the AMIE table (Control row 48, EarlyWaveSource.gs): OFF forgets where it had read to
        // and the posts it had set aside (never the day's counts or the date its trial started). Never throws
        if (!wanted.switches.edAmie) ewsAmieOff_(wanted.switches);
        const any = mainCtx || (ac && ac.ctx);
        const bgIdleOk = typeof apiGuardAllowBackground_ !== 'function' || apiGuardAllowBackground_('any', bgBusy);
        if (any) {
          if (activity > 0 || bgIdleOk) {
            maybeRefreshSpeed_(ss, any, {  // the Results tab: right after anything happened, else every 10 minutes
              activity: activity > 0, deadline: runStart + RUN_HARD_STOP_MS_,
              flows: resultsFlows_(mainCtx, ac && ac.ctx, cfg),
            });
          }
          // The Follow-up tab (FollowUp.gs, Track post-alert outcomes ON only): right after a new reply or draft, else
          // every 10 minutes; never touches the run (its failures are logged)
          if (followActivity > 0 || bgIdleOk) {
            maybeRefreshFollowUp_(ss, any, {
              activity: followActivity > 0, deadline: runStart + RUN_HARD_STOP_MS_,
              flows: resultsFlows_(mainCtx, ac && ac.ctx, cfg),
            });
          }
          // The Analysis tab (Analysis.gs): side-by-side bot vs. analyst responses, logic & KB snippets (on "Run now",
          // filter edits, new activity/Q&A, or every 10 minutes; reuses Results' cached BigQuery state)
          if (activity > 0 || bgIdleOk) {
            maybeRefreshAnalysis_(ss, any, {
              activity: activity > 0, deadline: runStart + RUN_HARD_STOP_MS_,
              flows: resultsFlows_(mainCtx, ac && ac.ctx, cfg),
            });
          }
          // The Head start tab (HeadStart.gs): this app's own alerts next to Burson's alerts and the IMs' emails, at most
          // every 10 minutes, after the Results tab (whose rebuild in this run has the IMs' times); it only reads the
          // Alert log and its own tab, writes only that tab, and never throws. Never in a run where a flow is still
          // catching up on alerts (`flows`: it waits for a run that has caught up, so the next run is never kept waiting)
          if (activity > 0 || bgIdleOk) {
            maybeRefreshHeadStart_(ss, any, { deadline: runStart + RUN_HARD_STOP_MS_, runStart, flows: [mainCtx, ac, os] });
          }
          // The Early Detection tab (EarlyDetectionTab.gs, setting early_detection_tab): this run's record of what became
          // of each story signal, written with 30 seconds of the run left and never in a run still catching up on alerts;
          // else its rows wait for the next run. A run without a row makes no Sheets call. Never throws
          maybeWriteEdTab_(ss, any, { deadline: runStart + RUN_HARD_STOP_MS_, flows: [mainCtx, ac, os] });
          // The Engine tab (EngineTab.gs, Control row 51 only): a row for a check this run made, and the day's row
          maybeWriteEngineTab_(ss, any, { deadline: runStart + RUN_HARD_STOP_MS_, flows: [mainCtx, ac, os] });
        }
        // Burson's alerts posted while the bot was OFF (Control row 56 only, RunLog.gs): after a paused stretch, listed
        // on the "Burson while bot OFF" tab a page or two a run, last, never in a run still catching up on alerts. It
        // only reads Chat: nothing is reviewed, posted or emailed, and no cursor moves. Row 56 OFF: nothing. Never throws
        runLogListOff_(ss, {
          deadline: runStart + RUN_HARD_STOP_MS_, cfg, sfb, wanted, standalone: acStandalone, flows: [mainCtx, ac, os],
          exclude: [rtc && rtc.space && rtc.space.id, os && os.ctx && String(os.ctx.partition || '').split(' > ')[0]],
        });
      }
    } catch (e) {
      console.error('after the run: ' + ((e && e.stack) || e));
    }
    try {
      // C11:C24, C27:C29, C32, C34, C36:C40, C46, C48:C51 and C54:C56, paused or not; whether this run is LIVE (runMode_),
      // when the run got that far
      const live = mode ? mode.live : undefined;
      const extra = rtc ? { testCopy: rtc.space ? rtc.space.name : '', testCopyBroken: !rtc.space && !rtc.blank } : {};
      if (mode && mode.why) extra.modeWhy = mode.why;
      if (testers && testers.testers) extra.testers = testers.testers;
      if (direct) extra.directB25 = { state: direct.state, name: direct.name };  // C32: Work directly in B25
      if (wanted) extra.watchAlerts = pwAlertsChoice_(wanted.watchAlerts);  // C34: where the watch's flags go (row 35)
      if (wanted) extra.paused = !wanted.on;  // C55: no slide is delivered while the bot is paused (B2 OFF)
      // C56: since when the run log is kept (RunLog.gs), read only with row 56 ON
      if (wanted && wanted.switches && wanted.switches.speedHonest === true) extra.runLogStart = runLogStart_();
      // the open engine (Control row 51, OpenEngine.gs): the day's counts, then C51's note, before column C is written
      openDaySave_();
      openWriteNote_(Date.now());
      if (control && wanted) writeSwitchStatuses_(control, wanted.switches, live, extra);
    } catch (e) {
      console.error('could not update the switches on the Control tab: ' + ((e && e.message) || e));
    }
    // The live dashboard (Control row 54) and the slide deliveries (row 55), last: the dashboard's build id, and the
    // deliveries' own time trigger. Nothing here while both are OFF and no deliveries trigger is kept (no property
    // written, no trigger call). Never throws, so it can never fail the run
    if (wanted && wanted.switches) pollDashboardUpkeep_(wanted.switches, { live: mode ? mode.live : undefined, start: runStart });
    try { outboxRunEnd_(); } catch (e) { console.error('Burson outbox: ' + e); }  // what this run withheld or queued
    // The shared alert memory (AlertMemory.gs): what every flow learned this run, written once (never throws), then gone
    alertMemoryFlush_();
    alertMemoryEnd_();
    // When the bot ran (Control row 56 only, RunLog.gs): this run's end; nothing with row 56 OFF. Never throws
    runLogEnd_(Date.now());
    // the run-time and outside-call record (RUN_LEDGER, always: it only records), then UrlFetchApp as it was
    openLedgerRecord_(runStart, Date.now(), tookOver);
    openRunEnd_();
    releaseRun_();  // RUN_OWNER, if this run still holds it
    lock.releaseLock();
  }
}

/** Runs can go on a little past RUN_BUDGET_MS_ (the auto-correct space and the Results tab), never near Apps Script's 6 min. */
const RUN_HARD_STOP_MS_ = 5 * 60 * 1000;

/** Alerts handled, emails sent or drafted, and new outcomes in a run: anything that changes the Results tab. Pure. */
function activityOf_(report) {
  const r = report || {};
  return (r.alerts || 0) + (r.resends || 0) + (r.drafts || 0) + (r.drafts_sent || 0) + (r.drafts_updated || 0) + (r.outcomes || 0);
}

const NOTICE_SHOWN_MS_ = 60 * 60 * 1000;

/**
 * A one-off problem that isn't worth retrying (e.g. an escalation DM that couldn't be sent), shown on the Control tab for
 * an hour after it happened; '' when there's none. `notices` are this run's.
 */
function recentNotice_(props, notices) {
  if ((notices || []).length) props.setProperty('LAST_NOTICE', JSON.stringify({ at: Date.now(), text: truncate_(notices[0], 260) }));
  try {
    const n = JSON.parse(props.getProperty('LAST_NOTICE') || 'null');
    return n && Date.now() - Number(n.at || 0) < NOTICE_SHOWN_MS_ ? String(n.text || '') : '';
  } catch (e) {
    return '';
  }
}

/** Status (B5) while the run is LIVE starts with this. */
const LIVE_STATUS_PREFIX_ = '🔴 LIVE · ';

/**
 * This run's mode, from the Control tab: LIVE only when the Safety valve (row 29) is OFF, the Burson test copy (B26) is
 * blank, S-F Burson (B25) was found, people outside Google can join it (as they can the real S-F Burson: a Google-only
 * B25 is a test space, never live), and the alerts come from it (the Burson space, B3, is S-F Burson, or the Mirror
 * space copies it); anything else, or anything not known, is Testing. `testCopyCell`: B26 as written (set but failing
 * its checks is still set). {live, why (why it's Testing; '' when LIVE)}. Pure.
 */
function runMode_(switches, testCopyCell, sfbSpace, cfg) {
  if (!switches) return { live: false, why: 'the switches couldn\'t be read' };
  if (switches.safetyValve === true) return { live: false, why: 'the Safety valve is ON' };
  if (switches.bsgTestEmails === true) return { live: false, why: 'Group test emails, row 37, is ON' };
  if (String(testCopyCell === undefined || testCopyCell === null ? '' : testCopyCell).trim()) {
    return { live: false, why: 'the Burson test copy, B26, is set' };
  }
  if (!(sfbSpace && sfbSpace.id)) return { live: false, why: 'S-F Burson, B25, isn\'t set or found' };
  if (sfbSpace.externalUserAllowed === false) {
    return { live: false, why: 'S-F Burson, B25, is a Google-only space: the real S-F Burson lets people outside Google join' };
  }
  const fromSfb = !!cfg && (!!cfg.outboundBlocked || isSfBurson_(sfbSpace, cfg.burson && cfg.burson.id));
  if (!fromSfb) return { live: false, why: 'the alerts don\'t come from S-F Burson: B3 isn\'t S-F Burson and no Mirror space' };
  return { live: true, why: '' };
}

// ---------------------------------------------------------------------------------------------------------------
// Work directly in B25 (Control tab row 32, OFF until a person turns it on)
// ---------------------------------------------------------------------------------------------------------------
//
// To try the bot on another space and its alerts (a campaign space, say), someone pastes that space in B25 and turns
// row 32 ON. When people outside Google can't join B25, the bot works right in it, as in a Mirror space: one space
// (directCfg_), every alert there reviewed (Burson's format, or any other: OtherAlerts.gs), its notes, replies and emojis
// posted there directly (no Burson outbox), and answers from the whole knowledge base (no Burson guard: only Google
// people are there). B25 isn't the real S-F Burson then: the run has no S-F Burson (Config.gs setSfBurson_(null)), so
// Chat.gs and guardedChat_ hold nothing back there, and nothing is queued for it. Always Testing: every email only to the
// testers (B30), the test copy of the T&S form, nothing for the leads. B3, B4, B9, B10, B26, the Relay and the Burson
// outbox aren't used; Direct BigQuery alerts and the Early wave check don't post there (BigQuery.gs). People outside
// Google can join the real S-F Burson, so it is never worked this way, whatever row 32 says.
// ---------------------------------------------------------------------------------------------------------------

/**
 * Why a run that works alone in the Auto-correct space (B10 set; B9 blank; B3 or B4 blank) is Testing (C29, the run
 * log). No cell lifts it: B26 blank and S-F Burson set don't make that run LIVE (Control.gs: the Safety valve's note).
 */
const AC_STANDALONE_MODE_WHY_ = 'working in the Auto-correct space (B10)';

/** Why a run that works directly in B25 is Testing (C29, the run log), and what the cells it doesn't use say. */
const DIRECT_B25_MODE_WHY_ = 'the bot works directly in B25, a Google-only space (row 32)';
const DIRECT_B25_NOT_USED_ = 'Not used while "Work directly in B25" (row 32) is ON: the bot works right in B25';
const DIRECT_B25_B3_NOTE_ = '— not used while row 32 is ON: the bot works right in B25';

/**
 * This run's "Work directly in B25" (Control tab row 32), from the switches and this run's B25 (`sfb`: sfBursonFor_):
 * {space, state, name}. state 'on': the switch ON, and B25 found and a space people outside Google can't join (`space`
 * is B25: the bot works right in it); 'outside': ON, but people outside Google can join B25 (the real S-F Burson: as
 * with the switch OFF); 'waiting': ON, B25 blank or not found; 'off'. Only externalUserAllowed === false counts as
 * Google-only (not known: as the real S-F Burson, fail closed). Pure.
 */
function directB25For_(switches, sfb) {
  const space = sfb && sfb.space && sfb.space.id ? sfb.space : null;
  const name = space ? String(space.name || space.id) : '';
  if (!(switches && switches.directB25 === true)) return { space: null, state: 'off', name };
  if (!space) return { space: null, state: 'waiting', name };
  if (space.externalUserAllowed !== false) return { space: null, state: 'outside', name };
  return { space, state: 'on', name };
}

/** The run's setup while it works directly in B25 (`space`): one space, as the Mirror's, and no real S-F Burson. Pure. */
function directCfg_(space) {
  return { burson: space, analyst: space, outboundBlocked: true, sfBurson: null, direct: true };
}

/** Status (B5) while the bot works directly in B25 (`space`: {id, name}). Pure. */
function directB25StatusText_(space) {
  return `${okStatusText_()} right in B25 (${(space && (space.name || space.id)) || 'B25'}) · 🧪 Testing (row 32)`;
}

/** C9 while the bot works directly in B25: what blank means, or that the Mirror space isn't used. Never throws. */
function directB25MirrorOff_(control, wanted) {
  try {
    if (control) {
      writeMirrorNote_(control, String((wanted && wanted.mirror) || '').trim() ? `⏸ ${DIRECT_B25_NOT_USED_}` : MIRROR_HINT_);
    }
  } catch (e) {
    console.error('could not write C9 (Mirror space): ' + ((e && e.message) || e));
  }
  return null;
}

/**
 * No Burson test copy while the bot works directly in B25 (Config.gs setTestCopy_(null)): treated as blank, and C26 says
 * so when it's set. Never throws.
 */
function directB25TestCopyOff_(control, wanted) {
  setTestCopy_(null);
  const set = !!String((wanted && wanted.testCopy) || '').trim();
  try {
    if (control) writeTestCopyNote_(control, set ? `⏸ ${DIRECT_B25_NOT_USED_}` : RTC_BLANK_NOTE_);
  } catch (e) {
    console.error('could not write C26 (Burson test copy): ' + ((e && e.message) || e));
  }
  return { space: null, blank: true, error: '', note: '' };
}

/**
 * A run's ctx. switches: the Control tab's (readControl_); left out, they're read from the tab now. cfg.sfBurson: this
 * run's S-F Burson (Control tab B25, sfBursonFor_), or null/missing when none is known. cfg.mode: this run's mode
 * (runMode_); missing, the auto-correct flow (cfg.sourceReadOnly) or the Other alerts space (cfg.otherSpace) is Testing:
 * every email only to the testers (B30, else the stand-in), the test copy of the T&S form, nothing for the leads.
 */
function buildCtx_(cfg, ss, switches) {
  const sw = Object.assign(switchesOff_(), switches || readSwitches_(ss ? controlTab_(ss) : null));
  if (ss && typeof syncBrandSafetyGroups_ === 'function') syncBrandSafetyGroups_(ss, sw.bsgTestEmails ? { force: true } : null);
  const props = PropertiesService.getScriptProperties();
  const settings = Object.assign({}, GEN.settings);
  const email = Session.getEffectiveUser().getEmail();
  const readOnly = !!cfg.sourceReadOnly;  // the auto-correct test space (AutoCorrect.gs): the Burson space is only read
  const otherSpace = !!cfg.otherSpace && !readOnly;  // the Other alerts space (OtherSpace.gs, B33): never LIVE
  const sfBurson = cfg.sfBurson && cfg.sfBurson.id ? cfg.sfBurson : null;
  const live = !!(cfg.mode && cfg.mode.live === true) && !readOnly && !otherSpace;
  setRunLive_(live);  // Config.gs: for the code without a ctx (the T&S form link), this flow's mode
  const testers = live ? []
    : (cfg && Array.isArray(cfg.testers) && cfg.testers.length
      ? onlyToList_(cfg.testers)
      : testersFor_(ss ? readTestersCell_(controlTab_(ss)) : '').testers);
  const standIn = live ? '' : testers.join(', ');
  const b30Blank = !live && !testers.length && !sw.bsgTestEmails;
  const allowedTo = live ? [] : sw.bsgTestEmails
    ? bsgMergeUnique_(testers, typeof bsgAllowedTestEmails_ === 'function' ? bsgAllowedTestEmails_() : [])
    : testers;
  const outboundBlocked = !!cfg.outboundBlocked;
  let store = null;
  let resources = null;
  let guidance = null;
  let knowledge = null;
  let learned = null;
  const ns = readOnly ? 'AC:' : '';  // its own cursor, memory and message rows, apart from the other run's
  const cursorKey = ns + 'CURSOR:' + cfg.burson.id;
  const memoKey = k => `${ns}MEMO:${outboundBlocked ? cfg.burson.id : cfg.analyst.id}:${k}`;
  const partition = outboundBlocked ? `${cfg.burson.id} > (isolated)${otherSpace ? OS_PARTITION_SUFFIX_ : ''}`
    : `${cfg.burson.id} > ${cfg.analyst.id}${readOnly ? AC_PARTITION_SUFFIX_ : ''}`;
  const ctx = {
    settings,
    switches: sw,  // rows 11-24, 27-29, 32, 34 and 36-40: OFF unless ON there
    outboundBlocked,
    b30Blank,
    // Work directly in B25 (Control row 32, directCfg_), or the Other alerts space (B33, otherSpaceCfg_): one Google-only
    // space, no Burson in it; its posts aren't held to the Burson guard, alerts of any format are reviewed
    // (OtherAlerts.gs), and answers use the whole knowledge base
    direct: !!cfg.direct && !readOnly,
    otherSpace,  // the Other alerts space (B33): always Testing, and its alerts never on the Results tab nor in the SLRR tables
    sourceReadOnly: readOnly,  // nothing is posted or marked in the Burson space; the corrected alert is the alert
    changeNotes: readOnly,     // the corrected alert goes out on its own, with what changed in its thread
    flowTag: readOnly ? AC_TAG_ : otherSpace ? OS_TAG_ : '',  // on its stand-in emails and DMs, to tell them apart from the Mirror's
    partition,
    spaces: { burson: cfg.burson, analyst: cfg.analyst },
    sfBurson,  // this run's S-F Burson (Control tab B25): {id, name, externalUserAllowed}, or null when none is known
    get store() {  // the log tabs are only read when a run has something new to look up
      // amStoreObserver_ (AlertMemory.gs): the shared alert memory sees every row this store reads (every space's) or adds
      if (!store) store = makeStore_(sheetBackend_(ss), () => Date.now(), partition, readOnly ? 'ac|' : '', amStoreObserver_());
      return store;
    },
    get resources() {  // the Resources tab, read only when someone asks a question
      if (!resources) {
        try { resources = readResourceRows_(ss); } catch (e) { console.error('could not read the Resources tab: ' + e); resources = []; }
      }
      return resources;
    },
    get guidance() {  // the leads' current guidance (Guidance tab + their recent emails), read when an alert is reviewed
      if (!guidance) {
        let rows = [];
        try { rows = readGuidanceRows_(ss, Date.now()); } catch (e) { console.error('could not read the Guidance tab: ' + e); }
        guidance = rows.concat(leadGuidanceEmails_(this));
      }
      return guidance;
    },
    get knowledge() {  // the knowledge base (Knowledge.gs): the Resources tab's documents, read when a review or answer needs them
      if (!knowledge) {
        try { knowledge = loadKnowledge_(ss); } catch (e) { console.error('could not read the knowledge base: ' + e); knowledge = { docs: [] }; }
      }
      return knowledge;
    },
    get learned() {  // Learn from IM calls (row 17): the Learned precedents tab (Speed.gs), read once a run, only while it's ON
      if (!switchOn_(this, 'learnIm')) return [];
      if (!learned) {
        try { learned = readLearnedPrecedents_(ss); } catch (e) {
          console.error('could not read the Learned precedents tab: ' + e);
          learned = [];
        }
      }
      return learned;
    },
    post: url => lookupPost_(url),  // the post itself (Post.gs): its words, thread, quote, video and photos
    chat: null,  // below: guardedChat_, with S-F Burson only through the Burson outbox
    gemini: geminiClient_(),
    // Testing: Gmail refuses anyone not on the tester list (or Brand safety groups test emails when row 37 is ON). LIVE: real recipients
    gmail: gmailClient_({ onlyTo: live ? '' : (allowedTo.length ? allowedTo : [NOBODY_EMAIL_]) }),
    bq: parsed => enrichAlertFromBigQuery_(parsed, settings),
    bqEngagement: url => bqPostEngagement_(url, settings),  // Watch sent alerts (Watch.gs): the post's count in Sonar
    findLink: parsed => bqFindMissingLink_(parsed),  // Auto-find missing links (Control row 14): called only while it's ON
    live,  // this run is LIVE (runMode_; never the auto-correct flow nor the Other alerts space)
    drafts: {
      on: !settings.dry_run,
      live,
      mailbox: email,
      from: `${GEN.email.from_name} <${live && GEN.email.from_email ? GEN.email.from_email : email}>`,
      standIn,  // Testing: every email (and the escalation-protocol message) goes only here; '' while LIVE
      testers,
    },
    cursor: { get: () => Number(props.getProperty(cursorKey)) || null, set: ms => props.setProperty(cursorKey, String(ms)) },
    recent: recentCache_(ns + cfg.burson.id),
    memo: { get: k => props.getProperty(memoKey(k)), set: (k, v) => props.setProperty(memoKey(k), String(v)), delete: k => props.deleteProperty(memoKey(k)) },
    floor: Number(props.getProperty(ns + 'FLOOR:' + cfg.burson.id)) || 0,
    now: () => Date.now(),
    deadline: Date.now() + RUN_BUDGET_MS_,
    botUser: props.getProperty('BOT_USER') || null,
    log: text => console.log(text),
  };
  // Post in S-F Burson (Control row 24, Outbox.gs): what this run would write in S-F Burson is withheld (OFF, or Testing)
  // or queued on the Burson outbox tab (ON and LIVE), by the run's own switches, and only ever for this run's S-F Burson
  ctx.outbox = bursonOutbox_(ss, () => ctx.switches, sfBurson ? sfBurson.id : '', () => ctx.live === true);
  ctx.chat = guardedChat_(cfg, settings, ctx.outbox);
  // The shared alert memory (AlertMemory.gs): this run's, for every flow (one that knows nothing outside poll())
  ctx.memory = alertMemory_();
  return ctx;
}

/** After a pause, start from now; after switching the Burson space, start from a few minutes ago (no old backlog). */
function startFrom_(props, cfg, ctx) {
  const now = Date.now();
  const floorKey = 'FLOOR:' + cfg.burson.id;
  const setFloor = ms => {
    if (!(ctx.cursor.get() >= ms)) ctx.cursor.set(ms);
    if (!(Number(props.getProperty(floorKey)) >= ms)) props.setProperty(floorKey, String(ms));
    ctx.floor = Math.max(ctx.floor || 0, ms);
  };
  if (props.getProperty('PAUSED') === 'true') {
    props.deleteProperty('PAUSED');
    setFloor(now - 60 * 1000);
  }
  if (props.getProperty('LAST_BURSON_SPACE') !== cfg.burson.id) {
    setFloor(now - ctx.settings.start_lookback_minutes * 60 * 1000);
    props.setProperty('LAST_BURSON_SPACE', cfg.burson.id);
  }
}

/**
 * Chat calls limited to the configured spaces (and strictly to the training space when outbounds are blocked). S-F
 * Burson (cfg.sfBurson: the Control tab's B25, this run) is never written from here: a post, thread reply or reaction
 * there goes to `outbox` (bursonOutbox_, Outbox.gs), which withholds it while Post in S-F Burson (Control row 24) is OFF
 * and otherwise queues it on the Burson outbox tab for a person to set Send. Without an outbox, it's withheld. Any other
 * space people outside Google can join (the Burson space, B3, can be one: B25 blank, not found or another space) is
 * never written at all: each post or reaction there is held back like Post in S-F Burson OFF (nothing written or queued;
 * the run log counts it). Either way the caller goes on as if it was done: post() returns null (no message yet), so
 * nothing fails or is retried.
 */
function guardedChat_(cfg, settings, outbox) {
  const sfb = cfg.sfBurson && cfg.sfBurson.id ? cfg.sfBurson : null;
  const isSfb = space => isSfBurson_(sfb, space);
  // a space people outside Google can join that isn't S-F Burson, whichever cell it came from: nothing goes there
  const outside = space => !isSfb(space) && [cfg.burson, cfg.analyst].some(s => !!s && s.id === space && !!s.externalUserAllowed);
  const canWrite = space => {
    if (cfg.outboundBlocked) return space === cfg.burson.id && !isSfb(space) && !settings.dry_run;
    // the auto-correct test space: only that space, never the Burson space it reads
    if (cfg.sourceReadOnly) return space === cfg.analyst.id && space !== cfg.burson.id && !isSfb(space);
    return space === cfg.analyst.id || (space === cfg.burson.id && !settings.dry_run);
  };
  const toBurson = write => {
    if (outbox) outbox.add(write); else outboxWithheld_(write);
    return null;
  };
  const heldBack = write => {
    outboxHeldBack_(write);
    return null;
  };
  return {
    list: (space, sinceIso, max, newestFirst) => chatListMessages_(space, sinceIso, max, newestFirst),
    post(space, text, opts) {
      if (!canWrite(space)) throw new Error(`Refusing to post in ${space}: it isn't one of the allowed spaces.`);
      if (isSfb(space) || outside(space)) {
        const o = opts || {};
        const write = { kind: o.thread ? 'reply' : 'post', text, thread: o.thread || '', key: o.key || '', prefix: o.idPrefix || '', from: 'bot' };
        return isSfb(space) ? toBurson(write) : heldBack(write);
      }
      const msg = chatPostMessage_(space, text, opts);
      rememberBotUser_(msg);
      return msg;
    },
    react(messageName, emoji) {
      const space = String(messageName).split('/messages/')[0];
      if (!canWrite(space)) throw new Error(`Refusing to react in ${space}.`);
      if (isSfb(space)) return toBurson({ kind: 'reaction', message: String(messageName), emoji, from: 'bot' });
      if (outside(space)) return heldBack({ kind: 'reaction', message: String(messageName), emoji, from: 'bot' });
      return chatReact_(messageName, emoji);
    },
    /**
     * 🧑‍💻 escalation-protocol DM. Testing (runMode_; always the auto-correct flow): only to the testers. LIVE: only to
     * the protocol's leads. True if sent.
     */
    dm(email, text, key) {
      const who = String(email || '').trim().toLowerCase();
      if (!who || settings.dry_run) return false;
      const testers = cfg && Array.isArray(cfg.testers) && cfg.testers.length ? onlyToList_(cfg.testers) : testersFor_('').testers;
      const leads = ((GEN.leadership && GEN.leadership.recipients) || []).map(e => String(e).toLowerCase());
      const live = !!(cfg.mode && cfg.mode.live === true) && !cfg.sourceReadOnly && !cfg.otherSpace;
      if (live ? !leads.includes(who) : !testers.includes(who)) return false;
      const space = chatFindDm_(who);
      if (!space) return false;
      chatPostMessage_(space, text, { key });
      return true;
    },
  };
}

/** Messages handled lately (kept for a few hours), so a quiet run doesn't need to open the log tabs. */
function recentCache_(bursonId) {
  const cache = CacheService.getScriptCache();
  const key = 'recent:' + bursonId;
  let map = {};
  try { map = JSON.parse(cache.get(key) || '{}') || {}; } catch (e) { map = {}; }
  let dirty = false;
  return {
    has: name => Object.prototype.hasOwnProperty.call(map, name),
    add(name, ms) { if (name && !this.has(name)) { map[name] = ms || Date.now(); dirty = true; } },
    save() {
      if (!dirty) return;
      const cutoff = Date.now() - 6 * 3600 * 1000;
      const keep = {};
      Object.keys(map).filter(k => map[k] >= cutoff).sort((a, b) => map[b] - map[a]).slice(0, 800).forEach(k => { keep[k] = map[k]; });
      cache.put(key, JSON.stringify(keep), 6 * 3600);
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------------------------------------------

/**
 * The Control tab's two spaces, opened and checked (cached for an hour unless `fresh`), with `sfb` this run's S-F Burson
 * (B25: {id}, or null when none is known). On a problem, throws an error that also carries `notes` (column C for each
 * space: ✓ and its name, or ✗) and `safeAnalyst` (the analyst space if it passed its checks, so analysts can still be
 * told that alerts aren't flowing; otherwise null).
 */
function resolveSetup_(wanted, fresh, sfb) {
  const cache = CacheService.getScriptCache();
  const key = 'spaces:' + hashText_(JSON.stringify([wanted.burson, wanted.analyst, (sfb && sfb.id) || '']));
  if (!fresh) {
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  }
  const found = {};
  const notes = {};
  const problems = [];
  ['burson', 'analyst'].forEach(role => {
    try {
      found[role] = resolveSpace_(wanted[role], role, fresh);
      notes[role] = '✓ ' + found[role].name;
    } catch (e) {
      problems.push(e.message);
      notes[role] = '✗ check this link';
    }
  });
  const check = checkSpacePair_(found.burson, found.analyst, sfb);
  check.bad.forEach(role => { notes[role] = '✗ see Status'; });
  problems.push.apply(problems, check.problems);
  if (problems.length) {
    const err = new Error(problems.join(' '));
    err.setupProblem = true;
    err.notes = { bursonNote: notes.burson, analystNote: notes.analyst };
    err.safeAnalyst = found.analyst && check.bad.indexOf('analyst') < 0 ? found.analyst : null;
    throw err;
  }
  const out = { burson: found.burson, analyst: found.analyst };
  cache.put(key, JSON.stringify(out), 3600);
  return out;
}

/**
 * This run's S-F Burson: the Control tab's B25 (`wanted.sfBurson`), resolved once, like the other space cells (a link,
 * spaces/ID, the bare ID or the exact name; cached for an hour unless `fresh`): {space: {id, name, externalUserAllowed}
 * or null, blank, error}. Sets it as the run's S-F Burson (Config.gs setSfBurson_, for Chat.gs and every flow) and, with
 * `control`, writes C25: ✓ and the space's name, ✗ and what to fix, or what blank means. Never throws: anything that
 * goes wrong means no S-F Burson is known (fail closed).
 */
function sfBursonFor_(control, wanted, fresh) {
  const value = String((wanted && wanted.sfBurson) || '').trim();
  let out;
  if (!value) {
    out = { space: null, blank: true, error: '', note: SFB_BLANK_NOTE_ };
  } else {
    try {
      const space = resolveSfBurson_(value, fresh);
      out = { space, blank: false, error: '', note: '✓ ' + space.name };
    } catch (e) {
      const error = String((e && e.message) || e).trim();
      out = { space: null, blank: false, error, note: '✗ ' + error };
    }
  }
  setSfBurson_(out.space);
  if (control) {
    try {
      writeSfBursonNote_(control, out.note);
    } catch (e) {
      console.error('could not write C25 (S-F Burson space): ' + ((e && e.message) || e));
    }
  }
  return out;
}

/** B25 (link, id or exact name) -> {id, name, externalUserAllowed}, or an error that says what to fix. */
function resolveSfBurson_(value, fresh) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'sfb_space:' + hashText_(String(value));
  if (!fresh) {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  }
  const ref = parseSpaceRef_(value, 'The S-F Burson space');
  let id = ref.id;
  if (!id) {
    const props = PropertiesService.getScriptProperties();
    const prop = 'SPACE_ID:' + ref.name;
    id = (!fresh && props.getProperty(prop)) || findSpaceByName_(ref.name, 'S-F Burson space');
    props.setProperty(prop, id);
  }
  let s;
  try {
    s = chatGetSpace_(id);
  } catch (e) {
    throw new Error(`Can't open ${id}. Check the link, and that ${Session.getEffectiveUser().getEmail()} is a member of that space.`);
  }
  const out = { id: s.name, name: s.displayName || s.name, externalUserAllowed: !!s.externalUserAllowed };
  cache.put(cacheKey, JSON.stringify(out), 3600);
  return out;
}

/** One Control-tab cell (link, id or exact name) -> {id, name, externalUserAllowed}, or an error that says what to fix. */
function resolveSpace_(value, role, fresh) {
  const label = role === 'burson' ? 'Burson space' : 'analyst space';
  const ref = parseSpaceRef_(value, 'The ' + label);
  try {
    let id = ref.id;
    if (!id) {
      const props = PropertiesService.getScriptProperties();
      const prop = 'SPACE_ID:' + ref.name;
      id = (!fresh && props.getProperty(prop)) || findSpaceByName_(ref.name, label);
      props.setProperty(prop, id);
    }
    const s = chatGetSpace_(id);
    return { id: s.name, name: s.displayName || s.name, externalUserAllowed: !!s.externalUserAllowed };
  } catch (e) {
    throw new Error(/^No space named|spaces are named/.test(e.message) ? e.message
      : `Can't open the ${label} (${ref.id || ref.name}). Check the link, and that ${Session.getEffectiveUser().getEmail()} ` +
        'is a member of that space.');
  }
}

function findSpaceByName_(name, label) {
  const want = name.trim().toLowerCase();
  const matches = chatListSpaces_().filter(s => String(s.displayName || '').trim().toLowerCase() === want);
  if (matches.length === 1) return matches[0].name;
  if (!matches.length) throw new Error(`No space named "${name}" (${label}). Paste the space's link instead.`);
  throw new Error(`${matches.length} spaces are named "${name}" (${label}). Paste the space's link instead.`);
}

/** The analyst space of the last good run: where a failure notice goes if the bot's sheet can't even be read. */
function rememberAnalystSpace_(cfg) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_ANALYST_SPACE') !== cfg.analyst.id) props.setProperty('LAST_ANALYST_SPACE', cfg.analyst.id);
  // its name too: the relay (Relay.gs) never lets it reach S-F Burson
  if (cfg.analyst.name && props.getProperty('LAST_ANALYST_NAME') !== cfg.analyst.name) props.setProperty('LAST_ANALYST_NAME', cfg.analyst.name);
}

function rememberBotUser_(msg) {
  if (!msg || !msg.senderName) return;
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('BOT_USER')) props.setProperty('BOT_USER', msg.senderName);
}

// ---------------------------------------------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------------------------------------------

function nowLabel_() { return Utilities.formatDate(new Date(Date.now()), GEN.timezone, 'MMM d, h:mm a z'); }

function dayKey_() { return Utilities.formatDate(new Date(Date.now()), GEN.timezone, 'yyyy-MM-dd'); }

function readStats_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(STATS_PROP_) || 'null'); } catch (e) { return null; }
}

function removeTriggers_(handlers) {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (handlers.indexOf(t.getHandlerFunction()) >= 0) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

/**
 * Deletes the project's triggers for a handler in ORPHAN_HANDLERS_ whose function isn't in this project (never one whose
 * function exists), at most every ORPHAN_SWEEP_SEC_. Only the bot's own account's triggers can be seen and deleted
 * (another account's: that account, on the editor's Triggers page). How many it deleted. Never throws. Nothing to do,
 * and nothing read, while ORPHAN_HANDLERS_ is empty.
 */
function sweepOrphanTriggers_() {
  if (!ORPHAN_HANDLERS_.length) return 0;
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('ORPHAN_TRIGGER_SWEEP')) return 0;
    cache.put('ORPHAN_TRIGGER_SWEEP', String(Date.now()), ORPHAN_SWEEP_SEC_);
    const scope = typeof globalThis !== 'undefined' ? globalThis : {};
    let n = 0;
    ScriptApp.getProjectTriggers().forEach(t => {
      const h = t.getHandlerFunction();
      if (ORPHAN_HANDLERS_.indexOf(h) < 0 || typeof scope[h] === 'function') return;
      ScriptApp.deleteTrigger(t);
      n++;
      console.log(`deleted the orphan trigger for ${h}: its function isn't in this project, so it could only fail`);
    });
    return n;
  } catch (e) {
    console.warn('orphan trigger sweep skipped: ' + ((e && e.message) || e));
    return 0;
  }
}

// The slide deliveries' time trigger (Control row 55; its handler, dashDeliverDue, is in SlideDeliveries.gs and takes its
// own claim, never the poll's lock): one, every 5 minutes, kept by poll() while row 55 is ON and removed while it's OFF.
// SLIDE_TRIGGER_PROP_ says poll() made one (the time it did), so a run with row 55 OFF and none made reads the triggers
// not at all
const SLIDE_TRIGGER_HANDLER_ = 'dashDeliverDue';
const SLIDE_TRIGGER_EVERY_MIN_ = 5;
const SLIDE_TRIGGER_PROP_ = 'SLIDE_TRIGGER';

/**
 * The live dashboard's and the slide deliveries' upkeep, at the end of a run (`switches`: the run's, readControl_;
 * `run`: {live (this run's mode: runMode_), start (when this run started: before its mode was decided and before any
 * of its sends)}): with row 54 ON, the dashboard's build id in the property BOT_BUILD (pollBuildUpkeep_); the
 * deliveries' trigger as row 55 says (pollSlideTriggerUpkeep_); with row 55 ON, the run's mode kept from its start
 * (SlideDeliveries.gs slideModeNote_: a slide says whether a Social Alert went to the teams or only to the testers); the
 * run that finds row 55 turned OFF (it removes the trigger) marks the mode record "not kept" from its start
 * (slideModeGap_), so sends while row 55 is OFF are never put under the last mode kept. (C55 while the bot is paused is
 * written with the other switches' column C: writeSwitchStatuses_.) With both OFF and no deliveries trigger made: one
 * property read (SLIDE_TRIGGER), no write and no trigger call. {build, trigger, mode}: what each did ('' when it did
 * nothing). Never throws.
 */
function pollDashboardUpkeep_(switches, run) {
  const out = { build: '', trigger: '', mode: '' };
  const r = run || {};
  const slidesOn = !!(switches && switches.slideDeliveries === true);
  try {
    if (switches && switches.liveDashboard === true) out.build = pollBuildUpkeep_();
  } catch (e) {
    console.error('live dashboard (row 54): could not write the build id: ' + ((e && e.message) || e));
  }
  try {
    out.trigger = pollSlideTriggerUpkeep_(slidesOn);
  } catch (e) {
    console.error('slide deliveries (row 55): could not keep the delivery trigger: ' + ((e && e.message) || e));
  }
  const start = Number(r.start) > 0 ? Number(r.start) : Date.now();
  if (slidesOn) out.mode = slideModeNote_(r.live, start);
  else if (out.trigger === 'removed') out.mode = slideModeGap_(start);
  return out;
}

// C55 while row 55 is ON and the bot is paused (Control B2 OFF): nothing is delivered then
const SLIDE_PAUSED_ON_TEXT_ = '✓ ON, but paused: the bot is OFF (Control B2), so no pulse slides are delivered until it is ON again';

/**
 * Row 54 ON: the dashboard's build id (Dashboard.gs DASH_BUILD_) in the property BOT_BUILD, written only when it is not
 * there yet (one write after each push of new dashboard code). The web app compares its own copy with it. 'written' or
 * 'same'.
 */
function pollBuildUpkeep_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(DASH_BUILD_PROP_) === DASH_BUILD_) return 'same';
  props.setProperty(DASH_BUILD_PROP_, DASH_BUILD_);
  return 'written';
}

/**
 * The slide deliveries' time trigger: `on` (row 55 ON) keeps exactly one (made when there is none, any extra deleted);
 * OFF deletes every one, only when SLIDE_TRIGGER_PROP_ says poll() made one (otherwise no trigger call at all). Only the
 * bot's own account's triggers are seen. 'made', 'kept', 'removed' or '' (nothing to do).
 */
function pollSlideTriggerUpkeep_(on) {
  const props = PropertiesService.getScriptProperties();
  const made = !!props.getProperty(SLIDE_TRIGGER_PROP_);
  if (!on && !made) return '';
  const mine = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === SLIDE_TRIGGER_HANDLER_);
  if (!on) {
    mine.forEach(t => ScriptApp.deleteTrigger(t));
    props.deleteProperty(SLIDE_TRIGGER_PROP_);
    console.log(`slide deliveries (row 55) is OFF: removed ${mine.length} delivery trigger${mine.length === 1 ? '' : 's'}`);
    return 'removed';
  }
  mine.slice(1).forEach(t => ScriptApp.deleteTrigger(t));
  if (!made) props.setProperty(SLIDE_TRIGGER_PROP_, String(Date.now()));
  if (mine.length) return 'kept';
  ScriptApp.newTrigger(SLIDE_TRIGGER_HANDLER_).timeBased().everyMinutes(SLIDE_TRIGGER_EVERY_MIN_).create();
  console.log(`slide deliveries (row 55) is ON: made the delivery trigger (every ${SLIDE_TRIGGER_EVERY_MIN_} minutes)`);
  return 'made';
}

/**
 * Clears everything the archived prototype kept in script properties. The V1 bot uses none of it, and the
 * prototype's install() starts fresh if it's ever brought back:
 *   PROCESSED_…, PROCESSED_RING, SELF_POST_…   one "already handled" marker per message (grew with every message)
 *   ONCALL_IM, ONCALL_BURSON                    the last shift sign-in/sign-off message it saw, not a setting
 *   CASE_…, CASE_SEQ, RECENT_CASES, THREAD_…    its case records
 *   MY_EMAIL, MY_USER_NAME, CLEAN_SPACE_ID, SOURCE_SPACE_ID, REACT_IN_LIVE_BURSON   its own setup
 */
const PROTOTYPE_PROPERTY_ = /^(?:PROCESSED_|SELF_POST_|ONCALL_|CASE_|THREAD_)|^(?:RECENT_CASES|MY_EMAIL|MY_USER_NAME|CLEAN_SPACE_ID|SOURCE_SPACE_ID|REACT_IN_LIVE_BURSON)$/;

function deletePrototypeState_() {
  const props = PropertiesService.getScriptProperties();
  const keys = props.getKeys().filter(k => PROTOTYPE_PROPERTY_.test(k));
  keys.forEach(k => props.deleteProperty(k));
  return keys.length;
}

/**
 * Counts a failed run. From FAIL_NOTICE_AT_ failed runs in a row, analysts (never Burson) are told once that alerts
 * aren't flowing, and again every 60 runs. The notice only goes to an analyst space that passed the checks: never to a
 * space the Control tab got wrong.
 */
function healthFail_(e, cfg) {
  const props = PropertiesService.getScriptProperties();
  const streak = Number(props.getProperty('FAIL_STREAK') || 0) + 1;
  props.setProperty('FAIL_STREAK', String(streak));
  const told = props.getProperty('FAIL_NOTICE') === 'true';
  if (streak < FAIL_NOTICE_AT_ || (told && streak % 60 !== 0)) return;
  let analystId;
  if (cfg) analystId = cfg.analyst.id;
  else if (e && e.setupProblem) analystId = e.safeAnalyst ? e.safeAnalyst.id : null;  // a problem on the Control tab
  else analystId = props.getProperty('LAST_ANALYST_SPACE');                            // the sheet couldn't be read
  if (!analystId) return;
  const sheetId = props.getProperty(STORE_SHEET_PROP_);
  try {
    const statusUrl = sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}` : '';
    chatPostMessage_(analystId, `The Burson QA bot has had problems for ${streak} runs in a row, so alerts may ` +
      `not be reviewed or forwarded right now.\n` +
      `- Last error: ${truncate_(String((e && e.message) || e), 300)}` +
      (statusUrl ? `\n- Status and controls: ${typeof chatLink_ === 'function' ? chatLink_(statusUrl, 'Control Sheet') : statusUrl}` : ''), {});
    props.setProperty('FAIL_NOTICE', 'true');
  } catch (err) {
    console.error('could not post the failure notice: ' + err);
  }
}

function healthOk_(ctx) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FAIL_STREAK') !== null && props.getProperty('FAIL_STREAK') !== '0') props.setProperty('FAIL_STREAK', '0');
  if (props.getProperty('FAIL_NOTICE') !== 'true') return;
  props.deleteProperty('FAIL_NOTICE');
  try {
    ctx.chat.post(ctx.spaces.analyst.id, 'The Burson QA bot is running again and catching up on alerts.', {});
  } catch (e) {
    console.error('could not post the recovery notice: ' + e);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Run owner. The script lock alone doesn't keep the next run out of a long one: runs that went past ~7 minutes saw
// the next minute's run start beside them, and both handled the same alert. So poll() also claims the script
// property RUN_OWNER ({id, started}) right after taking the lock, and a run that finds another run's claim younger
// than RUN_OWNER_MAX_MS_ returns without doing anything. The run checks it again before each message (Bot.gs
// runOnce_) and before each email send or draft (Drafts.gs): once another run took over (an older claim is a run that
// died), this one handles and sends nothing more. The claim is cleared at the end of the run that holds it.
//
// A run Apps Script ends outright (out of memory, its time limit, an internal error) never clears its claim, but it does
// let go of the script lock: Oct 24-26, the trigger a minute after each crash got the lock, while the one during the
// crashing run's first minute didn't. The run that made a claim holds the lock from before making it until after
// clearing it, so a claim younger than RUN_OWNER_LOCK_TRUST_MS_ (well within the lock's ~7 minutes) found by a run that
// got the lock is a run that ended: it's taken over at once, instead of every run standing still until the claim is
// RUN_OWNER_MAX_MS_ old (Oct 24-26: 25 minutes after each crash). An older claim is one the lock can't vouch for, and
// waits as before. A run that takes over from a run that ended counts that run as failed (healthFail_), so crashes in a
// row reach analysts the way errors in a row do.
// ---------------------------------------------------------------------------------------------------------------

const RUN_OWNER_PROP_ = 'RUN_OWNER';
const RUN_OWNER_MAX_MS_ = 25 * 60 * 1000;  // a claim this old is a run that died or was stopped (runs have lasted ~20 min)
const RUN_OWNER_LOCK_TRUST_MS_ = 4 * 60 * 1000;  // younger, with the script lock free, is a run that ended (see above)
let runId_ = '';                           // this execution's claim while poll() runs ('' outside poll(): setup, the editor)
let runLostLogged_ = false;                // the run log already says this run lost it
let runTookOver_ = null;                   // the claim a run that ended left, when this run took over from it

/** This execution's claim while poll() runs, '' outside poll() (setup, the editor, a run built by hand). */
function currentRunId_() { return runId_; }

/**
 * Right after poll() took the script lock: claims the run for this execution and returns true, unless another run that
 * started less than RUN_OWNER_MAX_MS_ ago still holds it (false: nothing is done this time). A claim younger than
 * RUN_OWNER_LOCK_TRUST_MS_ is a run that ended (it would still hold the lock this run got) and is taken over, as is
 * one older than RUN_OWNER_MAX_MS_: runTookOver_ is then that claim. A claim that can't be read is taken over. One that
 * can't be written leaves this run not holding it, so it handles no message and sends nothing (runOwned_); it tries
 * again next minute.
 */
function claimRun_(startMs) {
  const props = PropertiesService.getScriptProperties();
  let owner = null;
  try { owner = JSON.parse(props.getProperty(RUN_OWNER_PROP_) || 'null'); } catch (e) { owner = null; }
  const age = owner && owner.id ? startMs - Number(owner.started) : NaN;
  runTookOver_ = null;
  const ended = Math.abs(age) < RUN_OWNER_LOCK_TRUST_MS_;  // (a little ahead too: another server's clock)
  if (Math.abs(age) < RUN_OWNER_MAX_MS_ && !ended) {
    console.log(`run skipped: the run that started at ${runOwnerWhen_(owner)} is still going`);
    return false;
  }
  if (ended || age >= RUN_OWNER_MAX_MS_) {
    runTookOver_ = owner;
    console.log(`the run that started at ${runOwnerWhen_(owner)} ended without finishing ` +
      `(${ended ? 'it no longer holds the script lock' : `its claim is ${Math.round(age / 60000)} minutes old`}): this run takes over`);
  }
  runId_ = `${startMs}-${Math.random().toString(36).slice(2, 10)}`;
  runLostLogged_ = false;
  try {
    props.setProperty(RUN_OWNER_PROP_, JSON.stringify({ id: runId_, started: startMs }));
  } catch (e) {
    console.error('could not claim the run, so it handles no alert this time: ' + ((e && e.message) || e));
  }
  return true;
}

/**
 * Whether this execution still holds the run (RUN_OWNER): checked before each message (Bot.gs runOnce_) and before each
 * email send or draft (Drafts.gs). Always true outside poll() (setup, the editor, the tests). False once another run
 * took over, or when the claim can't be read (nothing is sent on a guess: the next run does it); the run log says so
 * the first time.
 */
function runOwned_() {
  if (!runId_) return true;
  let owner = null;
  try {
    owner = JSON.parse(PropertiesService.getScriptProperties().getProperty(RUN_OWNER_PROP_) || 'null');
  } catch (e) {
    owner = null;
  }
  if (owner && owner.id === runId_) return true;
  if (!runLostLogged_) {
    runLostLogged_ = true;
    console.log(owner && owner.id
      ? `another run (started ${runOwnerWhen_(owner)}) took over: this one handles and sends nothing more`
      : 'this run no longer holds RUN_OWNER: it handles and sends nothing more');
  }
  return false;
}

/** When a RUN_OWNER claim's run started, for the run log ('?' when the claim doesn't say). Pure. */
function runOwnerWhen_(owner) {
  const d = new Date(Number(owner && owner.started));
  return isNaN(d.getTime()) ? '?' : d.toISOString();
}

/** The end of poll(): RUN_OWNER cleared if this run still holds it (a run that took over keeps its claim). Never throws. */
function releaseRun_() {
  const id = runId_;
  runId_ = '';
  if (!id) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const owner = JSON.parse(props.getProperty(RUN_OWNER_PROP_) || 'null');
    if (owner && owner.id === id) props.deleteProperty(RUN_OWNER_PROP_);
  } catch (e) {
    console.error('could not clear the run owner: ' + ((e && e.message) || e));
  }
}
