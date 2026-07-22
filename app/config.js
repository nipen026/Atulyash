// Live Atulyash backend. Same API the atulyash-web Next.js app talks to.
// This is a static site with no server, so — unlike that app — every call
// here goes straight from the browser to this URL (no BFF proxy in between).
export const API_BASE_URL = 'https://api.atulyash.com';

// Public Razorpay checkout key. Safe to expose client-side by design (this is
// how Razorpay's own checkout.js is meant to be used) — this is currently a
// TEST-mode key (rzp_test_...). Swap for a live key before accepting real payments.
export const RAZORPAY_KEY = 'rzp_test_SmVpQAvMWb50oz';

// Google Places key for address autocomplete. Restrict this key to this
// site's domain(s) in the Google Cloud Console (HTTP referrer restriction) —
// that's the intended protection for a client-exposed Places key, not secrecy.
export const GOOGLE_PLACES_API_KEY = 'AIzaSyDZgaOD2OrTsp19C1WsFyHxXTyVRJ__d9c';

// localStorage keys. Tokens live here because this static site has no server
// to set httpOnly cookies (unlike the Next.js app's design). Trade-off:
// any XSS bug anywhere on this page could read these — keep that in mind
// before adding third-party scripts to this site.
export const STORAGE_KEYS = {
  token: 'atulyash_token',
  refreshToken: 'atulyash_refresh_token',
  customerId: 'atulyash_customer_id',
  cartId: 'atulyash_cart_id',
};
