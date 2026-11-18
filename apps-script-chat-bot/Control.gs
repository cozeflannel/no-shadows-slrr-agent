/**
 * Control.gs — the Control tab of the bot's Google Sheet: the one place anyone needs to manage the bot.
 *
 *   B2  Bot            ON / OFF (a dropdown). OFF pauses the bot; when it's back ON it starts from that moment.
 *   B3  Burson space   link (or exact name) of the space Zapier posts the alerts in
 *   B4  Analyst space  link (or exact name) of the space the corrected alerts go to
 *   C3:C4              the space the bot found for each (written by the bot)
 *   B5:B7              Status, Last check, Today (written by the bot every minute)
 *   B8                 Runs as: the account the bot posts as (written by setup())
 *   B9                 Mirror space (Mirror.gs): live Zapier posts copied to a training space, outbounds blocked
 *   B10                Auto-correct space (AutoCorrect.gs): live alerts posted there already corrected; C10 its status
 *   B11:B24            The switches (CONTROL_SWITCHES_): what the bot may do on its own, each ON / OFF and OFF until
 *                      someone turns it on (the bot never sets one ON); C11:C24 what each is doing (written by the bot)
 *   B25                S-F Burson space: link (or exact name) of the real Burson space. The code never names it: the
 *                      Mirror, Auto-correct and Relay read it, the Burson outbox posts only there, and "live" means the
 *                      Burson space (B3) is this space. Blank or not found, all of that is paused (fail closed). C25 the
 *                      space the bot found (written by the bot)
 *   B26                Burson test copy (TestCopy.gs): a Google-only space the bot copies S-F Burson into, and where the
 *                      Relay sends the analysts' side straight through instead of the Burson outbox (never to S-F
 *                      Burson). Blank: the Relay works with S-F Burson itself. C26 what the bot found (written by the bot)
 *   B27:B28            Two more switches, as rows 11-24 (CONTROL_SWITCHES_ with their own `row`): Draft follow-ups and
 *                      Draft answers to questions (FollowUp.gs); C27:C28 what each is doing (written by the bot)
 *   B29                Safety valve: one more switch (Testing or LIVE: Main.gs runMode_); C29 which it is
 *   B30                Testing: send to: up to 5 email addresses every email goes to while Testing (blank: nothing
 *                      is sent while Testing); C30 what the bot made of it (written by the bot)
 *   B31                BigQuery lookback: how far back Direct BigQuery alerts (row 15) and the Early wave check (row 19)
 *                      look, 15 to 60 minutes (a strict dropdown: 15, 30, 45 or 60 minutes; blank or unreadable: 60;
 *                      BqLookback.gs); C31 what the bot is using (written by the bot)
 *   B32                Work directly in B25 (Google-only): one more switch (Main.gs directB25For_). ON, with B25 a space
 *                      people outside Google can't join, the bot works right in B25 as in a Mirror space (its notes,
 *                      replies and emojis posted there directly, always Testing); C32 what it is doing
 *   B33                Other alerts space (OtherSpace.gs): a Google-only space with other alerts (a campaign space),
 *                      worked directly every minute beside the Mirror space, always Testing; C33 its status
 *   B34                Proactive watch: one more switch (ProactiveWatch.gs). ON, every 5 minutes Gemini checks what's new
 *                      in each source, read-only in BigQuery (Sonar, Brandwatch, Sprinklr, Tubular, the DSD story
 *                      selection feed, the Other alerts space's alerts, the Brandwatch query "2026 Election Alerts"
 *                      read from Brandwatch's API) against the watches ON on the Watches tab; what it
 *                      flags goes on the Watch detections tab (the Watch sources tab: which sources are live), posted
 *                      or emailed only where Watch alerts (row 35) says; C34 how it's doing
 *   B35                Watch alerts (WatchAlerts.gs): where the Proactive watch's flags go, a dropdown, OFF until a
 *                      person chooses; C35 how it's doing
 *   B36                Temp checks: one more switch (TempCheck.gs); C36 the last one
 *   B37                Group test emails: one more switch (BrandSafetyGroups.gs): ON, Testing, and each Social Alert
 *                      goes to its groups' test emails (column C of the Brand safety groups tab); C37 what it is doing
 *   B38:B40            Fast triage: three more switches (FastTriage.gs, Decisions.gs) on the Early wave check's signals
 *                      (row 19): 38 enables 39 and 40, 39 ranks the queue by the answers and runs the early-watch tier,
 *                      40 holds back noise; 39 and 40 wait for 38; C38:C40 what each is doing
 *   B41:B45            Fast triage bars (FastTriage.gs): five of the six bars for rows 39 and 40 (each with its seed
 *                      and dropdown; blank or invalid uses its seed); C41:C45 what the bot is using
 *   B46                Write early-wave records to BigQuery: one more switch (FastTriage.gs): ON writes each check's
 *                      records to brand-social-central-data.early_wave; C46 what it is doing
 *   B47                Fast triage bars, the sixth: the early watch's independent_reports bar; C47 what the bot is using
 *   B48                Early Detection: also read the AMIE table: one more switch (EarlyWaveSource.gs); it needs row 19
 *                      ON; C48 what it is doing
 *   B49                Early Detection: also read Brandwatch live (not X): one more switch (BrandwatchLive.gs); it needs
 *                      row 19 ON; C49 what it is doing
 *   B50                Proactive watch: also read the AMIE table: one more switch (ProactiveWatch.gs); it needs row 34
 *                      ON; C50 what it is doing
 *   B51                Open engine: judgment in place of caps: one more switch (OpenEngine.gs); it needs row 19 ON;
 *                      C51 what it is doing (and, while OFF, the run time of the last 24 hours)
 *   A52:C53            left as they are: blank, or a person's own text (the bot never writes there, except to clear its
 *                      own old help text from column A: the help was at row 53 before rows 54 and 55 were switches)
 *   B54                Live dashboard: one more switch (Dashboard.gs, DashboardData.gs). ON, the live dashboard web app
 *                      (doGet, open only to the people this sheet is shared with) shows the bot's work, read-only; C54
 *                      what it is doing, with the web app's link once it is deployed
 *   B55                Slide deliveries: one more switch (SlideDeliveries.gs). ON, the brand safety pulse slides set up
 *                      in the web app are delivered on each delivery's schedule (a time trigger every 5 minutes that
 *                      poll() keeps while it's ON); C55 what it is doing (waiting until the bot's account approves
 *                      editing Google Slides once)
 *   B56                Speed numbers: leave out when the bot was not running: one more switch (RunLog.gs). ON, the bot
 *                      keeps the "When the bot ran" tab (when it was running, paused, failing or not running) and, when
 *                      Bot (B2) is set back ON, lists Burson's alerts posted while it was OFF on the "Burson while bot
 *                      OFF" tab, without reviewing, posting or emailing any; C56 what it is doing
 *   A57...             How it works (CONTROL_HELP_ROW_, right under row 56)
 *
 * Plus the Resources tab: the bot's knowledge base (Knowledge.gs). Name · Link · What it covers · Burson can see it? ·
 * Bot status. Gemini reads every document listed there to triage and action each alert and to answer questions; only
 * the rows marked Yes in "Burson can see it?" are ever used in answers to Burson or linked for them. It starts with the
 * YAML's burson_qa.resources; after that people edit it in the sheet. The bot writes the Bot status column.
 * And the Guidance tab: the SLRR leads' current instructions on what to escalate or not (Guidance, Applies to, Until,
 * Added by). Gemini reads it, with the leads' recent emails about alerts, before each review.
 * And the Burson outbox tab (Outbox.gs, made by the bot): with Post in S-F Burson ON (row 24), everything the bot or the
 * relay would post or react in S-F Burson waits there, one row each, until a person sets it to Send.
 * And the Follow-up tab (FollowUp.gs, made by the bot with Track post-alert outcomes ON, row 21): every Social Alert the
 * bot sent lately, which teams replied on its email thread, its status and the next step; people edit its deadlines.
 */

const CONTROL_TAB_ = 'Control';
const CONTROL_TITLE_ = 'Burson QA bot';
const STATS_PROP_ = 'STATS';
const RESOURCES_TAB_ = 'Resources';
const RESOURCES_PROP_ = 'RESOURCES_TAB_MADE';  // set once the tab exists, so a tab people delete stays deleted
const RESOURCES_MAX_ROWS_ = 50;
const RESOURCES_HEADER_ = ['Name', 'Link', 'What it covers', 'Burson can see it?', 'Bot status'];

