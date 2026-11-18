/**
 * HeadStart.gs — the Head start tab of the bot's sheet: how this app's OWN alerts compare with Burson's alerts and with
 * the IMs' Social Alert emails. How often this app alerted a story before Burson did, how often before the IMs emailed,
 * by how much, and which stories it had first. The Results tab (Speed.gs) can't say: it counts only the alerts Burson
 * posted and leaves this app's own alerts out; the Watch detections scorecard (ProactiveWatch.gs) measures a watch's
 * flag against Burson on the same post only.
 *
 * It only reads the Alert log and its own tab, and writes only its own tab. Nothing is posted in any Chat space,
 * nothing is emailed, no Gmail search and no BigQuery read is made, the Alert memory is neither asked nor written, and
 * there is no Control tab row or switch for the tab itself (the Control tab's "How it works" has one line about it, and
 * its Status says when the tab can't be updated). Control row 56 ("Speed numbers: leave out when the bot was not
 * running", OFF until a person turns it ON) adds the speed check to it, below; OFF, nothing of it is read or written.
 *
 * What's counted (headStartReport_, pure: Alert-log rows in, the stories and the numbers out):
 *   own alert    an Alert-log row whose `ingested` column is the Early Detection value (ED_ALERT_INGESTED_), the Watch
 *                alert value (PW_ALERT_INGESTED_) or a Direct BigQuery source label (BQ_SOURCE_LABELS_). Its type:
 *                "Early Detection"; "Early signal" (its Early Detection snapshot's signal type is the early-watch one,
 *                EWS_WATCH_SIGNAL_); "Watch"; "Direct (Sprinklr)", "Direct (BMIE)", "Direct (BSIP)". Rows of another
 *                tool's alerts (Other alert) and of sheet test alerts are neither this app's nor Burson's: left out
 *   story        one own alert and its updates, counted once. An Early Detection card that updates an earlier card
 *                (forwarded_fields.early_detection.update_of names that card's Alert-log id, or its BigQuery alert id)
 *                is part of that card's story, and so are two own alerts that share a post key. The story's time is
 *                its EARLIEST alert
 *   this app     when its alert was posted: the row's source_at (for an own card that is the card's own post time in
 *   alerted      Chat), else created_at
 *   a time       a number of ms that is a real date (headStartTime_: finite, above 0, below 8.64e15), in a row's
 *                source_at or created_at and in an IM time alike. Anything else there (a text, a number past the last
 *                date there is) is no time: an own alert without a time is left out, a row of Burson's without one
 *                doesn't count, and an IM time that isn't one is no IM time
 *   post keys    the row's record_key, plus forwarded_fields.early_detection.post_keys when there are any (8 at most),
 *                over every row of the story
 *   Burson       an Alert-log row with a blank `ingested` that isn't the Other alerts space's and has a link and a
 *   alerted      recorded source_at: what ProactiveWatch.gs pwBursonTimes_ counts, of the rows whose source_at is a
 *                time. When: the earliest source_at of Burson's rows for that post key (both test spaces usually hold
 *                one row each)
 *   the IMs      the IMs' time for the matched Burson post as the Results tab works it out (Speed.gs speedImAt_: their
 *   emailed      email, else their draft): never looked up here, and never one of the bot's own emails (Speed.gs leaves
 *                those out). It comes from the Results rebuild made earlier in the same run (Speed.gs RESULTS_RUN_),
 *                which shows Burson's posts of the last settings.speed_days (7) days only, and not every rebuild of
 *                this tab has one in its run. So the tab keeps each story's IM time itself, in hidden columns at the
 *                far right of its stories tables (the Burson post's key as the Results tab has it, the time in ms, and
 *                `email` or `draft`), the way the Results tab keeps its own state. Before a rebuild writes the tab
 *                anew they are read back (readHeadStartState_) and merged with the run's (headStartImMerge_): for a post
 *                this run's Results rebuild shows, its answer wins, "no time" included (the Results tab knows the post
 *                and says none: a remembered time is dropped); for a post it doesn't show (older than its days, or no
 *                Results rebuild in this run), the remembered time is used. So the 30-day numbers cover 30 days. A
 *                remembered time is only as old as the tab: there is none for a Burson alert that was already older
 *                than the Results tab's days when the tab was first made, or when its story first came onto it
 *
 * Matching a story with a Burson alert (the tab's "Matched on" says which rule gave it, so a person can judge it).
 * Burson may be earlier OR later. The two sure rules come first:
 *   same post    one of the story's post keys is a Burson alert's record key
 *   same story   Burson's alert tells the same story on another post, as the reviews themselves recorded it: one name
 *                per issue (IssueNames.gs existingIssueOf_). A review that recognises an alert as an issue already
 *                alerted, whatever tied them (the email thread, a follow-up, the same story by meaning in the Alert
 *                memory, Gemini's call on the existing issues, a near-identical name), gives it that issue's exact name
 *                and the Ongoing Issue status, and its Alert-log row keeps both (forwarded_fields.issue_name and
 *                issue_status: Review.gs rule 14b for Burson's alerts, OtherAlerts.gs and EarlyDetection.gs for this
 *                app's own). So: the two carry the same issue name (IssueNames.gs issueNameKey_) and the LATER of the
 *                two is an Ongoing Issue. Nothing else on a row is as sure: the Alert memory's story id is never
 *                written on a row, and a decision names an earlier alert's id only when a Social Alert was held back.
 *                Once one of Burson's alerts is tied to the story that way, the name is the story's issue, and Burson's
 *                other alerts under it (never under another exposure tag) are on the same story too. Burson's FIRST
 *                alert under the name is often among them: where this app's alert was only to be watched, Burson's
 *                first alert on the story was a New one, and only its next ones are Ongoing Issues under that name
 * The story is measured against the EARLIEST of Burson's alerts those two rules give, taken together, and the row is
 * labelled with the rule that gave that alert. So Burson's alert on one of the story's posts never hides an earlier
 * alert of Burson's on the same story: the head start is to Burson's first alert on the story, and when that came before
 * this app's, this app was behind, however soon after it Burson alerted the same post.
 *
 * The post-level answer is kept beside the story-level one, and never changes it: Burson's first alert on one of the
 * story's OWN posts (story.post), and the head start to it (story.post_lead_ms), whatever the story-level answer is.
 * Mostly the two are the same alert. They differ when Burson's first alert on the story was on another post: an alert of
 * this app's that its own review took for an issue Burson alerted days before (its name, an Ongoing Issue) is behind
 * Burson by days on the story, and this app can still have alerted that very post before Burson did. The tab shows
 * both, so "which posts did this app have first, and by how much" has its answer whatever the issue is called.
 * A head start on a post is from this app's alert on THAT post (story.post_own_at: the story's earliest alert that
 * carries the post's key), not from the story's first alert: an update card carries its own posts, so a post that a
 * later card or update brought, and that Burson had alerted before then, is one this app was behind on (the story's
 * row then says when this app alerted it). When Burson alerted several of a story's posts, the row shows the one
 * Burson alerted first, and the headline line counts each of them (story.post_leads_ms): it counts posts, not stories.
 *
 * Only when neither sure rule finds an alert, the two weaker rules are tried, taken together in the same way (the
 * earliest alert, labelled with its rule) and labelled apart:
 *   same story   the two carry the same issue name and nothing says more: no review took one of Burson's alerts under
 *   (same issue  that name and this app's alert for one issue. As IssueNames.gs knownIssueName_ takes a name for an
 *   name)        existing issue's: never when the two are under two different exposure tags (a generic name can cover
 *                more than one issue), but a row without a tag can match
 *   same story   the Alert memory's word check (AlertMemory.gs amSameStoryWords_, the one it falls back to when it has
 *   (similar     no vector) on the two rows' issue name, exposure tag and product, as the memory builds a story's view
 *   wording)     from them: the same exposure tag, issue words at least novelty_min_jaccard alike, never with clashing
 *                identifiers in them (a CVE, a long number, an @handle). That check doesn't compare the products
 *                themselves. To keep it quick, it is only run on Burson's alerts under the same tag that share a word
 *                of the name and are at least half that alike (the rest could never pass it)
 * The three same-story rules only look at Burson's alerts within HEAD_START_STORY_DAYS_ (14) days either side of the
 * story's time. alertMemory_().storyMatch is never called and no text is embedded.
 *
 * What the matching can't see, and the tab says so: the sure same-story rule depends on a review having given the later
 * alert the earlier one's name, and a review only does that for an earlier alert that went out (a Social Alert sent,
 * drafted or on its way, or a team's emoji: Escalate.gs earlierOutcome_). Burson's alerts usually did, so "Burson
 * first" is seen well. One of this app's alerts that was only to be watched (an Early Detection card to monitor, a
 * Watch alert with no Social Alert) never gives its name to Burson's later alert; such a story is found again only on
 * its own posts, on an identical issue name, or on similar wording under the same exposure tag, and an Early Detection
 * card has an exposure tag only when its review was sure it is an SLRR matter. So a story with no Burson alert FOUND
 * may still have been alerted by Burson under another name: the count is called "No Burson alert found", never "not
 * alerted", and "this app first" is, if anything, undercounted.
 *
 * The tab, top to bottom: its title in A1 (the bot's mark) and one line saying what's counted and when it was rebuilt
 * (ET); HEADLINE NUMBERS for the last 7 and the last 30 days, by when this app alerted (stories, those Burson alerted
 * too, this app first and its median head start, Burson first and the median time behind, no Burson alert found, the
 * post-level line: of these stories' posts that Burson alerted too, those this app alerted before Burson alerted the
 * same post, with the median head start on those posts; this app's alert before the IMs' email and the median time
 * from one to the other, and the reverse view: Burson's alerts and how many of them are on a story this app had alerted
 * first: those that came after a story of this app's that was itself ahead of Burson's first alert on it); BIGGEST HEAD
 * STARTS (the ten longest over Burson's first alert on the story, last 30 days); EVERY
 * STORY (last 30 days, newest first): Type · This app alerted (ET) · Story (the issue name or the card's headline,
 * linked to the lead post) · Product · Exposure Tag · Burson alerted (ET) · Head start over Burson · IMs emailed (ET) ·
 * Head start over the IMs · Matched on · App alert · Burson alert, then the two head starts in plain minutes, to sort
 * by (negative when this app was later), then the post-level answer: Burson on this post (ET) · Head start on the post ·
 * Burson alert on this post · that head start in plain minutes. A head start is in words ("2 d 15 h", "3 h 10 min",
 * "45 min"; "behind by 20 min" when this app was later); a cell is blank, never a zero, where there's no Burson alert
 * (on the story, or on one of its posts) or no IM time.
 * After those, hidden (HEAD_START_STATE_COL_), the three columns the tab remembers the IMs' times in: the Burson
 * post's key, the IMs' time in ms, and whether it is their email or their draft.
 *
 * poll() calls maybeRefreshHeadStart_() at the end of every run, after the Results tab: the tab is rebuilt at most
 * every 10 minutes, in a run where the Results tab was rebuilt too (it has the IMs' latest times; 10 more minutes
 * without one and it is rebuilt with the times it remembers), never with under 30 seconds of the run left, and never in
 * a run that is still catching up on alerts (one of its flows held an alert for the next run, stopped at its limit of
 * messages or ran out of time: headStartRunBusy_). Such a run must end as soon as it can, so the next one starts on
 * time; the tab shows nothing that can't wait, and is rebuilt in the first run that has caught up. It never throws: a
 * failure is logged and the run carries on. refreshHeadStart() rebuilds it now, from the editor, with the IMs' times
 * the tab remembers (newer ones follow at the next run that has them). The tab is made the first time this app has an
 * alert of its own to show.
 *
 * The tab is the bot's own: its title in A1 says so (isHeadStartTab_), checked before every read, clear and write. A
 * tab named "Head start" that the bot didn't make is never read, cleared or written: the log says so at each rebuild,
 * and so does the Control tab's Status (B5: Main.gs poll() reads headStartBlockedNote_ right after the Results tab's
 * note) from the next run on, until the first rebuild after the tab is renamed. Every cell stays at or under 49,000
 * characters, and text the bot didn't write itself (issue names, headlines, products, tags, alert ids, post keys) can
 * never be read as a formula (Speed.gs speedText_, ProactiveWatch.gs pwCell_); the only formulas are the quoted links
 * (Speed.gs resultsLink_). A rebuild writes its cells over the old ones and only then clears what is left beyond them
 * (writeHeadStartTab_), so one that stops before its write, or whose write fails, leaves the tab as it was, the IMs'
 * times it remembers included. A rebuild that can't READ those times (a Sheets call fails on the hidden columns, or on
 * the A1 check before them: readHeadStartState_'s `unread`) writes nothing either: "could not read" is never taken for
 * "nothing remembered", which would drop the times of Burson's alerts the Results tab no longer shows. The log says
 * so, and the next rebuild (10 minutes on, as after any rebuild) tries again.
 *
 * The speed check (Control row 56 ON only; headStartHonest_). The numbers above count every race, also one in which the
 * bot was not running: after a stretch with no runs (a stopped trigger, a wait for a permission, failing runs) or with
 * Bot (B2) OFF, this app's alert comes late, and Burson's alerts posted while Bot was OFF are never on the Alert log, so
 * a story then reads "No Burson alert found" or a head start over a later alert of Burson's. With row 56 ON the bot
 * keeps a run log ("When the bot ran", RunLog.gs) and lists Burson's alerts posted while it was OFF ("Burson while bot
 * OFF"), and the tab shows, NEXT TO the numbers above (which never change): six more headline lines (the race on the same
 * post while the bot was running, with its signed median and how many posts it is of; Burson alerting the issue first
 * on another post, counted apart and never as a win or a loss; the races left out because the bot was not running,
 * paused or failing between the two alerts; Burson's alerts listed while the bot was OFF; the races from before the run
 * log started, not known), a note, and one more column in both stories tables, after the hidden state columns, "Speed
 * check: was the bot running?", that says it for each story ("not comparable: the bot was not running from … to … ET",
 * "Burson alerted this while the bot was OFF (posted … ET)", "the bot was running the whole time", …). Every time in it
 * is a recorded one: nothing is estimated, and what the run log can't say is "not known".
 */

