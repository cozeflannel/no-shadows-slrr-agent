/**
 * OpenEngine.gs — the open engine (Control row 51, key openEngine, OFF until a person turns it ON; step S2 of the
 * open-engine plan, as the requirements-first plan amends it): the protections every later step of that plan reads.
 * With row 51 OFF nothing here changes what the bot does: only the record of run time and outside calls (RUN_LEDGER)
 * runs, and it only records.
 *
 *   The record (always, row 51 ON or OFF): RUN_LEDGER holds 24 hourly buckets, rolling: each run's seconds (added in
 *   poll()'s finally), the outside calls it made (every UrlFetchApp request, each request of a fetchAll counted), the
 *   runs that found the lock taken (a cache counter each run adds to before it tries the lock, costed at
 *   open_lock_loss_seconds), and a run that died, counted by the run that takes over from its claim's start. Also the
 *   day's Burson pick-up times (alert posted to handled; p50 / p90; with Control row 56 ON also, on a list of their own,
 *   those but of the alerts posted before the bot came back after a stop, a pause or failing runs: openPickup_; the
 *   slow pick-up guard and C51 read the first list, as before) and, under row 51, the account type read once an
 *   Eastern day ("workspace" true or false: no part of the address is kept, logged or written). One property read and
 *   one write a run; it never throws.
 *   The budgets: trigger run time B = open_runtime_budget_hours (blank: 6 on a Workspace account, 1.5 on any other)
 *   less open_runtime_other_hours (at most half of it); outside calls = open_fetch_day (blank: 100,000 / 20,000).
 *   The graded steps on f = run time used in the last 24 hours / B (OE_STEPS_): from 0.80 only serious work starts,
 *   from 0.90 no background review or card, from 0.97 no background work at all (Burson's reserve). Outside calls: from
 *   0.70 no per-post quick look, from 0.90 no background work. Burson's reserve of outside calls (2x the calls of its
 *   busiest pass in 7 days, kept by Main.gs around runOnce_) comes off the day's calls first.
 *   The one safety stop: open_daily_stop background reviews an Eastern day (2,000); derived from it, 10x quick looks,
 *   100x Watch post checks, 1.5 GB x of background BigQuery bytes. At the stop no new background review, Watch card or
 *   Direct card starts until midnight ET; Burson's alerts are never counted and never stopped.
 *   Yield to Burson: before each background review or batch, one list of S-F Burson since the bot's cursor; a new post
 *   there ends background work for this run (the next minute's run takes it first). When the day's Burson pick-up p90
 *   passes open_burson_pickup_p90_s, each run's background time is cut by 30 s more (60 s at the most cut), until it
 *   recovers.
 *
 * What a later step calls (each never throws):
 *   openOn_()                          true while row 51 is ON this run, with row 19 ON (the run's switches,
 *                                      ewsRunSwitches_)
 *   openUsage_(now)                    {runSec, budgetSec, f, fetches, fetchBudget, reserve, ff, step, fetchStep,
 *                                      workspace, budgetFrom: 'setting' | 'account', counted, pickup: {p50, p90, n}}
 *                                      for the last 24 hours (step: 0-5, how many of OE_STEPS_ f has passed; fetchStep:
 *                                      0-2, of OE_FETCH_STEPS_)
 *   openMayStart_(kind, ctx, o)        {ok, why, wall}: may a background `kind` start now: 'review' (a story review, a
 *                                      Watch pre-read or alert triage, a Direct card review), 'card', 'quick' (a quick
 *                                      look), 'batch' (a batch of them); o.serious: P0 / P1 tag, Sensitive Topic, KOF or
 *                                      2,000+. Row 51 OFF: always {ok: true}
 *   openCountReview_(n)                counts n background reviews against the day's stop (and stops at it)
 *   openSerious_(row)                  an Early Detection signal is serious (P0 / P1, raised by a tag, a 2,000+ post)
 *   openCardSerious_(kind, x)          one of the bot's own cards is serious ('watch': KOF, 2,000+, P0 / P1, Sensitive
 *                                      Topic; 'direct': KOF, 2,000+)
 *   openQueueTopSerious_()             the review queue's next signal is serious
 *   openStopReached_()                 true while row 51 is ON and today's stop (or a derived ceiling) was reached
 *   openCheckHeld_()                   true when no Early Detection check may run (Burson's reserve)
 *   openHeldCause_(now)                'stop' / 'pace' when a background start was held so in the last 3 hours
 *   openCount_(kind, n)                counts toward a derived ceiling: 'ql' quick looks, 'wc' Watch post checks, 'gb'
 *                                      background BigQuery GB
 *   openYield_(ctx)                    true when S-F Burson has a new post since the cursor (background work ends)
 *   openShrinkMs_(usage)               the background time a run gives up while Burson's pick-up p90 is too slow (ms)
 *   openWall_(name)                    counts a wall hit today, once a run (C51's "walls hit")
 *   openC51Text_(now)                  the note of C51 (row 51 ON), at most 200 characters, warning first
 *   openC51Add_(fn)                    a later step adds a part to C51: fn(usage, day, now) -> '' or a short part (call
 *                                      it from run code, never at a file's top level: Apps Script loads files in order)
 */

const OE_LEDGER_PROP_ = 'RUN_LEDGER';
const OE_DAY_PROP_ = 'OPEN_DAY';               // the day's (ET) counts under row 51: {d, rev, ql, wc, gb, stop, w}
const OE_ENTRY_KEY_ = 'oe_entries:';           // + the hour (ms): runs that started, before the lock is tried (cache)
const OE_HOUR_MS_ = 3600 * 1000;
const OE_KEEP_HOURS_ = 24;
const OE_LEDGER_MAX_ = 8800;
const OE_PICKUPS_MAX_ = 60;                    // the day's Burson pick-up times kept (seconds), the latest
const OE_RESERVE_DAYS_ = 7;                    // Burson's reserve of outside calls: 2x the busiest Burson pass of 7 days
const OE_STEPS_ = [0.60, 0.70, 0.80, 0.90, 0.97];
const OE_FETCH_STEPS_ = [0.70, 0.90];
const OE_RUN_MAX_MS_ = 6 * 60 * 1000;          // a run that died is counted at most this long (Apps Script's limit)
const OE_SHRINK_MS_ = 30 * 1000;               // background time cut a run while Burson's pick-up p90 is too slow...
const OE_SHRINK_MAX_MS_ = 60 * 1000;           // ...at most this much
const OE_BG429_KEY_ = 'oe_bg429';              // row 51: background work waits this long after a 429 (cache)
const OE_BG429_MS_ = 10 * 60 * 1000;
const OE_WALL_WORDS_ = { gemini: 'Gemini busy', short: 'run short', burson: 'Burson first', guard: 'ApiGuard',
  pace: 'pace', bq: 'BigQuery slow', bw: 'Brandwatch login busy', storage: 'storage full', carried: 'grouping carried' };