const CONTROL_HELP_ = [
  '• Every minute the bot reads the Burson space. It reviews each Zapier alert, asks Burson in the alert\'s thread to ' +
    'fix mistakes, answers their questions, sends every alert, corrected, to the analyst space, and makes the Social ' +
    'Alert email when an alert needs escalation: while testing it sends it only to the tester, otherwise it\'s a Gmail ' +
    'draft for a person to send. In the real Burson space (S-F Burson, the space in B25) it posts and reacts only ' +
    'through the Burson outbox tab, with Post in S-F Burson ON.',
  '• To pause, set Bot to OFF. Set it back to ON to restart. It skips anything posted while it was off.',
  '• To change a space (for example from the test space to the real Burson space), paste the space\'s link in column B. ' +
    'To get the link, open the space in Google Chat and copy the address bar. Column C shows the space the bot found.',
  '• S-F Burson space (B25): which space is the real Burson space, S-F Burson. Only this cell decides it, never the ' +
    'code: paste its link (or its exact name) there, and C25 shows the space the bot found. The Mirror, Auto-correct ' +
    'and Relay read it, the Burson outbox posts only there, and the bot can be LIVE only with it (see the Safety valve, ' +
    'row 29). While it\'s blank or can\'t be found, they\'re paused and the bot is never live. Whatever it says, the bot ' +
    'never posts or reacts itself in a space people outside Google can join. A change takes effect on the next run: ' +
    'the Mirror and Auto-correct start from the new space\'s last 15 minutes, and outbox rows queued for the old space ' +
    'are never sent.',
  '• If Status shows ⚠️, it says what to fix. If Last check is more than 10 minutes old, the bot has stopped: ask the ' +
    'person in "Runs as" to open the bot\'s Apps Script project and run setup.',
  '• The Resources tab is the bot\'s knowledge base. Gemini reads every document listed there (Google Docs, Sheets and ' +
    'Slides, text files and public web pages) and uses it to triage and action each alert and to answer questions. ' +
    'Bot status shows whether it could read each one. Only rows marked Yes in "Burson can see it?" are used in answers ' +
    'to Burson or linked for them. The bot keeps its copy of the documents\' text in a hidden tab of its own, ' +
    '"Knowledge cache (bot)"; no tab needs renaming.',
  '• The Guidance tab holds the leads\' current instructions on what to escalate or skip (one per row; "Until" is ' +
    'optional). The bot follows them, and the leads\' recent emails about alerts, when it decides on a Social Alert.',
  '• The Results tab shows what the bot is doing, in plain numbers: how many of Burson\'s alerts had mistakes and what ' +
    'it fixed, how often it made the same Social Alert call as the IMs, and how much sooner it sent it (matched on the ' +
    'post\'s link, not the subject line). Gemini writes the summary at the top from those numbers only. It updates ' +
    'right after the bot handles an alert, and every 10 minutes.',
  '• The Head start tab shows this app\'s own alerts (Early Detection cards and early signals, Watch alerts, Direct ' +
    'BigQuery alerts) next to Burson\'s alert on the same story and the IMs\' email: who alerted first, and by how ' +
    'much. It appears once this app has an alert of its own, and updates every 10 minutes at most.',
  '• The Follow-up tab (with Track post-alert outcomes ON, row 21) lists every Social Alert the bot sent in the last 14 ' +
    'days, from both of its spaces: which teams replied on its email thread and how soon, its status (Resolved, ' +
    'Answered, Question waiting, Waiting, Overdue, No reply in 7 days) and the next step. Edit the deadlines at its top ' +
    '(P0 1 hour, P1 4 hours, P2 1 business day: the same time on the next weekday, ET). The bot sees only replies on ' +
    'the email thread, so \"no reply seen on the thread\" never means nothing was done. While testing, only the tester ' +
    'gets the Social Alerts: a reply the tester sends on the thread starting with a team in brackets ([GCPA] On it) ' +
    'counts as that team\'s. It updates right after a new reply, and every 10 minutes.',
  '• Don\'t share this sheet with Burson.',
  '• To train the bot on live Zapier messages in a separate space (one-sided, with outbounds blocked), paste that ' +
    'Google-only training space\'s link in Mirror space (B9); it copies them from S-F Burson (B25). Clear B9 to stop ' +
    'mirroring.',
  '• To test the bot fixing alerts itself, paste a Google-only test space\'s link in Auto-correct space (B10). Each ' +
    'live Burson alert (from S-F Burson, B25) is posted there already corrected, marked as reviewed by the agentic ' +
    'assistant with a link to Burson\'s original, its summary written by Gemini (with web background when the web ' +
    'search found sources) and the post\'s own picture, with what changed in its thread, and ' +
    'the bot works it there like an IM (emojis, the Social Alert email to the tester, the T&S test-form link, answers). ' +
    'It never posts or reacts in the Burson space. C10 shows how it is doing. Clear B10 to stop.',
  '• Rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 are switches for what the bot may do on its own. Each starts OFF, and OFF keeps the bot ' +
    'working as described above. Set one to ON to turn it on; column C says what it does when OFF, and what it is doing ' +
    'when ON. While Testing (row 29), every email still goes only to the tester and no live form is ever submitted.',
  '• Auto-send Social Alerts: the bot sends the Social Alert email itself, instead of leaving a Gmail draft for a person.',
  '• Auto-submit T&S form: the bot submits the T&S form itself (the test copy while testing), never twice for the same ' +
    'post, and sends the urgent email when the alert is urgent.',
  '• KB & Guidance can start alerts: a Social Alert can start when Gemini is very confident and cites a Guidance row or ' +
    'a Resources document, even when the rules alone wouldn\'t escalate.',
  '• Auto-find missing links: when an alert has no link or author, the bot looks for the post in BigQuery (SLRR and ' +
    'Sonar, the last 48 hours) before asking Burson (with Never wait on Burson ON: found or not, the alert is processed ' +
    'right away, and Burson is told when it isn\'t found).',
  '• Direct BigQuery alerts: the bot also reviews qualifying Sprinklr, DSD / Brandwatch and Sonar posts straight from BigQuery, ' +
    'never one it has already seen (in a test feed, the Mirror space, or the Auto-correct space when it works alone; never ' +
    'the live Burson space). A post that already had an alert gets no card of its own, nor does one on a story already ' +
    'alerted (in the Auto-correct space, unless it has 2,000+ engagements and the earlier alerts on it had fewer): ' +
    'C15 counts those, beside the day\'s cards and how many of them got a Social Alert. In the Auto-correct space working ' +
    'alone, Early detection goes first in a run, and this check still runs about every 10 to 15 minutes.',
  '• Write back to SLRR BigQuery: finalized alerts and sends are written to the shared SLRR BigQuery tables, where ' +
    'other teams and dashboards see them. Keep it OFF while testing.',
  '• Learn from IM calls: alerts where the IMs and the bot made different calls are kept on the Learned precedents ' +
    'tab (set Active to No to ignore one), and Gemini sees the similar ones when it reviews an alert.',
  '• Watch sent alerts (24h): for a day after a Social Alert is sent, the bot re-checks the post every 30 minutes and ' +
    'replies on the email thread once if its engagement surges past 50K, it is deleted, or the press picks it up.',
  '• Early wave & velocity check: row 19, OFF unless you turn it ON. Every 15 minutes the bot looks for a story that ' +
    'small accounts are starting to tell before any single post is big. It reads the new posts from small accounts in its ' +
    'approved BigQuery source tables (Sonar\'s posts and Sprinklr\'s comments as they arrive; Brandwatch and Tubular later, ' +
    'only to add to a story; with row 48 or 49 ON, posts from the AMIE table or Brandwatch can start a story too), groups the posts that ' +
    'say the same thing into stories itself, and picks a story once ' +
    'several different accounts tell it, or when the accounts on a topic jump well above the usual. A story gets a card only ' +
    'after Gemini is asked to review it (an ordinary story whose review fails gets a "needs a human look" card). ' +
    'Each one that passes its review goes out as ' +
    'the bot\'s own alert card (its first line says EARLY DETECTION, or UPDATE when it adds to a story already alerted) ' +
    'in the Mirror space or test feed, or in the Auto-correct space (B10) when it works alone (never S-F Burson); there ' +
    'is no separate wave message. The bot marks its emojis, and drafts a Social Alert, Temp Check query, or T&S intake ' +
    'behind human review when warranted. In the Auto-correct space at most 10 stories an hour are taken for review (6 ' +
    'ordinary ones; serious stories go first, and one turned away comes back at the next check) and 150 a day; elsewhere ' +
    '40 a day. C19 counts the day: found, cards, under another ' +
    'alert, let go, never reviewed and waiting.',
  '• The Early Detection tab lists every story Early detection (row 19) found and what became of it, one row each, ' +
    'newest first (the last 2,000), with the reason. Only rows that start "Card posted", "Update added" or "Added under" ' +
    'are in the space. Row 3 has today\'s numbers, as C19 does. The bot makes the tab on the first run with row 19 ON; ' +
    'you may sort its rows, but leave its title (A1) and column names (row 4) as they are. A tab of that name that the bot ' +
    'didn\'t make is left alone, and Status says so.',
  '• BigQuery lookback (B31): how far back Direct BigQuery alerts and Early detection look: 15, 30, 45 or 60 minutes ' +
    '(blank: 60; never more than an hour). Sprinklr posts count only if they went live in that time; DSD story selection, ' +
    'Brandwatch mentions and Sonar posts count if the feed took them in in that time and they went live in the last 48 to 72 hours. ' +
    'Brandwatch and DSD take in most posts hours late and Sprinklr\'s comments arrive about 30 minutes late, so a shorter lookback means fewer ' +
    'Direct BigQuery alerts. C31 shows what the bot is using.',
  '• Check outage & comms docs: for an outage or a widespread bug, Gemini checks whether it is confirmed and adds any ' +
    'approved holding statement from the Resources documents to the analyst note and the Social Alert email.',
  '• Track post-alert outcomes: the bot reads replies to sent Social Alerts and T&S confirmations for a week, logs ' +
    'the outcome on the Alert log and the Results tab, and keeps the Follow-up tab.',
  '• Relay with S-F Burson: analysts work in the Mirror space (B9) only. Everything in S-F Burson (B25) comes over to it ' +
    'as it is there, in the same order: Zapier\'s alerts, and everyone\'s replies, messages and emojis. Everyone the relay ' +
    'sees gets a row on the Relay names tab: type their name once and set org to Burson or Google, and that\'s how they ' +
    'show from then on (nothing waits on it). The analysts\' replies, messages (except ones starting with "internal:") ' +
    'and emojis go straight to the Burson test copy while it\'s set (B26). Once LIVE, with Post in S-F Burson ON too, ' +
    'they wait on the Burson outbox tab, with the analyst\'s name, and go to S-F Burson from the bot\'s account only once ' +
    'someone sets them to Send there. While Testing, nothing goes to S-F Burson. Nothing written while either switch was ' +
    'OFF ever goes. Emojis go on messages posted since it\'s been on. The Relay tab logs each one.',
  '• Never wait on Burson: OFF, the bot asks Burson in the alert\'s thread to fix a wrong alert and resend it, and waits ' +
    'for the resend before deciding it. ON, it decides a corrected alert right away (the Social Alert, ❌ or the T&S ' +
    'form) and tells Burson what it changed.',
  '• Post in S-F Burson: OFF, the bot never posts or reacts in S-F Burson (the real Burson space, B25), and nothing is ' +
    'queued. ON, what the bot would post or react for Burson (asking Burson to fix and resend, answers to Burson, its ' +
    'emojis on the alert) goes, while Testing, straight to the Burson test copy (B26) when it\'s set; once LIVE, it waits ' +
    'on the Burson outbox tab with the relay\'s rows, one row each: set its Status to Send to post it (you can edit its ' +
    'text first) or Skip. Each row goes once, from the bot\'s account; one that mentions anything internal is Blocked, ' +
    'not sent. Turning it ON never sends a row by itself; turning it OFF stops sending at once. Nothing is sent while ' +
    'B25 is blank or can\'t be found, or while Testing.',
  '• Burson test copy (B26): a Google-only space that plays S-F Burson while Testing. Paste its link here (the bot\'s ' +
    'account must be in it; never S-F Burson or a space in B3, B4, B9 or B10). From the moment it\'s set (nothing older, ' +
    'so no backlog floods it), the bot copies S-F Burson there as it is, in the same order: Zapier\'s alerts, and ' +
    'everyone\'s replies, messages and emojis. With the Relay ON, the analysts\' replies, messages and emojis go straight ' +
    'there (no outbox, no Send), and so does what Post in S-F Burson sends; nothing goes to S-F Burson. Nobody works in ' +
    'that space. C26 shows what the bot found. While B26 is set the bot is in Testing; clearing it, with the Safety ' +
    'valve (row 29) OFF, makes the bot fully LIVE.',
  '• Draft follow-ups: with Track post-alert outcomes ON, when no team has replied on a Social Alert\'s email thread by ' +
    'its deadline (the Follow-up tab\'s), the bot writes a short reply asking the teams for a status and leaves it in ' +
    'Gmail Drafts on that thread; one more 24 hours after the send if it isn\'t resolved. It never sends it. While ' +
    'testing it\'s addressed to the tester only; live, to everyone the Social Alert went to.',
  '• Draft answers to questions: with Track post-alert outcomes ON, when a team asks something on a Social Alert\'s ' +
    'email thread and nobody has answered, Gemini drafts an answer from the alert, the bot\'s review, the Resources ' +
    'documents and the Guidance tab, and leaves it in Gmail Drafts on that thread. When nothing it knows answers it, ' +
    'there\'s no draft and the Follow-up tab says it needs an IM. It never makes up facts and never sends anything.',
  '• Safety valve: Testing or LIVE (row 29). The bot is LIVE only when the Safety valve is OFF, the Burson test copy ' +
    '(B26) is blank, and S-F Burson (B25) is set, with the alerts coming from it (the Burson space is S-F Burson, or the ' +
    'Mirror space copies it), and people outside Google can join it, as they can the real S-F Burson. LIVE, Social ' +
    'Alerts and the bot\'s other emails go to the real recipients, the real T&S form is submitted, the leads get the ' +
    'escalation-protocol message, and the Burson outbox can send to S-F Burson. Anything else is Testing: every switch ' +
    'still works, but nothing goes to S-F Burson and every email goes only to the tester. It starts OFF, like every ' +
    'switch: set it ON to stay in Testing even with B26 blank. C29 says which it is, every run, and Status starts with ' +
    '🔴 LIVE while it\'s LIVE. The auto-correct space is always Testing.',
  '• Work directly in B25 (Google-only): row 32. To try the bot on another space and its alerts (for example a ' +
    'campaign space), paste that space\'s link in B25 and set row 32 ON. When only Google people can join B25, the bot ' +
    'works right in it, as it does in the Mirror space: it reviews every alert posted there, Burson\'s format or any ' +
    'other, and posts its notes, replies and emojis there directly (no Burson outbox). It stays in Testing: every ' +
    'email goes only to the tester. B3, B4, B9, B10, B26 and the Relay aren\'t used meanwhile, and Direct BigQuery ' +
    'alerts and Early detection don\'t post there. When people outside Google can join B25 (the real S-F Burson), ' +
    'row 32 does nothing. C32 says which.',
  '• Other alerts space (B33): to have the bot work another space too, beside the Mirror space (a campaign space, ' +
    'for example), paste that space\'s link in B33. Every minute, after the Mirror space, the bot works it directly: ' +
    'alerts in Burson\'s format get the usual review, alerts in any other format get their own triage (below), and ' +
    'questions in an alert\'s thread are answered there. It stays in Testing even while the bot is LIVE: every email ' +
    'goes only to the tester. Nothing from it goes to S-F Burson, the Burson test copy or the Burson outbox, and its ' +
    'alerts aren\'t on the Results tab. It refuses the space in B25, a space people outside Google can join, and a space ' +
    'already in B9, B10 or B26 or that the bot already works in. C33 shows how it\'s doing.',
  '• Other kinds of alerts (in the Other alerts space, B33; in B25 with row 32 ON; or in the Mirror space): an alert ' +
    'that isn\'t in Burson\'s format (a campaign or Brandwatch alert, for example) gets its own triage: Gemini reads the ' +
    'post and says what it is, why it matters to that alert\'s topic, and whether it is an SLRR-type post. When it is, ' +
    'the SLRR rules decide, exactly as for Burson\'s alerts; otherwise a Social Alert goes out only when Gemini is 90%+ ' +
    'sure it\'s needed, and the rest get 👍 (worth a person\'s look) or ❌ (no action). Its note is in the alert\'s ' +
    'thread. Guidance rows and Resources documents about that topic steer it.',
  '• Proactive watch: row 34, spotting issues before Burson does. Every 5 minutes the bot reads, ' +
    'read-only in BigQuery, what is new since its last look in each source: the posts Pendulum (Sonar) first saw ' +
    '(accounts with 1,000+ followers or posts with 100+ engagements, risk tags only) and the ones that grew past that ' +
    'later or broke out, Brandwatch\'s negative mentions of Google\'s products on Reddit, Bluesky, Facebook and Instagram ' +
    'tagged with an SLRR exposure tag, Google\'s own posts whose comments turned negative (Sprinklr), comments piling up ' +
    'on Google\'s own posts (Sprinklr), Tubular\'s videos, the DSD story selection feed (Brandwatch\'s HIGH and KOF ' +
    'alerts), the alerts the bot read in the Other alerts space (B33) and the Brandwatch query "2026 Election Alerts" ' +
    '(straight from Brandwatch\'s API, usually minutes after posting). Gemini answers each ' +
    'watch ON on the Watches tab: does the post match its question, how likely is it to become an issue in the next 6 ' +
    'hours (1-10), and what is it about. What scores at a watch\'s bar (and the near misses) goes on the Watch ' +
    'detections tab, with its source and a Rating column for you; the scorecard at its top compares it with Burson\'s ' +
    'alerts (how many it caught, and how much sooner). The Watch sources tab says which sources are live, stale or ' +
    'failing. Nothing is posted or emailed unless Watch alerts (row 35) says where its flags go, and nothing is written to ' +
    'BigQuery. The tabs appear the first time it\'s ON, with two watches, both OFF: set a watch\'s On to ON, or add your ' +
    'own. C34 shows how it\'s doing.',
  '• Watch alerts: row 35, OFF until you choose where the Proactive watch\'s flags go. "Other alerts space (B33)" posts ' +
    'them in the space in B33 (paste another space in B33 and the next ones go there); "Mirror space (B9)" posts ' +
    'them in the Mirror space, beside Burson\'s alerts (the Mirror and the Relay work as before, and nothing the bot ' +
    'posts goes to S-F Burson); "Auto-correct space (B10)" posts them in the Auto-correct space. Only a flag that ' +
    'matters by itself is posted as an alert of its own: a KOF author, 100+ ' +
    'engagements or a P0 tag. Small posts wait, and go out together as ONE alert once 3 accounts tell the same story ' +
    'within 12 hours (its card says what built up); one that never gets company stays on the Watch detections tab. A ' +
    'story already alerted in the last 14 days isn\'t posted again unless the stakes rose (a KOF author, 2,000+ ' +
    'engagements) or the post reports something new, and a flag that isn\'t about Google isn\'t posted. Each one is a 🔭 ' +
    'Watch alert, never in Zapier\'s format, and the bot works it like any alert: ❌, 👍 or a Social Alert to the right ' +
    'teams (only the testers while Testing), and T&S when the post\'s rules say so. A flag waits up to 3 hours to go out; ' +
    'at most 5 a run go in B33, 2 in the Mirror or Auto-correct space. In the Auto-correct space, a flag on a post that ' +
    'already has a card there is not posted again: that card gets a short note that the watch flagged it too (when its ' +
    'only card is a story card that sent no Social Alert, the flag goes out as a Watch alert of its own). C35 shows how it\'s ' +
    'doing: today\'s count of how each flag ended.',
  '• Temp checks: row 36, OFF until you turn it ON. In a thread in the Mirror space or the Other alerts space (B33), ' +
    'write "temp check" and the Brandwatch query\'s name (as the team names them, e.g. [G EVENT] NOV26 Issue name, in ' +
    '[SLRR] Private), or its link. After the next run\'s alerts the bot emails the temp check from its account to the ' +
    'testers (B30, else the stand-in), in the team\'s standard template, times in PT: total mentions since the issue ' +
    'started (the first hour it reached 100+ mentions, unless you add "since 9am PT"), velocity against the peak hour, ' +
    'sentiment, negativity drivers and themes (Gemini, from the most-engaged posts), the source breakdown and the three ' +
    'highest-engaging posts; the thread is told it was sent. "refresh" in that thread emails the update. Brandwatch is ' +
    'only read (the bot never makes or edits a query), at most 35 posts a temp check, reposts excluded; nothing of it goes ' +
    'to S-F Burson. The concern level keeps the template\'s placeholder for you to fill in until the 12-month benchmark ' +
    'is built. C36 shows the last one.',
  '• Group test emails: row 37, OFF until you turn it ON. ON puts the bot in Testing mode and routes each formulated ' +
    'Social Alert email to the test email entered in column C of the Brand safety groups tab next to that group\'s live ' +
    'Google Group email. Each alert is still one email: with one product, its test email is in To; with several ' +
    'products, all their test emails are in Cc. A product with no test email in column C is left off and the skip is ' +
    'logged; when none of the alert\'s products has one, no email is sent. OFF ' +
    'ignores column C test emails completely so live Social Alerts go to column B\'s Google Group emails.',
  '• Fast triage (Gemini Decisions): row 38, OFF until you turn it ON; it only enables rows 39 and 40 on the signals of ' +
    'the Early wave & velocity check (row 19). While rows 39 and 40 are OFF, no Gemini Decisions call is made and nothing ' +
    'is written. When row 39 or 40 is ON, the bot asks Gemini Decisions six questions about each signal (is it about ' +
    'Google, is it a risk to the brand, are separate accounts reporting it first-hand, is it routine noise, which Exposure ' +
    'Tag fits, how severe is it) and gets probabilities back in under a second. It sends only the post snippets, the ' +
    'platforms\' names, the counts and the times: never an account\'s name, a link, or anything from this sheet, the ' +
    'Resources documents or Gmail. Every card still gets its full Gemini review. When Gemini Decisions fails or is slow, ' +
    'the bot stops asking for 15 minutes and signals go on as before; C38 says so.',
  '• Fast triage: rank and early watch: row 39, OFF until you turn it ON; it needs row 38. The most severe signals are ' +
    'queued and reviewed first (P0 risk groups first, then severity, then brand_risk, then the order before), and a story ' +
    'below the promotion bar that passes the watch bars in B43:B45 and B47 is emitted as an early signal and takes the normal ' +
    'route: queued, deduplicated, fully reviewed, and posted as an alert card whose first line says it is an early ' +
    'signal and how many accounts it rests on (when the story reaches the usual size, that goes in the same thread, never ' +
    'as a second alert).',
  '• Fast triage: hold back noise: row 40, OFF until you turn it ON; it needs row 38. A signal with no P0 risk group, no ' +
    'taxonomy hint, and severity in the two lowest levels is dropped without a review when about_google is at or below B41 ' +
    'or routine_noise is at or above B42, with answer confidence at or above B43; C19 counts them among the stories let ' +
    'go and the log records one line with the signal\'s ID, the reason and the probabilities.',
  '• Fast triage bars (B41:B45 and B47): the thresholds for row 40 (hold-back: about_google at or below B41, seed 0.10; ' +
    'routine_noise at or above B42, seed 0.90) and row 39 (early watch: about_google and brand_risk each at or above ' +
    'B44, seed 0.80; independent_reports at or above B47, seed 0.30; distinct accounts at least B45, seed 3), and the ' +
    'shared answer confidence bar in B43 (seed 0.55). A blank or invalid cell uses its seed and column C says so.',
  '• Write early-wave records to BigQuery: row 46, OFF until you turn it ON. Writes each early-wave check\'s ' +
    'story_snapshots, story_posts, signals, signal_events and triage_verdicts to brand-social-central-data.early_wave ' +
    '(batched, at most one insert request per table per check, skipped while SLA triage is busy). An error is logged, ' +
    'shown in C46, and pauses writes for 15 minutes without delaying any review or card.',
  '• Early Detection: also read the AMIE table: row 48, OFF until you turn it ON; it needs Early wave & velocity ' +
    'check (row 19) ON, which it adds posts to. Each Early Detection check then also reads the new rows of the AMIE ' +
    'table (Brandwatch\'s alert feeds, X posts with their words), read only, with no call to Brandwatch. Those posts ' +
    'join stories like the other sources\' posts and can start one; a story only they lift goes for review like the ' +
    'others, up to 2 an hour and 20 a day (the settings early_wave_new_lifted_per_hour and _per_day); the rest are ' +
    'listed on the New sources tab. They never go to S-F Burson. Turning it OFF forgets where it ' +
    'had read to (the day\'s counts stay); ON again starts from the last hour. C48 says what it is doing.',
  '• Early Detection: also read Brandwatch live (not X): row 49, OFF until you turn it ON; it needs Early wave & velocity ' +
    'check (row 19) ON. The New sources tab then lists the Brandwatch project\'s queries, each with Read OFF: set Read to ' +
    'ON for the ones to read (at most 20). After each run the bot asks Brandwatch for the mentions added since it last ' +
    'read, never X and never LinkedIn, and Early Detection adds them to its stories at its next check. It keeps to 20 ' +
    'calls in 10 minutes of its own and waits when Brandwatch\'s shared login is busy. They never go to S-F Burson. ' +
    'Turning it OFF forgets where it had read to (the day\'s counts and your ticks stay); ON again starts from the last ' +
    '30 minutes. C49 says what it is doing.',
  '• Proactive watch: also read the AMIE table: row 50, OFF until you turn it ON; it needs Proactive watch (row 34) ON. ' +
    'The Watch then also checks the new rows of the AMIE table (Brandwatch\'s alert feeds, X posts with their words) in ' +
    'its US look, at most 100 a look and each row once, and while it is ON every post an Early Detection story card links ' +
    'counts as that card\'s, as its main post does. A changed table stops this source alone (the Watch sources tab says ' +
    'why). Its flags go only where Watch alerts (row 35) send them, never to S-F Burson. C50 says what it is doing.',
  '• Open engine: judgment in place of caps: row 51, OFF until you turn it ON; it needs Early wave & velocity check (row ' +
    '19) ON. Early Detection then checks every 5 minutes (10, then 15, as the day\'s run time fills), most serious first, ' +
    'with no count of stories turned away. It sets one safety stop a day (2,000 background reviews, the setting open_daily_stop: then stories, Watch and ' +
    'Direct cards wait until midnight ET) and guards the day\'s trigger run time and outside calls: as they near their ' +
    'budgets, background work slows and then stops, so Burson\'s alerts always keep their share, and a new Burson alert ' +
    'always goes first. Burson\'s alerts are never counted or stopped. The Engine tab then has a row for each Early ' +
    'Detection check, and the Early Detection tab says why a check was skipped. Even while OFF, C51 shows the run time of ' +
    'the last 24 hours. C51 says what it is doing.',
  '• Live dashboard: row 54, OFF until you turn it ON. ON, the live dashboard web app shows the bot\'s work to the ' +
    'people this sheet is shared with (nobody else can open it), read-only: what needs a person now, the stories ' +
    'forming, the alerts and where each one stands, what is stuck or held back and why, and how current it all is. ' +
    'It never posts, sends or changes anything. While it\'s ON the bot also keeps, for each Early Detection story card ' +
    'it posts, the story\'s posts in order, so the web app can show them. C54 has the web app\'s link once it is ' +
    'deployed (the README\'s "Live dashboard" section says how). OFF, the web app shows nothing and the bot keeps ' +
    'nothing extra for it.',
  '• Slide deliveries: row 55, OFF until you turn it ON. In the web app\'s Slide deliveries area, people set up each ' +
    'delivery: a Google Slides deck the bot\'s account can edit, where in it, the design to follow, how far back to ' +
    'look and when. ON, the bot delivers each one on its schedule (it checks every 5 minutes): one "Brand safety ' +
    'pulse" slide with the top issues of that time (alerts, accounts, platforms, engagement, a short summary linked ' +
    'to the posts it cites, and what was done), put where the delivery says; it never changes any other slide. When a ' +
    'delivery lists people to tell, it emails them that the slide is there (while Testing, only the testers in B30). The bot\'s account ' +
    'must approve editing Google Slides once (the README\'s "Slide deliveries" section says how); until then C55 ' +
    'says it is waiting. Deliveries set up while it\'s OFF wait. Nothing of it goes to S-F Burson or the Burson test ' +
    'copy.',
  '• Speed numbers: leave out when the bot was not running: row 56, OFF until you turn it ON. ON, the bot keeps a "When ' +
    'the bot ran" tab: when it was running, paused (Bot OFF), failing, or not running at all (no run for more than 10 ' +
    'minutes), from the moment you turn it ON; before that it is not known. When Bot is set back ON, it lists on the ' +
    '"Burson while bot OFF" tab the Burson alerts posted while it was OFF, without reviewing, posting or emailing anything. ' +
    'The Results and Head start tabs then show extra speed numbers next to the usual ones, which don\'t change: the bot\'s ' +
    'own minutes from picking an alert up, how long alerts waited for the bot to run, how long a person took to send a ' +
    'draft, and the race on the same post, leaving out the times the bot was not running. With row 51 ON, the dashboard ' +
    'also shows the pick-up time leaving out the alerts posted before the bot came back, next to the usual one. OFF, the ' +
    'bot keeps no such record and the tabs are as they were.',
];
// "How it works" starts here (rows 11-24 the switches, 25 S-F Burson space, 26 Burson test copy, 27-29 three more
// switches, 30 Testing: send to, 31 BigQuery lookback, 32 one more switch (Work directly in B25), 33 Other alerts space,
// 34 one more switch (Proactive watch), 35 Watch alerts, 36-37 two more switches (Temp checks, Group test emails), 38-40
// three more switches (Fast triage), 41-45 five fast-triage bars, 46 one more switch (Write early-wave records to
// BigQuery), 47 the sixth fast-triage bar, 48-51 four more switches (Early Detection: also read the AMIE table and
// Brandwatch live; Proactive watch: also read the AMIE table; Open engine), 52-53 left as they are (blank, or a person's
// text), 54-55 two more switches (Live dashboard, Slide deliveries), 56 one more switch (Speed numbers: leave out when
// the bot was not running; until it was one, row 56 was the blank row above the help, which now starts right under it).
// It moved here from row 49 once (no tab
// was ever deployed with it at row 52), then from row 53 when rows 54 and 55 became switches; a tab from before either
// move is brought up to date on its next run (ensureSwitchRows_ writes the switch rows it lacks, writeControlHelp_
// clears the bot's own old help from row 52 down, never a switch row and never a person's text, and writes the help
// from row 57)
const CONTROL_HELP_ROW_ = 57;
const CONTROL_HELP_ROWS_ = 54;  // rows kept for the help text (blank ones clear older, longer text); one more for each new switch's line
// The first row the bot's own old help text is cleared from (writeControlHelp_): the row below row 51, the last switch
// before the help first moved; rows 52 and 53 are otherwise left to people
const CONTROL_HELP_CLEAR_FROM_ = 52;

