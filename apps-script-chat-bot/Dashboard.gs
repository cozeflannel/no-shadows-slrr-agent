/**
 * Dashboard.gs — the live dashboard web app's entry point and shared base (Control row 54, Live dashboard; row 55, Slide
 * deliveries). The web app is part of the bot: one Apps Script web app served by this project (doGet), running as the
 * bot's own account (manifest "webapp": executeAs USER_DEPLOYING) and open only to people the bot's sheet is shared with
 * (dashAccess_). The page carries no data: it asks the dash* functions (DashboardData.gs: Live, read-only;
 * SlideDeliveries.gs: Slide deliveries) through google.script.run.
 *
 *   doGet(e)                 the page (DashboardPage.html with DashboardCss.html and DashboardJs.html)
 *   include_(name)           an HTML partial's content, for the page template
 *   dashAccess_()            {ok, email, why}: may this viewer see the dashboard? (the same people as the bot's sheet)
 *   webViewerCall_()         true when a dashboard viewer (not the bot's own account) is calling: every other public
 *                            function of the bot refuses such a call (its first line)
 *   dashCtx_()               the read-only context every dash* function starts from: {ss, control, switches, mode, now}
 *   dashBuildInfo_(ctx)      {web, bot, behind, url, sameAccount}: is this link's code older than the bot's, and does it
 *                            run as the bot's account (Control B8)?
 *   dashServed_(answer)      the answer with servedAt: the bot's clock as it is sent (the page's "N min ago" counts
 *                            from it, never from the viewer's device clock)
 *
 * Nothing here writes to the sheet, Chat or Gmail. The only writes are short-lived read caches (keys `dash1:`).
 */

// The dashboard's own build id: changed by hand whenever the dashboard's code changes. poll() writes it to the property
// BOT_BUILD while row 54 is ON (the time trigger runs the newest code); the web app compares it with its own copy (a
// deployment serves the code of its version), and says so when the link runs an older version than the bot
const DASH_BUILD_ = '2026-11-18.6';
const DASH_BUILD_PROP_ = 'BOT_BUILD';
const DASH_ACL_CACHE_SEC_ = 600;
const DASH_TITLE_ = 'Burson QA bot · Live';

/**
 * The web app's page. Access is checked first: a viewer the bot's sheet is not shared with sees why, and nothing else.
 * A viewer Google did not name (a blank address) gets the why as plain text (ContentService): no HtmlService page, so no
 * google.script.run bridge reaches someone the bot could not identify (webViewerCall_ can't tell them from a trigger run).
 */