let OE_RUN_ = null;      // this run: {start, fetches, inAll, counting, pickups: [], walls: {}, yielded, day, burson}
let OE_C51_PARTS_ = [];  // the parts later steps add to C51 (openC51Add_)
let OE_BG_ = false;      // true while background work runs (Gemini's web search protection)

/** True while Control row 51 is ON this run, with row 19 (Early Detection) ON: it needs it. Never throws. */
function openOn_() {
  try {
    if (typeof ewsRunSwitches_ !== 'function') return false;
    const sw = ewsRunSwitches_();
    return sw.openEngine === true && sw.earlyWave === true;
  } catch (e) {
    return false;
  }
}

/** The settings (config/default_config.yaml, open_*). Pure (reads GEN). */
function openCfg_() {
  const S = (typeof GEN !== 'undefined' && GEN && GEN.settings) || {};
  const num = (v, d) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? d : Number(v));
  return {
    stop: Math.max(1, Math.round(num(S.open_daily_stop, 2000))),
    budgetHours: num(S.open_runtime_budget_hours, null),
    otherHours: Math.max(0, num(S.open_runtime_other_hours, 1.5)),
    lockLossSec: Math.max(0, num(S.open_lock_loss_seconds, 2)),
    fetchDay: num(S.open_fetch_day, null),
    pickupP90: Math.max(1, num(S.open_burson_pickup_p90_s, 120)),
  };
}

