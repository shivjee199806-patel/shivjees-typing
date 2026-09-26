JP Typing — Combined update (Gemini + candidate UI + leaderboard)

This package includes the following existing-project files:
- server.js (Gemini matter generator, leaderboard endpoints and filters)
- public/index.html (candidate home, theme, leaderboard, short attempts, recent-results removal)
- public/public/index.html (sync the old nested copy of the HTML page to the current frontend)
- daily-passages.js and daily-passages-legacy.js (required Practice matter generator and its dependency)

DEPLOY:
1. Extract THIS ZIP into the ROOT folder of your existing jptyping.in source project.
2. Confirm that server.js is in the project ROOT, and public/index.html is inside public/.
   Do not put the ZIP's containing folder inside public/ or upload index.html alone.
3. Overwrite the matching files, then commit/push to the Git repository used by Railway.
4. Wait until Railway shows the new deployment as successful.
5. Confirm the GEMINI_API_KEY Railway variable remains in place; no key belongs inside this ZIP.
6. On jptyping.in, Ctrl+Shift+R once, then check Home and Leaderboard.

EXPECTED:
- Logged-in candidate: Dashboard on fresh login; browser refresh keeps the current section, including the selected Practice language and duration.
- Refresh restores the visible page after all page renderers are installed; the active navigation and content load together for Owner Home/Dashboard, Exam folders and other sections.
- Candidate login opens the Dashboard before the welcome animation; an animation error cannot leave the guest Home screen visible after successful login.
- Owner/Admin login renders the Owner Dashboard immediately with visible loading and retry states; the top Dashboard tab opens Owner Dashboard for Owner/Admin.
- If Owner Dashboard requests stall, a timeout now replaces the loading state with a Retry button.
- Owner Home/Dashboard keeps the currently open top tab visibly green even when navigation is rebuilt.
- Refresh inside an Exam Main Folder or its Sub-folder restores that same folder after the directory loads; the Exam typing/scoring/matter flow is unchanged.
- Default home = Clean Sky, default eye comfort = Green, dashboard style = Existing.
- Candidate's manually saved theme selection remains saved in this browser.
- Exam Mode LEFT and wider, Practice RIGHT and narrower.
- 2min Practice / 4min Exam minimum for ranking.
- Up to 5 eligible tests individually; more than 5 expand under name.
- Short Attempts section for less-than-threshold tests; all saved results in history.
- No Recent Results table on Home.
- Chhota Bhai AI matter works with Gemini; Gallery unchanged.

NOTE: This zip contains CHANGED FILES, not a standalone complete web application.
Do not remove or reset your live database, other Railway variables or user files.

LATEST FIXES:
- Fresh candidate login opens Home; refresh preserves the currently open page.
- Pricing navigation appears only when Payment System is confirmed ON by public settings; OFF keeps it hidden.

AUTO PRACTICE MATTER FIX:
- Practice publishes full 30-minute English/Hindi source matters and trims them to the chosen test duration.
- The separate four-day fixed-text generator is removed. Its previous short auto matters become inactive; saved result history stays intact.
- Practice now selects different topic families and fact subsets for each difficulty and date. Today's untouched auto Practice entries are refreshed once. The Exam generator remains unchanged.

PRACTICE DURATION SAFEGUARD:
- Practice uses the existing Exam Mode duration-to-word selection rule with its own language-specific 30-minute source. The generated Practice matter remains separate and varies by date, difficulty and language. Existing Exam Mode logic is untouched. Today's untouched auto Practice passages refresh once after deployment.
- All Practice passages are filtered for the selected duration. A too-short passage cannot start a longer test.
- Changing the selected duration refreshes eligible passages; existing manually authored passages and past results are retained.
- Current day's previously generated Practice matters are refreshed once where the owner has not edited them; Exam Mode generator and its output are unchanged.
- Existing Practice passages remain in the candidate list; if the previous package archived old auto Practice rows, this release restores those rows while keeping saved results and owner edits.
