Patch based on previous audited ZIP + most recent consolidated HTML (welcome image optimization).
Changes: server.js CSP restrict * wildcard to self and HTTPS and add form-action; retains inline/eval for compatibility.
index.html SEO homepage title updated; reserve initial 100svh only for public-landing #app to reduce footer layout shifts.
IMPORTANT: previously deployed /public/welcome/approved-namaste-lady-optimized.webp must exist.
Not fixed/verified: full CSP hardening, HSTS domain-wide configuration, full CLS/LCP, browser runtime regression.
Deploy only after backup and staging. Roll back these two files if Login, OAuth, navigation, or home page differs.
