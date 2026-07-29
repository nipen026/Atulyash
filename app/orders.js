import { apiClient, withQuery, toList } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';
import { API_BASE_URL, STORAGE_KEYS } from './config.js';

const PAGE_SIZE = 15;

/**
 * Order history. `oneTime` splits one-time purchases from subscription orders —
 * omit it to get both. Returns `count` alongside the page so callers can paginate.
 */
export async function fetchOrders(customerId, { page = 1, oneTime = null } = {}) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.ORDER.GET, {
      page_size: PAGE_SIZE,
      page,
      is_active: true,
      customer__id: customerId,
      pending_order: false,
      one_time: oneTime,
    }),
  });
  return {
    results: toList(res.data, ['orders']),
    count: res.data?.count || 0,
    pageSize: PAGE_SIZE,
  };
}

export async function fetchOrderById(orderId) {
  const res = await apiClient({ url: API_ROUTES.ORDER.GET_BY_ID(orderId) });
  return res.data;
}

/** The individual deliveries generated under a subscription order. */
export async function fetchSubscriptionOrders(orderId, { page = 1 } = {}) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.ORDER.SUBSCRIPTION_ORDERS(orderId), { page_size: PAGE_SIZE, page }),
  });
  return {
    results: toList(res.data, ['orders', 'deliveries']),
    count: res.data?.count || 0,
    pageSize: PAGE_SIZE,
  };
}

export async function fetchOrderDelivery(deliveryId) {
  const res = await apiClient({ url: API_ROUTES.ORDER_DELIVERY.GET_BY_ID(deliveryId) });
  return res.data;
}

/** Redirects a placed-but-not-yet-dispatched order to a different address. */
export async function changeOrderAddress(orderId, addressId) {
  const res = await apiClient({
    url: API_ROUTES.ORDER.CHANGE_ADDRESS(orderId),
    method: 'POST',
    body: { address_id: addressId },
  });
  return res.data;
}

export async function reorder(orderId) {
  const res = await apiClient({ url: API_ROUTES.ORDER.RE_ORDER(orderId), method: 'POST' });
  return res.data;
}

/**
 * There's no BFF proxy here to stream the PDF through (unlike the reference
 * app's app/api/download-invoice/route.ts), so this fetches the invoice
 * directly as a blob and triggers a browser download.
 */
export async function downloadInvoice({ orderStatus = '', deliveryId = '' } = {}) {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  const path = withQuery(API_ROUTES.GENERATE_INVOICE.GET, {
    order_status: orderStatus,
    delivery_id: deliveryId,
  });

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error(`Failed to download invoice (${res.status})`);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `atulyash-invoice-${deliveryId || orderStatus || 'order'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}