const HEAD_START_TAB_ = 'Head start';
// The bot's mark, in A1: how it knows the tab is its own (isHeadStartTab_). A tab people made never has it
const HEAD_START_TITLE_ = 'Head start: how far ahead of Burson\'s alerts and the IMs\' emails this app\'s own alerts were ' +
  '(written by the Burson QA bot)';
const HEAD_START_OWN_TITLES_ = [HEAD_START_TITLE_];
// Columns 1 to 14: the story and Burson's first alert on it (the story-level answer), the two head starts in plain
// minutes last. Columns 15 to 18: Burson's first alert on one of the story's OWN posts (the post-level answer)
const HEAD_START_HEADER_ = ['Type', 'This app alerted (ET)', 'Story', 'Product', 'Exposure Tag', 'Burson alerted (ET)',
  'Head start over Burson', 'IMs emailed (ET)', 'Head start over the IMs', 'Matched on', 'App alert', 'Burson alert',
  'Head start over Burson (min)', 'Head start over the IMs (min)', 'Burson on this post (ET)', 'Head start on the post',
  'Burson alert on this post', 'Head start on the post (min)', 'Burson post key', 'IM time (ms)', 'IM time from'];
// Hidden from here on: the IMs' time the tab remembers for each story's Burson post (its key, the time, `email` or
// `draft`), read back by the next rebuild (readHeadStartState_, which finds the columns by their names)
const HEAD_START_STATE_COL_ = 19;
const HEAD_START_TIME_COLS_ = [2, 6, 8, 15];       // a time each: this app's, Burson's, the IMs', Burson's on the post
const HEAD_START_POST_WORDS_COL_ = 16;             // "Head start on the post": its words can be long (headStartRow_)
const HEAD_START_WIDTHS_ = [[1, 330], [2, 140], [3, 320], [4, 140], [5, 220], [6, 140], [7, 160], [8, 140], [9, 160], [10, 190],
  [11, 130], [12, 110], [13, 110], [14, 110], [15, 140], [16, 160], [17, 130], [18, 110]];
const HEAD_START_WIDE_ = 8;                        // the long texts (what's counted, the notes) are merged across A:H
const HEAD_START_MIN_MS_ = 60 * 1000;
const HEAD_START_DAY_MS_ = 24 * 60 * HEAD_START_MIN_MS_;
const HEAD_START_TIME_END_MS_ = 8.64e15;           // a time is below this, the last moment a date can hold (headStartTime_)
const HEAD_START_DAYS_ = 30;                       // the tab's stories: the last 30 days, by when this app alerted
const HEAD_START_WEEK_DAYS_ = 7;                   // the headline numbers' shorter window
const HEAD_START_STORY_DAYS_ = 14;                 // same story: Burson's alerts this many days either side of the story
const HEAD_START_TOP_ = 10;                        // BIGGEST HEAD STARTS: this many stories
const HEAD_START_POST_KEYS_ = 8;                   // of an Early Detection card's post keys (BigQuery.gs ED_POSTS_MAX_)
const HEAD_START_EVERY_MS_ = 10 * HEAD_START_MIN_MS_;         // rebuilt at most this often
const HEAD_START_MIN_LEFT_MS_ = 30 * 1000;                    // a rebuild needs this much of the run left
const HEAD_START_WAIT_RESULTS_MS_ = 10 * HEAD_START_MIN_MS_;  // once due, it waits this long for a run with a Results rebuild
const HEAD_START_RUN_MS_ = 6 * HEAD_START_MIN_MS_;            // Apps Script's longest run (when the run's start isn't given)
const HEAD_START_AT_PROP_ = 'HEAD_START_AT';                  // when it was last rebuilt (ms)
// 'true' while a "Head start" tab the bot didn't make is in the way (the Control tab's Status, B5, says so)
const HEAD_START_BLOCKED_PROP_ = 'HEAD_START_BLOCKED';
const HEAD_START_READ_ROWS_ = 16000;               // Alert-log rows read at most (as Speed.gs resultsAlertRows_)
const HEAD_START_NAME_CHARS_ = 200;                // a story's name on the tab
const HEAD_START_LINK_CHARS_ = 2000;               // a longer link isn't linked
// The headline line of the post-level answer (headStartTabRows_): it counts posts, not stories (headStartWindow_)
const HEAD_START_POST_LINE_ = 'Posts this app alerted before Burson alerted the same post ' +
  '(of these stories\' posts that Burson alerted too)';
const HEAD_START_SAME_POST_ = 'same post';
const HEAD_START_SAME_STORY_ = 'same story';
const HEAD_START_SAME_NAME_ = 'same story (same issue name)';
const HEAD_START_SIMILAR_ = 'same story (similar wording)';
// "Matched on", by how sure the rule is (1 the surest): the two sure rules, then the two weaker ones (headStartMatch_)
const HEAD_START_RULES_ = ['', HEAD_START_SAME_POST_, HEAD_START_SAME_STORY_, HEAD_START_SAME_NAME_, HEAD_START_SIMILAR_];
// Control row 56 ON ("Speed numbers: leave out when the bot was not running"; RunLog.gs, switch key speedHonest): the
// speed check (headStartHonest_). Six more headline lines and one more note, next to the ones that were there, and one
// more column in both stories tables, after the hidden state columns. OFF, none of it is read, worked out or written
const HEAD_START_CHECK_HEADER_ = 'Speed check: was the bot running?';
const HEAD_START_STATE_COLS_ = 3;                  // the hidden state columns, from HEAD_START_STATE_COL_ on
const HEAD_START_CHECK_PX_ = 360;                  // the speed check column's width
const HEAD_START_CHECK_CHARS_ = 45000;             // a cell of the speed check (its lines, its note, its column), at most
const HEAD_START_CHECK_RACES_ = 3;                 // a story's races on its own posts its speed check names, at most
const HEAD_START_CHECK_LISTINGS_ = 3;              // unfinished OFF listings the note names, at most
// Burson's alert tells the same story on ANOTHER post: where Burson was first, that is "Burson alerted the issue first"
const HEAD_START_ISSUE_RULES_ = [HEAD_START_SAME_STORY_, HEAD_START_SAME_NAME_, HEAD_START_SIMILAR_];
// The space of Burson's alerts that were listed when Bot was turned back ON (headStartOffRows_): never on the Alert log
const HEAD_START_OFF_SPACE_ = '(listed while the bot was OFF)';
// The six headline lines of the speed check, in their order on the tab (after the reverse-view line, before the note)
const HEAD_START_CHECK_LINES_ = [
  'Race on the same post, while the bot was running: median head start over Burson ("behind by" when Burson was first)',
  'Race on the same post, while the bot was running: posts this app alerted first, and posts Burson alerted first',
  'Burson alerted the issue first, on another post (not counted as a win or a loss)',
  'Not comparable: the bot was not running, paused or failing between the two alerts',
  'Burson\'s alerts posted while the bot was OFF and never reviewed (listed when Bot was turned back ON)',
  'Not known: from before the bot kept its run log',
];

/**
 * Run this to rebuild the Head start tab now (while the bot is ON, poll() keeps it up to date: maybeRefreshHeadStart_).
 * With Control row 56 ON (read from the Control tab), with the speed check too.
 */
function refreshHeadStart() {
  if (webViewerCall_()) throw new Error('Not available from the dashboard');
  const ss = openStore_(false);
  const now = Date.now();
  const out = refreshHeadStart_(ss, { now, make: true, honest: headStartHonestOn_(ss) });
  if (out.blocked) {  // a "Head start" tab the bot didn't make: left as it is (refreshHeadStart_ says so in the log)
    console.warn(`Head start tab not rebuilt: ${headStartBlockedText_()}`);
    return null;
  }
  if (out.unread) {  // Sheets didn't answer when the tab's hidden columns were read: the tab is left as it was
    console.warn('Head start tab not rebuilt: the IMs\' times it remembers could not be read, so it is left as it was. Run this again.');
    return null;
  }
  // The IMs' times come with the Results tab's rebuild in the every-minute run: this rebuild keeps the ones the tab
  // remembers, and the tab is due again right away, so the next run that has them brings them up to date
  PropertiesService.getScriptProperties().setProperty(HEAD_START_AT_PROP_, String(now - HEAD_START_EVERY_MS_));
  console.log(JSON.stringify(out.windows, null, 2));
  return out.windows;
}

/**
 * From poll(), at the end of every run, after maybeRefreshSpeed_: rebuilds the Head start tab when it's due. opts:
 * {deadline (ms: when the run must be done), runStart (ms: when this run began), flows (what each flow of this run
 * left: its ctx, or its {ctx, report})}. Due: 10 minutes after the last rebuild, in a run where the Results tab was
 * rebuilt (its posts carry the IMs' times: headStartResultsRun_); when no such run comes for 10 more minutes (or the
 * Results tab is off: settings.speed_tab), it is rebuilt with the IMs' times the tab remembers and no new ones. Never
 * with under 30 seconds of the run left, and never in a run that is still catching up on alerts (headStartRunBusy_):
 * nothing is read or noted then, and the tab stays due. True when it wrote the tab. Never throws.
 */
function maybeRefreshHeadStart_(ss, ctx, opts) {
  try {
    const o = opts || {};
    if (!ss) return false;
    if (headStartRunBusy_(ctx, o.flows)) return false;  // alerts are waiting for the next run: it must start on time
    const now = ctx && typeof ctx.now === 'function' ? ctx.now() : Date.now();
    const deadline = Number(o.deadline) || Number(ctx && ctx.deadline) || 0;
    if (deadline && deadline - now < HEAD_START_MIN_LEFT_MS_) return false;
    const props = PropertiesService.getScriptProperties();
    const last = Number(props.getProperty(HEAD_START_AT_PROP_)) || 0;
    if (now - last < HEAD_START_EVERY_MS_) return false;
    const run = headStartResultsRun_(o.runStart, now);
    const resultsOn = ((ctx && ctx.settings) || {}).speed_tab !== false;
    if (!run && last && resultsOn && now - last < HEAD_START_EVERY_MS_ + HEAD_START_WAIT_RESULTS_MS_) return false;
    props.setProperty(HEAD_START_AT_PROP_, String(now));
    const out = refreshHeadStart_(ss, { now, im: run ? headStartImTimes_(run.posts) : null,
      covered: run ? headStartImCovered_(run.posts) : null, honest: switchOn_(ctx, 'speedHonest') });
    return !!out.written;
  } catch (e) {
    console.error('Head start tab not refreshed: ' + ((e && e.message) || e));
    return false;
  }
}

/**
 * Is this run still catching up on alerts? True when the run's ctx, or one of its flows (`flows`: each a flow's ctx,
 * or the {ctx, report} its run gave: the Mirror space's, the auto-correct space's, the Other alerts space's), says
 * so: the flow marked itself busy (ctx.slaBusy: Main.gs and AutoCorrect.gs set it), or its report shows what they go
 * by: an alert held for the next run (report.held), as many messages handled as a run may handle
 * (settings.max_messages_per_run: more may be waiting), or a stop at its time budget. The next run takes those alerts
 * up, and it only starts when this one has ended (poll() skips a minute while the run before is still going): a
 * rebuild here could make them wait a minute more. Pure; never throws.
 */
function headStartRunBusy_(ctx, flows) {
  const busy = x => {
    try {
      if (!x || typeof x !== 'object') return false;
      const c = x.ctx && typeof x.ctx === 'object' ? x.ctx : x;
      const r = x.report && typeof x.report === 'object' ? x.report : null;
      if (c.slaBusy) return true;
      if (!r) return false;
      const most = Number((c.settings || {}).max_messages_per_run);
      return Number(r.held) > 0 || (most > 0 && Number(r.handled) >= most) ||
        (Array.isArray(r.errors) ? r.errors : []).some(e => /^time budget/.test(String(e)));
    } catch (e) {
      return false;
    }
  };
  return busy(ctx) || (Array.isArray(flows) ? flows : []).some(busy);
}

