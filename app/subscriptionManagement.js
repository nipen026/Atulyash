import { apiClient } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';

export async function fetchActiveSubscriptions(customerId) {
  const res = await apiClient({
    url: `${API_ROUTES.SUBSCRIPTION_PLAN.GET}?is_active=true&customer_address__customer__id=${customerId}`,
  });
  return res.data?.results || [];
}

export async function fetchCancellationReasons() {
  const res = await apiClient({ url: API_ROUTES.SUBSCRIPTION_CANCEL_REASON.GET });
  return res.data?.results || [];
}

export async function cancelSubscription(subId, reasonId) {
  const res = await apiClient({
    url: API_ROUTES.SUBSCRIPTION_PLAN.CANCEL(subId),
    method: 'POST',
    body: reasonId ? { cancellation_reason: reasonId } : undefined,
  });
  return res.data;
}

export async function fetchSkipSummary(subId) {
  const res = await apiClient({ url: API_ROUTES.SUBSCRIPTION_PLAN.SKIP_SUMMARY(subId) });
  return res.data;
}

export async function fetchSkippableDeliveries(subId) {
  const res = await apiClient({ url: API_ROUTES.SUBSCRIPTION_PLAN.SKIPPABLE_DELIVERIES(subId) });
  return res.data?.results || res.data || [];
}

export async function skipDelivery(subId, deliveryId) {
  const res = await apiClient({
    url: API_ROUTES.SUBSCRIPTION_PLAN.SKIP(subId),
    method: 'POST',
    body: { delivery_id: deliveryId },
  });
  return res.data;
}

export async function unskipDelivery(subId, deliveryId) {
  const res = await apiClient({
    url: API_ROUTES.SUBSCRIPTION_PLAN.UNSKIP(subId),
    method: 'POST',
    body: { delivery_id: deliveryId },
  });
  return res.data;
}

export async function fetchVacations(customerAddressId) {
  const res = await apiClient({
    url: `${API_ROUTES.VACATION_MODE.GET}?customer_address=${customerAddressId}`,
  });
  return res.data?.results || [];
}

export async function startVacation({ subscriptionId, startDate, endDate }) {
  const res = await apiClient({
    url: API_ROUTES.VACATION_MODE.POST,
    method: 'POST',
    body: { subscription_plan: subscriptionId, start_date: startDate, end_date: endDate },
  });
  return res.data;
}

export async function updateVacation(vacationId, { startDate, endDate }) {
  const res = await apiClient({
    url: API_ROUTES.VACATION_MODE.PATCH(vacationId),
    method: 'PATCH',
    body: { start_date: startDate, end_date: endDate },
  });
  return res.data;
}

export async function endVacation(vacationId) {
  const res = await apiClient({ url: API_ROUTES.VACATION_MODE.END_VACATION(vacationId), method: 'POST' });
  return res.data;
}