// Row 30: Testing: send to (B30). Up to 5 email addresses; blank holds test emails until filled in.
const TESTERS_ROW_ = 30;
const TESTERS_LABEL_ = 'Testing: send to';
const TESTERS_MAX_ = 5;

// Row 31: BigQuery lookback (B31) constants & helpers live in BqLookback.gs (15, 30, 45, 60 minutes).

// Row 25: S-F Burson space (B25). C25 is the bot's: \u2713 and the space it found, \u2717 and what to fix, or this when blank.
const SFB_ROW_ = 25;
const SFB_LABEL_ = 'S-F Burson space';
const SFB_BLANK_NOTE_ = '\u26a0\ufe0f Not set: paste S-F Burson\'s link (the real Burson space). Until then the Mirror, ' +
  'Auto-correct and Relay are paused, and the bot posts nothing in any space people outside Google can join.';

function controlTab_(ss) { return ss.getSheetByName(CONTROL_TAB_); }

/** The Control tab, created first in the sheet and pre-filled for testing if missing. Values people set are kept. */
function ensureControlTab_(ss, owner) {
  if (typeof syncBrandSafetyGroups_ === 'function') syncBrandSafetyGroups_(ss);
  let sh = ss.getSheetByName(CONTROL_TAB_);
  if (!sh) sh = ss.insertSheet(CONTROL_TAB_, 0);
  if (String(sh.getRange(1, 1).getValue()) === CONTROL_TITLE_) {
    sh.getRange(8, 2).setValue(owner);
    ensureMirrorRow_(sh);
    ensureAutoCorrectRow_(sh);
    ensureSwitchRows_(sh);
    ensureSfBursonRow_(sh);
    ensureTestCopyRow_(sh);  // row 26 (TestCopy.gs): a value a person pasted there is kept
    ensureTestersRow_(sh);   // row 30: who gets emails while Testing (a value a person typed there is kept)
    ensureBqLookbackRow_(sh);  // row 31: how far back BigQuery looks (a value a person chose there is kept)
    ensureOtherSpaceRow_(sh);  // row 33 (OtherSpace.gs): a value a person pasted there is kept
    ensureWatchAlertsRow_(sh);  // row 35 (WatchAlerts.gs): OFF on a tab from before it; a choice a person made is kept
    ensureFtBarRows_(sh);    // rows 41-45 and 47 (FastTriage.gs): seeds on a tab from before them; values people set are kept
    writeControlHelp_(sh);
    return sh;
  }
  sh.getRange(1, 1, 8, 3).setValues([
    [CONTROL_TITLE_, '', ''],
    ['Bot', 'ON', 'OFF pauses the bot.'],
    ['Burson space', START_BURSON_SPACE, ''],
    ['Analyst space', START_ANALYST_SPACE, ''],
    ['Status', 'Starting…', ''],
    ['Last check', '', ''],
    ['Today', '', ''],
    ['Runs as', owner, 'The bot posts as this account. It must be a member of both spaces.'],
  ]);
  ensureMirrorRow_(sh);
  ensureAutoCorrectRow_(sh);
  ensureSwitchRows_(sh);
  ensureSfBursonRow_(sh);  // blank: only a person pastes S-F Burson there
  ensureTestCopyRow_(sh);  // blank: only a person pastes a Burson test copy there
  ensureTestersRow_(sh);   // blank: falls back to GEN.email.stand_in
  ensureBqLookbackRow_(sh);  // 60 minutes, the longest allowed
  ensureOtherSpaceRow_(sh);  // blank: only a person pastes an Other alerts space there
  ensureWatchAlertsRow_(sh);  // OFF: only a person chooses where the watch's alerts go
  ensureFtBarRows_(sh);    // rows 41-45 and 47: the fast-triage bars, pre-filled with their seeds
  writeControlHelp_(sh);
  sh.getRange(1, 1, RTC_ROW_, 1).setFontWeight('bold');
  sh.getRange(1, 1).setFontSize(14);
  sh.getRange(2, 2, 3, 1).setBackground('#fff8e1');  // the cells people change
  sh.getRange(2, 2).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['ON', 'OFF'], true).build());
  sh.setColumnWidth(1, 130);
  sh.setColumnWidth(2, 440);
  sh.setColumnWidth(3, 360);
  return sh;
}