/** The Eastern day of `ms` ("2026-11-17"). */
function openEtDay_(ms) {
  try {
    return Utilities.formatDate(new Date(Number(ms) || Date.now()), 'America/New_York', 'yyyy-MM-dd');
  } catch (e) {
    return new Date((Number(ms) || Date.now()) - 5 * OE_HOUR_MS_).toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The record of run time and outside calls (always)
// ---------------------------------------------------------------------------------------------------------------

/**
 * RUN_LEDGER: {v, h: [[hour ms, run s, calls, runs, entries]], a: {d, w}, p: [pickup s], pd, r: [[day, calls of the
 * day's busiest Burson pass]], nc: 1 when the calls could not be counted; and, only while Control row 56 is ON: pc
 * [pickup s, leaving out the alerts posted before the bot came back], pcd (its day), pcs (ms: the run it started at
 * that day)}. Never throws.
 */
function openLedger_(props) {
  // read once a run (the run's record, C51's note and the steps share it; it is written only at the run's end)
  if (OE_RUN_ && OE_RUN_.L) return OE_RUN_.L;
  let L0 = null;
  try { L0 = JSON.parse(props.getProperty(OE_LEDGER_PROP_) || 'null'); } catch (e) { L0 = null; }
  if (!L0 || typeof L0 !== 'object' || Array.isArray(L0)) L0 = {};
  const L = {};  // only what the ledger knows is kept: its size stays bounded by construction
  ['h', 'p', 'pd', 'r', 'nc', 'pc', 'pcd', 'pcs'].forEach(k => { if (L0[k] !== undefined) L[k] = L0[k]; });
  if (L0.a && typeof L0.a === 'object' && typeof L0.a.d === 'string') L.a = { d: L0.a.d.slice(0, 10), w: L0.a.w === 1 ? 1 : 0 };
  if (typeof L.pd !== 'string') delete L.pd;
  L.v = 1;
  L.h = Array.isArray(L.h) ? L.h.filter(b => Array.isArray(b) && Number(b[0]) > 0) : [];
  L.p = Array.isArray(L.p) ? L.p.map(Number).filter(x => isFinite(x) && x >= 0) : [];
  L.r = Array.isArray(L.r) ? L.r.filter(x => Array.isArray(x) && typeof x[0] === 'string' && isFinite(Number(x[1]))) : [];
  // Control row 56 only (kept while it is ON, dropped by a run with it OFF): openPickup_
  if (L.pc !== undefined) L.pc = Array.isArray(L.pc) ? L.pc.map(Number).filter(x => isFinite(x) && x >= 0) : [];
  if (L.pcd !== undefined && typeof L.pcd !== 'string') delete L.pcd;
  if (L.pcs !== undefined && !(Number(L.pcs) > 0)) delete L.pcs;
  if (OE_RUN_) OE_RUN_.L = L;
  return L;
}

/** Before poll() tries the lock: one more run started this hour (a cache counter; a run that loses the lock is counted). Never throws. */
function openEntry_() {
  try {
    const c = CacheService.getScriptCache();
    const key = OE_ENTRY_KEY_ + Math.floor(Date.now() / OE_HOUR_MS_) * OE_HOUR_MS_;
    c.put(key, String((Number(c.get(key)) || 0) + 1), 3 * 3600);
  } catch (e) { /* a lost count: the record is short by one run's two seconds */ }
}

/**
 * After the run's claim (Main.gs poll()): this run's record starts, and every outside call it makes is counted
 * (UrlFetchApp.fetch, and each request of a fetchAll), wrapped for the run and put back in its finally. When Apps
 * Script does not let the calls be wrapped, the record says the calls were not counted. Never throws.
 */
function openRunStart_(runStart) {
  OE_RUN_ = { start: Number(runStart) || Date.now(), fetches: 0, inAll: false, counting: false, pickups: [], walls: {}, yielded: false, burson: 0 };
  OE_BG_ = false;
  try {
    const u = UrlFetchApp;
    if (!u) return;
    if (u.__oe) { u.fetch = u.__oe.f; u.fetchAll = u.__oe.fa; delete u.__oe; }  // a wrap left behind: this run's own
    const f = u.fetch;
    const fa = u.fetchAll;
    const run = OE_RUN_;
    u.fetch = function () { if (run && !run.inAll) run.fetches++; return f.apply(u, arguments); };
    u.fetchAll = function (reqs) {
      if (run) { run.fetches += Array.isArray(reqs) ? reqs.length : 0; run.inAll = true; }
      try { return fa.apply(u, arguments); } finally { if (run) run.inAll = false; }
    };
    u.__oe = { f, fa };
    run.counting = u.fetch !== f;
  } catch (e) { /* not wrapped: counted as not counted */ }
}

/** Puts UrlFetchApp back as it was (poll()'s finally). Never throws. */
function openRunEnd_() {
  try {
    const u = UrlFetchApp;
    if (u && u.__oe) { u.fetch = u.__oe.f; u.fetchAll = u.__oe.fa; delete u.__oe; }
  } catch (e) { /* the next run finds it wrapped and leaves it */ }
}

/** The outside calls this run made so far (0 before the run's record starts). Never throws. */
function openFetches_() {
  return (OE_RUN_ && Number(OE_RUN_.fetches)) || 0;
}

/**
 * After Burson's pass (Main.gs, around runOnce_): the outside calls it made since `before` (openFetches_), kept for the
 * run's record: the busiest pass of the last 7 days, doubled, is Burson's reserve of outside calls. Never throws.
 */
function openBursonPass_(before) {
  try {
    if (OE_RUN_) OE_RUN_.burson = Math.max(Number(OE_RUN_.burson) || 0, openFetches_() - (Number(before) || 0));
  } catch (e) { /* not counted */ }
}

/**
 * A Burson alert handled by its pass (Bot.gs): its pick-up time, kept for the run's record (RUN_LEDGER.p: C51's note,
 * the dashboard and the slow pick-up guard read it, whatever row 56 says). With Control row 56 ON ("Speed numbers: leave
 * out when the bot was not running", RunLog.gs) the same pick-up is also kept on a list of its own (RUN_LEDGER.pc),
 * unless the alert was posted before the bot last came back (the end of the latest stretch its run log recorded as not
 * running, paused, failing or not known): that one waited for the bot to run, not for its work. Row 56 OFF: nothing
 * more is read (runLogOn_ reads this run's switches, in memory) or kept. Never throws.
 */
function openPickup_(postedMs, now) {
  try {
    const s = Math.round(((Number(now) || Date.now()) - Number(postedMs)) / 1000);
    if (!(OE_RUN_ && isFinite(s) && s >= 0 && s < 24 * 3600)) return;
    OE_RUN_.pickups.push(s);
    if (typeof runLogOn_ === 'function' && runLogOn_()) {
      const end = runLogDownEnd_();
      if (!OE_RUN_.pickupsC) OE_RUN_.pickupsC = [];
      if (!(end && Number(postedMs) < end)) OE_RUN_.pickupsC.push(s);
    }
  } catch (e) { /* not counted */ }
}

/**
 * Adds this run to RUN_LEDGER (poll()'s finally): its seconds and calls in its hour's bucket, the runs that found the
 * lock taken this hour and the last (from the cache counter), a run that died (`tookOver`: its claim, counted from its
 * start, at most OE_RUN_MAX_MS_), the day's pick-up times, the calls of the day's busiest Burson pass (7 days kept),
 * the account type under row 51; 24 hours kept, never more than OE_LEDGER_MAX_ characters. One property read and one
 * write. Never throws.
 */
function openLedgerRecord_(runStart, now, tookOver) {
  try {
    const props = PropertiesService.getScriptProperties();
    const t = Number(now) || Date.now();
    const L = openLedger_(props);
    const bucket = hour => {
      let b = L.h.find(x => Number(x[0]) === hour);
      if (!b) { b = [hour, 0, 0, 0, 0]; L.h.push(b); }
      while (b.length < 5) b.push(0);
      return b;
    };
    const start = Number(runStart) || t;
    const hour = Math.floor(start / OE_HOUR_MS_) * OE_HOUR_MS_;
    const b = bucket(hour);
    b[1] = Math.round((Number(b[1]) + Math.max(0, (t - start) / 1000)) * 10) / 10;
    b[2] = Number(b[2]) + ((OE_RUN_ && OE_RUN_.fetches) || 0);
    b[3] = Number(b[3]) + 1;
    if (OE_RUN_ && !OE_RUN_.counting) L.nc = 1; else delete L.nc;
    if (tookOver && Number(tookOver.started) > 0) {
      const died = bucket(Math.floor(Number(tookOver.started) / OE_HOUR_MS_) * OE_HOUR_MS_);
      died[1] = Math.round((Number(died[1]) + Math.min(OE_RUN_MAX_MS_, Math.max(0, start - Number(tookOver.started))) / 1000) * 10) / 10;
    }
    try {
      const c = CacheService.getScriptCache();
      [hour, hour - OE_HOUR_MS_].forEach(h => {
        const n = Number(c.get(OE_ENTRY_KEY_ + h)) || 0;
        if (n) { const x = bucket(h); x[4] = Math.max(Number(x[4]) || 0, n); }
      });
    } catch (e) { /* the entries of this hour wait for the next run */ }
    const day = openEtDay_(t);
    if (L.pd !== day) { L.pd = day; L.p = []; }
    L.p = L.p.concat((OE_RUN_ && OE_RUN_.pickups) || []).slice(-OE_PICKUPS_MAX_);
    // Control row 56 ON only: the day's pick-ups but those of alerts posted before the bot came back (openPickup_), on
    // a list of their own, from the first run it was ON that day (pcs: it starts again after a run with it OFF, so the
    // list never has a hole). OFF, the list is not kept: the record is the one a bot that never had row 56 ON keeps
    if (typeof runLogOn_ === 'function' && runLogOn_()) {
      if (L.pcd !== day || !Array.isArray(L.pc)) { L.pcd = day; L.pc = []; L.pcs = start; }
      L.pc = L.pc.concat((OE_RUN_ && OE_RUN_.pickupsC) || []).slice(-OE_PICKUPS_MAX_);
    } else {
      delete L.pc;
      delete L.pcd;
      delete L.pcs;
    }
    const bp = Math.max(0, Math.round((OE_RUN_ && Number(OE_RUN_.burson)) || 0));
    const today = L.r.find(x => x[0] === day);
    if (today) today[1] = Math.max(Number(today[1]) || 0, bp);
    else if (bp) L.r.push([day, bp]);
    const oldest = openEtDay_(t - (OE_RESERVE_DAYS_ - 1) * 24 * OE_HOUR_MS_);
    L.r = L.r.filter(x => x[0] >= oldest).sort((x, y) => (x[0] < y[0] ? -1 : 1)).slice(-OE_RESERVE_DAYS_);
    if (openOn_()) openAccount_(L, t);
    L.h = L.h.filter(x => Number(x[0]) > t - OE_KEEP_HOURS_ * OE_HOUR_MS_).sort((x, y) => Number(x[0]) - Number(y[0]));
    let json = JSON.stringify(L);
    while (json.length > OE_LEDGER_MAX_ && Array.isArray(L.pc) && L.pc.length) { L.pc.shift(); json = JSON.stringify(L); }
    while (json.length > OE_LEDGER_MAX_ && L.p.length) { L.p.shift(); json = JSON.stringify(L); }
    if (json.length <= OE_LEDGER_MAX_) props.setProperty(OE_LEDGER_PROP_, json);
    if (OE_RUN_) OE_RUN_.L = null;  // written: a later read in this execution reads it again
  } catch (e) {
    console.warn(`the run-time record couldn't be written: ${(e && e.message) || e}`);
  }
}

/**
 * The account type, once an Eastern day under row 51 (in RUN_LEDGER's header, `a`: {d, w}): the address the script
 * runs as is looked at in memory only: anything after the "@" but gmail.com or googlemail.com is a Workspace account.
 * No part of the address is kept, logged or written. A failed read is "not Workspace". True / false. Never throws.
 */
function openAccount_(L, now) {
  const day = openEtDay_(now);
  if (L.a && L.a.d === day) return L.a.w === 1;
  let w = 0;
  try {
    const at = String(Session.getEffectiveUser().getEmail() || '');
    const i = at.lastIndexOf('@');
    w = i > 0 && openWorkspaceDomain_(at.slice(i + 1)) ? 1 : 0;
  } catch (e) {
    w = 0;
  }
  L.a = { d: day, w };
  return w === 1;
}

/** Is the part after the "@" a Workspace account's (anything but gmail.com or googlemail.com)? Pure. */
function openWorkspaceDomain_(domain) {
  const d = String(domain || '').trim();
  return !!d && !/^(?:gmail|googlemail)\.com$/i.test(d);
}

// ---------------------------------------------------------------------------------------------------------------
// Budgets, steps, the stop
// ---------------------------------------------------------------------------------------------------------------

/** The quantile `q` of `xs` (nearest rank), or null. Pure. */
function openQuantile_(xs, q) {
  const s = (xs || []).map(Number).filter(isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))] : null;
}

