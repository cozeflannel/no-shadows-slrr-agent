# Burson QA bot (V1, Apps Script)

The bot does the alert QA that Google analysts do today in **[S-F] Burson Automated Alerts V3**, so analysts can
focus on escalation (Social Alerts, Trust & Safety). It's an Apps Script project that checks the Burson space every
minute, as the account that ran `setup()`. It doesn't use a Chat app or webhooks.

| Situation | In the Burson space | In the analyst space |
|---|---|---|
| Alert is correct | Its action emojis (below); 👍 only while it still waits on a person (legend: "Confirming receipt, no action yet taken") | The alert, exactly as Burson sent it |
| Alert has mistakes | ⬇️, plus a reply in the alert's thread that lists each fix and asks Burson to update and resend | The alert with the fixes applied, in Burson's format, plus a `🤖 QA corrected:` line |
| Something only Burson can supply (for example the link) | Asked for in the thread (with the Auto-find missing links switch ON, a missing link or author is looked up first, and Burson is asked only if it isn't found) | Forwarded, with `🤖 QA: Link missing (requested from Burson)` |
| Gemini thinks something is off but is less than 90% sure | Nothing | Forwarded, with a `🤖 QA check:` line for analysts to double-check |
| Burson resends the fixed alert | ⬇️ on the original ("Addressed on updated post below"); 👍 on the resend only if the alert wasn't actioned yet | Nothing new: analysts already have the corrected alert. A thread note is added only if the resend changed something, such as adding the missing link |
| Resend still has a mistake | A reply in the resend's thread with only what's still wrong | Nothing |
| Burson asks a question or pushes back in an alert's thread | An answer in that thread, with a link to the document the rule comes from (Resources tab) | Nothing |
| "ok, will fix" | Nothing (👍 in the legend is for alerts) | Nothing |
| Alert needs a Social Alert email, while testing (`escalation.stand_in` set, as now) | 📦 and each team's emoji (📰 💬 ⚖️ …) for every distro it would have gone to | Nothing. The bot sends the email itself, as it would live, but only to the stand-in, with a last line naming the distros it would have gone to |
| Alert needs a Social Alert email, with real distros (no stand-in) | 👍 while the draft waits; once it's sent from Gmail, 📦 and each team's emoji, matching who the email actually went to | A draft in Gmail with every team the rules or Gemini picked already on it, and a note with why and who's on it |
| New P0 / Sensitive Topic product failure (escalation protocol) | 🧑‍💻 once the DM went out | Nothing. While testing the DM goes to the stand-in, naming the leads it would have gone to |
| T&S should see it (a person submits the form, unless the Auto-submit T&S form switch is ON) | ✍️ once the "WD Intake Request" confirmation email arrives | A pre-filled T&S form link (see "T&S pre-filled link" below) and the values to enter |
| Alert is correct but doesn't need a Social Alert, or the draft is deleted unsent | ❌ ("No action taken") | ❌ (the reason goes to the run log) |
| A follow-up on a post that already went out as a Social Alert: the author's own reply or thread, anyone's reply under it or quote of it (the bot reads the thread from X's and Bluesky's public data), or the same post alerted again (also when it's in the SLRR alert log from an earlier day) | ❌, with no second email, when Gemini is sure it adds nothing new | ❌ (the run log names the earlier alert). If it adds something (a new incident, new evidence, P0 or a new Sensitive Topic, 2K+ engagements of its own), the update goes out on the earlier email's thread |
| Alert escalated only because the author is a KOF, which Gemini is 90%+ sure needs no Social Alert | ❌, when one of Gemini's no-alert checks holds and the bot can back it up (an earlier alert went out for it or its thread, the leads' current guidance covers it, or the post itself shows a mistake or nothing actionable) | ❌ (the run log gives the check and Gemini's evidence). P0, Sensitive Topic and briefed-topic alerts always go out |
| An analyst disagrees and adds a legend emoji (✍️, 📦, ❌, …) on the forwarded copy | The same emoji appears on Burson's post (👎 never does) | — |
| Zapier sends something the bot can't read | 👍 | Forwarded as received, with a note |

That is the bot with every Control tab switch OFF, as they start. With **Never wait on Burson** ON (row 23), a wrong
alert is processed right away instead, and Burson is told what the bot changed (see "Row 23: Never wait on Burson").

**In S-F Burson itself** (the real Burson space: the one in **S-F Burson space**, B25, on the Control tab), the "In the
Burson space" column is only what the bot *would* do. With **Post in S-F Burson** OFF (row 24, as it starts), none of
it is posted, replied or reacted there; the run log counts what was held back. With it ON, each one waits on the
**Burson outbox** tab until a person sets it to Send (see "Row 24: Post in S-F Burson"). In a test feed or the Mirror
space the bot posts and reacts as the table says. In a Burson space people outside Google can join that isn't the B25
space (or while B25 is blank), nothing is posted, reacted or queued at all: see "S-F Burson space (B25)".

Nothing the bot posts in the Burson space mentions the analyst space, forwarding, escalation, emails, forms, internal
tools or people. Every message bound for Burson, including each Gemini answer, goes through a guard in `Voice.gs`. If
a message trips the guard, the bot sends a fixed, generic one instead. What the Burson outbox sends to S-F Burson goes
through a wider check as well, right before it's sent. The tests check every message the bot posts in a Burson space.

## Managing the bot: the Control tab

Everything day to day happens on the **Control tab** of the bot's Google Sheet, "Burson QA bot". `setup()` creates the
sheet, and its link is in the bot's first message in the analyst space. You don't need the Apps Script editor.

| Cell | What it is | Who changes it |
|---|---|---|
| **Bot** (B2) | `ON` or `OFF`. OFF pauses the bot. When it's back ON, it skips anything posted while it was off | You |
| **Burson space** (B3) | The space where Zapier posts the alerts | You |
| **Analyst space** (B4) | The space the corrected alerts go to | You |
| Column C | ✓ and the name of the space the bot found, or ✗ next to the space to fix | The bot |
| **Status** (B5) | ✅ Working (or `🔴 LIVE · ✅ Working` when LIVE), ⏸ Paused, or ⚠️ followed by what to fix | The bot, every minute |
| **Last check** (B6) | When the bot last ran | The bot, every minute |
| **Today** (B7) | Alerts reviewed, alerts sent back to Burson, questions answered. While the bot works alone in the Auto-correct space (B10 set, B9 blank, B3 or B4 blank): that space's own count, the one C10 shows | The bot |
| **Runs as** (B8) | The account the bot posts as. It must be a member of both spaces | `setup()` |
| **Mirror space**, **Auto-correct space** (B9, B10) | Optional test spaces (below) | You |
| **The switches** (B11:B24, B27:B29, B32, B34, B36:B40, B46, B48:B51, B54:B56) | `ON` or `OFF`, all OFF to start: what the bot may do on its own (below) | You |
| C11:C24, C27:C29, C32, C34, C36:C40, C46, C48:C51, C54:C56 | What each switch does when OFF, or what it is doing when ON (C54: the live dashboard's link, once it is deployed; C56: since when the bot keeps its run log, and what the last listing of Burson's alerts posted while it was OFF found) | The bot, every minute |
| **S-F Burson space** (B25) | Which space is the real Burson space, S-F Burson: its link, id or exact name. Only this cell decides it; the code never names it. Blank to start (see "S-F Burson space (B25)" below) | You |
| C25 | ✓ and the name of the space the bot found, ✗ and what to fix, or ⚠️ Not set and what waits for it | The bot |
| **Burson test copy** (B26) | Optional. A Google-only space to practise the Relay in without touching S-F Burson: the bot copies S-F Burson there, and while it's set the Relay sends the analysts' side (and, with row 24 ON, the bot's own Burson replies and emojis) there instead of S-F Burson. Blank to start (see "Practising the Relay with a Burson test copy" below) | You |
| C26 | ✓ and the name of the space the bot found, ✗ and what to fix, or what blank means | The bot |
| **Testing: send to** (B30) | Up to 5 email addresses (any domain) every email goes to while Testing. Blank: nothing is sent while Testing until an address is entered in B30. C30 shows what the bot made of it | You |
| **Brand safety groups** tab | Read-only worksheet (`Google Group Name`, `Google Group Email`) supplying live Social Alert Google Group addresses at runtime (cached 10 minutes; zero hardcoded emails in code) | You |
| **BigQuery lookback** (B31) | How far back Direct BigQuery alerts (row 15) and the Early wave check (row 19) look: 15, 30, 45 or 60 minutes (blank: 60). C31 shows what the bot is using | You |
| **Other alerts space** (B33) | Optional. A Google-only space with other alerts (a campaign space, say) the bot works every minute beside the Mirror space, always in Testing (see "Other alerts space (B33)" below). C33 shows how it's doing | You |
| **Fast triage bars** (B41:B45, B47) | The six hold-back and early-watch bars for rows 39 and 40 (seeds `0.10`, `0.90`, `0.55`, `0.80`, `3`, and `0.30` in B47; blank or invalid uses its seed). Column C shows what the bot is using | You |
| Rows 52-53 | Left as they are: blank, or your own notes. The bot never writes there (it only clears its own old help text from column A: the help was at row 53 before rows 54 and 55 were switches) | You |
| **How it works** (from A57, right under row 56, the last switch) | A plain-language guide to all of the above | `setup()` and the bot |
| **Watches**, **Watch detections** and **Watch sources** tabs | Only with Proactive watch ON (row 34): what to look for (one watch a row, each ON / OFF), what the watches would have flagged (with its source and a scorecard against Burson's alerts), and which sources are live, stale or failing (see "Proactive watch (row 34)" below) | You edit the watches and rate the rows; the bot writes the rest |
| **Follow-up** tab | Only with Track post-alert outcomes ON (row 21): what came of the bot's Social Alerts, which teams replied, each alert's status and next step, and editable P0/P1/P2 reply deadlines in B5:B7 | The bot updates it; you can edit B5:B7 |
| **Burson outbox** tab | Only with Post in S-F Burson ON (row 24) while LIVE: what the bot or the Relay would post in S-F Burson, each row waiting for you to set it to Send or Skip | The bot adds rows; you set Status |
| **Early Detection** tab | Only with Early wave & velocity check ON (row 19): every story it found and what became of each, one row each (see "The Early Detection tab" below) | The bot writes it; you can sort its rows |
| **When the bot ran** tab | Only with Speed numbers: leave out when the bot was not running ON (row 56): when the bot was running, paused (Bot OFF), failing or not running at all, from the moment row 56 was turned ON (see "When the bot ran (Control row 56)" below) | The bot |
| **Burson while bot OFF** tab | Only with row 56 ON: the Burson alerts posted while Bot (B2) was OFF, listed when Bot was set back ON; never reviewed, posted or emailed | The bot |

**To change a space**, open the space in Google Chat, copy the address bar, and paste it into B3, B4, B25 or B26. The
space's exact name also works. Within a minute, column C shows the space the bot found.

**If something's wrong**, Status says what to fix in plain words. The bot never posts into a space that fails its
checks. It won't use an analyst space that is the same as the Burson space, that is S-F Burson (B25), or that allows
people outside Google.

**The Resources tab is the bot's knowledge base.** Gemini reads every document listed there and uses it the way a
person uses the team's handbook. It shapes the field fixes, the Social Alert call, who gets the alert, and Trust &
Safety, and it answers questions from it. Each row has a **Name**, a **Link**, **What it covers**, **Burson can see
it?** (Yes / No) and a **Bot status** the bot writes:

- **What it reads:** Google Docs and Slides (their text), Google Sheets, text, CSV, Markdown, HTML and JSON files in
  Drive, and public web pages. A Sheets link to **one tab** (it has `#gid=` in it: open the tab and copy the address
  bar) reads only that tab. The KOFs come from one row linked to the KOF spreadsheet's **[SLRR Global INFs]** tab (the
  ~3,000 KOFs being tracked). A link to the whole spreadsheet (Share > Copy link, no `#gid=`) reads every tab. Bot status
  names the tab it read, for example `Google Sheet, tab "[SLRR Global INFs]"`. Up to 1,000,000 characters of each document are kept.
- **What it can't read**, and Bot status says what to do instead: go/ links (paste the full link), PDFs and Word,
  Excel or PowerPoint files (save them as Google Docs, Sheets or Slides first), folders, pages behind a sign-in, and
  Chat links. A document the bot's account can't open says so: share it with that account (Viewer is enough).
- **Staying current:** a new or changed row is read on the next run (within a minute). Every 15 minutes the bot asks
  Drive whether a document changed and reads it again if it did. Web pages are read again every 6 hours, and a
  document it couldn't read is tried again every 30 minutes. The text is kept in the bot's own hidden **Knowledge
  cache (bot)** tab, so an alert never waits on Drive. `refreshKnowledge()` reads them all now.
- **Tabs:** keep the Resources tab named **Resources**; nothing needs renaming. If it is renamed anyway, the bot still
  finds it by its header row (Name · Link · What it covers) and never makes a second one. The bot makes its storage tab
  itself and never reads, clears or writes a tab it didn't make: if a tab people made already has that name, Bot
  status says so and nothing is touched.
- **Who sees what:** every review and analyst answer gets the documents: all of them when they fit, otherwise the
  parts that bear on the alert or question (for example the author's row of a KOF list). **Only rows marked Yes in
  "Burson can see it?" are ever used in answers to Burson or linked for them.** Everything else is internal. The two
  starting documents are Yes; on a tab from before, they're set to Yes once and every other row is left blank
  (internal) until you choose.
- **Order of authority:** the Guidance tab (while a row applies) overrides the documents, and the documents override
  the bot's built-in playbook. Exact product, tag and topic names still come from `config/default_config.yaml`.
- **Evidence:** Gemini names the documents it relied on. They're in the run log (`knowledge used: …`) and in the Alert
  log's `knowledge_used` column. On a KOF alert, a document that says "no Social Alert" can back a ❌ only when
  `kof_no_alert_judgment` is on (it's off): the leads' guidance (Guidance tab or emails) can back one either way.

Reading Docs, Slides and Drive files uses the Drive read-only permission. The first time, open the Apps Script
project, run `refreshKnowledge` and click **Allow**. Until then the bot can't run.

**If the bot keeps failing** (5 runs in a row), it tells analysts in the analyst space, never in the Burson space. It
reminds them every hour while the problem lasts, and says so when it's running again. If **Last check** is more than
10 minutes old, the bot has stopped. Ask the person in **Runs as** to open the Apps Script project and run `setup()`.

**Script properties** (Project Settings in the Apps Script editor) are the bot's own memory: how far it has read,
today's counts, the sheet's id. They aren't settings, and nobody needs to change them. The bot has no on-call names or
other day-to-day values to keep up to date. `setup()` deletes what the old prototype left there (`ONCALL_…`,
`PROCESSED_…`, `CASE_…` and others).

Share the sheet (as Editor) with the people who manage the bot. **Don't share it with Burson.**

### S-F Burson space (B25): which space is the real Burson space

**Right after deploying this version: paste S-F Burson's link in B25.** Row 25 is new and starts blank: the bot adds it
to the Control tab on its next run, with rows 1-24 as they were (no need to run `setup()`). Until someone pastes the
link, the Mirror (B9), Auto-correct (B10) and Relay (row 22) are paused (with B9 set, the bot reviews nothing until
then), and the Burson outbox sends nothing. Pasting it just before deploying works too: on today's tab B25 is an empty
cell beside the help text, and a link pasted there is kept and used from the first run.

Only this cell decides which space is S-F Burson (today **[S-F] Burson Automated Alerts V3**): no space id for it is in
the code, so if something goes off course you can point the bot at another space, or clear the cell, from the sheet.
Paste the space's link, `spaces/…`, the bare id or the space's exact name, as for B3 and B4. C25 shows ✓ and the name
of the space the bot found, or ✗ and what to fix (for example, that the bot's account must be a member of that space).
The bot reads it once a run, and everything about S-F Burson uses it:

- the Mirror (B9), the Auto-correct space (B10) and the Burson test copy (B26) read S-F Burson's alerts there;
- the Relay (row 22) relays with it, and the Burson outbox (row 24) posts only there;
- the bot is **LIVE** only when **Safety valve (row 29)** is `OFF`, **Burson test copy (B26)** is blank, and S-F Burson (B25) is set and found (with alerts coming from it via B3 or Mirror B9);
- the analyst, Mirror, Auto-correct and Burson test copy spaces can never be this space.

**Blank or not found, all of that stops (fail closed).** The Mirror, Auto-correct, Burson test copy and Relay don't run: C9, C10, C26 and C22
say they need B25 (with B9 set the bot works in the Mirror space, so it reviews nothing until B25 is set). The Burson
outbox sends nothing and queues nothing new: rows set to Send wait, and C24 says why. The bot is never live, so every
switch behaves as it does in a test space. Status (B5) shows `⚠️ S-F Burson space (B25) …` with what waits for it, but
only when something needs it (B9, B10 or B26 set, Relay ON, or a Burson space people outside Google can join); otherwise the
bot keeps working in a Google-only test feed as before.

**Whatever B25 says, the bot never posts or reacts itself in a space people outside Google can join.** When the Burson
space (B3) is one and isn't the B25 space (or B25 is blank or can't be found), every post, reply and reaction there is
held back like row 24 OFF: nothing is written or queued, the run log counts it, and C3 and Status say why. The bot
still reads the alerts there, and analysts get them as usual. When B3 is the B25 space, row 24 decides as always (OFF:
withheld; ON: the Burson outbox). As a backstop, `Chat.gs` refuses any write to the B25 space except an outbox row
being sent, and any write to a Burson space people outside Google can join that isn't S-F Burson.

**Changing B25** takes effect on the next run. The Mirror and Auto-correct start from the new space's last 15 minutes, the Burson test copy from then (nothing older),
the Relay starts again (as when it's turned on), and Burson outbox rows queued for the old space are never sent:
they're Blocked, "queued for a different S-F Burson space". Clearing B25 is the quick way to stop everything bound for
S-F Burson: the outbox, Mirror, Auto-correct, Burson test copy and Relay pause, and (as people outside Google can join S-F Burson)
nothing is posted or reacted there.

**To try the bot on another space** (for example a campaign space with its own alert format) while the Mirror space
keeps working S-F Burson's alerts, paste that space in **Other alerts space (B33)** and leave B25 as it is (see "Other
alerts space (B33)" below). To work only that space instead, paste it in B25 and set **Work directly in B25 (row 32)**
ON. When only Google people can join it, the bot works right in it, as in the Mirror space, and stays in Testing (see
"Row 32: Work directly in B25" below). With people outside Google able to join B25, row 32 does nothing and everything
above holds.

### Practising the Relay with a Burson test copy (B26)

To practise the Relay (row 22) end to end without posting in S-F Burson itself, paste a second Google-only space's link in **Burson test copy (B26)**:

1. **Every run**, the bot copies into the test copy (B26) **everything in S-F Burson (B25), in S-F Burson's own order** (an item that can't be copied yet holds back the ones after it, so nothing lands out of order). It starts from the moment a run sees B26 set (or changed): nothing from before then is copied, so the space isn't flooded with a backlog.
   - Zapier's top-level alerts, unchanged;
   - everyone's thread replies (under the matching alert's copy when in its thread), top-level messages and emojis, as `Name (Burson): text` or `Name (Google): text` when the `Relay names` tab says, or `Name: text` while it doesn't. Nothing waits on that tab. The bot's own work never comes over from S-F Burson.
   - Chat stamps each copy with the time it was posted (it can't backdate a message), so the times shown are up to about a minute after S-F Burson's; the order is the same. Each emoji is added by the bot's account, so one several people added shows once. Edits, deletions and removed emojis aren't copied.
2. **With Relay with S-F Burson ON (row 22)** while B26 is set:
   - S-F Burson still comes into the **Mirror space (B9)** the same way (everything, in its own order);
   - the analysts' replies, messages and emojis in the Mirror space go **straight to the Burson test copy (B26)** — under the matching alert's copy, as a new thread, or as an emoji on the matching copy — with their name (`Dana Lee: text`). No **Burson outbox** row is needed and **Post in S-F Burson (row 24)** can stay `OFF`;
   - with **Post in S-F Burson ON (row 24)**, the bot's own Burson-facing replies (asking Burson to fix and resend, answering Burson's questions) and legend emojis in the Mirror space also go straight onto the matching message in the **Burson test copy (B26)** (internal analyst notes never do);
   - **nothing is ever written to or queued for real S-F Burson (B25)** while B26 is set (even if B26 has a configuration error or row 24 is `ON`).
3. **Clear B26** when you finish practising: the copy stops, and (once the **Safety valve**, row 29, is `OFF`) the bot goes **LIVE** and queues both the analysts' side (row 22) and the bot's own Burson replies/emojis (row 24) on the **Burson outbox** tab for S-F Burson.

### Test spaces: Mirror space (B9) and Auto-correct space (B10)

| Cell | What it is | Who changes it |
|---|---|---|
| **Mirror space** (B9) | Optional. A Google-only space where analysts work: live Zapier posts from S-F Burson (B25) are copied there, unchanged, and the bot works them there | You |
| **Auto-correct space** (B10) | Optional. A Google-only test space: live alerts from S-F Burson (B25) are posted there already corrected by the bot (below). Always stays in Testing, even when the main Mirror run is LIVE. C10 shows how it's doing | You |

**Both need the S-F Burson space (B25)**, where they read the live alerts. While it's blank or can't be found, neither
runs: C9 or C10 says it's paused because it needs the S-F Burson space (B25), and Status says what to fix. When B25
changes, each starts from the new space's last 15 minutes.

**The auto-correct space** is a second test beside the Mirror space, which keeps working exactly as before on Burson's
unchanged alerts. Paste a Google-only test space's link in B10 (or run `startAutoCorrect("space link")`). Every minute,
right after the Mirror space's run:

1. The bot reads new Zapier alerts in the live Burson space (S-F Burson, B25). It **only reads** there: it never
   posts, reacts or answers, and it ignores people's messages and thread replies. Its chat client refuses any write to
   that space.
2. It reviews each alert as it does everywhere, then posts the **corrected alert** in the test space, in Burson's own
   format, instead of asking Burson for the fixes. Its first line is the bot's own: `✅ *Reviewed and corrected by the
   agentic assistant* · Original alert` when the note below lists a change (`✅ *Reviewed by the agentic assistant*`
   otherwise), "Original alert" linking to Burson's message in S-F Burson (only its members can open it). Everything
   that reads the alert back skips that line. The post's own picture (its photo, a frame or the cover of its video, what
   a quoted post or link card shows; never the picture its page shows in link previews, never a generated one) goes
   under the alert when the run has a minute left for it.
3. **The write-up.** The review call the alert already gets (no extra call) also writes the summary paragraph, in
   English, at most 600 characters, from everything that call has (the post and its media, Burson's text, the Resources
   documents, the Guidance, earlier alerts, its web search): who posted it and what it says, what Google is said to have
   done, and who the people named are and what outlets say, but that background only when the call came back with web
   sources (`autocorrect_writeup` in the YAML turns it off). The poster's account is kept exactly as Gemini wrote it
   (only links, web addresses with a path and Markdown marks are taken out), and a video timestamp Burson's summary
   gives (`[02:15]`) stays (`See the video at [02:15].`). A write-up that speaks of how the alert was made (the
   listening tools, the bot, this review) is dropped, unless the post or Burson's summary says the same words (a post
   about a chatbot). It takes the place of Burson's summary in the corrected alert (in Burson's place for one when
   Burson's alert has none) and in the Social Alert email (nothing else in the email changes). It's no correction:
   Burson's summary is what the rules read, the Alert log keeps, and the link to the original shows.
4. **The note** in the alert's thread says who changed what:
   ```
   The agentic assistant reviewed this alert and made these changes:
   - Product: Gems to Gemini App
   - Other Google Products: added Search
   ```
   then, each on its own line when it applies: what only Burson can supply (`Not fixed: Burson's alert has no link to
   the post, and the listening feeds had no match`, saying instead why the feeds weren't searched when they weren't:
   `(Auto-find missing links, row 14, is OFF)`, `(the listening feeds weren't searched: this run had no time left for
   it)`, the per-run cap, `(the listening feeds couldn't be searched)`, or that their only match is a post already
   alerted), the Comms / Status Context line, that the post's own media wasn't reviewed, and `Sources: …` (the outlets'
   names, never links) when the write-up has background from the web. The agentic assistant decides: a Gemini value
   it's at least 60% sure of (`autocorrect_min_confidence`; the main flow keeps 90%) is applied and listed, never on a
   field the rules already decided (one they corrected, and a KOF that a KOF list or the listening data's KOF lookup
   confirms), never to blank a value and never on the summary; its call that the alert is an issue already alerted
   counts from 60% too, so the alert takes that issue's name. Below that Burson's value stays (the run log says so),
   with nothing for the reader to double-check. The summary isn't listed. The note's last line says which alert
   requirement the alert met (`*Alert requirements:* …`, see "The one-space setup" below), so every reviewed alert has a
   note: with nothing else to say, the note is that one line. (With the setting `requirement_line` off, there's no note
   when there's nothing to say.)
   A Direct BigQuery or sheet-test card is posted before its review and never edited, so its note starts `The agentic
   assistant reviewed this alert. The card above was posted before the review; the email uses these corrections:`,
   lists only the corrections the email still uses (a sheet test keeps the Test alert tab's product, tag, issue name
   and count) and the write-up as `- Summary: …`.
5. It works the alert there as an IM would: the legend emojis, the Social Alert email (always in Testing, so only to the stand-in; its subject starts with `[Auto-correct test]`, so you can tell it from the Mirror space's), the pre-filled
   T&S test-form link in the alert's thread, the 🧑‍💻 escalation-protocol ping (to the stand-in), and answers to questions asked there.
6. When the IMs in the live space ask Burson for fixes and Burson resends, the resend counts as the same alert: nothing
   new is posted unless the priority or engagement went up. A resend with a value the alert lacks gets a note
   `Burson resent this alert. These values are not in the alert above:` (the bot never edits a message it posted).

C10 shows its status and today's counts (alerts, corrected: the alerts whose note lists a change, Social Alerts sent,
questions answered). Its records are
kept apart from the Mirror's (its rows in the Alert log end in "(auto-correct)"), so the Results tab can compare the
two. Clear B10 (or run `stopAutoCorrect()`) to stop it. It refuses S-F Burson (B25), a space people outside Google can
join, and a space the bot already posts in.

### The one-space setup: stories first, notes under cards, and the Alert requirements line

In the one-space setup the Auto-correct space (B10) works alone (B9 blank, and B3 or B4 blank): everything the bot
does is posted there, and S-F Burson (B25) is only read. What this section describes happens only in the Auto-correct
space. It never shows in the Mirror space, a test feed, the Other alerts space (B33), S-F Burson or the Burson test
copy, and nothing of it is emailed except the Social Alerts the rules call for (to the testers in B30). Each part has a
setting that turns it off (see "Settings" below).

**What you see for each case:**

| Case | In the Auto-correct space |
|---|---|
| An alert that meets an alert requirement | Its review note ends `*Alert requirements:* met for a Social Alert: P0 exposure tag (Product - Perceived bias).`, and the Social Alert goes to the testers |
| An alert that doesn't | Its review note ends `*Alert requirements:* not met for a Social Alert (a P2 tag needs 2,000+ engagements, a KOF author or a Sensitive Topic; this post: 620 engagements, no KOF author). Monitoring only.` (or `No Social Alert; a T&S form is asked for below.`) |
| A story that passes its review | A `🚨 *EARLY DETECTION* · New story` card. Its review note says `*Alert requirements:* not met yet (small accounts, no KOF author, no P0 tag). Posted early because 6 accounts tell the same story.` (or that it is met) |
| A story whose main post already has a card | When that card's Social Alert went out: no story card, and one `🔗 *Part of a story:* …` note under that card. When it didn't: the story is reviewed as usual; a card it gets has a `*Related alert:*` line in its review note, and a `🔗 *Part of a story:* …` note under the other card points at it |
| A story that repeats an alert that went out | No story card and no email: one `🔗 *Part of a story:* …` note under that alert's card |
| A watch flag on a post that already has a card | No Watch alert: one `🔭 *Also flagged by the watch “…”.*` note under that card |
| A Direct BigQuery card whose post is in a story card | One `🔗 *Part of a story:* … (story card)` note under the BigQuery card |
| A story let go or never reviewed | Nothing in the space: it is counted on C19 and has its row on the Early Detection tab |
| A watch flag that isn't posted | Nothing in the space: it is counted on C35, has its row on the Watch detections tab, and one line in the run log says why |

**Every post of a story card, once the Watch reads the AMIE table** (Control row 50, step 3b of the new sources, and the
setting `early_detection_claim_members`). Until then a post a story card links, other than its main post, is no post's
own alert anywhere: it can get its own Direct BigQuery card or Watch alert, with the `🔗 *Part of a story:*` note. While
row 50 is ON, every post a story card links (an update's new posts too) is remembered as that card's, as its main post
is, so the Watch and the Direct BigQuery poll treat each one exactly as the main post: a story card that went out as a
Social Alert is the alert on each of them (no Watch alert, no Direct BigQuery card of their own); one that sent no
Social Alert leaves them their own cards where stories go first, and elsewhere counts as the alert on each.

**The card's header is not the decision.** A corrected Burson alert and a Direct BigQuery card keep Burson's own
format, header included, so a card can read `🚨THIS ALERT MEETS P0 CRITERIA🚨` or `🟨SOCIAL ALERT🟨` while the line under
it says `not met`. The `Alert requirements` line is what the bot did. On an ongoing issue whose author is not a KOF,
only 2,000+ engagements can send a Social Alert, so that line names only the engagements, never the P0 tag.

**Stories go first** (setting `early_detection_first`). In the one-space setup each run does the Early Detection check
and its reviews (row 19) before the Direct BigQuery poll (row 15). When the poll's last check started 10 minutes ago or
more (or there was none), the poll goes first in that run, so it still runs about every 10 to 15 minutes however many
stories wait. What it changes:

- Expect fewer Direct BigQuery cards in the busiest hours: a model at 20 Burson alerts an hour gave 11 instead of 31 in
  four hours.
- A story card that sent no Social Alert doesn't stop the post's own Direct BigQuery card, and doesn't make it an
  ongoing issue: that card gets the Social Alert it earns on its own, as a new issue, also below 2,000 engagements (a P0
  exposure tag, say). A Burson alert on a post that is already a story's main post is still an ongoing issue.
- The same for a watch flag: when the post's only card is a story card that sent no Social Alert, the flag goes out as
  its own Watch alert, reviewed for its own Social Alert, with one `🔗 *Part of a story:* …` note under it that points
  at the story card. A story card that sent no Social Alert never gets the watch's `this card already covers the post`
  note.

With the setting off, the poll goes first, and a story card stops the post's own BigQuery card and closes a watch flag
on its post, as before.

**One issue, one Social Alert email** (setting `cross_alert_notes`). A story card and a post's own card (a Direct
BigQuery card or a Watch alert) are the same issue when the story includes that post, even when they name the issue
differently. Whichever sent its Social Alert first is the alert of record. The other sends no new email: nothing (it is
a repeat), or, when it raises the stakes (a P0 tag, 2,000+ engagements), an update on the first email's thread. A card
that sent no Social Alert never counts. A story that ends this way gets no card: when the first alert's card is in the
space, a `🔗 *Part of a story:* …` note goes under it instead. With the setting off, the two send two emails, as before.

**Notes under cards** (setting `cross_alert_notes`, except the requirement line's). The alert types point at each other
with short notes in a card's thread. Each is the bot's own message: the bot never answers it, and nothing that starts
like one is ever relayed or queued for S-F Burson (see row 22).

| Note | Posted by | Under which card |
|---|---|---|
| `🔗 *Part of a story:* 5 small accounts on X and Reddit now tell it: “Pixel owners say the update drains the battery” (post · post · post)` | Early Detection | The card of an alert that went out as a Social Alert, when a story's main post is that alert's post, or when a story's review finds it repeats that alert (one of its posts, or its issue). The story gets no review or card of its own. The same story adds another note only once it has twice the accounts and 3 more |
| `🔗 *Part of a story:* 5 small accounts on X and Reddit tell it (story card)` | Early Detection, the Direct BigQuery poll and the Watch | Another alert's card that sent no Social Alert, when a story card is posted for its post; a new Direct BigQuery card whose post is in a story card of the last 24 hours (posted with 45 seconds of the run left; a card that missed it gets it at a later check within its first hour); a Watch alert whose post's only card is a story card that sent no Social Alert (posted right after the alert; an alert that missed it gets it within its first hour, the next time the watch posts flags). "story card" is a link to the story's card |
| `🔭 *Also flagged by the watch “Midterms 2026 × Google”.* No separate Watch alert: this card already covers the post.` | The Watch | A card that already covers the post the watch flagged (Burson's corrected alert, a Direct BigQuery card, a story card that sent its Social Alert, another Watch alert). Once a card: up to 3 watch names when they flag the post in the same run. When the card is only minutes old and not yet in the Alert log, the flag waits a run for it |
| `🔗 *Same story: 2 more posts*` | The Watch | Its own Watch alert, for each later post on the alert's story (at most 6 such replies a run; the rest wait for the next run) |
| `*Alert requirements, final:* …` | The review | The alert where what was done differs from what its `Alert requirements` line said, or where the line in its thread is an earlier attempt's and says otherwise |

A story card's review note (the reply under the card) can also end with `*Related alert:* its main post already has a
card (QA-1001 · BigQuery · BSIP, 8:08 AM ET)`, linked to that card. It is in the review note, not on the card: the bot
reads the cards in the space for the posts waiting there, and would take that link for the post's own.

The caps: at most **3 notes under one card in its life** and **6 notes in one run**, of all kinds together. Two are
outside the caps, never refused by them and using no slot: the `Alert requirements, final:` line and the watch's `Same
story` reply. The review's own note (with its `Alert requirements` line) is no extra note and isn't counted. When a cap
or the run's time stops a note, nothing is posted: only the counts move (C19, C35) and the run log says so. A story
whose note couldn't be posted ends "Its main post already has an alert" or "Seen before, nothing new" instead. The
watch's `Same story` replies stop only when the note can never go up (the card is gone, its thread can't be read, or
it is no longer in the Auto-correct space); then later flags on that story are counted on C35 as repeats of an alerted story. A run asks Chat
at most 12 times about the notes already under its cards, and a note that would need asking waits when less than 20
seconds of the run are left.

**The Alert requirements line** (setting `requirement_line`). Under every alert the bot reviews in the Auto-correct
space, one line says whether the alert met a requirement for a Social Alert, which one, and what the bot did. It words
the decision the review already made; nothing is decided twice. Under Burson's corrected alert, a Direct BigQuery card
and a Test alert card it is the last line of the review's note (the whole note when nothing else changed). Under a
Watch alert and an Early Detection card it stands in the triage or review note where the "SLRR" line used to be (the
Alert log keeps the old words). It is never on the card itself, in an email or in the T&S form. Its forms:

- `*Alert requirements:* met for a Social Alert: P0 exposure tag (Product - Perceived bias).` The reason can also be a
  Sensitive Topic (`Sensitive Topic (Child Safety)`), a KOF author with the list's name (`KOF author (Viral KOFs)`) or
  the engagements (`2,400 engagements (2,000+ needed)`). While B30 is blank it adds `Its email waits for a test
  recipient in Control B30.`
- `*Alert requirements:* met for a Social Alert (2,400 engagements), but none was sent: a repeat of QA-1001.` Other
  reasons: the review says "…", YouTube is the subject, `emails are off in this run (a dry run)`, the other flow
  already sent it, a person has to check a count or a tag.
- `*Alert requirements:* not met for a Social Alert (a P2 tag needs 2,000+ engagements, a KOF author or a Sensitive
  Topic; this post: 620 engagements, no KOF author). Monitoring only.` Other causes in the bracket: an ongoing issue
  whose author isn't a KOF, an exclusion, a Sensitive Topic the rules don't count (`its Sensitive Topic (Privacy)
  restates the exposure tag and does not count`). When a T&S form follows, the line ends `No Social Alert; a T&S form
  is asked for below.` (with Auto-submit T&S form ON, `the T&S form is handled below.`; while the alert waits on Burson
  for a missing link, `a T&S form follows once Burson adds what is missing.`). When a person is to check the alert
  first, it ends `A person checks it: …` instead of `Monitoring only.`
- `*Alert requirements:* not met yet (small accounts, no KOF author, no P0 tag). Posted early because 5 accounts tell
  the same story.` (a story or build-up card)
- `*Alert requirements:* below the Social Alert thresholds (…). A Social Alert goes out anyway on the review's call.`
  (or `on the watch's call`, for a Watch alert the watch itself sends; for a test alert from the Test alert tab:
  `A Social Alert goes out anyway: a test alert from the Test alert tab always sends one.`)

When the Social Alert then goes another way than the line said, a second short note follows:
`*Alert requirements, final:* …`. When the review's own note is very long, the text above the line is shortened, so
the line always shows whole. The line never says "SLRR", and the only number it gives as a requirement is the 2,000
engagements of the rules (never the 500 or 100 a listening feed collects from). You can ask the bot a question that
starts `Alert requirements` and ends with a question mark, even from the account the bot runs as: it is answered,
with the line on or off. In the Auto-correct space the BSIP card's `[KOF]` line follows the same setting (see "Row 15: Direct
BigQuery alerts").

### Other alerts space (B33): another space, beside the Mirror

To have the bot work a second space at the same time as the Burson side, for example a campaign space where a
monitoring tool posts `🚨 X Alert: 2026 Midterm Elections / Civics - Negative 🚨` alerts, paste that space's link in
**Other alerts space (B33)**. B25 stays S-F Burson, so Zapier's alerts keep coming into the Mirror space (and the Relay,
the Burson test copy and the Burson outbox) exactly as before. Every minute, right after the main run (`OtherSpace.gs`):

- **It works that space directly**, as row 32 works B25: an alert in another format gets its own triage (see "Alerts
  in other formats" under row 32), with its note in the alert's thread and 👍, ❌ or a Social Alert; an alert in
  Burson's format gets the usual review; a question in an alert's thread gets the analysts' answer there.
- **Always 🧪 Testing, even while the bot is LIVE:** every email goes only to the testers in B30 (blank: the stand-in),
  with its subject starting `[Other alerts space]`; the T&S form is the test copy, and the 🧑‍💻 escalation-protocol message
  goes only to the testers.
- **Nothing from it reaches S-F Burson:** not the space itself, the Burson test copy or the Burson outbox, whatever rows
  22 and 24 say. Its name and id are on the leak guards of what goes to S-F Burson.
- **Kept apart:** its rows in the Alert log end in "(other alerts)". The Results, Follow-up and Analysis tabs leave them
  out (they compare the bot with the IMs on Burson's alerts), Write back to SLRR BigQuery (row 16) never writes them, and
  Direct BigQuery alerts (row 15) and the Early wave check (row 19) never post there.
- **Its own time:** up to 150 seconds of each run, after the main run. On a busy minute its alerts wait for the next
  run; none is skipped.

C33 shows `✓ <space> · 🧪 Testing ·` and today's counts (alerts, how many were in other formats, Social Alerts to the
testers, questions answered), or ✗ and what to fix. It starts from the space's last 15 minutes (after a pause, from a
minute ago, as the main run does), and its problems never change the main Status (B5). It refuses the space in B25, a
space people outside Google can join, and a space in B9, B10 or B26 or that the main run already works in (B3, B4); the
space in the other cell keeps working. Clear B33 to stop it.

### Proactive watch (row 34): spotting issues before Burson does

Burson's alerts reach S-F Burson a median of about 5 hours after the post went live. Pendulum's live feed in BigQuery
(`sonar_raw`) saw 54% of the posts Burson alerted on from Oct 19 to 30, 88% of those before Burson did, a median 2.5
hours sooner. The Proactive watch tries to turn that head start into early warnings, and casts a wider net with every
other feed the bot can read. With row 34 `ON` (`ProactiveWatch.gs`, OFF to start like every switch), every 5 minutes,
after the other spaces:

- **What's new in every source, read-only.** Each source is queried where it already is; no table, view or pipeline is
  made (a script's temporary table is gone when the script ends). BigQuery reads one location a job, so a look is two
  jobs:

  | Source | Location | What it adds | How fresh |
  |---|---|---|---|
  | Sonar (`bsip-s-bsip-gg-26-2cf3.google_bg.sonar_raw`) | us-central1 | The posts Pendulum first saw since the last look (none it saw in the 24 hours before), posted within 24 hours, with a risk smart tag, from accounts with 1,000+ followers or 100+ engagements (~4,200 a day); plus what wasn't noticeable at first: posts that were small when first seen and grew past that floor later (~90 a day), and posts already checked that broke out (10x the engagements, 1,000+; ~165 a day), both posted within 72 hours. Breakouts first, then the biggest accounts, 150 a look at most | Current to the minute |
  | Tubular (`google_tubular_mentions.tubular_videos`) | us-central1 | Videos that mention Google (YouTube, Instagram, Facebook, TikTok), each run's new ones, posted within 72 hours (1,000+ followers, 100+ engagements or 10K+ views), 60 a look, the most viewed first | A run every few hours; it finds a video a median ~39 hours after it went up |
  | Brandwatch mentions (`raw_data.brandwatch_raw_mentions_base`) | US | Brandwatch's mentions of Google's products (`Google Search`, `Google AI`, `Google Cloud`, `Gemini`, `Google Pixel`, `Google Glasses`, `Googlebook`) on Reddit, Bluesky, Facebook and Instagram that Brandwatch rates negative and tags with an SLRR exposure tag: English, no shares, 1,000+ reach or 100+ engagements, posted within 72 hours, each mention once, the biggest first, 60 a look (a bigger batch over the next looks) and 1,000 a day at most (X comes from Sonar; YouTube and TikTok from Tubular and Sonar) | Loaded in a nightly batch (1–6 days after posting); read when the table changes |
  | Sprinklr owned posts (`reporting_data.sprinklr_outbound_reporting`) | US | Google's own posts in English from the last 72 hours whose comments turned negative (25+ negative comments, or 30%+ negative once there are 20+), on X, Reddit, Bluesky, Facebook, Instagram, YouTube and TikTok, 40 a look, the most negative first | Loaded once a day (~10 AM ET); read when the table changes |
  | Sprinklr comments (`reporting_data.sprinklr_inbound_comments`) | US | Comments on Google's own posts: a post whose negative comments reach 5 within an hour, or a negative comment from a 100K+ account | A median ~22 minutes after the comment |
  | DSD story selection (`DSD.DSD-story-selection`) | US | Brandwatch's HIGH and KOF alert emails about Google, one row a post (the DSD desk's story pool, ~42 a day): posted within 72 hours, with text; no reach floor, since Brandwatch's alert already picked them. KOF first, 40 a look | Every ~30 minutes; a median ~2.4 hours after posting |
  | Other alerts space (the Alert log) | US (a query parameter) | The Brandwatch alerts (and other tools' alerts) posted in the Other alerts space (B33, e.g. Midterms 2026), as the bot read them | As they're posted |
  | Brandwatch: 2026 Election Alerts (Brandwatch's API: project 1998344909, query 2004167929) | US (a query parameter) | What Brandwatch added to the query since the last look (an hour back on a first look, 6 hours at most), posted within 72 hours, the newest added first (100 a page, 3 pages a look at most). Read with the shared token slrr-campaigns keeps in Secret Manager (`slrr-campaigns-bw-token`, read each look; never kept, logged or written). Brandwatch's API gives X posts without their text, author or link (X's licensing; about half of this query), so the bot reads those from X's public embed data (60 a look, the biggest accounts first); an X post X won't show is counted as not sent. 100 a look | Usually minutes after posting |

  Dropped Nov 1 as stale (no new rows): the daily Brandwatch export, DSD content vectors and Reddit Pulse. Dropped Nov 11
  (not on the approved table list): the AMIE table (Brandwatch's alert mentions) and Sprinklr's older outbound media export. A Watch sources tab
  made before then loses their rows at its next update. The owner approved the AMIE table (Brandwatch's alert feeds)
  again on 16 November 2026: since then Early Detection reads it, behind Control row 48 (the Watch does not read it yet).

  Each source keeps its own place: Sonar and the comments go by the look's window; the others start after the newest
  item they last handed over (on a first look: an hour for the Other alerts space and the Brandwatch query, 2 hours for
  DSD story selection and Brandwatch mentions, 24 to 30 hours for Tubular and Sprinklr owned posts), so a feed that
  stops and starts again counts again at once.
  Each source runs in a block of its own: one that fails is noted and the others carry on.
- **Gemini, inside BigQuery.** For each watch ON on the **Watches** tab (up to 5), `AI.IF` answers the watch's yes/no
  question for each post (the same post from two sources once, the first to hand it over); for the posts that match,
  `AI.SCORE` scores how likely it is to become a brand-safety issue in the next 6 hours (1-10, by the watch's rubric) and
  `AI.CLASSIFY` picks its topic. They use the script's own cloud-platform token (end-user credentials): no connection or
  new permission. X posts are judged at first sight (on the post and the author's reach): waiting for 100+ engagements
  in Sonar leaves only ~5 minutes' lead on X, against hours on Instagram, TikTok and YouTube.
- **Sent now, collected later.** Each job goes out in one run and is collected in a later one, so it never holds a run
  up. A failed job is tried again from the same start at the next look, the other location carrying on; after 3 tries
  its window is skipped (the execution log says so), so one bad window never stops it. A job still running after 4 minutes is
  cancelled and counts as a try. After a pause or a gap it looks only at the last 15 to 30 minutes.
- **Recorded, and posted only where you say.** Each post at or above a watch's bar (Flag at score, 7 to start), and each near miss
  (within 2 of it, to tune the bar), goes on the **Watch detections** tab once a watch: when its source had it (never
  before the look's window: a late feed can't claim a lead it couldn't have had), the watch, the score, the topic, the
  post, its **source** (and why it was asked about when that isn't the usual: `Sonar · grew`, `Sonar · broke out`,
  `Brandwatch mentions · negative`, `Sprinklr owned posts · negative comments`), network, author, followers and engagements, the source's issue or query (Pendulum's issue name,
  the Brandwatch query, the subreddit...) and whether it's a new issue, its summary, and a **Rating** column for you
  (Useful or Noise). With **Watch alerts** (row 35) OFF, as it starts, nothing is posted in any space or emailed; nothing
  is ever written to BigQuery.
- **The scorecard** (the top of the Watch detections tab, every 10 minutes and right after new rows): for each of the
  last 7 days, Burson's alerts (the posts in the Alert log that reached S-F Burson that day; never one the bot took from
  BigQuery or an Other alerts space's), how many a watch caught at its bar, how many before Burson's alert and the
  median lead in minutes, the flags and near misses, and your ratings; then the 7-day total. Each row gets "Burson
  alerted" and its lead over Burson once Burson alerts on the same post.
- **The Watch sources tab**: one row a source: what it adds, the table it reads, its status (live; stale when its table
  hasn't changed for longer than it usually goes; an error at its last look (that source's own part); failing, when its
  whole look fails: `⚠️ failing: the look at Sonar and Tubular has failed since Oct 14, 8:08 AM EDT: BigQuery refused
  access (a permission is missing) (tried again at the next look)`, until a look works again; waiting for its first
  look), when its table last changed (read free
  from the dataset's `__TABLES__`), the newest item it handed over, what was new and what Gemini checked at the last
  look and why (for example `new 27, grew 3, broke out 2`), and today's checked and flagged.

The **Watches** tab starts with two watches, both `OFF`: **Midterms 2026 × Google** (posts tying Search, AI Overviews,
Gemini, YouTube, Android, Waymo, Google ads or Google's executives to the 2026 midterms: election info, political ads,
bias, censorship or interference claims, election misinformation, election-day failures) and **Google brand safety
(all)**. Set a watch's On to `ON`, edit its question, rubric, topics, bar or networks (`X, Instagram`; blank: all), or
add your own rows; the bot writes only its Status column. The three tabs are made the first time row 34 is ON; a
Watches or Watch detections tab that the bot didn't make is never read or written (C34 says to rename it), and a Watch
sources tab it didn't make is left alone. C34 shows the last look (new posts, flagged), today's flags and near misses,
and the sources (live, stale, failing). When a whole look fails (BigQuery refuses it, the query errors, or it runs
longer than 4 minutes), C34 says so in every note until that look works again, and that sentence usually takes the
sources' place: `… · last look Oct 14, 8:48 AM EDT: 0 new posts, 0 flagged · ⚠️ the look at Sonar and Tubular has
failed since Oct 14, 8:08 AM EDT: BigQuery refused access (a permission is missing) · today: 0 flagged, 0 near misses`.
The other look is named `Brandwatch mentions and 5 more`; when both fail it reads `the looks at all 8 sources have
failed since …`. The reason is in plain words and cut to fit; BigQuery's own error text is only in the run log. The
numbers after "last look" are then those of the look that works. The Watches tab's Status keeps `✓ watched` and the
time of the last look that worked. A look reads about 0.4 GB (Sonar's ~0.33 GB most of it; Sprinklr's export adds
~0.2 GB the first time and when it changes); BigQuery refuses a job that would read more than 5 GB. Both jobs are
labeled `purpose: proactive-watch` (`lane: c1` or `us`).

### Watch alerts (row 35): the watch's flags as alerts

B35 says where the Proactive watch's flags go (a dropdown; `OFF` to start, and only a person changes it):

| B35 | What happens |
|---|---|
| `OFF` | The watch only lists its flags on the Watch detections tab (as above) |
| `Other alerts space (B33)` | Posted in the space in B33, a space of their own. To move them, paste another space in B33: the next ones go there. Always Testing there |
| `Mirror space (B9)` | Posted in the Mirror space, beside Burson's alerts. The Mirror and the Relay work exactly as before, and nothing the bot posts is ever passed on to S-F Burson |
| `Auto-correct space (B10)` | Posted in the Auto-correct space and worked there. Always Testing there |

**Not every flag is an alert.** Before anything is posted, one Gemini pre-read of the waiting flags (up to 12 a run)
writes each card's summary and its Product, Exposure Tag and Sensitive Topic lines, says which flags tell the same
story, and compares them with the alerts posted lately, the small posts still waiting, and the stories already alerted.
For the Auto-correct space (B10), the pre-read searches the web (the review's search, `settings.web_grounding`) when
the run has 90 seconds left for it (else it reads the flags without the search), and its summary is the card's
write-up, in English, no links, at most 600 characters: who posted it and what the post claims, specific (its key
words quoted when short), what Google or its product is said to have done (or that the post doesn't say), then who the
post names ("Lula, Brazil's president") and what news outlets say about the claim. That background comes only from the
search: the bot keeps it only when Gemini's answer came back with web sources, so with no search, nothing found, or the
search refused, the card has the summary alone. Gemini is told never to identify a private individual. For the other
spaces the pre-read is as it always was: no search, a neutral summary of what the account posted.
Then, story by story:

| The flag | What happens |
|---|---|
| Matters by itself: a KOF author (from the listening data), 100+ engagements, or a P0 exposure tag | Posted as an alert of its own. A post the pre-read judged a passing mention or a bare link needs a KOF author or 2,000+ engagements |
| Small (none of those) | Not posted. It waits on the Watch detections tab. Once **3 accounts** tell the same story within **12 hours** (two posts from one account count once), they go out together as **one** alert: the newest post leads, its card has a `Building:` line, and the other posts are listed in its thread. One that never gets company stays on the tab, unposted |
| Small, then it grows | When a source hands the post over again with 100+ engagements, it is queued again and goes out as an alert of its own |
| On the story of a watch alert posted in the same space in the last 24 hours | Added to that alert's thread, not posted again. A KOF author where the alert had none, or 2,000+ engagements where the alert had fewer, is posted as a new alert |
| On a story already alerted in the last 14 days (any flow: Burson's alerts, Direct BigQuery alerts, another space) | Not posted again, unless the stakes rose (as above) or the pre-read says the post reports something new (a ruling, an official response, new evidence) |
| Not about Google (the pre-read), with no Google product from the listening tool | Not posted, unless a KOF wrote it or it has 2,000+ engagements |
| The same post or X thread already alerted, a post not in English, or nothing to show (no summary, text or picture) | Not posted (in the Auto-correct space, a flag that matters by itself still goes, as its link and Activity line) |

The thresholds are SLRR's own: 100 engagements is the collection floor, 2,000 the high-engagement bar, 14 days the
novelty window. Follower count alone never makes a post an alert: in two days of live Watch alerts (Nov 10 to 12, 2026)
it didn't predict which cards were useful.

Each alert is a text message in the bot's own card (the one the Early Detection alerts use too, see "The bot's own
alert card" below), so it never looks like a Zapier alert, with the post's picture attached when one can be found
(see "Pictures under the bot's own cards" below); in the Auto-correct space, a card without one shows the post's first
words on a `*Post:*` line, unless its summary quotes them already:

```
🔭 *WATCH* · Midterms 2026 × Google
*Product:* Search, AI Overviews
*Exposure Tag:* Product - Perceived bias (P0)
*Sensitive Topic:* Politics
*KOF:* Yes (Viral KOFs)

*What's happening:* … (the pre-read's summary, its write-up in the Auto-correct space, else the watch's own)
*Post:* "…"                                    (Auto-correct space, no picture of the post: its first 200 characters)
*Activity:* @someone · X · 1,700 followers · 520 engagements · posted 2026-11-01 23:26 ET
*Building:* 4 small posts from 3 accounts within 2 hours (X, Reddit) · 57 engagements in all
*Posts:* View the post on X                    (a hyperlink)
*Same story:* 3 more posts in the thread (@a, @b, @c)
```

#### The bot's own alert card

People see two cards in a space the bot works: Burson's alert in Burson's own format (corrected by the bot in the
Auto-correct space), and the bot's own alert card. The bot's card is one layout for its four kinds of alert, told apart
by the first line (`OWN_CARD_TYPES_` in `Alert.gs`):

| First line | Kind |
|---|---|
| `🚨 *EARLY DETECTION* · New story` | A story at the usual bar (row 19) |
| `⚡ *EARLY SIGNAL* · 3 accounts so far (a story is usually flagged at 5)` | A story flagged below the usual bar (rows 38 and 39) |
| `📈 *UPDATE* · More on a story already alerted` | More on a story that already has a card, in that card's thread |
| `🔭 *WATCH* · <the watch's name>` | A Proactive watch flag (rows 34 and 35) |

Under the first line the lines always come in the same order, and a line a kind doesn't have is left out, never shown
empty: the headline, `*What's new:*` (an update), `*Product:*`, `*Exposure Tag:*`, `*Sensitive Topic:*`, `*KOF:*`, a
blank line, `*What's happening:*`, `*Post:*` (the post's first words, on a card in the Auto-correct space with no
picture of the post that quotes none of its words), `*Web:*`, `*Call:*`, `*Activity:*`, `*Building:*`, `*Next steps:*`
(numbered), `*Posts:*`, `*Same story:*`. A Watch alert is posted before its triage, so it has no headline, Call or Next
steps (its triage is the note in its thread). Cards posted before this layout (`🚨 *Early Detection Alert* 🚨`,
`🔭 *Watch alert · …*`) are still read as the bot's own.

**Pictures under the bot's own cards.** A Watch alert, a Direct BigQuery card and an Early Detection story card get
the post's picture: its photo, its video's frame, a video's thumbnail or cover, or what it shows from a post it quotes
or its link card, else the picture the post's page shows link previews (`alertPicture_` in `Post.gs`). The bot never
makes a picture. In the Auto-correct space (B10) they get only the post's own imagery, never the page's picture (it
can be a site's generic image), and with none, a Watch alert and a story card show the post's first 200 characters on
a `*Post:*` line instead, when the bot has its words (a Watch alert: what the post's lookup gives, for X, Bluesky,
TikTok and Instagram; a story card: the signal's own posts), unless the card quotes the post already (a Watch alert
whose summary is the post's own words, the plain story card from the posts) or it is an update (its first card shows
the post). A Direct BigQuery card is in Burson's format, so it gets no such line (a `Post:` line there would be read back as
the post's content in place of its summary); its DSD / Brandwatch and Sprinklr summaries quote the post already. The
corrected alert in the Auto-correct space follows the same picture rule (see "The auto-correct space").

The `Building:` line is only on an alert for a build-up of small posts, and `Same story:` only when other posts are
listed in its thread. The score, the watch's bar and topic and the source that found the post stay off the message; the
triage gets them from the bot's own record. On a Watch alert the post's link is the card's only hyperlink: the summary
(which can be the post's own words), the author, the network and the posted time are written as plain words, without
Chat's link marks (`<`, `>`, `|`) and with a Markdown link (`[words](address)`) opened up (`[words] (address)`), on
every line but `*Posts:*` and in the same-story reply in the thread too, so link markup in a post can't put a link of
its own on the card. The next run reads the post's link from the card's own `*Posts:*` line, so the triage and the
Social Alert are always about the post itself. The Early Detection cards open up a Markdown link in the same way: their
links are only the signal's posts and the web sources.

The space's flow works the alert on its next run (a minute later) with a full Gemini triage: ❌ No action, 👍 Worth a
look, or a Social Alert to the right teams (only the testers while Testing, as for any alert), and T&S only when the
post's rules say so. For a build-up, the triage is told to judge the story and its momentum, not the one post's
engagement. Its Alert-log row says `Watch alert`: never on the Results tab, never written to the SLRR tables.

At most 5 go out a run in B33 and 2 in the Mirror or Auto-correct space (the flags that matter by themselves first, then
the highest scores; none while that space's flow ran out of time). If the pre-read fails, flags wait up to 30 minutes
for it, then go by the listening tool's own classification. A flag that can't go out within 3 hours (B33 blank, say) is
dropped, never posted late, and only flags seen while B35 is set ever go out. A post two watches flag gets one alert.

In the Auto-correct space (setting `cross_alert_notes`), a flag on a post that already has a card there (Burson's
corrected alert, a Direct BigQuery card, a story card that sent its Social Alert, another Watch alert) gets no Watch
alert: one `🔭 *Also flagged by the watch “…”.*` note goes under that card instead, and a post whose only card is a
story card that sent no Social Alert gets a Watch alert of its own (see "The one-space setup" above).

C35 says where they go, then today's counts, then what the watch posts (that explanation is shortened or left out when
the cell gets long; a count never is), for example `✓ <the space's name> (B10) · today: 2 posted, +1 in
their story's thread, 2 small held to be grouped, 2 on a post that already had an alert, 1 dropped after waiting 3
hours · a flag that matters by itself …`. Each count shows only when it is above zero (`posted` always shows):

| Count | What it is |
|---|---|
| `N posted (M a build-up of small posts)` | Watch alerts posted today, and how many of them were a build-up |
| `+N in their story's thread` | Flags added to an earlier Watch alert's thread (`Same story`) |
| `N small held to be grouped` | Small flags held today that are still waiting for company (one that goes out later moves to how it ended) |
| `N repeats of an alerted story held back` | Flags on a story already alerted, with nothing new |
| `N off-topic not posted` | Flags the pre-read found not about Google |
| `N on a post that already had an alert` | The post, or a post of its thread, already had an alert of any kind; `(noted in its thread)` or `(M noted in its thread)` when a note went under that card |
| `N on a post another watch flagged too` | Two watches flagged one post: one alert |
| `N not in English` | Flags on a post not in English |
| `N dropped after waiting 3 hours` | Flags that couldn't go out within 3 hours of being seen |
| `N with nothing to show` | Flags with no summary, words or picture |
| `N waiting` | Flags left for the next run |

The counts are of the day a flag ended (Eastern time), and C34's `flagged today` of the day it was flagged, so the two
can differ around midnight; a flag raised while B35 was OFF or blank is in no C35 count (it is only listed on the
Watch detections tab, and never posted). With no watch ON on the Watches tab, C35 reads `nothing to post: no watch is
ON (set one to ON on the Watches tab) · today: …` (without `nothing to post: ` while older flags still wait). Each flag
that isn't posted leaves one line in the run log with its link and why, for example `Watch alerts: not posting <link>:
it already had an alert: QA-1003 in the Alert log`.

### Temp checks (row 36): the team's temperature check, on request

With **Temp checks** ON, an analyst writes `temp check` and the Brandwatch query's name in a thread of the Mirror space
(B9) or the Other alerts space (B33), as the team names them in **[SLRR] Private** (`temp check [G EVENT] NOV26 Issue
name`; part of the name, the query's link or its id work too). After that run's alerts the bot **emails** the temp check
from its account to the testers (B30, else the stand-in: "from me to me", as the Social Alerts go while Testing), in the
team's UPDATED STANDARD TEMPLATE (docs.docx, "Brand Safety Temp Check") line for line, times in PT:

```
(10/29) 2020 Election Query Results (6am PT)
BW source: Link ([G EVENT] OCT26 2020 Election Query Results)

TL;DR: There have been 7,322 total mentions regarding 2020 Election Query Results. Volume is currently [#], placing the
story in the [bottom / top-XX%] of Google Issues YTD. Velocity is -70% since the peak at 12pm PT on 10/28. <Gemini's summary>

Sentiment: 60% neutral, 37% negative, and 3% positive.
  • Negativity Drivers: … (Gemini)
  • Themes: … (Gemini)

Source Breakdown: X (84%), followed by Bluesky (7%) and Reddit (5%).

Highest Engaging Posts:
  • CameronCorduroy on X - "…" (18.5K Engagements)
  • HQNewsNow on X - "…" (8.3K Engagements)
  • couriernewsroom on IG - "…" (2.5K Engagements)
```

The thread only gets a short note: `🌡️ Temp check sent: @asker (10/29) 2020 Election Query Results (6am PT) was emailed to
… Open the email. Reply "refresh" here for an update.` The write-up itself is never posted in Chat.

- **Where the count starts:** the first hour the query reached 100+ mentions (the slides' rule), looked for from 48
  hours before the query was made; an issue that never got there counts from the alert in the thread, else from when
  the query was made. `temp check … since 9am PT` (or `since 10/28 9am`, any US zone) sets it ("Since 9am PT on 10/28
  there have been …").
- **Updates:** `refresh` (or `update`, or `temp check` again) in the same thread emails the update on the same email
  thread ("Since the last update at 9am PT, there have been N new mentions (M total mentions)…"), still counted from the
  issue's start. One request a thread at a time: another `temp check` there while one waits is left to it (one naming a
  query or a time takes its place), so the thread never gets two.
- **No query named:** the bot lists the newest `[G EVENT]` queries to copy (in the thread); a name no query has gets the
  closest ones; several matches get the list.
- **Concern level:** not yet. It needs the 12-month benchmark of past `[G EVENT]` queries (the next step); until then
  the email keeps the template's own words (`Volume is currently [#], …`) for the analyst to fill in, never a guess.
  Where Gemini gives nothing, the template's placeholders for the drivers and themes stay too.
- **BW source:** "Link" opens the [SLRR] Private project's queries in Brandwatch (the bot doesn't know the team's
  dashboard for the issue), with the query's name beside it.
- **Brandwatch is only read**, with the shared token (the bot never makes, edits or deletes a query or dashboard). The
  counts come from Brandwatch's totals (nothing downloaded); at most 35 posts are read a temp check, reposts excluded
  (the export rules: X's allowance is shared by every Google team); X posts' words come from X's public embed data, and
  their engagements are X's likes plus replies. When Brandwatch is busy (the shared login's call limit, which other
  tools use too) the request waits, tried again every minute for up to 30 minutes, and its thread is told once.
- **Each email goes once**, only to the testers (Mail.gs's guard); Gmail refusing it is tried again next run.
- **Never Burson's:** a `temp check` request is never relayed to S-F Burson (or the Burson test copy), and the bot
  posts only in the request's own thread, never in S-F Burson, the test copy or a space people outside Google can join.
  OFF (as it starts), nothing changes: such a message is an analyst's message like any other.
- C36 says how the last one went.

### The switches: what the bot may do on its own (rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54-56)

Rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 are ON / OFF switches (a dropdown in column B). Each starts **OFF**, and with every switch OFF the bot works
exactly as the rest of this README describes (in S-F Burson itself, it posts nothing: row 24). Column C says what OFF
means, or what an ON switch is doing (its counts today and its last check). The bot rewrites column C every run, paused
or not.

| Row | Switch | OFF (the default) | ON |
|---|---|---|---|
| 11 | Auto-send Social Alerts | A Gmail draft for a person to send (in Testing, the email goes only to the testers in B30) | The bot sends the Social Alert itself (to real recipients when LIVE; only to the testers in B30 when Testing) |
| 12 | Auto-submit T&S form | The pre-filled T&S form link, for a person to submit | The bot submits the form itself (the test copy while Testing; the real form when LIVE), and the urgent email when it's urgent |
| 13 | KB & Guidance can start alerts | The Resources documents and the Guidance tab can only stop an alert or correct it | They can also start a Social Alert the rules wouldn't, when Gemini quotes a Guidance row or a document and the quote checks out |
| 14 | Auto-find missing links | A missing link or author is asked of Burson | Looked up in the listening feeds (BigQuery) first |
| 15 | Direct BigQuery alerts | Only the alerts posted in Chat are reviewed | Sprinklr, DSD / Brandwatch and Sonar posts are taken straight from BigQuery too (a test feed, the Mirror space, or the Auto-correct space working alone) |
| 16 | Write back to SLRR BigQuery | Nothing is written to BigQuery: Burson and shared dashboards can't see the bot at work | When LIVE, finished alerts and sends are written to the shared SLRR tables, marked as the bot's (in Testing, writes only to `TEST` or skips shared tables) |
| 17 | Learn from IM calls | No learning | The IMs' different calls go on a Learned precedents tab, and Gemini sees the similar ones |
| 18 | Watch sent alerts (24h) | The bot stops once the Social Alert is sent | For a day it re-checks the post and replies on the email thread on a surge, a deletion or press pickup |
| 19 | Early wave & velocity check | One post at a time | Every 15 minutes (`EW_EVERY_MS_`) it groups new posts from small accounts into stories itself, from the approved source tables in BigQuery (read-only), reviews them (web search, knowledge base, guidance) and posts ONE story card for each one that passes its review, in the Mirror space, a test feed, or the Auto-correct space when B9 is blank; there is no separate wave message. In the Auto-correct space at most 10 stories an hour (6 ordinary ones; serious stories first) and 150 a day are reviewed; elsewhere 40 a day. Never relayed to Burson. C19 counts what became of the day's stories, and the Early Detection tab lists each one |
| 20 | Check outage & comms docs | The standard review | Gemini checks outage claims and the email gets the approved holding statement |
| 21 | Track post-alert outcomes | Nothing is read after the Social Alert is sent | Replies and T&S confirmations are read for a week, the outcome is logged, and the **Follow-up** tab is kept up to date |
| 22 | Relay with S-F Burson | The Mirror space gets Zapier's alerts only; nothing is posted in S-F Burson | Analysts work in the Mirror space only: everything in S-F Burson comes over in its own order (Zapier's alerts, everyone's replies, messages and emojis); the analysts' (never the bot's) go straight to the Burson test copy (B26) when it's set, or wait on the Burson outbox when LIVE and Post in S-F Burson is ON |
| 23 | Never wait on Burson | A wrong alert gets ⬇️ and a request to fix and resend it, and waits for the resend (no ❌, T&S form or decision until then); a missing link or video timestamp is asked of Burson | The bot decides a corrected alert at once (the Social Alert, ❌ or the T&S form) and tells Burson what it changed; a long video's missing timestamp is the one Gemini found; Burson's resend anyway is the same alert |
| 24 | Post in S-F Burson | Nothing is posted, replied or reacted in S-F Burson (or the Burson test copy by the bot itself): it's held back and never sent later | In Testing with B26 set, the bot's own Burson replies and legend emojis in the Mirror space go straight to the Burson test copy (B26). When LIVE, each post, reply and reaction (from the bot or the Relay) waits on the Burson outbox tab, Pending; only a row a person sets to Send is posted to S-F Burson, once |
| 27 | Draft follow-ups | Overdue Social Alerts are shown on the Follow-up tab, with no email drafted | With row 21 ON, creates a Gmail draft on the Social Alert's thread when no team has replied by the deadline (`B5:B7` on the Follow-up tab), and one more a day later while it isn't resolved (never sent; addressed only to the testers in B30 while Testing) |
| 28 | Draft answers to questions | Questions teams ask on a Social Alert's thread are shown on the Follow-up tab, with no answer drafted | With row 21 ON, Gemini drafts a Gmail reply on the thread from the alert, the bot's review, the Resources documents and the Guidance tab when it can answer with 90%+ confidence; when it can't, no draft is made and the Follow-up tab says it needs an IM |
| 29 | Safety valve | **B26 decides:** when B26 is set, the bot is in **Testing**; when B26 is blank (and S-F Burson B25 is found, with alerts coming from it), the bot is **LIVE** | Always **Testing**, even when B26 is blank: every email/draft goes only to the email addresses in `Control!B30` and nothing goes to S-F Burson |
| 32 | Work directly in B25 (Google-only) | B25 is the real S-F Burson: the bot posts nothing there itself (only Burson outbox rows a person sets to Send) | When only Google people can join B25, the bot works right in it as in the Mirror space: it reviews every alert there (Burson's format, or **any other format**, which gets its own triage) and posts its notes, replies and emojis there directly. Always **Testing**. With people outside Google able to join B25, it does nothing |
| 34 | Proactive watch | The bot reviews only the alerts posted in Chat | Every 5 minutes Gemini (inside BigQuery) checks what's new in each source, read-only (Sonar, Brandwatch, Sprinklr, Tubular, the DSD story selection feed, the Other alerts space's alerts and the Brandwatch query "2026 Election Alerts" straight from Brandwatch's API), against the watches ON on the Watches tab, and what it would flag goes on the Watch detections tab, with a scorecard against Burson's alerts; the Watch sources tab says which sources are live. Nothing is posted or emailed unless **Watch alerts** (row 35, not a switch: `OFF`, `Other alerts space (B33)`, `Mirror space (B9)` or `Auto-correct space (B10)`) says where its flags go; nothing is written to BigQuery |
| 36 | Temp checks | Temp checks are done by hand; a `temp check` message is an analyst's message like any other | `temp check <Brandwatch query name>` in a thread of the Mirror space or B33 gets the team's temp check write-up in that thread after the run's alerts (above); never relayed to S-F Burson; Brandwatch only read |
| 37 | Group test emails | When LIVE, Social Alerts go to the live Google Group emails in column B of the Brand safety groups tab; the test emails in column C are ignored | Puts the bot in **Testing** and sends each Social Alert to its group's test email in column C of the Brand safety groups tab; a group with no test email is skipped and logged |
| 38 | Fast triage (Gemini Decisions) | Early-wave signals go straight to the review queue as before; Gemini Decisions is never called | Enables rows 39 and 40. While rows 39 and 40 are OFF, this switch by itself changes nothing, makes no Gemini Decisions call, and writes nothing |
| 39 | Fast triage: rank and early watch | Queue order is priority, then accounts, then oldest; stories below the usual 5-account bar wait | Needs row 38 ON: orders candidates and the review queue by P0 risk group, tier, severity score and brand-risk probability (unanswered first, never ranked down), and asks about stories at the accounts bar (B45, seed `3`) below the 5-account promotion bar, raising an `EARLY_WATCH` signal (up to 8 a day) when B43:B44 hold and severity is `medium` or higher |
| 40 | Fast triage: hold back noise | Every queued signal gets its full Gemini review | Needs row 38 ON: drops a signal without a review when it has no P0 risk group and no taxonomy raise, its severity level is `none` or `low` at or above the confidence bar (B43, seed `0.55`), and `about_google` is at or below B41 (seed `0.10`) or `routine_noise` is at or above B42 (seed `0.90`) (counted on C19 among the stories let go, and logged) |
| 46 | Write early-wave records to BigQuery | Nothing is written to `brand-social-central-data.early_wave` | Writes each check's stories, posts, signals, events and fast-triage answers to `brand-social-central-data.early_wave` (`story_snapshots`, `story_posts`, `signals`, `signal_events`, `triage_verdicts`), batched once per table per check with deterministic `insertId`s and no emails, names or write-ups |
| 48 | Early Detection: also read the AMIE table | Early Detection does not read the AMIE table | Needs row 19 ON (C48 says it is waiting while row 19 is OFF). Each Early Detection check also reads the new rows of the AMIE table (Brandwatch's alert feeds, X posts with their words) with a BigQuery job of its own, read only, with no call to Brandwatch: from an hour before the newest row it last took (to catch rows that land late), at most 300 new rows a check (`amie_rows_per_check`), small accounts only, not positive, English, Google's posts, never the staff and KOF feeds or a post the alert memory already has. It checks the table at the end of a check, after the other sources were read, so a slow answer never holds them up: its columns every hour and a dry run once a day (at most 1 GB a read, `amie_max_gb`). So its first read comes at the check after the row goes ON (about 15 minutes later). A missing column, refused access or a read too big stops it for the day; a failed read pauses it an hour; either way the other sources go on. Turning it OFF forgets where it had read to (the day's counts and the day it was first read stay) |
| 49 | Early Detection: also read Brandwatch live (not X) | Early Detection does not call Brandwatch | Needs row 19 ON (C49 says it is waiting while row 19 is OFF). The New sources tab then lists the Brandwatch project's queries, each with Read `OFF` (the bot never sets one `ON`): set Read to `ON` for the ones to read (at most 20, the first by row; C49 waits until one is ticked). After each run's alerts and the Watch (row 34), never before them, and at most every 10 minutes (`bw_live_every_minutes`), it asks Brandwatch's API, with GETs only, for the mentions of the ticked queries added since it last read (with 5 minutes of overlap, oldest first, at most 300 a read: `bw_live_parcel_max`), never X and never LinkedIn. Early Detection's next check takes them in a BigQuery job of its own, the mentions sent as a parameter (never in the SQL), through the same rules as its other sources (English, not positive, Google's, small accounts); a mention added more than 3 hours after it was posted can only join a story. It keeps to 20 calls in 10 minutes of its own (`bw_live_calls_per_10min`) and waits 10 minutes when Brandwatch's shared login has used 450 of its 600 calls (`bw_live_pause_at_used`) or says too many calls; Brandwatch refusing the key or the read, or not answering, is said in C49 with since when. An X mention, or Brandwatch ignoring "added since" or the order asked for, stops it until the row is turned OFF and ON again. While it reads (its last read under an hour old), the AMIE table (row 48) leaves Brandwatch's networks to it. A job that fails twice drops its mentions, and C49 says how many. The day's mentions are counted (C49 and the New sources tab) but not capped. While rows 49 and 19 are ON the bot also counts every Brandwatch mention it reads, whatever reads it (this reader, the Watch's Brandwatch query, Temp checks): C49 then says `the bot read 41,200 Brandwatch mentions today, all features` (when the Watch or Temp checks read some), and the tab and the log line give the same number; until the count has run over midnight Eastern it says `since this row went ON` instead of `today`. That count stops when row 49 goes OFF or waits for row 19, and never changes what the Watch or Temp checks ask Brandwatch or what they get. Turning it OFF forgets where it had read to (the day's counts and the ticks stay); ON again starts from the last 30 minutes (`bw_live_first_minutes`) |
| 50 | Proactive watch: also read the AMIE table | The Watch does not read the AMIE table | Needs row 34 ON (C50 says it is waiting while row 34 is OFF). The Watch also checks the new rows of the AMIE table (Brandwatch's alert feeds, X posts with their words) in its US look, and while row 50 is ON every post an Early Detection story card links counts as that card's, as its main post does (see "Every post of a story card"). Its flags go only where Watch alerts (row 35) send them |
| 51 | Open engine: judgment in place of caps | Early Detection, the Watch and Direct BigQuery keep today's limits. C51 also shows the run time of the last 24 hours and Burson's pick-up time (p90), once a minute of run time is recorded | Needs row 19 ON (C51 says it is waiting while row 19 is OFF). Built so far (step S2 of the open-engine plan): **one safety stop a day**: 2,000 background reviews an Eastern day (`open_daily_stop`; story reviews, Watch pre-reads, the Other alerts space's triages), and from the same number 20,000 quick looks, 200,000 Watch post checks and 3,000 GB of background BigQuery reads. Past it no new story review, Watch card or Direct BigQuery card starts until midnight ET (quick looks go on to their own ceiling), C51 says so first and C19 ends `safety stop reached`. **The day's run time and outside calls guarded**: from 80% of the last 24 hours' run-time budget only serious work starts (P0 / P1, a KOF, a 2,000+ post), from 90% no background reviews or cards, from 97% no background work at all; from 70% of the outside-call budget no quick looks, from 90% no background work. **Burson first**: before each background review or card the bot looks at S-F Burson; a new alert there ends background work for the run, and the next run takes it first. While the day's Burson pick-up p90 is over 2 minutes, each run keeps 30 to 60 seconds more for Burson. After a Gemini "too busy", background work waits 10 minutes; ApiGuard's rolling limits become a runaway guard only (Gemini 120 / 500, BigQuery 150 / 700, Gemini Decisions 600 / 2,400 in 10 / 60 minutes); a web search refused during background work is turned off for background work only. Burson's own alerts are never counted, slowed or stopped. In the Auto-correct space the bot's own Watch alerts and Direct BigQuery cards waiting for their review are the bot's own backlog: they no longer make the flow look busy (so Early Detection keeps checking), an ordinary one waits while a serious story is next in the review queue or a due check needs the rest of the run, and the Watch posts a new card there only while fewer than 3 of them wait. Early Detection checks every 5 minutes (`open_check_minutes`; every 10 from 60% of the day's run-time budget, every 15 from 70%; Gemini Decisions' pause after a failure follows it). Its review allowance (5 a check, the hour's 10 and 6 ordinary, the day's 150) no longer turns stories away: every signal not yet ended in the producer's 180 minutes is read (up to 300), serious ones go first, the queue holds 24 (`open_queue_max`; a serious one may take up to 4 places more, so an ordinary one is not pushed out for it), a story that does not fit waits for a later check and ends only when it would leave the 180 minutes (`it waited 3 hours while N more serious stories were reviewed first`), and the reviews have no count a run (the run's time bounds them). Each check embeds every post it has time for (80 texts a call, no count of 400 a check or 20,000 a day), a source's read returns up to 5,000 posts, and a check hands over up to 50 signals of a kind. Every source has the same standing (`open_equal_lanes`): a post of any source read within 3 hours of posting (`open_fresh_minutes`) may start a story, Tubular's and Brandwatch's nightly ones too, and a later one only joins; a story's review gets one line when most of its posts come from a source whose same-story grouping has not been checked yet (`open_lane_bars`, or the property `OPEN_LANE_BARS` step S1 writes, say which have been). Gemini Decisions' quick looks have no count a check or a day (the day's quick-look ceiling bounds them) and a check's candidates go side by side in one batch; a blank B45 reads 2 accounts; a story is raised early when about Google and brand risk reach the watch bar and medium-or-worse severity the confidence bar, or its P0 share is 0.35 or more; a signal most likely about nothing (severity none at `open_hold_none_at`, 0.80) is held back. Every post a check reads is checked against the alert requirements code can decide (`open_requirements_first`; a KOF on a list, 2,000+ engagements, the source's own P0 tag or Sensitive Topic, Google's own post at 30 comments and 30% negative) and counted on the Engine tab; the posts it leaves to a judgment get a quick look of their own at the end of the Auto-correct flow's run (one call a post, side by side, within 20 seconds; the post's words only, no link, handle or numbers), counted at four bars; nothing is posted or queued because of either yet; an alert in another format (the Watch's cards, the Other alerts space) with a Sensitive Topic counts as collected whatever its engagements. In the Auto-correct space a Watch flag the AI pre-read judged meaningful with a P1 tag or a Sensitive Topic goes out alone, whatever its reach (no pre-read: as before); when flags have waited 10 minutes for their pre-read for want of time, the flow's background steps stop at 210 s (Burson's own alerts keep their time) so the Watch can read them; Brandwatch mentions' 1,000 a day goes (60 a look stays). Direct BigQuery reads every source at each check, 50 candidates a source, ranks them across sources (a KOF's post first, then the most engagements) and posts while fewer than 3 of its cards wait unreviewed, instead of 2 a check (its 500 engagements stay); a candidate not posted comes back at the next check. A story already carded that grows 1.5 times and 3 more accounts (short of the update bar) gets a growth note in its card's thread ("Growing: 14 accounts now, up from 9" and up to 3 new links), with no review, while its newest post is under 3 hours old. Anyone in the Auto-correct space can write `why not <link>` and the bot answers in that thread from what it holds about the post (an alert or card already out, a Watch flag and what came of it, the story it joined or the pool it waits in, or that it holds nothing), read-only. In front of that quick look a first screen (`open_first_screen`) has Gemini (the triage model Burson's reviews use, through a sender of its own) read those posts 25 at a time with one known test post, and only the ones it marks as a possible P0 issue or Sensitive Topic (with 1 in 50 of the others, at random, and every post it could not read) get the quick look; a post in a P0 risk-term group or one whose words read like an instruction skips it. It steps aside for Burson (their pass catching up, their reviews bursting, a Gemini "too busy" to anyone in the last 10 minutes, a new Burson alert), pauses itself when Gemini is busy, slow or silent, and in a run where it cannot run every post gets its quick look as before; C51 warns after an hour of it paused. The new sources' caution rules go: no trial, no cap on stories only they lift, no share of the embeddings or the pool; Brandwatch live is read at every check and the AMIE table 5,000 rows a check (rows 48 and 49 still decide whether they are read at all). Velocity counts only posts the bot read within an hour of posting (`open_velocity_lag_minutes`), and a late post never changes an hour already counted (`open_velocity_fix`). C51 says the day's reviews, run time and calls against their budgets, and the walls met today (runs held by each). With row 56 ON as well, the dashboard also shows the pick-up time leaving out the alerts posted before the bot came back after a stop, a pause or failing runs, under the usual one; C51, the Engine tab and the 30 to 60 seconds kept for Burson still count every pick-up, as before |
| 54 | Live dashboard | The live dashboard web app shows nothing; the bot keeps no extra records for it | The live dashboard web app (see "Live dashboard" below) shows the bot's work to the people this sheet is shared with, read-only: what needs a person now, the stories forming, the alerts and where each stands, what is stuck or held back, and how current it all is. It never posts, sends or changes anything. While it's ON the bot also keeps, for each Early Detection story card it posts, the story's posts in order, and each run writes the dashboard's build id (the script property `BOT_BUILD`) when it changed. C54 has the web app's link once it is deployed, or says it is not deployed yet |
| 55 | Slide deliveries | No pulse slides are delivered; deliveries can be set up in the web app and wait | Each delivery set up in the web app (see "Slide deliveries" below) is delivered on its own schedule: the run keeps one time trigger (`dashDeliverDue`, every 5 minutes) while row 55 is ON and removes it when it's OFF. C55 says it is waiting until the bot's account approves editing Google Slides once, or that nothing is delivered while the bot is paused (B2 OFF). While it's ON each run also records whether the bot is LIVE or Testing (the script property `SLIDE_MODE_LOG`, written only when that changes, and once when row 55 is turned OFF, so the time it was OFF reads "not recorded"), so a slide can say whether a Social Alert went to the teams or only to the testers |
| 56 | Speed numbers: leave out when the bot was not running | The bot keeps no record of when it was running, and the speed numbers count every alert as they always have | From the moment you turn it ON, the bot keeps a "When the bot ran" tab: when it was running, paused (Bot OFF), failing, or not running at all. When Bot (B2) is set back ON after a pause, it lists the Burson alerts posted while it was OFF on a "Burson while bot OFF" tab, without reviewing, posting or emailing any of them. The Results and Head start tabs then show extra speed numbers next to the usual ones, which don't change, and so does the dashboard (see "When the bot ran (Control row 56)" below). C56 says since when the run log is kept, and what the last listing found |

What holds for every switch:

- **ON only when it says so.** A switch is ON only when its row has the switch's own label and column B says ON. The
  bot never sets a switch ON: a row whose label is missing or changed is put back OFF. A Control tab from before the
  switches gets rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56 on the next run (no need to run `setup()`), all OFF, rows 41-45 and 47 set to their seed bars (`0.10`, `0.90`, `0.55`, `0.80`, `3`, `0.30`), row 25 (S-F Burson space) blank, row 26 (Burson test copy) blank, row 33 (Other alerts space) blank and row 35 (Watch alerts) OFF.
  The values in B2:B10, B25:B26, B30:B31, B33, B35, B41:B45, B47, and any switch someone already set, are kept, and "How it works" moves to row 57 (rows 52-53 are left as they are, and row 56, once the blank row above the help, is a switch now: only the bot's own old help is cleared from column A there, such as the old "How it works" title at A53, and anything else a person wrote in rows 52-53 stays, in any column, a line of their own that starts with "•" too; a person's text in column A of the rows the help now fills, rows 57-110, is kept below the help, in the first blank cells of column A, unchanged, and the log says where it went). A switch row the bot adds is written in full, label, `OFF` and column C, over whatever its cells A:C held: on a tab from before rows 54 and 55 those are two of the old help's lines (on a tab from the first build, rows 48-51 too: the blank row above its help, the help's title and its first lines), and a person's text in A54:C56 (any column, but a stray `ON`: the new switch always starts `OFF`) is kept below the help, in the first blank cells of column A, unchanged, with a log line that says which cell it came from and where it went (on a tab from the first build, a person's text in A48:C51 is replaced, as it always was); rows 52 and 53 are never taken. One exception, once: the confidence bar (B43) still at `0.80`, the seed the first build wrote there, moves to `0.55`; any other value in B43 is kept.
- **Testing vs. LIVE is decided on the Control tab every run (`Main.gs` `runMode_`).**
  - The run is **LIVE** only when **Safety valve (row 29)** and **Group test emails (row 37)** are `OFF`, **Burson test copy (B26)** is blank, and **S-F Burson (B25)** is set and found (with alerts coming from S-F Burson via B3 or Mirror B9). While LIVE, Status (B5) starts with the LIVE badge, emails/drafts use real `Brand safety groups` recipients, the real T&S form is used, leads receive DMs, SLRR BigQuery write-back (row 16) writes to the shared tables, and the **Burson outbox** can send rows marked `Send` to S-F Burson.
  - Everything else (Safety valve `ON`, or Group test emails `ON`, or B26 set even if failing checks, or B25 blank/not found, or row 32 working directly in a Google-only B25) is **Testing** (fail closed): every email or draft goes only to the email addresses in `Control!B30` (`Testing: send to`; nothing is sent while `B30` is blank), except that with Group test emails `ON` each Social Alert goes to its group's test email in column C of `Brand safety groups` (a group with none is skipped and logged); only the test copy of the T&S form is submitted, and nothing is ever queued for or sent to live S-F Burson (any outbox row set to `Send` while in Testing is reset to `Pending` with a note). The **Auto-correct space (B10)** and the **Other alerts space (B33)** always stay in Testing even when the Mirror run is LIVE.
- **Nothing reaches S-F Burson unless a person sends it.** Only Post in S-F Burson (row 24) while LIVE lets anything be posted
  there, and then only the Burson outbox rows a person sets to Send (re-checking the Safety valve and B26 right before each row). No other switch posts or reacts in S-F Burson.
  Nothing Burson can see mentions the analyst space, the listening feeds, BigQuery, write-backs or automation.
  New posts go to the analyst space (in the alert's thread, or top level for early warnings).
- **Never twice, never in the way.** Each switch remembers what it did (the Alert log's `tns_submitted`, `bq_written`,
  `outcome` and `ingested` columns, `email_input.watch_state`, and script properties), so a retry, a resend or the other
  test space never repeats a send, a form, a write or a warning. A switch that fails is logged and retried later where
  that's safe; it never stops the run.
- **Thresholds are constants or Control cells:** rows 41-45 and 47 on the Control tab hold the fast-triage and early-watch bars (`FT_BAR_SPECS_`, `FT_BAR_SEEDS_` in `FastTriage.gs`), read on each run so a blank or invalid cell uses its seed; fixed timings and caps sit at the top of the `.gs` file that owns the feature (`BQ_LINK_*` for row 14, `BQ_POLL_MAX_PER_RUN_`, `BQ_BSIP_MIN_ENGAGEMENTS_` and `BQ_BSIP_MAX_AGE_H_` for row 15, row 19's queue and daily caps `EW_*` and `ED_QUEUE_*` in `BigQuery.gs`, row 19's detection and similarity constants `EWS_*` in `EarlyWaveSource.gs`, client timings and caps `DEC_*` in `Decisions.gs`, BigQuery batch caps `EW_BQ_*` in `FastTriage.gs`, and the watch and outcome timings in `Watch.gs` and `Outcomes.gs`).
- **Check BigQuery before turning on rows 14, 15, 16, 19 and 46.** Run `bq show --schema` on the tables named below first. A query or write that fails does nothing (the bot carries on as with the switch OFF).

#### Row 11: Auto-send Social Alerts

- **OFF** (the default): as described above. While testing the bot sends each Social Alert itself, only to `Control!B30`;
  with real distros it leaves a Gmail draft for a person to send.
- **ON while testing**: nothing changes. Every Social Alert still goes only to `Control!B30`, and
  C11 says so.
- **ON live** (the real Burson space, not the Mirror or Auto-correct space): the bot sends the email the
  draft would have been, to the same people, as soon as the alert is escalated. Then it marks the sent and team badges for
  who it went to, posts "Social Alert sent" under the forwarded alert (with the T&S form details when T&S should see
  it), and C11 shows how many went out today. With no draft left, analysts' reactions on the forwarded alert
  no longer change the email.
- **Never twice:** the bot notes each alert before sending it. If Gmail refuses the send, or a run stops partway, that
  alert gets the usual draft instead, with a warning to check Sent in Gmail first and not to send it again if it went.
  If the send did go out, the bot finds it in Sent (for half an hour, and again if someone deletes the draft), marks
  the alert sent and removes the draft, so it's never taken for No action taken.
- **Stays a draft:** an alert whose product has no alert contacts on file, an alert still waiting on Burson for
  something only they can fix (a missing link, a tag not on the list, a bad post date), and an alert whose link the bot
  found itself (row 14), until a person checks it's the right post. The note says why.
- **Results tab:** the IMs have nothing left to do on an alert the bot sent itself, so their call on it is "Bot sent
  it" (unless they drafted, sent or logged one too) and "Same call?" says "Can't tell". It's in neither "only" list and
  never goes on the Learned precedents tab (row 17).

#### Row 12: Auto-submit T&S form

- **OFF** (the default): when T&S should see an alert, the note under it has the pre-filled T&S form link for a person
  to submit (see "T&S pre-filled link" below), and the bot marks confirmed when the confirmation email comes in.
- **ON while testing**: the bot submits the
  **test copy** of the form in the tester's Drive itself, with the answers the link would have filled in, before the
  Social Alert goes out (so the email says T&S: Yes). When the alert
  is urgent (P0, HIGH or VIRAL KOF engagement, child safety), the urgent email goes **only to `Control!B30`**.
  The real form and the T&S urgent alias are never touched while testing.
- **ON live**: the bot submits the **real form**, and emails
  the configured T&S urgent alias when it's urgent. FormApp can't open the form by its public link, so first put the
  form's editor id (from its `…/forms/d/<id>/edit` link; the bot's account needs edit access) in the script property
  `TNS_LIVE_FORM_ID`. Until then the note keeps the link for a person, and C12 says why.
- **Never twice for a post:** the bot notes each post before it touches the form (script property `TNS_AUTO_LINKS`,
  which every space's run reads, and the Alert log's `tns_submitted`). Another alert on the same post, or the other
  test space, gets "already submitted", and a post someone already marked ✍️ isn't submitted again. The bot's own ✍️
  for the test copy doesn't count once live: a post tested on the real Burson space gets the real form when it comes
  again after go-live. If the form refuses it, or the run is out of time, the note has the link again with a line
  saying why, and the bot never tries that post again. C12 shows how many it submitted today.
- **Urgent later:** the urgent email only goes with the bot's own submit. When a post T&S already has turns urgent
  (a new alert with HIGH engagement, say), the note under the new alert asks a person to send the urgent email.
- **Turned OFF after a submit:** an alert whose form the bot already submitted keeps saying so (its email's retry,
  a Social Alert that fails for good), so nobody is asked to submit it twice.

#### Row 13: KB & Guidance can start alerts

OFF, the Guidance tab and the Resources
documents can only stop an alert or correct its fields, exactly as before. ON, they can also start a Social Alert the
rules leave below the bar (under 2,000 engagements, or an ongoing issue with no KOF author): Gemini must be at least 90%
sure, name the Guidance tab row or the document that says posts like this get a Social Alert, and quote it, and the bot
checks the quote word for word against that row or document. The quote's sentence must say to alert (escalate, a Social
Alert, send an email): a sentence that only mentions the topic doesn't count. A lead's email can't start one, and neither
can a row or document that says to hold, skip or not alert on posts like these ("Social Alerts are not needed", "no Pixel
alerts", "stop escalating", "monitor only"), or a row whose Applies to names only other products than the alert's. It
never overrides an exclusion, the YouTube protocol, a no-alert check or an alert that already went out, and never sends
the 🧑‍💻 DM. Analysts see `Why: Escalated per Guidance: "…"` (or the document's name) in the draft note (while testing,
in a note under the alert once it's sent to the stand-in) and on the Results tab; the email and Burson never see it.
While testing (a stand-in), the Social Alert goes only to the stand-in, like any other. Column C counts the alerts it
started today.

#### Row 14: Auto-find missing links

- **OFF** (the default): an alert without its link or author is asked of Burson, as always.
- **ON**: before asking, the bot looks the post up in the listening feeds: one read-only BigQuery query (`us-central1`)
  over Pendulum's posts (`sonar_raw`) from the last 48 hours and a small `US` check of the SLRR log (`slrr_alerts`, same issue name). It takes a link only when one
  post clearly matches: same network, never another author, posted within a day of the alert's time, a similar
  engagement count, and no second post close to it. When the alert names its author, a post the feeds have no author
  for isn't enough on its own. A post the bot already alerted in the last 14 days is never taken (it may be the same
  author's newer post that the feeds don't have yet). Otherwise Burson is asked as before. An alert with its link but
  no author gets the author from Pendulum's entry for that post.
- **Resends**: Burson's resend of an alert whose link the bot found is still recognized as the resend, as with the
  switch OFF: with or without the link, and also when nothing else was asked. When Burson was asked to fix something
  else and the resend still has no link, it keeps the one found, so Burson isn't asked for it then either.
- **What people see**: analysts get the alert with the link on its `[Link]:` line, "QA corrected: Link is now …" and a
  note saying it was found in the feeds and how sure the bot is. The post lookup, the enrichment, Gemini's review and
  the Social Alert email all use the link. Burson isn't asked for it and is never told; nothing new is posted in the
  Burson space. Column C shows `found N of M today`.
- **With the other switches**: a link the bot found is a guess until a person checks it, so Auto-send (row 11) leaves
  that alert a draft with a note to check the post, and Auto-submit T&S form (row 12) never puts it in the real T&S form
  (a person submits it from the pre-filled link; the test copy is still filled in while testing).
- **Sandbox**: the switch sends nothing and writes nothing to BigQuery, so the stand-in rules don't change. It works the
  same in the Mirror and auto-correct spaces.

#### Row 15: Direct BigQuery alerts

- **OFF** (the default): the bot reviews only the alerts posted in Chat. No BigQuery query is made for it.
- **ON**: at most every 5 minutes, before reviewing the Burson space, the bot reads new posts straight from BigQuery
  (read-only) and posts each one it hasn't seen, as a Zapier-format alert, in the space it reads as Burson's, so it
  reviews and actions it like any alert (at most 2 a check, `BQ_POLL_MAX_PER_RUN_`): **Sprinklr** owned posts with 30+
  comments and 30%+ negativity, and **DSD story selection / Brandwatch mentions** (`DSD.DSD-story-selection` HIGH/KOF
  plus `raw_data.brandwatch_raw_mentions_base` negative/KOF earned posts), each its own US query,
  so one that fails doesn't stop the other; **BSIP** (`sonar_raw` + `tubular_videos`): posts Pendulum tagged and saw in the lookback window, posted at most 48
  hours ago, with 500+ engagements or KOF, the most engaged first (`BQ_BSIP_MIN_ENGAGEMENTS_` and `BQ_BSIP_MAX_AGE_H_` in BigQuery.gs), a `us-central1` query plus a small US check of
  the SLRR alert log. A post is never posted twice: not if the bot already has it,
  took it before, the SLRR alert log has it from the last 7 days (under any link to it), or Burson's alert of it is
  already in the space waiting to be reviewed. The alert gives the post's time in UTC (`2026-10-14 11:40 UTC`), as
  BigQuery has it.
- **Burson's alerts come first**: a check is skipped, and column C says why, when the last run ran out of time or while
  3 or more of the posts it took still wait to be reviewed (`BQ_DIRECT_MAX_WAITING_`). "The last run" is the main
  run's last report, and one from more than 10 minutes ago doesn't count (`BQ_DIRECT_LAST_RUN_MS_`): only a main run
  writes it, so the Auto-correct space working alone (B10 with no main run) is never held back by an old one. The
  space is read first: when that fails, BigQuery isn't queried.
- **Cost**: the Sprinklr query reads about 3.3 GB a check, so up to about 0.95 TB a day at one check every 5 minutes
  (less when checks are skipped). It's billed only while the switch is ON.
- **Where**: only in a test feed, the Mirror space, or the Auto-correct space working alone (B10, with B9 blank). It
  does nothing (column C says why) when the Burson space is the live one, a space people outside Google can join, or in
  a dry run, so nothing new ever reaches Burson. "Into the analyst/test space" therefore means the test feed, the Mirror
  training space or the Auto-correct space: the bot reviews only the space it reads as Burson's (in the Auto-correct
  space, the cards it posts there), and from there analysts get the alert as usual.
- **Results tab**: these alerts weren't Burson's, so they're left out (their Alert log rows carry `Sprinklr`, `BMIE`
  [legacy code for DSD / Brandwatch] or `BSIP` in the `ingested` column). When Burson then alerts the same post and the bot ❌s it as already alerted, the
  bot's call on Burson's alert is the Social Alert it sent from BigQuery (its email time, 0 minutes when it went out
  before Burson posted, and its reason).
- **Column C (C15)** reads, for example, `last check Oct 14, 10:15 AM EDT · 6 posts today (3 for a Social Alert, 2 monitoring only)
  · not posted: 4 already had an alert, 2 on a story already alerted`:
  - `posts today`: the cards the bot posted from BigQuery today. The bracket: of the cards reviewed today, how many got
    a Social Alert and how many didn't (monitoring only). A card is reviewed a minute or so after it is posted, and the
    cell shows it at the next check, so for a few minutes the bracket can add up to less than the posts. A card posted
    just before midnight Eastern and reviewed after it is in neither day's bracket.
  - `already had an alert`: posts BigQuery offered that already had an alert from somewhere else (Burson's alert, a
    Watch alert, a story's card where that counts, the SLRR alert log), so no second card was posted. A post the bot
    posted itself from BigQuery never counts here.
  - `on a story already alerted`: posts on an issue that already has an alert that bring nothing new.
  - Each post counts once a day for each reason, however many checks read it; a post counted as not posted that gets
    its card later in the day leaves that count. Posts that aren't about Google, aren't in English or have no real
    engagement count are in none of these numbers.
  - When something went wrong at a check (`BigQuery refused the query for BSIP`, say), it is in brackets after the
    time. To fit 200 characters, the bracket with the review counts goes first, then `; it tries again at the next
    check`, then the end of the problem's words; a count is never cut.
  - Each post not posted has one line in the run log: `BigQuery direct poll: not posted` with its link, the reason and
    the alert it matched (`QA-1042 (Watch alert)`); one Step 1 left out on its own call (not about Google, or Gemini's
    call with no earlier alert on the issue): `not posted, left out by Step 1`, once a day.
- **Sandbox**: emails, DMs and forms for these alerts follow the same stand-in rules as any alert. Nothing is written to
  BigQuery.
- **In the Auto-correct space** (B10 standing alone), a card is reviewed after it was posted and is never edited: when
  the review changes something, or writes the summary, a note in the card's thread lists it, starting `The agentic
  assistant reviewed this alert. The card above was posted before the review; the email uses these corrections:`, and
  the Social Alert email uses the corrections and the write-up. The note ends with the `Alert requirements` line, and
  in the one-space setup stories go first (see "The one-space setup" above). Three more things happen only there:
  - **The BSIP card's KOF line** (setting `requirement_line`): a card from the BSIP source says `[KOF]: Yes (<list>)`
    when the listening feed has the author on an influencer list, with the list's own brackets taken out (`Viral KOFs
    (KOFs)` shows as `[KOF]: Yes (Viral KOFs)`), and `[KOF]: No` when it has none or the list is a Google-owned channel
    or a Google rep. Such a card can send a Social Alert at any size, as Burson's KOF alerts do: expect more Social
    Alert emails from BigQuery cards (to the testers in B30 while Testing); C15's bracket shows how many. Elsewhere the
    card still says `[KOF]: No`.
  - **A bigger post on an issue that already has an alert** (setting `cross_alert_notes`): such a post used to get no
    card, however big. Now it gets its own card when it has 2,000 engagements or more (the config's
    `collection.high_engagement_threshold`) and none of the earlier alerts on that issue, nor another post on it carded
    at the same check, had that many. Its card is reviewed like any other and usually sends a Social Alert. It counts
    under `posts today`, and the run log says `BigQuery direct poll: let through, a bigger post on an issue already
    alerted`. A post left out while it was under 2,000 is looked at again only an hour later, so its card can come up
    to an hour after it passes 2,000. Only BSIP posts can pass (they carry an issue name). Still at most 2 cards a check.
  - **The story note** (setting `cross_alert_notes`): a new card whose post is in an Early Detection story card of the
    last 24 hours gets `🔗 *Part of a story:* 6 small accounts on X and Reddit tell it (story card)` in its thread (see
    "Notes under cards").

#### Row 16: Write back to SLRR BigQuery

- **OFF** (the default; keep it OFF until the checks below are done): the bot writes only to this sheet. It never
  writes anything to BigQuery.
- **Known issue: keep it OFF.** Its writes can't succeed today: `alert_sends` requires `send_id` and `slrr_alerts`
  requires `sheet_row_number`, and the bot sends neither. While it was ON on Oct 21, BigQuery refused the bot's
  `alert_sends` rows (testing writes nothing to `slrr_alerts`), so none of the bot's rows are in either table. Adding
  the columns needs the table owners' agreement first.
- **ON while testing** (a stand-in set, as now, or in the Mirror, Auto-correct or a test space): each Social Alert the
  bot sent goes in `slrr_feedback.alert_sends` as one row with `environment` TEST. Nothing goes in
  `slrr_alerts.slrr_alerts` (that log has no test flag), and alerts with no email write nothing. C16 says so.
- **ON live** (the real Burson space, no stand-in): every alert the bot finishes goes in `slrr_alerts.slrr_alerts`:
  sent, ❌, T&S form only, YouTube left for a person, a draft deleted unsent or ❌'d, or an email that failed for good.
  A sent one also goes in `alert_sends` as PROD. Each row has the bot's mark (`burson-qa-bot` in `drafted_by`,
  `identifier_analyst` and `source_tab`). From the bot's first write on, the Results tab and the bot's own "already
  alerted" checks leave those rows out, so the bot never takes its own rows for the IMs' (until then those reads are
  exactly as before). Nothing about it is posted in Chat.
- **Never twice:** each alert is written once (the Alert log's `bq_written`, the bot's memory, and BigQuery's insertId
  `<alert_id>:<kind>`). If BigQuery refuses a row, the bot tries again 5 minutes later, 3 tries in all. After that it
  gives up, and C16 and the Status say so (and which table has it already). If BigQuery's answer is lost (a dropped
  connection or an HTTP 5xx: it may have the row), the bot sends it once more right away, while BigQuery still drops a
  repeat; if it's still unsure, the next try first looks for the row and sends it only if it isn't there. A retry
  writes the alert as the run that finished it was (live or testing), and one still waiting after 2 days (the switch
  was OFF meanwhile, say) is given up, not written. It never stops the run.
- **Before turning it ON:** check both tables' columns with `bq show --schema --format=prettyjson
  brand-social-central-data:slrr_alerts.slrr_alerts` (and `:slrr_feedback.alert_sends`). The bot writes only columns
  the code already reads, each as text. Also check with the table owners that rows streamed in are kept (for example,
  that `slrr_alerts` isn't reloaded from the SLRR sheet in a way that drops them).

#### Row 17: Learn from IM calls

OFF, there is no Learned precedents tab and the review is
exactly as before. ON, each Results tab rebuild copies the alerts where the bot and the IMs made a different Social
Alert call (the IMs sent one and the bot didn't, or the other way round once a day has passed) to the bot's own
**Learned precedents** tab, right after Results: Date · Post · Product · Exposure Tag · Engagements · KOF · Bot call ·
IM call · Lesson / Why (the bot's reason) · Active, the latest 100. Calls that wait on Burson's fixes, have no reason
or were left for a person (YouTube) aren't copied. Live (no stand-in, not the Mirror space), neither is a Social Alert
the bot sent: it went to the team, so the IMs not sending a second one isn't a different call. Set **Active** to No to
leave a row out (blank means Yes); the bot keeps it, and puts back its own text in the other columns. Deleting a row
doesn't remove it: while its post is on the Results tab (7 days) the next rebuild puts it back. It writes the tab only
when something changed, and not while the IMs' side is from an older BigQuery read. Columns people add after L would
end up next to other rows, so while there are any the bot leaves the tab as it is (column C says so). Each review
then shows Gemini up to 5 active rows about the same product or exposure tag (never the same post) as "past IM
decisions", so it makes the IMs' call; analysts see which in the run log. No extra Gemini call, nothing new in Chat or
email, and Burson never sees any of it. It needs the Results tab (`speed_tab`). The bot never reads or writes a tab
with that name it didn't make (column C says so). Column C shows how many rows the tab has.

#### Row 18: Watch sent alerts (24h)

**OFF:** the bot stops once the Social Alert
is sent, as it always has. **ON:** for a day after a Social Alert is sent, the bot re-checks the post every 30 minutes
(at most 3 alerts a run) and, once for each, replies with one line on the Social Alert's email thread (with the post's
link, as a thread can also carry follow-up alerts about other posts) and notes it under the alert in the analyst space
when:

- the engagement passes 50,000 and is at least 3x the count the alert went out with (the higher of the post's own likes
  and replies on X and Bluesky, and Sonar's count in BigQuery);
- the post is deleted or taken down (X, Bluesky and YouTube; checked twice, 10 minutes apart, after the bot saw it up);
- the press picks it up (Gemini with the web search, once every 3 hours per alert; never without the web search).

Alerts sent in the last day before the switch was turned on (or while it was OFF) are watched too: the bot looks for
them in the Alert log on its first run with the switch ON, then at most every 3 hours.

While testing (`escalation.stand_in` set, as now) the reply goes only to the stand-in, in every space. Live (the real
Burson space, no stand-in) it goes to everyone the Social Alert went to, as Gmail shows it sent (anyone the IM took off
stays off); when Gmail can't say, no reply goes out. No reply goes on a thread where a follow-up Social Alert is still a
draft either. A reply that isn't sent is never tried again: the note asks the IM to send the update. Nothing is posted
in the Burson space. What was reported is kept in the Alert log (`email_input.watch_state`), so no update goes out
twice, and a newer alert on the same post, on the same thread, doesn't repeat a press pickup. C18 shows how many alerts
it's watching, the last check and today's updates (the main run's, not the auto-correct space's). The code is in
`Watch.gs`.

#### Row 19: Early wave & velocity check

- **OFF** (the default): no early-detection read, review or card.
- **ON**: open-world early detection over low-tier posts. The bot builds the signals itself (`EarlyWaveSource.gs`): it
  clusters small accounts' posts by meaning and spots fast-rising topics without knowing the topic in advance. After
  each run's alerts, at most every 15 minutes (`EW_EVERY_MS_`), it reads what is new in the approved source tables,
  read-only, with one BigQuery job per location (`US` and `us-central1`): Sonar's posts and Sprinklr's comments in real
  time; Brandwatch and Tubular (every 6 hours) later, only to join a story that already exists. With row 48 ON a third
  job, sent at the same time, reads the AMIE table (see row 48); with row 49 ON, while mentions Brandwatch live read
  (see row 49) wait for it, one more job takes them; a new source's failure never stops the other jobs. It embeds the posts it
  hasn't seen (Vertex AI `text-embedding-005`), clusters them and checks their velocity in Apps Script, logs one line
  with the producer's time and the rolling 10- and 60-minute API counts (`ewLogCheck_`), and **queues** the new signals
  (script properties). Nothing is posted at that point and nothing is written to BigQuery.
- **Review, then one card**: every run (after the alerts, never while they catch up, within the API guard's background
  budget) the bot reviews up to 2 queued signals. Each gets ONE Gemini review with the web search on, the knowledge base
  documents (Resources tab), the guidance rules, the playbook, earlier alerts and known issues, and a still of the main
  post at most (never its video). A dismissal is filtered out (no card, note, mark, Social Alert or T&S intake; its
  reason is logged, and it ends `Reviewed and dismissed` on the Early Detection tab). Only a signal kept for escalation
  or monitoring gets ONE story card (there is no separate wave message):
  - a headline saying exactly what people are posting about, the call (📦 Social Alert / 👍 monitor), how many accounts
    on which platforms and when (ET);
  - a short story with the posts linked inline (only links to the signal's own posts: anything else Gemini writes is
    dropped), what the web says with its sources linked, and suggested next steps inside the escalation process. In the
    Auto-correct space the story says what the posts claim and how Google or its product comes into it, and what the
    web says (who the posts name, what outlets say about the claim) comes only from the review's web search, a line
    shown only when the search came back with sources;
  - every post as a link, and the picture of the post that best shows the topic (Gemini picks it; else the main post;
    in the Auto-correct space only a post's own imagery: see "Pictures under the bot's own cards", and with none, that
    post's first words on a `*Post:*` line).
  The review note (why, SLRR classification, Temp Check query, T&S; in the Auto-correct space the `Alert requirements`
  line in place of the classification line) goes in the card's thread, with the marks and any
  Social Alert / T&S draft behind human review, as for any alert. With no AI review (except on an early-watch signal:
  below), the card tells the story from the posts themselves.
- **One story, one card** (same-story dedup), within 24 hours. A signal tells the same story as a card already posted
  when it has the same cluster, the bot's own producer marked it as an update of that card's alert, or it shares 2+ of
  the card's posts (the producer, `EarlyWaveSource.gs`, also holds back a story whose centroid is within
  `EWS_STORY_SIM_` of one it signalled in the last 24 hours, unless it grew). The rules:
  - **Nothing new:** it is held back without a review. "New" means 2x the accounts on the last card and 3 more, or a
    platform the card wasn't on (or a story first flagged by the early watch reaching the usual 5-account bar).
  - **The story grew:** it is reviewed (Gemini sees the earlier card and what changed). Its card goes in the earlier
    card's thread as `📈 *UPDATE* · More on a story already alerted` with a `*What's new:*` line ("14 accounts now, up from 6; now also
    on Reddit"), without a picture.
  - **Already alerted:** a review that finds the issue already alerted, with nothing materially new, posts no card. In
    the Auto-correct space (setting `cross_alert_notes`), when that alert went out as a Social Alert and its card is in
    the space, one `🔗 *Part of a story:*` note goes under that card instead (see "Notes under cards").
  - **Covered by another alert:** a signal whose main post another alert (Burson's, Direct BigQuery's, a Watch alert)
    covered in the last 24 hours is skipped. In the Auto-correct space (setting `cross_alert_notes`) it is noted under
    that alert's card when that alert went out as a Social Alert, and reviewed as usual when it didn't (see "The
    one-space setup"). A pace jump on a topic or on risk words is never stopped by another alert on its sample post.

  The check runs when signals are queued and again right before each review, so two signals on one story never both
  get a card. A repeat held back counts among the stories let go on C19.
- **Two fixes in every flow, with no setting:** a story is no longer silenced for 24 hours because its signal found no
  room in the review queue; and a signal dropped from the queue without a review (pushed out, waited 3 hours, failed
  twice) no longer leaves its story marked as seen, so the story's next signal gets its review. That can mean one more
  card, in the Mirror space too, and a story the review dismissed can be reviewed once more after a bigger signal on it
  was dropped unreviewed. They can only be taken back by reverting their commits.
- **Ceilings, the old rule** (the Mirror space and a test feed, and the Auto-correct space with the setting
  `early_wave_reviews_per_hour` or `early_wave_reviews_per_day` at 0; constants in the early detection section of
  `BigQuery.gs`): 5 signals queued a check, **40 queued a day** (once 40 are queued the check still reads and clusters
  so active stories stay up to date for tomorrow's first check, and only queueing stops), 2 reviews a run, at most 12
  waiting, each signal reviewed at most twice (a run that dies mid-review counts) and dropped if not reviewed within 3
  hours. So early detection costs at most 40 Gemini reviews and 40 cards a day (80 reviews in the worst case of failed
  retries), plus what producing the signals takes each check (`EWS_*` constants in `EarlyWaveSource.gs`): two read-only
  BigQuery jobs (BigQuery refuses one that would read more than 5 GiB) and at most 400 new embeddings, 20,000 a day.
- **The review allowance** (the Auto-correct space, settings `early_wave_reviews_per_hour: 6` and
  `early_wave_reviews_per_day: 150`): the day no longer stops after 40, so noise early in the day can't use up the
  reviews a serious story needs later. Every story read for the first time is queued, gets its ending, or is left for
  the next check.
  At most **5 are queued a check**, **10 a clock hour** (Eastern), and of those at most **6 ordinary** ones, and
  **150 a day** of every kind (the early watch's 8 a day included). **Serious stories go first** and are not held to the
  6 (still to the 10): an early-watch story, a story with a P0 risk word group, or, when Gemini Decisions answered (rows
  38-40), a chance of medium severity or higher at least the B43 bar; with no answer, a story its tag hint raised. A
  story turned away by the check's 5 or an hour's limit is not finished: it **comes back at the next check** (the
  producer hands it over again), where the serious ones go first again, and it is in none of C19's numbers until it is
  queued or ends. It ends `Never reviewed` only when it is about to drop out of what a check reads (about 40 minutes
  after the producer made it, with B31 at 60 minutes) or when the day's 150 are used. The bot remembers each story it
  put off (at most 150), so one that no later check reads again (checks were skipped while the bot was busy, or busier
  stories filled the 25 a check reads) still gets its ending at the next check that runs: `Seen before, nothing new`
  under its card when its story was carded or queued in the meantime (as it would if a check had read it again),
  otherwise `Never reviewed`. It is counted once and has its row on the Early Detection tab, so C19's never-reviewed
  number covers only stories that have no card. A topic that is only busier than
  usual (a head count on a topic under 3 times its usual, setting `early_wave_topic_min_ratio`) and isn't serious is
  not reviewed: it ends `Topic busier than usual, not a story`; real jumps of 3 times or more, and serious ones, are
  reviewed. Gemini Decisions may make 300 calls a day here (150 elsewhere), 15 a check. Worst case a day: 150 stories
  queued, so 150 Gemini reviews (300 if every review fails once and is tried again), 300 Gemini Decisions calls, at most
  150 story cards or updates and as many Social Alert emails (only for reviews that call for one, and in the one-space
  setup only to the testers in B30), and about 2 hours of run time over the day. The bot remembers a whole day of story
  keys (in the script properties `EARLY_DETECTION_SEEN`, `EARLY_DETECTION_SEEN_2` and `EARLY_DETECTION_SEEN_IDS`).
- **Column C (C19)** says what became of the day's stories in one line that adds up, after the row's ON text: `last
  check Oct 14, 10:15 AM EDT · today: 47 found, 11 cards, 0 under another alert, 12 let go, 19 never reviewed, 5 waiting · the
  Early Detection tab lists each one`. Found is always cards + under another alert + let go + never reviewed + waiting.
  - **found**: story signals the bot noticed today, each counted once. The day runs midnight to midnight Eastern; at
    midnight found starts at the number still waiting.
  - **cards**: signals that ended in a card in the space, an update in an earlier card's thread included (so it can be
    more than the new cards posted).
  - **under another alert**: signals added under another alert's card (`Added under another alert's card`).
  - **let go**: looked at and dropped: dismissed by the review, held back as noise, a repeat with nothing new, a main
    post another alert already covers, not English, a topic only busier than usual, a card Chat would not post.
  - **never reviewed**: signals that got no review, each with its reason on the tab.
  - **waiting**: signals in the review queue right now.
  - A signal first set aside (at the day's limit, or while early signals are OFF) and reviewed later the same day moves
    from never reviewed (or let go) to waiting and then to what became of it; the tab can then show two rows for it.
  - A problem at the last check is in brackets after the time, with `it tries again at the next check`. At the day's
    stop the pointer to the tab gives way to `today's limit of 150 reviews is reached, more after midnight ET` (the
    allowance) or `daily cap of 40 reached, more tomorrow` (the old rule). The line never passes 200 characters and no
    number is cut: the pointer goes first, then the "tries again" words, then the day's stop, then the end of the
    problem's words. The pointer is there only once the bot has made its Early Detection tab (and with the setting
    `early_detection_tab` on).
  - If a count could not be saved, the bot tries again and keeps it for the run; only when it was lost for good is found
    made to add up, and the run log says so.
  - While a new source's row (48 or 49) is ON and that source is failing, the line ends ` · ⚠️ a new source is failing
    (row 48)` (the lowest such row; its own column C says why), after everything else and with room kept for it, so no
    number is cut. Failing: the AMIE table stopped, paused or failing; Brandwatch live stopped, failing, or waiting
    because Brandwatch refused the key or the read (not a wait for the shared login or for "too many calls"). With rows
    48 to 50 OFF the line is exactly as above.
  - The words "cluster" and "velocity" no longer appear on C19.
- **The endings** (each story signal gets one, shown as written on the Early Detection tab): `Card posted: Social
  Alert` · `Card posted: Monitor build-up` · `Card posted: Needs a human look` · `Update added to its earlier card` ·
  `Added under another alert's card` · `Reviewed and dismissed` · `Held back as noise (no review)` · `Seen before,
  nothing new` · `Its main post already has an alert` · `Not English` · `Topic busier than usual, not a story` ·
  `Never reviewed` · `Reviewed, but its card could not be posted`. The reasons a signal is `Never reviewed`, as shown:
  `more than 5 stories arrived in 15 minutes; higher-ranked ones went first` · `this hour's 10 reviews were used` ·
  `this hour's 6 reviews for ordinary stories were used` · `today's limit of 150 reviews was reached` · `today's limit
  of 40 was reached` (the old rule) · `today's 8 early signals were used` · `early signals are switched OFF (row 39)` ·
  `the review queue was full` · `pushed out of the full queue by higher-ranked stories` · `waited 3 hours while the bot
  worked on alerts` · `its review failed twice` · `its saved details were gone when its turn came` · `its details were
  too long to keep for a review`. A story that was put off and then not read again has the reason it was put off for,
  followed by `No later check read it again in time (checks were skipped, or busier stories came first).`; when its
  saved details are gone by then (they are kept 6 hours), its row has no Id and reads `A story whose details are
  gone`. When more than 150 put-off stories are waiting, the oldest end at once with their reason followed by `Too many
  stories were waiting for a later check, so the oldest ones were let go.`; and if the bot cannot save its list of
  put-off stories, those put off in that check end there and then, with their reason alone. A signal whose card reached the space but which the bot could not record is listed as
  `Card posted: Needs a human look` (its story is not posted a second time). The run log has one line for an ending
  that had none before: `early detection: <outcome> · "<story>" · <why>`.
- **Where**: the Mirror space (B9), a Google-only test feed (B3 → B4), or the Auto-correct space standing alone (B10,
  when B9 is blank and the main flow itself cannot post them): never S-F Burson (B25), the Burson test copy (B26), a
  space people outside Google can join, the Other alerts space (B33), row 32's direct mode, or a dry run. The cards'
  `client-zeda-` ids keep the Relay from ever sending them to S-F Burson.
- **Sandbox**: the card itself sends no email, DM or form and writes nothing to BigQuery; a Social Alert draft or T&S
  intake it leads to follows the usual Testing rules (`Control!B30` testers only).

#### Rows 38-47: Fast triage (Gemini Decisions), bar cells, and `early_wave` BigQuery writer

Four switches and five bar cells on the early-wave path (`Decisions.gs`, `FastTriage.gs`, `EarlyWaveSource.gs`), with all switches `OFF` to start; rows 39 and 40 need row 38 `ON` (while row 38 or row 19 is `OFF`, C39 and C40 say what they wait for and do nothing):

- **Row 38 — Fast triage (Gemini Decisions):** enables rows 39 and 40. When rows 39 and 40 are both `OFF`, turning row 38 `ON` by itself changes nothing, makes no Gemini Decisions call, and writes nothing (at the old rule's daily cap of 40 queued signals the check stops reading BigQuery exactly as it does with row 38 `OFF`). When row 39 or row 40 is `ON`, the bot asks `gemini-decision-1` (`POST /v1beta/decisions`, key in Secret Manager `agentic_assistant` sent only in `x-goog-api-key`) six structured questions in one call (`about_google`, `brand_risk`, `independent_reports`, `routine_noise`, `category`, `severity`) over a sanitized summary (headline, signal type, counts, platforms, window and up to 8 post snippets with links, handles, emails and internal IDs stripped).
- **Row 39 — Fast triage: rank and early watch:** asks candidates within this check's call budget, orders both queueing and `edDrainQueue_` so signals with a P0 risk group go first, then P0 > P1 > P2, and within a tier an unanswered signal goes first (never ranked down for a missed call), followed by higher `severity` score and higher `brand_risk` probability (unanswered candidates left over for the next check reuse their cached answers without a second API call). Turning row 39 `OFF` strips the ranking keys from waiting entries so review order goes right back to priority, accounts and age. Row 39 also runs the **early watch** (`EARLY_WATCH`, capped at 8 a day: of the day's 40 queued signals under the old rule, of the 150 under the Auto-correct space's allowance): stories at least at the accounts bar (`B45`, seed `3`) within 180 minutes with 2+ links and a risk-term group, an Exposure Tag hint, or no older story within `EWS_STORY_SIM_` are asked about (up to 5 a check, 30 a day) and raised when `about_google` and `brand_risk` are each at or above `B44` (seed `0.80`), `independent_reports` is at or above `B47` (seed `0.30`), the most probable severity level is `medium` or higher, and its probability is at or above `B43` (seed `0.55`; an answer with no confidence raises nothing). Every raised early-watch signal goes through the full Gemini review before any card; its card's first line reads `⚡ *EARLY SIGNAL* · N accounts so far (a story is usually flagged at 5)`; if its review fails it posts **no** card (retried once up to `ED_QUEUE_MAX_TRIES_`, then dropped; turning row 39 `OFF` drops any waiting early-watch signal unreviewed); and because queuing an early-watch signal marks only its own `alert_id` as seen, when the story later reaches the 5-account promotion bar that promotion goes into the early card's thread as an `📈 *UPDATE* · More on a story already alerted` (`edWatchNews_`), never as a second card.
- **Row 40 — Fast triage: hold back noise:** drops a signal without a full review when it has **no** P0 risk group and **no** taxonomy raise (`ftProtected_`), its most probable severity level is `none` or `low` at or above the confidence bar (`B43`, seed `0.55`), and either `about_google` is at or below `B41` (seed `0.10`) or `routine_noise` is at or above `B42` (seed `0.90`). A held-back signal ends `Held back as noise (no review)` (C19 counts it among the stories let go) and is logged in one line with the signal ID, reason, and probabilities.
- **Rows 41-45 and 47 — Control tab bar cells:** six dropdown-validated cells read on each run (`B41` `Hold-back: about_google at or below` seed `0.10`; `B42` `Hold-back: routine_noise at or above` seed `0.90`; `B43` `Hold-back and early watch: answer confidence at or above` seed `0.55`; `B44` `Early watch: about_google and brand_risk, each at or above` seed `0.80`; `B45` `Early watch: distinct accounts, at least` seed `3`; `B47` `Early watch: independent_reports at or above` seed `0.30`, below the BigQuery switch because rows 41-46 were already on the tab). A blank or invalid cell never turns a feature off; it uses its seed and its Column C note says so. The seeds come from the eight real signals of Nov 6-12, 2026 in `test/decisions_fixtures.json` (3 risks, 5 noise): at them the early watch raises 2 of the 3 risks, and the hold-back drops 3 of the 5 noise signals and none of the risks. With one bar of `0.80` for everything, the early watch raised none: few accounts tell an early story, so `independent_reports` ran at `0.13` to `0.62` on the real risks.
- **Row 46 — Write early-wave records to BigQuery:** writes each check's early-wave records to `brand-social-central-data.early_wave` (`US`) across `story_snapshots`, `story_posts`, `signals`, `signal_events`, and `triage_verdicts` (`ewBqFlush_`). Batches at most one `tabledata.insertAll` request per table per check with a deterministic `insertId` per row, never reads from `early_wave`, includes zero emails, display names, or Burson write-ups, skips while `ctx.slaBusy` or past the run deadline or `ApiGuard` BigQuery ceiling, and on error or timeout logs the table, reason, and dropped row count, pauses that one table for 15 minutes (C46 names it; the other four tables go on), and changes nothing else about the run. A signal gets one `signals` row: one queued or held in a later check than the one that created it is not written again. `triage_verdicts.action` is `ranked`, `kept`, `held_back`, `emitted` or `not_emitted` (`EW_BQ_ACTIONS_`; `infra/early_wave_descriptions.sql` puts that in the table's description). **Before turning row 46 `ON`**, run `verifyEarlyWaveBqLive()` from the editor: it reads the five live tables' schemas (no row written) and lists any column the writer's rows (`EW_BQ_COLUMNS_`) would be refused for; `ready: true` means they fit.
- **Fail-open and ceilings:** any missing secret, HTTP error, HTTP 429 rate limit, safety refusal (`prompt_feedback.block_reason` or `finish_reason`, counted for that signal without pausing the rest), invalid JSON, call slower than 10 s (counts as failed and pauses Decisions calls for 15 minutes), fewer than 20 s left in the run, per-check cap (`15`), daily cap (`150` calls, `300` under the Auto-correct space's review allowance; or the old rule's `40` queued early-wave signals reached), or `ApiGuard` rolling ceiling (`30` in 10 min, `90` in 60 min, tracked in its own bucket so SLA and Gemini/BigQuery ceilings are untouched) falls back to earlier behavior for that signal. `verifyFastTriageLive()` (`LiveVerify.gs`) runs a read-only check on up to 5 current buffer/queue signals and logs `LIVE_VERIFY_FAST_TRIAGE`.

#### Row 20: Check outage & comms docs

OFF, the review is exactly as before. ON, for a
post about a Google outage, a widespread bug or a policy issue, Gemini uses its web search (already on for every review)
to check whether Google has confirmed it or posted a status update, and copies the approved holding statement from a
Resources document when one covers it (in the knowledge-base search, a passage with "holding statement", "reactive
statement", "talking points", "known issue" or "status update" ranks higher; every other passage, and so what Gemini
reads about an unrelated alert, is as with the switch OFF). The bot trusts the "confirmed" call only when Gemini's
answer came with web sources (otherwise it says "searched; no web sources returned" when Gemini searched and got none,
"not checked" when it didn't search, and "unclear" when it had sources but couldn't tell), names the
source without a link (not even a bare web address), and keeps the statement only when it is word for word in that
document: it never writes or rewords one. Analysts see one `Comms / Status Context: …` line under the forwarded alert
(in the auto-correct space, in the change note), and analyst answers know it. The Social Alert email gets a
**Comms / Status Context** section under the Alert Details (Google's status when it was checked, and the holding
statement); while testing it goes only to the stand-in, like any other. Burson never sees any of it. No extra Gemini
call. Column C counts the posts it found context for today, with the last one.

#### Row 21: Track post-alert outcomes

**OFF:** the bot doesn't read anything after the Social Alert is sent, and the Results tab is as it was. **ON:** for a
week after a Social Alert is sent, the bot reads the replies on its email thread (every 30 minutes the first day, then
every 2 hours; at most 5 threads a run) and writes what came of it in the Alert log's `outcome` column, with a short note
under the alert in the analyst space:

- **Resolved**: a reply says it's resolved, fixed, mitigated, rolled back or taken down (not "will be", "not yet", "if"
  or a question; "…and will keep monitoring" or "…, no further action needed" after it is fine);
- **T&S confirmed**: the T&S "WD Intake Request" confirmation email for the post came in;
- **Comms replied**: someone on a comms team (GCPA, People Comms, Exec Comms, Stop Leaks, crisis) or the standard CC
  list replied;
- **Product replied**: the product's own alert contacts (its PAs, gUP, execs) replied.

An alert can have several (`Resolved · Comms replied`, strongest first), and one is never taken back. The bot's own
messages, out-of-office replies (by their subject, or a reply that opens with it, after a greeting at most) and bounces
never count; anyone else's reply counts only when it says it's resolved. When the switch is turned on, the alerts sent in the last week are tracked too,
including any sent while it was OFF, and the list is checked against the Alert log once a day. With it ON, the Results
tab's EVERY ALERT table has an **Outcome** column after "Bot alert ids". It only reads (Gmail's first words of each
reply, never sends anything), so testing and live behave the same; nothing is posted in the Burson space. C21 shows how
many alerts it's tracking, the last check and today's outcomes (the main and auto-correct spaces together). The code is
in `Outcomes.gs`.

#### Row 22: Relay with S-F Burson

**OFF** (the default): the Mirror space (B9) gets Zapier's alerts only, and the bot never posts or reacts in S-F Burson.
**ON**, with the Mirror space set, analysts can work from the Mirror space only, while the bot keeps working every alert
there exactly as before. Every minute, before the bot's own pass (each step with a few seconds of its own; the rest waits
for the next run):

- **From S-F Burson into the Mirror space**: everything, as anyone in S-F Burson sees it, in S-F Burson's own order (an
  item that can't come over yet holds back the ones after it; copies show the time they were posted, up to about a
  minute after S-F Burson's):
  - Zapier's alerts, in their place among the messages, copied exactly as the Mirror copies them (while the relay runs,
    the Mirror's own copying waits for it; C9 says so). An alert that can't be copied holds back what came after it:
    C9 says why and the run fails, as when the Mirror's own copying fails, and it's tried again every run. Still
    failing after an hour, it's given up on, with a note in the Mirror space and a Relay tab row;
  - a reply under a Zapier alert goes under the same alert in the Mirror space, as `Alice Smith (Burson): text`;
  - a message of its own comes over as a message of its own; a reply under it, or under a message an analyst sent,
    lands in the matching thread. A reply in a thread the Mirror space doesn't have (its first message is from before
    the relay was on, or was deleted) comes over as a message of its own, saying so;
  - everyone's, shown as `Name (Burson)` or `Name (Google)` when the **Relay names** tab says, the name alone while it
    doesn't (nothing waits on that tab). A file is named in the text, to open in S-F Burson. An alert a person pastes
    is brought over but never answered (as in S-F Burson).
- **From the Mirror space toward S-F Burson** (when **Burson test copy**, B26, is blank; only while Post in S-F Burson, row 24, is ON as well): nothing goes
  straight there. Each analyst message, reply and emoji becomes a row on the **Burson outbox** tab with the analyst's
  name, Pending, and goes only once a person sets it to Send (see row 24). With Post in S-F Burson OFF, Burson's side
  still comes over, but nothing the analysts write or react is queued, then or later.
  - **When a Burson test copy (B26) is set:** the analysts' messages, replies and emojis go **straight to the Burson test copy (B26)** instead of the Burson outbox (Post in S-F Burson, row 24, can stay OFF), and **nothing is ever written to or queued for real S-F Burson (B25)**.
  - an analyst's reply under an alert (or any message that came from S-F Burson) goes under the same
    message in S-F Burson (or its copy in B26), as `Dana Lee: text`, from the bot's account (Chat can't post as someone else). This works
    for alerts copied before the relay was on too. A reply under an analyst's own message still on the outbox goes
    under it once both are sent;
  - an analyst's message of their own goes as a message of its own, unless it starts with `internal:` or
    `[internal]`: then it stays in the Mirror space, and so do the replies under it;
  - a message that would show internal details isn't sent or queued: the analyst space or the test space (by name, id, or as
    "mirror/test/training space"), forwarding, internal emails, go/ links… The bot says so in its thread, and the
    analyst can post it again. Replies in a thread S-F Burson (or the test copy) doesn't have (under one of the bot's own posts) stay in
    the Mirror space, with one note per thread;
  - a message that holds the first words of one of the bot's notes under cards isn't sent or queued either, as the
    Relay tab says (`not sent: it mentions "Part of a story:"`), and the analyst is told in the Mirror space. Those
    words are: `flagged by the watch` anywhere (in any letter case); `Part of a story` or `Alert requirements` at the
    start of a line (an emoji or a `*`, `_` or `~` mark may come before them), or followed by a colon anywhere
    (`Part of a story:`, `Alert requirements:`, `Alert requirements, final:`); and `Same story:` followed by a number
    and `more post` or `more posts` (`Same story: 2 more posts`). `Same story:` in the analyst's own words is relayed.
    To send such a message, reword it; to keep it in the Mirror space, start it with `internal:`.
- **Emojis, both ways**, on messages posted since the relay was turned on: everyone's emojis in S-F Burson come over onto the
  matching message in the Mirror space; an analyst's emoji goes straight to the matching message in the Burson test copy (when B26 is set) or is queued on the outbox for the matching message in S-F
  Burson (once that message is there). It shows as the bot's account; the Relay tab says who added it. The bot never
  takes an emoji that came over from S-F Burson for an analyst's action (❌ or ✍️ on a copy); if the Relay tab can't be read, it acts on no
  emoji until it can. An analyst's 👎 ("the bot got this wrong") is never sent or queued.
- **Never relayed:** the bot's own work (its notes, answers and emojis stay in the Mirror space), even when it was done
  under another account (for example `poll()` run from the editor): the bot notes each message and emoji it makes.
  The bot doesn't answer the analysts; it may answer Burson's questions in the Mirror space, for the analysts to use or
  not.
- **It starts from the moment a run sees it ON**, and says so in the Mirror space. Only what analysts write from then
  on is sent or queued; nothing written while it was OFF or paused ever is, and OFF is noticed by the very next run (in the
  middle of a run, nothing written after that run read the switch is sent or queued, and no emoji once it's OFF). Into the
  Mirror space, Burson's last 15 minutes come over when it starts. If runs fail before the relay runs (even for a few
  minutes), or no run relays for 10 minutes (the bot wasn't running, or runs came from another account), it starts
  again from then and says in the Mirror space that what was written in between wasn't relayed. When the S-F Burson
  space (B25) or the Burson test copy (B26) changes, it starts again on the new space as when it's turned on; analysts' replies under alerts from the
  old space stay in the Mirror space.
- **When something fails**: an outbox row that fails when sent is Failed with the reason and never tried again by
  itself (set it to Send again to retry). Anything else is tried again every run, in order, and C22 shows the error; one
  that fails 5 runs in a row is given up on: the bot says so in its thread (or in the Mirror space, for one from S-F
  Burson), and the Relay tab has it. A Zapier alert from S-F Burson is tried for an hour instead (above).
- **The Relay tab** (made the first time the relay runs) logs every item: when, which way, what, who, the text, sent or
  why not, and the message on each side. It's also how the bot knows which thread on one side is which on the other,
  and that nothing is relayed twice. C22 says when it last relayed.
- **The Relay names tab**: Chat doesn't give the bot people's names (it signs in as a person, not as an app). Everyone
  the relay or test copy sees gets a row there (their Chat id, where they were seen, an example), with `org` left blank for people seen in S-F Burson. Type `Burson` or `Google` in `org` once, and their name in the `name`
  column: that's how they show on what's copied from then on (`Name (Burson)`, `Name (Google)`, or the name alone while
  `org` is blank). It only sets how people show: everyone's messages come over either way, and nothing waits on it.
  Until a name is typed in `name`, people from S-F Burson show as `Someone` (`Someone (Burson)` once marked) and
  analysts as `Google team`.
- **Before turning it ON:** the relay only runs as the account in "Runs as" (B8). What that account's person types in
  the Mirror space themselves (messages, replies, emojis) is relayed like any analyst's; the bot's own posts and emojis
  never are (it knows them by its message ids, its 🤖 and its record of what it posted), nor an alert pasted there for
  the bot to review. While it can't tell them apart (Chat refusing the bot's message ids, or the emoji pass starting
  over), nothing from that account goes. It needs the Mirror space (B9) and the S-F Burson space (B25): without either
  it doesn't relay, and C22 says so.
  Edits, deletions and removed emojis aren't relayed. The code is in `Relay.gs` and `TestCopy.gs`.

#### Row 23: Never wait on Burson

- **OFF** (the default): as the rest of this README describes. A wrong alert gets ⬇️ and a reply in its thread that
  lists each fix and asks Burson to update and resend it. It waits for Burson's resend: no ❌, T&S form or decision
  until then (an alert that needs a Social Alert still gets it). The resend is then decided. Something only Burson can
  supply (a missing link, a long video's timestamp) is asked for in the thread.
- **ON**: nothing waits on Burson. The bot fixes the alert itself and processes it right away, as it would a correct
  alert: its action emojis, the Social Alert, ❌ or the T&S form. A reply in the alert's thread lists what was wrong and
  what the bot changed, and says the alert was processed, so there's no need to resend it. There's no ⬇️ (no updated
  post is waited for).
  - A long video with no timestamp gets the `[MM:SS]` where Google comes up (Gemini watched it), as the bot's own
    correction: a `[Timestamp]:` line on the corrected alert, a line in the Social Alert email and in the T&S form.
  - Something only Burson knows (for example the link) doesn't hold the alert up: it's processed without it, the thread
    says it was missing, and analysts see `🤖 QA: Link missing (processed without waiting for Burson; Burson was told)`.
  - Burson's resend anyway is the same alert: ⬇️ on the original, and it isn't processed twice (no second ❌, Social
    Alert or T&S form). A resend whose priority or engagement went up is forwarded as a new alert and decided again.
    An alert asked of Burson while the switch was OFF is processed on its resend.
  - Today (B7) counts the alerts corrected (Burson told); the auto-correct space's note lists what was missing as
    "Not fixed: …" (with the switch OFF too); the Results tab says the bot fixed the mistakes itself and went on without
    the missing details; answers to Burson say what the bot changed. Auto-send (row 11) still leaves an alert missing
    something only Burson knows a draft for a person, saying why.
- **Turning it OFF** while an alert decided with it ON could still be resent (48 hours): Burson was told not to resend,
  but if they do, the resend is handled as with the switch OFF, so it can be decided again.
- **In S-F Burson**, what it tells Burson (with the switch OFF or ON) is posted only through Post in S-F Burson (row
  24), like everything else.

#### Row 24: Post in S-F Burson

- **OFF** (the default): nothing is posted, replied or reacted in S-F Burson (the real Burson space, B25) by any
  part of the bot: the fix requests, answers and emojis of the main flow, the analysts' emojis copied over, or the
  relay. Each one is held back: nothing is written or queued, the alert carries on as if it was done (nothing fails
  or is retried), and the run log counts what was held back, for example `S-F Burson: withheld this run (Post in S-F
  Burson is OFF, so nothing was posted or queued): 1 reply, 5 reactions`. Turning it ON later never sends what was
  held back. Analysts get everything as usual: the copies, the emails (the stand-in while testing), the logs.
- **ON**: still nothing goes by itself. Each post, reply and reaction waits as one row on the bot's **Burson outbox**
  tab: Queued (ET) · Kind (post, reply or reaction) · Where (a link to the thread or message) · Text or emoji · From
  (`bot`, or `relay: ` and the analyst's name) · Status · Note. Its Status is **Pending**. Set it to **Send** to post
  it, or **Skip** to never post it. The next run (within a minute) writes it once, from the bot's account, as its Text
  cell says then (so you can edit it first), top to bottom, and sets it to:
  - **Sent**, with the time and a link;
  - **Blocked**, with the reason, when the text names anything internal (the analyst, Mirror or auto-correct space, the
    relay, Zapier, the stand-in, write-backs, automation, "the bot", the Control, Relay, Results or outbox tab, …) or a
    reaction isn't a single emoji Burson may see (👎 never is). Edit the text and set Send again;
  - **Failed**, with Chat's error. It's never tried again by itself: set Send again to retry.

  A Sent row set to Send again never goes twice, and the same post or emoji is never queued twice.
- **Checked right before each write:** Post in S-F Burson and Bot (B2) are read again before every row is written.
  Turned OFF, sending stops at once, and rows still set to Send go back to Pending with a note. A run from another
  account (for example `poll()` run from the editor, not the account in "Runs as") sends nothing: the rows wait, and
  C24 says why. A dry run sends nothing either (the run log says so).
- **The tab is the bot's own:** it's made the first time something is queued, protected with a warning, with a
  Pending / Send / Skip dropdown in each Status cell. A tab named "Burson outbox" that the bot didn't make is never read
  or written: nothing is queued, and C24 says to rename it. Each run sends at most 20 rows (or 20 seconds' worth); the
  bot reads the latest 2,000 rows.
- **C24** says OFF, or ON with how many rows are waiting.
- **Only to the S-F Burson space in B25:** each row remembers the S-F Burson space it was queued for. While B25 is blank
  or can't be found, nothing is sent or queued: rows set to Send wait, and C24 says why. After B25 changes, a row queued
  for the old space is Blocked ("queued for a different S-F Burson space") and never sent to the new one.
- **Never from the test spaces:** the Mirror and auto-correct spaces never write in S-F Burson or queue anything for
  it, even with the switch ON. As a backstop, `Chat.gs` refuses any write to S-F Burson (this run's B25) except an
  outbox row being sent. The code is in `Outbox.gs`.

#### Rows 27 & 28 (with Row 21): The Follow-up tab, Draft follow-ups, and Draft answers to questions

When **Track post-alert outcomes (row 21)** is `ON`, the bot maintains the **Follow-up** tab (right after `Results`),
tracking every Social Alert the bot sent in the last 14 days from both the Mirror/main space and the Auto-correct test
space (`FollowUp.gs`):

- **The tab is the bot's own:** its title is in A1. A tab named "Follow-up" that the bot didn't make is never read or
  written: C21 says it's in the way, and once it's renamed the bot makes its own.
- **Editable follow-up timeframes (`B5:B7` on the Follow-up tab)**:
  - `B5` (**P0**): defaults to `1 hour`
  - `B6` (**P1**): defaults to `4 hours`
  - `B7` (**P2**): defaults to `1 business day` (same ET time on the next weekday)
  - You can edit `B5:B7` to any timeframe between 1 minute and 7 days (e.g., `30 minutes`, `2 hours`, `2 days`, `2 business days`). Your edits are never overwritten by the bot, and `C5:C7` shows how the bot reads each cell.
- **Per-team attribution & testing (`[Team]`)**:
  - Each alert lists every team from its recipient plan (`Search alert POCs`, `GCPA`, `People Comms`, `Regional Leads`, etc.) and whether/when each team replied (`GCPA ✓ 22 min · Search alert POCs —`).
  - While testing, Social Alerts only go to the addresses in `Control!B30`, so you can simulate a team reply by replying on the email thread starting with the team name in brackets (e.g., `[GCPA] On it, drafting a statement` or `[Search] Resolved, we rolled back the change`).
- **Status & concrete Next step**:
  - Every alert gets a status (`Waiting`, `Overdue`, `Question waiting`, `Answered`, `Resolved`, `No reply in 7 days`, or `Not checked yet`) using honest wording (*"no reply seen on the thread"*, never *"nothing done"*), plus a rule-based **Next step** (e.g., following up with silent teams, escalating an overdue P0/surged/press-covered alert to the on-shift lead, answering a team's question, asking for an update after 24 hours, or checking an unconfirmed T&S submission after 2 hours).
- **Row 27: Draft follow-ups (`ON` / `OFF`, starts `OFF`)**:
  - With row 21 `ON`, when a Social Alert passes its `B5:B7` timeframe with no team reply (`Overdue`), the bot creates a Gmail draft on the thread asking the silent teams for a status, plus one second draft a day later while the alert is still unresolved.
  - Drafts wait in Gmail Drafts for an IM and are **never sent by the bot**. While testing, drafts are addressed only to `Control!B30`.
- **Row 28: Draft answers to questions (`ON` / `OFF`, starts `OFF`)**:
  - With row 21 `ON`, when a team asks a question on a Social Alert thread and nobody on our side has replied since, Gemini reads the full question and checks whether the alert, the bot's review, the `Resources` documents, and the `Guidance` tab clearly answer it.
  - When Gemini can answer with $\ge 90\%$ confidence, it creates a Gmail reply draft on the thread (never sent; addressed only to `Control!B30` while testing). When it cannot answer from the bot's context, no draft is made and the `Next step` column says `needs an IM: ...`.

#### Row 32: Work directly in B25 (Google-only), and alerts in other formats

To try the bot on another space and its alerts (for example a campaign space where a monitoring tool posts
`🚨 X Alert: 2026 Midterm Elections / Civics - Negative 🚨` alerts), paste that space in **B25** and set row 32 `ON`
(`Main.gs` `directB25For_`, `directCfg_`). This works that space *instead of* the Burson side; to keep the Mirror
space working S-F Burson's alerts at the same time, use **Other alerts space (B33)** instead (above).

- **Only in a Google-only B25.** Every run the bot checks who can join B25. When only Google people can, the bot works
  right in B25 as it does in the Mirror space: it reads every message, reviews every alert, and posts its notes,
  replies and emojis there directly (no Burson outbox). When people outside Google can join it (the real S-F Burson),
  row 32 does nothing, C32 says so, and everything in "S-F Burson space (B25)" holds. B25 blank or not found: nothing
  runs, and C32 says it's waiting (fail closed).
- **Always 🧪 Testing.** A Google-only B25 is never LIVE (`runMode_`): every email goes only to the testers in B30
  (blank: the stand-in), the T&S form is the test copy, and nothing is queued for S-F Burson. C29 and Status say so.
- **What waits meanwhile.** B3, B4, B9, B10, B26 and the Relay (row 22) aren't used; Direct BigQuery alerts (row 15)
  and the Early wave check (row 19) don't post. Set row 32 `OFF` (or point B25 back at S-F Burson) and all of it
  resumes as before.
- **Burson's alerts keep their review.** An alert in Burson's format (the SOCIAL ALERT layout, the `[Name]` /
  `[Exposure Tag]` lines, or posted by Zapier, Burson or Sonar) gets exactly the SLRR review it gets everywhere.
- **Questions** in an alert's thread are answered there, from the whole knowledge base and the alert's triage. An
  alert someone pastes at the top level is reviewed as an alert, never answered as a question.

**Alerts in other formats** (in the Other alerts space, B33; in B25 with row 32 ON; or in the Mirror space) get their
own triage (`OtherAlerts.gs`). An
alert here is a top-level post with a header (like `X Alert: …`) and labelled lines (Author, Followers, Engagement,
Sentiment, Text, a link) that isn't in Burson's format. One Gemini call reads the post itself (text, media, public
data), the listening feeds (BigQuery), earlier alerts, the Guidance tab, the Resources documents and the web. Then:

1. **SLRR first.** When Gemini is 80%+ sure it's a post SLRR covers (an exposure tag, product and Sensitive Topics),
   the SLRR rules decide, exactly as for Burson's alerts: SLRR's collection threshold (100+ engagements; P0 tags and
   KOF authors have no minimum), the escalation rules and the AI veto. Escalated: a Social Alert with SLRR's routing,
   the 🧑‍💻 protocol and the repeat rules. When the rules would escalate it but the bot can't tell the engagement
   count (a range like `Very Low (0-199)`), or Gemini is only 50-79% sure of the SLRR view: 👍 for a person to check.
2. **Then the stream's own call.** Gemini says what the post is, why it matters to the alert's topic, its risks and
   severity, and calls escalate, flag or no action. Escalate at 90%+ confidence: a Social Alert (its Why says
   `Stream triage: …`). A less sure escalate, or a flag: 👍 (worth a person's look). No action: ❌, or the T&S form
   details when T&S should see it.
3. **Never twice, never a guess.** A post already escalated gets no second email unless the stakes rose. If Gemini
   fails, the alert gets 👍 (needs a person), never ❌ or a Social Alert. KOF status comes only from the alert or the
   listening feeds, never from Gemini.

Each one gets a note in its thread: `🤖 *Triage: ❌ No action* · low`, then *What it is*, *For 2026 Midterm Elections /
Civics*, *Risks*, *Why*, *SLRR view* (the tag, and what the SLRR rules say about it), and the teams, T&S or what to
watch for. The Alert log row says `ingested: Other alert`: the Results tab leaves it out (Burson didn't post it), and
Write back to SLRR BigQuery (row 16) never writes it.

**To steer the triage**, add Guidance rows whose **Applies to** names the stream (for example `2026 Midterm
Elections`), or a criteria document on the Resources tab: Gemini is told they decide the stream's call. The SLRR
rules still decide the posts SLRR covers.

## Live dashboard

**Warning first: after the push that brings the dashboard, the bot's account must approve a new permission before the
bot runs again** (step 2 below). Until it does, the bot's time triggers, the every-minute run included, are paused.

The live dashboard is a web page served by the bot's own Apps Script project (one web app, `doGet` in `Dashboard.gs`). It
shows the bot's work, read-only: what needs a person now and why, the stories forming, the alerts and where each one
stands, what is stuck or held back, and how current all of it is (and what it can't see). It never posts, sends or
changes anything; the only thing it writes is its own short-lived read cache (keys starting `dash1:`). Everything it
shows comes from what the bot keeps; what the bot doesn't keep, it says it doesn't.

- **Control row 54, OFF to start.** OFF, the web app shows nothing and the bot keeps nothing extra for it. ON, it shows
  the bot's work, and the bot also keeps, for each Early Detection story card it posts, the story's posts in order.
- **Who can open it.** The web app runs as the account that deployed it (`appsscript.json`: `"webapp": {"executeAs":
  "USER_DEPLOYING", "access": "DOMAIN"}`), so it must be deployed by the bot's account (steps 3 and 4), and only people
  signed in to the organisation's Google accounts reach it. Of those, it shows the dashboard only to the people the
  bot's sheet is shared with: the bot's own account, the sheet's editors and viewers, or everyone when the sheet is
  shared with the whole organisation or with anyone who has the link. Anyone else sees a page that says the sheet is
  not shared with them and asks them to ask the sheet's owner to share it (it shows no address but their own). Once
  shared, it can take up to 10 minutes to let them in. A share through a Google Group is not seen (Drive names the
  group, not its members, and checking the members needs a permission the bot does not ask for): such a person is told
  to ask to be added by name. Someone Google does not name (a blank address) gets a plain text answer, not a page.
- **Nothing else of the bot can be run from it.** Every other public function of the bot (`setup`, `poll`, `status`,
  `refresh…`, `start…`/`stop…`, `verify…`, …) refuses a call from the web app as its first step
  (`webViewerCall_`): a time trigger, a form trigger and the owner's own runs in the editor go on as before.
- **The link.** C54 has the web app's link once it is deployed (step 3), or says it is not deployed yet.
- **An older link.** A deployment runs the code it was made with. When the bot's code is newer than the deployment's
  (row 54 ON writes the newest build id to the script property `BOT_BUILD`), the page says so at the top, with the
  exact command that brings it up to date, its deployment id read from the link (step 4).
- **How current it is.** "Updated 14 s ago" and every "3 min ago" are counted from the bot's own clock (each answer
  carries it), so a viewer's wrong device clock can't make the page look fresh or late.
- **When the bot was running (Control row 56).** With row 56 ON ("Speed numbers: leave out when the bot was not
  running"), the dashboard also shows what the bot's run log (the "When the bot ran" tab) says; OFF, none of this is
  read or shown, and the dashboard is exactly as before:
  - **The Now strip**, under the counts: "When the bot ran (last 7 days, from its run log):", then one line for each
    stretch of the last 7 days when the bot was not running, paused (Bot OFF), failing or not known, newest first, in
    the run log's own words and times (for example "The bot was not running from 2026-10-14 08:36 to 2026-10-15 02:37
    ET."; a stretch still going says "(still going at its last run)"; at most 10, then "And N more stretches in the
    last 7 days: see the "When the bot ran" tab."). With no such stretch: "It was running the whole time in the last 7
    days." (or "since its run log started"). When the run log started within the 7 days: "Its run log starts <time>:
    before then, not known." When no run is recorded for more than 10 minutes: "No run is recorded after <time> (more
    than 10 minutes ago)." When its tab can't be read: "Not known: the "When the bot ran" tab could not be read
    (<why>)." Before its first record: "Not known yet: its run log has no record. It starts at the bot's next run with
    row 56 ON."
  - **What this page can't see** gets one more item: "When the bot was running before <time>" (the run log starts
    then; older speed numbers can't be checked against it), or "When the bot was running" when the run log has no
    record yet, or when its tab can't be read (what to do: "Open the bot's sheet: the tab must keep the title the bot
    wrote in A1.").
  - **Caught early** shows the Head start tab's six new headline lines with the others, and under each story's head
    start its "Speed check: …" (the tab's "Speed check: was the bot running?" cell, for example "Speed check: not
    comparable: the bot was not running from … to … ET"). Until the Head start tab is next rebuilt (every 10 minutes)
    it says: "The Head start tab has no "Speed check: was the bot running?" column yet: the bot adds it at its next
    rebuild (every 10 minutes)."
  - **An alert's timeline** (the panel that opens on an alert): Burson's alert that waited more than 10 minutes from
    reaching the space to the bot picking it up gets one more line right after "The bot picked it up": "It waited <n>
    min for the bot to run", followed, when the run log knows why, by its words (for example ": the bot was not running
    from … to … ET", or ": not known: before the bot kept its run log (… ET)").
  - **Pressure, "How hard the bot is working"** (row 51 ON): "Pick-up time" is as before (every pick-up of the day).
    Under it, one more line: "Leaving out alerts posted before the bot came back after a stop, a pause or failing runs
    (row 56): 90% within 62 s (14 alerts since 9:14 AM)", the same pick-ups without the ones that only waited for the
    bot to run, kept from the first run row 56 was ON that day ("none counted yet today" before the first one). While
    the run log has no record yet or can't be read, that line says it is not known, and why.

Deploy it (from the repository's `apps-script-chat-bot/` folder):

1. Push the code, the web app's `.html` pages and the manifest:
   ```sh
   clasp push -f
   ```
2. **Right after the push**, open the Apps Script editor signed in as the bot's account (the account in "Runs as", B8),
   run **`setup`** once and approve. Google requires the bot's account to approve the new "edit Google Slides"
   permission (`https://www.googleapis.com/auth/presentations`, for Slide deliveries); the bot's time triggers pause
   until it does, so do this at once. `setup()` is safe to run again: nothing is posted twice, and the Control tab keeps
   what people set.
3. Once, make the web app's deployment **as the bot's account** (the account in "Runs as", B8): the web app runs as
   whoever deploys it, so a deployment made from another account would open decks, run "Run now" and send its emails as
   that account. Either sign clasp in as the bot's account first and check it:
   ```sh
   clasp logout && clasp login   # sign in as the account in Control B8
   clasp deploy --description "Live dashboard"
   ```
   or, in the Apps Script editor signed in as the bot's account: Deploy, New deployment, type Web app, Execute as Me,
   Who has access: anyone in the organisation. It prints the deployment's id (`clasp deployments` lists it again). The
   link appears in C54 at the next run with row 54 ON.
4. After every later push, bring that same deployment (and so the same link) up to date, again as the bot's account:
   ```sh
   clasp deploy -i <deploymentId>
   ```
   (or in the editor: Deploy, Manage deployments, Edit, Version: New version).
5. Check the account: open the link. When the web app runs as another account than the one in B8, the page says so at
   the top ("This web app runs as a different Google account than the bot"); deploy again as the bot's account (step 3).
6. Set row 54 to ON, and share the bot's sheet with the people who should see the dashboard.

## Slide deliveries

**Warning first: nothing is delivered until the bot's account has approved editing Google Slides once** (step 2 of
"Live dashboard" above). Until then C55 says it is waiting.

A delivery puts a "Brand safety pulse" slide in a Google Slides deck on a schedule: the top issues of a window of time,
with plain numbers, a short summary linked to the posts it cites, and what was done about each. People set deliveries up
in the web app's Slide deliveries area; the bot builds and places the slides.

- **Control row 55, OFF to start.** OFF, nothing is delivered; deliveries can be set up in the web app and wait. ON, the
  run keeps one time trigger (`dashDeliverDue`, every 5 minutes) that delivers each delivery when it's due, and removes
  that trigger when row 55 is OFF again.
- **Who can set one up.** The people who can edit the bot's sheet (as for its Control tab), into a deck they can open
  themselves (Viewer is enough: the bot's account does the writing); the deck's title and slides are shown only to
  them. Readers of the sheet see the deliveries but not New, Edit, Preview or Run now. A preview built afresh asks
  Gemini, so each person can build a few new previews every 10 minutes (the last one they built shows again at once,
  for the time it was built, while its settings stay the same). While the bot is paused (Control B2 OFF), nothing is
  previewed, run or delivered, and C55 says so; a delivery that came due meanwhile runs within 5 minutes of B2 being ON.
  While the web app runs as another account than the bot's (Control B8), no deck is checked, previewed, saved or run
  from it (the page says so at the top).
- **Set one up** (web app, Slide deliveries, New): paste the deck's link (the deck must be shared with the bot's account
  as an editor; the web app names the account to share it with), pick where in the deck the slide goes (between which
  slides), the design (copy the look of a slide you pick, which must have a title box when the slide is replaced each
  run, or the deck's own), how far back
  to look (1 hour to 30 days), the schedule (days, time, time zone; Monday can cover the weekend; or each slide covering
  the time since the run before, which "Match" offers when the times between runs differ, and never takes away while it
  leaves no gap and no overlap), and the options (count the bot's own finds, link
  sensitive posts, replace the slide it put there the time before or add a new one each time, who gets an email that it
  was delivered). Preview, then save.
- **What a slide holds.** The title, the window it covers, and up to three issues (most alerts first): Burson's alerts
  always count, the bot's own finds only when the delivery says so. For each issue: the numbers (alerts, accounts,
  platforms, engagement, change from the window before), a short summary written by Gemini with links on the posts it
  cites, and a status line (what was done, who has it, whether readers need to do anything). An alert is counted once:
  a resend with the alert it resends, the rows two flows recorded of one post together, the bot's own find on a post
  Burson alerted with Burson's, on the slide of the window in which the bot first recorded it. Alerts with no issue name
  are counted on a line of their own; no alerts in the window at all: the slide says so. A Social Alert sent while the
  bot was Testing went only to the testers (and a T&S form to its test copy), and the status line says so; the
  Auto-correct and the Other alerts spaces are always Testing, and only the teams of a LIVE send are named. The bot
  records its mode (LIVE or Testing) from the start of each run while row 55 is ON (the script property
  `SLIDE_MODE_LOG`); a Social Alert sent before that record starts, or while row 55 was OFF, says "not recorded". The
  positive pulse slide is shown as not available: its source isn't known yet.
- **When Gemini does not answer** (busy, a quota, a network fault), a scheduled delivery waits and tries again for up
  to 2 hours after its scheduled time (the list shows it as waiting, since when and until when), then gives up on that
  slide and says when the next is due; Run now and Preview say to try again. A summary Gemini wrote that can't be used
  (a post it may not cite, a web address, Markdown, a number not in the facts) is asked again, three tries in all, and
  the run then fails with the reason, delivering nothing; an answer refused or cut off on Gemini's side fails at once.
- **A spot changed** in the web app moves the delivery's slide to the new spot at the next run (replace mode).
- **One slide, as previewed.** When the words would run past the slide's text box at the deck's own size, the bot sets
  the text of that slide smaller (only on the slide it placed) and says so in the run's note. The preview draws the
  slide in the deck's own text boxes, with the same words and that same size, so it shows the slide as it will land.
- **What it never does.** It changes no slide but the ones it placed itself, posts nothing in Chat (nothing goes to S-F
  Burson or the Burson test copy), and emails only the testers (B30) while Testing (nobody while B30 is blank).
- **Where deliveries are kept.** The bot's own `Slide deliveries` tab (its title in A1 marks it as the bot's). A tab of
  that name the bot didn't make is left alone, and the web app says so.

## When the bot ran (Control row 56): the run log, and Burson's alerts posted while it was OFF

**Why.** Every speed number on the Results and Head start tabs counts from the time Burson posted the alert. When the
bot was not running for a while (the every-minute trigger stopped, it waited for a permission after an update, its runs
kept failing, or Bot was OFF), the alerts Burson posted meanwhile waited for it, and that wait counted as the bot's own
minutes: the Results tab's "Typical minutes from Burson's post to the email (median): the bot" jumps after such a
stretch, and falls again as those alerts leave the 24-hour and 7-day windows. And the alerts Burson posted while Bot was
OFF were skipped for good, so a Head start story could read "No Burson alert found" or a head start it never had. Row 56
lets the bot keep a record of when it was running, so the new speed numbers can leave that time out.

**Kept only from the moment you turn row 56 ON.** Before then the bot kept no record of when it was running, so nothing
older can be corrected: those alerts are counted as "not known", never guessed. The numbers you see today stay as they
are; the new ones are shown next to them, each with its own label.

**Control row 56, OFF to start.** Only a person turns it ON; the bot only ever writes OFF there. With it OFF the bot
reads and writes nothing for it, and every tab is exactly as it was. Turned OFF later, the two tabs below stay as they
are (nothing more is added to them); turned ON again, the time it was OFF reads "Not known".

**The "When the bot ran" tab** (made by the bot the first time row 56 is ON, at the end of the sheet, protected with a
warning). One row for each stretch of time, oldest at the top:

| What the bot was doing | From | To |
|---|---|---|
| Running | the start of the first run | the end of the last run |
| Paused: Bot (B2) was OFF | the start of the first run with Bot OFF | the start of the first run with Bot ON again: no run is made in between, and the last one found Bot OFF (when you set B2 back ON is not recorded). After more than 10 minutes with no run, the end of the last paused run, and a "Not running" row follows |
| Failing: its runs stopped with an error | the start of the first run that failed (Details has the error, as B5 showed it), or the start of a run that Apps Script stopped part way (Details: "the run that started at … ET ended without finishing (Apps Script stopped it)"), also when that was the first run after a stop | the end of the last failed run, or the start of the run that found it |
| Not running: no run was recorded | the end of the last run | the start of the next run, when more than 10 minutes passed with no run (the same 10 minutes after which B6 "Last check" means the bot has stopped) |
| Not known | the end of the last run before row 56 was turned OFF (or before the tab could not be written) | the start of the first run after it was turned ON again |

Every time on the tab is one a run recorded (its own start, or the end of its run); none is estimated. Before the
tab's first row, when the bot was running is **not known**. The last row's "To" says "still going" until the bot does
something else. A run that stopped with an error counts as failing at once, also for the Results and Head start tabs it
rebuilds at its end. The hidden columns E-H are for the bot. A run that finds the run before still going does nothing
and records nothing (the run before covers that time). The tab keeps the last 60 days, and at most 20,000 rows (the
oldest 1,000 go first); A2 then says how far back it reaches.

**Burson's alerts posted while the bot was OFF.** When Bot (B2) is set back ON after a pause that the run log
recorded, the bot reads the Burson spaces its flows read (the Burson space B3, or S-F Burson B25 when the Mirror or
the Auto-correct space reads it; never the Mirror space, the Other alerts space B33 or the Burson test copy B26) from
the start of the last run before the pause to the first run after it, and lists every Burson alert posted there on
the **"Burson while bot OFF"** tab: when Burson posted it, its issue, its link, product and exposure tag, the space,
and the pause it fell in ("While the bot was OFF (ET)"). It only reads: nothing is reviewed, posted, reacted to or
emailed, and no flow's place in the space moves. It reads a page or two each run (after everything else, never while
an alert is waiting), and at most 10,000 messages per space per pause (the paused row then says from when it stopped).
The paused row on "When the bot ran" says how many were listed. These alerts then count as "posted while the bot was
OFF" on the Results and Head start tabs, instead of going missing.

- **Only the alerts posted during the pause count as posted while the bot was OFF.** The list starts at the start of
  the last run before the pause, which may not have read what Burson posted after it started, so an alert posted
  shortly before Bot was set OFF is listed too. Its "While the bot was OFF (ET)" cell then says "Not while OFF: …" and
  what the bot was doing when it was posted, for example "Not while OFF: posted while the bot's runs were failing,
  before Bot was set OFF (2026-11-18 08:08 ET)" (such an alert may have been reviewed then). It is never counted as
  posted while the bot was OFF. Only an alert whose cell gives the pause's own times is.
- The post key is the one in the alert as Burson wrote it: if the bot would have corrected the link, a listed alert can
  miss its match. The tab keeps 60 days and at most 5,000 rows.

**What to look at.**

1. The "When the bot ran" tab: every "Not running", "Paused" or "Failing" row is time the new speed numbers leave out.
   A "Not running" row you didn't expect (a stopped trigger, a wait for a permission after an update) is worth a look
   at the Apps Script Executions list for that time.
2. On the Results tab, compare the usual "Typical minutes from Burson's post to the email (median): the bot" with the
   first line under SPEED WHILE THE BOT WAS RUNNING. A big gap between the two means alerts waited for the bot to run;
   "Alerts left out" says how many.
3. On the Head start tab, the "Speed check: was the bot running?" column says for each story whether its race counts,
   and why not.
4. The "Burson while bot OFF" tab: the alerts the bot never reviewed because Bot was OFF. Nothing was emailed for them
   by the bot.

**A tab of yours with one of these names** is never written: the bot does nothing for it and C56 says to rename it;
once it is renamed, the bot makes its own (the time in between is "Not known").

**What it keeps.** The script properties `RUN_LOG_OPEN` (where the run log stands: the stretch still going and its
last recorded end; written only with row 56 ON, once a run) and `RUN_LOG_OFF_TODO` (pauses waiting to be listed, at
most 5); and, with row 56 ON, a second list of the day's pick-up times in `RUN_LEDGER` (`pc`, without the alerts that
waited for the bot to run). Turning row 56 OFF leaves the two `RUN_LOG_…` properties as they are, and the next run
drops that second list.

## One-time setup (whoever installs it)

1. The Apps Script project (`.clasp.json`) must use the Cloud project `brand-social-central-data` (**Project
   Settings → Google Cloud Platform project**). That project needs the **Google Chat API** and the **Vertex AI API**
   enabled. Both are already used there.
2. Push the code:
   ```sh
   cd apps-script-chat-bot && clasp push
   ```
   This replaces the old prototype in that Apps Script project. To bring the prototype back, see
   [`archive/apps-script-prototype/`](../archive/apps-script-prototype/README.md).
3. In the Apps Script editor, run **`setup()`** and approve the permissions. Until you do, the prototype's old
   triggers fail every minute. `setup()`:
   - creates the sheet, with the Control tab pre-filled for testing (SLRR Test Feed (Burson Sim) → SLRR Triaged
     Alerts) and S-F Burson space (B25) blank: paste S-F Burson's link there (see "S-F Burson space (B25)");
   - removes the prototype's triggers and everything it left in the script properties, then starts the every-minute
     check;
   - posts a one-line hello, with the sheet's link, in the analyst space;
   - logs the sheet's link, the two spaces, and whether Gemini works.

   It's safe to run again: nothing is posted twice, and the Control tab keeps what people set.

Other functions in `Main.gs`, for whoever installs it:
- `status()` prints the Control tab plus details of the last run, and what the knowledge base could read.
- `listMySpaces()` prints every space the account is in, with links to paste into the Control tab.
- `tryAlert()` shows what the bot would say about `TRY_ALERT_TEXT`, without posting anything, and which documents the
  review got.
- `refreshKnowledge()` (`Knowledge.gs`) reads every document on the Resources tab now and logs what it found.

For production, run `setup()` from a dedicated account rather than a personal one. The bot posts as that account, and
treats that account's own replies in alert threads like anyone else's.

## Testing in the test feed

Paste real Burson alerts into **SLRR Test Feed (Burson Sim)**. Within a minute you should see the following:

1. **A correct alert**: 👍 on it, and the same text in SLRR Triaged Alerts.
2. **An alert with mistakes** (try `TRY_ALERT_TEXT` from `Main.gs`): 👍, a numbered fix list in its thread, and the
   corrected alert plus a `🤖 QA corrected:` line in SLRR Triaged Alerts.
3. **A question** in that thread ("why is the product wrong?"): an answer in the thread.
4. **The fixed alert pasted again**: 👍 on it, ⬇️ on the original, and nothing new in SLRR Triaged Alerts.
5. **✍️ on the forwarded copy** in SLRR Triaged Alerts: ✍️ appears on the alert in the test feed.

Pasting from your own account works: the bot tells its own posts apart by message id and the 🤖 prefix, not by
sender.

**Emails while testing.** While in Testing mode, enter your email address in `Control!B30` (`Testing: send to`) so every Social Alert goes out
from the bot only to `Control!B30` (nothing is sent while `B30` is blank). The Gmail client itself refuses any email addressed to anyone else (To, Cc or Bcc;
sends, drafts and draft updates), so no code path can reach a distro, and the Workspace form is never submitted.
The switches keep to this: an auto-sent alert, the urgent T&S email, a watch update or anything else a switch sends goes
only to `Control!B30`, and an auto-submitted T&S form is the test copy.

## What the bot is doing: the Results tab

The **Results** tab of the bot's sheet (it used to be the Speed tab, and an existing Speed tab is renamed) shows, in
plain numbers, what the bot did with the alerts Burson posted in the last 7 days, next to what the IMs did with the
same alerts. One alert is one Burson post: the Mirror space's and the auto-correct space's reviews of it are counted
together (the bot sent a Social Alert when either space did; its time is the first email), and a resend counts with the
alert it resends. It's matched with the IMs' Social Alert on the post's link, never the subject line. Rows from old
test feeds are left out.

From top to bottom:

- **What's happening**: 4 to 6 plain sentences Gemini writes from the numbers below. Every number in them must be one
  of the tab's numbers; otherwise (or when Gemini is down) the tab shows a summary computed from the same numbers, and
  says so.
- **Headline numbers**, last 24 hours and last 7 days: alerts, alerts with mistakes, the mistakes the bot fixed, what
  only Burson could add (e.g. a missing link), Social Alerts sent by the bot and by the IMs, how often they made the
  same call, the alerts only one of them sent, minutes from Burson's post to each side's email, who sent first and by
  how much, and the T&S forms the bot prepared.
- **Speed while the bot was running** (only with Control row 56 ON, "Speed numbers: leave out when the bot was not
  running"; see below). OFF, this section is not there and the tab is exactly as before.
- **What Burson got wrong**, by field (Product, Exposure Tag, Summary rewritten, Link missing, …), with an example.
- **The two test spaces** side by side: the Mirror space (the bot asks Burson to fix) and the auto-correct space (the
  bot fixes it itself), and any alert where they made a different Social Alert call.
- **By day**, the last 7 days.
- **Where the bot and the IMs differed**: the latest alerts only the IMs sent, and only the bot sent, with the bot's
  reason.
- **Every alert**, one row per Burson post.

Minutes count from when Burson posted the alert in the live space; the speed numbers use only the alerts both the bot
and the IMs sent a Social Alert for. The IMs' time is their email from brand-social-sends@ for the same post, in this
mailbox, else their SLRR Assistant draft (`slrr_feedback.alert_sends`). The IMs sent a Social Alert when there's a draft,
an email, or the post is in the SLRR alert log; no sign of one a day later means they didn't. When the bot sent the
Social Alert itself (Auto-send, row 11) their call is "Bot sent it".

The tab updates right after a run that handled an alert or sent an email (at most once a minute), and every 10 minutes
otherwise. Run `refreshResults()` to rebuild it now (`refreshSpeed()` still works). Settings: `speed_tab`,
`speed_days`, `speed_im_table`, `speed_log_table`, `speed_im_sender`, `speed_gmail`.

### Speed while the bot was running (Control row 56)

**Why.** The speed lines of **Headline numbers** count from when Burson posted each alert. When the bot was not running
for a while, the alerts Burson posted meanwhile waited for it, and that wait counted as the bot's own minutes (see
"When the bot ran (Control row 56)" above).

**What you see.** With row 56 ON, a section right under **Headline numbers** (whose lines do not change), for the last
24 hours and the last 7 days:

| Line | What it counts |
|---|---|
| `SPEED WHILE THE BOT WAS RUNNING (Control row 56: leaves out the times it was not running)` | the section's title |
| `Typical minutes from Burson's post to the email (median): the bot, only the alerts it was running for the whole time (see the note below)` | the same minutes as the usual line, over the same alerts (both the bot and the IMs sent a Social Alert, both times known), but only those where the bot was running the whole time from Burson's post until its email was ready |
| `Typical minutes the alert waited for the bot to run (median): from Burson's post to the bot picking it up` | from Burson's post to the time the bot picked the alert up (recorded on its Alert-log row as `seen_at`); only alerts with that time recorded |
| `Typical minutes the bot waited for Burson to resend an alert it asked Burson to fix (median): from picking up Burson's alert to picking up the resend` | only for an alert the bot asked Burson to fix and resend: from the bot picking up Burson's alert to the bot picking up the resend (this wait is Burson's, not the bot's) |
| `Typical minutes of the bot's own work (median): from picking the alert up to its email being ready` | from the pick-up to the moment the bot's email was ready: when it went out, or, for a draft, when the bot made the draft. For an alert Burson resent, from picking up the resend the email was made from |
| `Typical minutes a person took to send the bot's draft (median)` | from the bot's draft being ready to a person sending it (counted in drafts) |
| `The bot's email went out first, leaving out those alerts` | as the usual line, over the same alerts as the first line of the section |
| `The IMs' email went out first, leaving out those alerts` | the same |
| `Alerts left out: they waited, or were being worked on, while the bot was not running, paused or failing` | how many alerts of the usual lines were left out because the bot was not running, paused or failing between Burson's post and its email being ready |
| `Alerts left out: not known whether the bot was running (before its run log began, or while row 56 was OFF)` | how many were left out because the run log can't say (before it began, a time row 56 was OFF, or its tab could not be read) |
| `Burson's alerts posted while the bot was OFF (never reviewed; on the "Burson while bot OFF" tab)` | the alerts the bot listed when Bot was turned back ON, posted during the pause itself, once per post; a post the bot reviewed after all, and an alert listed from before the pause, are not counted here |

Each median shows how many alerts (or drafts) it is of, for example `1.5 (2 alerts)`; `—` when there are none. A note
under the lines says since when the run log is kept, that before then it is not known whether the bot was running, and
the stretches of the last 7 days when it was not running, paused, failing or not known (the latest 5, with their
times). When the bot's email was about one of its own alerts from BigQuery and went out before Burson posted,
nothing waited for the bot: that alert counts with the ones it was running for, at 0 minutes, as on the usual line.

**Never estimated.** Every number is between two recorded times: when Burson posted (`source_at`), when the bot picked
the alert up (`seen_at`), when its email was ready (`email_at`), when a person sent it (`email_sent_at`), and the ends of
each stretch on the "When the bot ran" tab. An alert whose times the run log can't cover is counted as "not known",
never guessed. If the "When the bot ran" tab can't be read (for example a tab the bot didn't make has its name), every
alert is counted as not known, and the note says why.

**OFF** (the default): the section is not there, the bot reads neither the "When the bot ran" tab nor the "Burson
while bot OFF" tab for it, and the Results tab is exactly as it was.

### The Head start tab: this app's own alerts next to Burson's and the IMs'

The Results tab counts only the alerts Burson posted. The **Head start** tab (`HeadStart.gs`) is about the alerts this
app raised itself: Early Detection cards and early signals (row 19), Watch alerts (row 35) and Direct BigQuery alerts
(row 15), told apart by the Alert log's `ingested` column. It answers: how often did this app alert a story before
Burson did, how often before the IMs emailed, by how much, and which stories and which posts did it have first. It has
no switch and no Control tab row ("How it works" there has one line about it). Control row 56 (`Speed numbers: leave
out when the bot was not running`, OFF to start) adds the speed check below to it; with row 56 OFF the tab is exactly
as described here. It only reads the Alert log and its own
tab, and writes only its own tab: nothing is posted in any space, nothing is emailed, Gmail and BigQuery are not asked,
and the Alert memory is not touched.

- **A story** is one of this app's alerts and its updates, counted once and timed from its first alert: an Early
  Detection card that updates an earlier card belongs to that card's story, and so do two of this app's alerts on the
  same post. The time is when the alert was posted in Chat. A row whose time is not a real date (a text, a number no
  date can hold) is left out: this app's alert is not a story then, and Burson's row does not count.
- **Burson's alert** on the story, and the tab's "Matched on" column says which rule gave it, so you can judge it.
  Two rules are sure: `same post` (Burson alerted one of the story's posts) and `same story` (Burson's alert on another
  post carries the story's exact issue name and the later of the two is an Ongoing Issue: what a review records when it
  takes an alert for an issue already alerted; Burson's other alerts under that name then count too). The story is
  measured against the **earliest** alert those two give, taken together: Burson's first alert on the story. So when
  Burson alerted the story on another post before it alerted the story's own post, the earlier alert counts, and when
  Burson had the story before this app did, this app was behind, however soon after it Burson alerted the same post.
  Only when neither gives an alert, two weaker matches are tried (check them): `same story (same issue name)` (the
  same issue name and no more, never under two different exposure tags) and `same story (similar wording)` (the same
  exposure tag and issue names alike). The same-story rules look 14 days either side of the story. Burson can be
  earlier or later than this app.
- **Burson's alert on the same post** is shown beside that, whatever the story-level answer is: Burson's first alert on
  one of the story's own posts, and this app's head start on the post. Mostly it is the same alert. It differs when
  Burson's first alert on the story was on another post: one of this app's alerts that its own review took for an
  issue Burson alerted days before (its name, an Ongoing Issue) reads `behind by 13 d` on the story, and its row still
  shows that this app had that very post, say, `10 min` before Burson. The story-level numbers are not changed by it.
  The head start on a post is from this app's own alert on that post, not from the story's first alert: a post that a
  later card or update of the story brought is measured from that card, and its cell then says when this app alerted
  it (`behind by 10 min (from this app's alert on this post, … ET)`). When Burson alerted several of a story's posts,
  the row shows the one Burson alerted first, and the headline line counts each of those posts (it counts posts, not
  stories).
- **No Burson alert found** is not the same as "Burson never alerted it". Burson's later alert takes a story's issue
  name only when this app's alert went out as a Social Alert. An alert that was only to be watched (an Early Detection
  card to monitor, for one) is found again only on its own posts, on an identical issue name, or on similar wording
  under the same exposure tag, and such a card often has no exposure tag. So "this app alerted first" is, if anything,
  undercounted, and a story in this count may have been alerted by Burson under another name.
- **The IMs' email** is the IMs' time for that Burson post as the Results tab has it (their email, else their draft),
  taken from the Results tab's rebuild in the same run. The Results tab shows Burson's alerts of the last 7 days only,
  so the Head start tab keeps each story's IM time itself, in three hidden columns at the far right of its tables (the
  Burson post's key, the time, and whether it is their email or their draft), and reads them back before each rebuild
  (when Sheets doesn't answer for that read, the rebuild writes nothing and the tab stays as it was, so no time is lost).
  For a Burson alert the Results tab shows, the Results tab's answer is used, also when it has no time for it. For an
  older one, the time is the one the Head start tab last had, so the 30-day numbers cover 30 days. A remembered time
  is only as old as the tab: there is none for a Burson alert that was already older than the Results tab's days when
  the Head start tab was first made, or when its story first came onto it.

From top to bottom: the title and what's counted; **Headline numbers** for the last 7 and the last 30 days (stories,
those Burson alerted too, this app first and its median head start, Burson first and the median time behind, no
Burson alert found, the posts this app alerted before Burson alerted the same post with the median head start on the
post, this app's alert before the IMs' email and the median time between them, and Burson's alerts with how many of
them are on a story this app had alerted first: those that came after a story this app was first on); **Biggest head
starts** (the ten longest over Burson's first alert on the story); **Every story**, newest first. A head start reads
`2 d 15 h`, `3 h 10 min` or `45 min`, and `behind by 20 min` when this app was later; the same in plain minutes is in
columns of its own (`… (min)`), to sort by. The last columns you see are the post-level ones: `Burson on this post (ET)`,
`Head start on the post`, `Burson alert on this post` and that head start in plain minutes (the three hidden columns
after them are the bot's own: leave them as they are; a column you hide yourself stays hidden). A cell is blank where
there is no Burson alert (on the story, or on one of its posts) or no IM time.

The tab is made the first time this app has an alert of its own to show, and is rebuilt at most every 10 minutes, in a
run where the Results tab was rebuilt (10 more minutes without one and it is rebuilt with the IMs' times it
remembers). It is never rebuilt in a run that is still catching up on alerts (a flow held an alert for the next run,
handled as many messages as a run may, or ran out of time): it waits for a run that has caught up, so it never keeps
an alert waiting. Run `refreshHeadStart()` to rebuild it now: it keeps the IMs' times the tab remembers, and newer
ones follow at the next run that has them. The tab is the bot's own (its title in A1 says so): a tab named "Head
start" that the bot didn't make is never read, cleared or written. The log says so at each rebuild, and the Control
tab's Status (B5) from the next run on, until the first rebuild after the tab is renamed.

#### The speed check (Control row 56 ON)

**Why.** The numbers above count every race, also one in which the bot was not running. After a stretch with no runs
(a stopped trigger, a wait for a permission after an update, runs that fail) this app's alerts come late, so they read
as Burson wins. Burson's alerts posted while Bot (B2) was OFF are never on the Alert log, so a story then reads
`No Burson alert found`, or a head start over a later alert of Burson's on another post. And a story is measured
against Burson's first alert on the whole issue, up to 14 days earlier, so a story whose issue Burson alerted days
before reads `behind by` days, even when this app had that very post first.

**What it adds.** With row 56 ON the bot keeps its run log ("When the bot ran" tab) and lists the Burson alerts posted
while it was OFF ("Burson while bot OFF" tab; see "When the bot ran (Control row 56)" above). The Head start tab then
shows, next to the usual numbers, which never change:

- Six more lines under **Headline numbers**, right after `Of Burson's alerts, those on a story this app had alerted
  first (same post or same story)`, for the last 7 and the last 30 days:

  | Line | What it says |
  |---|---|
  | `Race on the same post, while the bot was running: median head start over Burson ("behind by" when Burson was first)` | The headline race: over every post of these stories that Burson alerted too, where the bot was running the whole time from one alert to the other, this app's alert on that very post against Burson's first alert on it. One median over both sides (`behind by` when it is below 0), with how many posts it is of: `38 min (2 posts)`. `—` when there is none |
  | `Race on the same post, while the bot was running: posts this app alerted first, and posts Burson alerted first` | `2 this app first, 1 Burson first, 1 the same minute (of 4 posts)` |
  | `Burson alerted the issue first, on another post (not counted as a win or a loss)` | The stories whose first Burson alert was on another post of the same issue (one of the three same-story rules) and came before this app's alert: `1 story: median 11 d 1 h earlier`. Never counted as a win or a loss. A story that is a later alert on an issue this app itself alerted first (an earlier story of this app's was ahead of that same Burson alert) is not counted here either |
  | `Not comparable: the bot was not running, paused or failing between the two alerts` | The races left out because the bot was not running, paused (Bot OFF) or failing at some point between the two alerts: `3 posts, 3 stories (see "Speed check")` |
  | `Burson's alerts posted while the bot was OFF and never reviewed (listed when Bot was turned back ON)` | Burson's alerts on the "Burson while bot OFF" tab posted during a pause in those days and never reviewed, each post once, and how many of this app's stories were matched with one: `2 alerts; 2 of this app's stories matched one` |
  | `Not known: from before the bot kept its run log` | The races the run log can't speak for: from before row 56 was turned ON (the run log starts then), or later than its last record, or every race when the "When the bot ran" tab can't be read: `1 post, 1 story` |

  Each median has the number of posts or stories it is of next to it, as the usual lines have theirs.
- One more note, right under the note on matching (`Matched on: …`): `The lines from "Race on the same post" on leave out
  every race in which the bot was not running, paused or failing between the two alerts (the "When the bot ran" tab,
  kept since <time> ET): …`. It also names any listing of an OFF stretch that did not list everything
  (`Listing of an OFF stretch not complete: …`), and says so when the run log can't be read or has no record yet.
- One more column in **Biggest head starts** and **Every story**, after the three hidden columns: `Speed check: was the
  bot running?` (column V, shown). For each story it says, joined with `;`:
  - `the bot was running the whole time` (the race the row shows is comparable);
  - `not comparable: the bot was not running from 2026-10-14 08:23 to 2026-10-15 02:24 ET` (or `the bot was paused
    (Bot OFF on the Control tab) from … to … ET`, `the bot's runs were failing from … to … ET`; `… and 1 more stretch`
    when there were more);
  - `Burson alerted this while the bot was OFF (posted … ET)` (with `; the bot picked it up when Bot was turned back ON`
    when the bot reviewed that alert after all);
  - `Burson alerted this issue 11 d 1 h earlier, on another post: not counted as a win or a loss`;
  - `this app alerted this issue first (QA-1234, 2026-11-16 10:00 ET); this is a later alert on it: not counted as a win
    or a loss`, naming this app's own earlier story;
  - `race on the same post not comparable: …` or `race on the same post: the bot was running the whole time`, for a
    race on one of the story's own posts that the row's own race doesn't already speak for (a post that a later card
    brought is raced from that card);
  - `not known: before the bot kept its run log (… ET)` (or `not known: no run recorded after … ET`);
  - blank for a story with no Burson alert.

**What it never does.** Every time in it is a recorded one (the run log's own run starts and ends, the alerts' own post
times): nothing is estimated, and what the run log can't say reads `not known`. A gap of 10 minutes or less between
runs counts as running. Burson's alerts listed while the bot was OFF are added for the speed check only: they never
reach the Alert log or the usual numbers, and the usual cells (`No Burson alert found`, a head start over a later
alert) stay as they were, with the speed check column saying what really happened. Only an alert posted during the
pause itself counts as posted while the bot was OFF (one listed from before the pause does not). The speed check reads
the run log and the OFF list once per rebuild, posts and emails nothing, and writes only the Head start tab. Every cell
of it is at most 45,000 characters. When it can't be worked out, the tab is still rebuilt as usual and its note says
so.

**Turning it OFF.** At the next rebuild the tab is as it was before: the six lines, the note and the column are gone
(the column is cleared), and nothing of the run log is read. `refreshHeadStart()` reads row 56 on the Control tab too.

### The Early Detection tab: every story it found and what became of it

The **Early Detection** tab (`EarlyDetectionTab.gs`, setting `early_detection_tab`) lists every story signal Early
Detection (row 19) found, in every space it works in, and what the bot did with it. A **row** is one ending of one
signal: a group of posts from small accounts that tell the same thing (a story), or a jump in how many accounts post
on one topic. It has no switch and no Control row ("How it works" there has one line about it), posts nothing, emails
nothing and writes nothing to BigQuery.

- **Top to bottom:** row 1 its title, the bot's mark (`Early Detection: every story it found and what happened to each
  (written by the Burson QA bot)`); row 2 what's listed; row 3 today's numbers, the same ones as C19 (`Today (2026-11-15):
  47 found · 11 cards · 0 under another alert · 12 let go · 19 never reviewed · 5 waiting. Updated 10:15 AM ET.`); row
  4 the column names, frozen; from row 5 one row per ending, newest first. The last 2,000 are kept (the oldest at the
  bottom go).
- **Columns:** `When (ET)` · `Outcome` (one of the 13 endings under "Row 19") · `Story` (the review's headline when the
  story was reviewed, else a plain title from its posts, linked to the main post; for a topic count, `Topic: Search &
  Shopping, 36 accounts in an hour (1.9x the usual)`) · `Why` (one sentence in plain words, for example `Looks like
  routine chatter (90% likely), severity low (57% sure).` or `First seen 10:51 AM with 5 accounts; 8 now, not yet twice
  as many.`) · `Card` (the card's Alert-log id, linked to its message, when there is one) · `Kind` (`Story`, `Early
  signal (3-4 accounts)`, `Pace jump (story)`, `Pace jump (topic)` or `Pace jump (risk words)`) · `Accounts` ·
  `Platforms` · `Exposure Tag (first guess)` (after a card, the card's own tag; else the quick check's answer,
  `Content - Negative reaction to owned social post (32% sure) · severity low`; else the risk words in plain words,
  `Risk words: Privacy or data leak`; else `-`) · `Id`.
- **What was posted:** only rows whose Outcome starts `Card posted`, `Update added` or `Added under` are in the space.
  The others were not posted, and Why says why (`Never reviewed`: the bot did not get to review it).
- **Rows never change** once written. You can sort them. Every cell is plain text: a headline such as `2026-11-15` or
  `404` stays as it is, and nothing is read as a formula; the Story and Card cells are links.
- **When it is written:** in each run's last block, beside the Head start tab, only with 30 seconds of the run left and
  never in a run that is still catching up on alerts. Rows a run could not write wait for the next run, for up to 6
  hours (at most 200 rows); if more pile up, the tab gets one row `N outcomes were not recorded (the runs were full)`.
  A run that is cut off leaves its rows for the next one. Waiting rows live in short-term memory: if Google drops it,
  which is rare, they are lost without such a row.
- **Row 3** is as of the last write (its date and time say when); a run with time to spare writes it again when C19's
  numbers changed, so it says what C19 says.
- **Made once:** the bot makes the tab at the start of the first run with row 19 ON (and the setting on), with its
  header rows and `Today: nothing yet.`, after the report tabs (Results, Learned precedents, Follow-up, Analysis, Head start), so no tab
  moves. Only then does C19 end with `the Early Detection tab lists each one`. Row 2 is written only when the tab is
  made.
- **A tab named "Early Detection" that the bot didn't make** (or whose title in A1 or a column name in row 4 was
  changed) is never read, cleared or written. C19 then has no pointer, and Status (B5) says, after the Head start note:
  `The Early Detection tab isn't being updated: a tab named "Early Detection" that the bot didn't make is in the way (or
  its title in A1 or a column name was changed). Rename that tab, and the bot makes its own.` Once it is renamed, the
  sentence goes at the next run with time.
- **Turned off** (`early_detection_tab: false`): no tab is made, read or written, nothing waits, and C19 has no pointer.

**Under the open engine (Control row 51).** The tab also says why a signal that waited out its 3 hours was never
reviewed when the open engine held its review (`today's safety stop of 2,000 reviews was reached (Burson's alerts went
on)`, `the day's run time was nearly used, so only serious stories were reviewed`, or, with the queue full, `it waited 3
hours while N more serious stories were reviewed first`); it gets a row `Check skipped` when a check that was due is not
made (Burson's alerts waiting, ApiGuard, or the run time nearly used: one row a check). These rows are no story's ending:
C19's numbers do not count them. Rows that wait for a run with time are kept in up to 10 cache values (2,000 rows), and
C51 says how many wait once they pass 200.

### The Engine tab: what each check read, judged and could not do (Control row 51)

While Control row 51 is ON the bot keeps a tab named `Engine` (A1: `Engine: one row per Early Detection check, what it
read, judged and could not do (written by the Burson QA bot)`): one row for each Early Detection check, newest first, and
a row for each day, 7 days kept. A row gives the minutes since the check before, the posts read (by source), kept and
embedded, the check's seconds, the signals and what was queued or held, the quick looks asked, the reviews, Watch and
Direct cards since the check before, the runs and their seconds, the run time of the last 24 hours against its budget
and the step, the runs that let Burson go first, Burson's pick-up time, ApiGuard's holds and Gemini's "too busy", the
outside calls, the checks skipped, the day's counts toward the safety stop, and the requirements check's counts (alone
read, code pass, gated, failed), and the first screen's (posts, calls, picked, sent on unscreened, bad answers, its
slowest round, its tokens and its largest round's, its thinking, why it was off); a new day's first check also writes
the first screen's rows for the day before (posts, calls and picks by source; the time it was off and why; its known
test post missed). Columns no step fills yet stay blank. Every cell is short. A tab named `Engine` that the
bot did not make is never touched (C51 says it is in the way). With row 51 OFF there is no Engine tab.

## T&S pre-filled link

When T&S should see an alert, the note under it has a link that opens the T&S Intake Form with the answers already in.
The analyst checks them and clicks Submit; the bot never submits it (unless the Auto-submit T&S form switch is ON: see
above).

| Question on the form | What the bot puts in |
|---|---|
| [Title_Prefix] WD Intake Request | Marketing ("so we get credit") |
| Google Product: | The alert's product as one of the form's choices: AI Overviews is Search (AI Overviews), Gmail is Workspace, Maps/Geo is Geo (Maps), and so on; Other when the form has no choice for it |
| Topic Impacted: | From the Sensitive Topics and exposure tag, first match: Child Safety; perceived bias; violence, hate or crime; scams, privacy or malware; politics (Geopolitical Dynamics for wars, countries and borders, else Major Civic Events); wrong, dangerous or offensive results; else Miscellaneous |
| Link / URL(s) in question: | The post's link |
| What's the Issue? | The summary, the engagements and network, and the video timestamp if the summary lacks it |
| Additional screenshots/notes etc: | The screenshot's link (Burson's, except of a sign-in prompt; else an image or frame from the post) |

The link stays under 2,000 characters (What's the Issue is shortened first), so the Chat note is never cut. The question
ids are in `TnsForm.gs` (`TNS_FORM_FIELDS_`), read off the form on Oct 18, 2026. If T&S changes the form, put the new
ids in the script property `TNS_FORM_ENTRIES` as JSON (for example `{"url": "entry.123"}`). To read them without being
an editor of the form, open it, open the browser console (Cmd+Option+J) and run
`copy(JSON.stringify(FB_PUBLIC_LOAD_DATA_[1][1].map(q => [q[1], q[4] && q[4][0] && q[4][0][0], ((q[4] && q[4][0] && q[4][0][1]) || []).map(o => o[0])])))`.
(The old link's `entry.290320498` for Marketing is no longer a question on the form.)

**While testing** (a stand-in set, as now) the link opens a **test copy** of the form instead, never the real one:

- The bot makes it in the tester's Drive the first time it needs it: "T&S Intake Form (test copy, only you)", with the
  same questions and choices. It isn't shared with anyone. To make it now and get its links, run `setupTnsTestForm()`.
- Submitting it sends nothing to Trust & Safety. The tester gets a stand-in for T&S's confirmation email,
  "Issue [#TEST-…]: WD Intake Request (test copy)", and the bot marks ✍️ just as it would for the real one.
- If the copy can't be made, the note says so and has no link (the bot tries again an hour later).
- Going live (no stand-in), the same notes link the real form. The test copy stays in your Drive; delete it whenever.

## Going live

Paste the link of **[S-F] Burson Automated Alerts V3** into **S-F Burson space** (B25), if it isn't there already, and
into **Burson space** (B3). If the analysts move to a new space, paste its link into **Analyst space** (B4). The bot
then reviews S-F Burson's alerts, but it posts nothing there: Post in S-F Burson (row 24) decides, and even ON, only
the Burson outbox rows a person sets to Send go. With the link in B3 but not in B25, the bot isn't live: it only reads
there, and C3 and Status say why.

- The bot starts with the last 15 minutes of the new space, not its whole history.
- Test and live alerts are tracked separately, so the switch never mixes them.
- To go back to testing, paste the test feed's link (or its name) back into B3. Leave B25 as it is: the Mirror,
  Auto-correct and Relay read it.
- The switches (rows 11-24) don't change when the space does. While `escalation.stand_in` is set, everything they send
  still goes only to the stand-in, even in the live space; see "The switches" for what each does live.

## What Gemini can change

The bot's own rules fix renamed tags and topics, removed products, network vs link, priority vs tag, engagement vs
count, KOF lists and "already reported". Gemini also reads each alert and checks six fields: **exposure tag, product,
Sensitive Topics, KOF, issue name and summary wording**.

- At **90% confidence or more**, the bot fixes the field for analysts and asks Burson to change it.
- Below 90%, analysts get a `🤖 QA check:` line to double-check, and nothing goes to Burson.

To change this, edit the `burson_qa:` section of `config/default_config.yaml`:
- `llm_min_confidence: 0.9` is the confidence needed.
- `llm_fix_severities: [blocking, warning]` covers all six fields. Set it to `[blocking]` to limit Gemini to exposure
  tag, product and Sensitive Topics. KOF, issue name and summary then become double-check notes.
- In the Auto-correct space (B10) the agentic assistant decides instead: `autocorrect_min_confidence: 0.6` is the
  confidence there (never on a field the rules already decided, a KOF the listening data's KOF lookup confirms
  included, never to blank a value, never on the summary, and only for the checks `llm_fix_severities` covers), and for
  Gemini's call that the alert is an existing issue; below it Burson's value stays, and there's no double-check note.
  `autocorrect_writeup: true` has the same review call write the summary paragraph there (see "The auto-correct space").

KOF comes from Burson's own lists: `[KOF]: Viral KOFs (KOFs)` or `[KOF]: CAM Tech/AI (INFs)` means the author is a KOF,
whatever the engagement, and the Engagement line keeps the level for the count (that's how Burson writes them and how
the SLRR log records them). Gemini can't turn a listed author into "No".

**Web search.** When reviewing an alert or answering an analyst, Gemini can search the web (Vertex AI's Web Grounding
for Enterprise) for what Burson's write-up doesn't say: news coverage, whether a claim or incident is real, who the
author is, and whether Google has responded. Answers to Burson never search. `web_grounding: enterprise | google | off`
switches it; if Vertex AI refuses the tool, the bot retries without it and leaves it off for 6 hours. The searches and
sources Gemini used are in the run log. In the Auto-correct space, the write-up's background comes only from them and
the note names them (`Sources: …`). The Early Detection review searches too, and so does the Watch alerts' pre-read
for the Auto-correct space; there, what their cards say from the web (a Watch alert's background, a story card's
`*Web:*` line) is shown only when the answer came back with web sources.

**Earlier alerts.** Gemini also sees earlier alerts: the bot's own from the last 14 days and the SLRR alert log's, for
the same author (90 days), for the same post, and for any post this one replies under or quotes (whoever posted it),
with the teams the Incident Manager sent each one to. It uses them to tell whether a post is a follow-up on an alert
that already went out (`follow_ups`, `follow_up_min_confidence`), and to route the same story the way the IM did. A
reply under an alerted post is a follow-up for certain (the thread comes from the post's public data, not a guess);
whether it adds anything new is Gemini's call.

**The post itself.** Before the review the bot looks up the post (`post_lookup`): on X (the data X serves for
embedded posts) and Bluesky (its public API), its own words, the posts above it in its thread, the post it quotes, and
its video and photos; on TikTok, the caption and the video's cover image (TikTok shows the video only to people signed
in); on Instagram, the caption and the first image (a reel's cover), from the public page Instagram serves for embedded
posts, when Instagram shows it to Google's servers (it can refuse); YouTube videos Gemini watches directly. Reddit and
Facebook show posts only to people signed in (Burson can't open them either: its alerts say "screenshots are not
available" for them), so there, and when Instagram refuses, the review checks Burson's write-up against **the post as
the listening feeds captured it**, the same text Burson writes from:
- Pendulum's pieces of the post's text: the caption, text read off its images and video frames, a transcript, a machine
  description of the image, plus Pendulum's own summary and issue name (`bsip-s-bsip-gg-26-2cf3.google_bg.sonar_raw`);
- Brandwatch's snippet of the post, from the DSD story selection feed (`DSD.DSD-story-selection`) and Brandwatch raw
  mentions (`raw_data.brandwatch_raw_mentions_base`).

Gemini gets this for any post the feeds have, on any network; where the bot has the post's own data, that wins. It's
all read from BigQuery: the bot never calls the Brandwatch API on alert reviews, so none of it counts against Brandwatch's mention
allowance. The run log notes what the review had, for example `feed text: Pendulum: description, ocr · Brandwatch`.

**Video and audio.** Gemini watches and listens to the whole video, start to finish (every second, sampled at one
frame a second with the full soundtrack), and reports its length, what happens across it, the key words spoken, the
on-screen text, and where Google comes up. Vertex AI reads a video from its link only up to 15 MB, so the bot picks the
largest file of the post's video under that; a longer video is copied to Cloud Storage (`media_bucket`, under
`burson-qa-bot/staging/`, up to 50 MB: about 45 minutes of an X video, Gemini's own limit with audio) for the review and
deleted right after (a 38-minute X video took Gemini 83 seconds). The copy goes from the download to Cloud Storage
without ever being read into the script (reading a 17-50 MB video into it ran Apps Script out of memory, Oct 24-26), and
a Bluesky video, whose size its post record gives, is never downloaded just to learn its size. If Gemini can't open a
video (too long, private, blocked), it looks at Burson's screenshot or a frame of the video instead, and then the alert
text alone. Analysts see a
`🤖 QA: Gemini watched and listened to the post's video (3:13 long): …` line under the alert.

**The run's time.** A review with a video or audio clip is started only with 90 seconds of the run left: a clip can
make it run long, and a call can't be stopped once started. Pictures (photos, a frame, a cover, Burson's screenshot)
go whatever time is left: a review with them takes no longer than one without (Oct 21-24: median 37 s and p95 80 s
with photos, 46 s and 133 s from the text alone). When a run is too short for an alert's video, the alert waits for the
next run, which reviews it first, with its video (about one run later: 4-5 minutes while alerts are coming in); the run
log says `held … for the next run`. It doesn't wait when that wouldn't help or could pile up: never the first message
a run handles (every run reviews at least one), not in a pass that didn't have the time for a video review when it
started (the auto-correct space, while the main flow is busy), not twice, and not once it's been in the Burson space 10
minutes (a backlog isn't slowed down). Then Gemini gets a still of the post instead, and the alert says
`🤖 QA: The bot was short of time, so Gemini didn't review the post's video (…) and had only a still of the post. Check
the post yourself`. A post whose media Gemini couldn't review says so too (`🤖 QA: Gemini couldn't review …`). Until Oct
26, a review that started with under 90 seconds left the post's media out altogether, photos included, and nobody was
told: 89 reviews in Oct 21-24.

**KOF alerts.** Gemini may ❌ an alert escalated only because the author is a KOF (`kof_no_alert`), the way IMs do,
when it's at least 90% sure and one of its no-alert checks holds that the bot can back up: a duplicate of an alert that
went out, a comment on (or reply under) an alerted post, the same story already alerted another way (the bot's own
alerts or the SLRR alert log, tied to this post by the thread, the same post, Burson's wording, or Gemini 80%+ sure),
or the leads' current guidance (the Guidance tab or their emails). It also checks whether the alert is a mistake (not
about Google, the claim isn't in the post, wrong author, not negative) or has nothing actionable, but that reading
alone doesn't ❌ a KOF alert unless `kof_no_alert_judgment` is on: on 24 KOF alerts from May–June it called 15 a
mistake or not actionable (90%+ sure) and the IMs had sent 8 of those 15. When a KOF alert goes out anyway, Gemini's
reading goes to the run log; P0 and Sensitive Topic alerts are always escalated.

**The leads' guidance.** The **Guidance tab** of the bot's sheet holds the SLRR leads' current instructions (one per
row: **Guidance**, **Applies to**, **Until**, **Added by**). A row whose Until date has passed is ignored. Gemini also
reads the leads' (Kelsey's and Jon's) emails from the last 7 days about alerts or escalation in the mailbox the bot runs
as (`guidance_from_email`, `guidance_email_days`).

**Switches that change the review.** KB & Guidance can start alerts (row 13), Learn from IM calls (row 17) and Check outage & comms docs (row 20) change what Gemini is asked and what the bot does with its answer; each is OFF unless turned ON. See "The switches" above.

**Screenshots.** The Social Alert email shows a picture of the post under the summary, linked to the post: Burson's
screenshot of the post when the alert has one (X, Bluesky and others), else the post's own photo, a frame of its video,
or the video's cover image. If it can't be fetched, the email goes without it. Burson's screenshot of Instagram,
Facebook, Threads, LinkedIn, TikTok, Reddit or YouTube is never used, in the email, in Gemini's review or in the T&S
form: those sites show anyone not signed in (Burson's screenshot service too) a welcome or sign-in prompt over the post.
The email shows the post's own image instead when the bot has it (on Instagram, the first image or a reel's cover), else
no picture. The run log says when Burson's screenshot was skipped.

**Team emojis.** ⚖️ Civics follows a Sensitive Topic when the topic (or a KOF author) is why the alert is urgent: under
2,000 engagements, IMs add Civics to ~90% of those. For an alert escalated on 2,000+ engagements alone, they add it to
only ~30% (Politics, Privacy, Child Safety), so there it's Gemini's call (a real political, legal or government angle);
Medical and Violence topics still get it at any engagement. 💬 gUP also takes privacy posts about people's own Google
accounts and settings, even when the product is Brand.

## Settings

Behavior settings live in the `burson_qa:` section of `config/default_config.yaml`: reactions, copying analyst
emojis, dry run (nothing posted in the Burson space), the Gemini settings above, and the 48-hour window for matching
a resend. The taxonomy and emoji legend are in the same file.

The switches on the Control tab need no YAML and no rebuild; their thresholds are constants in the `.gs` files (see
"The switches"). After any change to the YAML, regenerate the bot's data file, then push:

```sh
.venv/bin/python -m scripts.build_apps_script && (cd apps-script-chat-bot && clasp push)
```

**The seven rollback settings** (under `burson_qa:`, each on by default). Each one turns off one part of what the
Auto-correct space does, without a code change and without a Control switch. Set it to `false` (or `0` for a number)
in `config/default_config.yaml`, rebuild `Generated.gs` and push, as above. Turned off, the bot does what it did before
that part was built: it does not go silent. None of them changes what the bot posts, queues or emails outside the
Auto-correct space (the Early Detection tab lists every space's stories, so `early_detection_tab` turns it off for all).

| Setting | Default | What it switches | Turned off (`false` or `0`) gives back |
|---|---|---|---|
| `early_detection_first` | `true` | In the one-space setup, Early Detection's check and reviews run before the Direct BigQuery poll; and a story card that sent no Social Alert doesn't stop the post's own BigQuery card or close a watch flag on its post | The poll first, as before; a story card stops the post's own BigQuery card and closes the watch flag |
| `early_detection_claim_members` | `true` | While Control row 50 (the Watch's AMIE source) is ON, every post a story card links is remembered as that card's, as its main post is (see "Every post of a story card" above). With row 50 OFF it does nothing |
| `early_wave_reviews_per_hour` | `6` | The review allowance: ordinary stories taken for review in a clock hour (with 10 an hour of every kind, 5 a check, serious stories first) | `0`: the old rule, 40 queued a day, exactly as before (the topic rule then stops too) |
| `early_wave_reviews_per_day` | `150` | The allowance's stories queued a day (only while the hourly rule is on) | `0`: the old rule too, as with the hourly setting at 0 |
| `early_wave_topic_min_ratio` | `3` | A topic only busier than usual (a head count under 3 times its usual) that isn't serious is noted, not reviewed (only while the hourly rule is on) | `0`: such topic counts are queued and reviewed, as before |
| `early_detection_tab` | `true` | The Early Detection tab, and C19's pointer to it | No tab is made, read or written; nothing waits; C19 has no pointer |
| `cross_alert_notes` | `true` | Three lanes' notes under another alert's card: Early Detection's (a story on a carded post or repeating an alert), the Watch's (`Also flagged by the watch`, and its `Same story` reply as a note under its alert's card) and the Direct BigQuery poll's (`Part of a story` under a card whose post is in a story); a story on a post whose card sent no Social Alert reviewed rather than skipped; one issue, one Social Alert email; and a bigger post (2,000+ engagements) on an issue already alerted getting its own card | No such notes; the `Same story` reply goes in the thread as it used to; a story on a post another alert covers is skipped (now counted: `Its main post already has an alert`); a story and a post's own card send two emails; no extra card for a bigger post |
| `requirement_line` | `true` | The `Alert requirements` line in the note after each review (and its `final` form), and the BSIP card's `[KOF]: Yes (<list>)` line (which can start a Social Alert at any size) | No such line, every note as before (an alert with nothing changed gets no note); an `Alert requirements …?` question from the bot's account is answered either way; the BSIP card's `[KOF]` line says `No` again |

C15, C19 (its new line), C34, C35 and the Watch sources tab's new words have no setting: they post nothing.

**The open engine's settings** (Control row 51; each read only while row 51 is ON, but for the record of run time):

| Setting | Default | What it sets |
|---|---|---|
| `open_daily_stop` | `2000` | The day's safety stop: background reviews an Eastern day; the quick looks (10x), Watch post checks (100x) and background BigQuery GB (1.5x) follow from it |
| `open_runtime_budget_hours` | blank | The account's daily trigger run time. Blank: 6 hours on a Workspace account, 1.5 on any other (the bot reads which kind once a day under row 51, keeping only "Workspace or not") |
| `open_runtime_other_hours` | `1.5` | Run time kept for other scripts on the account (at most half the budget) |
| `open_fetch_day` | blank | Outside calls a day. Blank: 100,000 on a Workspace account, 20,000 on any other. Burson's reserve (twice its busiest pass of the last 7 days) comes off first |
| `open_lock_loss_seconds` | `2` | What a run that found the lock taken costs in the record |
| `open_burson_pickup_p90_s` | `120` | Burson's pick-up time (p90, seconds) past which each run keeps more of its time for Burson |
| `open_check_minutes` | `5` | How often Early Detection checks under row 51 (10 from 60% of the day's run time, 15 from 70%) |
| `open_velocity_fix` | `true` | Velocity under row 51: a late post never changes an hour already counted, and only posts read within the lag count |
| `open_velocity_lag_minutes` | `60` | That lag (raise it to 120 if Sonar's posts usually reach the bot later) |
| `open_equal_lanes` | `true` | Every source's fresh post may start a story under row 51 (a late one only joins) |
| `open_fresh_minutes` | `180` | A post read later than this after posting is late |
| `open_lane_bars` | blank | Measured same-story bars by source (JSON); blank: the property `OPEN_LANE_BARS`, else today's bars |
| `open_hold_none_at` | `0.8` | A signal whose most probable severity is none at this or more is held back (never one with a P0 risk group) |
| `open_requirements_first` | `true` | Requirements first under row 51: every post read is checked against the alert requirements code can decide (counted on the Engine tab) |
| `open_first_screen` | `true` | Under row 51 with `open_requirements_first`: Gemini reads the posts left to a judgment 25 at a time first, and only those it marks (and 1 in 50 of the others) get the one-post quick look; `false` gives back the quick look alone |
| `open_queue_max` | `24` | The review queue's size under row 51 (a story that does not fit waits for a later check) |

## After you deploy

- **Deploy when no answer of the bot waits on the Burson outbox.** This only matters while LIVE with Post in S-F Burson
  ON (row 24). An answer the old code queued whose text holds a note's first words (`Alert requirements`, `Part of a
  story`, …) is Blocked at Send by the new version. If one is waiting, edit it and set it to Send again.
- **Approve the new permission right after the push** ("Live dashboard", step 2): until the bot's account approves
  editing Google Slides, its time triggers are paused.
- **Nothing on the Control tab needs changing.** The next run adds rows 54 (Live dashboard) and 55 (Slide deliveries),
  both OFF, and moves "How it works" to row 57; rows 52-53 stay as they are.
- **What appears by itself**, at the next runs (each run writes column C and Status again): row 19's new ON text, the
  new lines in C15, C19, C34 and C35, and Status (B5) when a tab named "Early Detection" is in the way. The Early
  Detection tab is made at the start of the first run with row 19 ON. The notes under cards and the `Alert
  requirements` line show with the next alerts reviewed in the Auto-correct space.
- **Run `setup()` once** for the new "How it works" lines: the help is written only by `setup()` (and when the bot adds
  a row to an older Control tab). `setup()` is safe to run again: nothing is posted twice, and the Control tab keeps what
  people set. In the one-space setup (B3 or B4 blank), `setup()`'s result and Status (B5) say that the Burson space or
  the analyst space (whichever is blank, or both) is blank, C3 or C4 says `✗ check this link`, and Today (B7) is
  cleared. Ignore this and leave B3 and B4 as they are (filling both in ends the one-space setup): the next run, within
  a minute, puts Status back to Working, C3 back to `— not used (working in Auto-correct space, B10)` and C4 back to
  blank. The new "How it works" lines are already written by then.

## What only a live run can show

The tests run the bot against fake Chat, Gemini, BigQuery and Sheets. These need a look at the live bot:

1. That the Early Detection tab is written in live runs (it needs 30 seconds of a run left, in a run not catching up
   on alerts): watch row 3's "Updated" time and Status (B5).
2. That `story card` and the `Related alert` line are links that open the right card (real message names).
3. The real number of story reviews an hour, Gemini and Gemini Decisions calls a day, and run time.
4. That the producer returns its two risk facts (`risk_groups`, `tag_raised`) on the live table: which stories count as
   serious depends on them.
5. **A week of the feed's `influencer_list` values**, before relying on the BSIP card's KOF line: it says `Yes` (and
   can start a Social Alert email) for any list the feed names, except Google-owned channels and Google reps. Check
   that every list it names is a KOF list.
6. That the watch's `Also flagged by the watch` note lands under real cards, a card only a minute old included.
7. How many Direct BigQuery cards come through in the busiest hours with stories first.
8. The size of what the bot keeps on real data: the script properties `EARLY_DETECTION_TODAY`, `SWITCH_NOTES` and
   `EARLY_DETECTION_SEEN`, `EARLY_DETECTION_SEEN_2`, `EARLY_DETECTION_SEEN_IDS` (each must stay under 9 KB), and the
   cache values `ed_tab_waiting` and `ac_thread_notes`.
9. That the `Alert requirements` lines on a week of real Burson alerts say what the bot then did.
10. How many extra cards and Social Alert emails the bigger-post rule and the KOF line bring.
11. That Apps Script lets the bot count its outside calls (it wraps `UrlFetchApp` for the run): if it does not, the
    record says the calls were not counted, C51 shows no call count, and only the run-time guard acts. Also the
    account's real daily trigger run time and outside calls (the budgets start from Google's published figures,
    which the plan marks as not verified), and how long a run that found the lock taken really costs.
12. With row 56 ON, after the bot was paused or stopped for a while: that the "When the bot ran" tab shows that stretch
    with the times the Apps Script Executions list shows; that the "Burson while bot OFF" tab lists the alerts Burson
    posted meanwhile and nothing was reviewed, posted or emailed for them; and, with rows 54 and 51 ON, that the
    dashboard's Now strip lists the same stretch and its second pick-up line no longer jumps after the stop.

## Files

| File | What it is |
|---|---|
| `Main.gs` | `setup()`, `status()`, `listMySpaces()`, `tryAlert()`, and `poll()`, the every-minute run (one at a time: a run that finds another still going skips); at its end, the live dashboard's build id (row 54) and the slide deliveries' time trigger (row 55); with row 56 ON, each run taken into the run log at its start and end |
| `Control.gs` | The Control tab (with its switches, rows 11-24, 27-29, 32, 34, 36-40, 46, 48-51, 54, 55 and 56, and the S-F Burson space, row 25), and the Resources and Guidance tabs |
| `RunLog.gs` | When the bot ran (row 56): the run log ("When the bot ran" tab, with its place in the script property `RUN_LOG_OPEN`), the listing of Burson's alerts posted while the bot was OFF ("Burson while bot OFF" tab, `RUN_LOG_OFF_TODO`), and the readers the Results and Head start tabs and the dashboard use (`runLogRead_`, `runLogCheckIn_`, `offListed_`, `offListedWhileOff_`, …) |
| `Dashboard.gs` | The live dashboard web app's entry point (`doGet`) and who may open it (`dashAccess_`: the people the bot's sheet is shared with); `webViewerCall_`, the first line of every other public function, which refuses a call from the web app |
| `DashboardData.gs` | What the live dashboard shows (row 54), read-only from what the bot keeps; with row 56 ON also the run log (the Now strip, what the page can't see, an alert's timeline, the pick-up line) and the Head start tab's speed check column |
| `SlideDeliveries.gs` | Slide deliveries (row 55): the bot's own `Slide deliveries` tab, the pulse slide each delivery builds, and its time trigger's handler `dashDeliverDue` |
| `DashboardPage.html`, `DashboardCss.html`, `DashboardJs.html` | The web app's page (pushed by `clasp push` with the `.gs` files: `.claspignore` lets `.html` through) |
| `Knowledge.gs` | The knowledge base: reads the Resources tab's documents, keeps them current in the bot's own hidden "Knowledge cache (bot)" tab, and picks the parts that bear on each alert or question |
| `Config.gs` | Fixed settings: the Cloud project and what a new Control tab starts with; and this run's S-F Burson space, as the Control tab's B25 names it (no S-F Burson id is in the code) |
| `Bot.gs` | One pass over the Burson space: alerts, resends, replies, copying analyst emojis |
| `Mirror.gs` | The Mirror space (B9): live Zapier posts copied, unchanged, into a training space |
| `Relay.gs` | Relay with S-F Burson (row 22): S-F Burson into the Mirror space in its own order (Zapier's alerts, everyone's replies, messages and emojis), and the analysts' onto the Burson outbox; the Relay and Relay names tabs |
| `Outbox.gs` | Post in S-F Burson (row 24): everything bound for S-F Burson held back (OFF) or queued on the Burson outbox tab (ON), and only the rows a person sets to Send posted, after the wider check |
| `AutoCorrect.gs` | The auto-correct space (B10): live alerts posted there already corrected, read-only on the live space |
| `OtherSpace.gs` | The Other alerts space (B33): a Google-only space with other alerts, worked directly every minute beside the Mirror space, always Testing, never connected to S-F Burson |
| `WatchAlerts.gs` | Watch alerts (row 35, OFF to start): the Proactive watch's flags at a watch's bar posted as the bot's own alert card (`🔭 *WATCH* · <watch>`) in the Other alerts space (B33), the Mirror space (B9) or the Auto-correct space (B10), a few a run, each once; the space's flow works them like any alert (❌ for a repeat, else a Social Alert). Never in S-F Burson, the Burson test copy or a space people outside Google can join |
| `TempCheck.gs` | Temp checks (row 36, OFF to start): "temp check <Brandwatch query>" in a thread of the Mirror space or B33, queued by its flow (never relayed to S-F Burson) and worked after the run's alerts: the query found by name, link or id in [SLRR] Private, counts by hour, sentiment, sources and mention types from Brandwatch's totals (GETs only), at most 35 posts (reposts excluded; X's words from X's embed data), Gemini's summary, drivers and themes, and the team's write-up in PT posted in the request's thread; "refresh" for the update; Brandwatch busy: waits up to 30 minutes |
| `ProactiveWatch.gs` | Proactive watch (row 34): a watch over every source's new rows, read-only in BigQuery (two jobs, us-central1 and US: Sonar, Tubular, Brandwatch raw mentions, Sprinklr owned posts and comments, the DSD story selection feed, the Other alerts space's alerts from the Alert log, and the Brandwatch query "2026 Election Alerts" from Brandwatch's API, its X posts' text from X's embed data), Gemini's AI.IF, AI.SCORE and AI.CLASSIFY run inside BigQuery for each watch on the Watches tab, what they'd flag on the Watch detections tab, its scorecard against Burson's alerts, and the Watch sources tab; posts nothing itself (Watch alerts, row 35, post its flags only where B35 says) With Control row 50 ON the US look also reads the AMIE table (`amie`: Brandwatch's alert feeds, each row once, after a check of its columns), and a flag from it or from Brandwatch's mentions table asks the alert memory about the last 7 days |
| `EarlyWaveSource.gs` | Early wave & velocity producer (row 19): reads the 7 approved BigQuery source tables read-only (`US` and `us-central1`; the AMIE table only with row 48 ON, in a job of its own; with row 49 ON, the mentions Brandwatch live read, in one more job), embeds unseen low-tier posts, clusters them incrementally, checks velocity, keeps a 3-hour buffer, and (with row 39) asks about 3+ account early-watch stories |
| `BrandwatchLive.gs` | Brandwatch live for Early Detection (row 49, OFF to start): after the run's alerts and the Watch, at most every 10 minutes, GETs only to Brandwatch's API for the mentions of the queries ticked on the New sources tab added since its last read (never X or LinkedIn), with its own 20 calls in 10 minutes and a pause when the shared login is busy; it leaves them in the script cache for Early Detection's next check (`EarlyWaveSource.gs`, the job `bwl`), and moves its mark only when that job is collected. Its state (`BWL_STATE`) and the day's counts (`BWL_DAY`) are script properties; C49 says what it is doing. It also keeps the one count of every Brandwatch mention the bot reads (`bwCountMentions_`, one line in the Watch's and in Temp checks' readers, while rows 49 and 19 are ON), and gives C19 its ending while a new source fails (`NewSources.gs` `nsrcFailingEnd_`) |
| `OpenEngine.gs` | The open engine (row 51, OFF to start): the record of run time and outside calls (`RUN_LEDGER`, kept with row 51 OFF too: each run's seconds and calls by hour for 24 hours, the runs that found the lock taken, a run that died, Burson's pick-up times (with Control row 56 ON also on a list of their own without the alerts posted before the bot came back after a stop, a pause or failing runs: `openPickup_`, shown only on the dashboard) and its busiest pass; at most 8,800 characters), and under row 51 the day's safety stop and its derived ceilings (`OPEN_DAY`), the graded steps on run time and outside calls, the yield to Burson, the wait after a 429, and C51. Every later step of the open-engine plan asks it before background work starts (`openMayStart_`) |
| `EngineTab.gs` | The Engine tab (row 51): one row a check and one a day, 7 days, every cell short; never a tab the bot did not make. Later steps fill their columns with `engAdd_` / `engSet_`; the numbers between checks wait in `ENGINE_ACC` (at most 8,800 characters) |
| `RequirementsFirst.gs` | Requirements first (row 51): `rqCheckPost_` checks a post against the alert requirements code can decide, through `escalation_` (met, failed, a judgment, gated); the KOF sheet's handle index; the counts on the Engine tab; the quick look at single posts (`rqJudgeRun_`); the first screen in front of it (`rqScreenRun_`: its instruction, input, answer check, gates, rounds, pause and day state `RQ_SCREEN`) |
| `EarlyDetection.gs` | Early detection review and story cards (row 19): drains queued signals, runs same-story dedup (including promoting a story first flagged early into its card's thread), runs the full Gemini review, filters out dismissals, posts one story card, and records signal lifecycle events for row 46 |
| `EarlyDetectionNotes.gs` | What became of every Early Detection signal: the one place an ending is counted (C19's numbers) and recorded, and the wording of each record row |
| `EarlyDetectionTab.gs` | The Early Detection tab: lays out the record rows, newest first, the last 2,000; made once, never touches a tab of that name it didn't make |
| `EarlyDetectionCross.gs` | A story whose main post already has another alert's card, or that repeats an alert that went out (the Auto-correct space, setting `cross_alert_notes`): the note under that card, the `Related alert` line, and one issue, one Social Alert email |
| `ThreadNotes.gs` | The one way the bot puts a note under a card already in the Auto-correct space: where a note may go, once per key, at most 3 a card and 6 a run |
| `RequirementLine.gs` | The `Alert requirements` line (the Auto-correct space, setting `requirement_line`): the review's decision in one line, and its `final` form |
| `Decisions.gs` | Gemini Decisions REST client (`gemini-decision-1`, Secret Manager key in `x-goog-api-key`), sanitized signal input builder, six structured questions, caps and 15-minute pause on failure or slowness |
| `FastTriage.gs` | Fast-triage switches (rows 38-40), Control tab bar cells (rows 41-45 and 47), and `early_wave` BigQuery writer (row 46): queue-time ordering (`ftRank_`), noise hold-back (`ftHoldWhy_`, never on P0 risk groups or taxonomy raises), answer cache, and batched writes to `brand-social-central-data.early_wave` |
| `WhyNot.gs` | "Why not this post?" (row 51): `why not <link>` in the Auto-correct space answered from the alert memory, the Watch detections tab and Early Detection's stories and pool, read-only |
| `ApiGuard.gs` | Baseline rolling 10- and 60-minute call telemetry and ceilings (`gemini`, `bigquery`, and `decisions`; the first screen's `screen`, apart, never as `gemini`) plus Vertex 429 cooldown so SLA triage is never delayed, and the short list of Vertex 429s the first screen reads |
| `LiveVerify.gs` | Editor-run read-only live checks (`verifyLookbackAndPipelineLive`, `verifyFastTriageLive`, `verifyEarlyWaveBqLive`) with zero writes to user cells. The first one's two Gemini checks are tests of one function on made-up posts; no live flow uses its group-wave part, and the bot posts no wave message (its output's `note` says so) |
| `Alert.gs` | Parses Burson's alerts and rebuilds the corrected copy in Burson's exact format |
| `OtherAlerts.gs` | Alerts in other formats (in the Other alerts space, B33; in B25 with row 32 ON; or the Mirror space): spots them, triages each with Gemini (the SLRR rules first, then the stream's own call), and posts the triage note, the Social Alert, 👍 or ❌ |
| `Review.gs` | The rule checks plus Gemini's judgment |
| `Escalate.gs` | Whether an alert needs a Social Alert and who gets it (the protocols, the distros) |
| `Drafts.gs`, `Email.gs`, `Mail.gs` | The Social Alert email (draft, stand-in send or auto-send), its notes and emojis, T&S notes and auto-submits; the email itself; the Gmail client and its stand-in guard |
| `BigQuery.gs` | The listening feeds and the SLRR log in BigQuery: each alert's enrichment, and the switches that use BigQuery (find missing links, direct alerts, write-back, early waves) |
| `Post.gs` | The post itself: X, Bluesky, TikTok, Instagram and YouTube public data, and the screenshot for the email |
| `Media.gs` | The post's video, audio and images for Gemini (the Cloud Storage copy of a big video) |
| `Voice.gs` | Everything the bot writes, and the guard |
| `Chat.gs`, `Gemini.gs` | The Google Chat API and Gemini on Vertex AI (and `geminiRequest_` / `geminiReadReply_`, the first screen's own request and reply, never through `geminiGenerate_`) |
| `Sheets.gs`, `Store.gs` | The sheet's log tabs ("Alert log", "Message log") and what the bot remembers. No cell the bot writes goes over 49,000 characters (Sheets refuses 50,000); a JSON column is shortened so it still reads back |
| `Speed.gs` | The Results tab: what the bot did with Burson's alerts next to what the IMs did, with Gemini's summary of the numbers; with row 56 ON, the speed numbers that leave out the times the bot was not running (`resultsHonest_`); the Learned precedents tab (row 17) |
| `HeadStart.gs` | The Head start tab: this app's own alerts (Early Detection, Watch alerts, Direct BigQuery alerts) next to Burson's alerts and the IMs' emails: who alerted a story first, and by how much; with Control row 56 ON, also the speed check: the race on the same post while the bot was running, Burson alerting the issue first, and which races the bot was not running for (`headStartHonest_`) |
| `TnsForm.gs` | The pre-filled T&S Intake Form link (the real form live; while testing, a test copy in the tester's Drive) |
| `Watch.gs` | Watch sent alerts (24h), a Control tab switch: re-checks sent alerts' posts and replies on the email thread |
| `Outcomes.gs` | Track post-alert outcomes, a Control tab switch: reads replies to sent alerts and logs what came of them |
| `Generated.gs` | Taxonomy, emoji legend and settings, **generated** from `config/default_config.yaml`. Don't edit it |
| `test/` | Node tests that run the whole bot against fake Chat, Gemini and Sheets |

The log tabs have one row per alert (status, what was asked, analyst 👎 feedback) and one row per message. They're
protected with a warning. Don't sort them; use a filter view. The switches add columns to the Alert log as they're needed
(`tns_submitted`, `bq_written`, `outcome`, `ingested`); rows from before keep them blank. Learn from IM calls (row 17)
adds the bot's own **Learned precedents** tab, where only the Active column is yours to edit.

## Known limits (V1)

- **Edited alerts aren't seen.** Burson resends instead, as the bot asks them to.
- **How a resend is matched.** A resend is matched to its fix request by the post link within 48 hours. If the
  original had no link, it's matched by a near-identical issue name from the same author.
- **"Already reported in the last 14 days"** only knows the alerts the bot itself has seen in that space.
- **Analyst emojis** are copied for forwards up to 3 days old.
- **Failures** are retried. An alert that fails 3 times is forwarded to analysts as received, never dropped. A try
  that Apps Script cuts short (out of memory, its time limit, an internal error: nothing the bot can catch) counts as a
  failed try too, as the bot notes which message it's on before each one. When it was cut short in the alert's review,
  the next review gets less of the post: a still of it (Burson's screenshot or a frame of the video), then the alert
  text alone, and the forwarded alert says `🤖 QA: The post's own media wasn't reviewed: …`. The minute after a run is
  cut short, the next run takes over (it no longer waits 25 minutes), and five such runs in a row tell analysts, as
  five errors in a row do.
- **The switches are untried live.** Their BigQuery tables' columns, the live T&S form's editor id (`TNS_LIVE_FORM_ID`),
  `brand-social-sends@` as the bot's send-as address (auto-send and watch replies, live), and how X, Bluesky and YouTube
  answer for a deleted post were all checked against the code only. Direct BigQuery alerts work only in a test feed,
  the Mirror space or the Auto-correct space working alone. See also "What only a live run can show".

## Tests

```sh
node apps-script-chat-bot/test/run_tests.js     # the bot, end to end against fake Google services (each switch's
                                                # tests are in test/switch_*.test.js, loaded by run_tests.js)
.venv/bin/python -m pytest -q                   # includes the above, Generated.gs freshness and Python parity
```
