import { apiClient, withQuery, toList } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';

/**
 * Notification history. `category` and `isRead` are the documented filters —
 * pass null (the default) to leave a filter off entirely.
 */
export async function fetchNotifications({ page = 1, category = null, isRead = null } = {}) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.NOTIFICATIONS.GET, {
      page,
      category,
      // false is meaningful here (unread only), so only null/undefined are skipped.
      is_read: isRead === null || isRead === undefined ? null : isRead,
    }),
  });
  return { results: toList(res.data, ['notifications']), count: res.data?.count || 0 };
}

export async function fetchUnreadCount() {
  const res = await apiClient({ url: API_ROUTES.NOTIFICATIONS.UNREAD_COUNT });
  return res.data?.unread_count ?? res.data?.count ?? 0;
}

export async function markNotificationRead(id) {
  const res = await apiClient({ url: API_ROUTES.NOTIFICATIONS.MARK_READ(id), method: 'PATCH' });
  return res.data;
}

export async function markAllNotificationsRead() {
  const res = await apiClient({ url: API_ROUTES.NOTIFICATIONS.MARK_ALL_READ, method: 'POST' });
  return res.data;
}