/**
 * The last 24 hours against the budgets: {runSec, budgetSec, f, fetches, fetchBudget, reserve, ff, step, fetchStep,
 * workspace, budgetFrom, counted, pickup: {p50, p90, n}}. The outside-call budget is the day's calls (open_fetch_day,
 * or the account's figure) less Burson's reserve (2x the calls of the busiest Burson pass of the last 7 days, at most
 * half the day's calls). `L`: RUN_LEDGER (read when not given). Never throws.
 */
function openUsage_(now, L0) {
  const t = Number(now) || Date.now();
  const cfg = openCfg_();
  let L = L0;
  try { if (!L) L = openLedger_(PropertiesService.getScriptProperties()); } catch (e) { L = { h: [], p: [] }; }
  const since = t - OE_KEEP_HOURS_ * OE_HOUR_MS_;
  let runSec = 0;
  let fetches = 0;
  (L.h || []).forEach(b => {
    if (Number(b[0]) + OE_HOUR_MS_ <= since) return;
    const lost = Math.max(0, (Number(b[4]) || 0) - (Number(b[3]) || 0));
    runSec += (Number(b[1]) || 0) + lost * cfg.lockLossSec;
    fetches += Number(b[2]) || 0;
  });
  const workspace = !!(L.a && L.a.w === 1);
  const quota = cfg.budgetHours !== null ? cfg.budgetHours : workspace ? 6 : 1.5;
  const budgetSec = Math.max(60, (quota - Math.min(cfg.otherHours, quota / 2)) * 3600);
  const fetchDay = Math.max(1, cfg.fetchDay !== null ? cfg.fetchDay : workspace ? 100000 : 20000);
  const oldest = openEtDay_(t - (OE_RESERVE_DAYS_ - 1) * 24 * OE_HOUR_MS_);
  const busiest = (L.r || []).filter(x => x[0] >= oldest).reduce((m, x) => Math.max(m, Number(x[1]) || 0), 0);
  const reserve = Math.min(Math.floor(fetchDay / 2), 2 * busiest);
  const fetchBudget = Math.max(1, fetchDay - reserve);
  const f = runSec / budgetSec;
  const ff = fetches / fetchBudget;
  const step = OE_STEPS_.filter(x => f >= x).length;
  const fetchStep = OE_FETCH_STEPS_.filter(x => ff >= x).length;
  const p = L.pd === openEtDay_(t) ? (L.p || []) : [];
  const out = { runSec: Math.round(runSec), budgetSec: Math.round(budgetSec), f, fetches, fetchBudget, reserve, ff, step, fetchStep, workspace,
    budgetFrom: cfg.budgetHours !== null ? 'setting' : 'account', counted: !L.nc,
    pickup: { p50: openQuantile_(p, 0.5), p90: openQuantile_(p, 0.9), n: p.length } };
  // Control row 56 (only when its list is there): the pick-ups but those of alerts posted before the bot came back,
  // today's from `since` on. The guard and C51 never read it: they read `pickup`, as before
  if (Array.isArray(L.pc)) {
    const pc = L.pcd === openEtDay_(t) ? L.pc : [];
    out.pickupC = { p50: openQuantile_(pc, 0.5), p90: openQuantile_(pc, 0.9), n: pc.length,
      since: L.pcd === openEtDay_(t) ? Number(L.pcs) || 0 : 0 };
  }
  return out;
}

/** The day's counts under row 51 (OPEN_DAY, the Eastern day; a new day starts from zero). Never throws. */
function openDay_(now) {
  const t = Number(now) || Date.now();
  if (OE_RUN_ && OE_RUN_.day && OE_RUN_.day.d === openEtDay_(t)) return OE_RUN_.day;
  let d = null;
  try { d = JSON.parse(PropertiesService.getScriptProperties().getProperty(OE_DAY_PROP_) || 'null'); } catch (e) { d = null; }
  if (!d || typeof d !== 'object' || d.d !== openEtDay_(t)) d = { d: openEtDay_(t) };
  ['rev', 'ql', 'wc', 'gb'].forEach(k => { d[k] = Math.max(0, Number(d[k]) || 0); });
  d.w = d.w && typeof d.w === 'object' && !Array.isArray(d.w) ? d.w : {};
  if (OE_RUN_) OE_RUN_.day = d;
  return d;
}

/** The derived ceilings of the day's stop: {rev, ql, wc, gb}. Pure (reads GEN). */
function openCeilings_() {
  const s = openCfg_().stop;
  return { rev: s, ql: 10 * s, wc: 100 * s, gb: 1.5 * s };
}

