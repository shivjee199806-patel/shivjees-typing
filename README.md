# Shivjee's Typing — Owner Edition

A complete Node.js + Express + SQLite typing platform with student accounts, timed English/Hindi typing exams, result history, leaderboard and a full owner/admin control center.

## Start locally
1. Install Node.js 18+.
2. Open this folder in Command Prompt / PowerShell.
3. Run `npm install`.
4. Copy `.env.example` to `.env` for local use, then change `JWT_SECRET`, admin email and admin password. Hosting environment variables can also be used and take priority.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Owner login
The default fallback admin is:


**Change the admin password immediately from Owner Control > Security before putting the site online.** For production, set strong `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `JWT_SECRET` environment variables.

## Owner capabilities
- Admin Dashboard with users, passages, exams, tests and recent logins
- Student account activation/deactivation, plan and validity control
- Student password reset and detailed test history
- Exam create/edit/activate controls
- Passage add/edit/delete controls
- Result explorer and delete controls
- CSV export: users, exams, passages, results
- Live SQLite table browser (password hashes hidden)
- Full SQLite `.db` backup download
- Website settings: site name, tagline, contact, registration switch, maintenance switch, footer text
- Admin password change
- Audit log for owner actions

## Where data is stored
All live data is stored in `data/shivjees.db` plus SQLite WAL files when the server is running. This contains users, exams, passages, results, settings and audit logs.

For a public deployment, use hosting with **persistent disk/storage**. Do not deploy this SQLite version to an ephemeral filesystem unless the `data/` folder is mounted to persistent storage. Back up the DB regularly from Owner Control.

## Important production notes
- Use HTTPS on the public site.
- Change the default admin credentials and JWT secret.
- Keep `data/shivjees.db` outside public/static hosting paths.
- Use a persistent volume or migrate to PostgreSQL/MySQL if you expect heavy simultaneous traffic.
- Email verification, forgot-password email and automatic online payments require external email/payment providers and credentials; this build keeps account access and paid validity under owner control without those external dependencies.

## Stability fixes in this build
- UP Police CO no longer forces the old 90% accuracy setting; owner can configure qualification rules.
- Dedicated long CO passages are included and prioritized for the 15-minute modules.
- Exam passage selection prefers the correct language/layout.
- Empty exam passage lists are handled without crashing.
- Correct text is no longer green-highlighted; only mistakes and the current cursor are marked.
- Extra typing beyond the passage is blocked and a completed passage auto-submits.
- Result inputs are range-validated on the server and qualification uses Net WPM plus optional accuracy threshold.
- API responses are non-cacheable and basic security headers are enabled.
- Local `.env` files are actually loaded without needing another package.
- A browser refresh/close warning is shown during an active test.

## Additional common-bug hardening
- Timer now uses the real clock instead of relying on interval counts, so background-tab throttling does not silently extend the exam.
- Duplicate submits are blocked with a per-attempt ID on both client and database.
- Result metrics are recalculated on the server from the submitted typed text and source passage instead of trusting browser WPM/accuracy values.
- Exam result submissions are checked against an active passage and matching exam language.
- Typing is capped at passage length; paste and drag/drop insertion are blocked.
- Blank tests cannot be submitted.
- Authentication inputs now have stronger validation and a small in-memory brute-force throttle.
- SQLite uses WAL, foreign keys, busy timeout and safe shutdown checkpointing.
- Passage deletion is now a safe deactivation so old result/history links are preserved.
- 0% accuracy rules display as speed-only instead of misleading “0%”.
- 15/30 minute exams now appear in the duration filter.

## AR-style exam flow update
The exam Start button now opens a passage-selection screen with search, difficulty, duration and word-limit controls. A separate instructions screen appears before the test. During typing, the source passage has its own scrollbar and auto-scrolls with the current character so the typing pane remains visible. Results include a performance dashboard and original-vs-typed comparison.

### Sidebar behavior update
- During typing/exam mode, the sidebar stays hidden to maximize typing space.
- When the user exits/cancels the typing test or returns to Dashboard/Exams, the sidebar is automatically restored.
- On desktop, a small chevron button on the left edge can manually hide/show the sidebar.
- The manual sidebar choice is remembered for normal browsing; exiting an exam intentionally restores it so navigation is never lost.

## Auto Full Screen Typing
When a candidate clicks the typing pane, the browser Fullscreen API is requested automatically. Press Esc to leave fullscreen. A manual **⛶ Full Screen** button is also available as a fallback. Browsers may block fullscreen when the page is embedded or when user-gesture permissions are restricted.

## Learning + Permanent Result Analysis
This build adds a dedicated Typing Learning area with day-by-day home-row, top-row, bottom-row, numbers, mixed and advanced drills. Student progress is stored in SQLite (`learning_attempts`).

Every new typing result now stores a snapshot of the original passage, the typed passage and per-word timing samples. Students can reopen their own attempts from Test History at any time and use **View / Analyse**. The analysis shows errors, slow words, original-vs-typed text, and an **Errors Only** repeated repair drill. Admin/owner can open the same analysis from Users or Owner Control > Results for any candidate. Authorization is enforced server-side: students can only open their own result; admin can open all results.

Older results created before this version may not have original/typed snapshots or word timing data; all new attempts do.


## Candidate signup & mobile OTP
Signup now stores full name, father's name, date of birth, target exam, mobile number, email and password. Mobile OTP login is included. For local testing copy `.env.example` to `.env` and keep `DEV_OTP_MODE=1`; the test OTP is shown on-screen. Before public hosting set `DEV_OTP_MODE=0` and configure `OTP_WEBHOOK_URL` (and optional `OTP_WEBHOOK_TOKEN`) to a real SMS gateway/webhook. OTPs are hashed in the database, expire after 5 minutes, and are rate-limited.


## Public landing / protected member area
- Logged-out visitors see only the Shivjee's Typing public About / learning-method / motivation landing page.
- Exams, Practice, Learning, Leaderboard, Dashboard and History are member-only routes and automatically open login when accessed while logged out.
- Candidate/Admin login shows a role-specific welcome animation; admin gets a stronger Owner welcome.
- Secure Admin Signup remains available from the Login dialog and still requires ADMIN_SIGNUP_CODE.

## Owner/Admin manager update
- Database Explorer tables now open in a large modal; users/passages/exams can jump to their manager/editor.
- Passage records can be assigned to a specific exam (`exam_id`). New passage forms show the active Exam dropdown and linked exam passages are filtered into that exam.
- Passage Select/Open editor can change full text, title, exam, language/layout, difficulty, highlight, status, and linked exam time/WPM/accuracy/backspace rules.
- User manager can edit name, father name, DOB, mobile, email and target exam, plus block/unblock, plan/validity and password reset.
- Changing a mobile number through Owner control resets its verified flag until it is verified again.