/**
 * "How it works" from row 57 (CONTROL_HELP_ROW_), right under row 56, the last switch (rewritten by setup(), so it stays current;
 * nobody edits it). In column A of the rows from row 52 (CONTROL_HELP_CLEAR_FROM_) to the help, the bot's own old help
 * is cleared (controlHelpOwn_: its title or a help line; and any line starting with "• " in an old help's own run of
 * rows, which starts at its title or at one of its lines and ends at the first blank cell; a switch row inside it,
 * written over old help, does not end it), so a tab from before the help moved (its "How it works" at row 49, 52 or 53,
 * or higher up with switch rows written over it since) keeps no old text there: the old title at A53 is cleared;
 * anything else a person wrote there is left as it is (rows 52 and 53 are theirs; their own "•" line above a blank
 * row or above the old title too), and a switch row (54, 55, 56) is never touched. In column A of the rows the help is
 * written over (row 57 down, CONTROL_HELP_ROWS_ rows), a text that is not the bot's own help is a person's (a tab whose
 * help was higher up had room below it, rows 104-109): it is kept, unchanged and in order, in the first blank cells of
 * column A below the help, and the log says so. Other columns are never touched.
 */
function writeControlHelp_(sh) {
  const lines = [['How it works']].concat(CONTROL_HELP_.map(line => [line]));
  while (lines.length < CONTROL_HELP_ROWS_) lines.push(['']);
  const switchRows = switchRows_();
  const from = Math.min(CONTROL_HELP_ROW_ - 1, CONTROL_HELP_CLEAR_FROM_);
  const end = CONTROL_HELP_ROW_ + lines.length - 1;
  const col = sh.getRange(from, 1, end - from + 1, 1).getValues().map(v => (v ? v[0] : ''));
  const kept = [];
  let oldHelp = false;  // in an old help's run of rows: from its title or one of its lines to the first blank cell
  col.forEach((v, i) => {
    const row = from + i;
    if (switchRows.indexOf(row) >= 0) return;  // a switch row (54, 55, 56): never touched; written over old help, it keeps its run
    const text = String(v === undefined || v === null ? '' : v).trim();
    oldHelp = text !== '' && (oldHelp || controlHelpOwn_(v));
    const own = controlHelpOwn_(v) || (oldHelp && text.startsWith('\u2022 '));
    if (row < CONTROL_HELP_ROW_) {
      if (own) sh.getRange(row, 1).setValue('').setFontWeight('normal');
    } else if (!controlCellBlank_(v) && !own) {
      kept.push({ row, v });
    }
  });
  sh.getRange(CONTROL_HELP_ROW_, 1, lines.length, 1).setValues(lines);
  sh.getRange(CONTROL_HELP_ROW_, 1).setFontWeight('bold');
  sh.getRange(CONTROL_HELP_ROW_ + 1, 1, lines.length - 1, 1).setFontWeight('normal');
  if (kept.length) keepBelowControlHelp_(sh, end, kept);
}

/** True when a cell holds nothing (blank, or only spaces). Pure. */
function controlCellBlank_(v) {
  return String(v === undefined || v === null ? '' : v).trim() === '';
}

/**
 * Puts a person's texts (`kept`: {row, v, cell (where it was, when not column A)}, in row order) that the help (or a new
 * switch row) was written over into the first blank cells of
 * column A below row `end`, unchanged, one each; past the tab's last row each goes in a new row (appendRow, which also
 * grows the grid). Logs one line that says where each went.
 */
function keepBelowControlHelp_(sh, end, kept) {
  const last = sh.getLastRow();
  const below = last > end ? sh.getRange(end + 1, 1, last - end, 1).getValues() : [];
  let i = 0;
  const moved = kept.map(k => {
    while (i < below.length && !controlCellBlank_(below[i][0])) i++;
    let to;
    if (i < below.length) {
      to = end + 1 + i;
      sh.getRange(to, 1).setValue(k.v);
      i++;
    } else {
      sh.appendRow([k.v]);
      to = sh.getLastRow();
    }
    return `${k.cell || `A${k.row}`} to A${to}`;
  });
  // a text from a cell a new switch row was written over (`cell`) did not come from the help's rows: said apart
  const fromSwitch = kept.some(k => k.cell);
  console.log(fromSwitch
    ? `Control tab: a person's text in the cells the new switch rows were written over was kept below "How it works" (rows ` +
      `${CONTROL_HELP_ROW_}-${end} of column A): ${moved.join(', ')}`
    : `Control tab: "How it works" now fills rows ${CONTROL_HELP_ROW_}-${end} of column A; a person's text ` +
      `there was kept below it (${moved.join(', ')})`);
}

/**
 * True when a cell holds the bot's own help text: the title "How it works", one of today's help lines, or a help line
 * as an earlier build worded it: "• " and the same opening as one of today's lines (its words up to the first colon,
 * comma, bracket or full stop, such as "• Early wave & velocity check" or "• To pause"), or the switch-rows line
 * ("• Rows 11-... are switches"). A person's own line is not, even one that starts with "•". Pure.
 */
function controlHelpOwn_(v) {
  const text = String(v === undefined || v === null ? '' : v).trim();
  if (text === 'How it works' || CONTROL_HELP_.indexOf(text) >= 0) return true;
  if (!text.startsWith('\u2022 ')) return false;
  if (/^\u2022 Rows [0-9][0-9 ,and-]* are switches\b/.test(text)) return true;
  const opening = controlHelpOpening_(text);
  return CONTROL_HELP_.some(line => controlHelpOpening_(line) === opening);
}

