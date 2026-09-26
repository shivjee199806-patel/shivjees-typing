JP Typing - Owner Practice Reminder Settings ONLY

Replace files at these exact locations in the CURRENT deployed repository:
  server.js
  public/owner-practice-reminders.html

Important: This patch is based on JP_OWNER_REMINDER_ON_OFF_ONLY.zip, which includes the prior Resend change. Do not overwrite it with older reminder patches afterward.

Owner panel: https://jptyping.in/owner-practice-reminders.html
- Choose 4 / 7 / 10 / 15 days, edit subject/message or leave defaults, then Save Days & Message.
- Turn Automatic ON/OFF independently. Send eligible reminders NOW triggers an immediate eligible batch when ON.
- Send selected manually works independently of automatic ON/OFF.
- All modes require existing candidate opt-in and still prevent a repeat within 30 days or the same inactivity period.
- The unsubscribe URL is appended by server; you need not type it yourself.
- Saving days/message does NOT send mail; Send NOW WILL send mail to currently eligible opted-in users.
- Resend keys and verified From address must already be configured in Railway. Automatic periodic sending requires an active server (hourly timer) or separately configured external scheduler.
- Existing public SEO pages, login, OTP, typing engine, leaderboard and dashboard are NOT included in this patch.
- BEFORE replacing files, keep a backup of both current deployed files and verify no newer independent modifications were made since previous patch.
