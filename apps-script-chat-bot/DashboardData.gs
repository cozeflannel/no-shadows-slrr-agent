/**
 * DashboardData.gs — the live dashboard's data (Control row 54, Live dashboard): what the web app's Live area shows,
 * read from what the bot keeps and from nothing else: its sheet's own tabs, its script properties, its script cache, and
 * the Chat threads of its alerts (read as the bot). Read-only: nothing here writes to the sheet, a property, Chat or
 * Gmail; the one write is the snapshot's own short-lived read cache (script cache keys starting `dash1:`). The bot's
 * writers are never called (sheetBackend_, sheetTable_, makeStore_, makeAlertMemory_ can make a tab or a header): the
 * Alert log is read by its header names with a read-only reader of its own (dlAlertRows_), and a tab whose mark (its
 * A1 title, or its header row) is not the bot's is never read.
 *
 *   dashSnapshot(opts)     the Live area in one answer (SPEC 3.1-3.5): health, now (look first / then), clusters,
 *                          alerts, pressure, pipeline, early, held, questions. Cached 45 seconds (dash1:snap);
 *                          opts.refresh builds it anew
 *   dashDetail(kind, id)   one alert (kind 'alert': an Alert-log id) or one story the producer follows (kind 'cluster')
 *                          in full (SPEC 3.7), its Chat thread read at open time
 *   dashWhyNot(url)        what the bot holds about one post, across its stores ("Why didn't a post get an alert?")
 *
 * Each starts with the access gate (Dashboard.gs dashAccess_) and answers {ok: false, why} in plain words instead of
 * throwing; {ok: false, off: true, why} while row 54 is OFF. Every level, status, owner and action is worked out from
 * what the alert's row keeps (SPEC 3.2-3.3) and says so (`derived`); what the bot does not keep is said plainly
 * (cannotSee), never estimated. When the bot's last run, or a source that is ON, is late or missing, the answer is never
 * calm: now.level is 'unknown' and its headline says why first (SPEC 3.4).
 *
 * With Control row 56 ON ("Speed numbers: leave out when the bot was not running", RunLog.gs), and only then, the answer
 * also says when the bot ran, from its run log (health.runLog, and what that log can't see), each Head start story's
 * speed check (early.stories[].speedCheck), how long Burson's alert waited for the bot to run (the alert's timeline) and
 * the pick-up time leaving out the alerts posted before the bot came back (pressure.load.pickupNote, next to the usual
 * one, which is as it was). OFF, none of it is read and the answer is as before.
 *
 * Its own helpers are named dl…_ and its constants DL_…_ ("dashboard, live"), apart from the shared base it starts from
 * (Dashboard.gs: dashAccess_, dashCtx_, dashBuildInfo_, dashRefusal_). No text it returns holds an emoji (the web app
 * shows none: dlPlain_).
 */

const DL_LIVE_SWITCH_ = 'liveDashboard';
const DL_LIVE_OFF_WHY_ = 'The live dashboard is OFF on the Control tab (row 54). Turn it ON there to see the bot\'s work here.';
const DL_SNAP_KEY_ = 'dash1:snap';          // the snapshot's read cache: its head here, its parts at dash1:snap:<n>
const DL_SNAP_SEC_ = 45;
const DL_CHUNK_MAX_ = 90000;                // characters (and UTF-8 bytes) a cache part holds at most
const DL_SNAP_MAX_CHARS_ = 400000;          // the snapshot is kept under this (its alert list is cut first)
const DL_ALERT_ROWS_ = 3000;                // the newest Alert-log rows read for Live (7 days and more)
const DL_ALERTS_MAX_ = 300;                 // alerts in the snapshot (the newest of the last 7 days)
const DL_CLUSTERS_MAX_ = 60;                // stories in the snapshot (the most important)
const DL_ROWS_MAX_ = 60;                    // rows of a held / early list in the snapshot
const DL_MIN_MS_ = 60 * 1000;
const DL_HOUR_MS_ = 60 * DL_MIN_MS_;
const DL_DAY_MS_ = 24 * DL_HOUR_MS_;
const DL_RUN_OK_MS_ = 5 * DL_MIN_MS_;       // the bot runs every minute; a run can take a few minutes
const DL_RUN_STOPPED_MS_ = 10 * DL_MIN_MS_; // the bot's own rule: Last check (B6) more than 10 minutes old = stopped
const DL_WATCH_LATE_MS_ = 15 * DL_MIN_MS_;  // the watch looks every 5 minutes
const DL_DIRECT_LATE_MS_ = 15 * DL_MIN_MS_; // Direct BigQuery checks every 5 minutes
const DL_DRAFT_STUCK_MS_ = 30 * DL_MIN_MS_;
const DL_FIX_STUCK_MS_ = 60 * DL_MIN_MS_;
const DL_QUEUE_STUCK_MS_ = 60 * DL_MIN_MS_;
const DL_UNDECIDED_MS_ = 15 * DL_MIN_MS_;   // Burson's alert with no decision this long after the bot recorded it: a person looks
const DL_MESSAGE_ROWS_ = 500;               // the newest Message log rows read (its unreviewed messages of the last 24 hours)
const DL_THREAD_MAX_ = 50;                  // messages read from one Chat thread
const DL_TEXT_MAX_ = 600;                   // a Chat message's text, as the panel shows it
const DL_LEVELS_ = ['low', 'medium', 'high', 'critical'];
const DL_SPEED_RANK_ = { surging: 3, rising: 2, steady: 1, slowing: 0, unknown: 0 };
const DL_MONTHS_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// The Alert-log columns Live reads (by header name; the rest are never decoded)
const DL_ALERT_COLS_ = ['alert_id', 'created_at', 'space', 'source_message', 'source_thread', 'record_key', 'author',
  'exposure_tag', 'status', 'requested', 'forwarded_fields', 'forward_message', 'forward_thread', 'burson_done', 'mirrored',
  'resend_of', 'updated_at', 'email_status', 'email_input', 'email_thread', 'email_subject', 'email_groups', 'email_at',
  'email_sent_at', 'email_sent_by', 'email_attempts', 'email_error', 'source_at', 'seen_at', 'decision', 'tns_submitted',
  'bq_written', 'outcome', 'ingested', 'live_message', 'live_thread'];
const DL_STATUS_LABELS_ = {
  'needs-review': 'Needs review', 'needs-person': 'A person needs to look', 'fix-asked': 'Fix asked of Burson', 'draft-waiting': 'Draft waiting',
  sent: 'Social Alert sent', tns: 'T&S submitted', 'no-action': 'No action', failed: 'Failed', superseded: 'Replaced by a resend', done: 'Done',
};
// What a resend that keeps no decision and no email of its own takes from the alert it resends (Bot.gs handleResend_:
// "an original that has one keeps it"), as Bot.gs mergedAlertRow_ and Drafts.gs chainDecision_ read the chain
const DL_CHAIN_FIELDS_ = ['email_status', 'email_input', 'email_thread', 'email_subject', 'email_groups', 'email_at', 'email_sent_at',
  'email_sent_by', 'email_attempts', 'email_error', 'tns_submitted'];
const DL_KIND_WORDS_ = { burson: 'Burson\'s alert', watch: 'Watch alert', direct: 'Direct BigQuery card', story: 'Early Detection story card',
  update: 'Early Detection update', early: 'Early signal', other: 'Alert in another format', sheet: 'Sheet test alert' };
const DL_FLOW_WORDS_ = { M: 'mirror', A: 'auto-correct', O: 'other alerts', S: 'main' };
// The Watch detections that were not posted, by the code the tab's hidden key keeps (WatchAlerts.gs), in plain words
const DL_WATCH_HELD_ = {
  o: 'Not posted: the AI read says it is not about Google',
  d: 'Not posted: its post or thread already had an alert, or it is not in English',
  b: 'Waiting: a small post, held until enough accounts tell its story for one alert',
  x: 'Dropped: it waited 3 hours and could not go out',
  r: 'Not posted: a repeat of a story already alerted',
  n: 'Not posted: nothing to show (no words and no picture)',
};
const DL_MEMORY_WORDS_ = { e: 'a Social Alert went out for it', c: 'its Social Alert was being sent', p: 'its Social Alert was waiting to go out',
  f: 'it was folded into a story already emailed', s: 'the bot saw it' };

// ---------------------------------------------------------------------------------------------------------------
// The API (google.script.run)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The Live area's data in one answer (SPEC 3.1): {ok, asOf, build, switches, mode, health, now, clusters, alerts,
 * pressure, pipeline, early, held, questions}. Cached 45 seconds in the script cache (dash1:snap); opts.refresh builds
 * it anew. Read-only. {ok: false, off: true, why} while Control row 54 is OFF; {ok: false, why} in plain words when the
 * bot's data can't be read. Never throws.
 */
function dashSnapshot(opts) {
  const access = dashAccess_();
  if (!access.ok) return dashRefusal_(access);
  try {
    const ctx = dashCtx_();
    if (!ctx.controlOk) return dashControlUnread_(ctx);
    if (!dlLiveOn_(ctx)) return dlLiveOff_();
    if (!(opts && opts.refresh)) {
      const hit = dlCacheGet_(DL_SNAP_KEY_);
      if (hit && hit.ok === true) return dashServed_(Object.assign(hit, { cached: true }));
    }
    const snap = dashServed_(dlSnapshotOf_(ctx));
    dlCachePut_(DL_SNAP_KEY_, snap, DL_SNAP_SEC_);
    return snap;
  } catch (e) {
    return dlFailed_(e);
  }
}

/**
 * One alert or one story in full (SPEC 3.7): {ok, kind, id, title, level, levelWhy, status, owner, action, explain,
 * posts, chat, alert, timeline, related, cannotSee}. kind 'alert' (any Alert-log row: id is its alert_id) or
 * 'cluster' (a story in the producer's cache: id is its cluster id). The alert's Chat thread is read now, as the bot,
 * read-only; when that read fails the row's own message links stay and cannotSee says so. Never posts anything. Never
 * throws.
 */
function dashDetail(kind, id) {
  const access = dashAccess_();
  if (!access.ok) return dashRefusal_(access);
  try {
    const ctx = dashCtx_();
    if (!ctx.controlOk) return dashControlUnread_(ctx);
    if (!dlLiveOn_(ctx)) return dlLiveOff_();
    const want = String(id === undefined || id === null ? '' : id).trim();
    if (!want) return { ok: false, why: 'Nothing was picked: choose an alert or a story first.' };
    const props = PropertiesService.getScriptProperties();
    const info = dlInfo_(props);
    const log = dlAlertRows_(ctx.ss, DL_ALERT_ROWS_);
    if (String(kind || '') === 'cluster') return dashServed_(dlClusterDetail_(ctx, props, info, log, want));
    return dashServed_(dlAlertDetail_(ctx, props, info, log, want));
  } catch (e) {
    return dlFailed_(e);
  }
}

/**
 * What the bot holds about the post at `url`, across its stores, read-only: {ok, url, found: [{where, what, at, detail}],
 * answer (plain sentences), cannotSee}. Looks in the Alert log (the post's own alerts, and story cards that list it),
 * the Alert memory tab (the bot's own only), the Early Detection and Watch detections tabs (the bot's own only), and
 * the producer's stories and pool. Never throws.
 */
