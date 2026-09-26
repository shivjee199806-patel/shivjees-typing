JP Typing — Opt-in Automatic + Manual Practice Reminder patch

Replace ONLY server.js and add both HTML files under public/. Do not modify the SEO patch files or existing index pages.

Candidate preference: https://jptyping.in/email-preferences.html (requires candidate login)
Owner manual screen: https://jptyping.in/owner-practice-reminders.html (requires owner/admin login in same browser)

REQUIRED for automatic sending (Render environment variables):
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (real authorized sender)
PRACTICE_REMINDERS_ENABLED=1
PRACTICE_REMINDER_CRON_SECRET=<random 32+ character string> (optional when only using in-process timer)

Server checks hourly while awake; for hosts that sleep configure an external daily POST scheduler to https://jptyping.in/api/internal/practice-reminders/run with header X-Reminder-Secret matching PRACTICE_REMINDER_CRON_SECRET. No external scheduler is created by this ZIP.

IMPORTANT: Preexisting candidates are NOT opted in by default and will not get reminders merely from deployment. Ask them to enable reminders at /email-preferences.html. You must not auto-opt-in users without permission.

Only opted-in active students with last_login >=7 days ago qualify; no repeat within 30 days or same inactivity period. Email includes signed unsubscribe link; opt-out does not affect OTP mail. Owner can manually send to selected eligible students. Existing announcement sender unchanged.

Deploying the ZIP is NOT enough to activate autonomous sends unless SMTP, PRACTICE_REMINDERS_ENABLED and a live scheduler/server are ready. No email sent while building patch.
