# ExamNova Full Stack Mock Test Platform

## Requirements
Node.js 22 or newer (uses built-in experimental `node:sqlite`). No npm dependencies, database service, or API keys required for local development.

## Start on Windows
1. Install Node.js 22+ from nodejs.org.
2. Extract the ZIP and open a terminal inside `ExamNova-FullStack`.
3. Run `npm start`.
4. Open **http://localhost:3000** in Chrome. Do not open the HTML with a double-click; this is a server-based project.

## Create admin account
Set environment variables BEFORE the first start:

PowerShell:
```powershell
$env:ADMIN_EMAIL='admin@example.com'
$env:ADMIN_PASSWORD='use-a-long-random-secret-here'
npm start
```

The server creates an admin account when it starts with both variables. Use the email and password to log in, open Admin Studio, add questions, and create new test series. Existing accounts are not overwritten. **Do not use the sample password above.**

## Included
- Separate admin and candidate permissions, registration/login, password hashing (scrypt), bearer session tokens
- SQLite persisted database (`data/examnova.sqlite`)
- 15 exam catalog entries (unverified defaults)
- Admin question entry, exam creation, test configuration (positive marks, negative deductions, duration, question count, type), draft/publish checks
- Candidate dashboard, hover/active UI, test timer, answered/review palette, save answers on server, server-side grading, topic analysis, answer explanations and history
- One exam with 12 sample questions and two published sample practice tests

## Limitations / before launching publicly
This is a **working local MVP**, not a completed Testbook clone. The 15 exam configurations are **not verified official schemes**. Do not advertise these as official mocks. Demo questions are samples, not a full syllabus bank. No automatic AI generation, PYQ imports, percentile ranking, payment gateway, Google sign-in, OTP, password reset, email verification, or proctored anti-cheat. Web production requires HTTPS reverse proxy, rate limiting, token/cookie hardening, account recovery, backup strategy, audits, and privacy policy. Admin validation of section-wise timing is not yet implemented; `sections_json` is reserved for it. `sessionStorage` keeps the token per tab. SQLite is suitable for early deployments; larger deployments need migration and monitoring.

Do not modify jptyping.in. Deploy as a separate site/repository. Set `PORT` when hosting.

Run `npm test` for an API integration smoke test.

## Test-series navigation and section allocation update
- Test categories have separate Full / Mini / Sectional / Chapter / Topic / PYQ / Live tabs (inspired by common mock-test navigation, not a copy of Testbook branding/assets).
- Admin can configure a **Section distribution** per mock, one `Topic: count` per line. Counts must total the requested question count. Topic names must exactly match existing question topics, case-insensitively.
- Published tests validate section availability, and attempts select questions per topic and keep sections together, instead of mixing subjects randomly.
- This ZIP is an updated MVP, not a ready-to-launch Testbook-equivalent product. The demo question bank is deliberately limited. Populate and independently verify real exam-specific questions and official schemes before publication.

## November 2026 Exam UI enhancement
- Original ExamNova UI with pre-test instructions, topic/section navigation, 5-state question palette, Save & Next, review, countdown, automatic time-out submission and saved results.
- Active unfinished attempts can be resumed from the dashboard while their original countdown is still running.
- Test categories and per-test question distribution stay configurable by admin.
- This is a functional MVP, **not** a full Testbook clone. The demo question bank is not verified PYQ, and ranks/percentiles, weekly publishing and full verified mocks require further implementation/data.
- Requires Node.js 22+ (the built-in `node:sqlite` module). Run `npm start`, then visit http://localhost:3000.

## November 2026 marketplace UI update
- Screenshot-inspired independent design: horizontal navbar, exam-search, category sidebar, test-series catalogue, live test section, dedicated series detail pages, candidate login split layout.
- Counts are derived from ExamNova's own SQLite data, not copied from third-party platform examples.
- To run: install Node.js 22+, `npm start`, visit `http://localhost:3000`.
- The sample bank is demonstrative; no proprietary Testbook questions, marks, subscription content, logos or user figures have been copied.
