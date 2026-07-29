import { apiClient, withQuery, toList } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';
import { RAZORPAY_KEY } from './config.js';
import { getCartId } from './auth.js';

export async function fetchSubscriptionPacks() {
  const res = await apiClient({
    url: withQuery(API_ROUTES.PRODUCT_SUBSCRIPTION_PACKS.GET, { is_active: true, page_size: 100 }),
  });
  const packs = toList(res.data, ['packs']);
  return [...packs].sort((a, b) => (a.order_rank || 0) - (b.order_rank || 0));
}

/**
 * Catalog products. Pass a pack id to get only products (and pricing) valid
 * under that subscription tier — the `subscription_pack_id` filter from the doc.
 */
export async function fetchProducts(subscriptionPackId = null) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.PRODUCT.GET, { subscription_pack_id: subscriptionPackId }),
  });
  return toList(res.data, ['products']);
}

export async function fetchAddresses(customerId) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.CUSTOMER_ADDRESS.GET, {
      customer__id: customerId,
      // Without is_active the list includes soft-deleted addresses.
      is_active: true,
      page_size: 100,
    }),
  });
  return toList(res.data, ['addresses']);
}

/** Active serviceable pincodes across the logistics network. */
export async function fetchPincodes() {
  const res = await apiClient({
    url: withQuery(API_ROUTES.PINCODE.GET, { is_active: true, page_size: 200 }),
  });
  return toList(res.data, ['pincodes']);
}

/**
 * Checks a pincode against the serviceable list. Returns `true` when the
 * pincode is covered, `false` when it definitively is not, and `null` when the
 * check could not run (network/API failure) so callers can let the address
 * through rather than blocking signup on an unrelated outage.
 */
export async function isPincodeServiceable(pincode) {
  const target = String(pincode || '').trim();
  if (!/^\d{6}$/.test(target)) return false;
  try {
    const pincodes = await fetchPincodes();
    if (pincodes.length === 0) return null;
    return pincodes.some((p) => String(p.pincode ?? p.code ?? p.name).trim() === target);
  } catch {
    return null;
  }
}

export async function createAddress(payload) {
  const res = await apiClient({
    url: API_ROUTES.CUSTOMER_ADDRESS.POST,
    method: 'POST',
    body: payload,
  });
  return res.data;
}

export async function updateAddress(addressId, payload) {
  const res = await apiClient({
    url: API_ROUTES.CUSTOMER_ADDRESS.UPDATE(addressId),
    method: 'PATCH',
    body: payload,
  });
  return res.data;
}

export async function deleteAddress(addressId) {
  await apiClient({ url: API_ROUTES.CUSTOMER_ADDRESS.DELETE(addressId), method: 'DELETE' });
}

export async function previewWeeklyPlan({ addressId, subscriptionPackId, deliveryDay, startDate }) {
  const body = {
    address_id: addressId,
    subscription_pack_id: subscriptionPackId,
    duration_in_months: 0,
    delivery_day: deliveryDay,
    ...(startDate ? { start_date: startDate } : {}),
  };
  const res = await apiClient({ url: API_ROUTES.WEEKLY_PLAN_PREVIEW.POST, method: 'POST', body });
  return res.data;
}

/**
 * Adding a brand-new subscription pack to the cart is a documented gap: the
 * reference Next.js app (WeeklyPlanDrawer.tsx) has this call commented out in
 * production. We try the shape implied by that dead code first, and fall back
 * to a plain subscription_plan creation call if the backend rejects it.
 * VERIFY THIS LIVE — see plan notes. If both fail, check the Network tab for
 * the actual validation error and adjust the payload shape accordingly.
 */
export async function addSubscriptionToCart({ subscriptionPackId, startDate, addressId, deliveryDay }) {
  const cartId = getCartId();
  try {
    const res = await apiClient({
      url: API_ROUTES.ORDER_CART_ITEMS.POST,
      method: 'POST',
      body: {
        is_active: true,
        description: '',
        cart_item_type: 'Subscription',
        quantity: 1,
        cart: cartId ? Number(cartId) : undefined,
        subscription_pack: subscriptionPackId,
        subscription_start_date: startDate,
      },
    });
    return res.data;
  } catch (err) {
    if (err.status !== 400) throw err;
    // Fallback shape — unconfirmed, see plan notes.
    const res = await apiClient({
      url: API_ROUTES.SUBSCRIPTION_PLAN.POST,
      method: 'POST',
      body: {
        subscription_pack: subscriptionPackId,
        customer_address: addressId,
        delivery_day: deliveryDay,
        start_date: startDate,
        duration_in_months: 0,
      },
    });
    return res.data;
  }
}

/**
 * Adds a one-time purchase (or a subscription add-on) product pack to the cart.
 * `cartItemType` maps to the doc's `cart_item_type`: "One Time" for a regular
 * purchase, "Add On" for an extra attached to an active subscription schedule.
 */
export async function addProductToCart({ productPackId, quantity = 1, cartItemType = 'One Time' }) {
  const cartId = getCartId();
  const res = await apiClient({
    url: API_ROUTES.ORDER_CART_ITEMS.POST,
    method: 'POST',
    body: {
      is_active: true,
      description: '',
      cart_item_type: cartItemType,
      quantity,
      ...(cartId ? { cart: Number(cartId) } : {}),
      product_pack: productPackId,
    },
  });
  return res.data;
}