/** The ceiling the day reached ('rev' | 'ql' | 'wc' | 'gb'), or ''. */
function openStopped_(d) {
  const c = openCeilings_();
  return ['rev', 'ql', 'wc', 'gb'].find(k => (Number(d[k]) || 0) >= c[k]) || '';
}

/** True while row 51 is ON and today's safety stop (or one of its derived ceilings) was reached (C19's ending). Never throws. */
function openStopReached_() {
  try {
    return openOn_() && !!openStopped_(openDay_(Date.now()));
  } catch (e) {
    return false;
  }
}

/**
 * Is an Early Detection signal serious (the steps from 0.80 let only these start)? A P0 / P1 priority, a taxonomy hint
 * that raised it, or a post of 2,000 engagements or more among its posts. Pure; never throws.
 */
function openSerious_(row) {
  try {
    const r = row || {};
    if (/^p[01]$/i.test(String(r.priority_hint || '').trim()) || r.tag_raised === true) return true;
    let posts = [];
    try { posts = JSON.parse(String(r.representative_posts_json || '[]')); } catch (e) { posts = []; }
    return (Array.isArray(posts) ? posts : []).some(p => p && Number(p.engagement !== undefined ? p.engagement : p.e) >= 2000);
  } catch (e) {
    return false;
  }
}

const OE_BG_WAITING_MAX_ = 3;
const OE_QUEUE_MAX_ = 24;       // the review queue under row 51 (setting open_queue_max; step S5)
const OE_QUEUE_SERIOUS_MORE_ = 4;  // places past it a serious signal may take (S5)
const OE_ROWS_MAX_ = 300;       // signals a check reads and the producer's buffer keeps under row 51 (step S5)

/**
 * How often Early Detection checks (step S6): under row 51 every open_check_minutes (5), paced by the record of run
 * time: from 0.60 of the day's budget every 10 minutes, from 0.70 every 15; row 51 OFF: every 15 minutes, as before
 * (BigQuery.gs EW_EVERY_MS_). In ms. Never throws.
 */
function openCheckMs_() {
  try {
    if (!openOn_()) return EW_EVERY_MS_;
    const set = Math.round(Number(((typeof GEN !== 'undefined' && GEN && GEN.settings) || {}).open_check_minutes));
    const base = set >= 1 ? Math.min(15, set) : 5;
    const step = openUsage_(Date.now()).step;
    return (step >= 2 ? Math.max(base, 15) : step >= 1 ? Math.max(base, 10) : base) * 60 * 1000;
  } catch (e) {
    return EW_EVERY_MS_;
  }
}

/** The producer's own interval (EarlyWaveSource.gs): a minute under the check's under row 51, else EWS_EVERY_MS_. */
function openProducerMs_() {
  try {
    return openOn_() ? Math.max(60 * 1000, openCheckMs_() - 60 * 1000) : EWS_EVERY_MS_;
  } catch (e) {
    return EWS_EVERY_MS_;
  }
}

/**
 * The producer's capacity under row 51 (step S7), `name`: 'rt' real-time posts a lane a read (5,000; else 1,500),
 * 'slow' slow-lane posts a read (5,000; else 600), 'alerts' signals of a kind a check (50; else 8), 'embCheck' and
 * 'embDay' embeddings a check and a day (none: the check's time bounds them; else 400 and 20,000), 'batch' texts an
 * embedding call (80; else 25). Never throws.
 */
function openEws_(name) {
  const off = { rt: EWS_RT_MAX_ROWS_, slow: EWS_SLOW_MAX_ROWS_, alerts: EWS_MAX_ALERTS_, embCheck: EWS_EMBED_PER_CHECK_,
    embDay: EWS_EMBED_PER_DAY_, batch: VEC_BATCH_ }[name];
  try {
    if (!openOn_()) return off;
    const on = { rt: 5000, slow: 5000, alerts: 50, embCheck: Infinity, embDay: Infinity, batch: 80 }[name];
    return on === undefined ? off : on;
  } catch (e) {
    return off;
  }
}

/**
 * Step S8 (velocity made correct, the part built): under row 51 with the setting open_velocity_fix (true), {lagMs}: a
 * post counts for velocity only when the bot read it within open_velocity_lag_minutes (60) of posting; null when the
 * fix is off (row 51 OFF, or the setting false): velocity as before. Never throws.
 */
function openVelocityFix_() {
  try {
    if (!openOn_()) return null;
    const S = (typeof GEN !== 'undefined' && GEN && GEN.settings) || {};
    if (S.open_velocity_fix === false) return null;
    const m = Number(S.open_velocity_lag_minutes);
    return { lagMs: (m > 0 ? m : 60) * 60 * 1000 };
  } catch (e) {
    return null;
  }
}

// Step S9 (equal standing), the part built. The sources' names as the owner reads them; the two whose posts the
// same-story bars were set on (EWS:59-76); and how fresh a post must be to start a story or sit in the pool
const OE_SOURCE_NAMES_ = { sonar: 'Sonar', spk: 'Sprinklr comments', bw: 'Brandwatch (nightly)', tub: 'Tubular',
  ami: 'the AMIE table', amis: 'the AMIE table', bwl: 'Brandwatch live', bwls: 'Brandwatch live' };
const OE_CALIBRATED_ = ['sonar', 'spk'];

/** Equal standing is on: row 51 ON and the setting open_equal_lanes (true). Never throws. */
function openEqualLanes_() {
  try {
    return openOn_() && ((typeof GEN !== 'undefined' && GEN && GEN.settings) || {}).open_equal_lanes !== false;
  } catch (e) {
    return false;
  }
}

/** A post read more than open_fresh_minutes (180) after it was posted is late: it only joins a story. Never throws. */
function openFreshMs_() {
  const m = Number(((typeof GEN !== 'undefined' && GEN && GEN.settings) || {}).open_fresh_minutes);
  return (m > 0 ? m : 180) * 60 * 1000;
}

/**
 * The measured same-story bars by source (step S1 writes them): the setting open_lane_bars when filled (a JSON object
 * or text), else the script property OPEN_LANE_BARS ({date, lanes: {tub: {start, join}}}); {} when neither, or when
 * malformed (today's bars then). Never throws.
 */