/**
 * Rebuilds the Head start tab: headStartReport_'s {stories, top, windows, …} plus `written` (the tab was written) and
 * `im_from_run` (this run's Results rebuild gave the IMs' times; false: only the ones the tab remembers, if any).
 * opts: now (ms), im (the IMs' time per Burson post from this run's Results rebuild, headStartImTimes_; null when there
 * was none), covered (the Burson posts that rebuild shows, headStartImCovered_; without it, the posts `im` has a time
 * for), make (make the tab even with no story to show: refreshHeadStart()); tests: alerts (the Alert log's rows). The
 * IMs' times the tab remembers (readHeadStartState_: read from the bot's own tab before it is written anew) are merged with
 * the run's (headStartImMerge_). The tab is made the first time there's a story to show, so a sheet where this app
 * never alerted on its own gets no tab. {blocked: true} when a tab named Head start that the bot didn't make is in the
 * way: that tab is left as it is (never read, cleared or written), nothing else is read, and the log and the Control
 * tab's Status say so (noteHeadStartBlocked_). {unread: true} when the IMs' times the bot's own tab remembers could not
 * be read (a Sheets call failed: readHeadStartState_): nothing is written, so the tab keeps them, and the log says so.
 * opts.honest (Control row 56 ON: maybeRefreshHeadStart_ and refreshHeadStart() say): the report also gets its speed
 * check (report.honest: headStartHonestFor_), worked out only when the tab is to be written. Without it nothing more is
 * read than before, and the report and the tab are exactly what they were.
 */
function refreshHeadStart_(ss, opts) {
  const o = opts || {};
  const now = Number(o.now) || Date.now();
  const blocked = headStartTabForeign_(ss);
  noteHeadStartBlocked_(blocked);
  if (blocked) {
    console.warn(`Head start tab not updated: a "${HEAD_START_TAB_}" tab the bot didn't make is there (left as it is)`);
    return { blocked: true, written: false, stories: [], top: [], windows: null };
  }
  const since = now - (HEAD_START_DAYS_ + HEAD_START_STORY_DAYS_) * HEAD_START_DAY_MS_;
  // What the last rebuild left in the tab's hidden columns (the bot's own tab only: readHeadStartState_ checks), read
  // now, before this rebuild writes over them
  const kept = readHeadStartState_(ss.getSheetByName(HEAD_START_TAB_));
  if (kept.unread) {
    // Sheets didn't answer: written now, the tab would forget the IMs' times only it still has. Nothing else is read
    console.warn('Head start tab not updated this time: the IMs\' times it remembers could not be read, so it is left as ' +
      'it was (the next rebuild tries again)');
    return { unread: true, written: false, stories: [], top: [], windows: null };
  }
  const im = headStartImMerge_(o.im || null, o.covered || null, kept);
  const rows = o.alerts || headStartAlertRows_(ss, since);
  const report = headStartReport_(rows, im, now);
  report.im_from_run = !!o.im;
  report.written = false;
  if (!ss.getSheetByName(HEAD_START_TAB_) && !o.make && !report.stories.length) return report;  // nothing of its own to show yet
  // Control row 56 ON: the speed check, next to the numbers above (which it never changes)
  if (o.honest === true) report.honest = headStartHonestFor_(ss, rows, report, since, now);
  const sh = ensureHeadStartTab_(ss);
  // null: a tab the bot didn't make took the name since the check above. Left as it is; the next rebuild notes it
  if (!sh) throw new Error(`a "${HEAD_START_TAB_}" tab the bot didn't make is in the way: left as it is`);
  writeHeadStartTab_(sh, report);
  report.written = true;
  return report;
}

/**
 * The Alert log's rows from every partition, back to `since` (ms), 16,000 at most: read only. Unlike the store's
 * reader (Sheets.gs sheetTable_) it never makes the tab or touches its header row: this report writes its own tab and
 * nothing else. One column (created_at) is read first to find how far back to go, then the rows, once. [] when there's
 * no Alert log yet.
 */
function headStartAlertRows_(ss, since) {
  const sh = ss.getSheetByName(ALERT_TAB_);
  const last = sh ? sh.getLastRow() : 0;
  if (last < 2) return [];
  const header = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  while (header.length && !header[header.length - 1]) header.pop();
  if (header.indexOf('alert_id') < 0) return [];
  const col = header.indexOf('created_at') + 1;
  let count = Math.min(last - 1, ALERT_READ_ROWS_);
  if (col) {
    const made = sh.getRange(2, col, last - 1, 1).getValues();
    let first = made.length;
    for (let i = 0; i < made.length; i++) {
      const v = made[i][0];
      if ((v instanceof Date ? v.getTime() : Number(v) || 0) >= since) { first = i; break; }
    }
    count = Math.min(made.length - first, HEAD_START_READ_ROWS_);
  }
  return count > 0 ? tableOver_(sheetIO_(sh), header, 'alert_id', count).load() : [];
}

/**
 * The Results rebuild made in THIS run ({at, posts}: Speed.gs RESULTS_RUN_), or null when there was none: its posts
 * carry the IMs' times. `runStart` (ms): when this run began; without it, anything from the last 6 minutes (Apps
 * Script's longest run: each run starts with nothing, so that can only be this run's).
 */
function headStartResultsRun_(runStart, now) {
  const run = typeof RESULTS_RUN_ === 'undefined' ? null : RESULTS_RUN_;
  if (!run || !Array.isArray(run.posts)) return null;
  const from = Number(runStart) || (Number(now) || Date.now()) - HEAD_START_RUN_MS_;
  return Number(run.at) >= from ? run : null;
}

/**
 * The IMs' time per Burson post from the Results tab's posts (Speed.gs speedPosts_, after speedImEmails_): {post key
 * (Speed.gs postKey_): {at (ms), from: 'email' | 'draft'}}, as Speed.gs speedImAt_ gives it (their email, else their
 * draft). Only posts with a time (headStartTime_). The bot's own emails and drafts never count as the IMs' (Speed.gs
 * botEmailThreads_, resultsHumanDrafts_). Pure.
 */
function headStartImTimes_(posts) {
  const out = {};
  (Array.isArray(posts) ? posts : []).forEach(p => {
    if (!p || !p.key) return;
    const at = headStartTime_(speedImAt_(p));
    if (at) out[String(p.key)] = { at, from: headStartTime_(p.im_email_at) ? 'email' : 'draft' };
  });
  return out;
}

/**
 * The Burson posts a Results rebuild shows (its posts: Speed.gs speedPosts_): their post keys (Speed.gs postKey_), with
 * or without an IM time. For these the rebuild's answer is the answer, "no time" included (headStartImMerge_). A post
 * without a link has no key, and isn't one of them. Pure.
 */
function headStartImCovered_(posts) {
  const seen = new Set();
  (Array.isArray(posts) ? posts : []).forEach(p => { if (p && p.key) seen.add(String(p.key)); });
  return Array.from(seen);
}

/**
 * The IMs' time per Burson post for one rebuild, from this run's Results rebuild and from what the tab remembers:
 * {post key: {at (ms), from: 'email' | 'draft'}}, or null when neither has anything to give (no Results rebuild in
 * this run, and nothing remembered). `run`: headStartImTimes_ of this run's Results rebuild, or null without one;
 * `covered`: the posts that rebuild shows (headStartImCovered_; a post `run` has a time for is one of them, listed or
 * not); `remembered`: what the tab's hidden columns held (readHeadStartState_'s Map, or the same as a plain object).
 * For a post the rebuild shows, its answer wins, "no time" included: the Results tab knows the post and says none, so
 * a remembered time is dropped. For a post it doesn't show (older than its days, or no Results rebuild in this run),
 * the remembered time is used. A time that isn't one (headStartTime_) is no time, wherever it is from. Pure.
 */
function headStartImMerge_(run, covered, remembered) {
  const times = run && typeof run === 'object' && !Array.isArray(run) ? run : null;
  const shown = new Set((Array.isArray(covered) ? covered : []).map(String));
  if (times) Object.keys(times).forEach(k => shown.add(k));
  const out = {};
  let any = false;
  const take = (key, hit) => {
    const at = hit && typeof hit === 'object' ? headStartTime_(hit.at) : 0;
    if (!key || !at) return;
    out[key] = { at, from: hit.from === 'email' ? 'email' : 'draft' };
    any = true;
  };
  const kept = remembered && typeof remembered === 'object' && !Array.isArray(remembered) ? remembered : null;
  const keep = (hit, key) => { if (!shown.has(String(key))) take(String(key), hit); };
  if (kept && typeof kept.forEach === 'function') kept.forEach(keep);  // a Map
  else if (kept) Object.keys(kept).forEach(k => keep(kept[k], k));
  if (times) Object.keys(times).forEach(k => take(k, times[k]));
  return times || any ? out : null;
}

/**
 * The IMs' times the last rebuild left on the tab, by Burson post: a Map {post key: {at (ms), from: 'email' |
 * 'draft'}}, from the hidden columns (HEAD_START_STATE_COL_ on) of every story row of both stories tables (the same
 * story can be in both; they agree). The tables are found wherever the numbers above them left them: a row that starts
 * with "Type" is a table's header, and the rows under it, down to the first blank one, are its stories. Only the tab
 * the bot made is read (headStartTabMarked_: of a tab people made, nothing but the A1 that check looks at). Reading never
 * throws, and a cell that isn't what the bot wrote there is no state: a row counts only with a key, a time that is one
 * (headStartTime_) and the word email or draft. An empty Map for a tab from before these columns, and for no tab.
 * "Could not read" is not "nothing remembered": when a Sheets call fails (on these columns, or on the A1 check before
 * them), the Map is empty and its `unread` is true, the log says why, and refreshHeadStart_ writes nothing this time.
 * Written then, the tab would lose for good the times the Results tab no longer has.
 */