/** A help line's opening: its words up to the first colon, comma, bracket or full stop ("• Fast triage"). Pure. */
function controlHelpOpening_(line) {
  return String(line).trim().match(/^[^:,(.]*/)[0].trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Switches (rows 11-24, then 27-29 below the two space cells, 32 below the BigQuery lookback, 34 below the Other
// alerts space, 36-40 below Watch alerts, 46 below the fast-triage bars, 48-51 below the sixth bar, and 54-56 below
// rows 52-53, which are left to people): what the bot may do on its own. Each is ON / OFF and starts OFF; OFF is the
// bot as it was. Only a person
// turns one ON: the bot writes OFF on a row it adds or repairs, and never changes a switch's value. (A script property
// SWITCH_DEFAULTS, left by a build that turned switches ON by itself, is never read, written or deleted.)
// ---------------------------------------------------------------------------------------------------------------

const SWITCH_FIRST_ROW_ = 11;
const SWITCH_NOTES_PROP_ = 'SWITCH_NOTES';  // what each switch did lately, for column C ({key: {text, at}})
const SWITCH_NOTE_MS_ = 24 * 3600 * 1000;   // a note older than a day is dropped
const SWITCH_NOTE_REFRESH_MS_ = 3600 * 1000;  // ...so the same note, written again, is kept fresh once an hour

/** Who gets the emails while Testing, for row 29's C29 text: extra.testers, else standIn, else GEN.email.stand_in. Pure. */
function testersWho_(standIn, extra) {
  if (extra && Array.isArray(extra.testers)) return extra.testers.join(', ');
  const list = onlyToList_(standIn);
  return list.join(', ') || String((GEN.email && GEN.email.stand_in) || '').trim();
}

/**
 * One row each, in this order from row 11; one with its own `row` goes there instead (rows 27-28: below S-F Burson and
 * the Burson test copy, rows 25-26, which never move). off: column C while it's OFF (text, or a function of the run's
 * switches for one whose OFF behavior depends on another switch). on: column C while it's ON (a function of the
 * stand-in, of whether the main flow is the live Burson space, for the ones that behave differently while testing (live
 * is undefined when that isn't known, e.g. while paused), and of the run's switches); a feature's own note
 * (noteSwitch_) follows it.
 */
const CONTROL_SWITCHES_ = [
  { key: 'autoSend', label: 'Auto-send Social Alerts',
    off: 'OFF (the Social Alert is a Gmail draft for a person to send; while testing it goes only to the testers in B30)',
    on: (standIn, live, sw) => (sw && sw.bsgTestEmails
      ? '✓ ON (testing: sending each Social Alert to its group\'s test email in Brand safety groups)'
      : standIn ? '✓ ON (testing: sending only to the testers in B30)'
        : live === false ? '✓ ON (Testing: Social Alerts stay drafts)'
          : '✓ ON: the bot sends the Social Alert email itself') },
  { key: 'autoTns', label: 'Auto-submit T&S form',
    off: 'OFF (posts the pre-filled T&S form link in Chat for a person to submit)',
    on: standIn => (standIn ? '✓ ON (testing: submits the test copy of the form; the urgent email goes only to the testers in B30)'
      : '✓ ON: the bot submits the T&S form itself, and sends the urgent email when it\'s urgent') },
  { key: 'kbStartAlerts', label: 'KB & Guidance can start alerts',
    off: 'OFF (the Resources documents and the Guidance tab can only stop an alert or correct its fields)',
    on: () => '✓ ON: a Social Alert can start on a Guidance row or a Resources document Gemini cites, at high confidence' },
  { key: 'autoFindLinks', label: 'Auto-find missing links',
    off: sw => (sw && sw.noWait ? 'OFF (a missing link or author: processed without it, and Burson is told)'
      : 'OFF (asks Burson when the link or the author is missing)'),
    on: (standIn, live, sw) => (sw && sw.noWait
      ? '✓ ON: looks in BigQuery (SLRR, Sonar) for a missing link or author; processed with what it finds'
      : '✓ ON: looks in BigQuery (SLRR, Sonar) for a missing link or author before asking Burson') },
  { key: 'directBq', label: 'Direct BigQuery alerts',
    off: 'OFF (reviews the alerts posted in Chat only)',
    on: () => '✓ ON: also reviews Sprinklr, DSD / Brandwatch and Sonar posts straight from BigQuery (each post once)' },
  { key: 'writeBackBq', label: 'Write back to SLRR BigQuery',
    off: 'OFF (writes only to this sheet: nothing goes to the shared SLRR BigQuery tables)',
    on: () => '✓ ON: finalized alerts and sends are written to the shared SLRR BigQuery tables' },
  { key: 'learnIm', label: 'Learn from IM calls',
    off: 'OFF (no learning from the IMs\' past calls)',
    on: () => '✓ ON: keeps the IMs\' different calls on the Learned precedents tab and shows Gemini the similar ones' },
  { key: 'watchSent', label: 'Watch sent alerts (24h)',
    off: 'OFF (stops once the Social Alert is sent)',
    on: standIn => (standIn ? '✓ ON (testing: the updates go only to the testers in B30): re-checks sent alerts every 30 min ' +
      'for a day (engagement surge, deleted post, press pickup)'
      : '✓ ON: re-checks sent alerts every 30 min for a day and replies on their email thread (engagement surge, deleted ' +
        'post, press pickup)') },
  { key: 'earlyWave', label: 'Early wave & velocity check',
    off: 'OFF (one post at a time)',
    on: () => `✓ ON: every ${Math.round(EW_EVERY_MS_ / 60000)} min, groups new posts from small accounts into stories ` +
      'and reviews them; one that passes its review is posted as an EARLY DETECTION card (there is no separate wave message)' },
  { key: 'outageComms', label: 'Check outage & comms docs',
    off: 'OFF (standard review)',
    on: () => '✓ ON: checks outage claims and adds approved holding statements from the Resources documents' },
  { key: 'trackOutcomes', label: 'Track post-alert outcomes',
    off: 'OFF (doesn\'t read replies after the Social Alert is sent)',
    on: () => '✓ ON: reads replies to sent Social Alerts and T&S confirmations, logs the outcome and keeps the Follow-up tab' },
  { key: 'relay', label: 'Relay with S-F Burson',
    off: 'OFF (the Mirror space gets Zapier\'s alerts only; nothing is posted in S-F Burson)',
    // extra (switchStatusTexts_): {testCopy: the Burson test copy's name (B26) when the analysts' side goes there,
    // testCopyBroken: B26 is set but fails its checks, so the analysts' side waits}
    on: (standIn, live, sw, extra) => '✓ ON: everything in S-F Burson comes into the Mirror space in its own order ' +
      '(Zapier\'s alerts, everyone\'s replies, messages and emojis); analysts\' (never the bot\'s) ' +
      (extra && extra.testCopy ? 'go straight to the Burson test copy (B26), never to S-F Burson'
        : extra && extra.testCopyBroken ? 'wait until the Burson test copy (B26) is fixed (see C26)'
          : !(sw && sw.postBurson) ? 'stay there (Post in S-F Burson is OFF)'
            : live === true ? 'wait on the Burson outbox tab for Send' : 'stay there (Testing: nothing goes to S-F Burson)') +
      '. The Relay tab logs each one' },
  { key: 'noWait', label: 'Never wait on Burson',
    off: 'OFF (asks Burson to fix and resend, and waits for the resend)',
    on: () => '✓ ON: decides corrected alerts itself and tells Burson what changed' },
  { key: 'postBurson', label: 'Post in S-F Burson',
    off: 'OFF (nothing is posted or reacted in S-F Burson)',
    on: (standIn, live, sw, extra) => (live === true ? '✓ ON: posts only the Burson outbox rows set to Send'
      : extra && extra.testCopy ? '✓ ON (Testing): the bot\'s Burson replies and emojis in the Mirror space go straight ' +
        'to the Burson test copy (B26); nothing goes to S-F Burson'
        : '✓ ON (Testing): nothing goes to S-F Burson') },
  // Below S-F Burson (25) and the Burson test copy (26), which never move: their own rows (FollowUp.gs). Both act on what
  // Track post-alert outcomes (row 21) reads, so they wait for it
  { key: 'draftFollowUps', label: 'Draft follow-ups', row: 27,
    off: 'OFF (the Follow-up tab shows the next step; nothing is drafted)',
    on: (standIn, live, sw) => (!(sw && sw.trackOutcomes)
      ? '✓ ON, but waiting: it needs Track post-alert outcomes (row 21) ON, which reads the threads'
      : `✓ ON${standIn ? ' (testing: the drafts are to the stand-in only)' : ''}: a Gmail draft on the Social Alert's ` +
        `thread${standIn ? '' : ', to everyone it went to,'} when no team has replied by the deadline, and one more at 24 h ` +
        'if it isn\'t resolved; nothing is sent') },
  { key: 'draftAnswers', label: 'Draft answers to questions', row: 28,
    off: 'OFF (a team\'s question shows on the Follow-up tab; nothing is drafted)',
    on: (standIn, live, sw) => (!(sw && sw.trackOutcomes)
      ? '✓ ON, but waiting: it needs Track post-alert outcomes (row 21) ON, which reads the threads'
      : `✓ ON${standIn ? ' (testing: the drafts are to the stand-in only)' : ''}: a team's question on the thread gets a ` +
        'Gmail draft of an answer from the alert, the review, Resources and Guidance; none when the bot doesn\'t know ' +
        '(the Follow-up tab says it needs an IM)') },
  // Row 29: Testing or LIVE (Main.gs runMode_). ON: Testing, whatever B26 says. OFF: the Burson test copy (B26) decides:
  // set, Testing; blank (with S-F Burson found, people outside Google able to join it, and the alerts coming from it),
  // LIVE. Column C says which, either way (extra.modeWhy: why this run is Testing). A run that works alone in the
  // Auto-correct space is Testing whatever B26 and B25 hold (Main.gs AC_STANDALONE_MODE_WHY_): its note says that, not
  // what would make another run LIVE
  { key: 'safetyValve', label: 'Safety valve', row: 29,
    off: (sw, live, extra) => (live === true
      ? 'OFF · 🔴 LIVE: Social Alerts and the bot\'s other emails go to the real recipients, the T&S form is the real ' +
        'one, and S-F Burson gets what Post in S-F Burson (row 24) sends. Set ON (or paste a Burson test copy in B26) ' +
        'to go back to Testing'
      : live === false
        ? `OFF · 🧪 Testing (${(extra && extra.modeWhy) || 'not live'}): nothing goes to S-F Burson, and every email ` +
          `goes only to ${testersWho_('', extra) || 'the stand-in'} (B30). ` +
          (extra && extra.modeWhy === AC_STANDALONE_MODE_WHY_
            ? 'The bot works only in the Auto-correct space, which is always Testing'
            : 'With B26 blank and S-F Burson set, the bot is fully LIVE')
        : 'OFF (the Burson test copy, B26, decides: set, Testing; blank, fully LIVE. ON: always Testing)'),
    on: (standIn, live, sw, extra) => `✓ ON · 🧪 Testing, even with B26 blank: nothing goes to S-F Burson, and every email goes only to ` +
      `${testersWho_(standIn, extra) || 'the stand-in'} (B30). Set OFF and clear B26 to go LIVE` },
  // Row 32, below the BigQuery lookback: Work directly in B25 (Main.gs directB25For_). ON with B25 a space people outside
  // Google can't join: the bot works right in B25, as in a Mirror space, always Testing. extra.directB25 (this run's
  // directB25For_: {state: 'on' | 'outside' | 'waiting', name}) says which; unknown (paused): what it does
  { key: 'directB25', label: 'Work directly in B25 (Google-only)', row: 32,
    off: 'OFF (B25 is the real S-F Burson: the bot posts nothing there itself, only Burson outbox rows set to Send)',
    on: (standIn, live, sw, extra) => directB25OnText_(extra && extra.directB25, testersWho_(standIn, extra)) },
  // Row 34, below the Other alerts space (33): Proactive watch (ProactiveWatch.gs). Every 5 minutes Gemini
  // checks, inside BigQuery, what is new in each source (Sonar, Brandwatch, Sprinklr, Tubular, the DSD story selection
  // feed and the Other alerts space's alerts) against the watches ON on the Watches tab, and what it would flag goes on
  // the Watch detections tab, with a scorecard against Burson's alerts. It posts and emails nothing, unless Watch alerts
  // (row 35, WatchAlerts.gs; extra.watchAlerts: 'other' | 'mirror' this run) says where its flags go
  { key: 'proactiveWatch', label: 'Proactive watch', row: 34,
    off: 'OFF (the bot reviews only the alerts posted in Chat)',
    on: (standIn, live, sw, extra) => (extra && extra.watchAlerts
      ? `✓ ON (its flags go out as watch alerts: row 35, ${pwAlertsWhere_(extra.watchAlerts)}): every 5 min, Gemini ` +
        'checks what\'s new in Sonar, Brandwatch, Sprinklr, Tubular and the Other alerts space against the watches ON on ' +
        'the Watches tab; what it flags goes on the Watch detections tab'
      : '✓ ON (Watch alerts, row 35, is OFF: nothing is posted or emailed): every 5 min, Gemini checks what\'s new in ' +
        'Sonar, Brandwatch, Sprinklr, Tubular and the Other alerts space against the watches ON on the Watches tab; ' +
        'what it would flag goes on the Watch detections tab') },
  // Row 36, below Watch alerts (35): Temp checks (TempCheck.gs). "temp check" and a Brandwatch query's name in a thread of
  // the Mirror space (B9) or the Other alerts space (B33) gets the team's temp check emailed to the testers (B30, else the
  // stand-in), the thread told it was, after the run's alerts; a feature note says how the last one went
  { key: 'tempChecks', label: 'Temp checks', row: 36,
    off: 'OFF (temp checks are done by hand)',
    on: () => '✓ ON: write "temp check" and a Brandwatch query\'s name (or its link) in a thread in the Mirror space (B9) ' +
      'or the Other alerts space (B33); after the next run\'s alerts the bot emails the temp check, in the team\'s template, ' +
      'to the testers (B30, else the stand-in) and says so in the thread ("refresh" for an update). The concern level is ' +
      'left for you to fill in until its 12-month benchmark is built' },
  // Row 37, below Temp checks (36): Group test emails (BrandSafetyGroups.gs). ON puts the bot in Testing mode and routes each
  // Social Alert to its group's Column C test email on Brand safety groups (skipping and logging groups with no test email set);
  // OFF ignores Column C test emails completely so live Social Alerts use Column B's Google Group emails
  { key: 'bsgTestEmails', label: 'Group test emails', row: 37,
    off: 'OFF (Social Alerts use live Brand safety groups emails when LIVE; test emails in column C are ignored)',
    on: () => {
      const n = typeof bsgTestGroupCount_ === 'function' ? bsgTestGroupCount_() : 0;
      return '✓ ON · 🧪 Testing (Brand safety groups column C): each Social Alert goes to its group\'s test email' +
        (n ? ` (${n} group${n === 1 ? '' : 's'} set)` : ' (none set yet: no emails will be sent)') +
        '; groups with no test email set are skipped and logged';
    } },
  // Rows 38-40, below Group test emails (37): the fast triage on the Early wave check's signals (FastTriage.gs; Decisions.gs
  // asks). Row 38 only enables rows 39 and 40 (while both are OFF it makes no Decisions call and writes nothing); rows 39
  // and 40 use the answers and the bars in rows 41-45 and 47, and row 46 writes the early-wave records to BigQuery
  { key: 'fastTriage', label: 'Fast triage (Gemini Decisions)', row: 38,
    off: 'OFF (only enables rows 39 and 40; each early-wave signal goes to its full review as it comes)',
    on: (standIn, live, sw) => (!(sw && sw.earlyWave)
      ? '✓ ON, but waiting: it needs Early wave & velocity check (row 19) ON, whose signals it asks about'
      : !(sw && (sw.fastTriageRank || sw.fastTriageHold))
        ? '✓ ON (only enables rows 39 and 40; while both are OFF, no Gemini Decisions call is made and nothing is written)'
        : '✓ ON: enables rows 39 and 40 to ask Gemini Decisions six questions about each early-wave signal (every card still gets its full review)') },
  { key: 'fastTriageRank', label: 'Fast triage: rank and early watch', row: 39,
    off: 'OFF (signals are queued and reviewed in the usual order; a story is flagged only at the usual bar)',
    on: (standIn, live, sw) => (!(sw && sw.fastTriage)
      ? '✓ ON, but waiting: it needs Fast triage (row 38) ON, whose answers it uses'
      : '✓ ON: the most severe signals are queued and reviewed first; a story below the promotion bar that passes the watch bars in B43:B45 and B47 goes out as an early signal') },
  { key: 'fastTriageHold', label: 'Fast triage: hold back noise', row: 40,
    off: 'OFF (every queued signal gets its full review)',
    on: (standIn, live, sw) => (!(sw && sw.fastTriage)
      ? '✓ ON, but waiting: it needs Fast triage (row 38) ON, whose answers it uses'
      : '✓ ON: a low-severity signal that meets the hold-back bars in B41:B43 is dropped without a review (never one with a P0 risk group or a taxonomy hint)') },
  // Row 46, below the fast-triage bars (41-45): Write early-wave records to BigQuery (FastTriage.gs)
  { key: 'earlyWaveBq', label: 'Write early-wave records to BigQuery', row: 46,
    off: 'OFF (no early-wave records are written to BigQuery)',
    on: (standIn, live, sw) => (!(sw && sw.earlyWave)
      ? '✓ ON, but waiting: it needs Early wave & velocity check (row 19) ON, whose records it writes'
      : '✓ ON: writes each early-wave check\'s stories, posts, signals, events and fast-triage verdicts to brand-social-central-data.early_wave') },
  // Row 48, below the sixth fast-triage bar (47): Early Detection also reads the AMIE table (EarlyWaveSource.gs, which
  // learns the run's switches from ewsRunSwitches_, Main.gs). Row 49 is Brandwatch live, row 50 the Watch's AMIE source
  // and row 51 the open engine (next); rows 52-53 are left to people, and the next switches are rows 54 and 55
  { key: 'edAmie', label: 'Early Detection: also read the AMIE table', row: 48,
    off: 'OFF (Early Detection does not read the AMIE table)',
    on: (standIn, live, sw) => (!(sw && sw.earlyWave)
      ? '✓ ON, but waiting: it needs Early wave & velocity check (row 19) ON, which it adds posts to'
      : '✓ ON: each Early Detection check also reads new rows of the AMIE table (Brandwatch\'s alert feeds, X with its words)') },
  // Row 49: Early Detection also reads Brandwatch live, never X (BrandwatchLive.gs, called after the Watch in Main.gs)
  { key: 'edBwLive', label: 'Early Detection: also read Brandwatch live (not X)', row: 49,
    off: 'OFF (Early Detection does not call Brandwatch)',
    on: (standIn, live, sw) => (!(sw && sw.earlyWave)
      ? '✓ ON, but waiting: it needs Early wave & velocity check (row 19) ON, which it adds posts to'
      : bwlNoneTicked_()
        ? '✓ ON, but waiting: tick Read = ON for at least one query on the New sources tab'
        : '✓ ON: reads new Brandwatch mentions (never X) from the queries ticked on the New sources tab, for Early Detection (row 19)') },
  // Row 50: the Watch also reads the AMIE table (ProactiveWatch.gs, the plan's stage 3; it needs row 34), and every post
  // a carded Early Detection story links counts as that card's (EarlyDetection.gs edNoteMembers_, step 3a)
  { key: 'watchAmie', label: 'Proactive watch: also read the AMIE table', row: 50,
    off: 'OFF (the Watch does not read the AMIE table)',
    on: (standIn, live, sw) => (!(sw && sw.proactiveWatch)
      ? '✓ ON, but waiting: it needs Proactive watch (row 34) ON'
      : '✓ ON: the Watch (row 34) also checks new rows of the AMIE table (Brandwatch\'s alert feeds, X with its words)') },
  // Row 51: the open engine (OpenEngine.gs, the open-engine plan; it needs row 19). Its ON text names only what is built
  // (step S2: the day's safety stop and the run-time and outside-call guards); each later step extends it. While OFF,
  // column C also shows the run time of the last 24 hours (the record runs with row 51 OFF too)
  { key: 'openEngine', label: 'Open engine: judgment in place of caps', row: 51,
    off: () => {
      const note = typeof openOffNote_ === 'function' ? openOffNote_() : '';
      return `OFF (Early Detection, the Watch and Direct BigQuery keep today's limits)${note ? ` · ${note}` : ''}`;
    },
    on: (standIn, live, sw) => (!(sw && sw.earlyWave)
      ? '✓ ON, but waiting: it needs Early wave & velocity check (row 19) ON'
      : '✓ ON: checks every 5 min, the most serious go first; one safety stop a day, and the day\'s run time and outside calls guarded so Burson\'s alerts keep their share') },
  // Rows 54 and 55, below rows 52-53 (left as they are: blank, or a person's text): the live dashboard web app
  // (Dashboard.gs doGet; DashboardData.gs reads, read-only) and the slide deliveries set up in it (SlideDeliveries.gs).
  // Row 54 ON: poll() writes the dashboard's build id (Main.gs); C54 has the web app's link, or says it is not deployed
  // yet. Row 55 ON: poll() keeps one time trigger for the deliveries (Main.gs); C55 says it waits while the bot's account
  // has not approved editing Google Slides. Neither ON text depends on Testing or LIVE
  { key: 'liveDashboard', label: 'Live dashboard', row: 54,
    off: 'OFF (the live dashboard web app shows nothing; the bot keeps no extra records for it)',
    on: () => liveDashboardOnText_(typeof dashWebAppUrl_ === 'function' ? dashWebAppUrl_() : '') },
  { key: 'slideDeliveries', label: 'Slide deliveries', row: 55,
    off: 'OFF (no pulse slides are delivered; deliveries can be set up in the web app and wait)',
    // while the bot is paused (B2 OFF: extra.paused, from poll) nothing is delivered, and C55 says so
    on: (standIn, live, sw, extra) => (extra && extra.paused && typeof SLIDE_PAUSED_ON_TEXT_ === 'string' ? SLIDE_PAUSED_ON_TEXT_
      : slideDeliveriesOnText_(typeof dashScopeOk_ === 'function' && dashScopeOk_())) },
  // Row 56, right above the help (until it became a switch, the blank row above it): the run log (RunLog.gs). ON, the bot
  // keeps the "When the bot ran" tab and lists Burson's alerts posted while it was OFF; the Results and Head start tabs
  // show the speed numbers that leave out the times it was not running next to the usual ones. C56 says since when the
  // log is kept (extra.runLogStart, from poll(): Main.gs, only while ON). Its ON text doesn't depend on Testing or LIVE
  { key: 'speedHonest', label: 'Speed numbers: leave out when the bot was not running', row: 56,
    off: 'OFF (the speed numbers count every alert as they always have, and the bot keeps no record of when it was running)',
    on: (standIn, live, sw, extra) => speedHonestOnText_(extra && extra.runLogStart) },
];

// How C56's ON text starts, with or without the run log's start (controlOwnStatus_: the bot's own text, never kept)
const SPEED_HONEST_ON_HEAD_ = '\u2713 ON: keeping the "When the bot ran" tab';

/**
 * Column C of "Speed numbers: leave out when the bot was not running" (row 56) while it's ON: `start` the run log's first
 * record (ms: RunLog.gs runLogStart_; 0 or missing while it has none, or while its tab can't be written). Pure but for
 * GEN (the time zone).
 */
function speedHonestOnText_(start) {
  const since = Number(start) > 0 ? ` since ${speedTime_(Number(start))} ET` : '';
  return `${SPEED_HONEST_ON_HEAD_}${since}; the Results and Head start tabs show speed numbers that leave out the ` +
    'times the bot was not running, next to the usual ones';
}

/**
 * Column C of "Live dashboard" (row 54) while it's ON: `url` the web app's own link (ScriptApp.getService().getUrl():
 * Dashboard.gs dashWebAppUrl_), or '' while no web app is deployed. Pure.
 */
function liveDashboardOnText_(url) {
  const link = String(url || '').trim();
  return '✓ ON: the live dashboard web app shows the bot\'s work (read-only) · ' +
    (link || 'not deployed yet: see the README "Live dashboard" section');
}

/**
 * Column C of "Slide deliveries" (row 55) while it's ON: `scopeOk` true once the bot's account has approved editing
 * Google Slides (Dashboard.gs dashScopeOk_); until then, waiting. Pure.
 */
function slideDeliveriesOnText_(scopeOk) {
  return scopeOk
    ? '✓ ON: delivers the brand safety pulse slides on each delivery\'s schedule (Slide deliveries in the web app)'
    : '✓ ON, but waiting: the bot\'s account must approve editing Google Slides once (README "Slide deliveries")';
}

/**
 * Column C of "Work directly in B25" (row 32) while it's ON: `d` this run's directB25For_ ({state, name}; missing while
 * paused or before B25 was read), `who` the testers. Pure.
 */
function directB25OnText_(d, who) {
  const state = d && d.state;
  const name = d && d.name ? ` (${d.name})` : '';
  if (state === 'on') {
    return `✓ ON: B25${name} is Google-only, so the bot works right in it, as in a Mirror space: it reviews every alert ` +
      'posted there (Burson\'s format or any other) and posts its notes, replies and emojis there directly. 🧪 Testing: ' +
      `every email goes only to ${who || 'the stand-in'} (B30). B3, B4, B9, B10, B26 and the Relay aren't used`;
  }
  if (state === 'outside') {
    return `✓ ON, but not used: people outside Google can join B25${name}, so it's the real S-F Burson (nothing is posted ` +
      'there but Burson outbox rows set to Send)';
  }
  if (state === 'waiting') return '✓ ON, but waiting: B25 is blank or can\'t be found (see C25)';
  return '✓ ON (the bot works right in B25 when only Google people can join it)';
}

/** Each switch's row, in CONTROL_SWITCHES_'s order: from row 11 on, or its own `row` (27-29, 32, 34, 36-40, 46, 48-51, 54-56). Pure. */
function switchRows_() { return CONTROL_SWITCHES_.map((s, i) => s.row || SWITCH_FIRST_ROW_ + i); }

/** The switch rows as runs of rows next to each other ([{start, idx: [switch index]}]: 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54-56). Pure. */
function switchRowRuns_() {
  const runs = [];
  switchRows_().forEach((r, i) => {
    const last = runs[runs.length - 1];
    if (last && r === last.start + last.idx.length) last.idx.push(i);
    else runs.push({ start: r, idx: [i] });
  });
  return runs;
}

/** Every switch OFF: {autoSend: false, …} (Pure). */
function switchesOff_() {
  const out = {};
  CONTROL_SWITCHES_.forEach(s => { out[s.key] = false; });
  return out;
}

/** True when the run's switch `key` is ON (no switches, as in a run without the Control tab: OFF). Pure. */
function switchOn_(ctx, key) { return !!(ctx && ctx.switches && ctx.switches[key] === true); }

/**
 * The switches from the Control tab's switch rows (`rows`: [[label, value], …], one per switch in CONTROL_SWITCHES_'s
 * order: readSwitches_): ON only where the row has the switch's own label and says ON, so a tab from before the switches
 * (its help text in those rows) has them all OFF. Pure.
 */
function parseSwitches_(rows) {
  const out = switchesOff_();
  CONTROL_SWITCHES_.forEach((s, i) => {
    const r = (rows || [])[i] || [];
    const value = String(r[1] === undefined || r[1] === null ? '' : r[1]).trim().toUpperCase();
    out[s.key] = String(r[0] || '').trim() === s.label && (r[1] === true || value === 'ON');
  });
  return out;
}

/**
 * Switch `s`'s column C while it's OFF, for the run's `switches` (and, for the Safety valve, whether the run is LIVE:
 * true / false / undefined when not known, and extra.modeWhy). Pure.
 */
function switchOffText_(s, switches, live, extra) {
  return typeof s.off === 'function' ? s.off(switches || switchesOff_(), live, extra) : s.off;
}

/**
 * Rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56: one switch each, with its ON / OFF dropdown. A row that isn't
 * its switch yet (a tab from before it: the help text or a blank row was there, or a label someone cleared) gets it, OFF;
 * a switch already there keeps its value. "How it works" moves below them, and also when every switch is in place but
 * row 57 does not hold the help's title (a tab with the help higher up). Never sets a switch ON, and never touches rows
 * 25-26 (the space cells) or rows 52-53 (left to people).
 */
function ensureSwitchRows_(sh) {
  if (!sh) return;
  const rows = switchRows_();
  const last = Math.max(CONTROL_HELP_ROW_, Math.max.apply(null, rows));
  const labels = sh.getRange(SWITCH_FIRST_ROW_, 1, last - SWITCH_FIRST_ROW_ + 1, 1).getValues();
  const todo = CONTROL_SWITCHES_.map((s, i) => i)
    .filter(i => String((labels[rows[i] - SWITCH_FIRST_ROW_] || [])[0] || '').trim() !== CONTROL_SWITCHES_[i].label);
  if (!todo.length) {
    // every switch is in place: the help is written again only when its title is not at CONTROL_HELP_ROW_ (a tab whose
    // help is still where an earlier build put it, at row 52 or 53)
    const title = String((labels[CONTROL_HELP_ROW_ - SWITCH_FIRST_ROW_] || [])[0] || '').trim();
    if (title !== 'How it works') writeControlHelp_(sh);
    return;
  }
  const rule = SpreadsheetApp.newDataValidation().requireValueInList(['ON', 'OFF'], true).build();
  // a person's text in rows 54-56 when their switches are written over it (beside an old help line, on a tab from
  // before them) is kept below the help, as writeControlHelp_ keeps one in column A; the bot's own (its help, a switch's
  // label, ON or OFF, a column C status) is not. A person's ON is never carried over: the new switch starts OFF. (The
  // older switch rows are written over as they always were)
  const kept = [];
  const keepFrom = todo.filter(i => CONTROL_KEEP_TEXT_SWITCHES_.indexOf(CONTROL_SWITCHES_[i].key) >= 0);
  try {
    const lo = keepFrom.length ? Math.min.apply(null, keepFrom.map(i => rows[i])) : 0;
    const hi = keepFrom.length ? Math.max.apply(null, keepFrom.map(i => rows[i])) : 0;
    const grid = keepFrom.length ? sh.getRange(lo, 1, hi - lo + 1, 3).getValues() : [];
    keepFrom.forEach(i => {
      const r = rows[i];
      (grid[r - lo] || []).forEach((v, c) => {
        if (controlCellBlank_(v) || !controlPersonText_(v, c)) return;
        kept.push({ row: r, v, cell: `${'ABC'[c]}${r}` });
      });
    });
  } catch (e) { /* not read: written over as before */ }
  const over = new Set();  // the rows written over: their kept texts go below the help even when a write after fails
  try {
    todo.forEach(i => {
      const s = CONTROL_SWITCHES_[i];
      const row = rows[i];
      sh.getRange(row, 1, 1, 3).setValues([[s.label, 'OFF', switchOffText_(s)]]);
      over.add(row);
      sh.getRange(row, 1).setFontWeight('bold');
      sh.getRange(row, 2).setBackground('#fff8e1').setDataValidation(rule);
    });
    writeControlHelp_(sh);
  } finally {
    // after the help is in place (a tab from before it can end above where the help now ends); and when writing it
    // failed, all the same: the next run finds the switch rows in place and never reads those cells again
    const keep = kept.filter(k => over.has(k.row));
    if (keep.length) keepBelowControlHelp_(sh, CONTROL_HELP_ROW_ + Math.max(CONTROL_HELP_ROWS_, CONTROL_HELP_.length + 1) - 1, keep);
  }
}

// The switches whose rows a person's text is kept from when they are first written (ensureSwitchRows_): rows 54-56
// (row 56 was the blank row above the help until it became a switch)
const CONTROL_KEEP_TEXT_SWITCHES_ = ['liveDashboard', 'slideDeliveries', 'speedHonest'];

/**
 * True when `v`, in column `c` (0 A, 1 B, 2 C) of a row a new switch is written over, is a person's text: not the bot's
 * own help (controlHelpOwn_), a switch's label, an ON / OFF value, or one of rows 54-56's own column C statuses
 * (controlOwnStatus_: a note of a person's that starts "OFF" or "✓ ON" is still theirs). Pure.
 */
function controlPersonText_(v, c) {
  const text = String(v === undefined || v === null ? '' : v).trim();
  if (!text || v === true || v === false) return false;
  if (c === 0) return !controlHelpOwn_(v) && !CONTROL_SWITCHES_.some(s => s.label === text);
  if (c === 1) return !/^(?:ON|OFF)$/i.test(text);
  return !controlOwnStatus_(text);
}

/**
 * True when `text` is one of the column C statuses the bot writes for rows 54-56 (their OFF text, an ON text, C55's
 * paused text; C56's ON text with or without the run log's start), as it is or followed by its note (" · ..."). Pure
 * but for GEN.
 */
function controlOwnStatus_(text) {
  const own = CONTROL_SWITCHES_.filter(s => CONTROL_KEEP_TEXT_SWITCHES_.indexOf(s.key) >= 0).map(s => switchOffText_(s))
    .concat([liveDashboardOnText_('').split(' \u00b7 ')[0], slideDeliveriesOnText_(true), slideDeliveriesOnText_(false)])
    .concat(typeof SLIDE_PAUSED_ON_TEXT_ === 'string' ? [SLIDE_PAUSED_ON_TEXT_] : []);
  return own.some(t => text === t || text.indexOf(`${t} \u00b7 `) === 0) || text.indexOf(SPEED_HONEST_ON_HEAD_) === 0;
}

/**
 * Row 25: S-F Burson space. A tab from before it (help text was here, or the blank row above "How it works") gets it on
 * its next run, without setup(), blank: only a person pastes S-F Burson there. Rows 1-24 never move; "How it works"
 * is written again below every row (the Burson test copy in row 26, TestCopy.gs ensureTestCopyRow_, and the rows after
 * it), at CONTROL_HELP_ROW_ (row 57).
 * A value already in B25 is kept (a label someone cleared is put back).
 */
function ensureSfBursonRow_(sh) {
  if (!sh) return;
  if (String(sh.getRange(SFB_ROW_, 1).getValue() || '').trim() === SFB_LABEL_) return;
  const b = sh.getRange(SFB_ROW_, 2).getValue();  // blank on every older tab: its help text used column A only
  const value = String(b === undefined || b === null ? '' : b).trim();
  sh.getRange(SFB_ROW_, 1, 1, 3).setValues([[SFB_LABEL_, value, value ? '' : SFB_BLANK_NOTE_]]);
  sh.getRange(SFB_ROW_, 1).setFontWeight('bold');
  sh.getRange(SFB_ROW_, 2).setBackground('#fff8e1');
  writeControlHelp_(sh);
}

/** C25: what the bot made of B25 (written only when it changes). */
function writeSfBursonNote_(sh, note) {
  if (!sh) return;
  const cell = sh.getRange(SFB_ROW_, 3);
  if (String(cell.getValue() || '') !== String(note || '')) cell.setValue(note || '');
}

/**
 * Every real recipient address the bot emails when LIVE (lowercased), except the config's own stand-in: none of these
 * is ever accepted as a tester in B30. Pure.
 */
function realRecipientSet_() {
  const out = new Set();
  const add = list => (list || []).forEach(a => {
    const lc = String(a || '').trim().toLowerCase();
    if (lc && lc.includes('@')) out.add(lc);
  });
  const dist = (GEN && GEN.distribution) || {};
  (dist.products || []).forEach(p => {
    add(p.pa);
    add(p.gup);
    add(p.execs);
    (p.conditional || []).forEach(c => add(c.recipients));
  });
  (dist.groups || []).forEach(g => add(g.recipients));
  (dist.regional_leads || []).forEach(r => {
    add(r.recipients);
    add(r.reputational_risk_recipients);
  });
  (typeof GEN_CHANNEL_OWNERS !== 'undefined' ? GEN_CHANNEL_OWNERS : []).forEach(co => add(co.owners));
  const em = (GEN && GEN.email) || {};
  add(em.default_to);
  add(em.default_cc);
  add([em.from_email]);
  add((GEN && GEN.leadership && GEN.leadership.recipients) || []);
  add([typeof tnsUrgentAlias_ === 'function' ? tnsUrgentAlias_() : (em.tns_urgent || '')]);
  const standIn = String(em.stand_in || '').trim().toLowerCase();
  if (standIn) out.delete(standIn);
  return out;
}

/**
 * Parses B30 ("Testing: send to"): up to 5 valid email addresses (any domain), deduplicated in the order written, in
 * lower case. Refuses malformed addresses, any of the bot's real recipients (realRecipientSet_), and any past the first
 * 5; falls back to GEN.email.stand_in if set, otherwise [] (holding test sends until B30 is filled in). Pure.
 */
function testersFrom_(raw) {
  const standIn = String((GEN && GEN.email && GEN.email.stand_in) || '').trim().toLowerCase();
  const fallback = standIn ? [standIn] : [];
  const text = String(raw === undefined || raw === null ? '' : raw).trim();
  if (!text) {
    return {
      testers: fallback, used: [], invalid: [], real: [], over: [], blank: true,
      note: standIn
        ? `Blank: while Testing, every email goes only to ${standIn} (up to ${TESTERS_MAX_} email addresses, separated by commas)`
        : `Blank: while Testing, enter up to ${TESTERS_MAX_} email addresses (comma-separated) to receive test emails and alerts (nothing is sent while B30 is blank)`,
    };
  }
  const realSet = realRecipientSet_();
  const used = [];
  const invalid = [];
  const real = [];
  const over = [];
  const seen = new Set();
  (text.match(/[^\s<>",;:()]+@[^\s<>",;:()]+/g) || []).forEach(tok => {
    const a = tok.replace(/^[.'"]+|[.'"]+$/g, '').toLowerCase();
    if (!a || !a.includes('@') || seen.has(a)) return;
    seen.add(a);
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(a)) invalid.push(a);
    else if (realSet.has(a)) real.push(a);
    else if (used.length < TESTERS_MAX_) used.push(a);
    else over.push(a);
  });
  const aside = [];
  if (invalid.length) aside.push(`invalid email (skipped): ${invalid.join(', ')}`);
  if (real.length) aside.push(`real recipient (refused): ${real.join(', ')}`);
  if (over.length) aside.push(`past the first ${TESTERS_MAX_} (skipped): ${over.join(', ')}`);
  const tail = aside.length ? ' \u00b7 ' + aside.join(' \u00b7 ') : '';
  if (used.length) {
    return {
      testers: used, used, invalid, real, over, blank: false,
      note: `\u2713 While Testing, every email goes only to ${used.join(', ')}${tail}`,
    };
  }
  return {
    testers: fallback, used: [], invalid, real, over, blank: false,
    note: standIn
      ? `\u26a0\ufe0f No usable email address: while Testing, every email goes only to ${standIn}` +
        (tail || ` \u00b7 write up to ${TESTERS_MAX_} email addresses, separated by commas`)
      : `\u26a0\ufe0f No usable email address: nothing is sent while Testing until you enter up to ${TESTERS_MAX_} email addresses in B30` + tail,
  };
}

/**
 * Row 30: Testing: send to. A tab from before it gets it on its next run, without setup(); a value already in B30 is
 * kept (a cleared label is put back), and "How it works" is written again below every row (CONTROL_HELP_ROW_, row 57).
 */
function ensureTestersRow_(sh) {
  if (!sh) return;
  if (String(sh.getRange(TESTERS_ROW_, 1).getValue() || '').trim() === TESTERS_LABEL_) return;
  const b = sh.getRange(TESTERS_ROW_, 2).getValue();  // blank on every older tab: its help text used column A only
  const value = String(b === undefined || b === null ? '' : b).trim();
  sh.getRange(TESTERS_ROW_, 1, 1, 3).setValues([[TESTERS_LABEL_, value, testersFrom_(value).note]]);
  sh.getRange(TESTERS_ROW_, 1).setFontWeight('bold');
  sh.getRange(TESTERS_ROW_, 2).setBackground('#fff8e1');
  writeControlHelp_(sh);
}

/** C30: what the bot made of B30 (written only when it changes). */
function writeTestersNote_(sh, note) {
  if (!sh) return;
  const cell = sh.getRange(TESTERS_ROW_, 3);
  if (String(cell.getValue() || '') !== String(note || '')) cell.setValue(note || '');
}

/** B30 as the Control tab has it now ('' on a tab without the row, or when it can't be read). */
function readTestersCell_(sh) {
  try {
    if (!sh) return '';
    const r = sh.getRange(TESTERS_ROW_, 1, 1, 2).getValues()[0];
    const v = String(r[1] === undefined || r[1] === null ? '' : r[1]).trim();
    return String(r[0] || '').trim() === TESTERS_LABEL_ ? v : '';
  } catch (e) {
    return '';
  }
}

/** Resolves B30 (`raw`) for this run and, with `sh`, writes C30 when it changed. Never throws. */
function testersFor_(raw, sh) {
  const out = testersFrom_(raw);
  if (sh) {
    try {
      writeTestersNote_(sh, out.note);
    } catch (e) {
      console.error('could not write C30 (Testing: send to): ' + ((e && e.message) || e));
    }
  }
  return out;
}

// bqLookbackFrom_, ensureBqLookbackRow_, writeBqLookbackNote_, bqLookbackFor_ live in BqLookback.gs.

/** The switches as the Control tab has them now, each from its own row (all OFF when it can't be read). */
function readSwitches_(sh) {
  if (!sh) return switchesOff_();
  try {
    const rows = switchRows_();
    const last = Math.max.apply(null, rows);
    const grid = sh.getRange(SWITCH_FIRST_ROW_, 1, last - SWITCH_FIRST_ROW_ + 1, 2).getValues();
    return parseSwitches_(rows.map(r => grid[r - SWITCH_FIRST_ROW_] || []));
  } catch (e) {
    console.error('could not read the switches on the Control tab: ' + ((e && e.message) || e));
    return switchesOff_();
  }
}

/** Records what switch `key` just did, for its column C ("last check 10:15 AM · 1 wave today"). Never throws. */
function noteSwitch_(key, text) {
  try {
    const props = PropertiesService.getScriptProperties();
    let notes = {};
    try { notes = JSON.parse(props.getProperty(SWITCH_NOTES_PROP_) || '{}') || {}; } catch (e) { notes = {}; }
    const next = truncate_(String(text || ''), 200);
    // the same note again: rewritten once an hour, so a reason that lasts (not checking: …) never ages out of column C
    if (notes[key] && notes[key].text === next && Date.now() - Number(notes[key].at || 0) < SWITCH_NOTE_REFRESH_MS_) return;
    notes[key] = { text: next, at: Date.now() };
    props.setProperty(SWITCH_NOTES_PROP_, JSON.stringify(notes));
  } catch (e) {
    console.error(`could not note what "${key}" did: ${(e && e.message) || e}`);
  }
}

/**
 * Column C of each switch: `switches` ON / OFF, the stand-in (testing; '' while LIVE), notes {key: {text, at}}, now (ms),
 * live (this run is LIVE: true / false, undefined when not known; Main.gs runMode_), extra (beyond the switches:
 * {testCopy, testCopyBroken}, the Burson test copy (B26) for the relay's text, and modeWhy, why the run is Testing; left
 * out, as with B26 blank). Pure.
 */
function switchStatusTexts_(switches, standIn, notes, now, live, extra) {
  return CONTROL_SWITCHES_.map(s => {
    if (!(switches && switches[s.key])) return switchOffText_(s, switches, live, extra);
    const note = notes && notes[s.key];
    const fresh = note && note.text && now - Number(note.at || 0) < SWITCH_NOTE_MS_ ? note.text : '';
    return s.on(standIn, live, switches, extra) + (fresh ? ` · ${fresh}` : '');
  });
}

/**
 * Writes column C of the switches (C11:C24, C27:C29, C32, C34, C36:C40, C46, C48:C51 and C54:C56, each run of rows on its own: C25 and C26 are
 * the space cells' notes, and C30, C31, C33 and C35 belong to their own cells); writes nothing where it already says all
 * of it. live: this run is LIVE (Main.gs runMode_), or undefined when
 * this run doesn't know (paused, or it failed early). extra: see switchStatusTexts_.
 */
function writeSwitchStatuses_(sh, switches, live, extra) {
  if (!sh) return;
  let notes = {};
  try { notes = JSON.parse(PropertiesService.getScriptProperties().getProperty(SWITCH_NOTES_PROP_) || '{}') || {}; } catch (e) { notes = {}; }
  const standIn = live === true ? '' : testersWho_('', extra);
  const next = switchStatusTexts_(switches, standIn, notes, Date.now(), live, extra);
  switchRowRuns_().forEach(run => {
    const want = run.idx.map(i => next[i]);
    const range = sh.getRange(run.start, 3, want.length, 1);
    const current = range.getValues().map(r => String(r[0] === undefined || r[0] === null ? '' : r[0]));
    if (want.some((v, i) => v !== current[i])) range.setValues(want.map(v => [v]));
  });
}

/**
 * The Resources tab: the tab named Resources, else (someone renamed it) the first tab whose header row starts
 * Name · Link · What it covers. null when there's neither.
 */
function resourcesTab_(ss) {
  const named = ss.getSheetByName(RESOURCES_TAB_);
  if (named) return named;
  return ss.getSheets().find(sh => {
    if (sh.getLastRow() < 1 || sh.getLastColumn() < 3) return false;
    const h = sh.getRange(1, 1, 1, 3).getValues()[0].map(v => String(v).trim());
    return h[0] === RESOURCES_HEADER_[0] && h[1] === RESOURCES_HEADER_[1] && h[2] === RESOURCES_HEADER_[2];
  }) || null;
}

/**
 * The Resources tab (second in the sheet), created and pre-filled from the YAML if missing (its documents are ones
 * Burson can open, so they start as Yes). A tab from before the knowledge base gets the last two columns once: the
 * YAML's documents on it are marked Yes, every other row stays blank (internal) until someone sets it.
 */
function ensureResourcesTab_(ss) {
  let sh = resourcesTab_(ss);
  const seedUrls = (GEN.settings.resources || []).map(r => String(r.url || '').trim());
  if (!sh) {
    sh = ss.insertSheet(RESOURCES_TAB_, Math.min(1, ss.getSheets().length));
    const seed = (GEN.settings.resources || []).map(r => [r.name, r.url, r.covers || '', 'Yes', '']);
    sh.getRange(1, 1, seed.length + 1, RESOURCES_HEADER_.length).setValues([RESOURCES_HEADER_].concat(seed));
    sh.getRange(1, 1, 1, RESOURCES_HEADER_.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 220);
    sh.setColumnWidth(2, 440);
    sh.setColumnWidth(3, 520);
  } else if (String(sh.getRange(1, 4).getValue()).trim() !== RESOURCES_HEADER_[3]) {
    sh.getRange(1, 4, 1, 2).setValues([RESOURCES_HEADER_.slice(3)]);
    sh.getRange(1, 1, 1, RESOURCES_HEADER_.length).setFontWeight('bold');
    const n = Math.min(Math.max(0, sh.getLastRow() - 1), RESOURCES_MAX_ROWS_);
    if (n) {
      const links = sh.getRange(2, 2, n, 1).getValues();
      const chips = sh.getRange(2, 2, n, 1).getRichTextValues();
      const marks = sh.getRange(2, 4, n, 1).getValues();
      const next = links.map((r, i) => {
        const shown = String(marks[i][0] === undefined || marks[i][0] === null ? '' : marks[i][0]).trim();
        const text = String(r[0] || '').trim();
        const url = /^https?:\/\//i.test(text) ? text : String((chips[i] && chips[i][0] && chips[i][0].getLinkUrl()) || '').trim();
        return [shown || (url && seedUrls.indexOf(url) >= 0 ? 'Yes' : '')];
      });
      sh.getRange(2, 4, n, 1).setValues(next);
    }
  } else {
    PropertiesService.getScriptProperties().setProperty(RESOURCES_PROP_, 'true');
    return sh;
  }
  sh.setColumnWidth(4, 150);
  sh.setColumnWidth(5, 480);
  sh.getRange(2, 4, RESOURCES_MAX_ROWS_, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).setAllowInvalid(true).build());
  PropertiesService.getScriptProperties().setProperty(RESOURCES_PROP_, 'true');
  return sh;
}

/**
 * The Resources tab as [{row, name, url, covers, burson, status, pin}] (row: the sheet row). A link can be the cell's
 * text or a link on it (Sheets may turn a pasted link into a chip that shows the document's title). burson: "Burson can
 * see it?" is Yes. pin: the optional column "Always read in full?" (RESOURCES_PIN_HEADER_RX_: one people may add after
 * Bot status; the bot never writes it): true (Yes, or a ticked checkbox), false (No, or an unticked one), null (blank,
 * or no such column: Knowledge.gs knowledgePinned_ then reads the Collection Requirements in full). An install from
 * before this tab existed gets it now, once; one from before the knowledge base gets its last two columns. A renamed
 * Resources tab is still found (resourcesTab_), so it's never made a second time.
 */
function readResourceRows_(ss) {
  let sh = resourcesTab_(ss);
  if (!sh && PropertiesService.getScriptProperties().getProperty(RESOURCES_PROP_) !== 'true') sh = ensureResourcesTab_(ss);
  if (sh && String(sh.getRange(1, 4).getValue()).trim() !== RESOURCES_HEADER_[3]) sh = ensureResourcesTab_(ss);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(sh.getLastRow() - 1, RESOURCES_MAX_ROWS_);
  const pinCol = resourcesPinColumn_(sh);
  const values = sh.getRange(2, 1, n, Math.max(RESOURCES_HEADER_.length, pinCol)).getValues();
  const links = sh.getRange(2, 2, n, 1).getRichTextValues();
  return values.map((r, i) => {
    const text = String(r[1] === undefined || r[1] === null ? '' : r[1]).trim();
    const rich = links[i] && links[i][0];
    return {
      row: i + 2,
      name: String(r[0] || '').trim(),
      url: /^https?:\/\//i.test(text) ? text : String((rich && rich.getLinkUrl()) || text).trim(),
      covers: String(r[2] || '').trim(),
      burson: r[3] === true || /^\s*(yes|y|true|✓|✔)\s*$/i.test(String(r[3] === undefined || r[3] === null ? '' : r[3])),
      status: String(r[4] || '').trim(),
      pin: pinCol ? resourcesPinOf_(r[pinCol - 1]) : null,
    };
  });
}

// "Always read in full?" (or without the ?), any case: an optional Resources column people may add after Bot status, so
// a document is always read in full in reviews (Yes) or never (No). The bot only reads it.
const RESOURCES_PIN_HEADER_RX_ = /^always read in full\s*\??$/i;

/** The column (1-based) of "Always read in full?" on the Resources tab, after Bot status; 0 when there's none. */
function resourcesPinColumn_(sh) {
  const last = Math.min(sh.getLastColumn(), 26);
  if (last <= RESOURCES_HEADER_.length) return 0;
  const head = sh.getRange(1, 1, 1, last).getValues()[0];
  for (let c = RESOURCES_HEADER_.length; c < head.length; c++) {
    if (RESOURCES_PIN_HEADER_RX_.test(String(head[c] === undefined || head[c] === null ? '' : head[c]).trim())) return c + 1;
  }
  return 0;
}

/** An "Always read in full?" cell: true (Yes / a ticked box), false (No / an unticked box), null (blank or anything else). Pure. */
function resourcesPinOf_(v) {
  if (v === true || v === false) return v;
  const s = String(v === undefined || v === null ? '' : v).trim();
  if (/^(yes|y|true|✓|✔)$/i.test(s)) return true;
  if (/^(no|n|false|✗|✘)$/i.test(s)) return false;
  return null;
}

/**
 * Writes the Bot status column: `statuses` [{row, text}] for the rows that list a document; any other row in the tab's
 * range is cleared (a status left from a row someone emptied). Writes nothing when the column already says all of it.
 */
function writeResourceStatuses_(ss, statuses) {
  const sh = resourcesTab_(ss);
  if (!sh) return;
  const n = Math.min(Math.max(0, sh.getLastRow() - 1), RESOURCES_MAX_ROWS_);
  if (!n) return;
  const current = sh.getRange(2, 5, n, 1).getValues().map(r => String(r[0] === undefined || r[0] === null ? '' : r[0]));
  const next = current.map(() => '');
  (statuses || []).forEach(s => { if (s.row >= 2 && s.row - 2 < n) next[s.row - 2] = String(s.text || ''); });
  if (next.some((v, i) => v !== current[i])) sh.getRange(2, 5, n, 1).setValues(next.map(v => [v ? '\'' + v : '']));
}

// ---------------------------------------------------------------------------------------------------------------
// Guidance: what the SLRR leads currently want escalated (or not), for Gemini's review (Review.gs guidancePrompt_)
// ---------------------------------------------------------------------------------------------------------------

const GUIDANCE_TAB_ = 'Guidance';
const GUIDANCE_PROP_ = 'GUIDANCE_TAB_MADE';  // set once the tab exists, so a tab people delete stays deleted
const GUIDANCE_MAX_ROWS_ = 30;
const GUIDANCE_EMAIL_MAX_ = 5;
const GUIDANCE_EMAIL_CACHE_MS_ = 30 * 60 * 1000;

/** The Guidance tab (after Resources), created with its header row if missing. One row per instruction. */
function ensureGuidanceTab_(ss) {
  let sh = ss.getSheetByName(GUIDANCE_TAB_);
  if (!sh) {
    sh = ss.insertSheet(GUIDANCE_TAB_, Math.min(2, ss.getSheets().length));
    sh.getRange(1, 1, 1, 4).setValues([['Guidance', 'Applies to', 'Until', 'Added by']]);
    sh.getRange(1, 1, 1, 4).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 560);
    sh.setColumnWidth(2, 240);
    sh.setColumnWidth(3, 120);
    sh.setColumnWidth(4, 200);
  }
  PropertiesService.getScriptProperties().setProperty(GUIDANCE_PROP_, 'true');
  return sh;
}

/** A date written in the Until column ("2026-10-25", "10/25/2026", or a date cell) -> "2026-10-25", or ''. */
function guidanceDay_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, GEN.timezone || 'America/New_York', 'yyyy-MM-dd');
  }
  const s = String(v === undefined || v === null ? '' : v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return '';
}

