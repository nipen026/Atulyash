import { apiClient } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';
import { STORAGE_KEYS } from './config.js';

// Same technique as the reference app's app/api/auth/otp/verify/route.ts
// decodeJWT — unverified, client-side claim extraction only (the backend is
// the one that actually verifies the token on every subsequent request).
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function requestOtp(mobile) {
  return apiClient({
    url: API_ROUTES.AUTH.OTP_REQUEST,
    method: 'POST',
    body: { mobile, is_rider: false },
  });
}

export async function verifyOtp(mobile, otp) {
  const res = await apiClient({
    url: API_ROUTES.AUTH.OTP_VERIFY,
    method: 'POST',
    body: { mobile, otp, is_rider: false },
  });

  const data = res.data?.data || res.data;
  if (data?.access) {
    localStorage.setItem(STORAGE_KEYS.token, data.access);
    if (data.refresh) localStorage.setItem(STORAGE_KEYS.refreshToken, data.refresh);

    const claims = decodeJwt(data.access);
    const customerId = claims?.customer_id ?? data.customer_id;
    if (customerId) localStorage.setItem(STORAGE_KEYS.customerId, String(customerId));
    if (claims?.cart_id) localStorage.setItem(STORAGE_KEYS.cartId, String(claims.cart_id));

    document.dispatchEvent(new CustomEvent('atulyash:auth-changed'));
  }

  return res;
}

export function isAuthenticated() {
  return Boolean(localStorage.getItem(STORAGE_KEYS.token));
}

export function getCustomerId() {
  return localStorage.getItem(STORAGE_KEYS.customerId);
}

export function getCartId() {
  return localStorage.getItem(STORAGE_KEYS.cartId);
}

export function logout() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.customerId);
  localStorage.removeItem(STORAGE_KEYS.cartId);
  document.dispatchEvent(new CustomEvent('atulyash:auth-changed'));
}