function readHeadStartState_(sh) {
  const out = new Map();
  try {
    if (!headStartTabMarked_(sh)) return out;
    const last = sh.getLastRow();
    if (last < 2) return out;
    const first = sh.getRange(1, 1, last, 1).getValues().map(r => headStartText_(r[0]));
    const head = first.indexOf(HEAD_START_HEADER_[0]) + 1;  // the first table's header row
    if (!head || head >= last) return out;
    const header = sh.getRange(head, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(headStartText_);
    const col = header.indexOf(HEAD_START_HEADER_[HEAD_START_STATE_COL_ - 1]) + 1;
    if (!col) return out;
    // no further than the sheet's last column with anything in it: a person can delete the last state columns, and a
    // read beyond the sheet's last column fails. A row without its time or its email/draft cell is no state, like any
    // broken cell
    const state = sh.getRange(head + 1, col, last - head, Math.min(3, header.length - col + 1)).getValues();
    let inTable = true;
    state.forEach((cells, i) => {
      const label = first[head + i];  // column A of this row
      if (label === HEAD_START_HEADER_[0] || !label) { inTable = !!label; return; }
      if (!inTable) return;
      // the key as it was written (Sheets hands a text back without the apostrophe that kept it from being a formula)
      const key = typeof cells[0] === 'string' ? cells[0] : typeof cells[0] === 'number' ? String(cells[0]) : '';
      const at = headStartTime_(cells[1]);
      const from = headStartText_(cells[2]);
      if (key && at && (from === 'email' || from === 'draft') && !out.has(key)) out.set(key, { at, from });
    });
  } catch (e) {
    out.clear();
    out.unread = true;  // not "nothing remembered": the caller leaves the tab as it was
    console.error('Head start tab: the IMs\' times it remembers could not be read: ' + ((e && e.message) || e));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The report: Alert-log rows in, the stories and the numbers out. Pure.
// ---------------------------------------------------------------------------------------------------------------

/** A JSON object column's value (forwarded_fields, email_input), or {} when the cell holds anything else. Pure. */
function headStartObj_(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** A text or a number as one line of text; '' for none, and for anything else a broken cell could hold. Pure. */
function headStartText_(v) {
  return typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim() : '';
}

/**
 * A time in ms, when the value is one: a number (or a text that is a number, or a date) that is finite, above 0 and
 * below 8.64e15, so a real date can be made of it; else 0. A cell's 1e20, "Infinity", NaN or -5 is no time: taken for
 * one, it would stop the tab's writer ("Invalid time value"). Never throws. Pure.
 */
function headStartTime_(v) {
  try {
    const n = typeof v === 'number' ? v
      : typeof v === 'string' && v.trim() ? Number(v)
        : v && typeof v === 'object' && typeof v.getTime === 'function' ? Number(v.getTime()) : NaN;
    return isFinite(n) && n > 0 && n < HEAD_START_TIME_END_MS_ ? n : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * The type of an own alert's row, by its `ingested` column: "Early Detection", "Early signal" (the snapshot's signal
 * type is EWS_WATCH_SIGNAL_), "Watch", "Direct (<source label>)"; '' for a row that isn't this app's own alert
 * (Burson's, another tool's, a sheet test alert). Pure.
 */
function headStartOwnType_(row) {
  const ing = headStartText_(row && row.ingested);
  if (!ing) return '';
  if (typeof ED_ALERT_INGESTED_ === 'string' && ing === ED_ALERT_INGESTED_) {
    const sig = headStartText_(headStartObj_(headStartObj_(row.forwarded_fields).early_detection).signal_type).toUpperCase();
    return typeof EWS_WATCH_SIGNAL_ === 'string' && sig === EWS_WATCH_SIGNAL_ ? 'Early signal' : 'Early Detection';
  }
  if (typeof PW_ALERT_INGESTED_ === 'string' && ing === PW_ALERT_INGESTED_) return 'Watch';
  const labels = typeof BQ_SOURCE_LABELS_ === 'object' && BQ_SOURCE_LABELS_
    ? Object.keys(BQ_SOURCE_LABELS_).map(k => BQ_SOURCE_LABELS_[k]) : [];
  return labels.indexOf(ing) >= 0 ? `Direct (${ing})` : '';
}

/**
 * What the report reads from one Alert-log row: {id, at (when it reached the space: source_at, else created_at; 0 when
 * neither is a time: headStartTime_), source_at (0 when it isn't a time), name (the issue name, without a status
 * suffix), name_key (how issue names compare), ongoing (its issue status is Ongoing Issue), headline (an Early
 * Detection card's), product, tag, tag_key (how exposure tags compare: by the tag's current name, in lower case; ''
 * for none), url, key (record_key), ed (the Early Detection snapshot), view (the Alert memory's view of its story, for
 * the word check; null without issue words)}. Never throws: a broken cell reads as blank. Pure.
 */
function headStartRowFacts_(a) {
  const ff = headStartObj_(a.forwarded_fields);
  const ef = headStartObj_(headStartObj_(a.email_input).fields);
  const pick = k => headStartText_(ff[k] === undefined || ff[k] === null || ff[k] === '' ? ef[k] : ff[k]);
  const sourceAt = headStartTime_(a.source_at);
  const name = issueNameText_(pick('issue_name'));
  const out = {
    id: headStartText_(a.alert_id), at: sourceAt || headStartTime_(a.created_at), source_at: sourceAt,
    name, name_key: issueNameKey_(name), ongoing: pick('issue_status').toLowerCase().indexOf(ONGOING_STATUS_SUFFIX_.toLowerCase()) === 0,
    headline: headStartText_(headStartObj_(ff.early_detection).story_title),
    product: pick('product'), tag: pick('exposure_tag') || headStartText_(a.exposure_tag), url: pick('post_url'),
    key: headStartText_(a.record_key), ed: headStartObj_(ff.early_detection), view: null, tag_key: '',
  };
  out.tag_key = out.tag.toLowerCase();  // as it is written, should the tag's current name not be found below
  try {
    const tag = amTag_(out.tag);  // by its current name, as the Alert memory compares tags
    out.tag_key = String(tag || '').trim().toLowerCase();
    // As AlertMemory.gs builds a story's view (storyView), from the issue name, the exposure tag and the product (the
    // summary is left out): its issue words, its tag, its product, and the identifiers those three name
    const fields = { issue_name: name, product: out.product, exposure_tag: out.tag };
    const author = pick('author') || headStartText_(a.author);
    const tok = issueTokens_(name);
    if (tok.length) {
      out.view = { tag, prod: amProduct_(out.product), tok,
        idt: amIdents_(amStoryText_(fields), [author, out.url ? authorFromUrl_(out.url) : '']) };
    }
  } catch (e) {
    out.view = null;
  }
  return out;
}

/**
 * This app's own alerts as stories: [{type, at, name, url, product, tag, alert_id, alert_ids, alerts, keys, keys_at
 * (for each of `keys`, in the same order: when this app first alerted that post, the time of the story's earliest
 * alert that carries its key), rows (each row's headStartRowFacts_)}]. An update card joins the card it updates
 * (update_of: that card's Alert-log id, or its BigQuery alert id), and own alerts that share a post key are one story;
 * a story's time, type, name and link are its earliest alert's. Rows that aren't own alerts, have no time
 * (headStartTime_: a source_at or created_at that is a real date), or can't be read are left out. Pure.
 */
function headStartStories_(rows) {
  const own = [];
  (Array.isArray(rows) ? rows : []).forEach(a => {
    try {
      if (!a || typeof a !== 'object') return;
      const type = headStartOwnType_(a);
      if (!type) return;
      const f = headStartRowFacts_(a);
      if (!(f.at > 0)) return;
      const keys = [];
      [f.key].concat(Array.isArray(f.ed.post_keys) ? f.ed.post_keys.slice(0, HEAD_START_POST_KEYS_).map(headStartText_) : [])
        .forEach(k => { if (k && keys.indexOf(k) < 0) keys.push(k); });
      own.push({ f, type, keys, update_of: headStartText_(f.ed.update_of), ed_id: headStartText_(f.ed.ed_alert_id) });
    } catch (e) { /* a row that can't be read is left out */ }
  });
  // One story: a card and its updates, and own alerts on the same post
  const parent = own.map((x, i) => i);
  const root = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (i, j) => { const a = root(i); const b = root(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  const byId = new Map();
  const byEd = new Map();
  const byKey = new Map();
  own.forEach((x, i) => {
    if (x.f.id && !byId.has(x.f.id)) byId.set(x.f.id, i);
    if (x.ed_id && !byEd.has(x.ed_id)) byEd.set(x.ed_id, i);
  });
  own.forEach((x, i) => {
    const earlier = x.update_of ? (byId.has(x.update_of) ? byId.get(x.update_of) : byEd.get(x.update_of)) : undefined;
    if (earlier !== undefined) join(i, earlier);
    x.keys.forEach(k => { if (byKey.has(k)) join(i, byKey.get(k)); else byKey.set(k, i); });
  });
  const groups = new Map();
  own.forEach((x, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(x);
  });
  return Array.from(groups.values()).map(list => {
    list.sort((x, y) => x.f.at - y.f.at || (x.f.id < y.f.id ? -1 : x.f.id > y.f.id ? 1 : 0));
    const lead = list[0];
    const firstOf = get => { const hit = list.find(x => get(x)); return hit ? get(hit) : ''; };
    const keys = [];
    const keysAt = [];  // the list is earliest first: a key's time is that of the first alert that carries it
    list.forEach(x => x.keys.forEach(k => { if (keys.indexOf(k) < 0) { keys.push(k); keysAt.push(x.f.at); } }));
    return {
      type: lead.type, at: lead.f.at, name: firstOf(x => x.f.name) || firstOf(x => x.f.headline), url: firstOf(x => x.f.url),
      product: firstOf(x => x.f.product), tag: firstOf(x => x.f.tag), alert_id: lead.f.id,
      alert_ids: list.map(x => x.f.id).filter(Boolean), alerts: list.length, keys, keys_at: keysAt, rows: list.map(x => x.f),
    };
  });
}

/**
 * Burson's alerts by post: a Map {record key: {key, at (when Burson alerted: the earliest source_at of its rows),
 * alert_id, url, name, rows (each row's headStartRowFacts_, earliest first)}}. What counts is what ProactiveWatch.gs
 * pwBursonTimes_ counts (a link, a blank `ingested`, not the Other alerts space's partition, a source_at above 0) of
 * the rows whose source_at is a time (headStartTime_: a row whose source_at is no real date doesn't count), and the
 * time is the one it gives for them. Pure.
 */
function headStartBurson_(rows) {
  // the rows with a source_at that is a time: of these, pwBursonTimes_ says which are Burson's and when Burson alerted
  const list = (Array.isArray(rows) ? rows : []).filter(a => {
    try { return !!a && typeof a === 'object' && headStartTime_(a.source_at) > 0; } catch (e) { return false; }
  });
  const times = pwBursonTimes_(list);
  const out = new Map();
  list.forEach(a => {
    try {
      if (!a.record_key || a.ingested || String(a.space || '').endsWith(OS_PARTITION_SUFFIX_)) return;
      const key = String(a.record_key);
      const at = headStartTime_(times[key]);
      if (!at) return;
      if (!out.has(key)) out.set(key, { key, at, alert_id: '', url: '', name: '', rows: [] });
      out.get(key).rows.push(headStartRowFacts_(a));
    } catch (e) { /* a row that can't be read is left out */ }
  });
  out.forEach(g => {
    g.rows.sort((x, y) => x.source_at - y.source_at);
    const firstOf = get => { const hit = g.rows.find(x => get(x)); return hit ? get(hit) : ''; };
    g.alert_id = firstOf(x => x.id);
    g.url = firstOf(x => x.url);
    g.name = firstOf(x => x.name);
  });
  return out;
}

/**
 * Matches each story with Burson's alerts: sets story.burson ({key, at, alert_id, url, name} of Burson's alert, or
 * null), story.matched (the rule that gave that alert: HEAD_START_SAME_POST_, HEAD_START_SAME_STORY_,
 * HEAD_START_SAME_NAME_, HEAD_START_SIMILAR_, or '') and story.lead_ms (Burson's time less the story's: above 0 when
 * this app was first; null without a match). The alert is the EARLIEST one the two sure rules give, taken together
 * (same post, same story: Burson's first alert on the story, whichever post it was on); only when they give none, the
 * earliest one the two weaker rules give (same issue name, similar wording). An alert two rules give is labelled with
 * the surer one, and so is the earlier of two at the very same time.
 * The post-level answer, beside it, whatever the story-level answer is: story.post_leads_ms, one for each of the
 * story's own posts that Burson alerted too (Burson's alert on that post less this app's alert on THAT post: the
 * story's earliest alert that carries its key, story.keys_at; so a post that a later card or update of the story
 * brought is measured from that card, not from the story's first alert), in the order Burson alerted them; and, for
 * the story's row, the first of them: story.post ({key, at, alert_id, url, name} of Burson's EARLIEST alert on one of
 * the story's own post keys, or null), story.post_own_at (when this app alerted that post; null without one) and
 * story.post_lead_ms (the one less the other; null without one). The two answers differ when Burson's first alert on
 * the story was on another post, and when the post came with a later alert of the story.
 * The reverse view, on each of Burson's alerts: ahead (1 same post, 2 same story, 3 same issue name, 4 similar wording:
 * the surest rule that ties it to a story of this app's that came before it), set only by a story that was itself
 * first (ahead of the alert it is measured against): where Burson had the story first, Burson's later alerts on it
 * are not ones this app had first. The rules are in this file's header. Pure (changes its arguments).
 */
function headStartMatch_(stories, burson) {
  const byName = new Map();  // issue name -> Burson's rows under it
  // exposure tag and issue word -> Burson's alerts with that word in their name under that tag (once per alert and
  // name). The word check needs the same tag and words alike, so only alerts that share a word are ever compared
  const byWord = new Map();
  const push = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
  const tagOf = view => (view && view.tag ? String(view.tag).trim().toLowerCase() : '');
  const sameView = (tag, r) => `${tag}\n${r.name_key}\n${JSON.stringify(r.view.idt)}`;  // rows that tell their story alike
  burson.forEach(g => {
    const seen = new Set();
    g.rows.forEach(b => {
      if (b.name_key) push(byName, b.name_key, { g, b });
      const tag = tagOf(b.view);
      if (!tag || seen.has(sameView(tag, b))) return;
      seen.add(sameView(tag, b));
      const entry = { g, b };
      b.view.tok.forEach(t => push(byWord, `${tag}\n${t}`, entry));
    });
  });
  const span = HEAD_START_STORY_DAYS_ * HEAD_START_DAY_MS_;
  const bar = Number(GEN.novelty_min_jaccard) || 0.6;  // how alike two names' words must be (AlertMemory.gs amSameStoryWords_)
  // two exposure tags that differ (one that's blank differs from none): IssueNames.gs knownIssueName_
  const otherTag = (a, b) => !!a.tag_key && !!b.tag_key && a.tag_key !== b.tag_key;
  stories.forEach(s => {
    const near = g => Math.abs(g.at - s.at) <= span;
    const post = new Set();
    s.keys.forEach(k => { if (burson.has(k)) post.add(burson.get(k)); });
    const story = new Set();
    const named = new Set();
    const similar = new Set();
    const compared = new Set();
    s.rows.forEach(r => {
      // Burson's alerts under the same issue name. A review took the later of the two for the earlier one's issue when
      // the later one is an Ongoing Issue
      const sameName = (r.name_key ? byName.get(r.name_key) || [] : []).filter(x => near(x.g));
      const taken = x => (x.b.source_at >= r.at ? x.b.ongoing : r.ongoing);
      const tied = sameName.some(taken);
      sameName.forEach(x => {
        if (taken(x)) story.add(x.g);
        // The same name and no more, never under two different exposure tags. On its own that is the weaker rule. Once
        // a review has tied one of Burson's alerts to this story under the name, the name is this story's issue (one
        // name per issue), and Burson's other alerts under it are on the same story: its first one may be among them
        else if (!otherTag(r, x.b)) (tied ? story : named).add(x.g);
      });
      // the Alert memory's word check, against Burson's alerts under the same tag that share a word of the name
      const tag = tagOf(r.view);
      if (!tag || compared.has(sameView(tag, r))) return;
      compared.add(sameView(tag, r));
      const shared = new Map();  // Burson's alert -> how many of the name's words it shares
      r.view.tok.forEach(t => (byWord.get(`${tag}\n${t}`) || []).forEach(x => {
        if (near(x.g) && !similar.has(x.g)) shared.set(x, (shared.get(x) || 0) + 1);
      }));
      shared.forEach((n, x) => {
        // far under the memory's bar (not half as alike in words): it could never pass, so the check is spared
        if (similar.has(x.g) || 2 * n < bar * (r.view.tok.length + x.b.view.tok.length - n)) return;
        let alike = 0;
        try { alike = amSameStoryWords_(r.view, x.b.view); } catch (e) { alike = 0; }
        if (alike > 0) similar.add(x.g);
      });
    });
    const rules = [post, story, named, similar];  // as HEAD_START_RULES_ numbers them, from 1
    const rank = g => rules.findIndex(set => set.has(g)) + 1;  // the surest rule that gives this alert
    const inOrder = sets => {  // Burson's alerts in these sets, the earliest first
      const all = new Set();
      sets.forEach(set => set.forEach(g => all.add(g)));
      return Array.from(all).sort((x, y) => x.at - y.at || rank(x) - rank(y) || (x.key < y.key ? -1 : 1));
    };
    const earliest = sets => inOrder(sets)[0] || null;
    // Burson's first alert on the story by the sure rules, whichever post it was on; else by the weaker ones
    const g = earliest([post, story]) || earliest([named, similar]);
    s.burson = g ? { key: g.key, at: g.at, alert_id: g.alert_id, url: g.url, name: g.name } : null;
    s.matched = g ? HEAD_START_RULES_[rank(g)] : '';
    s.lead_ms = g ? g.at - s.at : null;
    // The post-level answer: Burson's alerts on the story's own posts, whatever the story-level one, each against this
    // app's alert on that very post (the story's earliest alert that carries its key: a post a later card or update
    // brought is measured from that card, so a post Burson had before the update is never days "ahead"). Where a
    // review gave this app's alert the name of an issue Burson alerted days before, the story is behind Burson by
    // days, and this app can still have alerted the post itself before Burson did. The row shows Burson's first
    const ownAt = b => {
      const i = s.keys.indexOf(b.key);
      return i >= 0 && Array.isArray(s.keys_at) && s.keys_at[i] > 0 ? s.keys_at[i] : s.at;
    };
    const onPosts = inOrder([post]);
    const p = onPosts[0] || null;
    s.post = p ? { key: p.key, at: p.at, alert_id: p.alert_id, url: p.url, name: p.name } : null;
    s.post_own_at = p ? ownAt(p) : null;
    s.post_lead_ms = p ? p.at - ownAt(p) : null;
    s.post_leads_ms = onPosts.map(b => b.at - ownAt(b));
    // The reverse view: Burson's alerts this story came before, when this story was first. Where Burson had the story
    // first (its alert above is the earlier one), Burson's later alerts on it are not ones this app had first
    if (!(s.lead_ms > 0)) return;
    rules.forEach((set, i) => set.forEach(b => {
      if (s.at < b.at && (!b.ahead || i + 1 < b.ahead)) b.ahead = i + 1;
    }));
  });
}

/**
 * The headline numbers for the stories this app alerted since `since` and Burson's alerts since then: stories; matched
 * (a Burson alert was found for them) and its share; first (this app's alert strictly before Burson's), its share of
 * the matched and the median head start in minutes; behind (Burson strictly first) and the median minutes behind;
 * unmatched (no Burson alert found: not the same as never alerted by Burson, see this file's header); the post-level
 * numbers, which count posts, not stories: post_matched (the posts of these stories that Burson alerted too), post_first
 * (those this app alerted strictly before Burson alerted the same post, each from this app's alert on that post:
 * story.post_leads_ms), its share of those and post_first_median_min (the median of those head starts); im_known (stories
 * with an IM time), im_first (this app's alert before the IMs' time), its share, im_median_min (the median minutes from
 * this app's alert to the IMs' time, over every story with one: below 0 when this app was later) and im_from_email (how
 * many of those times are their email, not their draft); and the reverse view: burson_alerts, burson_after (those that
 * came after a story of this app's that was first, by any rule: headStartMatch_), its share, and burson_after_by {post,
 * story, name, wording}. A share is a whole percent, null of nothing; a median is to 0.1 minute, null of nothing. Pure.
 */
function headStartWindow_(stories, bursonList, since) {
  const list = stories.filter(s => s.at >= since);
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
  const median = ms => speedQuantile_(ms.map(v => v / HEAD_START_MIN_MS_), 0.5);
  const matched = list.filter(s => s.burson);
  const first = matched.filter(s => s.lead_ms > 0);
  const behind = matched.filter(s => s.lead_ms < 0);
  const onPost = [];  // a head start for each of these stories' posts that Burson alerted too
  list.forEach(s => (Array.isArray(s.post_leads_ms) ? s.post_leads_ms : []).forEach(ms => onPost.push(ms)));
  const postFirst = onPost.filter(ms => ms > 0);
  const withIm = list.filter(s => s.im);
  const imFirst = withIm.filter(s => s.im_lead_ms > 0);
  const theirs = bursonList.filter(g => g.at >= since);
  const after = theirs.filter(g => g.ahead);
  return {
    stories: list.length, matched: matched.length, matched_pct: pct(matched.length, list.length),
    first: first.length, first_pct: pct(first.length, matched.length), first_median_min: median(first.map(s => s.lead_ms)),
    behind: behind.length, behind_median_min: median(behind.map(s => -s.lead_ms)),
    unmatched: list.length - matched.length,
    post_matched: onPost.length, post_first: postFirst.length, post_first_pct: pct(postFirst.length, onPost.length),
    post_first_median_min: median(postFirst),
    im_known: withIm.length, im_first: imFirst.length, im_first_pct: pct(imFirst.length, withIm.length),
    im_median_min: median(withIm.map(s => s.im_lead_ms)), im_from_email: withIm.filter(s => s.im.from === 'email').length,
    burson_alerts: theirs.length, burson_after: after.length, burson_after_pct: pct(after.length, theirs.length),
    burson_after_by: { post: after.filter(g => g.ahead === 1).length, story: after.filter(g => g.ahead === 2).length,
      name: after.filter(g => g.ahead === 3).length, wording: after.filter(g => g.ahead === 4).length },
  };
}

/**
 * The whole report from the Alert log's rows (`rows`), the IMs' time per Burson post when it's at hand (`im`:
 * headStartImTimes_, or what headStartImMerge_ made of it and of the times the tab remembers; or null) and the time
 * (`now`, ms): {now, im_at_hand, stories (the last 30 days by when this app alerted, newest first: {type, at, name,
 * url, product, tag, alert_id, alert_ids, alerts, keys, keys_at, burson: {key, at, alert_id, url, name} | null, matched,
 * lead_ms, post: {key, at, alert_id, url, name} | null with post_own_at and post_lead_ms (Burson's first alert on one of
 * the story's own posts, against this app's alert on that post) and post_leads_ms (the same for each of its posts that
 * Burson alerted: headStartMatch_), im: {at, from} | null, im_key (the Burson post's key that time was found under, as the
 * Results tab has the post: what the tab remembers the time by; '' without one), im_lead_ms}), top (the ten of them
 * with the longest head start over Burson, longest first), windows: {week, month} (headStartWindow_ for 7 and 30
 * days)}. A broken row is left out, and so is a row without a time that is one (headStartTime_); neither ever fails
 * the report. Pure.
 */
function headStartReport_(rows, im, now) {
  const t = Number(now) || Date.now();
  const times = im && typeof im === 'object' ? im : null;
  const stories = headStartStories_(rows);
  const burson = headStartBurson_(rows);
  headStartMatch_(stories, burson);
  stories.forEach(s => {
    s.im = null;
    s.im_key = '';
    s.im_lead_ms = null;
    const g = s.burson && times ? burson.get(s.burson.key) : null;
    if (!g) return;
    // the IMs' time for Burson's post, by the post's identity on the Results tab (Speed.gs postKey_ of its link)
    for (let i = 0; i < g.rows.length && !s.im; i++) {
      const post = postKey_(g.rows[i].url);
      const hit = post && Object.prototype.hasOwnProperty.call(times, post) ? times[post] : null;
      const at = hit && typeof hit === 'object' ? headStartTime_(hit.at) : 0;
      if (!at) continue;
      s.im = { at, from: hit.from === 'email' ? 'email' : 'draft' };
      s.im_key = post;
    }
    if (s.im) s.im_lead_ms = s.im.at - s.at;
  });
  stories.forEach(s => { delete s.rows; });
  const bursonList = Array.from(burson.values());
  const monthStart = t - HEAD_START_DAYS_ * HEAD_START_DAY_MS_;
  const month = stories.filter(s => s.at >= monthStart)
    .sort((x, y) => y.at - x.at || (x.alert_id < y.alert_id ? -1 : x.alert_id > y.alert_id ? 1 : 0));
  const top = month.filter(s => s.lead_ms > 0).sort((x, y) => y.lead_ms - x.lead_ms || y.at - x.at).slice(0, HEAD_START_TOP_);
  return {
    now: t, im_at_hand: !!times, stories: month, top,
    windows: { week: headStartWindow_(stories, bursonList, t - HEAD_START_WEEK_DAYS_ * HEAD_START_DAY_MS_),
      month: headStartWindow_(stories, bursonList, monthStart) },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The speed check (Control row 56 ON): which races the bot was running for, next to the numbers above
// ---------------------------------------------------------------------------------------------------------------

/** Control row 56 ("Speed numbers: leave out when the bot was not running") is ON on the Control tab now. Never throws. */
function headStartHonestOn_(ss) {
  try {
    return readSwitches_(controlTab_(ss)).speedHonest === true;
  } catch (e) {
    return false;
  }
}

/**
 * The speed check of one rebuild (Control row 56 ON), from the Alert log's rows the report was made of (`rows`), the
 * report (`report`), the read window's start (`since`) and `now` (ms): the run log (RunLog.gs runLogRead_) and Burson's
 * alerts listed while the bot was OFF in the read window (offListed_), each read once. Those listed alerts are never on
 * the Alert log: they are added to its rows as Burson's (headStartOffRows_) and the stories are matched again with them
 * (the same stories: they are this app's own rows only), for the speed check alone. The report itself, and every cell
 * it gives the tab, stays as it was. Never throws: a failure is logged, and the tab says the check could not be worked
 * out this time ({failed}).
 */
function headStartHonestFor_(ss, rows, report, since, now) {
  try {
    const log = runLogRead_(ss);
    const listed = offListed_(since, now, ss);
    const own = Array.isArray(rows) ? rows : [];
    const all = listed.length ? own.concat(headStartOffRows_(listed)) : own;
    const r2 = listed.length ? headStartReport_(all, null, now) : report;
    return headStartHonest_(r2, headStartBurson_(all), log, listed, now);
  } catch (e) {
    const why = truncate_(String((e && e.message) || e), 200);
    console.error('Head start tab: the speed check could not be worked out: ' + why);
    return { failed: why, byId: new Map(), week: null, month: null, ok: false, why, start: 0, unfinished: [] };
  }
}

/**
 * Burson's alerts listed while the bot was OFF (RunLog.gs offListed_) as Alert-log rows of Burson's, for the speed check
 * only (they are never written anywhere): no alert id, `ingested` blank, timed when Burson posted (source_at and
 * created_at), the post key and the fields the listing read from the alert as Burson wrote it, and a space that says
 * where they come from. A listed alert without a time that is one is left out; one without a post key matches no post.
 * Pure.
 */
function headStartOffRows_(listed) {
  const out = [];
  (Array.isArray(listed) ? listed : []).forEach(x => {
    const at = x && typeof x === 'object' ? headStartTime_(x.at) : 0;
    if (!at) return;
    out.push({
      alert_id: '', created_at: at, source_at: at, record_key: headStartText_(x.key), ingested: '',
      space: `${headStartText_(x.space)} > ${HEAD_START_OFF_SPACE_}`,
      forwarded_fields: { issue_name: headStartText_(x.issue), issue_status: headStartText_(x.status),
        product: headStartText_(x.product), exposure_tag: headStartText_(x.tag), post_url: headStartText_(x.url) },
    });
  });
  return out;
}

/** A story's key in the speed check's cells (headStartHonest_'s byId): its first alert's id and its time. Pure. */
function headStartStoryKey_(s) {
  return `${headStartText_(s && s.alert_id)}\n${Number(s && s.at) || 0}`;
}

/**
 * The speed check (Control row 56 ON). `r`: headStartReport_ of the Alert log's rows together with Burson's alerts
 * listed while the bot was OFF (headStartOffRows_); `burson`: headStartBurson_ of those same rows; `log`: the run log
 * (RunLog.gs runLogRead_); `listed`: offListed_'s alerts; `now` (ms). Nothing in it is estimated: a time is a recorded
 * one, and a race is checked against the run log from one of its two alerts to the other (runLogCheckIn_):
 *   comparable      the bot was running the whole time between them (gaps of 10 minutes or less between runs included)
 *   not comparable  the bot was not running, paused or failing at some point between them: left out, counted apart
 *   not known       the run log doesn't say (from before it started, it can't be read, or it has no record that late)
 * For each story of the last 30 days:
 *   races on the same post   each of the story's own posts that Burson alerted too: this app's alert on THAT post (the
 *                            story's earliest alert that carries its key: story.keys_at) against Burson's first alert on
 *                            it; the head start is Burson's time less this app's (above 0: this app was first)
 *   the issue first          Burson's first alert on the story is on another post (one of the three same-story rules)
 *                            and came first: "Burson alerted this issue N earlier, on another post", never a win or a loss;
 *                            unless an earlier story of this app's was itself first on that same alert of Burson's: then
 *                            this story is a later alert on an issue this app alerted first, said so, and counted in none
 *                            of the lines (its races on its own posts still are)
 *   the story's own race     any other match (the story-level answer: "Burson alerted (ET)", "Head start over Burson"),
 *                            checked from the story's time to Burson's alert
 *   OFF                      Burson's alert (the story's, or one of its races') is one listed while the bot was OFF and
 *                            posted in its own paused stretch; one the Alert log has too (the bot picked it up when Bot
 *                            was turned back ON) is said so, and not counted with the ones never reviewed
 * Out: {byId: Map(headStartStoryKey_ -> the story's "Speed check" cell: blank for a story without a Burson alert),
 * week, month (the stories this app alerted in the last 7 and 30 days, as headStartWindow_ takes them: post_n,
 * post_median_min (the signed median of the comparable races' head starts, minutes), post_first, post_behind, post_tie;
 * issue_n, issue_median_min (how much earlier Burson was); left_posts, left_stories (not comparable); unknown_posts,
 * unknown_stories (not known); off_alerts (Burson's alerts listed while the bot was OFF, posted in their paused stretch
 * in those days and never reviewed, each post once), off_stories (stories one of them was matched with)), ok, why,
 * start (the run log's), unfinished (each OFF listing of the last 30 days that did not list everything, in words)}.
 * Pure but for GEN (the times in words).
 */
function headStartHonest_(r, burson, log, listed, now) {
  const t = Number(now) || Date.now();
  const theirs = burson && typeof burson.get === 'function' ? burson : new Map();
  const runLog = log && typeof log === 'object' ? log
    : { ok: false, why: 'the run log could not be read', start: 0, last: 0, spans: [] };
  const stories = r && Array.isArray(r.stories) ? r.stories : [];
  // only the stretches that can matter: not running, paused, failing or not known (runLogCheckIn_ looks at those alone
  // anyway), ending after the oldest time any race below starts at (a story's, or Burson's alert on it or on its posts)
  let oldest = t;
  const older = v => { const ms = headStartTime_(v); if (ms && ms < oldest) oldest = ms; };
  stories.forEach(s => {
    try {
      older(s.at);
      older(s.burson && s.burson.at);
      (Array.isArray(s.keys) ? s.keys : []).forEach((k, i) => {
        older(Array.isArray(s.keys_at) ? s.keys_at[i] : 0);
        const g = theirs.get(k);
        older(g && g.at);
      });
    } catch (e) { /* read again, and left out, below */ }
  });
  const view = Object.assign({}, runLog, { spans: (Array.isArray(runLog.spans) ? runLog.spans : [])
    .filter(sp => sp && RUN_LOG_GAP_STATES_.indexOf(sp.state) >= 0 && Number(sp.to) > oldest) });
  const check = (a, b) => runLogCheckIn_(view, a, b);
  const down = c => !!c && c.state !== 'not known';  // the bot was not running, paused or failing in between
  const more = c => (c && c.more > 0 ? ` and ${c.more} more ${c.more === 1 ? 'stretch' : 'stretches'}` : '');
  // Burson's alerts listed while the bot was OFF: by post key and time (the time of Burson's first alert on a post is
  // the earliest of its rows, so a listed alert that is also on the Alert log, picked up as Bot was turned back ON, has
  // the same time there). Only one posted in its own paused stretch is one posted while the bot was OFF (RunLog.gs
  // offListedWhileOff_: the listing starts at the last running run's start, so it can hold one from before the pause).
  // One the Alert log has too, the same post at the same time, was reviewed after all: it is still posted while the bot
  // was OFF, but it is not counted with the ones never reviewed
  const offAt = new Map();  // key\ntime -> reviewed (on the Alert log too)
  const offList = [];       // the ones never reviewed: what the OFF line counts
  (Array.isArray(listed) ? listed : []).forEach(x => {
    const at = x && typeof x === 'object' ? headStartTime_(x.at) : 0;
    if (!at || !offListedWhileOff_(x)) return;
    const key = headStartText_(x.key);
    const g = key ? theirs.get(key) : null;
    const reviewed = !!g && Array.isArray(g.rows) && g.rows.some(row => !!row && !!row.id && Number(row.source_at) === at);
    if (key) offAt.set(`${key}\n${at}`, reviewed);
    if (!reviewed) offList.push({ id: key || headStartText_(x.name) || String(at), at });
  });
  const isOff = (key, at) => offAt.has(`${key}\n${at}`);
  const offReviewed = (key, at) => offAt.get(`${key}\n${at}`) === true;
  // Burson's alerts one of this app's stories was FIRST on (its story-level match, this app ahead): a later story of
  // this app's that one of the same-story rules ties to that same alert is a later alert on an issue this app had
  // first, never "Burson alerted the issue first". The earliest such story is the one named
  const firstOn = new Map();  // Burson's key\ntime -> the earliest story that was ahead of it
  stories.forEach(s => {
    try {
      const sb = s && s.burson && typeof s.burson === 'object' ? s.burson : null;
      const sat = headStartTime_(s && s.at);
      if (!sb || !sat || !(Number(s.lead_ms) > 0) || !headStartTime_(sb.at)) return;
      const k = `${headStartText_(sb.key)}\n${headStartTime_(sb.at)}`;
      const was = firstOn.get(k);
      if (!was || sat < headStartTime_(was.at)) firstOn.set(k, s);
    } catch (e) { /* left out */ }
  });
  const running = 'the bot was running the whole time';
  const byId = new Map();
  const facts = [];
  stories.forEach(s => {
    try {
      const at = headStartTime_(s.at);
      if (!at) return;
      const b = s.burson && typeof s.burson === 'object' && headStartTime_(s.burson.at) ? s.burson : null;
      const races = [];
      (Array.isArray(s.keys) ? s.keys : []).forEach((k, i) => {
        const g = theirs.get(k);
        const their = g ? headStartTime_(g.at) : 0;
        if (!their) return;
        const own = headStartTime_(Array.isArray(s.keys_at) ? s.keys_at[i] : 0) || at;
        races.push({ own, at: their, lead: their - own, c: check(own, their), off: isOff(k, their), seenOn: offReviewed(k, their) });
      });
      races.sort((x, y) => x.at - y.at || x.own - y.own);
      const issueRule = !!b && HEAD_START_ISSUE_RULES_.indexOf(s.matched) >= 0 && Number(s.lead_ms) < 0;
      // Burson's alert is one this app's own earlier story was first on: this story is a later alert on that issue
      const earlier = issueRule ? firstOn.get(`${headStartText_(b.key)}\n${headStartTime_(b.at)}`) || null : null;
      const issue = issueRule && !earlier;
      const own = !!b && !issueRule;  // the story's own race is checked
      const storyCheck = own ? check(at, b.at) : null;
      const offRace = races.find(x => x.off) || null;
      const offHit = b && isOff(b.key, b.at) ? { at: b.at, reviewed: offReviewed(b.key, b.at) }
        : offRace ? { at: offRace.at, reviewed: offRace.seenOn } : null;
      // The "Speed check" cell: what the race the row shows was, then the races on its own posts it doesn't speak for
      const parts = [];
      const say = text => { if (text && parts.indexOf(text) < 0) parts.push(text); };
      if (offHit) {
        say(`Burson alerted this while the bot was OFF (posted ${speedTime_(offHit.at)} ET` +
          `${offHit.reviewed ? '; the bot picked it up when Bot was turned back ON' : ''})`);
      }
      if (issue) {
        say(`Burson alerted this issue ${headStartWords_(-Number(s.lead_ms) / HEAD_START_MIN_MS_)} earlier, on another post: ` +
          'not counted as a win or a loss');
      }
      if (earlier) {
        say(`this app alerted this issue first (${headStartText_(earlier.alert_id) ? `${headStartText_(earlier.alert_id)}, ` : ''}` +
          `${speedTime_(headStartTime_(earlier.at))} ET); this is a later alert on it: not counted as a win or a loss`);
      }
      if (own) say(!storyCheck ? running : down(storyCheck) ? `not comparable: ${storyCheck.words}${more(storyCheck)}` : storyCheck.words);
      const rest = races.filter(x => !(own && x.own === at && x.at === b.at));  // not the story's own race again
      const bad = [];
      rest.forEach(x => {
        if (!x.c) return;
        const text = down(x.c) ? `race on the same post not comparable: ${x.c.words}${more(x.c)}` : `race on the same post ${x.c.words}`;
        if (bad.indexOf(text) < 0 && parts.indexOf(text) < 0) bad.push(text);
      });
      bad.slice(0, HEAD_START_CHECK_RACES_).forEach(say);
      if (bad.length > HEAD_START_CHECK_RACES_) {
        say(`and ${bad.length - HEAD_START_CHECK_RACES_} more races on the same post that are not comparable or not known`);
      }
      if (rest.length && !bad.length && parts.indexOf(running) < 0) say(`race on the same post: ${running}`);
      if (parts.length) byId.set(headStartStoryKey_(s), capCell_(parts.join('; '), HEAD_START_CHECK_CHARS_));
      facts.push({ at, races, issue: issue ? -Number(s.lead_ms) : null, own, storyCheck, off: !!offHit && !offHit.reviewed });
    } catch (e) { /* a story that can't be read is left out of the speed check */ }
  });
  const minutes = list => speedQuantile_(list.map(v => v / HEAD_START_MIN_MS_), 0.5);
  const win = since => {
    const list = facts.filter(f => f.at >= since);
    const leads = [];
    let leftPosts = 0;
    let unknownPosts = 0;
    let leftStories = 0;
    let unknownStories = 0;
    list.forEach(f => {
      let left = f.own && down(f.storyCheck);
      let unknown = f.own && !!f.storyCheck && !down(f.storyCheck);
      f.races.forEach(x => {
        if (!x.c) leads.push(x.lead);
        else if (down(x.c)) { leftPosts++; left = true; }
        else { unknownPosts++; unknown = true; }
      });
      if (left) leftStories++;
      if (unknown) unknownStories++;
    });
    const issues = list.filter(f => f.issue !== null).map(f => f.issue);
    const offIds = new Set(offList.filter(x => x.at >= since && x.at <= t).map(x => x.id));
    return {
      post_n: leads.length, post_median_min: minutes(leads), post_first: leads.filter(v => v > 0).length,
      post_behind: leads.filter(v => v < 0).length, post_tie: leads.filter(v => v === 0).length,
      issue_n: issues.length, issue_median_min: minutes(issues),
      left_posts: leftPosts, left_stories: leftStories, unknown_posts: unknownPosts, unknown_stories: unknownStories,
      off_alerts: offIds.size, off_stories: list.filter(f => f.off).length,
    };
  };
  // OFF listings that did not list everything (a paused stretch's "listed" says done: false), in the last 30 days
  const monthStart = t - HEAD_START_DAYS_ * HEAD_START_DAY_MS_;
  const unfinished = (Array.isArray(runLog.spans) ? runLog.spans : []).filter(sp => sp && sp.state === 'paused' &&
    sp.listed && typeof sp.listed === 'object' && sp.listed.done === false && Number(sp.to) >= monthStart).map(sp => {
    const why = headStartText_(sp.why);
    const cut = why.indexOf(' · ');
    const how = cut >= 0 ? why.slice(cut + 3) : headStartText_(sp.listed.why);
    return `${runLogWords_(sp)}${how ? ` (${how})` : ''}`;
  });
  return { byId, week: win(t - HEAD_START_WEEK_DAYS_ * HEAD_START_DAY_MS_), month: win(monthStart), ok: !!runLog.ok,
    why: headStartText_(runLog.why), start: Number(runLog.start) || 0, unfinished };
}

/**
 * The speed check's six headline lines (HEAD_START_CHECK_LINES_), each [label, last 7 days, last 30 days], from
 * headStartHonest_'s numbers. Every median says how many races it is of, and every count what it counts. No line is
 * without a value (the dashboard's Caught early view reads the headline lines down to the first one with neither). Pure.
 */
function headStartCheckRows_(h) {
  const dash = '—';
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const L = HEAD_START_CHECK_LINES_;
  const both = f => [h && h.week ? f(h.week) : dash, h && h.month ? f(h.month) : dash];
  return [
    [L[0]].concat(both(x => (x.post_n ? `${headStartWords_(x.post_median_min)} (${n(x.post_n, 'post', 'posts')})` : dash))),
    [L[1]].concat(both(x => (x.post_n ? `${x.post_first} this app first, ${x.post_behind} Burson first` +
      `${x.post_tie ? `, ${x.post_tie} the same minute` : ''} (of ${n(x.post_n, 'post', 'posts')})` : dash))),
    [L[2]].concat(both(x => (x.issue_n ? `${n(x.issue_n, 'story', 'stories')}: median ${headStartWords_(x.issue_median_min)} earlier`
      : '0 stories'))),
    [L[3]].concat(both(x => `${n(x.left_posts, 'post', 'posts')}, ${n(x.left_stories, 'story', 'stories')} (see "Speed check")`)),
    [L[4]].concat(both(x => `${n(x.off_alerts, 'alert', 'alerts')}; ${x.off_stories} of this app's stories matched one`)),
    [L[5]].concat(both(x => `${n(x.unknown_posts, 'post', 'posts')}, ${n(x.unknown_stories, 'story', 'stories')}`)),
  ];
}

/**
 * The speed check's note, under the note on matching: what its lines leave out and why, since when the run log is
 * kept (or that it can't be read, or has no record yet: then every race is "not known"), and each OFF listing that did
 * not list everything. Pure but for GEN (the times in words).
 */
function headStartCheckNoteText_(h) {
  if (h && h.failed) {
    return capCell_(`The lines from "Race on the same post" on could not be worked out this time (${h.failed}); the next ` +
      'rebuild tries again. The lines above them are counted as before.', HEAD_START_CHECK_CHARS_);
  }
  const tab = `the "${RUN_LOG_TAB_}" tab`;
  const source = !h.ok ? `${tab}, which could not be read: ${h.why || 'not known why'}; so every race is "not known"`
    : h.start ? `${tab}, kept since ${speedTime_(h.start)} ET`
      : `${tab}, which has no record yet; so every race is "not known"`;
  let text = 'The lines from "Race on the same post" on leave out every race in which the bot was not running, paused or ' +
    `failing between the two alerts (${source}): a stretch with no runs can hold back this app's alert, and Burson's ` +
    'alerts posted while the bot was OFF were never recorded on the Alert log. They are counted apart, never as a win or ' +
    'a loss, and the "Speed check" column says why for each story. The lines above them are counted as before.';
  const open = Array.isArray(h.unfinished) ? h.unfinished : [];
  open.slice(0, HEAD_START_CHECK_LISTINGS_).forEach(w => { text += ` Listing of an OFF stretch not complete: ${w}.`; });
  if (open.length > HEAD_START_CHECK_LISTINGS_) {
    text += ` ${open.length - HEAD_START_CHECK_LISTINGS_} more OFF stretches were not listed completely (the ` +
      `"${RUN_LOG_TAB_}" tab says which).`;
  }
  return capCell_(text, HEAD_START_CHECK_CHARS_);
}

// ---------------------------------------------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------------------------------------------

/**
 * A length of time in words, from minutes: "45 min", "3 h 10 min", "2 d 15 h" (a day or more: to the hour), "under 1
 * min"; "behind by 20 min" for minutes below 0 (this app was later); '' for none (never a zero). Pure.
 */
function headStartWords_(minutes) {
  if (minutes === null || minutes === undefined || minutes === '' || !isFinite(Number(minutes))) return '';
  const v = Number(minutes);
  const m = Math.round(Math.abs(v));
  let words;
  if (m < 1) words = v === 0 ? 'the same minute' : 'under 1 min';
  else if (m < 60) words = `${m} min`;
  else if (m < 24 * 60) words = `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  else {
    const h = Math.round(m / 60);
    words = `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ''}`;
  }
  return v < 0 ? `behind by ${words}` : words;
}

/**
 * A name linked to a post, with the Results tab's quoted link (Speed.gs resultsLink_: =HYPERLINK only for an http(s)
 * link, every double quote doubled, so a name can't end the formula; else the name as text, never a formula). The name
 * is one line and cut short; a link with a space in it, or too long for a cell, isn't linked. Pure.
 */
function headStartLink_(url, label) {
  const name = truncate_(headStartText_(label), HEAD_START_NAME_CHARS_) || '(no name)';
  const link = headStartText_(url);
  const usable = /^https?:\/\/\S+$/i.test(link) && link.length <= HEAD_START_LINK_CHARS_;
  return resultsLink_({ url: usable ? link : '', network: name, author: '' });
}

/**
 * One story's row in a stories table (HEAD_START_HEADER_): blank, never a zero, without a Burson alert or an IM time.
 * After the story-level cells come the post-level ones (when Burson alerted one of the story's own posts, the head
 * start on the post in words, that alert, and the head start in plain minutes): blank when Burson alerted none of them.
 * The head start on the post is from this app's alert on that post; when that isn't the story's first alert (a later
 * card or update brought the post), the words say when it was: "behind by 10 min (from this app's alert on this post,
 * 2026-10-13 08:00 ET)".
 * Its last three cells are the hidden state (HEAD_START_STATE_COL_ on), filled only for a story with an IM time: the
 * Burson post's key that time was found under (never read as a formula: Speed.gs speedText_), the time in ms, and
 * `email` or `draft`. The next rebuild reads them back (readHeadStartState_).
 */
function headStartRow_(s) {
  const words = ms => headStartWords_(ms / HEAD_START_MIN_MS_);
  const minutes = ms => Math.round(ms / 6000) / 10;
  const b = s.burson;
  const p = s.post;
  const ids = (s.alert_ids || []).slice(0, 4).join(', ') + ((s.alert_ids || []).length > 4 ? ` and ${s.alert_ids.length - 4} more` : '');
  // the post came with a later alert of the story: its head start is from that alert, and the cell says when it was
  const later = p && s.post_own_at > s.at ? ` (from this app's alert on this post, ${speedTime_(s.post_own_at)} ET)` : '';
  return [s.type, speedTime_(s.at), headStartLink_(s.url, s.name), pwCell_(s.product, HEAD_START_NAME_CHARS_),
    pwCell_(s.tag, HEAD_START_NAME_CHARS_), b ? speedTime_(b.at) : '', b ? words(s.lead_ms) : '',
    s.im ? speedTime_(s.im.at) : '', s.im ? words(s.im_lead_ms) : '', s.matched || '',
    pwCell_(ids, HEAD_START_NAME_CHARS_), b ? headStartLink_(b.url, b.alert_id || 'Burson\'s alert') : '',
    b ? minutes(s.lead_ms) : '', s.im ? minutes(s.im_lead_ms) : '',
    p ? speedTime_(p.at) : '', p ? words(s.post_lead_ms) + later : '', p ? headStartLink_(p.url, p.alert_id || 'Burson\'s alert') : '',
    p ? minutes(s.post_lead_ms) : '',
    s.im ? speedText_(s.im_key) : '', s.im ? s.im.at : '', s.im ? (s.im.from === 'email' ? 'email' : 'draft') : ''];
}

/** The days of Burson's alerts the Results tab shows (settings.speed_days, as Speed.gs refreshSpeed_ reads it). */
function headStartResultsDays_() {
  return Math.max(1, Number(((typeof GEN === 'object' && GEN && GEN.settings) || {}).speed_days) || 7);
}

/**
 * What's counted and when it was rebuilt (the line under the title): the stories, and how a head start on a post is
 * measured (from this app's alert on that post) and counted (each post; a row shows the one Burson alerted first).
 */
function headStartScopeText_(r) {
  return `What's counted: every story this app alerted on its own in the last ${HEAD_START_DAYS_} days (Early Detection ` +
    'cards and early signals, Watch alerts, Direct BigQuery alerts; a card and its updates are one story, timed from the ' +
    'first), next to Burson\'s alert on the same post or the same story and the IMs\' email for that Burson alert. ' +
    'The head start on a post is from this app\'s own alert on that post: for a post that a later card or update of the ' +
    'story brought, from that card (the cell then says when), not from the story\'s first alert. When Burson alerted ' +
    'several of a story\'s posts, the row shows the one Burson alerted first; the headline line on posts counts each of ' +
    `them. Times are when each alert was posted. Rebuilt ${speedTime_(r.now)} ET.`;
}

/**
 * How the stories are matched and where the IMs' times come from (the note under the headline numbers). The IMs' part
 * says which of three rebuilds this was: one with this run's Results rebuild (its times, and the remembered ones for
 * Burson's alerts older than the Results tab's days); one without it (`r.im_from_run` false, set by refreshHeadStart_:
 * only the times the tab remembers); or one with no IM time at hand at all (those columns are blank).
 */
function headStartNoteText_(r) {
  const m = r.windows.month;
  const emails = `their email for ${m.im_from_email} of ${m.im_known} in the last ${HEAD_START_DAYS_} days`;
  // a remembered time is only as old as the tab
  const kept = `For a Burson alert older than the Results tab's ${headStartResultsDays_()} days, the IMs' time is the one ` +
    'this tab last had for it: there is none for an alert that was already older than that when this tab was first made, ' +
    'or when its story first came onto it.';
  return `Matched on: "${HEAD_START_SAME_POST_}" (Burson alerted one of the story's posts); "${HEAD_START_SAME_STORY_}" ` +
    '(Burson\'s alert and this app\'s carry the same issue name, and the later of the two was recorded as an Ongoing ' +
    'Issue; Burson\'s other alerts under that name then count too). A story is measured against the earliest of ' +
    'Burson\'s alerts those two give: Burson\'s first alert on the story, even when Burson alerted the story\'s own post ' +
    `later. Only when they give none, two weaker matches are tried (check them): "${HEAD_START_SAME_NAME_}" (the same ` +
    `issue name and no more, never under two different exposure tags) and "${HEAD_START_SIMILAR_}" (the same exposure ` +
    `tag and issue names alike). The same-story rules look ${HEAD_START_STORY_DAYS_} days either side of the story. ` +
    'Beside that story-level answer is the post-level one ("Burson on this post", "Head start on the post"): Burson\'s ' +
    'first alert on one of the story\'s own posts. So a story that carries the name of an issue Burson alerted days ' +
    'before reads "behind by" days on the story, and still shows by how much this app had the post itself before Burson. ' +
    'A head start is from this app\'s alert to Burson\'s alert (or to the IMs\' email: end to end); "behind by" means this ' +
    'app was later. One of Burson\'s alerts counts as on a story this app had alerted first when it came after a story ' +
    'this app was first on, not when Burson already had that story (this app may still have had that very post first: ' +
    'the post-level line counts those). ' +
    '"No Burson alert found" doesn\'t mean Burson never alerted the story: Burson\'s later alert takes a story\'s issue ' +
    'name only when this app\'s alert went out as a Social Alert. An alert that was only to be watched is found again ' +
    'only on its own posts, on an identical issue name, or on similar wording under the same exposure tag, so "this app ' +
    'alerted first" is, if anything, undercounted. ' +
    (!r.im_at_hand
      ? 'The IMs\' times weren\'t at hand for this rebuild (they come with the Results tab\'s rebuild in the every-minute run), ' +
        'so those columns are blank.'
      : r.im_from_run === false
        ? 'The IMs\' times are the ones this tab last had: the Results tab wasn\'t rebuilt in the run of this rebuild, and ' +
          'newer ones come with its rebuild in the every-minute run. Each is their email for Burson\'s post, else their ' +
          `draft (${emails}). ${kept}`
        : `The IMs' time is their email for Burson's post, else their draft, as the Results tab has it (${emails}). ${kept}`);
}

/**
 * The tab's cells, top to bottom, every row HEAD_START_HEADER_ wide (the last three columns are the hidden state:
 * headStartRow_): {rows, marks: {section, head, merged, numbers, times}, width} (row numbers for the formats; numbers:
 * the headline numbers' rows; times: [first row, count] of each stories table). Every text cell fits a cell (Sheets.gs
 * capCell_). `r`: headStartReport_'s. Pure.
 * With the speed check (`r.honest`, Control row 56 ON: headStartHonest_), and only then: its six lines right after the
 * headline numbers that were there, its note right after theirs, and one more column, "Speed check: was the bot
 * running?" (HEAD_START_CHECK_HEADER_), after the hidden state columns in both stories tables (width 22). Every cell
 * that was there is the same.
 */
function headStartTabRows_(r) {
  const honest = r && r.honest && typeof r.honest === 'object' ? r.honest : null;
  const width = HEAD_START_HEADER_.length + (honest ? 1 : 0);
  const header = honest ? HEAD_START_HEADER_.concat([HEAD_START_CHECK_HEADER_]) : HEAD_START_HEADER_;
  const checkOf = s => (honest && honest.byId && typeof honest.byId.get === 'function'
    ? honest.byId.get(headStartStoryKey_(s)) || '' : '');
  const rows = [];
  const marks = { section: [], head: [], merged: [], numbers: [], times: [] };
  const add = (row, kind) => {
    rows.push(row.map(v => (v === null || v === undefined ? '' : capCell_(v)))
      .concat(new Array(Math.max(0, width - row.length)).fill('')).slice(0, width));
    if (kind) marks[kind].push(rows.length);
    return rows.length;
  };
  const dash = '—';
  const of = (x, y, pct) => (y ? `${x} of ${y}${pct === null || pct === undefined ? '' : ` (${pct}%)`}` : dash);
  const words = min => (min === null || min === undefined ? dash : headStartWords_(min));
  const w = r.windows.week;
  const m = r.windows.month;
  const onPost = x => of(x.post_first, x.post_matched, x.post_first_pct) +
    (x.post_first ? `: median head start ${headStartWords_(x.post_first_median_min)}` : '');
  const split = x => (x.burson_after ? `: ${[[x.burson_after_by.post, HEAD_START_SAME_POST_], [x.burson_after_by.story, HEAD_START_SAME_STORY_],
    [x.burson_after_by.name, 'same issue name'], [x.burson_after_by.wording, 'similar wording']].filter(p => p[0])
    .map(p => `${p[0]} ${p[1]}`).join(', ')}` : '');

  add([HEAD_START_TITLE_]);
  add([headStartScopeText_(r)], 'merged');
  add([]);
  add(['HEADLINE NUMBERS', `Last ${HEAD_START_WEEK_DAYS_} days`, `Last ${HEAD_START_DAYS_} days`], 'section');
  [
    ['Stories this app alerted on its own', w.stories, m.stories],
    ['Of those, also alerted by Burson', of(w.matched, w.stories, w.matched_pct), of(m.matched, m.stories, m.matched_pct)],
    ['This app alerted first (of those Burson alerted too)', of(w.first, w.matched, w.first_pct), of(m.first, m.matched, m.first_pct)],
    ['Median head start over Burson (where this app was first)', words(w.first_median_min), words(m.first_median_min)],
    ['Burson alerted first', w.behind, m.behind],
    ['Median time this app was behind (where Burson was first)', words(w.behind_median_min), words(m.behind_median_min)],
    // not "not alerted by Burson": Burson may have alerted it under a name the matching can't tie to it (the note below)
    ['No Burson alert found', w.unmatched, m.unmatched],
    // the post-level answer, whatever the story-level one above: this app's alert against Burson's alert on the same post
    [HEAD_START_POST_LINE_, onPost(w), onPost(m)],
    ['This app\'s alert before the IMs\' email (of the stories with an IM email time)', of(w.im_first, w.im_known, w.im_first_pct),
      of(m.im_first, m.im_known, m.im_first_pct)],
    ['Median time from this app\'s alert to the IMs\' email (the end-to-end head start)', words(w.im_median_min), words(m.im_median_min)],
    ['Burson\'s alerts in the same days', w.burson_alerts, m.burson_alerts],
    ['Of Burson\'s alerts, those on a story this app had alerted first (same post or same story)',
      of(w.burson_after, w.burson_alerts, w.burson_after_pct) + split(w), of(m.burson_after, m.burson_alerts, m.burson_after_pct) + split(m)],
  ].forEach(row => add(row, 'numbers'));
  // the speed check (Control row 56 ON): its lines next to the ones above, which it never changes
  if (honest) headStartCheckRows_(honest).forEach(row => add(row.map(v => capCell_(v, HEAD_START_CHECK_CHARS_)), 'numbers'));
  add([headStartNoteText_(r)], 'merged');
  if (honest) add([headStartCheckNoteText_(honest)], 'merged');
  add([]);

  const table = list => {
    const first = rows.length + 1;
    list.forEach(s => add(honest ? headStartRow_(s).concat([checkOf(s)]) : headStartRow_(s)));
    if (list.length) marks.times.push([first, list.length]);
  };
  add([`BIGGEST HEAD STARTS (last ${HEAD_START_DAYS_} days: the ${HEAD_START_TOP_} stories this app alerted longest before Burson)`], 'section');
  add(header, 'head');
  if (!r.top.length) add(['None yet']);
  table(r.top);
  add([]);

  add([`EVERY STORY (last ${HEAD_START_DAYS_} days, newest first; one row per story of this app's own)`], 'section');
  add(header, 'head');
  if (!r.stories.length) add(['None yet']);
  table(r.stories);
  return { rows, marks, width };
}

/**
 * Writes the whole tab (values first, then the formats; the state columns, HEAD_START_STATE_COL_ on, are hidden). `r`:
 * headStartReport_'s. Refuses (throws, nothing cleared or written) unless the tab is the one the bot made
 * (isHeadStartTab_). The new cells replace the old ones, the state columns too: the caller has read those first
 * (refreshHeadStart_), and the stories' rows written here carry the IMs' times on.
 * With the speed check (Control row 56 ON) the tab is one column wider: "Speed check: was the bot running?", shown,
 * after the three hidden state columns (which stay where they are, hidden as before). Turned OFF again, the next
 * rebuild is as wide as before and clears that column with whatever else is left beyond its cells.
 */
function writeHeadStartTab_(sh, r) {
  if (!isHeadStartTab_(sh)) throw new Error(`"${sh && sh.getName()}" isn't the bot's ${HEAD_START_TAB_} tab: left as it is`);
  const built = headStartTabRows_(r);
  const out = built.rows;
  const marks = built.marks;
  const width = built.width || HEAD_START_HEADER_.length;
  const prev = sh.getLastRow();
  const prevCols = sh.getLastColumn();
  const fmt = f => { try { f(); } catch (e) { /* formatting only */ } };
  fmt(() => sh.clearFormats());  // the bold headers and merged notes move with the tables' lengths
  fmt(() => sh.getRange(1, 1, Math.max(prev, out.length, 6), width).breakApart());
  // The new cells go in over the old ones in one write (every row is the header's width, and A1 is the bot's mark
  // again: isHeadStartTab_), and only then is what the last rebuild left beyond them cleared: the rows under a tab that
  // got shorter, any column to the right. So a rebuild that stops before the write, or whose write fails, leaves the
  // tab as it was, with the bot's mark and the IMs' times it remembers. Cleared first, those times would be lost for
  // good with a failed write: the Results tab no longer has the older ones
  sh.getRange(1, 1, out.length, width).setValues(out);
  if (prev > out.length) sh.getRange(out.length + 1, 1, prev - out.length, Math.max(prevCols, width)).clearContent();
  if (prevCols > width) sh.getRange(1, width + 1, out.length, prevCols - width).clearContent();
  fmt(() => sh.getRange(1, 1).setFontWeight('bold').setFontSize(13));
  // the numbers' rows wrap: their labels, and both values (the post-level and reverse-view lines' are wider than the
  // 7-day column, which has the 30-day value beside it: unwrapped, Sheets cuts them at the cell's edge)
  if (marks.numbers.length) fmt(() => sh.getRange(marks.numbers[0], 1, marks.numbers.length, 3).setWrap(true));
  marks.section.forEach(row => fmt(() => sh.getRange(row, 1, 1, HEAD_START_WIDE_).setFontWeight('bold').setBackground('#e8eaed')
    .setWrap(true)));
  marks.head.forEach(row => fmt(() => sh.getRange(row, 1, 1, HEAD_START_STATE_COL_ - 1).setFontWeight('bold').setBackground('#f1f3f4')
    .setWrap(true)));
  marks.merged.forEach(row => fmt(() => {
    sh.getRange(row, 1, 1, HEAD_START_WIDE_).merge().setWrap(true).setVerticalAlignment('top').setFontColor('#5f6368')
      .setFontStyle('italic');
    sh.setRowHeight(row, resultsRowHeight_(String(out[row - 1][0])));
  }));
  // the times of each story (this app's, Burson's, the IMs', Burson's on the post), as the Results tab shows its times
  marks.times.forEach(([first, count]) => HEAD_START_TIME_COLS_.forEach(col => fmt(() => sh.getRange(first, col, count, 1)
    .setNumberFormat('yyyy-mm-dd hh:mm'))));
  // "Head start on the post" wraps in the stories' rows: with "(from this app's alert on this post, … ET)" it is wider
  // than its column and has Burson's alert beside it, so unwrapped Sheets cuts it at the cell's edge
  marks.times.forEach(([first, count]) => fmt(() => sh.getRange(first, HEAD_START_POST_WORDS_COL_, count, 1).setWrap(true)));
  // the speed check's column (Control row 56 ON): its header bold like the others, its cells wrapped, wide enough to read
  if (width > HEAD_START_HEADER_.length) {
    marks.head.forEach(row => fmt(() => sh.getRange(row, width, 1, 1).setFontWeight('bold').setBackground('#f1f3f4').setWrap(true)));
    marks.times.forEach(([first, count]) => fmt(() => sh.getRange(first, width, count, 1).setWrap(true)));
    fmt(() => sh.setColumnWidth(width, HEAD_START_CHECK_PX_));
  }
  // the state columns: for the next rebuild to read (readHeadStartState_), not for people. On a tab narrower than this
  // layout (a new one, or one from before the post-level columns, whose hidden state columns were where those are
  // now) every column is shown first. At any other rebuild the columns a person hid stay hidden. The speed check's
  // column, the first time it is there, is shown (only it)
  if (prevCols < HEAD_START_HEADER_.length) fmt(() => sh.showColumns(1, width));
  else if (prevCols < width) fmt(() => sh.showColumns(prevCols + 1, width - prevCols));
  fmt(() => sh.hideColumns(HEAD_START_STATE_COL_, HEAD_START_STATE_COLS_));
  return { rows: out.length };
}

/**
 * Is this the Head start tab the bot made? Its A1 is the title the bot writes there (HEAD_START_OWN_TITLES_). A tab
 * people made doesn't have it, and an empty tab isn't the bot's: such a tab is never read, cleared or written.
 */
function isHeadStartTab_(sh) {
  try {
    return headStartTabMarked_(sh);
  } catch (e) {
    return false;
  }
}

/**
 * isHeadStartTab_'s check itself: true or false as the tab's A1 says, and it throws when Sheets doesn't answer (which
 * isHeadStartTab_ takes for "not the bot's": nothing is then read, cleared or written). readHeadStartState_ needs the
 * difference: a tab that couldn't be looked at is not a tab with nothing remembered.
 */
function headStartTabMarked_(sh) {
  if (!sh || sh.getLastRow() < 1) return false;
  return HEAD_START_OWN_TITLES_.includes(String(sh.getRange(1, 1).getDisplayValue()).trim());
}

/** A tab named Head start that the bot didn't make is in the way (refreshHeadStart_ then leaves it as it is). */
function headStartTabForeign_(ss) {
  const sh = ss.getSheetByName(HEAD_START_TAB_);
  return !!sh && !isHeadStartTab_(sh);
}

/** Why the Head start tab isn't updated while a tab people made has its name (the Control tab's Status, and the log). */
function headStartBlockedText_() {
  return `a tab named "${HEAD_START_TAB_}" that the bot didn't make is in the way (or its title in A1 was changed). ` +
    'Rename that tab, and the bot makes its own.';
}

/**
 * Remembers whether a "Head start" tab the bot didn't make is in the way (`blocked`: HEAD_START_BLOCKED_PROP_), for
 * the Control tab's Status (headStartBlockedNote_); forgotten at the first rebuild once it's gone. Never throws.
 */
function noteHeadStartBlocked_(blocked) {
  try {
    const props = PropertiesService.getScriptProperties();
    const was = props.getProperty(HEAD_START_BLOCKED_PROP_) === 'true';
    if (blocked && !was) props.setProperty(HEAD_START_BLOCKED_PROP_, 'true');
    if (!blocked && was) props.deleteProperty(HEAD_START_BLOCKED_PROP_);
  } catch (e) {
    console.error('could not note the Head start tab: ' + ((e && e.message) || e));
  }
}

/**
 * Control tab: why the Head start tab isn't being updated ('' when it is), for the status line (Main.gs poll(): B5,
 * right after the Results tab's note, in the main status and in the standalone Auto-correct space's). Never throws.
 */
function headStartBlockedNote_() {
  try {
    if (PropertiesService.getScriptProperties().getProperty(HEAD_START_BLOCKED_PROP_) !== 'true') return '';
    return `The Head start tab isn't being updated: ${headStartBlockedText_()}`;
  } catch (e) {
    return '';
  }
}

/**
 * The Head start tab, made if missing (after the last of the Results, Learned precedents, Follow-up and Analysis tabs,
 * so none of them moves; at the end when there's none), with its title in A1 at once (the bot's mark: isHeadStartTab_)
 * and protected with a warning. null when a tab named Head start exists that the bot didn't make: that tab is never
 * cleared or written.
 */
function ensureHeadStartTab_(ss) {
  let sh = ss.getSheetByName(HEAD_START_TAB_);
  if (sh) return isHeadStartTab_(sh) ? sh : null;
  const names = ss.getSheets().map(s => s.getName());
  const reports = [RESULTS_TAB_, LEARNED_TAB_, FOLLOWUP_TAB_, ANALYSIS_TAB_].map(n => names.indexOf(n)).filter(i => i >= 0);
  sh = ss.insertSheet(HEAD_START_TAB_, reports.length ? Math.max.apply(null, reports) + 1 : names.length);
  sh.getRange(1, 1).setValue(HEAD_START_TITLE_);
  try { sh.protect().setDescription('Written by the Burson QA bot').setWarningOnly(true); } catch (e) { /* the tab works unprotected */ }
  try { HEAD_START_WIDTHS_.forEach(([c, px]) => sh.setColumnWidth(c, px)); } catch (e) { /* the tab works unformatted */ }
  return sh;
}