/**
 * The Guidance tab's current rows: [{source: 'tab', text, applies_to, until, added_by}], without rows whose Until date
 * has passed (an Until that isn't a date keeps the row, and Gemini sees it as written). An install from before this tab
 * existed gets it now, once.
 */
function readGuidanceRows_(ss, now) {
  let sh = ss.getSheetByName(GUIDANCE_TAB_);
  if (!sh && PropertiesService.getScriptProperties().getProperty(GUIDANCE_PROP_) !== 'true') sh = ensureGuidanceTab_(ss);
  if (!sh || sh.getLastRow() < 2) return [];
  const today = etDay_(now || Date.now());
  const n = Math.min(sh.getLastRow() - 1, GUIDANCE_MAX_ROWS_);
  return sh.getRange(2, 1, n, 4).getValues().map(r => {
    const day = guidanceDay_(r[2]);
    const shown = day || String(r[2] === undefined || r[2] === null ? '' : r[2]).trim();
    return { source: 'tab', text: String(r[0] || '').trim(), applies_to: String(r[1] || '').trim(), until: shown, until_day: day,
      added_by: String(r[3] || '').trim() };
  }).filter(g => g.text && (!g.until_day || !today || g.until_day >= today));
}

/**
 * The SLRR leads' (GEN.leadership.recipients) emails from the last settings.guidance_email_days days about what to
 * alert or escalate, in the mailbox the bot runs as: [{source: 'email', from, date, subject, text}], newest first.
 * Cached for 30 minutes (ctx.memo). [] when off (settings.guidance_from_email: false) or Gmail can't be read.
 */