function openLaneBars_() {
  try {
    const S = (typeof GEN !== 'undefined' && GEN && GEN.settings) || {};
    let v = S.open_lane_bars;
    if (v === undefined || v === null || v === '') v = PropertiesService.getScriptProperties().getProperty('OPEN_LANE_BARS');
    const o = typeof v === 'string' ? JSON.parse(v || 'null') : v;
    const lanes = o && typeof o === 'object' ? (o.lanes && typeof o.lanes === 'object' ? o.lanes : o) : null;
    const out = {};
    Object.keys(lanes || {}).forEach(k => {
      const b = lanes[k];
      if (b && typeof b === 'object' && isFinite(Number(b.start)) && isFinite(Number(b.join))) out[k] = { start: Number(b.start), join: Number(b.join) };
    });
    return out;
  } catch (e) {
    return {};
  }
}

/**
 * The reviewer's line (step S9): when equal standing is on and most of a signal's posts (its representative posts'
 * `source`) come from a source whose same-story grouping has not been checked yet (not Sonar or Sprinklr comments, and
 * no measured bars for it): "Most of these posts come from Tubular, where the same-story grouping has not been checked
 * yet: weigh whether they really tell one story." Else ''. Never throws.
 */
function openReviewerLine_(row) {
  try {
    if (!openEqualLanes_()) return '';
    // (a queued row keeps its posts as `posts`; the producer's row as representative_posts_json)
    let posts = row && Array.isArray(row.posts) ? row.posts : [];
    if (!posts.length) {
      try { posts = JSON.parse(String((row && row.representative_posts_json) || '[]')); } catch (e) { posts = []; }
    }
    const n = {};
    (Array.isArray(posts) ? posts : []).forEach(p => { const s = String((p && p.source) || ''); if (s) n[s] = (n[s] || 0) + 1; });
    const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0];
    if (!top || n[top] * 2 < posts.length || OE_CALIBRATED_.indexOf(top) >= 0 || openLaneBars_()[top]) return '';
    return `Most of these posts come from ${OE_SOURCE_NAMES_[top] || top}, where the same-story grouping has not been ` +
      'checked yet: weigh whether they really tell one story.';
  } catch (e) {
    return '';
  }
}

/** The review queue's size: open_queue_max (24) under row 51, else today's 12 (BigQuery.gs ED_QUEUE_MAX_). Never throws. */
function openQueueMax_() {
  try {
    if (!openOn_()) return ED_QUEUE_MAX_;
    const n = Math.round(Number(((typeof GEN !== 'undefined' && GEN && GEN.settings) || {}).open_queue_max));
    return n > 0 ? n : OE_QUEUE_MAX_;
  } catch (e) {
    return ED_QUEUE_MAX_;
  }
}

/** Under row 51: the run time is nearly used (step 4 or more: no background reviews but serious ones). Never throws. */
function openPaceHeld_() {
  try {
    return openOn_() && openUsage_(Date.now()).step >= 4;
  } catch (e) {
    return false;
  }
}  // the bot's own cards waiting unreviewed in the Auto-correct space before a new one waits

/**
 * Is one of the bot's own cards serious (step S4)? `kind` 'watch' (WatchAlerts.gs pwAlertOf_'s alert): a KOF, 2,000+
 * engagements, a P0 / P1 Exposure Tag or a Sensitive Topic on it; 'direct' (Alert.gs parseAlert_'s): a KOF or 2,000+.
 * Never throws.
 */
function openCardSerious_(kind, x) {
  try {
    const big = v => {
      const n = Number(String(v === undefined || v === null ? '' : v).replace(/,/g, ''));
      return isFinite(n) && n >= 2000;
    };
    if (kind === 'watch') {
      const a = x || {};
      const eng = a.engagement || {};
      const card = label => ((a.unknown || []).find(u => u && u.label === label) || {}).value || '';
      const tag = card('card_exposure_tag') && typeof lookupTag_ === 'function' ? lookupTag_(card('card_exposure_tag')) : null;
      return a.kof === true || big(eng.count) || big(eng.min) || !!(tag && /^P[01]$/.test(String(tag.priority))) || !!card('card_sensitive_topics');
    }
    const f = (x && x.fields) || {};
    const kof = String(f.kof || '').trim();  // "Yes", or the KOF lists the card names; "No" or blank when none
    return (!!kof && !/^(?:no|none|-)$/i.test(kof)) || big(f.total_engagement);
  } catch (e) {
    return false;
  }
}

/**
 * Room for one more of the bot's own ordinary cards in this run (step S4)? No when an Early Detection check is due (its
 * interval passed: BigQuery.gs ED_AT_PROP_) and the run's time left is under what the check and a review need
 * (EW_MIN_LEFT_MS_ + EW_DRAIN_MIN_LEFT_MS_ + a card's 40 s). Never throws.
 */
function openCheckRoom_(ctx) {
  try {
    const now = ctx && typeof ctx.now === 'function' ? ctx.now() : Date.now();
    const last = Number(PropertiesService.getScriptProperties().getProperty(ED_AT_PROP_)) || 0;
    const due = !last || now < last || now - last >= openCheckMs_();
    if (!due || !ctx || !(Number(ctx.deadline) > 0)) return true;
    return Number(ctx.deadline) - now >= EW_MIN_LEFT_MS_ + EW_DRAIN_MIN_LEFT_MS_ + 40 * 1000;
  } catch (e) {
    return true;
  }
}

/** Is the review queue's next signal serious (the allowance's `ser` mark, BigQuery.gs)? Never throws. */
function openQueueTopSerious_() {
  try {
    const list = typeof edQueueList_ === 'function' ? edQueueList_(PropertiesService.getScriptProperties()) : [];
    return !!(list[0] && list[0].ser);
  } catch (e) {
    return false;
  }
}

/** Counts `n` background reviews against the day's stop (row 51 ON; Burson's never). Never throws. */
function openCountReview_(n) { openCount_('rev', n); }

/** Counts `n` toward one of the day's ceilings ('rev', 'ql', 'wc', 'gb'), noting when the stop is reached. Never throws. */
function openCount_(kind, n) {
  try {
    if (!openOn_() || ['rev', 'ql', 'wc', 'gb'].indexOf(kind) < 0) return;
    const now = Date.now();
    const d = openDay_(now);
    d[kind] = Math.round(((Number(d[kind]) || 0) + Math.max(0, Number(n) || 0)) * 1000) / 1000;
    if (!d.stop && openStopped_(d)) d.stop = { k: openStopped_(d), at: now };
    d.dirty = 1;
  } catch (e) { /* counted at the next */ }
}

