/**
 * When the bot ran (Control row 56, "Speed numbers: leave out when the bot was not running"; switch key speedHonest).
 *
 * ON, every poll() run records when it ran, on a tab of the bot's own, "When the bot ran": one row per stretch of
 * time, each with its two ends as they were recorded (a run's own start, `runStart` in poll(), and the end of its
 * finally), never an estimate:
 *   running      runs with Bot (B2) ON, each starting at most 10 minutes (RUN_LOG_GAP_MS_) after the one before ended
 *   paused       runs with Bot (B2) OFF, until the first run with Bot ON starts (when it starts at most 10 minutes after
 *                the last paused run ended: no run was made in between, and the last one found Bot OFF)
 *   failing      runs that stopped with an error (poll()'s catch), and a run that ended without finishing (Apps Script
 *                stopped it: the next run takes over its claim, Main.gs runTookOver_), from its claim's start
 *   not running  no run recorded for more than 10 minutes: from the last recorded end to the next recorded start
 *   not known    row 56 was OFF in between, or the tab could not be written: from the last recorded end to the next start
 * Before the first row (the moment row 56 was first turned ON) nothing is known: older numbers can only be flagged.
 * The span still going lives in one script property, RUN_LOG_OPEN, so an ordinary run makes no Sheets call: the tab is
 * written only when the state changes. A run that finds the script lock taken, or another run's claim 4-25 minutes old,
 * records nothing: the run holding it covers that time with its own start and end.
 *
 * And when Bot (B2) is set back ON after a paused stretch the log recorded, the bot LISTS the Burson alerts posted
 * while it was OFF on a second tab of its own, "Burson while bot OFF" (runLogListOff_: a few Chat reads a run, after
 * everything else), without reviewing, posting, reacting or emailing anything, and without touching any cursor, floor
 * or recent cache of the flows: they then show as "alerted while the bot was OFF" instead of going missing.
 *
 * OFF (the default; the bot never turns it ON): nothing here reads or writes anything (runLogBegin_ only clears this
 * file's memory), so the bot does exactly what it did before; the tabs and RUN_LOG_OPEN stay as they were. Turned ON
 * again, the time it was OFF is "not known" (C56 still said OFF when the run before ended).
 *
 * The readers (the Results tab, the Head start tab, the dashboard, the pick-up time: section S of the build design)
 * call runLogRead_, runLogCheckIn_, runLogWords_, runLogSpans_, runLogStart_, runLogDownEnd_ and offListed_; none of them
 * ever throws. Every cell written here is at most 45,000 characters; only the bot's own two tabs are ever written (A1 is
 * its title: isRunLogTab_, isOffListTab_), and a tab of a person's with one of those names is left as it is.
 */

const RUN_LOG_TAB_ = 'When the bot ran';
const OFF_LIST_TAB_ = 'Burson while bot OFF';
const RUN_LOG_GAP_MS_ = 10 * 60 * 1000;  // more than this with no run recorded is "not running"
const RUN_LOG_GAP_STATES_ = ['not running', 'paused', 'failing', 'not known'];  // "the bot was not running"
const RUN_LOG_OPEN_PROP_ = 'RUN_LOG_OPEN';
const RUN_LOG_OFF_TODO_PROP_ = 'RUN_LOG_OFF_TODO';
const RUN_LOG_TITLE_ = 'When the bot ran: running, paused, failing or not running (written by the Burson QA bot)';
const RUN_LOG_HEADER_ = ['From (ET)', 'To (ET)', 'What the bot was doing', 'Details', 'from (ms)', 'to (ms)', 'state', 'listed'];
const RUN_LOG_HEAD_ROW_ = 4;
const RUN_LOG_FIRST_ROW_ = 5;
const RUN_LOG_STILL_GOING_ = 'still going';
const RUN_LOG_CELL_MAX_ = 45000;
const RUN_LOG_DETAIL_MAX_ = 300;
// rows: at most this many (then the oldest `cut` go); days: rows that ended longer ago than this go first
const RUN_LOG_LIMITS_ = { rows: 20000, cut: 1000, days: 60 };
const RUN_LOG_WORDS_ = {
  running: 'Running',
  paused: 'Paused: Bot (B2) was OFF',
  failing: 'Failing: its runs stopped with an error',
  'not running': 'Not running: no run was recorded',
  'not known': 'Not known',
};
const RUN_LOG_NOT_RUNNING_WHY_ = 'no run was recorded for more than 10 minutes (a stopped trigger, a wait for a ' +
  'permission after an update, or runs that failed before they read the Control tab)';
const RUN_LOG_OFF_WHY_ = 'the run log was OFF (Control row 56)';
const RUN_LOG_BLOCKED_WHY_ = 'the tab could not be written';
const RUN_LOG_PAUSED_WHY_ = 'Bot (Control B2) was OFF';
const RUN_LOG_BLOCKED_NOTE_ = '⚠️ a "When the bot ran" tab the bot didn\'t make is in the way: rename it, and the ' +
  'bot makes its own';
const RUN_LOG_DAY_MS_ = 24 * 3600 * 1000;

const OFF_LIST_TITLE_ = 'Burson\'s alerts posted while the bot was OFF, listed when Bot was turned back ON (written by ' +
  'the Burson QA bot)';
const OFF_LIST_NOTE_ = 'Listed when Bot (B2) was turned back ON with Control row 56 ON. The bot did not review, post or ' +
  'email any of them when it listed them, so they are not on the Alert log (one posted shortly before Bot was turned ' +
  'back ON can be on both, when the bot picked it up then). The post key comes from the alert as Burson wrote it: the ' +
  'bot\'s review can correct a link, so a listed alert can miss its match. The list starts at the bot\'s last run before ' +
  'Bot was set OFF, which may not have read what Burson posted after it started: an alert posted before the pause is ' +
  'listed too, and column G then says "Not while OFF" and what the bot was doing when it was posted (running, failing, ' +
  'not running). Only the alerts whose column G gives the OFF times count as posted while the bot was OFF.';
const OFF_LIST_HEADER_ = ['Burson posted (ET)', 'Issue', 'Post', 'Product', 'Exposure Tag', 'Space',
  'While the bot was OFF (ET)', 'posted (ms)', 'post key', 'message', 'issue status', 'space id', 'OFF from (ms)',
  'OFF to (ms)', 'listed at (ms)'];
const OFF_LIST_HIDDEN_FROM_ = 8;  // H:O are for the bot (offListed_), not for people
const OFF_LIST_BLOCKED_NOTE_ = '⚠️ a "Burson while bot OFF" tab the bot didn\'t make is in the way: rename it, ' +
  'and the bot makes its own (the listing waits)';
// page: messages a Chat read; pagesPerRun and runMs: at most this much of a run; pagesPerSpace: at most this many pages
// for one space in one OFF stretch (then the rest of it is said to be not listed); minLeftMs: never with less of the run
// left; tries: Chat errors in a row before a stretch gives up; jobs: OFF stretches waiting at most; rows/cut/days: the tab's
// bounds, as the run log's; maxDays: never listed from further back than this
const OFF_LIST_LIMITS_ = { page: 1000, pagesPerRun: 2, pagesPerSpace: 10, runMs: 20000, minLeftMs: 45000, tries: 3,
  jobs: 5, rows: 5000, cut: 500, days: 60, maxDays: 44 };

// This run's memory (poll() only; runLogBegin_ clears it first thing, whatever the switch says)
let RUN_LOG_RUN_ = null;     // {start, state} while row 56 is ON and the log is written this run
let RUN_LOG_FAILED_ = '';    // the error this run stopped with (poll()'s catch: runLogFailed_)
let RUN_LOG_CACHE_ = null;   // this run's read of the tab (runLogRead_), dropped at each write of this file's
let RUN_LOG_MEM_ = null;     // this run's RUN_LOG_OPEN, as read at its start and as changed since
let RUN_LOG_SS_ = null;      // this run's sheet
let RUN_LOG_SH_ = null;      // the "When the bot ran" tab, once checked this run
let RUN_LOG_DOWN_ = null;    // runLogDownEnd_, once this run

