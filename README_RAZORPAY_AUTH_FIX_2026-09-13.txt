Razorpay Authentication Fix - 2026-09-13

Changed only the Razorpay credential handling. Existing site/UI/features were left unchanged.

What was fixed:
1. RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET now ignore accidental surrounding single/double quotes and whitespace.
2. The same normalized secret is used for payment signature verification.
3. If Razorpay still returns HTTP 401, the site now shows a clear message that the Render key ID/secret must be the same Razorpay key pair (test+test or live+live).

IMPORTANT: Code cannot manufacture or repair an invalid Razorpay secret. In Render -> Environment, set:
RAZORPAY_KEY_ID = your Razorpay key id
RAZORPAY_KEY_SECRET = the matching secret from that exact key pair
Do not put quotes around either value. Save and redeploy.