function doGet(e) {
  const access = dashAccess_();
  if (!access.ok && !access.email) {
    return ContentService.createTextOutput(`You can't open the live dashboard yet. ${access.why}`).setMimeType(ContentService.MimeType.TEXT);
  }
  if (!access.ok) {
    return HtmlService.createHtmlOutput(dashDeniedHtml_(access))
      .setTitle(DASH_TITLE_)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const page = HtmlService.createTemplateFromFile('DashboardPage');
  page.viewerEmail = access.email || '';
  return page.evaluate()
    .setTitle(DASH_TITLE_)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** An HTML partial's content (DashboardPage.html includes DashboardCss and DashboardJs with it). */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/** The page shown to a viewer who may not see the dashboard: why, and what to do. Pure. */
function dashDeniedHtml_(access) {
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    'body{font-family:"Google Sans Flex","Google Sans",Roboto,Arial,sans-serif;margin:0;padding:48px 16px;background:#f8fafd;color:#1f1f1f}' +
    '@media (prefers-color-scheme:dark){body{background:#131314;color:#e3e3e3}}' +
    'main{max-width:560px;margin:0 auto;line-height:1.5}h1{font-size:22px;font-weight:500}</style></head><body><main>' +
    `<h1>You can't open the live dashboard yet</h1><p>${esc(access.why)}</p></main></body></html>`;
}

/**
 * May this viewer see the dashboard? The same people as the bot's sheet: the bot's own account, anyone the sheet is
 * shared with (its editors and viewers), or everyone when the sheet is shared with the whole domain or with anyone who
 * has the link. {ok, email, self, why}. Only a definite answer is cached (10 minutes per viewer, keyed by a SHA-256 of
 * the address, so no two addresses share one); when Drive can't be asked, or the bot's sheet is not known, the viewer is
 * told to try again and nothing is cached. A share through a Google Group can't be seen (Drive lists the group's
 * address, and checking its members needs a permission the bot does not ask for): the answer says so. Never throws.
 */
function dashAccess_() {
  let email = '';
  let self = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { email = ''; }
  try { self = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { self = ''; }
  if (!email) {
    return { ok: false, email: '', self: false,
      why: 'Google did not tell the dashboard who you are, so it cannot check that the bot\'s sheet is shared with you. ' +
        'Open the link while signed in to your work Google account, in the same organisation as the bot\'s account.' };
  }
  if (self && email === self) return { ok: true, email, self: true, why: '' };
  let key = '';
  try { key = `dash1:acl:${dashDigest_(email)}`; } catch (e) { key = ''; }
  let cache = null;
  try { cache = key ? CacheService.getScriptCache() : null; } catch (e) { cache = null; }
  try {
    const hit = cache ? cache.get(key) : null;
    if (hit === '1') return { ok: true, email, self: false, why: '' };
    if (hit === '0') return dashDenied_(email);
  } catch (e) { /* asked again below */ }
  let ok = false;
  try {
    const id = PropertiesService.getScriptProperties().getProperty(STORE_SHEET_PROP_);
    if (!id) return dashUnchecked_(email);
    const file = DriveApp.getFileById(id);
    const wide = String(file.getSharingAccess());
    if (wide === String(DriveApp.Access.DOMAIN) || wide === String(DriveApp.Access.DOMAIN_WITH_LINK) ||
      wide === String(DriveApp.Access.ANYONE) || wide === String(DriveApp.Access.ANYONE_WITH_LINK)) {
      ok = true;
    } else {
      const people = [].concat(file.getEditors() || [], file.getViewers() || []);
      try { people.push(file.getOwner()); } catch (e) { /* a shared drive file has no owner */ }
      ok = people.some(u => { try { return String(u && u.getEmail() || '').trim().toLowerCase() === email; } catch (e) { return false; } });
    }
  } catch (e) {
    return dashUnchecked_(email);  // not a definite answer: never cached
  }
  try { if (cache) cache.put(key, ok ? '1' : '0', DASH_ACL_CACHE_SEC_); } catch (e) { /* asked again next time */ }
  return ok ? { ok: true, email, self: false, why: '' } : dashDenied_(email);
}

/** A viewer's address as a cache key's part: the SHA-256 (hex) of the lower-cased address. Pure but for Utilities. */
function dashDigest_(email) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(email || '').toLowerCase(), Utilities.Charset.UTF_8);
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

/** The "not shared with you" answer (the viewer's own address only; never another one). Pure. */
function dashDenied_(email) {
  return { ok: false, email, self: false,
    why: `The live dashboard shows the bot's work to the people its sheet is shared with, and the sheet is not shared with ${email}. ` +
      'Ask the owner of the bot\'s sheet (the Google Sheet with the Control tab) to share it with you, then open this link again ' +
      '(it can take up to 10 minutes to let you in). If it is shared with you through a Google Group, the bot can\'t see that: ' +
      'ask to be added by name.' };
}

/**
 * The answer when the sharing could not be checked just now (Drive did not answer, or the bot's sheet is not known): not
 * cached, and marked `unchecked` (never a refusal: dashRefusal_ answers it without `denied`, so the page keeps what it
 * shows and says it can't be sure). Pure.
 */
function dashUnchecked_(email) {
  return { ok: false, email, self: false, unchecked: true,
    why: 'The dashboard could not check who the bot\'s sheet is shared with just now (Google Drive did not answer, or the bot ' +
      'has not been set up yet): try again in a minute.' };
}

/**
 * True when a dashboard viewer is calling: the person running the code (the active user) is known and is not the
 * account the bot runs as. Every public function of the bot other than the dashboard's own refuses such a call (the web
 * app runs as the bot's account, so google.script.run could otherwise reach them). Trigger runs and the owner's own runs
 * in the editor are never refused. A blank active user is a trigger run (Apps Script names no user there), so it is
 * not refused: a web-app visitor Google did not name never gets a page with google.script.run in the first place
 * (doGet answers them in plain text). Never throws.
 */
function webViewerCall_() {
  try {
    const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (!active) return false;
    const self = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
    return !!self && active !== self;
  } catch (e) {
    return false;
  }
}

/**
 * The read-only context every dash* function starts from: the bot's sheet, its Control tab, the switches as the tab
 * says now, the mode (testing / live) as the bot last wrote it in C29, whether the Control tab could be read at all
 * (controlOk: a missing tab, or a read that failed, is not "every switch OFF"), whether the bot is ON (B2: botOn) and
 * whether this web app runs as the account in "Runs as" (B8: sameAccount, null when B8 is blank or unreadable; no
 * address is kept in the answer). Throws when the sheet can't be opened (the caller turns that into a plain message).
 */
function dashCtx_() {
  const ss = openStore_(false);
  const control = controlTab_(ss);
  let controlOk = false;
  let botOn = false;
  let sameAccount = null;
  if (control) {
    try {
      // B2 to the last switch row, read here so a read that fails is told apart from a tab whose switches are OFF
      // (readSwitches_ answers "all OFF" for both)
      const last = Math.max.apply(null, switchRows_());
      const top = control.getRange(2, 2, last - 1, 1).getValues();
      botOn = parseControl_(top[0][0], '', '').on;
      const runsAs = String(top[6][0] === undefined || top[6][0] === null ? '' : top[6][0]).trim().toLowerCase();
      const me = slideBotAccount_().toLowerCase();
      sameAccount = runsAs && me ? runsAs === me : null;
      controlOk = true;
    } catch (e) {
      controlOk = false;
    }
  }
  const switches = control && controlOk ? readSwitches_(control) : switchesOff_();
  let mode = 'unknown';
  try {
    const c29 = control ? String(control.getRange(29, 3).getValue() || '') : '';
    if (/Testing/.test(c29)) mode = 'testing';
    else if (/\bLIVE\b/.test(c29)) mode = 'live';
  } catch (e) { mode = 'unknown'; }
  return { ss, control, switches, controlOk, botOn, sameAccount, mode, now: Date.now() };
}

/** The answer of a dash* call when the Control tab is missing or could not be read (never "it is OFF"). Pure. */
function dashControlUnread_(ctx) {
  return { ok: false, why: ctx && ctx.control
    ? 'The Control tab of the bot\'s sheet could not be read just now, so the dashboard can\'t tell which parts are ON: press Refresh in a minute.'
    : 'The bot\'s sheet has no Control tab (it is made by setup()), so the dashboard can\'t tell which parts are ON: the bot\'s account runs setup() once.' };
}

/** The words the page shows when this web app runs as another account than the bot (Control B8): no address. Pure. */
const DASH_ACCOUNT_WHY_ = 'This web app runs as a different Google account than the bot (Control B8, "Runs as"): it was deployed ' +
  'from another account. The owner deploys it again signed in as the account in B8 (README, "Live dashboard", steps 3 and 4); ' +
  'until then no deck is checked, previewed, saved or run from this link (that account is not the one decks are shared ' +
  'with; scheduled deliveries go on as the bot\'s account).';

/**
 * {web, bot, behind, url, sameAccount, accountWhy}: the dashboard code this link runs vs the newest code the bot runs
 * (BOT_BUILD), the web app's own link (the page reads the deployment id from it for the exact `clasp deploy -i <id>`
 * command), and whether it runs as the bot's account (Control B8; `ctx`: dashCtx_). Never throws.
 */
function dashBuildInfo_(ctx) {
  let bot = '';
  try { bot = String(PropertiesService.getScriptProperties().getProperty(DASH_BUILD_PROP_) || ''); } catch (e) { bot = ''; }
  const sameAccount = ctx && typeof ctx.sameAccount === 'boolean' ? ctx.sameAccount : null;
  return { web: DASH_BUILD_, bot, behind: !!bot && bot !== DASH_BUILD_, url: dashWebAppUrl_(), sameAccount,
    accountWhy: sameAccount === false ? DASH_ACCOUNT_WHY_ : '' };
}

/** The web app's own link (empty when no web app deployment exists yet). Never throws. */
function dashWebAppUrl_() {
  try { return String(ScriptApp.getService().getUrl() || ''); } catch (e) { return ''; }
}

/** True when the bot's account has approved editing Google Slides (needed by Slide deliveries). Never throws. */
function dashScopeOk_() {
  try {
    const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/presentations']);
    return String(info.getAuthorizationStatus()) === String(ScriptApp.AuthorizationStatus.NOT_REQUIRED);
  } catch (e) {
    return false;
  }
}

/**
 * An answer that is ok, with `servedAt`: the bot's clock (ms) as it is sent. The page counts every "Updated 14 s ago"
 * and "3 min ago" from it plus the seconds since it arrived, never from the viewer's device clock (which can be wrong).
 * A refusal or a failure is returned as it is (it shows no times). Returns the same object.
 */
function dashServed_(answer) {
  if (answer && typeof answer === 'object' && !Array.isArray(answer) && answer.ok === true) answer.servedAt = Date.now();
  return answer;
}

/**
 * A dash* function's refusal, in the shape the page reads: {ok: false, denied, why}. Sharing that could not be checked
 * just now (dashUnchecked_) is not a refusal: {ok: false, why}, with no `denied` (the page keeps what it shows). Pure.
 */
function dashRefusal_(access) {
  if (access && access.unchecked === true) return { ok: false, why: access.why || 'The dashboard could not check who the bot\'s sheet is shared with just now: try again in a minute.' };
  return { ok: false, denied: true, why: (access && access.why) || 'You can\'t open the live dashboard.' };
}
