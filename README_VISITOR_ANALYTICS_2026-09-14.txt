JP Typing - Visitor Analytics update

Added without changing typing-test/payment/login logic:
- Anonymous visitor ID stored in browser localStorage
- Total Visitors and Today Visitors
- Total Page Views and Today Views
- 30-day Traffic Sources (Direct, Google, YouTube, Instagram, Facebook, Telegram, WhatsApp/referral)
- 30-day Device split (Mobile/Desktop/Tablet)
- Popular pages
- 7-day visitor trend
- Owner-only Visitor Analytics page in Owner sidebar
- UTM source support via ?utm_source=...

Privacy:
- Does NOT expose anonymous visitor name, phone, exact address, or precise location.
- Logged-in visits may be linked internally to existing user account ID.

Deployment:
Upload/replace this project on the same service and keep existing environment variables and persistent database settings unchanged.
