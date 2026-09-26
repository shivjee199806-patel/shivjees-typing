JP TYPING — FINAL SINGLE DEPLOY BUNDLE (Reminder Only)

This replaces the separate patches for:
- Owner Control menu link -> Email Reminder Management
- Candidate optional email-reminder consent after login
- Auto/Manual reminders via existing Resend (fallback SMTP)
- Owner Auto ON/OFF, 4/7/10/15 day setting, subject/message edit, Send NOW
- Unsubscribe and eligibility/duplicate checks

REPLACE ONLY THESE FIVE FILES AT THEIR EXACT PATHS:
  server.js
  public/owner-practice-reminders.html
  public/index.html
  public/public/index.html
  public/jp-practice-consent.js

BACK UP current deployed files first. This archive combines the previously supplied
JP_REMINDER_OWNER_DAYS_MESSAGE_SEND_NOW backend+owner page and
JP_OWNER_MENU_AND_CONSENT_COMBINED frontend files. Do not deploy older patches
on top after this one: that could remove newer features.

AFTER DEPLOY:
  1. Confirm Railway has RESEND_API_KEY and RESEND_FROM_EMAIL (do not share secrets).
  2. Owner login -> Email Reminder Management -> check provider & ON/OFF, choose days,
     save the message; start with OFF and try a consented test account.
  3. Confirm candidate opt-in works and owner does not see candidate popup.
  4. Test manual sending with a consented eligible test candidate, then turn Auto ON.
  5. In-process auto scan is hourly ONLY WHILE BACKEND RUNS; an external scheduler
     is needed for sleeping/stopped backend. Emails require actual consent.

This bundle does NOT change sitemap.xml, robots.txt, SEO guide pages, OTP modules,
or typing engine files. It DOES replace the two public index pages to add the
Owner menu link and candidate consent script reference; compare with current
live code before deploying if newer work has modified those pages.