// ---------------------------------------------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------------------------------------------

/**
 * Row 56 ON: `switches` given (a run's, or readControl_'s), its speedHonest is true; none given, this run's switches
 * (EarlyWaveSource.gs ewsRunSwitches_: memory, set by poll(); outside poll() all OFF). Never throws.
 */
function runLogOn_(switches) {
  try {
    const sw = switches && typeof switches === 'object' ? switches : ewsRunSwitches_();
    return !!sw && sw.speedHonest === true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Writing the log, from poll() (Main.gs): runLogBegin_, runLogFailed_, runLogEnd_
// ---------------------------------------------------------------------------------------------------------------

/**
 * Right after poll() read the Control tab (Main.gs, after ewsRunSwitches_): clears this file's memory, then, with row
 * 56 ON only, takes this run into the log. `runStart` the run's own start, `tookOver` the claim of a run that ended
 * without finishing (Main.gs runTookOver_) or null, `on` Bot (B2) is ON, `control` the Control tab (C56: whether row 56
 * was OFF when the run before ended). In order, the first that applies:
 *   no log yet (or the tab is gone): the tab is made and the log starts at this run (no gap rule this run)
 *   the tab was in the way last time: still in the way, nothing is written this run; gone, "not known" [t, runStart]
 *   C56 starts with OFF (row 56 was OFF): "not known" from the last recorded end to this run's start
 *   a run ended without finishing after the last recorded end: "failing" from its start to this run's start (and "not
 *     running" before it when that was more than 10 minutes)
 *   more than 10 minutes since the last recorded end: "not running" [last end, this run's start]
 * Then, the first run with Bot ON after a paused stretch queues the listing of Burson's alerts posted while it was OFF
 * (runLogListOff_); with no gap row before it, the paused stretch ends at this run's start. RUN_LOG_OPEN is written only
 * when something changed. Never throws.
 */
function runLogBegin_(ss, runStart, tookOver, switches, on, control) {
  RUN_LOG_RUN_ = null;
  RUN_LOG_FAILED_ = '';
  RUN_LOG_CACHE_ = null;
  RUN_LOG_MEM_ = null;
  RUN_LOG_SS_ = null;
  RUN_LOG_SH_ = null;
  RUN_LOG_DOWN_ = null;
  if (!(switches && switches.speedHonest === true)) return;
  try {
    RUN_LOG_SS_ = ss || null;
    runLogBeginOn_(Number(runStart), tookOver, !!on, control);
  } catch (e) {
    console.error('When the bot ran: ' + ((e && e.message) || e));
  }
}

/** runLogBegin_ with row 56 ON. */
function runLogBeginOn_(runStart, tookOver, on, control) {
  const state = on ? 'running' : 'paused';
  const open = runLogOpenProp_();
  if (!open || (!(Number(open.start) > 0) && !open.blocked)) {
    runLogStartFresh_(runStart, state, 'the run log starts', open);
    return;
  }
  const s0 = open.s || null;
  const f0 = Number(open.f) || 0;
  const t0 = Number(open.t) || 0;
  const pr0 = Number(open.pr) || 0;
  let gap = null;       // the rows this run's start adds: [from, to, state, why]
  let unknown = false;  // one of them is "not known": a pause before it is not listed (when it ended is not known)
  let back = false;     // the tab was in the way and isn't any more
  if (open.blocked) {
    const tab = runLogTabState_();
    if (tab.foreign) {  // still in the way: nothing is written this run (C56 says so)
      noteSwitch_('speedHonest', RUN_LOG_BLOCKED_NOTE_);
      return;
    }
    if (!tab.sh || !(Number(open.start) > 0)) {
      runLogStartFresh_(runStart, state, 'the "When the bot ran" tab can be written again, and the run log starts', open);
      return;
    }
    delete open.blocked;
    gap = [[t0, runStart, 'not known', RUN_LOG_BLOCKED_WHY_]];
    unknown = true;
    back = true;
  } else {
    let c56 = '';
    try { c56 = control ? String(control.getRange(56, 3).getValue() || '').trim() : ''; } catch (e) { c56 = ''; }
    const started = tookOver ? Number(tookOver.started) || 0 : 0;
    if (/^OFF\b/.test(c56)) {  // row 56 was OFF when the run before ended
      gap = [[t0, runStart, 'not known', RUN_LOG_OFF_WHY_]];
      unknown = true;
    } else if (started >= t0 && started > 0 && started <= runStart) {
      // a run that ended without finishing: also one that was the first after a gap, whose start this log already took
      // as its last recorded time (it wrote the gap's row, then Apps Script stopped it): failing from its own start
      gap = (started - t0 > RUN_LOG_GAP_MS_ ? [[t0, started, 'not running', RUN_LOG_NOT_RUNNING_WHY_]] : [])
        .concat([[started, runStart, 'failing',
          `the run that started at ${speedTime_(started)} ET ended without finishing (Apps Script stopped it)`]]);
    } else if (runStart - t0 > RUN_LOG_GAP_MS_) {
      gap = [[t0, runStart, 'not running', RUN_LOG_NOT_RUNNING_WHY_]];
    }
  }
  RUN_LOG_MEM_ = open;
  let changed = false;
  if (gap) {
    const ok = runLogCloseOpen_(open) && gap.every(g => runLogAppend_(open, g[0], g[1], g[2], g[3]));
    if (!ok) {
      if (open.restart) runLogStartFresh_(runStart, state, 'the "When the bot ran" tab was gone, so the run log starts again', open);
      return;
    }
    runLogGapDone_(open, runStart, unknown);
    if (back) noteSwitch_('speedHonest', 'the "When the bot ran" tab can be written again: the time it could not be is "Not known" there');
    changed = true;
  }
  // the first run with Bot ON after a paused stretch: Burson's alerts posted while it was OFF are listed (runLogListOff_).
  // With no gap row in between (the last paused run ended at most 10 minutes before this run started), the paused
  // stretch lasts until this run's start, a recorded time: no run was made in between, and the last one found Bot OFF
  // (when a person set it back ON is not recorded). The listing's window ends at the same time, so an alert counts as
  // posted while the bot was OFF exactly when its time falls in the paused row
  if (s0 === 'paused' && on && !unknown && f0 > 0) {
    if (!gap) open.t = Math.max(t0, runStart);
    runLogQueueOff_(open, { c: f0, d: gap ? t0 : Math.max(t0, runStart), pr: pr0, t: runStart });
    changed = true;
  }
  RUN_LOG_RUN_ = { start: runStart, state };
  if (changed) runLogOpenWrite_(open);
}

/** This run ended in poll()'s catch: `e` is why (memory only; runLogEnd_ records the run as failing). Never throws. */
function runLogFailed_(e) {
  try {
    RUN_LOG_FAILED_ = truncate_(String((e && e.message) || e || 'an error').replace(/\s+/g, ' ').trim(), 240) || 'an error';
  } catch (err) {
    RUN_LOG_FAILED_ = 'an error';
  }
}

/**
 * At the very end of poll()'s finally (Main.gs, right before the run-time record): this run's end (`end`, ms), with
 * row 56 ON. The same state as the stretch still going: only its end moves (RUN_LOG_OPEN alone, no Sheets call).
 * Another: that stretch is closed at its last recorded end, and a row for this run starts (from its runStart). Then
 * RUN_LOG_OPEN is written, once, and this file's memory of the run is cleared. Never throws.
 */
function runLogEnd_(end) {
  const run = RUN_LOG_RUN_;
  const failed = RUN_LOG_FAILED_;
  RUN_LOG_RUN_ = null;
  RUN_LOG_FAILED_ = '';
  try {
    if (run) runLogEndRun_(run, failed, end);
  } finally {
    // this run's memory goes with it: anything after the run reads afresh
    RUN_LOG_CACHE_ = null;
    RUN_LOG_MEM_ = null;
    RUN_LOG_SS_ = null;
    RUN_LOG_SH_ = null;
    RUN_LOG_DOWN_ = null;
  }
}

/** runLogEnd_ for a run taken into the log (`run`: {start, state}; `failed`: its error, or ''). */
function runLogEndRun_(run, failed, end) {
  try {
    let open = RUN_LOG_MEM_;
    if (!open) return;
    const at = Number(end) || Date.now();
    const state = failed ? 'failing' : run.state;
    if (open.s === state && Number(open.f) > 0) {
      open.t = Math.max(Number(open.t) || 0, at);
    } else {
      const why = state === 'failing' ? `the run stopped with an error: ${failed}` : state === 'paused' ? RUN_LOG_PAUSED_WHY_ : '';
      let ok = runLogCloseOpen_(open) && runLogAppend_(open, run.start, 0, state, why);
      if (!ok && open.restart) {  // the tab was gone: the log starts again at this run
        runLogStartFresh_(run.start, state, 'the "When the bot ran" tab was gone, so the run log starts again', open);
        RUN_LOG_RUN_ = null;
        open = RUN_LOG_MEM_;
        ok = !!open && runLogAppend_(open, run.start, 0, state, why);
      }
      if (!ok) return;
      runLogOpenSet_(open, state, run.start, at, why);
    }
    if (state === 'running') open.pr = run.start;
    runLogOpenWrite_(open);
  } catch (e) {
    console.error('When the bot ran: ' + ((e && e.message) || e));
  }
}

/** RUN_LOG_OPEN's stretch still going, after a row for it was added. Pure (changes `open`). */
function runLogOpenSet_(open, state, from, at, why) {
  open.s = state;
  open.f = from;
  open.t = at;
  open.w = why || '';
  if (state === 'running') open.pr = from;
}

/** After the gap rows at a run's start: nothing is going on, the last recorded time is this run's start. */
function runLogGapDone_(open, runStart, unknown) {
  open.s = null;
  open.f = 0;
  open.t = runStart;
  open.w = '';
  open.dn = Math.max(Number(open.dn) || 0, runStart);
  if (unknown) open.pr = 0;  // when the bot was running before is not known: a pause after it is listed from its start
}

/**
 * The log starts (again) at `runStart`: the tab made (or, when it is the bot's, its rows cleared: the property that said
 * where it stood was gone), A1, A2, the header. A tab named "When the bot ran" that the bot didn't make: nothing is
 * written to it, RUN_LOG_OPEN says blocked (unless it did already: `prev`, as read), and C56 says so. Never throws.
 */
function runLogStartFresh_(runStart, state, why, prev) {
  let q = 0;
  try {
    const todo = JSON.parse(PropertiesService.getScriptProperties().getProperty(RUN_LOG_OFF_TODO_PROP_) || '[]');
    q = Array.isArray(todo) ? todo.length : 0;
  } catch (e) {
    q = 0;
  }
  const made = runLogMakeTab_(runStart);
  if (!made.ok) {
    RUN_LOG_MEM_ = null;
    // a person's tab in the way: blocked until it is gone (nothing is written meanwhile). Any other failure: nothing
    // changes, and the next run tries again
    if (made.foreign && !(prev && prev.blocked)) {
      runLogOpenWrite_({ v: 1, start: 0, on: 0, s: null, f: 0, t: 0, w: '', pr: 0, dn: 0, q, blocked: true });
    }
    noteSwitch_('speedHonest', made.foreign ? RUN_LOG_BLOCKED_NOTE_
      : `\u26a0\ufe0f the "When the bot ran" tab could not be made: ${truncate_(made.why || '', 120)}`);
    return;
  }
  const open = { v: 1, start: runStart, on: runStart, s: null, f: 0, t: runStart, w: '', pr: 0, dn: 0, q };
  RUN_LOG_MEM_ = open;
  RUN_LOG_RUN_ = { start: runStart, state };
  runLogOpenWrite_(open);
  console.log(`When the bot ran: ${why} at ${new Date(runStart).toISOString()}`);
}

/** RUN_LOG_OPEN as stored (null: none, or it can't be read). */
function runLogOpenProp_() {
  try {
    const o = JSON.parse(PropertiesService.getScriptProperties().getProperty(RUN_LOG_OPEN_PROP_) || 'null');
    return o && typeof o === 'object' ? o : null;
  } catch (e) {
    return null;
  }
}

/** Writes RUN_LOG_OPEN (`open` without the run's own marks). Never throws. */
function runLogOpenWrite_(open) {
  try {
    const keep = Object.assign({}, open);
    delete keep.restart;
    PropertiesService.getScriptProperties().setProperty(RUN_LOG_OPEN_PROP_, JSON.stringify(keep));
  } catch (e) {
    console.error('When the bot ran: could not keep its place: ' + ((e && e.message) || e));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The tab "When the bot ran"
// ---------------------------------------------------------------------------------------------------------------

/** Is this the "When the bot ran" tab the bot made? Its A1 is the bot's title. Never throws (false when it can't tell). */
function isRunLogTab_(sh) {
  try {
    return !!sh && sh.getLastRow() >= 1 && String(sh.getRange(1, 1).getDisplayValue()).trim() === RUN_LOG_TITLE_;
  } catch (e) {
    return false;
  }
}

/** This run's "When the bot ran" tab: {sh} (the bot's), {missing: true} or {foreign: true}. Checked once a run. */
function runLogTabState_() {
  if (RUN_LOG_SH_ && currentRunId_()) return { sh: RUN_LOG_SH_ };
  const ss = RUN_LOG_SS_;
  if (!ss) return { missing: true };
  let sh = null;
  try { sh = ss.getSheetByName(RUN_LOG_TAB_); } catch (e) { return { foreign: true, why: String((e && e.message) || e) }; }
  if (!sh) return { missing: true };
  if (!isRunLogTab_(sh)) return { foreign: true };
  RUN_LOG_SH_ = sh;
  return { sh };
}

/**
 * Makes the tab at the end of the sheet (or clears the rows of the bot's own one), with A1, A2 and the header, protected
 * with a warning: {ok} or {ok: false, foreign} (a person's tab of that name: never written) / {ok: false, why}.
 */
function runLogMakeTab_(start) {
  const ss = RUN_LOG_SS_;
  if (!ss) return { ok: false, why: 'the bot\'s sheet is not open' };
  try {
    let sh = ss.getSheetByName(RUN_LOG_TAB_);
    if (sh && !isRunLogTab_(sh)) return { ok: false, foreign: true };
    if (!sh) {
      sh = ss.insertSheet(RUN_LOG_TAB_);
      sh.getRange(1, 1).setValue(RUN_LOG_TITLE_);
      try { sh.protect().setDescription('Written by the Burson QA bot').setWarningOnly(true); } catch (e) { /* works unprotected */ }
    } else if (sh.getLastRow() >= RUN_LOG_FIRST_ROW_) {
      sh.getRange(RUN_LOG_FIRST_ROW_, 1, sh.getLastRow() - RUN_LOG_FIRST_ROW_ + 1, RUN_LOG_HEADER_.length).clearContent();
    }
    sh.getRange(2, 1).setValue(runLogCell_(runLogNoteText_(start, start)));
    sh.getRange(RUN_LOG_HEAD_ROW_, 1, 1, RUN_LOG_HEADER_.length).setValues([RUN_LOG_HEADER_]);
    const fmt = f => { try { f(); } catch (e) { /* formatting only */ } };
    fmt(() => sh.getRange(1, 1).setFontWeight('bold').setFontSize(13));
    fmt(() => sh.getRange(RUN_LOG_HEAD_ROW_, 1, 1, RUN_LOG_HEADER_.length).setFontWeight('bold').setBackground('#f1f3f4'));
    fmt(() => sh.setFrozenRows(RUN_LOG_HEAD_ROW_));
    fmt(() => sh.hideColumns(5, 4));
    fmt(() => [[1, 140], [2, 140], [3, 260], [4, 520]].forEach(([c, px]) => sh.setColumnWidth(c, px)));
    RUN_LOG_SH_ = sh;
    RUN_LOG_CACHE_ = null;
    return { ok: true };
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e) };
  }
}

/** A2: since when the log is kept (`on`), and how far back it reaches after older rows went (`start`). Pure but for GEN. */
function runLogNoteText_(on, start) {
  const trimmed = Number(start) > Number(on)
    ? ` Rows older than ${RUN_LOG_LIMITS_.days} days are removed, and the oldest when the tab passes ` +
      `${RUN_LOG_LIMITS_.rows.toLocaleString('en-US')} rows: it now reaches back to ${speedTime_(Number(start))} ET.`
    : '';
  return `Kept since ${speedTime_(Number(on))} ET, when "Speed numbers: leave out when the bot was not running" (Control ` +
    'row 56) was turned ON: before then, when the bot was running is not known. More than 10 minutes with no run is ' +
    '"Not running". Times are Eastern (ET), newest at the bottom; the last row\'s end is filled in when the bot does ' +
    `something else.${trimmed}`;
}

/** A text for a cell: never read as a formula, at most 45,000 characters. Pure. */
function runLogCell_(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return capCell_(/^[=+\-@]/.test(s) ? "'" + s : s, RUN_LOG_CELL_MAX_);
}

/**
 * Closes the stretch still going (RUN_LOG_OPEN's `f`), at its last recorded end (`t`): B and F of its row (found by
 * its hidden "from (ms)"). Nothing to close: true. The tab is a person's: false (blocked). The tab is gone: false, with
 * `open.restart` (the caller starts the log again).
 */
function runLogCloseOpen_(open) {
  if (!open.s || !(Number(open.f) > 0)) return true;
  const t = Number(open.t) || Number(open.f);
  const tab = runLogTabState_();
  if (!tab.sh) return runLogNoTab_(open, tab);
  if (runLogGapState_(open.s)) open.dn = Math.max(Number(open.dn) || 0, t);
  try {
    const row = runLogRowOf_(tab.sh, Number(open.f));
    if (row) tab.sh.getRange(row, 2, 1, 1).setValues([[speedTime_(t)]]);
    if (row) tab.sh.getRange(row, 6, 1, 1).setValues([[t]]);
    RUN_LOG_CACHE_ = null;
  } catch (e) {
    console.error('When the bot ran: could not close a row: ' + ((e && e.message) || e));
  }
  open.s = null;
  open.f = 0;
  return true;
}

/** True when `state` is one of RUN_LOG_GAP_STATES_ ("the bot was not running"). Pure. */
function runLogGapState_(state) { return RUN_LOG_GAP_STATES_.indexOf(state) >= 0; }

/** The tab couldn't be written: a person's (blocked, said in C56) or gone (`open.restart`). Always false. */
function runLogNoTab_(open, tab) {
  if (tab.foreign) {
    open.blocked = true;
    runLogOpenWrite_(open);
    RUN_LOG_RUN_ = null;
    noteSwitch_('speedHonest', RUN_LOG_BLOCKED_NOTE_);
  } else {
    open.restart = true;
  }
  return false;
}

/** The sheet row whose hidden "from (ms)" (column E) is `from`: the last row first, else a search; 0 when none. */
function runLogRowOf_(sh, from) {
  const last = sh.getLastRow();
  if (last < RUN_LOG_FIRST_ROW_) return 0;
  if (Number(sh.getRange(last, 5).getValue()) === from) return last;
  const col = sh.getRange(RUN_LOG_FIRST_ROW_, 5, last - RUN_LOG_FIRST_ROW_ + 1, 1).getValues();
  for (let i = col.length - 1; i >= 0; i--) if (Number(col[i][0]) === from) return RUN_LOG_FIRST_ROW_ + i;
  return 0;
}

/**
 * Adds a row: [from, to] (`to` 0: still going) in `state`, with `why`, then keeps the tab in its bounds (the last row,
 * when it is already this one: a run that stopped after adding it). False when the tab is a person's (blocked), gone
 * (`open.restart`) or can't be written.
 */
function runLogAppend_(open, from, to, state, why) {
  const tab = runLogTabState_();
  if (!tab.sh) return runLogNoTab_(open, tab);
  const sh = tab.sh;
  try {
    // a row a run added before it stopped (its stretch the same, from the same time) is written over, never added twice
    const lastRow = sh.getLastRow();
    const prev = lastRow >= RUN_LOG_FIRST_ROW_ ? sh.getRange(lastRow, 1, 1, RUN_LOG_HEADER_.length).getValues()[0] : [];
    const row = Number(prev[4]) === Number(from) && String(prev[6]) === state ? lastRow : Math.max(lastRow, RUN_LOG_HEAD_ROW_) + 1;
    sh.getRange(row, 1, 1, RUN_LOG_HEADER_.length).setValues([[
      speedTime_(from), to ? speedTime_(to) : RUN_LOG_STILL_GOING_, RUN_LOG_WORDS_[state] || state,
      runLogCell_(truncate_(why || '', RUN_LOG_DETAIL_MAX_)), from, to || '', state, '',
    ]]);
    if (to && runLogGapState_(state)) open.dn = Math.max(Number(open.dn) || 0, to);
    RUN_LOG_CACHE_ = null;
    runLogTrim_(sh, open);
    return true;
  } catch (e) {
    console.error('When the bot ran: could not add a row: ' + ((e && e.message) || e));
    return false;
  }
}

/**
 * Keeps the tab in bounds after a row was added: rows that ended more than 60 days ago go first; past 20,000 rows the
 * oldest 1,000 go. At least one row always stays. Then the log reaches back to its first row's start (`open.start`),
 * and A2 says so. Never throws.
 */
function runLogTrim_(sh, open) {
  try {
    const last = sh.getLastRow();
    const n = last - RUN_LOG_FIRST_ROW_ + 1;
    if (n <= 1) return;
    const old = Date.now() - RUN_LOG_LIMITS_.days * RUN_LOG_DAY_MS_;
    const firstTo = Number(sh.getRange(RUN_LOG_FIRST_ROW_, 6).getValue());
    let cut = 0;
    if (firstTo > 0 && firstTo < old) {
      const tos = sh.getRange(RUN_LOG_FIRST_ROW_, 6, n, 1).getValues();
      while (cut < n && Number(tos[cut][0]) > 0 && Number(tos[cut][0]) < old) cut++;
    }
    if (!cut && n > RUN_LOG_LIMITS_.rows) cut = RUN_LOG_LIMITS_.cut;
    cut = Math.min(cut, n - 1);
    if (cut < 1) return;
    sh.deleteRows(RUN_LOG_FIRST_ROW_, cut);
    const first = Number(sh.getRange(RUN_LOG_FIRST_ROW_, 5).getValue());
    if (first > 0) open.start = first;
    sh.getRange(2, 1).setValue(runLogCell_(runLogNoteText_(Number(open.on) || Number(open.start), Number(open.start))));
    RUN_LOG_CACHE_ = null;
  } catch (e) {
    console.error('When the bot ran: could not remove its oldest rows: ' + ((e && e.message) || e));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading the log (section S of the build design: what the Results and Head start tabs and the dashboard call)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The run log: {ok, why, start, last, spans}. ok: the tab is the bot's and was read ({ok: false, why} when a tab of a
 * person's is in the way, or it can't be read: every time is then not known; {ok: true, start: 0, spans: []} with no
 * log yet). start: ms of the log's first record (0: none). last: ms of the latest record (inside poll(): now). spans:
 * [{from, to, state, why, listed: null | {n, done, upTo}, open?: true, current?: true}], oldest first: the tab's rows (the
 * one still going with to = its last recorded end, open: true), and inside poll() this run itself ({from: its start, to:
 * now, state: running or paused, current: true}). `ss` (optional): the bot's sheet, when called outside poll(). Inside
 * poll() the tab is read once a run. Never throws.
 */
function runLogRead_(ss) {
  const inRun = !!currentRunId_() && !!RUN_LOG_MEM_;
  let base = inRun ? RUN_LOG_CACHE_ : null;
  if (!base) {
    base = runLogReadBase_(ss);
    if (inRun) RUN_LOG_CACHE_ = base;
  }
  const out = { ok: base.ok, why: base.why, start: base.start, last: base.last, spans: base.spans.map(s => Object.assign({}, s)) };
  if (inRun && RUN_LOG_RUN_ && out.ok && out.start) {
    const now = Date.now();
    // a run that already stopped with an error (poll()'s catch ran: runLogFailed_) is failing, as its row will say once
    // it ends: the rebuilds in its own finally see it so too
    const failed = RUN_LOG_FAILED_;
    out.spans.push({ from: RUN_LOG_RUN_.start, to: now, state: failed ? 'failing' : RUN_LOG_RUN_.state,
      why: failed ? `the run stopped with an error: ${failed}` : '',
      listed: null, current: true });
    out.last = now;
  }
  return out;
}

/** runLogRead_ without this run itself: RUN_LOG_OPEN and the tab's rows, read once. Never throws. */
function runLogReadBase_(ss) {
  const none = why => ({ ok: false, why, start: 0, last: 0, spans: [] });
  try {
    const inRun = !!currentRunId_() && !!RUN_LOG_MEM_;
    const open = inRun ? RUN_LOG_MEM_ : runLogOpenProp_();
    if (!open) return { ok: true, why: '', start: 0, last: 0, spans: [] };
    if (open.blocked) return none('a "When the bot ran" tab the bot didn\'t make is in the way');
    if (!(Number(open.start) > 0)) return { ok: true, why: '', start: 0, last: 0, spans: [] };
    const book = (inRun ? RUN_LOG_SS_ : null) || ss || openStore_(false);
    const sh = book.getSheetByName(RUN_LOG_TAB_);
    if (!sh) return none('the "When the bot ran" tab is missing');
    if (!isRunLogTab_(sh)) return none('a "When the bot ran" tab the bot didn\'t make is in the way');
    const last = sh.getLastRow();
    const rows = last >= RUN_LOG_FIRST_ROW_
      ? sh.getRange(RUN_LOG_FIRST_ROW_, 1, last - RUN_LOG_FIRST_ROW_ + 1, RUN_LOG_HEADER_.length).getValues() : [];
    const t = Number(open.t) || 0;
    const spans = [];
    rows.forEach(r => {
      const from = Number(r[4]);
      const state = String(r[6] || '').trim();
      if (!(from > 0) || !RUN_LOG_WORDS_[state]) return;
      const isOpen = !(Number(r[5]) > 0) && open.s === state && Number(open.f) === from;
      const to = Number(r[5]) > 0 ? Number(r[5]) : isOpen ? Math.max(t, from) : from;
      let listed = null;
      try { listed = r[7] ? JSON.parse(String(r[7])) : null; } catch (e) { listed = null; }
      const span = { from, to, state, why: String(r[3] || ''), listed };
      if (isOpen) span.open = true;
      spans.push(span);
    });
    return { ok: true, why: '', start: Number(open.start), last: t, spans };
  } catch (e) {
    return none(`the "When the bot ran" tab could not be read: ${truncate_(String((e && e.message) || e), 160)}`);
  }
}

/** The run log's first record (ms), or 0 (no log, or its tab can't be written). Never throws. */
function runLogStart_() {
  try {
    const open = currentRunId_() && RUN_LOG_MEM_ ? RUN_LOG_MEM_ : runLogOpenProp_();
    return open && !open.blocked && Number(open.start) > 0 ? Number(open.start) : 0;
  } catch (e) {
    return 0;
  }
}

/** The spans of the run log (runLogRead_, or `log` when given) that overlap [from, to]. Never throws. */
function runLogSpans_(from, to, log) {
  try {
    const l = log || runLogRead_();
    const a = Math.min(Number(from), Number(to));
    const b = Math.max(Number(from), Number(to));
    return (l.spans || []).filter(s => s.from < b && s.to > a);
  } catch (e) {
    return [];
  }
}

/**
 * Was the bot running the whole time from min(a, b) to max(a, b)? null when it was (gaps of 10 minutes or less between
 * runs count as running). Else {state, from, to, why, words, more}: 'not known' when there is no log to say (none yet,
 * or its tab can't be read). Else a stretch the log RECORDED as not running, paused or failing comes first, whatever
 * else overlaps: the earliest of those (more: how many other stretches of RUN_LOG_GAP_STATES_ overlap); else the
 * earliest stretch recorded as not known (more: how many other not-known ones overlap); else 'not known' when the time
 * starts before the log did, or ends more than 10 minutes after its last record. Pure but for GEN (the time zone of the
 * words).
 */
function runLogCheckIn_(log, a, b) {
  const lo = Math.min(Number(a), Number(b));
  const hi = Math.max(Number(a), Number(b));
  const unknown = (from, to, why) => ({ state: 'not known', from, to, why, words: `not known: ${why}`, more: 0 });
  if (!log || !log.ok || !(Number(log.start) > 0)) {
    return unknown(lo, hi, log && !log.ok && log.why ? log.why : 'the bot keeps no record of when it ran');
  }
  // every stretch of the log that overlaps, also when the time starts before the log did (a stop it recorded after its
  // start is still a stop)
  const gaps = (log.spans || []).filter(s => runLogGapState_(s.state) && s.from < hi && s.to > lo)
    .sort((x, y) => x.from - y.from);
  const down = gaps.filter(s => s.state !== 'not known');
  const pick = (g, more) => ({ state: g.state, from: g.from, to: g.to, why: g.why || '', words: runLogWords_(g), more });
  if (down.length) return pick(down[0], gaps.length - 1);
  if (gaps.length) return pick(gaps[0], gaps.length - 1);
  if (!(lo >= Number(log.start))) {
    return unknown(lo, Math.min(hi, Number(log.start)), `before the bot kept its run log (${speedTime_(Number(log.start))} ET)`);
  }
  if (hi > Number(log.last) + RUN_LOG_GAP_MS_) {
    return unknown(Number(log.last), hi, `no run recorded after ${speedTime_(Number(log.last))} ET`);
  }
  return null;
}

/** runLogCheckIn_ on the run log as it stands (runLogRead_). Never throws. */
function runLogNotRunningOverlap_(a, b) {
  try {
    return runLogCheckIn_(runLogRead_(), a, b);
  } catch (e) {
    return { state: 'not known', from: Math.min(a, b), to: Math.max(a, b), why: 'the run log could not be read',
      words: 'not known: the run log could not be read', more: 0 };
  }
}

/** A stretch in plain words: "the bot was not running from 2026-11-18 09:02 to 2026-11-18 21:40 ET", …. Pure but for GEN. */
function runLogWords_(span) {
  const s = span || {};
  const when = `from ${speedTime_(Number(s.from))} to ${speedTime_(Number(s.to))} ET`;
  if (s.state === 'not running') return `the bot was not running ${when}`;
  if (s.state === 'paused') return `the bot was paused (Bot OFF on the Control tab) ${when}`;
  if (s.state === 'failing') return `the bot's runs were failing ${when}`;
  if (s.state === 'running') return `the bot was running ${when}`;
  return `it is not known whether the bot was running ${when}${s.why ? ` (${s.why})` : ''}`;
}

/**
 * When the bot last came back: the latest end of a stretch in RUN_LOG_GAP_STATES_ (ms), 0 when there's none (or no
 * log). Inside poll() a stretch that ended at this run's start counts, and it is worked out once a run, from
 * RUN_LOG_OPEN alone (no Sheets call). Never throws.
 */
function runLogDownEnd_() {
  try {
    const inRun = !!currentRunId_() && !!RUN_LOG_MEM_;
    if (inRun && RUN_LOG_DOWN_ !== null) return RUN_LOG_DOWN_;
    const open = inRun ? RUN_LOG_MEM_ : runLogOpenProp_();
    let end = 0;
    if (open && !open.blocked && Number(open.start) > 0) {
      end = Math.max(Number(open.dn) || 0, open.s && runLogGapState_(open.s) ? Number(open.t) || 0 : 0);
    }
    if (inRun) RUN_LOG_DOWN_ = end;
    return end;
  } catch (e) {
    return 0;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Burson's alerts posted while the bot was OFF (the tab "Burson while bot OFF")
// ---------------------------------------------------------------------------------------------------------------

/**
 * Queues the listing of one paused stretch (`p`: c, d its two ends; pr the start of the last running run before it (0:
 * not known); t this run's start). The window starts at pr (that run may not have read what came after its start), else
 * at the paused stretch's start (when the bot was running before it is not known), never more than 44 days back; it
 * ends at this run's start. An alert listed from before c, or (after a stop of more than 10 minutes) after d, is not one
 * posted while the bot was OFF: its row says what the bot was doing then (offListWhen_), and no count takes it as OFF
 * (offListedWhileOff_). At most 5 wait: a sixth drops the oldest, and its paused row says so. Changes `open.q`.
 */
function runLogQueueOff_(open, p) {
  const props = PropertiesService.getScriptProperties();
  let jobs = [];
  try { jobs = JSON.parse(props.getProperty(RUN_LOG_OFF_TODO_PROP_) || '[]'); } catch (e) { jobs = []; }
  if (!Array.isArray(jobs)) jobs = [];
  if (jobs.some(j => Number(j.c) === p.c)) {  // queued already (a run that ended without finishing did)
    open.q = jobs.length;
    return;
  }
  const floor = p.t - OFF_LIST_LIMITS_.maxDays * RUN_LOG_DAY_MS_;
  const known = p.pr > 0 && p.pr < p.c;
  const from = Math.max(known ? p.pr : p.c, floor);
  jobs.push({ c: p.c, d: p.d, f: from, t: p.t, early: !known, old: from === floor && floor > (known ? p.pr : p.c), sp: null,
    i: 0, after: from, last: [], n: 0, pages: 0, pp: 0, tries: 0, cut: [], end: '' });
  while (jobs.length > OFF_LIST_LIMITS_.jobs) {
    const dropped = jobs.shift();
    dropped.end = 'dropped';
    runLogOffFinish_(dropped);
  }
  try {
    props.setProperty(RUN_LOG_OFF_TODO_PROP_, JSON.stringify(jobs));
  } catch (e) {
    console.error('Burson while bot OFF: could not queue the listing: ' + ((e && e.message) || e));
  }
  open.q = jobs.length;
}

/**
 * The spaces that hold Burson's alerts this run (the ones the flows read): the Burson space (B3), or B25 itself when the
 * bot works directly in it (row 32), when the main flow reads it directly; S-F Burson (B25) when the main flow is the
 * Mirror, or the Auto-correct space (B10) is set. Never the Other alerts space (B33) or the Burson test copy (B26), nor
 * any id in `exclude`. null when they can't be told yet (the run failed before it knew its spaces). Pure.
 */
function runLogOffSpaces_(cfg, sfb, wanted, standalone, exclude) {
  const out = [];
  const add = sp => { if (sp && sp.id && !out.some(x => x.id === sp.id)) out.push({ id: String(sp.id), name: String(sp.name || sp.id) }); };
  const sfbSpace = sfb && sfb.space ? sfb.space : null;
  if (cfg && cfg.burson && cfg.burson.id) {
    if (cfg.direct) add(cfg.burson);
    else if (cfg.mirror || cfg.outboundBlocked) add(sfbSpace);
    else add(cfg.burson);
  } else if (!standalone) {
    return null;
  }
  if (String((wanted && wanted.autocorrect) || '').trim()) add(sfbSpace);
  const ex = (exclude || []).filter(Boolean).map(String);
  const list = out.filter(sp => ex.indexOf(sp.id) < 0);
  return list.length ? list : null;
}

/**
 * One message of a Burson space as a listed alert: {name, at, key, url, issue, status, product, tag}, or null for a
 * thread reply, the bot's own post (a client-bqa-, client-zrlo- or client-zmir- id, or its own formatted text), or
 * a text that isn't an alert (detectAlert_ on the text the Mirror would copy: zapierMirrorText_). The key is the local
 * parse's (recordKey_). Pure.
 */
function offListEntry_(m, botUser) {
  if (!m || m.threadReply) return null;
  if (m.clientId && /^client-(?:bqa|zrlo|zmir)-/.test(String(m.clientId))) return null;
  const text = zapierMirrorText_(m);
  if (!text) return null;
  if (botUser && m.senderName === botUser &&
    (typeof isBotFormattedText_ === 'function' ? isBotFormattedText_(text) : String(text).trim().indexOf(GEN.prefix) === 0)) return null;
  const parsed = parseAlert_(text);
  if (!detectAlert_(text, parsed, m.senderDisplay)) return null;
  const f = parsed.fields || {};
  return {
    name: String(m.name || ''), at: Number(m.createTime) || 0, key: recordKey_(f) || '', url: String(f.post_url || ''),
    issue: issueNameText_(f.issue_name), status: String(f.issue_status || ''), product: String(f.product || ''),
    tag: String(f.exposure_tag || ''),
  };
}

/**
 * From poll()'s finally (Main.gs, with Bot ON, after every flow and tab): lists the Burson alerts posted during a paused
 * stretch, oldest stretch first, a page at a time. o: {deadline (ms), cfg, sfb, wanted, standalone (working alone in the
 * Auto-correct space), flows (as headStartRunBusy_ takes them), exclude (space ids never read)}. Nothing at all unless
 * row 56 is ON and a stretch waits (RUN_LOG_OPEN's q: no property read otherwise). It waits while a flow is still
 * catching up (Burson's alerts go first), or with under 45 seconds of the run left; then at most 2 Chat reads and 20
 * seconds. It only reads Chat (the read the Mirror makes) and writes its own tab, the paused row of "When the bot ran"
 * and C56's note: it never reviews, posts, reacts, emails, writes the Alert or Message log, or moves any cursor, floor or
 * recent cache. Returns what it did (for the log and the tests), or null. Never throws.
 */
function runLogListOff_(ss, o) {
  try {
    o = o || {};
    if (!runLogOn_((o.wanted && o.wanted.switches) || null)) return null;
    const open = RUN_LOG_MEM_;
    if (!open || open.blocked || !(Number(open.q) > 0)) return null;
    if (headStartRunBusy_(null, o.flows)) return { waiting: 'busy' };
    if (Number(o.deadline) - Date.now() < OFF_LIST_LIMITS_.minLeftMs) return { waiting: 'time' };
    const props = PropertiesService.getScriptProperties();
    let jobs = [];
    try { jobs = JSON.parse(props.getProperty(RUN_LOG_OFF_TODO_PROP_) || '[]'); } catch (e) { jobs = []; }
    if (!Array.isArray(jobs) || !jobs.length) {
      open.q = 0;
      return null;
    }
    const job = jobs[0];
    if (!job.sp) {
      const sp = runLogOffSpaces_(o.cfg, o.sfb, o.wanted, !!o.standalone, o.exclude);
      if (!sp) return { waiting: 'spaces' };
      job.sp = sp;
      job.i = 0;
      job.after = job.f;
      job.last = [];
      job.pp = 0;
    }
    const book = ss || RUN_LOG_SS_;
    const botUser = props.getProperty('BOT_USER') || null;
    const L = OFF_LIST_LIMITS_;
    const t0 = Date.now();
    let calls = 0;
    let blocked = false;
    while (!job.end && calls < L.pagesPerRun && Date.now() - t0 < L.runMs) {
      const space = job.sp[job.i];
      if (!space) {
        job.end = 'done';
        break;
      }
      let msgs;
      calls++;
      try {
        msgs = chatListMessages_(space.id, new Date(Number(job.after)).toISOString(), L.page, false,
          { until: new Date(Number(job.t)).toISOString() });
      } catch (e) {
        job.tries = (Number(job.tries) || 0) + 1;
        job.why = truncate_(String((e && e.message) || e), 160);
        if (job.tries >= L.tries) job.end = 'error';
        break;
      }
      job.tries = 0;  // 3 Chat errors in a row end the stretch
      msgs = msgs.slice().sort((a, b) => a.createTime - b.createTime);
      const seen = new Set(job.last || []);
      const hits = [];
      msgs.forEach(m => {
        if (seen.has(m.name) || !(m.createTime < Number(job.t))) return;
        const e = offListEntry_(m, botUser);
        if (e) hits.push(e);
      });
      if (hits.length) {
        const w = offListAppend_(book, job, space, hits);
        if (!w.ok) {
          blocked = true;
          if (w.foreign) noteSwitch_('speedHonest', OFF_LIST_BLOCKED_NOTE_);
          break;  // the page is read again next time: nothing moved
        }
        job.n = (Number(job.n) || 0) + w.added;
      }
      job.pages = (Number(job.pages) || 0) + 1;
      job.pp = (Number(job.pp) || 0) + 1;
      if (msgs.length) {
        const at = msgs[msgs.length - 1].createTime;
        const same = msgs.filter(m => m.createTime === at).map(m => m.name);
        job.last = (at === Number(job.after) ? Array.from(new Set((job.last || []).concat(same))) : same).slice(-50);
        job.after = at;
      }
      if (msgs.length < L.page) {  // that space is done
        job.i++;
        job.after = job.f;
        job.last = [];
        job.pp = 0;
      } else if (job.pp >= L.pagesPerSpace) {  // too many messages: the rest of this space is not listed
        job.cut = (job.cut || []).concat([{ name: space.name, upTo: Number(job.after) }]);
        job.i++;
        job.after = job.f;
        job.last = [];
        job.pp = 0;
      }
      if (job.i >= job.sp.length) job.end = 'done';
    }
    const result = { stretch: job.c, listed: job.n, pages: job.pages, calls, end: job.end || '', blocked };
    if (job.end) {
      runLogOffFinish_(job);
      jobs.shift();
    }
    try {
      if (jobs.length) props.setProperty(RUN_LOG_OFF_TODO_PROP_, JSON.stringify(jobs));
      else props.deleteProperty(RUN_LOG_OFF_TODO_PROP_);
    } catch (e) {
      console.error('Burson while bot OFF: could not keep its place: ' + ((e && e.message) || e));
    }
    open.q = jobs.length;
    if (job.end || job.n) console.log(`Burson while bot OFF: ${JSON.stringify(result)}`);
    return result;
  } catch (e) {
    console.error('Burson while bot OFF: ' + ((e && e.message) || e));
    return null;
  }
}

/**
 * A listing that ended (`job.end`: done, error, or dropped when too many waited): its paused row on "When the bot ran"
 * says how it went (Details, and the hidden "listed" cell: {"n", "done", "upTo"}), and so does C56's note. Never throws.
 */
function runLogOffFinish_(job) {
  try {
    const n = Number(job.n) || 0;
    const alerts = `${n} Burson alert${n === 1 ? '' : 's'}`;
    const cut = (job.cut || []).filter(c => c && c.upTo);
    const multi = (job.sp || []).length > 1;
    let text;
    let listed;
    if (job.end === 'dropped') {
      text = `Burson's alerts posted while it was OFF: not listed: too many OFF stretches waiting${n ? ` (${n} listed before then)` : ''}`;
      listed = { n, done: false, why: 'too many OFF stretches waiting' };
    } else if (job.end === 'error') {
      text = `Burson's alerts posted while it was OFF could not ${n ? `all be listed (${n} listed)` : 'be listed'}: ${job.why || 'an error'}`;
      listed = { n, done: false, why: String(job.why || 'an error') };
    } else {
      text = n ? `Burson's alerts posted while it was OFF: ${n} listed on the "${OFF_LIST_TAB_}" tab`
        : 'Burson\'s alerts posted while it was OFF: none found';
      if (cut.length) {
        const upTo = Math.min.apply(null, cut.map(c => Number(c.upTo)));
        text += `; listing stopped after ${(OFF_LIST_LIMITS_.page * OFF_LIST_LIMITS_.pagesPerSpace).toLocaleString('en-US')} ` +
          `messages${multi ? ` in ${cut.map(c => c.name).join(' and ')}` : ''}: alerts from ${speedTime_(upTo)} to ` +
          `${speedTime_(Number(job.t))} ET are not listed`;
        listed = { n, done: false, upTo };
      } else {
        listed = { n, done: true };
      }
    }
    if (job.old && job.end !== 'dropped') {
      text += ` (Burson's alerts from before ${speedTime_(Number(job.f))} ET are not listed: the bot lists at most ` +
        `${OFF_LIST_LIMITS_.maxDays} days back)`;
    } else if (job.early && job.end !== 'dropped') {
      text += ` (Burson's alerts from before ${speedTime_(Number(job.f))} ET are not listed: when the bot was running ` +
        'before then is not known)';
    }
    runLogMarkPaused_(Number(job.c), text, listed);
    const when = `${speedTime_(Number(job.c))} to ${speedTime_(Number(job.d))} ET`;
    if (job.end === 'done') {
      noteSwitch_('speedHonest', n ? `listed ${alerts} posted while the bot was OFF (${when})`
        : `no Burson alert was posted while the bot was OFF (${when})`);
    }
    else if (job.end === 'error') noteSwitch_('speedHonest', `⚠️ could not list the Burson alerts posted while the bot was OFF (${when}): ${job.why || 'an error'}`);
  } catch (e) {
    console.error('Burson while bot OFF: could not say how the listing went: ' + ((e && e.message) || e));
  }
}

/** The paused row (hidden "from (ms)" = `from`) of "When the bot ran": Details gets ` · ${text}`, "listed" `listed`. */
function runLogMarkPaused_(from, text, listed) {
  const tab = runLogTabState_();
  if (!tab.sh) return;
  const row = runLogRowOf_(tab.sh, from);
  if (!row) return;
  const was = String(tab.sh.getRange(row, 4).getValue() || '');
  tab.sh.getRange(row, 4).setValue(runLogCell_(truncate_(`${was}${was ? ' · ' : ''}${text}`, 1000)));
  tab.sh.getRange(row, 8).setValue(JSON.stringify(listed));
  RUN_LOG_CACHE_ = null;
}

/** Is this the "Burson while bot OFF" tab the bot made? Its A1 is the bot's title. Never throws. */
function isOffListTab_(sh) {
  try {
    return !!sh && sh.getLastRow() >= 1 && String(sh.getRange(1, 1).getDisplayValue()).trim() === OFF_LIST_TITLE_;
  } catch (e) {
    return false;
  }
}

/**
 * Adds `hits` (offListEntry_'s, from `space`, for the stretch `job`) to the "Burson while bot OFF" tab, made on the first
 * hit, each message once: {ok, added} or {ok: false, foreign} (a person's tab of that name: never written).
 */
function offListAppend_(ss, job, space, hits) {
  if (!ss) return { ok: false, why: 'no sheet' };
  try {
    let sh = ss.getSheetByName(OFF_LIST_TAB_);
    if (sh && !isOffListTab_(sh)) return { ok: false, foreign: true };
    if (!sh) {
      sh = ss.insertSheet(OFF_LIST_TAB_);
      sh.getRange(1, 1).setValue(OFF_LIST_TITLE_);
      try { sh.protect().setDescription('Written by the Burson QA bot').setWarningOnly(true); } catch (e) { /* works unprotected */ }
      sh.getRange(2, 1).setValue(runLogCell_(OFF_LIST_NOTE_));
      sh.getRange(RUN_LOG_HEAD_ROW_, 1, 1, OFF_LIST_HEADER_.length).setValues([OFF_LIST_HEADER_]);
      const fmt = f => { try { f(); } catch (e) { /* formatting only */ } };
      fmt(() => sh.getRange(1, 1).setFontWeight('bold').setFontSize(13));
      fmt(() => sh.getRange(RUN_LOG_HEAD_ROW_, 1, 1, OFF_LIST_HEADER_.length).setFontWeight('bold').setBackground('#f1f3f4'));
      fmt(() => sh.setFrozenRows(RUN_LOG_HEAD_ROW_));
      fmt(() => sh.hideColumns(OFF_LIST_HIDDEN_FROM_, OFF_LIST_HEADER_.length - OFF_LIST_HIDDEN_FROM_ + 1));
    }
    const last = sh.getLastRow();
    const have = new Set(last >= RUN_LOG_FIRST_ROW_
      ? sh.getRange(RUN_LOG_FIRST_ROW_, 10, last - RUN_LOG_FIRST_ROW_ + 1, 1).getValues().map(r => String(r[0])) : []);
    const now = Date.now();
    // column G: the paused stretch for an alert posted in it; for one posted outside it (the window starts at the last
    // running run's start: that run may not have read it), what the run log says the bot was doing then, read once
    let log;
    const when = at => {
      if (offListedWhileOff_({ at, stretchFrom: job.c, stretchTo: job.d })) return offListWhen_(job, at, null);
      if (log === undefined) log = runLogRead_(ss);
      return offListWhen_(job, at, log);
    };
    const rows = hits.filter(h => !have.has(h.name)).map(h => [
      speedTime_(h.at), runLogCell_(h.issue), runLogCell_(h.url), runLogCell_(h.product), runLogCell_(h.tag),
      runLogCell_(space.name), runLogCell_(when(h.at)), h.at, runLogCell_(h.key), runLogCell_(h.name), runLogCell_(h.status),
      runLogCell_(space.id), Number(job.c), Number(job.d), now,
    ]);
    if (rows.length) {
      sh.getRange(Math.max(last, RUN_LOG_HEAD_ROW_) + 1, 1, rows.length, OFF_LIST_HEADER_.length).setValues(rows);
      offListTrim_(sh);
    }
    return { ok: true, added: rows.length };
  } catch (e) {
    console.error('Burson while bot OFF: could not add rows: ' + ((e && e.message) || e));
    return { ok: false, why: String((e && e.message) || e) };
  }
}

/**
 * Was this alert of the "Burson while bot OFF" tab (offListed_'s: at, stretchFrom, stretchTo) posted in its own paused
 * stretch, that is while the bot was OFF? The listing's window starts earlier (at the start of the last run before the
 * pause, which may not have read what came after it), so an alert listed for a stretch can be from before it: that one
 * is never counted as posted while the bot was OFF. Pure.
 */
function offListedWhileOff_(x) {
  const at = Number(x && x.at) || 0;
  const from = Number(x && x.stretchFrom) || 0;
  const to = Number(x && x.stretchTo) || 0;
  return at > 0 && from > 0 && to >= from && at >= from && at <= to;
}

/**
 * Column G ("While the bot was OFF (ET)") of the "Burson while bot OFF" tab, for an alert posted at `at` (ms) and listed
 * for the paused stretch of `job` ({c, d}: its two ends): that stretch, "<from> to <to>", when the alert was posted in
 * it; else, in words, what the run log (`log`: runLogRead_'s) says the bot was doing when it was posted, e.g. "Not while
 * OFF: posted while the bot's runs were failing, before Bot was set OFF (… ET)". Pure but for GEN.
 */
function offListWhen_(job, at, log) {
  const c = Number(job && job.c) || 0;
  const d = Number(job && job.d) || 0;
  if (offListedWhileOff_({ at, stretchFrom: c, stretchTo: d })) return `${speedTime_(c)} to ${speedTime_(d)}`;
  // what the run log recorded at that very time (a stretch from at or before it, to after it)
  const chk = log ? runLogCheckIn_(log, Number(at), Number(at) + 1) : null;
  const state = !log ? 'not known' : chk ? chk.state : 'running';
  if (Number(at) < c) {
    const before = `before Bot was set OFF (${speedTime_(c)} ET)`;
    if (state === 'failing') return `Not while OFF: posted while the bot's runs were failing, ${before}`;
    if (state === 'not running') return `Not while OFF: posted while the bot was not running, ${before}`;
    if (state === 'running') return `Not while OFF: posted ${before}, while the bot was running`;
    if (state === 'not known') return `Not while OFF: posted ${before}; whether the bot was running then is not known`;
    return `Not while OFF: posted ${before}`;
  }
  const after = `after Bot was OFF (${speedTime_(c)} to ${speedTime_(d)} ET), before the bot's next run`;
  if (state === 'not running') return `Not while OFF: posted while the bot was not running, ${after}`;
  return `Not while OFF: posted ${after}`;
}

/** Keeps "Burson while bot OFF" in bounds: rows listed more than 60 days ago go first, past 5,000 rows the oldest 500. */
function offListTrim_(sh) {
  try {
    const last = sh.getLastRow();
    const n = last - RUN_LOG_FIRST_ROW_ + 1;
    if (n <= 1) return;
    const old = Date.now() - OFF_LIST_LIMITS_.days * RUN_LOG_DAY_MS_;
    let cut = 0;
    if (Number(sh.getRange(RUN_LOG_FIRST_ROW_, 15).getValue()) < old) {
      const at = sh.getRange(RUN_LOG_FIRST_ROW_, 15, n, 1).getValues();
      while (cut < n && Number(at[cut][0]) < old) cut++;
    }
    if (!cut && n > OFF_LIST_LIMITS_.rows) cut = OFF_LIST_LIMITS_.cut;
    cut = Math.min(cut, n - 1);
    if (cut >= 1) sh.deleteRows(RUN_LOG_FIRST_ROW_, cut);
  } catch (e) {
    console.error('Burson while bot OFF: could not remove its oldest rows: ' + ((e && e.message) || e));
  }
}

/**
 * Burson's alerts listed while the bot was OFF, posted in [from, to] (ms), oldest first: [{name, at, space, spaceName,
 * key, url, issue, status, product, tag, stretchFrom, stretchTo, listedAt}]. [] when the tab isn't there or isn't the
 * bot's. `ss` (optional): the bot's sheet, when called outside poll(). The same post can be on the Alert log too (one
 * the bot picked up as Bot was turned back ON): readers take the earliest per post key. Never throws.
 */
function offListed_(from, to, ss) {
  try {
    const book = (currentRunId_() ? RUN_LOG_SS_ : null) || ss || openStore_(false);
    const sh = book.getSheetByName(OFF_LIST_TAB_);
    if (!sh || !isOffListTab_(sh)) return [];
    const last = sh.getLastRow();
    if (last < RUN_LOG_FIRST_ROW_) return [];
    const a = Number(from);
    const b = Number(to);
    return sh.getRange(RUN_LOG_FIRST_ROW_, 1, last - RUN_LOG_FIRST_ROW_ + 1, OFF_LIST_HEADER_.length).getValues()
      .map(r => ({
        name: String(r[9] || ''), at: Number(r[7]) || 0, space: String(r[11] || ''), spaceName: String(r[5] || ''),
        key: String(r[8] || ''), url: String(r[2] || ''), issue: String(r[1] || ''), status: String(r[10] || ''),
        product: String(r[3] || ''), tag: String(r[4] || ''), stretchFrom: Number(r[12]) || 0, stretchTo: Number(r[13]) || 0,
        listedAt: Number(r[14]) || 0,
      }))
      .filter(x => x.at > 0 && x.at >= a && x.at <= b)
      .sort((x, y) => x.at - y.at);
  } catch (e) {
    return [];
  }
}
