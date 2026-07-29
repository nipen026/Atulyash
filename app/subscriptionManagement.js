import { apiClient, withQuery, toList } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';

export async function fetchActiveSubscriptions(customerId) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.SUBSCRIPTION_PLAN.GET, {
      is_active: true,
      customer_address__customer__id: customerId,
    }),
  });
  return toList(res.data, ['subscriptions']);
}

export async function fetchSubscriptionById(subId) {
  const res = await apiClient({ url: API_ROUTES.SUBSCRIPTION_PLAN.GET_BY_ID(subId) });
  return res.data;
}

/**
 * Global subscription constraints (skip limits, cancellation policy). Returns
 * null on failure so callers can fall back to server-side enforcement rather
 * than blocking the whole subscription tab on a settings fetch.
 */
export async function fetchSubscriptionSettings() {
  try {
    const res = await apiClient({ url: API_ROUTES.SUBSCRIPTION_SETTINGS.GET });
    return res.data;
  } catch {
    return null;
  }
}

export async function fetchCancellationReasons() {
  const res = await apiClient({ url: API_ROUTES.SUBSCRIPTION_CANCEL_REASON.GET });
  return toList(res.data, ['reasons']);
}

export async function cancelSubscription(subId, reasonId, detail = '') {
  const res = await apiClient({
    url: API_ROUTES.SUBSCRIPTION_PLAN.CANCEL(subId),
    method: 'POST',
    body: {
      ...(reasonId ? { cancellation_reason_id: reasonId, cancellation_reason: reasonId } : {}),
      ...(detail ? { cancellation_detail: detail } : {}),
    },
  });
  return res.data;
}

export async function fetchSkipSummary(subId) {
  const res = await apiClient({ url: API_ROUTES.SUBSCRIPTION_PLAN.SKIP_SUMMARY(subId) });
  return res.data;
}

export async function fetchSkippableDeliveries(subId) {
  const res = await apiClient({ url: API_ROUTES.SUBSCRIPTION_PLAN.SKIPPABLE_DELIVERIES(subId) });
  return toList(res.data, ['deliveries', 'skippable_deliveries']);
}

/**
 * The doc's skip/unskip contract is `delivery_date`, but the existing code sent
 * `delivery_id`. Send both: the id is what the previous build used against the
 * live API, and the date is what the doc specifies — extra keys are ignored by
 * DRF serializers, so whichever the backend reads will resolve.
 */
export async function skipDelivery(subId, { deliveryId, deliveryDate } = {}) {
  const res = await apiClient({
    url: API_ROUTES.SUBSCRIPTION_PLAN.SKIP(subId),
    method: 'POST',
    body: {
      ...(deliveryId ? { delivery_id: deliveryId } : {}),
      ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
    },
  });
  return res.data;
}

export async function unskipDelivery(subId, { deliveryId, deliveryDate } = {}) {
  const res = await apiClient({
    url: API_ROUTES.SUBSCRIPTION_PLAN.UNSKIP(subId),
    method: 'POST',
    body: {
      ...(deliveryId ? { delivery_id: deliveryId } : {}),
      ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
    },
  });
  return res.data;
}

/**
 * Previews how swapping the pack / delivery day / duration would reshape the
 * upcoming delivery calendar, before committing via `updateSubscriptionPack`.
 */
export async function previewPackChange(planId, { newPackId, newDeliveryDay, newDurationInMonths, startDate }) {
  const res = await apiClient({
    url: API_ROUTES.SUBSCRIPTION_PLAN.PREVIEW_PACK_CHANGE(planId),
    method: 'POST',
    body: {
      new_pack_id: newPackId,
      ...(newDeliveryDay ? { new_delivery_day: newDeliveryDay } : {}),
      ...(newDurationInMonths !== undefined ? { new_duration_in_months: newDurationInMonths } : {}),
      ...(startDate ? { start_date: startDate } : {}),
    },
  });
  return res.data;
}

/** Commits a pack/day/duration change to an existing subscription plan. */
export async function updateSubscriptionPack(planId, { newPackId, newDeliveryDay, newDurationInMonths, startDate }) {
  const res = await apiClient({
    url: API_ROUTES.SUBSCRIPTION_PLAN.UPDATE_PACK(planId),
    method: 'POST',
    body: {
      new_pack_id: newPackId,
      ...(newDeliveryDay ? { new_delivery_day: newDeliveryDay } : {}),
      ...(newDurationInMonths !== undefined ? { new_duration_in_months: newDurationInMonths } : {}),
      ...(startDate ? { start_date: startDate } : {}),
    },
  });
  return res.data;
}

/** Recommended pack tiers for a given daily roti consumption. */
export async function fetchConsumptionCalculator(rotisPerDay) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.PRODUCT_SUBSCRIPTION_PACKS.CONSUMPTION_CALCULATOR, {
      rotis_per_day: rotisPerDay,
    }),
  });
  return res.data;
}

/**
 * Vacation windows for a customer. The filter is on the customer behind the
 * subscription's address (`subscription__customer_address__customer`), not the
 * address itself — filtering by address id silently returned the wrong set.
 */
export async function fetchVacations(customerId) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.VACATION_MODE.GET, {
      subscription__customer_address__customer: customerId,
      is_active: true,
    }),
  });
  return toList(res.data, ['vacations']);
}

export async function startVacation({ subscriptionId, startDate, endDate }) {
  const res = await apiClient({
    url: API_ROUTES.VACATION_MODE.POST,
    method: 'POST',
    body: {
      subscription: subscriptionId,
      subscription_plan: subscriptionId,
      start_date: startDate,
      end_date: endDate,
    },
  });
  return res.data;
}

export async function updateVacation(vacationId, { startDate, endDate }) {
  const res = await apiClient({
    url: API_ROUTES.VACATION_MODE.PATCH(vacationId),
    method: 'PATCH',
    body: {
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
    },
  });
  return res.data;
}

export async function endVacation(vacationId) {
  const res = await apiClient({ url: API_ROUTES.VACATION_MODE.END_VACATION(vacationId), method: 'POST' });
  return res.data;
}
