import { apiClient } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';
import { STORAGE_KEYS } from './config.js';

export async function fetchOrders(customerId) {
  const res = await apiClient({
    url: `${API_ROUTES.ORDER.GET}?is_active=true&customer__id=${customerId}&pending_order=false`,
  });
  return res.data?.results || [];
}

export async function fetchOrderById(orderId) {
  const res = await apiClient({ url: API_ROUTES.ORDER.GET_BY_ID(orderId) });
  return res.data;
}

export async function fetchOrderDelivery(deliveryId) {
  const res = await apiClient({ url: API_ROUTES.ORDER_DELIVERY.GET_BY_ID(deliveryId) });
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
  const url = `https://api.atulyash.com${API_ROUTES.GENERATE_INVOICE.GET}?order_status=${orderStatus}&delivery_id=${deliveryId}`;

  const res = await fetch(url, {
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