export async function updateCartItemQuantity(itemId, quantity) {
  const res = await apiClient({
    url: API_ROUTES.ORDER_CART_ITEMS.UPDATE(itemId),
    method: 'PATCH',
    body: { quantity },
  });
  return res.data;
}

export async function removeCartItem(itemId) {
  await apiClient({ url: API_ROUTES.ORDER_CART_ITEMS.DELETE(itemId), method: 'DELETE' });
}

/** Empties the cart — resets items, totals, taxes and coupon application. */
export async function clearCart() {
  const res = await apiClient({ url: API_ROUTES.CART.CLEAR });
  return res.data;
}

export async function getCart(cartId) {
  const res = await apiClient({ url: API_ROUTES.GET_USER_CART_ITEMS.GET_BY_ID(cartId) });
  return res.data;
}

/**
 * Coupons eligible for the cart as it stands. The apply endpoint takes a
 * numeric coupon id, not the human-facing code, so this is also what resolves a
 * typed-in code to an id (see `applyCouponByCode`).
 */
export async function fetchEligibleCoupons(codeSearch = null) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.GET_VALID_COUPON_FOR_CART.GET, { is_active: true, code: codeSearch }),
  });
  return toList(res.data, ['coupons']);
}

export async function applyCoupon(couponId) {
  const res = await apiClient({
    url: API_ROUTES.APPLY_COUPON_TO_CART.POST,
    method: 'POST',
    body: { coupon_id: couponId },
  });
  return res.data;
}

/**
 * Applies a coupon the customer typed as a code. The API only accepts ids, so
 * resolve the code against the eligible-coupons list first and fail with a
 * message the user can act on when there's no match.
 */
export async function applyCouponByCode(code) {
  const target = String(code || '').trim().toUpperCase();
  if (!target) throw new Error('Enter a coupon code.');

  const coupons = await fetchEligibleCoupons(target);
  const match = coupons.find((c) => String(c.code || '').trim().toUpperCase() === target);
  if (!match) {
    throw new Error('That coupon code is not valid for your cart.');
  }
  return applyCoupon(match.id);
}

export async function removeCoupon() {
  const res = await apiClient({ url: API_ROUTES.REMOVE_COUPON_FROM_CART.POST, method: 'POST' });
  return res.data;
}

/** Adds the introductory/loyalty "Atulyash Kit" benefits to the cart. */
export async function applyKit() {
  const res = await apiClient({ url: API_ROUTES.CART.APPLY_KIT, method: 'POST' });
  return res.data;
}

export async function removeKit() {
  const res = await apiClient({ url: API_ROUTES.CART.REMOVE_KIT, method: 'POST' });
  return res.data;
}

export async function getDeliveryAvailability(addressId) {
  const res = await apiClient({ url: API_ROUTES.DELIVERY_AVAILABILITY.GET(addressId) });
  return res.data;
}

export async function validateDeliveryDate({ addressId, date, deliveryDate }) {
  const res = await apiClient({
    url: API_ROUTES.VALIDATE_DELIVERY_DATE.POST,
    method: 'POST',
    body: { address_id: addressId, date, delivery_date: deliveryDate },
  });
  return res.data;
}

export async function placeOrder({ addressId, paymentMethod, deliveryDate }) {
  const body = {
    address_id: addressId,
    payment_method: paymentMethod,
    notes: '',
    duration_in_months: 0,
    ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
  };
  const res = await apiClient({ url: API_ROUTES.PLACE_ORDER.POST, method: 'POST', body });
  return res.data?.data || res.data;
}

export async function verifyOrderPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const res = await apiClient({
    url: API_ROUTES.VERIFY_ORDER_PAYMENT.POST,
    method: 'POST',
    body: {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    },
  });
  return res.data;
}

let razorpayScriptPromise = null;

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout script'));
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

/**
 * Note: the reference Next.js app sources the Razorpay `key` differently
 * between the order-checkout flow (client-side env var, used by default here)
 * and the wallet-recharge flow (a `key_id` returned by the backend). Pass
 * `order.key` explicitly to override — wallet.js does this.
 * @param {{orderId: string, amount: number, currency: string, description: string, key?: string}} order
 * @param {(payload: {razorpay_order_id: string, razorpay_payment_id: string, razorpay_signature: string}) => void} onSuccess
 * @param {(err: any) => void} onError
 */
export async function openRazorpayCheckout(order, onSuccess, onError) {
  try {
    await loadRazorpayScript();
  } catch (err) {
    onError(err);
    return;
  }

  const razorpay = new window.Razorpay({
    key: order.key || RAZORPAY_KEY,
    amount: order.amount,
    currency: order.currency || 'INR',
    order_id: order.orderId,
    name: 'Atulyash',
    description: order.description || '',
    handler: (response) => onSuccess(response),
    modal: {
      ondismiss: () => onError(new Error('Payment cancelled')),
    },
  });

  razorpay.open();
}
