import { apiClient } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';

export async function fetchNotifications(page = 1) {
  const res = await apiClient({ url: `${API_ROUTES.NOTIFICATIONS.GET}?page=${page}` });
  return { results: res.data?.results || [], count: res.data?.count || 0 };
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
