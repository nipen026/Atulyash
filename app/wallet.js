import { apiClient } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';
import { openRazorpayCheckout } from './storefront.js';

export async function fetchWalletBalance(customerId) {
  const res = await apiClient({ url: API_ROUTES.CUSTOMER_WALLET.BALANCE(customerId) });
  return res.data;
}

export async function fetchRechargeOptions(cartAmount) {
  const res = await apiClient({ url: API_ROUTES.CUSTOMER_WALLET.RECHARGE_OPTIONS(cartAmount) });
  return res.data?.results || res.data || [];
}

export async function fetchBonusSlabs() {
  const res = await apiClient({ url: API_ROUTES.CUSTOMER_WALLET.BONUS_SLABS });
  return res.data?.results || res.data || [];
}

export async function previewRecharge(amount) {
  const res = await apiClient({
    url: API_ROUTES.CUSTOMER_WALLET.RECHARGE_PREVIEW,
    method: 'POST',
    body: { amount },
  });
  return res.data;
}

export async function initiateRecharge(amount) {
  const res = await apiClient({
    url: API_ROUTES.CUSTOMER_WALLET.RECHARGE_INITIATE,
    method: 'POST',
    body: { amount },
  });
  return res.data;
}

export async function verifyRecharge({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const res = await apiClient({
    url: API_ROUTES.CUSTOMER_WALLET.RECHARGE_VERIFY,
    method: 'POST',
    body: {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    },
  });
  return res.data;
}

export async function fetchWalletTransactions() {
  const res = await apiClient({ url: API_ROUTES.CUSTOMER_WALLET.TRANSACTION_HISTORY });
  return res.data?.results || res.data || [];
}

/**
 * Full recharge flow: initiate (backend returns its own Razorpay key_id,
 * unlike the order-checkout flow — see storefront.js comment) → open
 * checkout → verify.
 */
export async function rechargeWallet(amount, { onSuccess, onError }) {
  const initiated = await initiateRecharge(amount);
  openRazorpayCheckout(
    {
      orderId: initiated.order_id,
      amount: initiated.amount,
      currency: 'INR',
      description: 'Wallet recharge',
      key: initiated.key_id,
    },
    async (payload) => {
      try {
        const verified = await verifyRecharge({
          razorpayOrderId: payload.razorpay_order_id,
          razorpayPaymentId: payload.razorpay_payment_id,
          razorpaySignature: payload.razorpay_signature,
        });
        onSuccess(verified);
      } catch (err) {
        onError(err);
      }
    },
    onError
  );
}