function leadGuidanceEmails_(ctx) {
  const S = (ctx && ctx.settings) || {};
  const gmail = ctx && ctx.gmail;
  if (S.guidance_from_email === false || !gmail || typeof gmail.messageSummaries !== 'function') return [];
  const leads = ((GEN.leadership && GEN.leadership.recipients) || []).map(e => String(e || '').trim()).filter(Boolean);
  if (!leads.length) return [];
  try {
    const hit = JSON.parse((ctx.memo && ctx.memo.get('lead_guidance')) || 'null');
    if (hit && ctx.now() - Number(hit.at || 0) < GUIDANCE_EMAIL_CACHE_MS_) return hit.items || [];
  } catch (e) {}
  const days = Math.max(1, Number(S.guidance_email_days) || 7);
  const q = `from:(${leads.join(' OR ')}) newer_than:${days}d ` +
    '(alert OR alerts OR alerting OR escalate OR escalating OR escalation OR escalations OR flag OR flagging)';
  let items;
  try {
    items = gmail.messageSummaries(q, GUIDANCE_EMAIL_MAX_).map(m => ({
      source: 'email', from: m.from, date: m.at ? etDay_(m.at) : '', subject: truncate_(m.subject, 160), text: truncate_(m.snippet, 300),
    }));
  } catch (e) {
    if (ctx.log) ctx.log(`couldn't read the SLRR leads' recent emails for guidance: ${(e && e.message) || e}`);
    return [];
  }
  try { if (ctx.memo) ctx.memo.set('lead_guidance', JSON.stringify({ at: ctx.now(), items })); } catch (e) {}
  return items;
}

