JP Typing SEO/indexing follow-up audit — 01 Oct 2026

Changed only SEO/index-discovery related files.

Previously updated:
- public/35-wpm-typing-test.html
- public/railway-typing-test.html
- public/wpm-calculator.html
- public/sitemap.xml

Additional follow-up fix:
- server.js robots.txt route now matches public/robots.txt and blocks /api/ and /owner while allowing public pages and declaring the sitemap.

Checked:
- Node syntax OK
- all 3 target pages have one H1, unique title/description, index/follow robots meta, canonical, structured data
- homepage already links to all 3 target pages
- target URLs are in sitemap.xml

No login, signup, typing-test behavior, payment, dashboard, or UI logic was intentionally changed.
