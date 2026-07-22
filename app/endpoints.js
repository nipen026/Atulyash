// Mirrors the Next.js app's lib/endPoint.ts (customer-facing subset only —
// admin/rider/beat-plan routes from that file are out of scope here). Paths
// match that file so this stays easy to diff against the reference app;
// apiClient.js normalizes the trailing slash, so it doesn't matter whether
// it's present here.
export const API_ROUTES = {
  AUTH: {
    OTP_REQUEST: '/users/otp/request/',
    OTP_VERIFY: '/users/otp/verify/',
  },

  AUTH_USER: {
    UPDATE: (id) => `/users/users/${id}/`,
  },

  PRODUCT: {
    GET: '/products/products/',
  },

  PRODUCT_SUBSCRIPTION_PACKS: {
    GET: '/subscription/subscription_pack/',
  },

  CUSTOMER_ADDRESS: {
    GET: '/customers/customer-addresses/',
    POST: '/customers/customer-addresses/',
    UPDATE: (id) => `/customers/customer-addresses/${id}/`,
    DELETE: (id) => `/customers/customer-addresses/${id}/`,
  },

  WEEKLY_PLAN_PREVIEW: {
    POST: '/subscription/subscription/preview/',
  },

  ORDER_CART_ITEMS: {
    POST: '/orders/cart-items/',
  },

  SUBSCRIPTION_PLAN: {
    GET: '/subscription/subscription_plan/',
    GET_BY_ID: (id) => `/subscription/subscription_plan/${id}/`,
    // Fallback creation route if ORDER_CART_ITEMS.POST turns out not to
    // accept a new subscription pack (see plan notes / storefront.js comments).
    POST: '/subscription/subscription_plan/',
    CANCEL: (id) => `/subscription/subscription_plan/${id}/cancel/`,
    SKIP: (id) => `/subscription/subscription_plan/${id}/skip/`,
    UNSKIP: (id) => `/subscription/subscription_plan/${id}/unskip/`,
    SKIP_SUMMARY: (id) => `/subscription/subscription_plan/${id}/skip-summary/`,
    SKIPPABLE_DELIVERIES: (id) => `/subscription/subscription_plan/${id}/skippable-deliveries/`,
  },

  SUBSCRIPTION_CANCEL_REASON: {
    GET: '/subscription/cancellation_reasons/',
  },

  VACATION_MODE: {
    GET: '/subscription/vacation/',
    POST: '/subscription/vacation/',
    PATCH: (id) => `/subscription/vacation/${id}/`,
    END_VACATION: (id) => `/subscription/vacation/${id}/end_vacation/`,
  },

  GET_USER_CART_ITEMS: {
    GET_BY_ID: (cartId) => `/orders/cart/${cartId}/`,
  },

  APPLY_COUPON_TO_CART: {
    POST: '/orders/cart/apply-coupon/',
  },

  REMOVE_COUPON_FROM_CART: {
    POST: '/orders/cart/remove-coupon/',
  },

  GET_VALID_COUPON_FOR_CART: {
    GET: '/coupon/coupons/get-coupons-for-cart/',
  },

  DELIVERY_AVAILABILITY: {
    GET: (addressId) => `/orders/order-delivery/delivery-availability/?address_id=${addressId}`,
  },

  VALIDATE_DELIVERY_DATE: {
    POST: '/orders/order-delivery/validate-delivery-date/',
  },

  PLACE_ORDER: {
    POST: '/orders/order/place/',
  },

  VERIFY_ORDER_PAYMENT: {
    POST: '/orders/payment-verify/verify/',
  },

  ORDER: {
    GET: '/orders/order/',
    GET_BY_ID: (id) => `/orders/order/${id}/`,
    RE_ORDER: (id) => `/orders/order/${id}/reorder/`,
  },

  ORDER_DELIVERY: {
    GET_BY_ID: (id) => `/orders/order-delivery/${id}/`,
  },

  GENERATE_INVOICE: {
    GET: '/orders/order/invoice/',
  },

  CUSTOMER_WALLET: {
    BALANCE: (id) => `/customers/customers/${id}/`,
    RECHARGE_OPTIONS: (cartAmount) => `/customers/customer-wallet/recharge/options/${cartAmount ? `?cart_amount=${cartAmount}` : ''}`,
    BONUS_SLABS: '/customers/customer-wallet/bonus-slabs/',
    RECHARGE_PREVIEW: '/customers/customer-wallet/recharge/preview/',
    RECHARGE_INITIATE: '/customers/customer-wallet/recharge/initiate/',
    RECHARGE_VERIFY: '/customers/customer-wallet/recharge/verify/',
    TRANSACTION_HISTORY: '/orders/wallet/',
  },

  NOTIFICATIONS: {
    GET: '/notifications/',
    MARK_READ: (id) => `/notifications/${id}/read/`,
    MARK_ALL_READ: '/notifications/mark-all-read/',
    UNREAD_COUNT: '/notifications/unread-count/',
  },

  REVIEW: {
    GET: '/reviews/reviews/',
    POST: '/reviews/reviews/',
    UPDATE: (id) => `/reviews/reviews/${id}/`,
  },

  CUSTOMER_FAQ: {
    GET: '/customers/customer-faqs/',
  },
};