/**
 * Counts a wall hit today ('gemini', 'short', 'burson', 'guard', 'pace', 'bq', 'bw', 'storage', 'carried'): once a run
 * for each wall (C51's "walls hit: Burson first 3×" is three runs that met it). Never throws.
 */
function openWall_(name) {
  try {
    if (!openOn_() || !OE_WALL_WORDS_[name]) return;
    if (OE_RUN_) {
      if (OE_RUN_.walls[name]) return;
      OE_RUN_.walls[name] = 1;
    }
    const d = openDay_(Date.now());
    d.w[name] = (Number(d.w[name]) || 0) + 1;
    d.dirty = 1;
  } catch (e) { /* not counted */ }
}

/** Saves the day's counts when they changed (poll()'s finally). Never throws. */
function openDaySave_() {
  try {
    const d = OE_RUN_ && OE_RUN_.day;
    if (!d || !d.dirty) return;
    delete d.dirty;
    PropertiesService.getScriptProperties().setProperty(OE_DAY_PROP_, JSON.stringify(d));
  } catch (e) {
    console.warn(`the open engine's day counts couldn't be saved: ${(e && e.message) || e}`);
  }
}

/**
 * True when S-F Burson (the run's Burson space) has a post since the bot's cursor that this run has not handled: the
 * background work ends for this run, and the next minute's run takes the alert first. One list a call; once true, true
 * for the rest of the run. Never throws.
 */
function openYield_(ctx) {
  try {
    if (OE_RUN_ && OE_RUN_.yielded) return true;
    if (!ctx || !ctx.chat || !ctx.spaces || !ctx.spaces.burson || !ctx.spaces.burson.id || !ctx.cursor) return false;
    const cursor = Number(ctx.cursor.get()) || 0;
    if (!cursor) return false;
    const msgs = ctx.chat.list(ctx.spaces.burson.id, new Date(cursor).toISOString(), 50) || [];
    const fresh = msgs.some(m => m && !m.threadReply && Number(m.createTime) > cursor &&
      !(ctx.recent && ctx.recent.has(m.name)) && !(ctx.store && typeof ctx.store.isDone === 'function' && ctx.store.isDone(m.name)));
    if (fresh && OE_RUN_) OE_RUN_.yielded = true;
    return fresh;
  } catch (e) {
    return false;
  }
}

/** The background time a run gives up while Burson's pick-up p90 is over open_burson_pickup_p90_s (ms). Never throws. */
function openShrinkMs_(usage) {
  try {
    const u = usage || openUsage_(Date.now());
    if (!(u.pickup.n >= 5) || !(u.pickup.p90 > openCfg_().pickupP90)) return 0;
    return Math.min(OE_SHRINK_MAX_MS_, OE_SHRINK_MS_ * Math.ceil((u.pickup.p90 - openCfg_().pickupP90) / 30));
  } catch (e) {
    return 0;
  }
}

/**
 * May a background `kind` ('review', 'card', 'quick', 'batch') start now? Row 51 OFF: always yes (the bot as it was).
 * ON, in this order: the day's stop (and its derived ceiling for quick looks); the run-time steps (0.97 nothing, 0.90
 * no reviews or cards, 0.80 only serious ones: o.serious); the outside-call steps (0.90 nothing, 0.70 no quick look);
 * a 429 in the last 10 minutes; Burson's slow pick-up (the run's time left, ctx.deadline, short by openShrinkMs_);
 * Burson first (openYield_). {ok, why, wall}; a "no" counts its wall. Never throws.
 */
function openMayStart_(kind, ctx, o) {
  try {
    if (!openOn_()) return { ok: true, why: '', wall: '' };
    const now = Date.now();
    const x = o || {};
    const no = (why, wall, held) => {
      if (wall) openWall_(wall);
      if (held && kind !== 'quick') openHeld_(held, now);
      return { ok: false, why, wall: wall || '' };
    };
    const d = openDay_(now);
    const reached = openStopped_(d);
    if (reached && (kind !== 'quick' || reached === 'ql')) return no(`today's safety stop was reached (${openStopWords_(reached)})`, '', 'stop');
    const u = openUsage_(now);
    if (u.step >= 5 || u.fetchStep >= 2) return no('the day\'s run time or outside calls are nearly used: Burson\'s reserve', 'pace', 'pace');
    if (u.step >= 4 && kind !== 'quick') return no('the day\'s run time is nearly used: no background reviews or cards', 'pace', 'pace');
    if (u.step >= 3 && !x.serious && kind !== 'quick') return no('the day\'s run time is ahead of pace: only serious work starts', 'pace', 'pace');
    if (u.fetchStep >= 1 && kind === 'quick') return no('the day\'s outside calls are ahead of pace: no quick looks', 'pace');
    try {
      if (Number(CacheService.getScriptCache().get(OE_BG429_KEY_)) > now) return no('Gemini said "too busy" in the last 10 minutes', 'gemini');
    } catch (e) { /* no cache: no wait */ }
    const shrink = openShrinkMs_(u);
    if (shrink && ctx && Number(ctx.deadline) > 0 && Number(ctx.deadline) - now < shrink + 60 * 1000) return no('the run keeps time for Burson\'s alerts', 'short');
    if (kind !== 'quick' && openYield_(ctx)) return no('a Burson alert came in: it goes first', 'burson');
    return { ok: true, why: '', wall: '' };
  } catch (e) {
    return { ok: true, why: '', wall: '' };
  }
}

/** A background start held by the day's stop or the pace (kept with the day's counts, `h`: {k, at}). Never throws. */
function openHeld_(k, now) {
  try {
    const d = openDay_(now);
    d.h = { k, at: Number(now) || Date.now() };
    d.dirty = 1;
  } catch (e) { /* not kept */ }
}

/**
 * Why a queued signal that waited out its hours was not reviewed, under row 51: 'stop' or 'pace' when a background start
 * was held for that reason in the last 3 hours (the queue's age), else ''. Never throws.
 */
function openHeldCause_(now) {
  try {
    if (!openOn_()) return '';
    const t = Number(now) || Date.now();
    const h = openDay_(t).h;
    const age = typeof ED_QUEUE_MAX_AGE_MS_ !== 'undefined' ? ED_QUEUE_MAX_AGE_MS_ : 3 * OE_HOUR_MS_;
    return h && (h.k === 'stop' || h.k === 'pace') && t - Number(h.at) <= age ? h.k : '';
  } catch (e) {
    return '';
  }
}

