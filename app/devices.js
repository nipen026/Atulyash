import { apiClient, withQuery } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';
import { STORAGE_KEYS } from './config.js';

/**
 * Push-device registration.
 *
 * IMPORTANT — this module is the transport half only. Obtaining a push token is
 * the caller's job, and on the web that means a Firebase Web SDK app with a
 * VAPID key and a service worker; none of that is configured in this repo, so
 * nothing calls `registerDevice` automatically yet. Wire it up by getting a
 * token from `getToken(messaging, { vapidKey })` and handing it here:
 *
 *   import { registerDevice } from './devices.js';
 *   await registerDevice(await getToken(messaging, { vapidKey: '<key>' }));
 *
 * Until then the endpoints stay unused rather than being called with a fake
 * token, which would register a device that can never receive anything.
 */

/** A stable per-browser id, so re-registering replaces rather than duplicates. */
function getOrCreateDeviceId() {
  const existing = localStorage.getItem('atulyash_device_id');
  if (existing) return existing;

  const id = crypto?.randomUUID
    ? crypto.randomUUID()
    : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('atulyash_device_id', id);
  return id;
}

/**
 * Maps this browser's push token to the logged-in customer. Stores the token so
 * logout can unregister precisely this device.
 * @param {string} token FCM/APNS push token
 */
export async function registerDevice(token, { platform = 'web', audience = 'customer' } = {}) {
  if (!token) throw new Error('A push token is required to register this device.');

  const res = await apiClient({
    url: API_ROUTES.NOTIFICATIONS.DEVICE_REGISTER,
    method: 'POST',
    body: {
      token,
      platform,
      audience,
      device_id: getOrCreateDeviceId(),
    },
  });

  localStorage.setItem(STORAGE_KEYS.deviceToken, token);
  return res.data;
}

/** Drops a push token's association so the device stops receiving alerts. */
export async function unregisterDevice(token) {
  if (!token) return null;
  const res = await apiClient({
    url: withQuery(API_ROUTES.NOTIFICATIONS.DEVICE_UNREGISTER, { token }),
    method: 'DELETE',
  });
  localStorage.removeItem(STORAGE_KEYS.deviceToken);
  return res.data;
}

/**
 * Unregisters whatever token this browser last registered. No-ops when there
 * isn't one — which is the normal case until push is configured (see above).
 * Called by `logout()` in auth.js.
 */
export async function unregisterCurrentDevice() {
  const token = localStorage.getItem(STORAGE_KEYS.deviceToken);
  if (!token) return null;
  return unregisterDevice(token);
}
