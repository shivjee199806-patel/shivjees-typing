JPTyping - Scoped CLS / LCP / SEO / Security Update

INSTALL (ONE DEPLOY)
Replace ONLY these four files at the same paths in the existing repository:
  server.js
  public/index.html
  public/logo-new.webp
  public/welcome/approved-namaste-lady-optimized.webp
Deploy/restart once after all four files are replaced. README is not a website file.
Keep all existing data, hosting environment variables and other project files.

WHAT CHANGED
- Real public homepage content is present in initial HTML, instead of an empty main followed by late insertion.
- All 113 existing stylesheets retain cascade order and are available before first paint.
- Initial guest header and footer match the rendered page; Special Thanks no longer inserts late.
- The existing shimmer effect now uses transform instead of animating left, avoiding recurring layout shifts.
- Logo WebP is 27,374 bytes; welcome WebP is 61,228 bytes. Preloads and image dimensions remain.
- Homepage gzip transmission reduces this HTML transfer by 76.1% (1,209,417 to 288,879 bytes).
- Existing live SEO title stays the same. OG title alignment and real fallback navigation links are retained from the latest SEO update.
- CSP removes unsafe-eval and restricts script origins to the site, Google and Razorpay. Required inline handlers remain enabled.
- Existing HSTS also applies to HTTPS requests behind the trusted proxy.

FEATURE SCOPE VERIFICATION
All 103 frontend script blocks from the latest supplied SEO update are unchanged.
Against fetched deployed HTML, 102 blocks are identical; one block differs only in two SEO navigation fallback links.
All backend business code matches the last deployed Security/CLS/SEO ZIP exactly after excluding header and public HTML delivery changes.
No changes to Login/Signup/OTP logic, Google authentication, typing calculations, Exam, Practice, Live scheduling, live result publishing, Results, Owner controls or database schema.

VALIDATION
Local Chromium, mobile 390 x 844, 4x CPU throttle, 100 ms latency and approx. 1.6 Mbps download:
  CLS: 0.000
  LCP: 2.248 seconds (final run with Hindi font and actual CSP)
  No JavaScript errors or visible broken images.
Desktop 1280 x 844:
  CLS: 0.0388; no JavaScript errors or visible broken images.
Browser UI checks passed for Login, candidate Signup without DOB, Special Thanks dialog and free guest typing input.
18 local API checks passed, including signup, incorrect/correct/reused OTP, password login, authenticated session, logout revocation, restricted Admin/Owner APIs, exam directory, result history, live APIs, learning/practice APIs and legitimate Owner management APIs.
All 100 nonempty JavaScript script bodies passed syntax checks. JSON-LD parsed successfully. Server syntax passed.
Gzip round-trip matches HTML byte-for-byte; gzip;q=0 negotiation passes.

LIMITS
These are local test results, not a new live PageSpeed score or a full security audit.
OTP delivery was tested in development mode against a separate local database; no real emails were sent.
Real Google account login, real payment checkout, and a full scheduled live contest were not performed.
Inline scripts remain allowed because the existing application depends on them. This update does not claim complete CSP/XSS hardening.
The patch uses the provided full repository plus its latest Security and SEO updates; separately modified server code after those updates is outside this verified base.