/** Row 51: true when no Early Detection check may run (run time from 0.97, or outside calls from 0.90). Never throws. */
function openCheckHeld_() {
  try {
    if (!openOn_()) return false;
    const u = openUsage_(Date.now());
    if (!(u.step >= 5 || u.fetchStep >= 2)) return false;
    openWall_('pace');
    return true;
  } catch (e) {
    return false;
  }
}

/** Row 51: a Vertex AI 429 makes background work wait OE_BG429_MS_ (ApiGuard notes the 429). Never throws. */
function openNote429_(now) {
  try {
    if (!openOn_()) return;
    const t = Number(now) || Date.now();
    CacheService.getScriptCache().put(OE_BG429_KEY_, String(t + OE_BG429_MS_), Math.ceil(OE_BG429_MS_ / 1000) + 5);
    openWall_('gemini');
  } catch (e) { /* no wait */ }
}

// ---------------------------------------------------------------------------------------------------------------
// C51
// ---------------------------------------------------------------------------------------------------------------

/** "2 h 05", "45 min". Pure. */
function openHours_(sec) {
  const m = Math.max(0, Math.round(Number(sec) / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** The stop's words: "2,000 background reviews". Pure (reads GEN). */
function openStopWords_(k) {
  const c = openCeilings_();
  const n = v => Number(v).toLocaleString('en-US');
  return { rev: `${n(c.rev)} background reviews`, ql: `${n(c.ql)} quick looks`, wc: `${n(c.wc)} Watch post checks`,
    gb: `${n(c.gb)} GB of background BigQuery reads` }[k] || '';
}

/** A later step adds a part to C51 (fn(usage, day, now) -> '' or a short part, put before the walls). Never throws. */
function openC51Add_(fn) {
  if (typeof fn === 'function' && OE_C51_PARTS_.indexOf(fn) < 0) OE_C51_PARTS_.push(fn);
}

/** The run time in words for C51: "run time 2 h 05 of 4 h 30 (24 h)". Pure. */
function openRunWords_(u) {
  return `run time ${openHours_(u.runSec)} of ${openHours_(u.budgetSec)} (24 h)`;
}

/**
 * C51's note while row 51 is ON (after its ON text; noteSwitch_ cuts at 200, so it is made to fit): the warning first
 * (the day's stop, the run-time or outside-call pace), then today's reviews against the stop, the run time and the
 * outside calls against their budgets, the parts later steps add, and the walls hit today. Never throws.
 */
function openC51Text_(now) {
  try {
    const t = Number(now) || Date.now();
    const u = openUsage_(t);
    const d = openDay_(t);
    const n = v => Math.round(Number(v) || 0).toLocaleString('en-US');
    const at = x => { try { return Utilities.formatDate(new Date(x), 'America/New_York', 'h:mm a'); } catch (e) { return ''; } };
    let warning = '';
    if (d.stop) {
      warning = d.stop.k === 'ql'
        ? `⛔ safety stop at ${at(d.stop.at)}: ${openStopWords_('ql')} today. Burson's alerts go on; stories wait for 5 accounts until midnight ET. No big event? Tell the engineer`
        : `⛔ safety stop at ${at(d.stop.at)}: ${openStopWords_(d.stop.k)} today. Burson's alerts go on; stories, Watch and Direct cards wait until midnight ET. No big event? Tell the engineer`;
    } else if (u.step >= 4 || u.fetchStep >= 2) {
      warning = u.fetchStep >= 2
        ? `⏸ outside calls nearly used (${n(u.fetches)} of ${n(u.fetchBudget)} in 24 h): no background work. Burson's alerts go on`
        : `⏸ run time nearly used (${openHours_(u.runSec)} of ${openHours_(u.budgetSec)} in 24 h): no background reviews. Burson's alerts go on`;
    } else if (u.step >= 3 || u.fetchStep >= 1) {
      warning = u.fetchStep >= 1 && u.step < 3
        ? `⏸ outside calls ahead of pace (${n(u.fetches)} of ${n(u.fetchBudget)} in 24 h): no quick looks. Burson's alerts go on`
        : `⏸ run time ahead of pace (${openHours_(u.runSec)} of ${openHours_(u.budgetSec)} in 24 h): only serious stories reviewed. Burson's alerts go on`;
    }
    // the first screen paused an hour or more in a row (step S19h): below every other warning
    if (!warning && typeof rqScreenC51Warning_ === 'function') warning = rqScreenC51Warning_(t);
    const walls = Object.keys(d.w || {}).filter(k => Number(d.w[k]) > 0 && OE_WALL_WORDS_[k]).map(k => `${OE_WALL_WORDS_[k]} ${n(d.w[k])}×`);
    const parts = [
      `today: checks every ${Math.round(openCheckMs_() / 60000)} min · ${n(d.rev)} of ${n(openCfg_().stop)} reviews`,
      openRunWords_(u),
      u.counted ? `calls ${n(u.fetches)} of ${n(u.fetchBudget)}` : '',
    ].concat(typeof engC51Part_ === 'function' ? [engC51Part_()] : [],
      OE_C51_PARTS_.map(fn => { try { return String(fn(u, d, t) || ''); } catch (e) { return ''; } }),
      walls.length ? [`walls hit: ${walls.join(', ')}`] : []).filter(Boolean);
    let note = warning;
    parts.forEach(p => {
      const next = note ? `${note} · ${p}` : p;
      if (next.length <= 200) note = next;
    });
    return truncate_(note, 200);
  } catch (e) {
    return '';
  }
}

/**
 * C51 while row 51 is OFF: after the OFF text, the day's run time against the budget and Burson's pick-up p90, once
 * the record holds a minute of run time ("run time today: 1 h 20 of 4 h 30 (last 24 h) · Burson pick-up 40 s (p90)"); '' before. Never
 * throws.
 */
function openOffNote_(now) {
  try {
    const L = openLedger_(PropertiesService.getScriptProperties());
    if (!L.h.length) return '';
    const u = openUsage_(Number(now) || Date.now(), L);
    if (u.runSec < 60) return '';  // under a minute recorded: nothing worth saying yet
    return `run time today: ${openHours_(u.runSec)} of ${openHours_(u.budgetSec)} (last 24 h)` +
      (u.pickup.p90 !== null ? ` · Burson pick-up ${Math.round(u.pickup.p90)} s (p90)` : '');
  } catch (e) {
    return '';
  }
}

/** Writes C51's note (row 51 ON) at the end of a run (Main.gs). Never throws. */
function openWriteNote_(now) {
  try {
    if (!openOn_()) return;
    noteSwitch_('openEngine', openC51Text_(now));
  } catch (e) { /* the note waits for the next run */ }
}