function readControl_(sh) {
  const v = sh.getRange(2, 2, 3, 1).getValues();
  const out = parseControl_(v[0][0], v[1][0], v[2][0]);
  const m = sh.getRange(MIRROR_ROW_, 2).getValue();
  out.mirror = String(m === undefined || m === null ? '' : m).trim();
  const ac = sh.getRange(AC_ROW_, 2).getValue();  // blank on a tab from before row 10 existed (help used column A only)
  out.autocorrect = String(ac === undefined || ac === null ? '' : ac).trim();
  out.switches = readSwitches_(sh);  // rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54-56, all OFF on a tab from before them
  // B25, only on the S-F Burson space row itself: blank on a tab from before it (no S-F Burson known: fail closed)
  const sfb = sh.getRange(SFB_ROW_, 1, 1, 2).getValues()[0];
  const sfbValue = String(sfb[1] === undefined || sfb[1] === null ? '' : sfb[1]).trim();
  out.sfBurson = String(sfb[0] || '').trim() === SFB_LABEL_ ? sfbValue : '';
  // B26, only on the Burson test copy row itself (TestCopy.gs): blank on a tab from before it (the Relay as before)
  const rtc = sh.getRange(RTC_ROW_, 1, 1, 2).getValues()[0];
  const rtcValue = String(rtc[1] === undefined || rtc[1] === null ? '' : rtc[1]).trim();
  out.testCopy = String(rtc[0] || '').trim() === RTC_LABEL_ ? rtcValue : '';
  // B30, only on the Testing: send to row itself: blank on a tab from before it (falls back to GEN.email.stand_in)
  const tst = sh.getRange(TESTERS_ROW_, 1, 1, 2).getValues()[0];
  const tstValue = String(tst[1] === undefined || tst[1] === null ? '' : tst[1]).trim();
  out.testers = String(tst[0] || '').trim() === TESTERS_LABEL_ ? tstValue : '';
  // B31, only on the BigQuery lookback row itself: blank on a tab from before it (60 minutes: bqLookbackFrom_). A time
  // cell (0:45) is kept as it is, for bqLookbackFrom_ to read
  const lb = sh.getRange(BQ_LOOKBACK_ROW_, 1, 1, 2).getValues()[0];
  const lbValue = Object.prototype.toString.call(lb[1]) === '[object Date]' ? lb[1]
    : String(lb[1] === undefined || lb[1] === null ? '' : lb[1]).trim();
  out.bqLookback = String(lb[0] || '').trim() === BQ_LOOKBACK_LABEL_ ? lbValue : '';
  // B33, only on the Other alerts space row itself (OtherSpace.gs): blank on a tab from before it (nothing runs there)
  const os = sh.getRange(OS_ROW_, 1, 1, 2).getValues()[0];
  const osValue = String(os[1] === undefined || os[1] === null ? '' : os[1]).trim();
  out.otherSpace = String(os[0] || '').trim() === OS_LABEL_ ? osValue : '';
  // B35, only on the Watch alerts row itself (WatchAlerts.gs): blank on a tab from before it (OFF: nothing is posted)
  const wa = sh.getRange(PW_ALERTS_ROW_, 1, 1, 2).getValues()[0];
  const waValue = String(wa[1] === undefined || wa[1] === null ? '' : wa[1]).trim();
  out.watchAlerts = String(wa[0] || '').trim() === PW_ALERTS_LABEL_ ? waValue : '';
  // B41:B45 and B47, the fast-triage bars (FastTriage.gs): blank on a tab from before them (each uses its seed)
  out.ftBars = readFtBars_(sh);
  return out;
}

/**
 * Writes the bot's side of the Control tab: {bursonNote, analystNote, status, lastCheck, today}. C3:C4 (the two notes)
 * are left as they are only when neither note is given (given one, the other is cleared); B5:B7 (status, last check,
 * today) are always written, so one left out is cleared.
 */
function writeControlStatus_(sh, s) {
  if ('bursonNote' in s || 'analystNote' in s) sh.getRange(3, 3, 2, 1).setValues([[s.bursonNote || ''], [s.analystNote || '']]);
  sh.getRange(5, 2, 3, 1).setValues([[s.status || ''], [s.lastCheck || ''], [s.today || '']]);
}

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------------------------

function parseControl_(on, burson, analyst) {
  return {
    on: on === true || String(on === undefined || on === null ? '' : on).trim().toUpperCase() === 'ON',
    burson: String(burson === undefined || burson === null ? '' : burson).trim(),
    analyst: String(analyst === undefined || analyst === null ? '' : analyst).trim(),
  };
}

function okStatusText_() { return '✅ Working'; }

function pausedStatusText_() { return '⏸ Paused: Bot is OFF. Set it to ON to restart.'; }

function problemStatusText_(e) {
  return `⚠️ ${String((e && e.message) || e).trim()} The bot tries again every minute.`;
}

/**
 * What waits for the S-F Burson space (B25) while it's blank or can't be found: [text], from what the Control tab sets
 * (`wanted`: readControl_) and the Burson space (B3) the run reads (`burson`, when known). Empty: nothing needs it. Pure.
 */
function sfbNeeds_(wanted, burson) {
  const out = [];
  if (String((wanted && wanted.mirror) || MIRROR_TARGET_SPACE || '').trim()) out.push('the Mirror (B9) is paused');
  if (String((wanted && wanted.autocorrect) || '').trim()) out.push('the Auto-correct space (B10) is paused');
  if (wanted && wanted.switches && wanted.switches.relay === true) out.push('the Relay (row 22) is paused');
  if (String((wanted && wanted.testCopy) || '').trim()) out.push('the Burson test copy (B26) is paused');
  if (burson && burson.externalUserAllowed) {
    out.push('nothing is posted or reacted in the Burson space (B3), which people outside Google can join');
  }
  return out;
}

/**
 * Status (B5, without its ⚠️) for an S-F Burson space (B25) that's blank or can't be found (`sfb`: Main.gs
 * sfBursonFor_), with what waits for it (`needs`: sfbNeeds_). Pure.
 */
function sfbProblemText_(sfb, needs) {
  const what = sfb && sfb.blank ? 'S-F Burson space (B25) is blank: paste S-F Burson\'s link there.'
    : `S-F Burson space (B25): ${String((sfb && sfb.error) || 'it can\'t be found.').trim()}`;
  const list = needs || [];
  const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0];
  return joined ? `${what} Until then ${joined}.` : what;
}

/**
 * C9 / C10 while the Mirror or the Auto-correct space waits for the S-F Burson space (B25) (`sfb`: sfBursonFor_; with
 * `direct`, Main.gs's stand-in while the bot works directly in B25: row 32). Pure.
 */
function sfbPausedNote_(sfb) {
  if (sfb && sfb.direct) return `⏸ ${DIRECT_B25_NOT_USED_}`;
  return sfb && !sfb.blank ? '⏸ Paused: it needs the S-F Burson space (B25), which can\'t be found (see C25)'
    : '⏸ Paused: it needs the S-F Burson space (B25), which is blank';
}

/**
 * C3 when the Burson space (B3) is one people outside Google can join and isn't S-F Burson (B25 another space, blank or
 * not found): the bot posts and reacts nothing there. Pure.
 */
function outsideBursonNote_(burson) {
  return `⚠️ ${(burson && (burson.name || burson.id)) || 'This space'}: people outside Google can join it and it isn't ` +
    'the S-F Burson space (B25), so the bot posts nothing there (see Status)';
}

/** B5 (with its ⚠️) when the Burson space (B3) is one people outside Google can join and isn't S-F Burson (B25). */
function outsideBursonStatusText_(burson, sfb) {
  return `⚠️ The Burson space (B3) "${(burson && (burson.name || burson.id)) || ''}" allows people outside Google and ` +
    `isn't the S-F Burson space in B25 ("${(sfb && (sfb.name || sfb.id)) || ''}"), so the bot posts and reacts nothing ` +
    'there. If it is S-F Burson, paste it in B25 too; to test, use a space only Google people can join.';
}

/** Today's counts with this run's report added (a new day starts from zero). */
function bumpStats_(stats, report, day) {
  const s = stats && stats.day === day ? Object.assign({}, stats) : { day, alerts: 0, fix_requests: 0, answers: 0, forwarded: 0 };
  ['alerts', 'fix_requests', 'answers', 'forwarded'].forEach(k => { s[k] = (s[k] || 0) + ((report && report[k]) || 0); });
  return s;
}

/**
 * B7: today's counts. noWait: Never wait on Burson (row 23) is ON, so a wrong alert was corrected and Burson told; OFF
 * (as LIVE), it was sent back to Burson for fixes.
 */
function todayText_(stats, day, noWait) {
  const s = stats && stats.day === day ? stats : null;
  if (!s || !(s.alerts || s.answers || s.forwarded)) return 'No alerts yet today';
  const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const fixed = noWait ? 'corrected (Burson told)' : 'sent back to Burson for fixes';
  return `${n(s.alerts, 'alert', 'alerts')} reviewed · ${n(s.fix_requests, fixed, fixed)} · ` +
    `${n(s.answers, 'question answered', 'questions answered')}`;
}