function dashWhyNot(url) {
  const access = dashAccess_();
  if (!access.ok) return dashRefusal_(access);
  try {
    const ctx = dashCtx_();
    if (!ctx.controlOk) return dashControlUnread_(ctx);
    if (!dlLiveOn_(ctx)) return dlLiveOff_();
    const u = String(url === undefined || url === null ? '' : url).trim();
    if (!/^https?:\/\/[^\s<>|]+$/.test(u)) return { ok: false, why: 'Paste the post\'s full link, starting with https://.' };
    return dashServed_(dlWhyNotOf_(ctx, u));
  } catch (e) {
    return dlFailed_(e);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Gate, cache and small helpers
// ---------------------------------------------------------------------------------------------------------------

/** True when Control row 54 (Live dashboard) is ON in `ctx` (dashCtx_). Pure. */
function dlLiveOn_(ctx) {
  return !!(ctx && ctx.switches && ctx.switches[DL_LIVE_SWITCH_] === true);
}

/** The answer of every dash* call while row 54 is OFF. Pure. */
function dlLiveOff_() {
  return { ok: false, off: true, why: DL_LIVE_OFF_WHY_ };
}

/** A failure in plain words, with what to do (never the stack). Pure. */
function dlFailed_(e) {
  return { ok: false, why: `The dashboard could not read the bot's data: ${dlErr_(e)}. Press Refresh in a minute; if this keeps ` +
    'happening, tell the owner of the bot\'s sheet.' };
}

/** An error's message, one line, at most 300 characters. Pure. */
function dlErr_(e) {
  return truncate_(String((e && e.message) || e || 'unknown error').replace(/\s+/g, ' ').trim(), 300);
}

/** `v` when it is a plain object, else {}. Pure. */
function dlObj_(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** A cell or field as one line of text ('' for none). Pure. */
function dlText_(v) {
  return v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim();
}

/** A number that is one (finite), else null. Pure. */
function dlNum_(v) {
  if (v === undefined || v === null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/** A JSON text parsed, or null. Pure. */
function dlJson_(s) {
  try { return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

/** A script property parsed as JSON, or null. Never throws. */
function dlProp_(props, key) {
  try { return dlJson_(props.getProperty(key)); } catch (e) { return null; }
}

/** A script property as a time (ms), or 0. Never throws. */
function dlPropMs_(props, key) {
  try { return headStartTime_(props.getProperty(key)); } catch (e) { return 0; }
}

/**
 * Text as the page shows it: no emoji (the web app shows none: pictographs, their joiners and keycaps are taken out),
 * Chat's <link|label> marks as their label, one line, at most `max` characters. Pure.
 */
function dlPlain_(s, max) {
  let t = String(s === undefined || s === null ? '' : s)
    .replace(/<(https?:\/\/[^|>\s]+)\|([^>]*)>/g, '$2')
    .replace(/<(https?:\/\/[^|>\s]+)>/g, '$1')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u200D\uFE0E\uFE0F\u20E3]/g, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/^[·:\-\s]+/, '');
  if (max && t.length > max) t = truncate_(t, max);
  return t;
}

/**
 * A decision as the page shows it: the bot's no-action mark becomes "No action:", its worth-a-look mark goes, the rest
 * is the decision's own words (dlPlain_). Pure.
 */
function dlDecisionWords_(d) {
  const s = String(d || '').trim();
  if (!s) return '';
  if (/^\u274C/.test(s)) return dlPlain_(`No action: ${s.replace(/^\u274C\uFE0F?\s*/, '')}`, 300);
  if (/^\u{1F44D}\s*\+\s*T&S/u.test(s)) return dlPlain_(s.replace(/^\u{1F44D}\s*\+\s*/u, 'Worth a look + '), 300);
  return dlPlain_(s, 300);
}

/** True when a decision is the bot's no-action mark. Pure. */
function dlNoAction_(d) {
  return /^\u274C/.test(String(d || '').trim());
}

/** A level's rank (low 0 ... critical 3; anything else -1). Pure. */
function dlRank_(level) {
  return DL_LEVELS_.indexOf(level);
}

/** The level one step up, at most `max`. Pure. */
function dlLevelUp_(level, max) {
  const r = Math.min(dlRank_(level) + 1, dlRank_(max));
  return DL_LEVELS_[Math.max(0, r)];
}

/** "less than a minute ago", "1 minute ago", "23 minutes ago", "3 hours ago", "2 days ago" for `ms` of age. Pure. */
function dlAgo_(ms) {
  const m = Math.floor(Math.max(0, Number(ms) || 0) / DL_MIN_MS_);
  if (m < 1) return 'less than a minute ago';
  if (m < 120) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hours ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** "every 15 minutes" for an interval in ms. Pure. */
function dlEvery_(ms) {
  const m = Math.round((Number(ms) || 0) / DL_MIN_MS_);
  return m === 1 ? 'every minute' : `every ${m} minutes`;
}

/** The ET time of `ms` as "8:16 AM" (today) or "Oct 13, 8:16 AM" (another day); '' without a time. Never throws. */
function dlClock_(ms, now) {
  try {
    if (!(Number(ms) > 0)) return '';
    const tz = GEN.timezone || 'America/New_York';
    const same = Utilities.formatDate(new Date(Number(ms)), tz, 'yyyy-MM-dd') === Utilities.formatDate(new Date(Number(now) || Date.now()), tz, 'yyyy-MM-dd');
    return Utilities.formatDate(new Date(Number(ms)), tz, same ? 'h:mm a' : 'MMM d, h:mm a');
  } catch (e) {
    return '';
  }
}

/** The ET day keys ('yyyy-MM-dd') of the `n` days up to `now`, today first. Never throws. */
function dlDays_(now, n) {
  const tz = GEN.timezone || 'America/New_York';
  const out = [];
  try {
    for (let i = 0; i < n + 1 && out.length < n; i++) {
      const k = Utilities.formatDate(new Date(now - i * DL_DAY_MS_), tz, 'yyyy-MM-dd');
      if (out.indexOf(k) < 0) out.push(k);
    }
  } catch (e) { /* none */ }
  return out;
}

let DL_OFFSETS_ = null;  // this execution's dlOffsets_ answer: {minute, list}

/**
 * The ET clock's offsets from UTC (ms) worth trying near `now`: now's, and an hour either way (daylight time). Worked
 * out once a minute of `now`. Never throws.
 */
function dlOffsets_(now) {
  const minute = Math.floor(Number(now) / DL_MIN_MS_);
  if (DL_OFFSETS_ && DL_OFFSETS_.minute === minute) return DL_OFFSETS_.list;
  const list = dlOffsetsAt_(now);
  if (list.length) DL_OFFSETS_ = { minute, list };
  return list;
}

/** dlOffsets_'s answer, worked out. Never throws. */
function dlOffsetsAt_(now) {
  try {
    const tz = GEN.timezone || 'America/New_York';
    const s = Utilities.formatDate(new Date(now), tz, 'yyyy-MM-dd HH:mm');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    const off = Math.round((wall - Math.floor(now / DL_MIN_MS_) * DL_MIN_MS_) / (15 * DL_MIN_MS_)) * 15 * DL_MIN_MS_;
    return [off, off - DL_HOUR_MS_, off + DL_HOUR_MS_];
  } catch (e) {
    return [];
  }
}

/**
 * An ET time the bot wrote as text, "yyyy-MM-dd HH:mm", in ms: the moment whose ET clock reads exactly that (each
 * candidate checked with Utilities.formatDate, so a daylight-time change is right); 0 when it is not such a text. A cell
 * Sheets turned into a date is its own moment. Never throws.
 */
function dlEtMs_(v, now) {
  try {
    if (v instanceof Date) return v.getTime();
    const s = String(v === undefined || v === null ? '' : v).trim().replace(/^'/, '');
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
    if (!m) return 0;
    const tz = GEN.timezone || 'America/New_York';
    const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    for (const off of dlOffsets_(now || Date.now())) {
      const ms = wall - off;
      if (Utilities.formatDate(new Date(ms), tz, 'yyyy-MM-dd HH:mm') === s) return ms;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Control B6 (Last check, nowLabel_: "Oct 14, 8:33 AM EDT", no year) in ms: the moment, this year or last, whose label
 * is exactly that text and that is not after now (a day's slack). 0 when it can't be read. Never throws.
 */
function dlLabelMs_(label, now) {
  try {
    const s = String(label || '').trim();
    const m = s.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{1,2}):(\d{2}) (AM|PM) \S+$/);
    if (!m) return 0;
    const mon = DL_MONTHS_.indexOf(m[1]);
    if (mon < 0) return 0;
    const tz = GEN.timezone || 'America/New_York';
    const hour = (Number(m[3]) % 12) + (m[5] === 'PM' ? 12 : 0);
    const year = Number(Utilities.formatDate(new Date(now), tz, 'yyyy-MM-dd').slice(0, 4));
    for (const y of [year, year - 1]) {
      const wall = Date.UTC(y, mon, Number(m[2]), hour, Number(m[4]));
      for (const off of dlOffsets_(now)) {
        const ms = wall - off;
        if (ms <= now + DL_DAY_MS_ && Utilities.formatDate(new Date(ms), tz, 'MMM d, h:mm a z') === s) return ms;
      }
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

/** A sheet cell's =HYPERLINK("url","label") as {url, label}; any other value is its own label. Pure. */
function dlCellLink_(v, formula) {
  const f = String(formula || (typeof v === 'string' ? v : '') || '');
  const m = f.match(/^=HYPERLINK\("((?:[^"]|"")*)"\s*[,;]\s*"((?:[^"]|"")*)"\)$/i);
  if (m) return { url: m[1].replace(/""/g, '"'), label: m[2].replace(/""/g, '"') };
  return { url: '', label: dlText_(v instanceof Date ? '' : v) };
}

/**
 * The web link of a Chat message (Outbox.gs outboxMessageLink_: "spaces/S/messages/T.M" -> …/room/S/T/M); for a
 * message name without its thread part, the link of its space. '' for anything else. Pure.
 */
function dlChatLink_(name) {
  const n = String(name || '').trim();
  if (!/^spaces\/[^/\s]+\/messages\/[^/\s]+$/.test(n)) return '';
  const link = String(outboxMessageLink_(n) || '').split(' ')[0];
  return /^https:\/\/[^\s<>|]+$/.test(link) ? link : '';
}

/** The web link of a Chat thread ("spaces/S/threads/T" -> …/room/S/T), or ''. Pure. */
function dlThreadLink_(thread) {
  const m = String(thread || '').match(/^spaces\/([^/\s]+)\/threads\/([^/\s]+)$/);
  return m ? `${CHAT_ROOM_URL_}${m[1]}/${m[2]}` : '';
}

/** A link the page may open: http(s) and nothing odd in it, else ''. Pure. */
function dlUrl_(u) {
  const s = String(u || '').trim();
  return /^https?:\/\/[^\s<>|"]+$/.test(s) && s.length <= 2000 ? s : '';
}

/** What the reads share: {botUser (the bot's Chat user), mailbox (the bot's account, for its Gmail links)}. Never throws. */
function dlInfo_(props) {
  let botUser = '';
  let mailbox = '';
  try { botUser = String(props.getProperty('BOT_USER') || ''); } catch (e) { botUser = ''; }
  try { mailbox = String(Session.getEffectiveUser().getEmail() || ''); } catch (e) { mailbox = ''; }
  return { botUser, mailbox };
}

/** The Control tab row of a switch (Control.gs), or 0. Never throws. */
function dlSwitchRow_(key) {
  try {
    const i = CONTROL_SWITCHES_.findIndex(s => s.key === key);
    return i >= 0 ? switchRows_()[i] : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Splits `s` into parts of at most `max` characters and `max` UTF-8 bytes each (a surrogate pair is never split).
 * Pure.
 */
function dlChunks_(s, max) {
  const out = [];
  let start = 0;
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const pair = c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length;
    const b = pair ? 4 : c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
    const len = i + (pair ? 2 : 1) - start;
    if (len > max || bytes + b > max) {
      out.push(s.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += b;
    if (pair) i++;
  }
  if (start < s.length || !out.length) out.push(s.slice(start));
  return out;
}

/**
 * Keeps `value` in the script cache for `seconds`: its JSON in parts (dlChunks_) at `<key>:<n>`, and at `key` a head
 * {n, len, h} that a read checks the parts against (two builds at once can't mix). Only `dash1:` keys. Never throws.
 */
function dlCachePut_(key, value, seconds) {
  try {
    if (String(key).indexOf('dash1:') !== 0) return;
    const cache = CacheService.getScriptCache();
    const json = JSON.stringify(value);
    const parts = dlChunks_(json, DL_CHUNK_MAX_);
    const items = {};
    parts.forEach((p, i) => { items[`${key}:${i}`] = p; });
    cache.putAll(items, seconds);
    cache.put(key, JSON.stringify({ n: parts.length, len: json.length, h: hashText_(json) }), seconds);
  } catch (e) { /* read again next time */ }
}

/** The value dlCachePut_ kept at `key`, or null when it is gone, partly gone or does not match its head. Never throws. */
function dlCacheGet_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const head = dlJson_(cache.get(key));
    if (!head || !(Number(head.n) > 0)) return null;
    const keys = [];
    for (let i = 0; i < Number(head.n); i++) keys.push(`${key}:${i}`);
    const got = cache.getAll(keys) || {};
    let json = '';
    for (const k of keys) {
      if (typeof got[k] !== 'string') return null;
      json += got[k];
    }
    if (json.length !== Number(head.len) || hashText_(json) !== head.h) return null;
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the bot's tabs (read-only; only the bot's own)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The Alert log's newest `max` rows, read-only, by header name: {rows (oldest first; only DL_ALERT_COLS_, decoded as
 * the store decodes them), tab (it is there), mine (its header row is the bot's: alert_id and created_at), read, total,
 * oldestAt, newestAt, error (when Sheets did not answer)}. One read of the header row and one getValues over the span
 * of the columns needed (only those are decoded). Never makes the tab or touches its header (Sheets.gs sheetTable_
 * would). [] rows when there is none. Never throws.
 */
function dlAlertRows_(ss, max) {
  const out = { rows: [], tab: false, mine: false, read: 0, total: 0, oldestAt: 0, newestAt: 0, error: '' };
  try {
    dlAlertRowsInto_(ss, max, out);
  } catch (e) {
    out.rows = [];
    out.read = 0;
    out.error = dlErr_(e);
  }
  return out;
}

/** dlAlertRows_'s read, into `out`. */
function dlAlertRowsInto_(ss, max, out) {
  const sh = ss.getSheetByName(ALERT_TAB_);
  if (!sh) return out;
  out.tab = true;
  const last = sh.getLastRow();
  const width = sh.getLastColumn();
  if (last < 1 || width < 1) return out;
  const header = sh.getRange(1, 1, 1, width).getValues()[0].map(v => String(v).trim());
  if (header.indexOf('alert_id') < 0 || header.indexOf('created_at') < 0) return out;
  out.mine = true;
  out.total = Math.max(0, last - 1);
  if (last < 2) return out;
  const cols = DL_ALERT_COLS_.map(c => [c, header.indexOf(c)]).filter(x => x[1] >= 0);
  const lo = Math.min.apply(null, cols.map(x => x[1]));
  const hi = Math.max.apply(null, cols.map(x => x[1]));
  const first = Math.max(2, last - Math.max(1, max) + 1);
  const values = sh.getRange(first, lo + 1, last - first + 1, hi - lo + 1).getValues();
  out.rows = values.map(v => {
    const row = {};
    cols.forEach(([c, i]) => { row[c] = decodeCell_(c, v[i - lo]); });
    return row;
  }).filter(r => dlText_(r.alert_id));
  out.read = out.rows.length;
  const times = out.rows.map(r => headStartTime_(r.created_at)).filter(t => t > 0);
  out.oldestAt = times.length ? Math.min.apply(null, times) : 0;
  out.newestAt = times.length ? Math.max.apply(null, times) : 0;
  return out;
}

/** True when the rows read reach back to `since` (all rows read, or the oldest read is at or before it). Pure. */
function dlLogReaches_(log, since) {
  return !log.tab || log.read >= log.total || (log.oldestAt > 0 && log.oldestAt <= since);
}

/**
 * The Early Detection tab's rows of the last 7 ET days, newest first, when the tab is the bot's (EarlyDetectionTab.gs
 * edTabOwner_): {ok, why (when it can't be read), today (its row 3 line), rows: [{at, when, day, outcome, group,
 * story, link, why, card, kind, accounts, platforms, tag, id}]}. A tab people made is never read. Never throws.
 */
function dlEdTab_(ss, now) {
  const out = { ok: false, why: '', today: '', rows: [] };
  try {
    dlEdTabInto_(ss, now, out);
  } catch (e) {
    Object.assign(out, { ok: false, rows: [], why: `The Early Detection tab could not be read: ${dlErr_(e)}.` });
  }
  return out;
}

/** dlEdTab_'s read, into `out`. */
function dlEdTabInto_(ss, now, out) {
  const sh = ss.getSheetByName(EDT_NAME_);
  if (!sh) {
    out.why = 'The Early Detection tab is not there yet: the bot makes it when Early Detection (row 19) records its first story.';
    return;
  }
  const owner = edTabOwner_(sh);
  if (owner !== 'bot') {
    out.why = owner === 'unknown' ? 'The Early Detection tab could not be read just now.'
      : 'A tab named "Early Detection" that the bot did not make is in the way, so it is not read.';
    return;
  }
  out.ok = true;
  const last = sh.getLastRow();
  out.today = dlPlain_(sh.getRange(3, 1).getDisplayValue(), 300);
  const first = EDT_HEAD_ROW_ + 1;
  if (last < first) return;
  const rng = sh.getRange(first, 1, Math.min(last - first + 1, EDT_KEEP_), EDT_HEADER_.length);
  const values = rng.getValues();
  let formulas = null;
  try { formulas = typeof rng.getFormulas === 'function' ? rng.getFormulas() : null; } catch (e) { formulas = null; }
  const days = dlDays_(now, 7);
  const oldest = days[days.length - 1] || '';
  const groupOf = o => Object.keys(ED_OUT_GROUPS_).find(g => ED_OUT_GROUPS_[g].indexOf(o) >= 0) || '';
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const day = dlDayOf_(v[0]);
    if (day && day < oldest) break;  // newest first: the rest are older still
    if (days.indexOf(day) < 0) continue;
    const at = dlEtMs_(v[0], now);
    const story = dlCellLink_(v[2], formulas && formulas[i] && formulas[i][2]);
    const card = dlCellLink_(v[4], formulas && formulas[i] && formulas[i][4]);
    const outcome = dlText_(v[1]);
    out.rows.push({ at: at || null, when: dlTimeCell_(v[0]), day, outcome, group: groupOf(outcome),
      story: dlPlain_(story.label, 160), link: dlUrl_(story.url), why: dlPlain_(v[3], 300), card: card.label, kind: dlText_(v[5]),
      accounts: dlNum_(v[6]), platforms: dlText_(v[7]), tag: dlPlain_(v[8], 160), id: dlText_(v[9]) });
  }
}

/** A time cell the bot wrote ("yyyy-MM-dd HH:mm" ET), as that text, whether Sheets kept it as text or made a date of it; '' for none. Never throws. */
function dlTimeCell_(v) {
  try {
    // a date from any realm (Sheets' own, or another script's): its tag, not instanceof
    if (Object.prototype.toString.call(v) === '[object Date]') {
      return isNaN(v.getTime()) ? '' : Utilities.formatDate(new Date(v.getTime()), GEN.timezone || 'America/New_York', 'yyyy-MM-dd HH:mm');
    }
    return dlText_(v).replace(/^'/, '');
  } catch (e) {
    return '';
  }
}

/** The ET day ('yyyy-MM-dd') of a time cell the bot wrote ("yyyy-MM-dd HH:mm", or a date Sheets made of it); '' for none. Never throws. */
function dlDayOf_(v) {
  try {
    if (v instanceof Date) return Utilities.formatDate(v, GEN.timezone || 'America/New_York', 'yyyy-MM-dd');
    const m = String(v === undefined || v === null ? '' : v).trim().replace(/^'/, '').match(/^(\d{4}-\d{2}-\d{2})\b/);
    return m ? m[1] : '';
  } catch (e) {
    return '';
  }
}

/**
 * The Watch detections tab's newest rows when the tab is the bot's (ProactiveWatch.gs isPwDetectionsTab_): {ok, why,
 * rows: [{at, day, watch, post, network, author, issue, summary, code, key}]} (code: the hidden key's `a`). A tab people
 * made is never read. Never throws.
 */
function dlWatchTab_(ss, now) {
  const out = { ok: false, why: '', rows: [] };
  try {
    const sh = ss.getSheetByName(PW_DET_TAB_);
    if (!sh) {
      out.why = 'The Watch detections tab is not there yet: the bot makes it when the Proactive watch (row 34) first looks.';
      return out;
    }
    if (!isPwDetectionsTab_(sh)) {
      out.why = 'A tab named "Watch detections" that the bot did not make is in the way, so it is not read.';
      return out;
    }
    out.ok = true;
    out.rows = dlWatchRowsOf_(pwDetRows_(sh, 3000).values, now);
  } catch (e) {
    Object.assign(out, { ok: false, rows: [], why: `The Watch detections tab could not be read: ${dlErr_(e)}.` });
  }
  return out;
}

/**
 * The Watch detections tab's rows of the last 7 ET days (its values, as pwDetRows_ reads them, oldest first) as
 * dlWatchTab_ gives them. Never throws on a broken cell.
 */
function dlWatchRowsOf_(values, now) {
  const days = dlDays_(now, 7);
  const rows = [];
  values.forEach(v => {
    const day = dlDayOf_(v[PW_COL_.seen - 1]);
    if (days.indexOf(day) < 0) return;
    const key = pwKeyOf_(v[PW_COL_.key - 1]) || {};
    const at = dlEtMs_(v[PW_COL_.seen - 1], now) || headStartTime_(key.s);
    rows.push({ at: at || null, day, watch: dlText_(v[PW_COL_.watch - 1]),
      post: dlUrl_(v[PW_COL_.post - 1]), network: dlText_(v[PW_COL_.network - 1]), author: dlText_(v[PW_COL_.author - 1]),
      issue: dlPlain_(v[PW_COL_.issue - 1], 160), summary: dlPlain_(v[PW_COL_.summary - 1], 400), code: dlText_(key.a), key });
  });
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------
// One alert: kind, seriousness, status, owner, action (SPEC 3.2, 3.3)
// ---------------------------------------------------------------------------------------------------------------

/** The kind of an Alert-log row: burson, watch, direct, story, update, early, other, sheet. Pure. */
function dlKindOf_(row) {
  const ing = dlText_(row && row.ingested);
  if (!ing) return 'burson';
  if (ing === ED_ALERT_INGESTED_) {
    const ed = dlObj_(dlObj_(row.forwarded_fields).early_detection);
    if (dlText_(ed.signal_type).toUpperCase() === EWS_WATCH_SIGNAL_) return 'early';
    return dlText_(ed.update_of) ? 'update' : 'story';
  }
  if (ing === PW_ALERT_INGESTED_) return 'watch';
  if (Object.keys(BQ_SOURCE_LABELS_).some(k => BQ_SOURCE_LABELS_[k] === ing)) return 'direct';
  if (ing === SHEET_TEST_INGESTED_) return 'sheet';
  return 'other';
}

/** True for the kinds that are the bot's own Early Detection cards. Pure. */
function dlCardKind_(kind) {
  return kind === 'story' || kind === 'update' || kind === 'early';
}

/**
 * The decision the row keeps, as it keeps it: its `decision` column, else (an Other or Watch alert the triage called
 * worth a look, which writes none) that call. '' when there is none yet. Pure.
 */
function dlDecisionRaw_(row) {
  const d = dlText_(row.decision);
  if (d) return d;
  const tri = dlObj_(dlObj_(row.forwarded_fields).triage);
  if (tri.call === 'flag') return `Worth a look${tri.why ? `: ${dlText_(tri.why)}` : ''}`;
  return '';
}

/**
 * True when the T&S form was submitted for the row (by the bot, or marked as done; its decision says "· auto-submitted",
 * as a resend's copy of its original's decision does; or the alert it resends had it submitted: dlChained_'s tnsFrom).
 * Pure.
 */
function dlTnsSubmitted_(row) {
  const input = dlObj_(row.email_input);
  return headStartTime_(row.tns_submitted) > 0 || groupsOf_(row).indexOf('tns') >= 0 || input.tns_submitted === true ||
    /\u00b7 auto-submitted/.test(dlText_(row.decision)) || !!dlText_(row.tnsFrom);
}

/**
 * The status key of a row (SPEC 3.3), from what it keeps (a resend's, with what it takes from the alert it resends:
 * dlChained_): superseded; failed (its email failed, or its review did); draft-waiting (its Social Alert is drafted or
 * pending); fix-asked (a fix was asked of Burson and no resend has come: never in the Auto-correct space, where the bot
 * corrects the alert itself and asks Burson nothing); sent (done once a reply resolved it); tns (the T&S form
 * submitted, no Social Alert); no-action; done (any other decision); needs-review (no decision yet); needs-person
 * (Burson's alert, not waiting on Burson, still with no decision DL_UNDECIDED_MS_ after the bot recorded it: the bot
 * decides an alert on the run that records it, so a person looks; `kind`, `now` tell). Waiting on Burson is the bot's
 * own rule (Bot.gs undecidedRow_): never while Never wait on Burson (row 23, `sw.noWait`) is ON; in the Auto-correct
 * flow only while something it asked has a problem only Burson can fix; else while a fix is asked (fix_requested). Pure.
 */
function dlStatusOf_(row, flow, decision, kind, now, sw) {
  const es = dlText_(row.email_status);
  const ff = dlObj_(row.forwarded_fields);
  const failedReview = dlObj_(ff.early_detection).basis === 'failed' || dlObj_(ff.triage).basis === 'failed';
  const noWait = !!(sw && sw.noWait === true);
  const requested = Array.isArray(row.requested) ? row.requested : [];
  const waitsOnBurson = !noWait && (flow === 'auto-correct' ? requested.some(x => x && x.problem) : dlText_(row.status) === 'fix_requested');
  if (dlText_(row.status) === 'superseded') return 'superseded';
  if (es === 'failed' || failedReview) return 'failed';
  if (es === 'drafted' || es === 'pending') return 'draft-waiting';
  if (dlText_(row.status) === 'fix_requested' && flow !== 'auto-correct') return 'fix-asked';
  if (es === 'sent') return followupResolved_(row) ? 'done' : 'sent';
  if (dlTnsSubmitted_(row)) return 'tns';
  if (es === 'deleted' || es === 'discarded' || dlNoAction_(decision)) return 'no-action';
  if (decision || es === 'skipped_no_test_email') return 'done';
  const made = headStartTime_(row.created_at);
  if (kind === 'burson' && now && made && now - made > DL_UNDECIDED_MS_ && !waitsOnBurson) return 'needs-person';
  return 'needs-review';
}

/**
 * The Alert log's rows with each resend's state followed back along its chain (resend_of, back to the first; the row of
 * the same forward that holds the email), as the bot reads it (Bot.gs mergedAlertRow_, Drafts.gs chainDecision_): a
 * resend that keeps no email and no decision of its own takes its original's email, T&S and decision, so a draft that
 * waits on the original still shows on the live resend. The originals stay as they are (superseded). A resend whose
 * decision names a T&S form (its own: Never wait on Burson, row 23, copies its original's) and that keeps no T&S
 * submission takes the one an alert it resends had (tnsFrom: that alert's id). A resend with nothing of its own or of
 * its chain, whose chain reaches an alert that is not among the rows read, is marked (originalUnread: that alert's id):
 * whether it was decided is not known. Copies; the rows read are not changed. Pure.
 */
function dlChained_(rows) {
  const byId = new Map();
  const emailByForward = new Map();
  (rows || []).forEach(r => {
    byId.set(dlText_(r.alert_id), r);
    const f = dlText_(r.forward_message);
    if (f && dlText_(r.email_status)) {
      const cur = emailByForward.get(f);
      if (!cur || headStartTime_(r.created_at) >= headStartTime_(cur.created_at)) emailByForward.set(f, r);
    }
  });
  const tnsOf = x => headStartTime_(x.tns_submitted) > 0 || groupsOf_(x).indexOf('tns') >= 0 || dlObj_(x.email_input).tns_submitted === true;
  return (rows || []).map(r => {
    if (!dlText_(r.resend_of)) return r;
    let email = null;
    let decision = '';
    let tns = null;
    let unread = '';
    for (let x = r, n = 0; x && n < 20; n++) {
      if (!email && dlText_(x.email_status)) email = x;
      if (!email && dlText_(x.forward_message) && emailByForward.has(dlText_(x.forward_message))) email = emailByForward.get(dlText_(x.forward_message));
      if (!decision && dlText_(x.decision)) decision = dlText_(x.decision);
      if (!tns && x !== r && tnsOf(x)) tns = x;
      const up = dlText_(x.resend_of);
      x = up ? byId.get(up) : null;
      if (up && !x) unread = up;
    }
    const own = !!(dlText_(r.email_status) || dlText_(r.decision));
    const out = Object.assign({}, r);
    let changed = false;
    if (!own && (email || decision)) {
      out.chainedFrom = dlText_((email || {}).alert_id) || '';
      if (email) DL_CHAIN_FIELDS_.forEach(k => { if (email[k] !== undefined && email[k] !== null && email[k] !== '') out[k] = email[k]; });
      if (decision) out.decision = decision;
      changed = true;
    }
    if (tns && !tnsOf(out) && /T&S/.test(dlText_(out.decision))) {
      out.tnsFrom = dlText_(tns.alert_id);
      if (headStartTime_(tns.tns_submitted)) out.tns_submitted = tns.tns_submitted;
      changed = true;
    }
    if (unread && !own && !email && !decision) {
      out.originalUnread = unread;
      changed = true;
    }
    return changed ? out : r;
  });
}

/** The rows read, chained (dlChained_), each as the snapshot lists it (dlAlertOf_ with the switches `sw`). Pure but for GEN. */
function dlAlertsOf_(rows, now, sw) {
  return dlChained_(rows).map(r => dlAlertOf_(r, now, sw));
}

/**
 * How serious a row is (SPEC 3.2), with the reason in plain words: {level, why}. Early Detection cards: their review's
 * severity (none: low). Others: a P0 exposure tag, the urgent escalation track or a leadership case: critical; a Social
 * Alert (sent, drafted, pending, or one that failed to go out): high; no action: low; T&S form only, or a P1/P2 tag kept
 * for review: medium; else low. Pure but for GEN (lookupTag_).
 */
function dlAlertLevel_(row, kind, f, decision) {
  if (dlCardKind_(kind)) {
    const sev = dlText_(dlObj_(dlObj_(row.forwarded_fields).early_detection).severity).toLowerCase();
    return dlRank_(sev) >= 0 ? { level: sev, why: `The story's review rated it ${sev}` }
      : { level: 'low', why: 'The story\'s review gave it no severity (counted as low)' };
  }
  const tagName = dlText_(f('exposure_tag') || row.exposure_tag);
  const tag = tagName ? lookupTag_(tagName) : null;
  const pri = tag ? String(tag.priority || '').toUpperCase() : '';
  const esc = dlObj_(dlObj_(row.email_input).escalation);
  const es = dlText_(row.email_status);
  if (pri === 'P0') return { level: 'critical', why: `P0 exposure tag (${tag.name})` };
  if (dlText_(esc.track).toUpperCase() === 'URGENT') return { level: 'critical', why: 'Escalated on the urgent track' };
  if (String(row.mirrored || '').indexOf('\u{1F9D1}\u200D\u{1F4BB}') >= 0) return { level: 'critical', why: 'A leadership case: the leads were told' };
  const words = { sent: 'sent', drafted: 'drafted, waiting to be sent', pending: 'waiting to go out', failed: 'that failed to go out' };
  if (words[es]) return { level: 'high', why: `A Social Alert ${words[es]}` };
  if (es === 'deleted' || es === 'discarded' || dlNoAction_(decision)) {
    return { level: 'low', why: dlNoAction_(decision) ? dlDecisionWords_(decision) : 'Its Social Alert was held back or discarded' };
  }
  if (/T&S/.test(decision) || dlTnsSubmitted_(row)) return { level: 'medium', why: 'A T&S form, no Social Alert' };
  if (pri === 'P1' || pri === 'P2') return { level: 'medium', why: `${pri} exposure tag (${tag.name}) kept for review` };
  return { level: 'low', why: tagName ? `Its exposure tag (${tagName}) has no priority` : 'No exposure tag' };
}

/**
 * The teams a Social Alert went to, by their codes: email_groups (T&S aside), else the team marks the bot put on the
 * alert (its `mirrored` emojis, read with the legend); each named as the distribution names it, with its code. Pure but
 * for GEN.
 */
function dlTeams_(row) {
  let codes = groupsOf_(row).filter(c => c !== 'tns');
  if (!codes.length) {
    const skip = ['tns', 'ack', 'superseded', 'no_action', 'escalated_jon', 'agent_wrong'];
    codes = String(row.mirrored || '').split(/\s+/).filter(Boolean).map(e => (legendByEmoji_(e) || {}).code)
      .filter(c => c && skip.indexOf(c) < 0 && ACTION_CODES_.has(c));
  }
  return Array.from(new Set(codes)).map(c => {
    const g = ((GEN.distribution && GEN.distribution.groups) || []).find(x => x.action_code === c);
    return g ? `${g.name} (${c})` : c;
  });
}

/**
 * Who has the alert (SPEC 3.3), worked out from its state (the bot keeps no owner per alert, and no name it does not
 * hold): {who, why, derived: true}. Pure but for GEN.
 */
function dlOwnerOf_(row, status, decision) {
  const o = (who, why) => ({ who, why, derived: true });
  const d = dlDecisionKind_(row, decision);
  switch (status) {
    case 'needs-review': return o('the bot', 'No decision yet: the bot reviews it');
    case 'needs-person':
      return o('the IM on shift', dlText_(row.originalUnread) ? dlUnreadWhy_(row)
        : `The bot recorded it ${dlAgo_(Date.now() - headStartTime_(row.created_at))} and has made no decision on it`);
    case 'draft-waiting':
      return dlText_(row.email_status) === 'drafted' ? o('the IM on shift', 'Its Social Alert is a Gmail draft waiting to be sent')
        : o('the IM on shift', dlText_(row.email_error) ? `Its Social Alert has not gone out: ${dlPlain_(row.email_error, 200)}`
          : 'Its Social Alert is waiting to go out');
    case 'fix-asked': return o('Burson', 'The bot asked Burson to fix the alert; no corrected alert has come yet');
    case 'sent': {
      const teams = dlTeams_(row);
      return o(teams.length ? `the teams emailed: ${teams.join(', ')}` : 'the teams emailed', 'The Social Alert went out to them');
    }
    case 'tns': return o('Trust & Safety', 'The T&S form was submitted');
    case 'failed': return o('the IM on shift', 'The bot could not finish it');
    case 'superseded': return o('nobody', 'Burson resent it; the newer alert carries on');
    case 'done':
      if (d === 'tns') return o('the IM on shift', 'Its T&S form is not submitted yet');
      if (d === 'youtube') return o('the IM on shift', 'The bot left it for a person: the YouTube Social chat is pinged by hand');
      if (d === 'watch') return o('the IMs on shift', 'The bot marked it to watch: worth a look, or a story building up');
      return o('nobody', 'Nothing is waiting on anyone');
    default: return o('nobody', status === 'no-action' ? 'No action was needed' : 'Nothing is waiting on anyone');
  }
}

/**
 * True when a row's decision handed its next step to a person and nothing says it was taken (dlDecisionKind_: a T&S
 * form not submitted, the YouTube Social chat to ping): the bot's part is done, a person's is not. Pure.
 */
function dlHandedOver_(x) {
  return x.status === 'done' && ['tns', 'youtube'].indexOf(dlDecisionKind_(x.row, x.decision)) >= 0;
}

/** Why a resend whose original is not among the rows read (dlChained_ originalUnread) is a person's to look at. Pure. */
function dlUnreadWhy_(row) {
  return `Its original (${dlText_(row.originalUnread)}) is not among the rows read, so whether it was decided is not known`;
}

/**
 * What a decision hands to a person, from the decision the row keeps: 'tns' (a T&S form to submit: "+ T&S" or "T&S form
 * only", not submitted), 'youtube' (left for a person: the YouTube Social chat ping), 'watch' (worth a look, or a story
 * to monitor as it builds up), or '' (nothing). Pure.
 */
function dlDecisionKind_(row, decision) {
  const d = String(decision || '').replace(/^[\u{1F44D}\u274C\uFE0F\s]+/u, '').trim();
  if (/T&S/.test(d) && !/^No action/.test(d) && !dlTnsSubmitted_(row)) return 'tns';
  if (/^YouTube: left for a person/.test(d)) return 'youtube';
  if (/^(?:Worth a look|Monitor build-up)/.test(d)) return 'watch';
  return '';
}

let DL_DEADLINES_ = null;  // this execution's follow-up deadlines (FollowUp.gs followupDeadlines_: one property read)

/** The follow-up deadlines (FollowUp.gs followupDeadlines_), read once an execution. Never throws. */
function dlDeadlines_() {
  if (!DL_DEADLINES_) DL_DEADLINES_ = followupDeadlines_();
  return DL_DEADLINES_;
}

/**
 * What to do next (SPEC 3.3): one plain sentence per status; for a sent Social Alert, the Follow-up tab's next step
 * (while Track post-alert outcomes, row 21, is ON: `sw`, the switches; OFF, the bot reads no replies, and says so).
 * Never throws.
 */
function dlActionOf_(row, status, decision, now, sw) {
  try {
    switch (status) {
      case 'needs-review': return 'Nothing to do yet: the bot reviews it on its next run.';
      case 'needs-person':
        if (dlText_(row.originalUnread)) return `Look at it yourself: ${dlUnreadWhy_(row).replace(/^Its/, 'its')}. Find ${dlText_(row.originalUnread)} on the Alert log tab.`;
        return `Look at it yourself: the bot recorded it ${dlAgo_(now - headStartTime_(row.created_at))} and has made no decision on it (it ` +
          `decides an alert on the run that records it). Open its thread in the ${amFlowOf_(row.space) === 'A' ? 'Auto-correct' : 'analyst'} space.`;
      case 'draft-waiting':
        if (dlText_(row.email_status) === 'drafted') return 'Open the draft in Gmail and send it, or discard it.';
        return dlText_(row.email_error) ? `Not sent yet: ${dlPlain_(row.email_error, 240)}`
          : 'Nothing to do yet: the bot sends or drafts it on its next run.';
      case 'fix-asked': return 'Wait for Burson\'s corrected alert; if none comes within an hour, ask Burson in the alert\'s thread.';
      case 'sent': {
        if (sw && sw.trackOutcomes !== true) {
          return `The bot does not read replies while Track post-alert outcomes (row ${dlSwitchRow_('trackOutcomes') || 21}) is OFF: check the email thread in Gmail.`;
        }
        const next = followupNextStep_(followupStatus_(row, now, dlDeadlines_()), followupTnsText_(row, now), now);
        return dlPlain_(next, 300) || 'Nothing yet: wait for the teams\' replies.';
      }
      case 'tns': return 'Check that the T&S submission went through (its confirmation email).';
      case 'failed':
        return dlText_(row.email_status) === 'failed'
          ? `Send the Social Alert by hand: the bot gave up${dlText_(row.email_error) ? ` (${dlPlain_(row.email_error, 200)})` : ''}.`
          : 'Look at it yourself: the bot\'s review failed.';
      case 'superseded': return 'Nothing to do: Burson resent it, and the newer alert carries on.';
      case 'no-action': return `Nothing to do: ${dlDecisionWords_(decision).replace(/^No action:\s*/, '') || 'no action was needed'}.`;
      default: {
        const d = dlDecisionKind_(row, decision);
        if (d === 'tns') return 'Submit the T&S form from the pre-filled link in its thread, if no one has.';
        if (d === 'youtube') return 'Ping the YouTube Social chat about it (the bot left it for a person).';
        if (d === 'watch') return `Watch the story; open it again if it grows (${dlDecisionWords_(decision).replace(/\.$/, '')}).`;
        return decision ? `Nothing to do: ${dlDecisionWords_(decision)}.` : 'Nothing to do.';
      }
    }
  } catch (e) {
    return 'Open it to see what it needs.';
  }
}

/**
 * One Alert-log row as the snapshot lists it (SPEC 3.1 Alert), with what the rest of the build needs: {a (the Alert),
 * row, kind, status, rank (its level's), at (when it reached the space: source_at, else created_at), key (its post's
 * key, for counting one post once)}. `sw`: the switches (the next step of a sent Social Alert depends on row 21).
 * Never throws on a broken cell (it reads as blank).
 */
function dlAlertOf_(row, now, sw) {
  const ff = dlObj_(row.forwarded_fields);
  const ef = dlObj_(dlObj_(row.email_input).fields);
  const f = k => (ff[k] !== undefined && ff[k] !== null && ff[k] !== '' ? ff[k] : ef[k]);
  const kind = dlKindOf_(row);
  const flow = DL_FLOW_WORDS_[amFlowOf_(row.space)] || '';
  const decision = dlDecisionRaw_(row);
  const status = dlStatusOf_(row, flow, decision, kind, now, sw);
  const lv = dlAlertLevel_(row, kind, f, decision);
  const ed = dlObj_(ff.early_detection);
  const created = headStartTime_(row.created_at);
  const at = headStartTime_(row.source_at) || created;
  const issue = issueNameText_(dlText_(f('issue_name'))) || dlText_(ed.story_title) || truncate_(dlText_(f('summary')), 120);
  const requested = Array.isArray(row.requested) ? row.requested : [];
  const topics = Array.isArray(f('risk_tags')) ? f('risk_tags').map(dlText_).filter(Boolean) : [];
  const postUrl = dlUrl_(f('post_url'));
  const a = {
    id: dlText_(row.alert_id), kind, flow, createdAt: created || null, issue: dlPlain_(issue, 200), product: dlText_(f('product')),
    platform: dlText_(f('social_network')), author: dlText_(f('author') || row.author), engagement: dlNum_(f('total_engagement')),
    tag: dlText_(f('exposure_tag') || row.exposure_tag), topics, level: lv.level, levelWhy: lv.why,
    status: { key: status, label: DL_STATUS_LABELS_[status], derived: true }, owner: dlOwnerOf_(row, status, decision),
    action: { text: dlActionOf_(row, status, decision, now, sw) },
    email: { status: dlText_(row.email_status), sentAt: headStartTime_(row.email_sent_at) || null },
    tns: { submitted: dlTnsSubmitted_(row) }, corrections: requested.filter(x => x && typeof x === 'object' && 'new' in x).length,
    decision: dlDecisionWords_(decision), postUrl, chatLink: dlChatLink_(row.forward_message || row.source_message),
  };
  const key = dlText_(row.record_key) || (postUrl ? recordKey_({ post_url: postUrl }) : '') || `id:${a.id}`;
  return { a, row, kind, status, rank: dlRank_(lv.level), at, key, decision };
}

// ---------------------------------------------------------------------------------------------------------------
// The stories the producer follows (clusters)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The producer's open counts (cache 'acc', EarlyWaveSource.gs ewsAcc_) by hour: {hour index: {velocity key: Set of
 * accounts}}, built once for every story. Pure.
 */
function dlAccIndex_(acc) {
  const out = new Map();
  ((acc && acc.rows) || []).forEach(r => {
    const h = Math.floor(Number(r[0]) / 60);
    if (!out.has(h)) out.set(h, new Map());
    const keys = out.get(h);
    (r[3] || []).forEach(k => {
      if (!keys.has(k)) keys.set(k, new Set());
      keys.get(k).add(r[1]);
    });
  });
  return out;
}

/**
 * Accounts per hour of a story for the 24 full hours before now's hour, the oldest first (SPEC 3.1 perHour): an hour
 * still open, from the producer's open counts (`idx`: dlAccIndex_, the accounts whose posts carry the story's key, as
 * ewsHourCount_ counts them); a closed hour, from the story's own record (c.hc); 0 for an hour a check read that the
 * story had no account in; null where nothing was read (no data, not a quiet hour). All null when the story has no
 * post from the real-time sources (only they are counted by hour). Pure.
 */
function dlPerHour_(c, roll, idx, now) {
  const members = Array.isArray(c.m) ? c.m : [];
  if (!members.some(m => m && !m.sl && !m.nl)) return new Array(24).fill(null);
  const H = Math.floor(now / DL_HOUR_MS_);
  const cov = new Set((roll.cov || []).map(Number));
  const key = `C|${c.id}`;
  const hc = dlObj_(c.hc);
  const out = [];
  for (let h = H - 24; h < H; h++) {
    const open = idx.get(h);
    if (open && h >= H - EWS_OPEN_HOURS_ - 1) {
      out.push(open.has(key) ? open.get(key).size : 0);
    } else if (hc[h] !== undefined && dlNum_(hc[h]) !== null) {
      out.push(Number(hc[h]));
    } else {
      out.push(cov.has(h) || open ? 0 : null);
    }
  }
  return out;
}

/**
 * A story's speed from its last full hour against the 3 hours before (their mean), with the reason: surging (at least
 * EWS_MIN_CLUSTER_VEL_AUTHORS_ accounts, and EWS_MIN_MULT_ times or EWS_HARD_DELTA_ more: the producer's own spike
 * rule, last / (before + 2)), rising (a quarter more, at least one more), slowing (a quarter fewer, at least one fewer),
 * steady; unknown when an hour of the four was not read. Pure.
 */
function dlSpeedOf_(last, before) {
  if (last === null || before === null) return { speed: 'unknown', why: 'Not every one of its last 4 hours was read, so its speed is not known' };
  const words = `${last} account${last === 1 ? '' : 's'} in the last full hour, against ${before} an hour in the 3 hours before`;
  if (last >= EWS_MIN_CLUSTER_VEL_AUTHORS_ && (last / (before + 2) >= EWS_MIN_MULT_ || last - before >= EWS_HARD_DELTA_)) {
    return { speed: 'surging', why: words };
  }
  const step = Math.max(1, 0.25 * before);
  if (last - before >= step) return { speed: 'rising', why: words };
  if (before - last >= step) return { speed: 'slowing', why: words };
  return { speed: 'steady', why: words };
}

/** True when the story is at or past the producer's promotion bar now (EarlyWaveSource.gs ewsPromote_'s own tests, its cooldown aside). Pure. */
function dlAtBar_(c, now) {
  const w = ewsStoryWindow_(c, now);
  if (!w) return false;
  const minAuthors = Math.max(2, EWS_MIN_AUTHORS_ - (w.platforms.length >= 2 ? EWS_PLATFORM_DISCOUNT_ : 0));
  if ((w.allPlatforms || w.platforms).length < 1 || w.urls < EWS_MIN_URLS_ || w.authors < minAuthors) return false;
  return !(w.texts * 3 <= w.authors && !w.brand);
}

/**
 * The stories in the producer's cache, read-only: {list (SPEC 3.1 Cluster, the most important first, at most
 * DL_CLUSTERS_MAX_), count (the chunks the producer says it wrote), missing (of those, the ones the cache no longer
 * has), at (its last check), all (the stories as the cache keeps them), byId (each one's Cluster, by its id)}. A missing chunk is counted, never taken for "no stories" (EarlyWaveSource.gs
 * ewsLoadClusters_ would drop it silently). Never throws.
 */
function dlClusters_(props, now, cards, edTab) {
  const out = { list: [], count: 0, missing: 0, at: 0, all: [], byId: new Map() };
  try {
    const st = ewsState_(props);
    out.at = headStartTime_(st.at);
    out.count = Math.max(0, Math.round(Number(st.cl) || 0));
    const cache = CacheService.getScriptCache();
    const keys = [];
    for (let i = 0; i < out.count; i++) keys.push(`${EWS_CACHE_PREFIX_}cl:${i}`);
    let got = {};
    try { got = keys.length ? cache.getAll(keys) || {} : {}; } catch (e) { got = {}; }
    const stories = [];
    keys.forEach(k => {
      const list = typeof got[k] === 'string' ? dlJson_(got[k]) : null;
      if (!Array.isArray(list)) { out.missing++; return; }
      list.forEach(c => { if (c && typeof c === 'object' && c.id) stories.push(c); });
    });
    const roll = ewsRollup_(props);
    const idx = dlAccIndex_(ewsAcc_(ewsCacheGet_(cache, 'acc')));
    const ends = dlEndingsByCluster_(edTab);
    out.all = stories;
    const list = stories.map(c => dlClusterOf_(c, now, roll, idx, cards, ends));
    list.forEach(x => out.byId.set(x.id, x));
    list.sort((x, y) => y.importance - x.importance || (y.lastAt || 0) - (x.lastAt || 0) || (x.id < y.id ? -1 : 1));
    let mark = 0;
    list.forEach(x => { x.mark = mark < 3 && (x.status === 'forming' || x.status === 'at the bar') ? ++mark : null; });
    out.list = list.slice(0, DL_CLUSTERS_MAX_);
  } catch (e) { /* none read */ }
  return out;
}

/**
 * The newest Early Detection ending (dlEdTab_'s rows, newest first) of each story, by its cluster id (a story signal's
 * id is "ED-CLU-<cluster id>-<stamp>", an early signal's "ED-WAT-<cluster id>-<stamp>"). Pure.
 */
function dlEndingsByCluster_(edTab) {
  const out = new Map();
  ((edTab && edTab.rows) || []).forEach(r => {
    const m = String(r.id || '').match(/^ED-(?:CLU|WAT)-(.+)-\d{12}$/);
    if (m && !out.has(m[1])) out.set(m[1], r);
  });
  return out;
}

/**
 * One story as the snapshot shows it (SPEC 3.1 Cluster). Its level (SPEC 3.2): a carded story takes its card's; else a
 * P0 risk group high, a P1 group medium, else low, one step up (high at most) when it is at the bar and rising or
 * surging; never critical before a review. importance = level, then speed, then accounts (in that order of weight).
 * `idx`: dlAccIndex_; `cards`: dlCardsByCluster_; `ends`: dlEndingsByCluster_. Pure but for GEN.
 */
function dlClusterOf_(c, now, roll, idx, cards, ends) {
  const members = (Array.isArray(c.m) ? c.m : []).filter(m => m && typeof m === 'object');
  const accounts = new Set(members.map(m => m.a).filter(Boolean)).size;
  const platforms = Array.from(new Set(members.map(m => dlText_(m.p)).filter(Boolean))).sort();
  const engs = members.map(m => m.e).filter(e => typeof e === 'number' && isFinite(e));
  const times = members.map(m => Number(m.t)).filter(t => t > 0);
  const perHour = dlPerHour_(c, roll, idx, now);
  const lastHour = perHour[23];
  const prev = perHour.slice(20, 23);
  const prevHours = prev.every(x => x !== null) ? Math.round((prev.reduce((s, x) => s + x, 0) / 3) * 10) / 10 : null;
  const sp = dlSpeedOf_(lastHour, prevHours);
  const riskKeys = Array.from(new Set([].concat.apply([], members.map(m => (m.r ? String(m.r).split(',') : []))).map(s => s.trim()).filter(Boolean)));
  const tierOf = k => (EWS_RISK_GROUPS_.find(g => g.key === k) || {}).tier || '';
  const atBar = dlAtBar_(c, now);
  const card = cards.get(c.id) || null;
  const tabRow = ends.get(String(c.id)) || null;
  let carded = null;
  let level = 'low';
  const levelWhy = [];
  if (card) {
    carded = { alertId: card.a.id, at: card.at || null, decision: card.a.decision, link: card.a.chatLink };
    level = card.a.level;
    levelWhy.push(`Its card ${card.a.id}: ${card.a.levelWhy}`);
  } else if (tabRow && (tabRow.group === 'cards' || tabRow.group === 'under')) {
    carded = { alertId: tabRow.card || '', at: tabRow.at, decision: tabRow.outcome, link: '' };
    levelWhy.push(`Its card${tabRow.card ? ` ${tabRow.card}` : ''} is not among the alerts read here, so its review's level is not known (shown as low)`);
  } else {
    const p0 = riskKeys.filter(k => tierOf(k) === 'P0');
    const p1 = riskKeys.filter(k => tierOf(k) === 'P1');
    const names = ks => ks.map(k => ED_RISK_WORDS_[k] || k).join(', ');
    if (p0.length) { level = 'high'; levelWhy.push(`P0 risk words: ${names(p0)}`); }
    else if (p1.length) { level = 'medium'; levelWhy.push(`P1 risk words: ${names(p1)}`); }
    else levelWhy.push(riskKeys.length ? `Only P2 risk words: ${names(riskKeys)}` : 'No risk words in its posts');
    if (atBar && (sp.speed === 'rising' || sp.speed === 'surging') && level !== 'high') {
      level = dlLevelUp_(level, 'high');
      levelWhy.push(`One step up: at the bar for a card and ${sp.speed}`);
    }
  }
  const held = !carded && tabRow && (tabRow.group === 'letgo' || tabRow.group === 'never');
  const status = carded ? 'carded' : held ? 'held' : atBar ? 'at the bar' : 'forming';
  const importance = (dlRank_(level) + 1) * 1000 + DL_SPEED_RANK_[sp.speed] * 100 + Math.min(accounts, 99);
  return {
    id: String(c.id), label: dlPlain_(c.lab, 160), topic: ewsStoryTopic_(c), platforms, accounts, posts: Math.max(members.length, Number(c.n) || 0),
    postsKept: members.length, engagement: engs.length ? engs.reduce((s, x) => s + x, 0) : null,
    firstAt: times.length ? Math.min.apply(null, times) : headStartTime_(c.t0) || null,
    lastAt: times.length ? Math.max.apply(null, times) : headStartTime_(c.ts) || null,
    perHour, lastHour, prevHours, speed: sp.speed, speedWhy: sp.why, level, levelWhy,
    risk: riskKeys.map(k => ED_RISK_WORDS_[k] || k), atBar, carded, importance, mark: null, status,
    heldWhy: held ? `${tabRow.outcome}: ${tabRow.why}` : '',
  };
}

/** The Early Detection cards of the alerts read, by their story's cluster id (the newest card of each). Pure. */
function dlCardsByCluster_(alerts) {
  const out = new Map();
  alerts.forEach(x => {
    if (!dlCardKind_(x.kind)) return;
    const cid = dlText_(dlObj_(dlObj_(x.row.forwarded_fields).early_detection).cluster_id);
    if (cid && (!out.has(cid) || (out.get(cid).at || 0) <= (x.at || 0))) out.set(cid, x);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Health: is the bot keeping up, and what can't this page see?
// ---------------------------------------------------------------------------------------------------------------

/** How often Early Detection checks, as the bot works it out (OpenEngine.gs openCheckMs_), from the switches as read. Never throws. */
function dlEdEveryMs_(sw, now) {
  try {
    if (!(sw.openEngine === true && sw.earlyWave === true)) return EW_EVERY_MS_;
    const set = Math.round(Number((GEN.settings || {}).open_check_minutes));
    const base = set >= 1 ? Math.min(15, set) : 5;
    const step = openUsage_(now).step;
    return (step >= 2 ? Math.max(base, 15) : step >= 1 ? Math.max(base, 10) : base) * DL_MIN_MS_;
  } catch (e) {
    return EW_EVERY_MS_;
  }
}

/** One source's freshness: {key, label, at, state: fresh|late|off|missing, note}. Pure. */
function dlSource_(key, label, on, at, lateMs, now, note) {
  const s = { key, label, at: at || null, state: 'fresh', note: note || '' };
  if (!on) { s.state = 'off'; return s; }
  if (!at) { s.state = 'missing'; s.note = s.note || 'No record of it running yet'; return s; }
  if (now - at > lateMs) { s.state = 'late'; s.note = [`Last ran ${dlAgo_(now - at)}`, s.note].filter(Boolean).join('; '); }
  return s;
}

/**
 * The bot's health (SPEC 3.1 health): {level ok|late|stopped|unknown, headline, why, fix, lastRunAt, status (B5),
 * sources, cannotSee}. The last run is the later of LAST_RUN (main-flow runs) and Control B6 (written by every run);
 * stopped past 10 minutes (the bot's own rule) or while paused; late past 5 minutes, while B5 reports a problem, or when
 * a source that is ON is late or has no record. Never ok on late or missing data. Never throws.
 */
function dlHealth_(ctx, props, log, cl, now, msgs) {
  const sw = ctx.switches || {};
  let b5 = '';
  let b6 = '';
  try {
    const v = ctx.control.getRange(5, 2, 2, 1).getValues();
    b5 = v[0][0];
    b6 = v[1][0];
  } catch (e) { /* unread */ }
  const lastRun = dlObj_(dlProp_(props, 'LAST_RUN'));
  const lrAt = Date.parse(String(lastRun.at || '')) || 0;
  const b6At = b6 instanceof Date ? b6.getTime() : dlLabelMs_(String(b6 || ''), now);
  const lastRunAt = Math.max(lrAt > 0 ? lrAt : 0, b6At) || 0;
  const status = dlPlain_(b5, 300);
  const sources = [];
  sources.push(dlSource_('run', 'The bot\'s runs (every minute)', true, lastRunAt, DL_RUN_OK_MS_, now, ''));
  // the Alert log is read, not timed (an hour without alerts is no fault): missing when it can't be read
  const logNote = log.error ? `It could not be read: ${log.error}` : !log.tab ? 'The bot\'s sheet has no Alert log tab'
    : !log.mine ? 'Its first row is not the bot\'s header, so it is not read' : '';
  const logSrc = dlSource_('alertLog', 'The Alert log (the bot\'s record of every alert)', true, log.newestAt || 0, Infinity, now, logNote);
  if (logNote) { logSrc.state = 'missing'; logSrc.at = null; }
  // read, with no alert recorded yet: current, with no time (the read time is never shown as a recorded one)
  else if (!log.newestAt) Object.assign(logSrc, { state: 'fresh', at: null, note: 'No alert recorded yet' });
  sources.push(logSrc);
  const edEvery = dlEdEveryMs_(sw, now);
  const edDay = dlObj_(dlProp_(props, 'EARLY_DETECTION_TODAY'));
  sources.push(dlSource_('earlyWave', `Early Detection checks (row ${dlSwitchRow_('earlyWave') || 19}, ${dlEvery_(edEvery)})`,
    sw.earlyWave === true, dlPropMs_(props, 'EARLY_DETECTION_AT'), 2 * edEvery, now, edDay.problem ? dlPlain_(edDay.problem, 200) : ''));
  const st = ewsState_(props);
  const prodEvery = Math.max(edEvery, sw.openEngine === true && sw.earlyWave === true ? Math.max(DL_MIN_MS_, edEvery - DL_MIN_MS_) : EWS_EVERY_MS_);
  const prodNotes = [];
  const lastCheck = dlObj_(st.last);
  if (lastCheck.problem) prodNotes.push(`Its last check had a problem: ${dlPlain_(lastCheck.problem, 160)}`);
  if (cl.count && cl.missing === cl.count) prodNotes.push('Every story it followed is gone from the cache');
  else if (cl.missing) prodNotes.push(`${cl.missing} of ${cl.count} parts of its stories are gone from the cache, so some stories are missing here`);
  const prod = dlSource_('producer', 'Stories forming (the Early Detection producer\'s cache)', sw.earlyWave === true,
    headStartTime_(st.at), 2 * prodEvery, now, prodNotes.join('; '));
  if (prod.state === 'fresh' && (lastCheck.problem || cl.missing)) prod.state = 'late';
  sources.push(prod);
  const pw = dlObj_(dlProp_(props, 'PW_LAST'));
  const fails = Object.keys(dlObj_(pw.lanes)).filter(k => dlObj_(pw.lanes[k]).fail);
  const watch = dlSource_('watch', `Proactive watch (row ${dlSwitchRow_('proactiveWatch') || 34}, looks every 5 minutes)`,
    sw.proactiveWatch === true, headStartTime_(pw.at), DL_WATCH_LATE_MS_, now,
    fails.length ? `Its look at ${fails.join(' and ')} is failing: ${dlPlain_(dlObj_(dlObj_(pw.lanes[fails[0]]).fail).why, 160)}` : '');
  if (watch.state === 'fresh' && fails.length) watch.state = 'late';
  sources.push(watch);
  sources.push(dlSource_('directBq', `Direct BigQuery (row ${dlSwitchRow_('directBq') || 15}, checks every 5 minutes)`,
    sw.directBq === true, dlPropMs_(props, 'BQ_DIRECT_AT'), DL_DIRECT_LATE_MS_, now, ''));

  const age = lastRunAt ? now - lastRunAt : 0;
  const paused = /^\s*(?:\u23F8\uFE0F?\s*)?Paused\b/.test(String(b5 || ''));
  const problem = /^\s*(?:\u{1F534}\s*LIVE\s*·\s*)?\u26A0/u.test(String(b5 || ''));
  const bad = sources.filter(s => s.key !== 'run' && (s.state === 'late' || s.state === 'missing'));
  const out = { level: 'ok', headline: '', why: '', fix: '', lastRunAt: lastRunAt || null, status, sources, cannotSee: [] };
  if (!lastRunAt) {
    Object.assign(out, { level: 'unknown', headline: 'Can\'t be sure: the bot\'s last run is not recorded (Control B6 and its run record are blank or unreadable)',
      fix: 'If the bot was just set up, wait a minute. Otherwise the bot\'s account opens the Apps Script project and runs setup().' });
  } else if (paused) {
    Object.assign(out, { level: 'stopped', headline: 'Can\'t be sure: the bot is paused (Control B2 is OFF), so nothing new is reviewed',
      fix: 'Set Bot (Control B2) to ON to restart it.' });
  } else if (age > DL_RUN_STOPPED_MS_) {
    Object.assign(out, { level: 'stopped', headline: `Can't be sure: the bot last ran ${dlAgo_(age)} (it runs every minute, so it has stopped)`,
      fix: 'If it does not run again within a few minutes, the bot\'s account opens the Apps Script project and runs setup() (it makes the every-minute trigger again and asks for any permission it lacks).' });
  } else if (age > DL_RUN_OK_MS_) {
    Object.assign(out, { level: 'late', headline: `Can't be sure: the bot last ran ${dlAgo_(age)} (it runs every minute)`,
      fix: 'Wait a few minutes. If Last check (Control B6) does not move, read Status (B5).' });
  } else if (problem) {
    Object.assign(out, { level: 'late', headline: `Can't be sure: the bot reports a problem: ${status}`,
      fix: 'Read Status (Control B5); the bot tries again every minute.' });
  } else if (bad.length) {
    const s = bad[0];
    const rows = { earlyWave: dlSwitchRow_('earlyWave') || 19, producer: dlSwitchRow_('earlyWave') || 19, watch: dlSwitchRow_('proactiveWatch') || 34,
      directBq: dlSwitchRow_('directBq') || 15 };
    Object.assign(out, { level: 'late',
      headline: `Can't be sure: ${s.label}: ${s.state === 'missing' && s.key !== 'alertLog' ? 'no record of it running' : s.note}`,
      fix: s.key === 'alertLog' ? 'The Alert log is made by setup() and must keep its first row as the bot wrote it; open the bot\'s sheet to see why it can\'t be read.'
        : `Read its note in column C of the Control tab (row ${rows[s.key]}); it tries again at its next check.` });
  } else {
    out.headline = `The bot is running: it last ran ${dlAgo_(age)}.`;
  }
  out.why = out.level === 'ok' ? '' : [out.headline.replace(/^Can't be sure: /, ''), bad.length > 1 ? `${bad.length} sources are late or missing` : '']
    .filter(Boolean).join('; ');
  // Control row 56 ON only: when the bot ran, from its run log (RunLog.gs). OFF, nothing is read and there's no runLog
  if (sw.speedHonest === true) {
    try {
      out.runLog = dlRunLog_(runLogRead_(ctx.ss), now);
    } catch (e) {
      out.runLog = dlRunLog_({ ok: false, why: dlErr_(e) }, now);
    }
  }
  out.cannotSee = dlCannotSee_(sw, log, cl, now, msgs, out.runLog);
  return out;
}

/**
 * When the bot ran, for the Now strip (Control row 56 ON only), from its run log as RunLog.gs runLogRead_ reads it
 * (`log`): {ok, why, start, last, days, spans, more, open, notes}. spans: the stretches of the last 7 days in which the
 * bot was not running, paused, failing or not known (RUN_LOG_GAP_STATES_), newest first, at most 10, each {from, to,
 * state, words (RunLog.gs runLogWords_), open (still going at its last run)}; more: how many more of them there were;
 * open: the stretch still going {state, from, last} or null; notes: the plain lines after them (running the whole time,
 * where the log starts, no run recorded lately). Every time is one the run log recorded: what it can't say is said to
 * be not known, never worked out. Pure but for GEN.
 */
function dlRunLog_(log, now) {
  const l = log && typeof log === 'object' ? log : { ok: false, why: 'it could not be read' };
  const since = now - 7 * DL_DAY_MS_;
  const out = { ok: l.ok === true, why: l.ok === true ? '' : dlPlain_(l.why || 'it could not be read', 300), start: Number(l.start) || 0,
    last: Number(l.last) || 0, days: 7, spans: [], more: 0, open: null, notes: [] };
  if (!out.ok) {
    out.notes.push(`Not known: the "When the bot ran" tab could not be read (${dlRunLogWhy_(out.why)}).`);
    return out;
  }
  if (!out.start) {
    out.notes.push('Not known yet: its run log has no record. It starts at the bot\'s next run with row 56 ON.');
    return out;
  }
  const all = Array.isArray(l.spans) ? l.spans.filter(s => s && typeof s === 'object') : [];
  const open = all.find(s => s.open === true);
  if (open) out.open = { state: dlText_(open.state), from: Number(open.from) || 0, last: Number(open.to) || 0 };
  const gaps = all.filter(s => runLogGapState_(s.state) && Number(s.to) > since && Number(s.from) < now)
    .sort((p, q) => Number(q.from) - Number(p.from));
  out.more = Math.max(0, gaps.length - 10);
  out.spans = gaps.slice(0, 10).map(s => {
    const x = { from: Number(s.from), to: Number(s.to), state: dlText_(s.state),
      words: dlPlain_(`${runLogWords_(s)}${s.open === true ? ' (still going at its last run)' : ''}`, 400) };
    if (s.open === true) x.open = true;
    return x;
  });
  const quiet = out.last > 0 && now - out.last > RUN_LOG_GAP_MS_;
  const upTo = quiet ? `, up to its last recorded run (${dlClock_(out.last, now)})` : '';
  if (!gaps.length) {
    out.notes.push(out.start > since ? `It was running the whole time since its run log started${upTo}.`
      : `It was running the whole time in the last 7 days${upTo}.`);
  } else if (out.more) {
    out.notes.push(`And ${out.more} more stretch${out.more === 1 ? '' : 'es'} in the last 7 days: see the "When the bot ran" tab.`);
  }
  if (out.start > since) out.notes.push(`Its run log starts ${dlClock_(out.start, now)}: before then, not known.`);
  if (quiet) {
    out.notes.push(`No run is recorded after ${dlClock_(out.last, now)} (more than 10 minutes ago).`);
  }
  return out;
}

/** The reason the run log can't be read, without the words that already say so. Pure. */
function dlRunLogWhy_(why) {
  return String(why || 'it could not be read').replace(/^the "When the bot ran" tab could not be read: /, '') || 'it could not be read';
}

/**
 * What this page can't see, each {what, why, fix} in plain words: the standing gaps, and the ones of this moment.
 * `runLog` (dlRunLog_'s, Control row 56 ON only): when the bot was running before its run log starts, or at all when it
 * can't be read. Pure but for GEN.
 */
function dlCannotSee_(sw, log, cl, now, msgs, runLog) {
  const out = [
    { what: 'Whether the bot\'s every-minute trigger is installed and allowed to run',
      why: 'Apps Script shows a trigger only to the account that made it, and a trigger that lost its permission stops before the bot can write anything.',
      fix: 'If the last run is old, the bot\'s account opens the Apps Script project and runs setup().' },
    { what: 'Who is working on an alert', why: 'The bot keeps no owner per alert: "who has it" is worked out from the alert\'s state.', fix: '' },
    { what: 'Who each Social Alert email went to', why: 'The bot keeps the teams (their codes) on the alert, not the addresses.', fix: 'Open the email in Gmail to see its recipients.' },
  ];
  if (!log.tab) out.push({ what: 'Alerts', why: 'The bot\'s sheet has no Alert log tab yet.', fix: 'It is made by the bot\'s first run (setup()).' });
  else if (!log.mine) out.push({ what: 'Alerts', why: 'The Alert log tab\'s first row is not the bot\'s header, so it is not read.', fix: 'Put the tab back as the bot wrote it.' });
  else if (!dlLogReaches_(log, now - 7 * DL_DAY_MS_)) {
    out.push({ what: `Alerts before ${dlClock_(log.oldestAt, now)}`, why: `Only the newest ${DL_ALERT_ROWS_.toLocaleString('en-US')} rows of the Alert log are read, and they do not reach back 7 days.`, fix: '' });
  }
  if (sw.earlyWave !== true) out.push({ what: 'Stories forming', why: `Early Detection (row ${dlSwitchRow_('earlyWave') || 19}) is OFF, so the bot follows no stories.`, fix: 'Turn row 19 ON to follow them.' });
  else if (!cl.count) out.push({ what: 'Stories forming', why: 'The producer has kept no stories yet (or its last check found none).', fix: '' });
  else if (cl.missing) out.push({ what: 'Some stories forming', why: `${cl.missing} of ${cl.count} parts of the producer's stories are gone from the script cache.`, fix: 'They come back at its next check.' });
  if (sw.earlyWave === true) {
    out.push({ what: 'A story\'s history beyond its current state', why: 'The producer keeps each story\'s posts of the last 24 hours (the newest 60) and its hourly counts for 30 hours, nothing older.', fix: '' });
  }
  if (sw.proactiveWatch !== true) out.push({ what: 'The watch\'s flags', why: `The Proactive watch (row ${dlSwitchRow_('proactiveWatch') || 34}) is OFF.`, fix: '' });
  if (sw.directBq !== true) {
    out.push({ what: 'Direct BigQuery\'s posts', why: `Direct BigQuery (row ${dlSwitchRow_('directBq') || 15}) is OFF, so the bot reads no posts from BigQuery directly, and holds none back.`, fix: '' });
  }
  if (sw.trackOutcomes !== true) {
    out.push({ what: 'Replies to the Social Alerts sent', why: `Track post-alert outcomes (row ${dlSwitchRow_('trackOutcomes') || 21}) is OFF, so the bot does not read the email threads of its Social Alerts (no follow-up is tracked).`,
      fix: 'Check each Social Alert\'s email thread in Gmail.' });
  }
  if (msgs && !msgs.ok) {
    out.push({ what: 'Burson messages the bot could not review', why: msgs.why, fix: '' });
  } else if (msgs && msgs.reach === false) {
    out.push({ what: `Burson messages the bot could not review, before ${dlClock_(msgs.oldestAt, now)}`,
      why: `Only the newest ${DL_MESSAGE_ROWS_} rows of the Message log are read, and they do not reach back 24 hours.`,
      fix: 'Look for raw_forward and dead rows on the Message log tab.' });
  }
  if (runLog && typeof runLog === 'object') {
    if (runLog.ok !== true) {
      out.push({ what: 'When the bot was running', why: `The "When the bot ran" tab could not be read: ${dlRunLogWhy_(runLog.why)}.`,
        fix: 'Open the bot\'s sheet: the tab must keep the title the bot wrote in A1.' });
    } else if (!(Number(runLog.start) > 0)) {
      out.push({ what: 'When the bot was running', why: 'Its run log (Control row 56) has no record yet: it starts at the bot\'s next run. Until then the bot keeps no record of when it was running, so speed numbers can\'t be checked against it.',
        fix: '' });
    } else if (Number(runLog.start) > now - 7 * DL_DAY_MS_) {
      out.push({ what: `When the bot was running before ${dlClock_(runLog.start, now)}`,
        why: 'Its run log (Control row 56) starts then. Before that the bot kept no record of when it was running, so older speed numbers can\'t be checked against it.',
        fix: '' });
    }
  }
  return out;
}

/**
 * The Message log (the bot's record of each Chat message it handled; Store.gs MESSAGE_COLUMNS_), its newest rows,
 * read-only, when its header row is the bot's: {ok, why, reach, oldestAt, rows: [{message, at, kind ('raw_forward':
 * Burson's message forwarded as received, never reviewed; 'dead': given up on), flows, error}]} of the last 24 hours,
 * one per message: each flow that logged it is in `flows` ('auto-correct': its row's "ac|" mark; 'in place': a space the
 * bot works in itself, forwarding nothing: `isolated`, the source spaces of the Alert log's "(isolated)" partitions;
 * 'main': a space the main flow forwards from, `forwarding`; '' not known). reach is false when the rows read were cut
 * and do not reach back 24 hours (oldestAt: the oldest time read). Never throws.
 */
function dlMessages_(ss, now, isolated, forwarding) {
  const out = { ok: false, why: '', reach: true, oldestAt: 0, rows: [] };
  try {
    const sh = ss.getSheetByName(MESSAGE_TAB_);
    if (!sh) { out.why = 'The bot\'s sheet has no Message log tab yet (the bot makes it on its first run).'; return out; }
    const width = MESSAGE_COLUMNS_.length;
    const head = sh.getRange(1, 1, 1, width).getValues()[0].map(v => String(v).trim());
    if (!MESSAGE_COLUMNS_.every((c, i) => head[i] === c)) { out.why = 'The Message log tab\'s first row is not the bot\'s header, so it is not read.'; return out; }
    out.ok = true;
    const last = sh.getLastRow();
    if (last < 2) return out;
    const first = Math.max(2, last - DL_MESSAGE_ROWS_ + 1);
    const byName = new Map();
    let oldest = 0;
    sh.getRange(first, 1, last - first + 1, width).getValues().forEach(v => {
      const at = headStartTime_(v[1]);
      if (at && (!oldest || at < oldest)) oldest = at;
      const kind = dlText_(v[2]);
      if (kind !== 'raw_forward' && kind !== 'dead') return;
      if (!at || now - at > DL_DAY_MS_) return;
      const raw = dlText_(v[0]);
      const mark = (raw.match(/^([a-z]+)\|/) || [])[1] || '';
      const message = raw.replace(/^[a-z]+\|/, '');
      const space = message.split('/messages/')[0];
      const inPlace = !!(isolated && isolated.has(space));
      const main = !!(forwarding && forwarding.has(space));
      const flow = mark === 'ac' ? 'auto-correct' : mark || inPlace === main ? '' : inPlace ? 'in place' : 'main';
      const cur = byName.get(message);
      if (!cur) {
        const row = { message, at, kind, flows: [flow], error: dlPlain_(v[5], 200) };
        byName.set(message, row);
        out.rows.push(row);
        return;
      }
      if (cur.flows.indexOf(flow) < 0) cur.flows.push(flow);
      if (at < cur.at) cur.at = at;
      if (kind === 'raw_forward') cur.kind = kind;
      if (!cur.error) cur.error = dlPlain_(v[5], 200);
    });
    out.oldestAt = oldest;
    out.reach = first <= 2 || !oldest || oldest <= now - DL_DAY_MS_;
  } catch (e) {
    Object.assign(out, { ok: false, rows: [], why: `The Message log tab could not be read: ${dlErr_(e)}.` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Stuck items, now (look first / then), pressure, pipeline, early, held, questions
// ---------------------------------------------------------------------------------------------------------------

/** An item of the look-first list (SPEC 3.1 Item). Pure. */
function dlItem_(kind, id, title, why, level, text, view, filter, detail) {
  return { kind, id, title, why, level, action: { text, view, filter: filter || '', detail: detail || null } };
}

/**
 * What is stuck (SPEC 3.5): a draft waiting more than 30 minutes, a fix asked more than 60 minutes ago, a failed email
 * or review, Burson's alert still undecided (needs-person), a Burson message of the last 24 hours the bot could not
 * review (forwarded as received) or gave up on (the Message log, `msgs`), an Early Detection signal waiting for its
 * review more than 60 minutes (its level from its signal's priority, said), a Burson outbox row waiting (the bot's own
 * tab only; its seriousness is not kept: 'unknown'). Each {kind, id, title, why, level, since, action, view, filter,
 * detail}. Never throws.
 */
function dlStuck_(ss, props, alerts, now, msgs) {
  const out = [];
  const add = (x, why, since, level) => out.push({ kind: 'alert', id: x.a.id, title: x.a.issue || x.a.id, why, level: level || x.a.level,
    since: since || null, action: x.a.action.text, view: 'alerts', filter: `status:${x.status}`, detail: { kind: 'alert', id: x.a.id } });
  alerts.forEach(x => {
    const r = x.row;
    if (x.status === 'draft-waiting') {
      const since = headStartTime_(r.email_at) || headStartTime_(r.created_at);
      if (since && now - since > DL_DRAFT_STUCK_MS_) add(x, `Its Social Alert has waited ${dlAgo_(now - since).replace(/ ago$/, '')} to go out`, since);
    } else if (x.status === 'fix-asked') {
      const since = headStartTime_(r.created_at);
      if (since && now - since > DL_FIX_STUCK_MS_) add(x, `A fix was asked of Burson ${dlAgo_(now - since)} and no corrected alert has come`, since);
    } else if (x.status === 'failed') {
      add(x, dlText_(r.email_status) === 'failed' ? `Its Social Alert failed to go out${dlText_(r.email_error) ? `: ${dlPlain_(r.email_error, 160)}` : ''}`
        : 'Its review failed', headStartTime_(r.updated_at) || headStartTime_(r.created_at));
    } else if (x.status === 'needs-person') {
      const since = headStartTime_(r.created_at);
      add(x, dlText_(r.originalUnread) ? dlUnreadWhy_(r) : `The bot recorded it ${dlAgo_(now - since)} and has made no decision on it`, since);
    }
  });
  // Burson's messages the bot could not review (forwarded as received) or gave up on: no alert row, so a person looks
  ((msgs && msgs.rows) || []).forEach(m => {
    const forwarded = m.kind === 'raw_forward';
    const flows = m.flows && m.flows.length ? m.flows : [''];
    const went = { main: 'went to the analyst space as received', 'auto-correct': 'went to the Auto-correct space as received',
      'in place': 'was not forwarded (the bot works in its own space there)',
      '': 'went on as received (to the analyst space, or nowhere where the bot works in the space itself)' };
    const open = { main: 'open it in the analyst space, where it was forwarded as received', 'auto-correct': 'open its copy in the Auto-correct space, where it was posted as received',
      'in place': 'open it in its space (the link)', '': 'open it (the link)' };
    const lead = flows.slice().sort((p, q) => ['main', 'auto-correct', 'in place', ''].indexOf(p) - ['main', 'auto-correct', 'in place', ''].indexOf(q))[0];
    out.push({ kind: 'stuck', id: `msg:${m.message}`, title: forwarded ? 'A Burson message the bot could not review' : 'A Burson message the bot gave up on',
      why: forwarded ? `The bot could not read or review it, so it ${Array.from(new Set(flows.map(f => went[f]))).join(', and ')}, with no review (its seriousness is not known)`
        : `The bot gave up on it after its tries${m.error ? ` (${m.error})` : ''}, so it has no review (its seriousness is not known)`,
      level: 'unknown', since: m.at,
      action: forwarded ? `Review it by hand: ${open[lead]}.`
        : 'Review it by hand: open it in the Burson space (the link), as the bot could not handle it.',
      view: 'pipeline', filter: 'stuck', detail: null, link: dlChatLink_(m.message) });
  });
  try {
    const queue = edQueueList_(props);
    queue.forEach((e, i) => {
      const at = headStartTime_(e.at);
      if (!at || now - at <= DL_QUEUE_STUCK_MS_) return;
      const row = dlProp_(props, ED_QUEUE_ROW_PREFIX_ + e.k) || {};
      const tries = Math.max(0, Math.round(Number(e.tries) || 0));
      const pri = String(e.pri || '').toUpperCase();
      const why = tries ? `Its review was started ${tries === 1 ? 'once' : `${tries} times`} and has not finished`
        : `It has waited ${dlAgo_(now - at).replace(/ ago$/, '')} for a review (${i === 0 ? 'next in line' : `${i} ahead of it`})`;
      const level = pri === 'P0' ? 'high' : pri === 'P1' ? 'medium' : 'low';
      out.push({ kind: 'stuck', id: String(e.id || e.k), title: dlPlain_(row.headline || row.signal_key || e.id || 'A story signal', 160),
        why: `${why}; ${level} because its signal's priority is ${pri || 'not set'}`, level, since: at,
        action: 'Nothing to do by hand: it is dropped after 3 hours if it is not reviewed; a busy run delays it.', view: 'pipeline', filter: 'stuck', detail: null });
    });
  } catch (e) { /* not read */ }
  try {
    const sh = ss.getSheetByName(OUTBOX_TAB_);
    if (sh && isOutboxTab_(sh) && sh.getLastRow() >= 2) {
      const last = sh.getLastRow();
      const first = Math.max(2, last - OUTBOX_READ_ROWS_ + 1);
      sh.getRange(first, 1, last - first + 1, 7).getValues().forEach((v, i) => {
        const st = dlText_(v[OUTBOX_STATUS_COL_ - 1]);
        if (st !== 'Pending' && st !== 'Send') return;
        const at = dlEtMs_(v[0], now);
        out.push({ kind: 'stuck', id: `outbox:${first + i}`, title: dlPlain_(v[OUTBOX_TEXT_COL_ - 1], 160) || 'A message for S-F Burson',
          why: `A ${dlText_(v[1]) || 'message'} for S-F Burson waits on the Burson outbox tab (${st})${dlText_(v[6]) ? `: ${dlPlain_(v[6], 160)}` : ''}; its seriousness is not kept`,
          level: 'unknown', since: at || null, action: 'Open the Burson outbox tab and set the row to Send or Skip.', view: 'pipeline', filter: 'stuck', detail: null });
      });
    }
  } catch (e) { /* not read */ }
  return out;
}

/**
 * Now, look first and then (SPEC 3.4): {level, headline, counts, first (3), then (5)}. When health is not ok: level
 * 'unknown', the headline says why first and the health item (with its fix) leads. Otherwise what needs a person (a
 * draft waiting, a fix asked over an hour ago, a failure, a stuck signal, Burson message or outbox row, and a decision of
 * the last 24 hours that hands the next step to a person: a T&S form to submit, the YouTube Social chat to ping) by
 * level then age, then the stories forming by importance, then the rest of the last 24 hours by level then newest. An
 * item needing a person whose seriousness is not known ranks just above high (never under a routine alert), and when it
 * leads, the level is 'unknown'. With Early Detection (row 19) OFF (`sw`), no story is followed: none is counted (null,
 * not 0) and the headline says so. Pure.
 */
function dlNow_(health, alerts, clusters, stuck, now, sw) {
  const following = !sw || sw.earlyWave === true;  // Early Detection (row 19) ON: the bot follows stories
  const since = now - DL_DAY_MS_;
  const recent = alerts.filter(x => x.status !== 'superseded' && (x.at || 0) >= since);
  const need = [];
  const seen = new Set();
  stuck.forEach(s => { need.push(dlItem_(s.kind, s.id, s.title, s.why, s.level, s.action, s.view, s.filter, s.detail)); seen.add(`${s.kind}:${s.id}`); need[need.length - 1]._since = s.since || now; });
  alerts.forEach(x => {
    if (x.status !== 'draft-waiting' || seen.has(`alert:${x.a.id}`)) return;
    const it = dlItem_('alert', x.a.id, x.a.issue || x.a.id, x.a.owner.why, x.a.level, x.a.action.text, 'alerts', 'status:draft-waiting', { kind: 'alert', id: x.a.id });
    it._since = headStartTime_(x.row.email_at) || x.at || now;
    need.push(it);
    seen.add(`alert:${x.a.id}`);
  });
  recent.forEach(x => {
    if (!dlHandedOver_(x) || seen.has(`alert:${x.a.id}`)) return;
    const it = dlItem_('alert', x.a.id, x.a.issue || x.a.id, x.a.owner.why, x.a.level, x.a.action.text, 'alerts', 'status:done', { kind: 'alert', id: x.a.id });
    it._since = x.at || now;
    need.push(it);
    seen.add(`alert:${x.a.id}`);
  });
  // seriousness not known (a Burson message with no review, an outbox row) is never ranked under a known routine one
  const rankOf = l => (l === 'unknown' ? dlRank_('high') + 0.5 : dlRank_(l));
  need.sort((p, q) => rankOf(q.level) - rankOf(p.level) || p._since - q._since);
  const forming = clusters.filter(c => c.status === 'forming' || c.status === 'at the bar')
    .map(c => dlItem_('cluster', c.id, c.label || c.topic, `${c.accounts} account${c.accounts === 1 ? '' : 's'} on ${c.platforms.join(', ') || 'no platform named'}, ${c.speed}; ${c.status}`,
      c.level, c.atBar ? 'It is at the bar for a card: the bot reviews it at its next check. Open it to see its posts.'
        : 'Nothing to do yet: it is below the bar for a card. Open it to see its posts.', 'map', `id:${c.id}`, { kind: 'cluster', id: c.id }));
  const rest = recent.filter(x => !seen.has(`alert:${x.a.id}`))
    .sort((p, q) => q.rank - p.rank || (q.at || 0) - (p.at || 0))
    .map(x => dlItem_('alert', x.a.id, x.a.issue || x.a.id, `${x.a.status.label}: ${x.a.levelWhy}`, x.a.level, x.a.action.text, 'alerts', '', { kind: 'alert', id: x.a.id }));
  const ranked = need.concat(forming, rest).map(it => { delete it._since; return it; });
  const byLevel = { critical: 0, high: 0, medium: 0, low: 0 };
  recent.forEach(x => { byLevel[x.a.level] = (byLevel[x.a.level] || 0) + 1; });
  const counts = Object.assign({ needAction: need.length, stuck: stuck.length, alerts24h: recent.length,
    forming: following ? clusters.filter(c => c.status === 'forming').length : null,
    atBar: following ? clusters.filter(c => c.status === 'at the bar').length : null }, byLevel);
  if (health.level !== 'ok') {
    const item = dlItem_('health', 'health', health.headline, health.why, 'unknown', health.fix, 'health', '', null);
    return { level: 'unknown', headline: health.headline, counts, first: [item].concat(ranked.slice(0, 2)), then: ranked.slice(2, 7) };
  }
  const pool = need.concat(forming, rest);
  const top = pool.slice().sort((p, q) => rankOf(q.level) - rankOf(p.level))[0] || null;
  const level = top ? top.level : 'low';
  const n = need.length;
  const needWords = n ? `${n} item${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} a person now.` : 'Nothing needs a person now.';
  const stories = following ? 'and no story is forming' : `and stories are not followed (Early Detection, row ${dlSwitchRow_('earlyWave') || 19}, is OFF)`;
  const headline = !top ? `${needWords} No alerts came in the last 24 hours, ${stories}.`
    : n ? `${needWords} Most serious: ${top.title} (${top.level === 'unknown' ? 'seriousness not known' : top.level}: ${top.why}).`
      : `${needWords} Most serious in the last 24 hours: ${top.title} (${top.level === 'unknown' ? 'seriousness not known' : top.level}: ${top.why}).`;
  return { level, headline, counts, first: ranked.slice(0, 3), then: ranked.slice(3, 8) };
}

/**
 * Where pressure is building (SPEC 3.5): alert counts (one per post, resends and test copies aside) by issue, product
 * and platform for the last 24 hours against the 24 before, and 7 days against the 7 before, the biggest rises first;
 * the stories' speed leaders; the bot's own load (row 51 ON only). A window the rows read don't reach back to is said
 * (complete: false), never counted short. Never throws.
 */
function dlPressure_(alerts, log, clusters, sw, props, now, runLog) {
  const reach = since => dlLogReaches_(log, since);
  const complete = { day: reach(now - DL_DAY_MS_), prevDay: reach(now - 2 * DL_DAY_MS_), week: reach(now - 7 * DL_DAY_MS_),
    prevWeek: reach(now - 14 * DL_DAY_MS_) };
  const rows = alerts.filter(x => x.status !== 'superseded' && x.kind !== 'sheet' && x.at);
  const tally = (pick, keyOf) => {
    const m = new Map();
    rows.forEach(x => {
      const name = dlText_(pick(x));
      if (!name) return;
      const k = keyOf(name);
      if (!m.has(k)) m.set(k, { name, w: { now24: new Set(), prev24: new Set(), now7: new Set(), prev7: new Set() } });
      const age = now - x.at;
      const e = m.get(k).w;
      if (age <= DL_DAY_MS_) e.now24.add(x.key);
      else if (age <= 2 * DL_DAY_MS_) e.prev24.add(x.key);
      if (age <= 7 * DL_DAY_MS_) e.now7.add(x.key);
      else if (age <= 14 * DL_DAY_MS_) e.prev7.add(x.key);
    });
    return Array.from(m.values()).map(g => {
      const now24 = g.w.now24.size;
      const prev24 = complete.prevDay ? g.w.prev24.size : null;
      const now7 = complete.week ? g.w.now7.size : null;
      const prev7 = complete.prevWeek ? g.w.prev7.size : null;
      return { name: g.name, now24, prev24, change24: prev24 === null ? null : now24 - prev24, now7, prev7,
        change7: now7 === null || prev7 === null ? null : now7 - prev7 };
    }).filter(g => g.now24 || g.prev24 || g.now7 || g.prev7)
      .sort((p, q) => (q.change24 === null ? q.now24 : q.change24) - (p.change24 === null ? p.now24 : p.change24) || q.now24 - p.now24 ||
        (q.now7 || 0) - (p.now7 || 0) || (p.name < q.name ? -1 : 1)).slice(0, 15);
  };
  const lower = s => s.toLowerCase();
  const out = {
    unit: 'alerts, one per post (a resend and the second test space\'s copy of the same post count once)',
    complete,
    note: complete.prevWeek ? '' : `The rows read (the newest ${DL_ALERT_ROWS_.toLocaleString('en-US')} of the Alert log) do not reach back 14 days, so the 7 days before are not counted.`,
    byIssue: tally(x => x.a.issue, issueNameKey_), byProduct: tally(x => x.a.product, lower), byPlatform: tally(x => x.a.platform, lower),
    speedLeaders: clusters.filter(c => c.speed === 'surging' || c.speed === 'rising')
      .sort((p, q) => DL_SPEED_RANK_[q.speed] - DL_SPEED_RANK_[p.speed] || (q.lastHour || 0) - (p.lastHour || 0)).slice(0, 5)
      .map(c => ({ id: c.id, label: c.label, speed: c.speed, why: c.speedWhy, lastHour: c.lastHour, prevHours: c.prevHours, level: c.level })),
    load: null,
  };
  if (sw.openEngine === true) {
    try {
      const u = openUsage_(now);
      const day = openDay_(now);
      out.load = { measured: true, runSec: u.runSec, budgetSec: u.budgetSec, share: Math.round(u.f * 1000) / 1000, calls: u.fetches,
        callBudget: u.fetchBudget, callsCounted: u.counted, pickupP90Sec: u.pickup.p90, pickupRuns: u.pickup.n,
        today: { reviews: day.rev, quickLooks: day.ql, stop: day.stop ? { what: day.stop.k, at: day.stop.at || null } : null } };
      // Control row 56 ON only (OpenEngine.gs openPickup_): the pick-up time leaving out the alerts posted before the bot
      // came back, on its own line under the one above (which is as it was)
      if (sw.speedHonest === true) {
        out.load.pickupNote = dlPickupNote_(runLog, now, u.pickupC);
        if (u.pickupC) {
          out.load.pickupKeptP90Sec = u.pickupC.p90;
          out.load.pickupKept = u.pickupC.n;
        }
      }
    } catch (e) {
      out.load = { measured: false, why: `The bot's run-time record could not be read: ${dlErr_(e)}.` };
    }
  } else {
    out.load = { measured: false, why: `Not measured with row ${dlSwitchRow_('openEngine') || 51} OFF: the bot counts its own run time and outside calls against a budget only for the open engine.` };
  }
  return out;
}

/**
 * The pick-up time with Control row 56 ON, on its own line under the usual one (which counts every pick-up, as before):
 * today's pick-ups (Eastern) but those of alerts posted before the bot last came back after a stop, a pause or failing
 * runs (OpenEngine.gs openPickup_: RUN_LEDGER.pc; `kept`: openUsage_'s pickupC {p90, n, since}), counted from the run
 * row 56 was ON at first today (since). From the run log as the Now strip has it (`runLog`: dlRunLog_'s): when it can't
 * be read or has no record yet, nothing can be left out, and it says so. Pure but for GEN.
 */
function dlPickupNote_(runLog, now, kept) {
  const r = runLog && typeof runLog === 'object' ? runLog : {};
  const head = 'Leaving out alerts posted before the bot came back after a stop, a pause or failing runs (row 56): ';
  if (r.ok !== true) return `${head}not known, its run log can't be read (${dlRunLogWhy_(r.why)})`;
  if (!(Number(r.start) > 0)) return `${head}not known yet, its run log has no record (it starts at the bot's next run)`;
  const k = kept && typeof kept === 'object' ? kept : null;
  const since = k && Number(k.since) > 0 ? ` since ${dlClock_(Number(k.since), now)}` : '';
  if (!k || !(Number(k.n) > 0) || k.p90 === null || k.p90 === undefined) return `${head}none counted yet today${since}`;
  return `${head}90% within ${Math.round(Number(k.p90)).toLocaleString('en-US')} s (${Number(k.n).toLocaleString('en-US')} ` +
    `alert${Number(k.n) === 1 ? '' : 's'}${since})`;
}

/**
 * Where each alert of the last 7 days is (SPEC 3.5 pipeline): the stages Received, Reviewed, Fixes asked, Social Alert
 * drafted, Sent / T&S, Follow-up, Done, each with its count and what it counts; and what is stuck (dlStuck_). Pure.
 */
function dlPipeline_(alerts, stuck, now, sw) {
  const tracked = !sw || sw.trackOutcomes === true;  // Track post-alert outcomes (row 21): the bot reads the email threads
  const rows = alerts.filter(x => x.at && now - x.at <= 7 * DL_DAY_MS_);
  const n = fn => rows.filter(fn).length;
  const es = x => dlText_(x.row.email_status);
  const fu = x => dlObj_(dlObj_(x.row.email_input).followup);
  // one per email (and one per T&S form): a resend that took its original's email or T&S (dlChained_) counts with it
  const once = fn => new Set(rows.filter(fn).map(x => (es(x) ? dlText_(x.row.chainedFrom) : dlText_(x.row.tnsFrom) || dlText_(x.row.chainedFrom)) || x.a.id)).size;
  return {
    days: 7,
    stages: [
      { key: 'received', label: 'Received', count: rows.length, note: 'Every alert recorded (resends included)' },
      { key: 'reviewed', label: 'Reviewed', count: n(x => ['needs-review', 'needs-person'].indexOf(x.status) < 0), note: 'A decision, a Social Alert, a fix asked or a T&S form' },
      { key: 'fixes', label: 'Fixes asked', count: n(x => Array.isArray(x.row.requested) && x.row.requested.length > 0),
        note: 'Corrections or missing details recorded (in the Auto-correct space the bot corrects them itself and asks Burson nothing)' },
      { key: 'drafted', label: 'Social Alert drafted', count: once(x => ['pending', 'drafted', 'sent', 'failed'].indexOf(es(x)) >= 0), note: 'A Social Alert made (drafted, sent, or not yet out)' },
      { key: 'sent', label: 'Sent / T&S', count: once(x => es(x) === 'sent' || x.a.tns.submitted), note: 'A Social Alert sent, or the T&S form submitted' },
      tracked ? { key: 'followup', label: 'Follow-up', count: once(x => es(x) === 'sent' && (Number(fu(x).read) > 0 || Object.keys(dlObj_(fu(x).replied)).length > 0 || !!fu(x).question)),
        note: 'A sent Social Alert whose email thread the bot has read for replies' }
        : { key: 'followup', label: 'Follow-up', count: null, note: `Not tracked with row ${dlSwitchRow_('trackOutcomes') || 21} OFF (Track post-alert outcomes): the bot reads no replies` },
      { key: 'done', label: 'Done', count: n(x => (x.status === 'done' && !dlHandedOver_(x)) || x.status === 'no-action'), note: 'Closed: resolved, no action, or nothing left to do (a T&S form or a YouTube ping left for a person is not)' },
    ],
    stuck: stuck.map(s => ({ kind: s.kind, id: s.id, title: s.title, why: s.why, level: s.level, since: s.since, action: s.action, detail: s.detail,
      link: s.link || '' })),
  };
}

/**
 * How early things were caught (SPEC 3.5 early): the Head start tab as the bot wrote it (its own only), read-only: {ok,
 * why (when it can't be read), rebuilt (its "Rebuilt ... ET" words), numbers: [{label, week, month}], stories: [{type,
 * at, story, link, product, tag, bursonAt, headStart, imsAt, imsHeadStart, matchedOn, appAlert, postBursonAt, postHeadStart}]}.
 * With Control row 56 ON (`sw.speedHonest`) only, each story also has `speedCheck`: its cell of the column the tab
 * has then, "Speed check: was the bot running?" (HeadStart.gs HEAD_START_CHECK_HEADER_), found by its name in the
 * EVERY STORY header; until the tab has that column (its next rebuild), `speedCheckWhy` says so. Never throws.
 */
function dlEarly_(ss, sw) {
  const out = { ok: false, why: '', rebuilt: '', numbers: [], stories: [] };
  try {
    const sh = ss.getSheetByName(HEAD_START_TAB_);
    if (!sh) {
      out.why = 'The Head start tab is not there yet: the bot builds it from the Alert log (every 10 minutes) once it has alerts of its own to compare.';
      return out;
    }
    if (!isHeadStartTab_(sh)) {
      out.why = 'A tab named "Head start" that the bot did not make is in the way, so it is not read.';
      return out;
    }
    const last = sh.getLastRow();
    if (last < 2) { out.ok = true; return out; }
    const width = HEAD_START_STATE_COL_ - 1;
    const rng = sh.getRange(1, 1, last, width);
    const values = rng.getValues();
    let formulas = null;
    try { formulas = typeof rng.getFormulas === 'function' ? rng.getFormulas() : null; } catch (e) { formulas = null; }
    out.ok = true;
    const scope = dlText_(values[1] && values[1][0]);
    out.rebuilt = ((scope.match(/Rebuilt ([^.]*?ET)\./) || [])[1]) || '';
    const at = values.findIndex(v => dlText_(v[0]) === 'HEADLINE NUMBERS');
    if (at >= 0) {
      for (let i = at + 1; i < values.length; i++) {
        const v = values[i];
        if (!dlText_(v[0]) || (dlText_(v[1]) === '' && dlText_(v[2]) === '')) break;
        out.numbers.push({ label: dlText_(v[0]), week: dlText_(v[1]), month: dlText_(v[2]) });
      }
    }
    const every = values.findIndex(v => /^EVERY STORY/.test(dlText_(v[0])));
    if (every >= 0) {
      // Control row 56 ON only: the speed check column (after the hidden state columns, so outside `width`)
      const checks = sw && sw.speedHonest === true ? dlSpeedChecks_(sh, every, last) : null;
      for (let i = every + 2; i < values.length && out.stories.length < DL_ROWS_MAX_; i++) {
        const v = values[i];
        if (!dlText_(v[0]) || dlText_(v[0]) === 'None yet') break;
        const story = dlCellLink_(v[2], formulas && formulas[i] && formulas[i][2]);
        // the times as the bot wrote them ("yyyy-MM-dd HH:mm" ET): Sheets turns those cells into dates (the tab gives the
        // columns a date format), which are written back the same way, never left out
        const row = { type: dlText_(v[0]), at: dlTimeCell_(v[1]), story: dlPlain_(story.label, 160), link: dlUrl_(story.url),
          product: dlText_(v[3]), tag: dlText_(v[4]), bursonAt: dlTimeCell_(v[5]), headStart: dlText_(v[6]),
          imsAt: dlTimeCell_(v[7]), imsHeadStart: dlText_(v[8]), matchedOn: dlText_(v[9]), appAlert: dlText_(v[10]),
          postBursonAt: dlTimeCell_(v[14]), postHeadStart: dlText_(v[15]) };
        if (checks && checks.col) row.speedCheck = dlPlain_(checks.cells[i], 800);
        out.stories.push(row);
      }
      if (checks && !checks.col && out.stories.length) {
        out.speedCheckWhy = checks.why || 'The Head start tab has no "Speed check: was the bot running?" column yet: the bot adds it at its next rebuild (every 10 minutes).';
      }
    }
  } catch (e) {
    out.why = `The Head start tab could not be read: ${dlErr_(e)}.`;
  }
  return out;
}

/**
 * The Head start tab's speed check column (Control row 56 ON; HeadStart.gs): {col (1-based; 0 when the tab has none
 * yet), cells (its texts, by the index of the tab's rows from row 1), why (when it could not be read)}. `every`: the
 * index of the EVERY STORY title row (its header is the row after it). Read-only. Never throws.
 */
function dlSpeedChecks_(sh, every, last) {
  const none = why => ({ col: 0, cells: [], why: why || '' });
  try {
    const name = typeof HEAD_START_CHECK_HEADER_ === 'string' ? HEAD_START_CHECK_HEADER_ : 'Speed check: was the bot running?';
    const cols = sh.getLastColumn();
    if (!(cols >= HEAD_START_STATE_COL_)) return none();
    const head = sh.getRange(every + 2, 1, 1, cols).getValues()[0].map(dlText_);
    const col = head.indexOf(name) + 1;
    if (!col) return none();
    return { col, cells: sh.getRange(1, col, last, 1).getValues().map(v => dlText_(v[0])), why: '' };
  } catch (e) {
    return none(`The Head start tab's "Speed check: was the bot running?" column could not be read: ${dlErr_(e)}.`);
  }
}

/**
 * What was held back and why (SPEC 3.5 held), today and over the last 7 days: the Early Detection endings that are not
 * cards (let go and never reviewed, with their reasons; the fast triage's holds among them), the Watch detections not
 * posted (by their code, in plain words), Direct BigQuery's not-posted counts (kept for today only). Never throws.
 */
function dlHeld_(edTab, watchTab, props, now, sw) {
  const directOn = !sw || sw.directBq === true;
  const today = dlDays_(now, 1)[0] || '';
  const week = dlDays_(now, 7);
  const edRows = edTab.rows.filter(r => r.group === 'letgo' || r.group === 'never');
  const wRows = watchTab.rows.filter(r => DL_WATCH_HELD_[r.code]);
  const byOutcome = rs => {
    const m = new Map();
    rs.forEach(r => m.set(r.outcome, (m.get(r.outcome) || 0) + 1));
    return Array.from(m.entries()).map(([outcome, n]) => ({ outcome, n })).sort((p, q) => q.n - p.n);
  };
  const byCode = rs => {
    const m = new Map();
    rs.forEach(r => m.set(r.code, (m.get(r.code) || 0) + 1));
    return Array.from(m.entries()).map(([code, n]) => ({ code, words: DL_WATCH_HELD_[code], n })).sort((p, q) => q.n - p.n);
  };
  const noise = r => r.outcome === ED_OUT_.noise;
  const direct = bqDirectDay_(dlPropRaw_(props, 'BQ_DIRECT_TODAY'));
  const edDay = dlObj_(dlProp_(props, 'EARLY_DETECTION_TODAY'));
  const part = (days, rs, ws) => ({
    earlyDetection: edTab.ok ? { total: rs.length, byOutcome: byOutcome(rs) } : null,
    fastTriage: edTab.ok ? rs.filter(noise).length : null,
    watch: watchTab.ok ? { total: ws.length, byCode: byCode(ws) } : null,
    days,
  });
  const edToday = edRows.filter(r => r.day === today);
  const wToday = watchTab.rows.filter(r => DL_WATCH_HELD_[r.code] && r.day === today);
  const t = part([today], edToday, wToday);
  t.direct = directOn ? { kept: true, a: direct.a, b: direct.b, o: direct.o, words: BQ_NOT_POSTED_WORDS_ }
    : { kept: false, why: `Direct BigQuery (row ${dlSwitchRow_('directBq') || 15}) is OFF: it reads no posts, so it holds none back.` };
  if (edDay.day === today && dlNum_(edDay.triaged) !== null) t.fastTriageToday = Number(edDay.triaged);
  const w = part(week, edRows.filter(r => week.indexOf(r.day) >= 0), wRows.filter(r => week.indexOf(r.day) >= 0));
  w.direct = { kept: false, why: directOn ? 'Direct BigQuery keeps its not-posted counts for today only.' : t.direct.why };
  return {
    today: t, week: w,
    earlyDetection: { ok: edTab.ok, why: edTab.why, rows: edRows.slice(0, DL_ROWS_MAX_) },
    watch: { ok: watchTab.ok, why: watchTab.why, rows: wRows.slice().sort((p, q) => (q.at || 0) - (p.at || 0)).slice(0, DL_ROWS_MAX_)
      .map(r => ({ at: r.at, day: r.day, watch: r.watch, post: r.post, network: r.network, author: r.author, issue: r.issue, code: r.code, why: DL_WATCH_HELD_[r.code] })) },
  };
}

/** A script property's raw text ('' when there is none). Never throws. */
function dlPropRaw_(props, key) {
  try { return String(props.getProperty(key) || ''); } catch (e) { return ''; }
}

/** The common questions (SPEC 3.5), each with its short answer from the snapshot and the view that shows it. Pure but for GEN. */
function dlQuestions_(s, alerts, now) {
  const q = (id, text, answer, view, filter) => ({ id, text, answer, view, filter: filter || '' });
  const out = [];
  const late = s.health.sources.filter(x => x.state === 'late' || x.state === 'missing');
  // only what is timed is named as current (the sources the health check looks at), never everything that is ON
  const names = { earlyWave: 'Early Detection', producer: 'its stories\' producer', watch: 'the Proactive watch', directBq: 'Direct BigQuery' };
  const current = s.health.sources.filter(x => names[x.key] && x.state === 'fresh').map(x => names[x.key]);
  const currentWords = current.length > 1 ? `${current.slice(0, -1).join(', ')} and ${current[current.length - 1]}` : current[0] || '';
  out.push(q('keeping-up', 'Is the bot keeping up?', s.health.level === 'ok'
    ? `Yes: ${s.health.headline.replace(/^The bot is running: /, '').replace(/\.$/, '')}${late.length || !current.length ? '' : `, and ${currentWords} ${current.length > 1 ? 'are' : 'is'} current`}.`
    : `No, or not for sure: ${s.health.headline.replace(/^Can't be sure: /, '')}.`, 'health'));
  const n = s.now.counts.needAction;
  const firstNeed = s.now.first.find(x => x.kind !== 'health' && x.kind !== 'cluster');
  out.push(q('needs-me', 'What needs me right now?', n ? `${n} item${n === 1 ? '' : 's'}: first, ${firstNeed ? `${firstNeed.title} (${firstNeed.why})` : s.now.first[0].title}.`
    : 'Nothing is waiting on a person right now.', 'now'));
  const lead = s.pressure.speedLeaders[0];
  const following = !s.switches || s.switches.earlyWave === true;
  out.push(q('fastest', 'Which story is growing fastest?', !following
    ? `No story is followed: Early Detection (row ${dlSwitchRow_('earlyWave') || 19}) is OFF.`
    : lead ? `${lead.label}: ${lead.speed} (${lead.why}).`
      : s.clusters.length ? 'No story is rising right now.' : 'No story is being followed right now.', 'map', lead ? `id:${lead.id}` : ''));
  const stuck = s.pipeline.stuck;
  out.push(q('stuck', 'What is stuck?', stuck.length ? `${stuck.length} item${stuck.length === 1 ? '' : 's'}: first, ${stuck[0].title} (${stuck[0].why}).`
    : 'Nothing is stuck.', 'pipeline', 'stuck'));
  const t = s.held.today;
  const parts = [];
  if (t.earlyDetection) parts.push(`${t.earlyDetection.total} stor${t.earlyDetection.total === 1 ? 'y' : 'ies'} let go or never reviewed${t.earlyDetection.byOutcome[0] ? ` (most: ${t.earlyDetection.byOutcome[0].outcome})` : ''}`);
  if (t.watch) parts.push(`${t.watch.total} Watch flag${t.watch.total === 1 ? '' : 's'} not posted`);
  if (t.direct.kept) parts.push(`${t.direct.a + t.direct.b + t.direct.o} Direct BigQuery post${t.direct.a + t.direct.b + t.direct.o === 1 ? '' : 's'} not posted`);
  out.push(q('held', 'What was held back today, and why?', parts.length ? `Today: ${parts.join('; ')}.` : 'Nothing that holds posts back is ON or readable today.', 'held'));
  const num = label => {
    const v = dlText_((s.early.numbers.find(x => x.label.indexOf(label) === 0) || {}).week);
    return !v || v === '\u2014' ? '' : v;
  };
  out.push(q('beat-burson', 'Did we beat Burson this week?', s.early.ok && s.early.numbers.length
    ? `Last 7 days (the Head start tab${s.early.rebuilt ? `, rebuilt ${s.early.rebuilt}` : ''}): of this app's own stories, Burson also alerted ` +
      `${num('Of those, also alerted by Burson') || 'none'}; this app was first on ${num('This app alerted first') || 'none of them'}, Burson on ` +
      `${num('Burson alerted first') || 'none'}.`
    : s.early.why || 'The Head start tab has no numbers yet.', 'early'));
  const fixed = alerts.filter(x => x.kind === 'burson' && x.at && now - x.at <= 7 * DL_DAY_MS_ && x.a.corrections > 0);
  const fields = new Map();
  fixed.forEach(x => (x.row.requested || []).forEach(r => {
    if (!r || typeof r !== 'object' || !('new' in r)) return;
    const name = ((fieldSpec_(r.field) || {}).label || String(r.field || '').replace(/_/g, ' ')).toLowerCase();
    fields.set(name, (fields.get(name) || 0) + 1);
  }));
  const total = Array.from(fields.values()).reduce((p, x) => p + x, 0);
  out.push(q('corrections', 'What did the bot correct on Burson\'s alerts?', fixed.length
    ? `In the last 7 days, ${total} correction${total === 1 ? '' : 's'} on ${fixed.length} of Burson's alerts: ${Array.from(fields.entries()).sort((p, r) => r[1] - p[1]).map(([f, c]) => `${f} (${c})`).join(', ')}.`
    : 'No corrections on Burson\'s alerts in the last 7 days.', 'alerts', 'corrected'));
  out.push(q('why-not', 'Why didn\'t a post get an alert?', 'Paste the post\'s link: the dashboard looks it up in everything the bot keeps.', 'whynot'));
  return out;
}

/**
 * The Burson-side spaces of the Alert log's partitions ("<space> > <analyst space>" or "<space> > (isolated)...", Main.gs
 * buildCtx_): [isolated (the bot works in that space itself and forwards nothing), forwarding (the main flow forwards
 * from it)], each a Set of space names. Pure.
 */
function dlFlowSpaces_(rows) {
  const isolated = new Set();
  const forwarding = new Set();
  (rows || []).forEach(r => {
    const p = dlText_(r.space);
    const src = p.split(' > ')[0];
    if (!src || p === src) return;
    const flow = amFlowOf_(p);
    if (flow === 'M' || flow === 'O') isolated.add(src);
    else if (flow === 'S') forwarding.add(src);
  });
  return [isolated, forwarding];
}

/** Builds the snapshot (dashSnapshot without the gate and the cache). Read-only. */
function dlSnapshotOf_(ctx) {
  const now = ctx.now;
  const props = PropertiesService.getScriptProperties();
  const sw = ctx.switches || {};
  const log = dlAlertRows_(ctx.ss, DL_ALERT_ROWS_);
  const all = dlAlertsOf_(log.rows, now, sw);
  const edTab = dlEdTab_(ctx.ss, now);
  const watchTab = dlWatchTab_(ctx.ss, now);
  const cl = dlClusters_(props, now, dlCardsByCluster_(all), edTab);
  // with Early Detection (row 19) OFF, the producer's cache is a frozen copy of the last stories: never shown as forming
  const stories = sw.earlyWave === true ? cl.list : [];
  const msgs = dlMessages_(ctx.ss, now, ...dlFlowSpaces_(log.rows));
  const health = dlHealth_(ctx, props, log, cl, now, msgs);
  const stuck = dlStuck_(ctx.ss, props, all, now, msgs);
  const week = all.filter(x => x.at && now - x.at <= 7 * DL_DAY_MS_);
  const snap = {
    ok: true, asOf: now, build: dashBuildInfo_(ctx), switches: Object.assign({}, sw), mode: ctx.mode,
    health, now: dlNow_(health, all, stories, stuck, now, sw), clusters: stories,
    alerts: week.slice().sort((p, q) => (q.at || 0) - (p.at || 0)).slice(0, DL_ALERTS_MAX_).map(x => x.a),
    alertsTotal: week.length,
    pressure: dlPressure_(all, log, stories, sw, props, now, health.runLog),
    pipeline: dlPipeline_(all, stuck, now, sw),
    early: dlEarly_(ctx.ss, sw),
    held: dlHeld_(edTab, watchTab, props, now, sw),
  };
  snap.questions = dlQuestions_(snap, all, now);
  let size = JSON.stringify(snap).length;
  while (size > DL_SNAP_MAX_CHARS_ && snap.alerts.length > 50) {
    snap.alerts = snap.alerts.slice(0, Math.floor(snap.alerts.length * 0.75));
    size = JSON.stringify(snap).length;
  }
  snap.alertsCut = snap.alerts.length < week.length;
  return snap;
}

// ---------------------------------------------------------------------------------------------------------------
// The detail panel (SPEC 3.7)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The messages of the given Chat threads, read now as the bot (a GET is never refused: Chat.gs chatCall_): {msgs
 * (normalized, Chat.gs normalizeMessage_), failed: [{thread, why}]}. Never posts. Never throws.
 */
function dlThreads_(threads) {
  const out = { msgs: [], failed: [] };
  threads.forEach(th => {
    const space = String(th).split('/threads/')[0];
    try {
      const r = chatCall_('get', `${space}/messages`, { query: { filter: `thread.name = ${th}`, pageSize: DL_THREAD_MAX_ } });
      if (!r || r.code >= 300) {
        out.failed.push({ thread: th, why: r ? `Chat answered ${r.code}${r.code === 403 || r.code === 404 ? ' (the bot is not in that space, or the thread is gone)' : ''}` : 'Chat did not answer' });
        return;
      }
      ((r.body && r.body.messages) || []).forEach(m => out.msgs.push(normalizeMessage_(m)));
    } catch (e) {
      out.failed.push({ thread: th, why: dlErr_(e) });
    }
  });
  return out;
}

/**
 * A Chat message's text as the panel shows it: its lines kept (the panel shows them as lines), Chat's marks taken out
 * (*bold*, _italic_, ~struck~, `code`, <link|label> as its label), no emoji, at most `max` characters. Pure.
 */
function dlChatText_(s, max) {
  const marks = [/(^|[\s([])\*(\S(?:[^*\n]*?\S)?)\*(?=$|[\s.,;:!?)\]])/g, /(^|[\s([])_(\S(?:[^_\n]*?\S)?)_(?=$|[\s.,;:!?)\]])/g,
    /(^|[\s([])~(\S(?:[^~\n]*?\S)?)~(?=$|[\s.,;:!?)\]])/g, /(^|[\s([])`(\S(?:[^`\n]*?\S)?)`(?=$|[\s.,;:!?)\]])/g];
  let t = String(s === undefined || s === null ? '' : s).replace(/\r\n?/g, '\n');
  marks.forEach(re => { t = t.replace(re, '$1$2'); });
  t = t.split('\n').map(line => dlPlain_(line)).filter((line, i, all) => line || (i > 0 && all[i - 1])).join('\n').trim();
  if (max && t.length > max) t = truncate_(t, max);
  return t;
}

/**
 * The detail's Chat list (SPEC 3.7 chat): the row's own messages (its source, forward and live messages) and every
 * message of their threads, oldest first, each {at, who, text, link, kind: alert|card|bot note|reply}; and cannotSee
 * entries when a thread could not be read (the row's own messages keep their links then). Never throws.
 */
function dlChatOf_(row, kind, info) {
  const own = dlCardKind_(kind) || kind === 'watch' || kind === 'direct' || kind === 'other' || kind === 'sheet';
  const top = new Map();
  [[row.source_message, row.source_at], [row.forward_message, row.created_at], [row.live_message, row.source_at]].forEach(([n, at]) => {
    const name = dlText_(n);
    if (name && !top.has(name)) top.set(name, headStartTime_(at) || null);
  });
  const threads = Array.from(new Set([row.source_thread, row.forward_thread, row.live_thread].map(dlText_)
    .filter(t => /^spaces\/[^/\s]+\/threads\/[^/\s]+$/.test(t))));
  const read = dlThreads_(threads);
  const isBot = m => (!!info.botUser && m.senderName === info.botUser) || /^client-bqa-/.test(String(m.clientId || ''));
  const items = new Map();
  read.msgs.forEach(m => {
    if (!m.name || items.has(m.name)) return;
    const k = top.has(m.name) ? (own ? 'card' : 'alert') : isBot(m) ? 'bot note' : 'reply';
    items.set(m.name, { at: Number(m.createTime) || null, who: isBot(m) ? 'the bot' : dlText_(m.senderDisplay) || (m.senderType === 'BOT' ? 'an app' : 'someone'),
      text: dlChatText_(m.text || m.cardText, DL_TEXT_MAX_), link: dlChatLink_(m.name), kind: k });
  });
  top.forEach((at, name) => {
    if (items.has(name)) return;
    items.set(name, { at, who: '', text: read.failed.length ? 'Not read (see what this page can\'t see)' : 'Not found in its thread', link: dlChatLink_(name),
      kind: own ? 'card' : 'alert' });
  });
  const cannotSee = read.failed.map(f => {
    const link = dlThreadLink_(f.thread);
    return { what: 'The messages of its Chat thread', why: `The thread could not be read: ${f.why}.`,
      fix: `${f.why.indexOf('403') >= 0 ? 'Only members of its space can read it.' : 'Open the panel again in a minute.'}${link ? ` The thread in Chat: ${link}` : ''}` };
  });
  const list = Array.from(items.values()).sort((p, q) => (p.at || 0) - (q.at || 0));
  return { list, cannotSee };
}

/** The alert's fields as reviewed (forwarded_fields, else its Social Alert's), the ones the panel shows. Pure. */
function dlFieldsOf_(row) {
  const ff = dlObj_(row.forwarded_fields);
  const ef = dlObj_(dlObj_(row.email_input).fields);
  const out = {};
  ['issue_name', 'issue_status', 'product', 'other_products', 'exposure_tag', 'priority', 'risk_tags', 'kof', 'kof_lists',
    'engagement_level', 'total_engagement', 'social_network', 'author', 'post_url', 'post_date', 'summary'].forEach(k => {
    const v = ff[k] !== undefined && ff[k] !== null && ff[k] !== '' ? ff[k] : ef[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
    out[k] = Array.isArray(v) ? v.map(dlText_) : typeof v === 'string' ? dlPlain_(v, 1500) : v;
  });
  return out;
}

/**
 * What happened to the alert, in time order, from the times its row keeps (SPEC 3.7 timeline). With Control row 56 ON
 * (`o.log`: the run log, RunLog.gs runLogRead_), Burson's alert that waited more than 10 minutes from reaching the space
 * to the bot picking it up says how long, right after "The bot picked it up", and why when the run log knows (the bot
 * was not running, paused or failing then, or it is not known). Pure but for GEN.
 */
function dlTimelineOf_(row, kind, o) {
  const out = [];
  const add = (at, what) => { const t = headStartTime_(at); if (t) out.push({ at: t, what }); };
  add(row.source_at, kind === 'burson' ? 'Burson\'s alert reached the space' : 'Its card was posted');
  add(row.seen_at, 'The bot picked it up');
  if (o && o.log && kind === 'burson') {
    const from = headStartTime_(row.source_at);
    const seen = headStartTime_(row.seen_at);
    if (from && seen && seen - from > RUN_LOG_GAP_MS_) {
      const c = runLogCheckIn_(o.log, from, seen);
      const more = c && Number(c.more) > 0 ? ` (and ${c.more} more stretch${Number(c.more) === 1 ? '' : 'es'})` : '';
      out.push({ at: seen, what: `It waited ${Math.round((seen - from) / DL_MIN_MS_).toLocaleString('en-US')} min for the bot to run` +
        (c ? `: ${dlPlain_(c.words, 400)}${more}` : '') });
    }
  }
  add(row.created_at, 'The bot recorded its review');
  const es = dlText_(row.email_status);
  if (headStartTime_(row.email_at) && headStartTime_(row.email_at) !== headStartTime_(row.email_sent_at)) {
    add(row.email_at, es === 'drafted' ? 'Its Social Alert was drafted' : es === 'pending' ? 'Its Social Alert was prepared (not out yet)'
      : es === 'failed' ? 'Its Social Alert failed' : 'Its Social Alert was handled');
  }
  add(row.email_sent_at, 'Its Social Alert was sent');
  add(row.tns_submitted, 'The bot submitted the T&S form');
  const fu = dlObj_(dlObj_(row.email_input).followup);
  Object.keys(dlObj_(fu.replied)).forEach(team => add(dlObj_(fu.replied[team]).at, `${team} replied on the email thread`));
  if (fu.question) add(dlObj_(fu.question).at, `${dlText_(fu.question.team) || 'A team'} asked a question on the email thread`);
  add(fu.resolved, 'Resolved on the email thread');
  add(row.bq_written, 'Written back to SLRR BigQuery');
  const last = headStartTime_(row.updated_at);
  if (last && !out.some(x => x.at === last)) out.push({ at: last, what: 'The last change to its row' });
  return out.sort((p, q) => p.at - q.at);
}

/** Alerts tied to this one: its resends, the same post's other rows, the card it updates and the cards that update it. Pure. */
function dlRelatedOf_(x, all, clusterIds) {
  const row = x.row;
  const id = x.a.id;
  const ed = dlObj_(dlObj_(row.forwarded_fields).early_detection);
  const out = [];
  const seen = new Set([id]);
  const add = (y, why) => { if (!y || seen.has(y.a.id)) return; seen.add(y.a.id); out.push({ kind: 'alert', id: y.a.id, title: y.a.issue, why }); };
  const byId = new Map(all.map(y => [y.a.id, y]));
  if (dlText_(row.resend_of)) add(byId.get(dlText_(row.resend_of)), 'Burson\'s earlier alert that this one resends');
  all.forEach(y => { if (dlText_(y.row.resend_of) === id) add(y, 'Burson\'s resend of this alert'); });
  if (dlText_(ed.update_of)) add(byId.get(dlText_(ed.update_of)), 'The card this one updates');
  all.forEach(y => { if (dlText_(dlObj_(dlObj_(y.row.forwarded_fields).early_detection).update_of) === id) add(y, 'An update of this card'); });
  const key = dlText_(row.record_key);
  if (key) {
    all.forEach(y => {
      if (y.a.id === id) return;
      const keys = [dlText_(y.row.record_key)].concat((dlObj_(dlObj_(y.row.forwarded_fields).early_detection).post_keys || []).map(dlText_));
      if (keys.indexOf(key) >= 0) add(y, 'Another alert on the same post');
    });
  }
  const cid = dlText_(ed.cluster_id);
  if (cid && clusterIds.has(cid)) out.push({ kind: 'cluster', id: cid, title: 'Its story, as the producer follows it now', why: 'The story this card is about' });
  return out;
}

/** One plain paragraph on what the alert is and where it stands (SPEC 3.7 explain). Pure. */
function dlExplainOf_(x) {
  const a = x.a;
  const parts = [`${DL_KIND_WORDS_[a.kind] || 'An alert'}${a.flow ? ` in the ${a.flow} flow` : ''}.`];
  if (a.corrections) parts.push(`The bot corrected ${a.corrections} detail${a.corrections === 1 ? '' : 's'} on it.`);
  parts.push(`Seriousness ${a.level}: ${a.levelWhy}.`);
  parts.push(`Status (worked out from its row): ${a.status.label}${a.decision ? `; the decision: ${a.decision}` : ''}.`);
  parts.push(`Who has it: ${a.owner.who} (${a.owner.why}).`);
  return parts.join(' ');
}

/** The posts of an alert (SPEC 3.7 posts): a story card's kept posts in time order, else its post links; else its own post. Pure. */
function dlAlertPosts_(x) {
  const row = x.row;
  const f = dlFieldsOf_(row);
  const ed = dlObj_(dlObj_(row.forwarded_fields).early_detection);
  const author = a => String(a || '').replace(/^[^:]*:/, '');
  if (dlCardKind_(x.kind)) {
    if (Array.isArray(ed.posts) && ed.posts.length) {
      return { kept: 'snapshot', posts: ed.posts.filter(p => p && dlUrl_(p.u)).map(p => ({ at: dlNum_(p.t), url: dlUrl_(p.u), author: author(p.a),
        platform: dlText_(p.p), text: '', engagement: null, source: 'kept with its card' })) };
    }
    const keys = Array.isArray(ed.post_keys) ? ed.post_keys.map(dlText_).filter(Boolean) : [];
    return { kept: 'keys', posts: keys.map(k => ({ at: null, url: dlUrl_(/^https?:\/\//.test(k) ? k : `https://${k}`), author: '', platform: '',
      text: '', engagement: null, source: 'its card\'s post links (no times kept)' })).filter(p => p.url) };
  }
  const url = dlUrl_(f.post_url);
  return { kept: 'post', posts: url ? [{ at: null, url, author: dlText_(f.author || row.author), platform: dlText_(f.social_network),
    text: dlPlain_(f.summary, 400), engagement: dlNum_(f.total_engagement), source: 'the alert' }] : [] };
}

/** The detail of one Alert-log row (dashDetail kind 'alert'). Read-only; its Chat thread read now. */
function dlAlertDetail_(ctx, props, info, log, id) {
  const now = ctx.now;
  const all = dlAlertsOf_(log.rows, now, ctx.switches || {});
  const x = all.find(y => y.a.id === id);
  if (!x) {
    return log.mine ? { ok: false, why: `${id} is not among the newest ${DL_ALERT_ROWS_.toLocaleString('en-US')} rows of the Alert log.`,
      todo: `Find ${id} on the Alert log tab of the bot's sheet (search the alert_id column).` }
      : { ok: false, why: 'The Alert log can\'t be read (it is not there, or its first row is not the bot\'s header).',
        todo: 'Open the bot\'s sheet: the Alert log tab is made by setup() and must keep its first row as the bot wrote it.' };
  }
  const row = x.row;
  const a = x.a;
  const input = dlObj_(row.email_input);
  const esc = dlObj_(input.escalation);
  const fu = dlObj_(input.followup);
  const requested = Array.isArray(row.requested) ? row.requested.filter(r => r && typeof r === 'object') : [];
  const label = k => ((fieldSpec_(k) || {}).label || String(k || '').replace(/_/g, ' '));
  const show = v => (Array.isArray(v) ? v.join(', ') : v === undefined || v === null ? '' : String(v));
  const corrections = requested.filter(r => 'new' in r).map(r => ({ field: label(r.field), old: show(r.old), new: show(r.new), reason: dlPlain_(r.reason, 300) }));
  const asked = a.flow === 'auto-correct' ? [] : requested.map(r => ('new' in r ? `${label(r.field)}: ${show(r.old)} to ${show(r.new)}`
    : `${label(r.field)}: ${dlPlain_(r.problem, 200)}${r.suggest ? ` (suggested: ${dlPlain_(show(r.suggest), 200)})` : ''}`));
  const thread = dlText_(row.email_thread);
  const gmail = /^[A-Za-z0-9_-]+$/.test(thread)
    ? `https://mail.google.com/mail/${info.mailbox ? `?authuser=${encodeURIComponent(info.mailbox)}` : 'u/0/'}#all/${thread}` : '';
  const sentBy = dlText_(row.email_sent_by);
  let followup = null;
  if (dlText_(row.email_status) === 'sent') {
    try {
      const st = followupStatus_(row, now, dlDeadlines_());
      followup = { status: st.status, text: dlPlain_(followupStatusText_(st, now), 300), next: a.action.text, teams: (st.teams || []).map(dlText_),
        replied: st.answered.map(dlText_), question: fu.question ? { team: dlText_(fu.question.team), at: headStartTime_(fu.question.at) || null,
          text: dlPlain_(fu.question.text, 300) } : null };
    } catch (e) { followup = null; }
  }
  const tnsAuto = dlObj_(input.tns_auto);
  const chat = dlChatOf_(row, x.kind, info);
  const cl = dlClusters_(props, now, dlCardsByCluster_(all), { rows: [] });
  const cannotSee = chat.cannotSee.slice();
  if (dlText_(row.email_status) === 'sent' || dlText_(row.email_status) === 'drafted') {
    cannotSee.push({ what: 'Who the email went to', why: 'The bot keeps the teams (their codes) on the alert, not the addresses.', fix: gmail ? 'Open it in Gmail.' : '' });
  }
  cannotSee.push({ what: 'Who is working on it', why: 'The bot keeps no owner per alert: "who has it" is worked out from its state.', fix: '' });
  if (dlCardKind_(x.kind) && !(Array.isArray(dlObj_(dlObj_(row.forwarded_fields).early_detection).posts))) {
    cannotSee.push({ what: 'Its story\'s posts in time order', why: 'Its card kept only its post links (posts in order are kept with a card only while row 54 is ON).', fix: '' });
  }
  if (!Object.keys(esc).length) {
    cannotSee.push({ what: 'Its escalation details', why: 'They are kept only for an alert that got a Social Alert.', fix: '' });
  }
  const posts = dlAlertPosts_(x);
  return {
    ok: true, kind: 'alert', id, title: a.issue || id, level: a.level, levelWhy: a.levelWhy, status: a.status, owner: a.owner, action: a.action,
    explain: dlExplainOf_(x), alertKind: x.kind, posts: posts.posts,
    chat: chat.list,
    alert: {
      fields: dlFieldsOf_(row), decision: a.decision, corrections, fixesAsked: asked,
      email: { status: dlText_(row.email_status), subject: dlPlain_(row.email_subject, 300), groups: dlTeams_(row),
        sentAt: headStartTime_(row.email_sent_at) || null, sentBy: !sentBy ? '' : sentBy === 'bot' ? 'the bot (Auto-send)'
          : sentBy.toLowerCase() === String(info.mailbox || '').toLowerCase() ? 'the bot\'s account' : sentBy, gmailLink: gmail },
      tns: { submitted: a.tns.submitted, at: headStartTime_(row.tns_submitted) || null, link: dlUrl_(tnsAuto.r) },
      escalation: Object.keys(esc).length ? { track: dlText_(esc.track), priority: dlText_(esc.priority), reasons: dlPlain_(escalationWhyText_(esc), 400) } : null,
      followup,
      ongoing: /^ongoing/i.test(dlText_(dlFieldsOf_(row).issue_status)) || dlText_(esc.status).toUpperCase() === 'ONGOING',
    },
    // Control row 56 ON only: Burson's alert's wait for the bot to run, from the run log (OFF: nothing more is read)
    timeline: dlTimelineOf_(row, x.kind, (ctx.switches || {}).speedHonest === true && x.kind === 'burson' ? { log: runLogRead_(ctx.ss) } : undefined),
    related: dlRelatedOf_(x, all, new Set(cl.all.map(c => String(c.id)))),
    cannotSee,
  };
}

/** The detail of one story in the producer's cache (dashDetail kind 'cluster'). Read-only. */
function dlClusterDetail_(ctx, props, info, log, id) {
  const now = ctx.now;
  const all = dlAlertsOf_(log.rows, now, ctx.switches || {});
  const edTab = dlEdTab_(ctx.ss, now);
  const cards = dlCardsByCluster_(all);
  const cl = dlClusters_(props, now, cards, edTab);
  const c = cl.all.find(s => String(s.id) === id);
  if (!c) {
    return { ok: false, why: 'This story is no longer in the producer\'s cache: a story leaves it 24 hours after its last post, or when the cache is cleared.',
      todo: 'If it got a card, find it in Alerts (a story card); how it ended is on the Early Detection tab, and in Held back when it was let go.' };
  }
  const s = cl.byId.get(String(c.id));
  const posts = (Array.isArray(c.m) ? c.m : []).filter(m => m && typeof m === 'object').slice()
    .sort((p, q) => (Number(p.t) || 0) - (Number(q.t) || 0))
    .map(m => ({ at: dlNum_(m.t), url: dlUrl_(m.u), author: String(m.a || '').replace(/^[^:]*:/, ''), platform: dlText_(m.p),
      text: dlPlain_(m.s, 300), engagement: dlNum_(m.e), source: whyNotSource_(m.i) || '' }));
  const card = cards.get(String(c.id));
  const chat = card ? dlChatOf_(card.row, card.kind, info) : { list: [], cannotSee: [] };
  const timeline = [];
  const add = (at, what) => { const t = headStartTime_(at); if (t) timeline.push({ at: t, what }); };
  add(s.firstAt, 'Its first post kept here');
  add(c.t0, 'The producer saw it as a story');
  const al = dlObj_(c.al);
  add(al.at, `It crossed the bar for a card (${dlNum_(al.au) || 0} accounts then)`);
  if (card) add(card.at, `Its card ${card.a.id} was posted`);
  add(c.ts, 'The last post joined it');
  timeline.sort((p, q) => p.at - q.at);
  const related = [];
  if (card) related.push({ kind: 'alert', id: card.a.id, title: card.a.issue, why: 'Its card' });
  edTab.rows.filter(r => r.id && (r.id.indexOf(`ED-CLU-${c.id}-`) === 0 || r.id.indexOf(`ED-WAT-${c.id}-`) === 0))
    .forEach(r => related.push({ kind: 'ending', id: r.id, title: r.outcome, why: r.why }));
  const cannotSee = chat.cannotSee.slice();
  if ((Number(c.n) || 0) > posts.length) {
    cannotSee.push({ what: `${(Number(c.n) || 0) - posts.length} of its earlier posts`, why: 'The producer keeps a story\'s posts of the last 24 hours, the newest 60.', fix: '' });
  }
  const action = s.status === 'carded' ? 'Open its card for what was decided.' : s.status === 'held' ? `Nothing to do: ${s.heldWhy}.`
    : s.atBar ? 'It is at the bar for a card: the bot reviews it at its next check.' : 'Nothing to do yet: it is below the bar for a card.';
  return {
    ok: true, kind: 'cluster', id, title: s.label || s.topic, level: s.level, levelWhy: s.levelWhy.join('; '),
    status: { key: s.status, label: s.status, derived: true },
    owner: { who: s.carded ? 'see its card' : 'the bot', why: s.carded ? 'Its card has it' : 'The bot follows it until it reaches the bar or fades', derived: true },
    action: { text: action },
    explain: `A story the bot follows from small accounts: ${s.accounts} account${s.accounts === 1 ? '' : 's'} on ${s.platforms.join(', ') || 'no platform named'}, ` +
      `${s.posts} post${s.posts === 1 ? '' : 's'} so far. Speed ${s.speed}: ${s.speedWhy}. Seriousness ${s.level}: ${s.levelWhy.join('; ')}.`,
    cluster: s, posts, chat: chat.list, alert: null, timeline, related, cannotSee,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Why didn't a post get an alert?
// ---------------------------------------------------------------------------------------------------------------

/**
 * What the Alert memory tab (the bot's own only: AlertMemory.gs isAlertMemoryTab_) remembers of a post: {o, ids, at} or
 * null. Reads its first column, then the one row. Never throws.
 */
function dlMemoryOf_(ss, key) {
  try {
    const sh = ss.getSheetByName(AM_TAB_);
    if (!key || !sh || !isAlertMemoryTab_(sh) || sh.getLastRow() < 2) return null;
    const keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    const i = keys.findIndex(v => String(v[0]).trim() === key);
    if (i < 0) return null;
    const rec = dlObj_(dlJson_(String(sh.getRange(i + 2, 2).getValue() || '')));
    return { o: String(rec.o || 's'), ids: Array.isArray(rec.ids) ? rec.ids.map(dlText_) : [],
      at: Math.max(headStartTime_(rec.l), headStartTime_(dlObj_(rec.e).at)) || null };
  } catch (e) {
    return null;
  }
}

/** dashWhyNot's answer (the gate and the switch passed). Read-only. */
function dlWhyNotOf_(ctx, url) {
  const now = ctx.now;
  const found = [];
  const rk = recordKey_({ post_url: url });
  const pk = amPostKey_(url);
  const log = dlAlertRows_(ctx.ss, DL_ALERT_ROWS_);
  dlAlertsOf_(log.rows, now, ctx.switches || {}).forEach(x => {
    const ed = dlObj_(dlObj_(x.row.forwarded_fields).early_detection);
    const own = (rk && dlText_(x.row.record_key) === rk) || (x.a.postUrl && amPostKey_(x.a.postUrl) === pk);
    const listed = !own && rk && (Array.isArray(ed.post_keys) ? ed.post_keys : []).map(dlText_).indexOf(rk) >= 0;
    if (!own && !listed) return;
    found.push({ where: 'Alert log', at: x.at || null, detail: { kind: 'alert', id: x.a.id },
      what: `${listed ? 'Listed on the story card' : DL_KIND_WORDS_[x.kind]} ${x.a.id}: ${x.a.status.label}${x.a.decision ? ` (${x.a.decision})` : ''}` });
  });
  const mem = dlMemoryOf_(ctx.ss, pk);
  if (mem) {
    found.push({ where: 'Alert memory', at: mem.at, detail: mem.ids.length ? { kind: 'alert', id: mem.ids[mem.ids.length - 1] } : null,
      what: `The bot remembers it: ${DL_MEMORY_WORDS_[mem.o] || DL_MEMORY_WORDS_.s}${mem.ids.length ? ` (${mem.ids.join(', ')})` : ''}` });
  }
  const edTab = dlEdTab_(ctx.ss, now);
  edTab.rows.filter(r => r.link && (amPostKey_(r.link) === pk || (rk && recordKey_({ post_url: r.link }) === rk)))
    .forEach(r => found.push({ where: 'Early Detection tab', at: r.at, detail: null, what: `The story whose main post it is: ${r.outcome}${r.why ? `: ${r.why}` : ''}` }));
  const facts = whyNotFacts_({ ss: ctx.ss }, url);
  if (facts.watch) {
    const w = facts.watch;
    found.push({ where: 'Watch detections tab', at: headStartTime_(w.s) || null, detail: null,
      what: `The Watch flagged it${w.w ? ` (${dlText_(w.w)})` : ''}: ${DL_WATCH_HELD_[w.a] || { p: 'posted as its own Watch alert', g: 'listed in its story\'s alert thread', u: 'listed under another alert\'s card', q: 'waiting to be posted' }[w.a] || 'flagged'}` });
  }
  // with Early Detection (row 19) OFF the producer's stories are as they were when it was turned OFF: never told as now
  const following = !!(ctx.switches && ctx.switches.earlyWave === true);
  const offWords = `Early Detection (row ${dlSwitchRow_('earlyWave') || 19}) was turned OFF`;
  if (facts.story) {
    const n = `${facts.story.accounts} account${facts.story.accounts === 1 ? '' : 's'}`;
    found.push({ where: 'Early Detection stories', at: facts.story.at || null, detail: null,
      what: `It joined the story "${dlPlain_(facts.story.lab, 100)}" (${following ? `${n} so far` : `${n} when ${offWords}; stories are not followed now`})` +
        `${facts.story.source ? `, read from ${facts.story.source}` : ''}` });
  } else if (facts.pool) {
    found.push({ where: 'Early Detection pool', at: facts.pool.at || null, detail: null,
      what: `${following ? 'It waits for other posts on the same story (none yet)' : `It was waiting for other posts on the same story when ${offWords} (stories are not followed now)`}` +
        `${facts.pool.source ? `, read from ${facts.pool.source}` : ''}` });
  }
  found.sort((p, q) => (q.at || 0) - (p.at || 0));
  const answer = found.length ? `The bot holds ${found.length} thing${found.length === 1 ? '' : 's'} about this post. ${found.map(f => `${f.what}.`).join(' ')}`
    : `Nothing the bot keeps mentions this post. ${whyNotText_({ memory: null, watch: null, story: null, pool: null }).replace(/^Why not: nothing is held here on this post: /, 'Either ')}`;
  const cannotSee = [];
  if (!dlLogReaches_(log, now - 30 * DL_DAY_MS_)) {
    cannotSee.push({ what: 'Older alerts', why: `Only the newest ${DL_ALERT_ROWS_.toLocaleString('en-US')} rows of the Alert log are looked through.`, fix: '' });
  }
  cannotSee.push({ what: 'Posts no source read', why: 'The bot only knows posts its sources (Burson, the listening data, the watches) brought in.', fix: '' });
  const todo = found.length ? '' : 'If this post should have had an alert, post its link in the analyst space or send it to the IM on shift.';
  return { ok: true, url, key: pk, found, answer: dlPlain_(answer, 2000), todo, cannotSee };
}
