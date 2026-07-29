// Mirrors the Next.js app's lib/endPoint.ts (customer-facing subset only —
// admin/rider/beat-plan routes from that file are out of scope here). Paths
// match that file so this stays easy to diff against the reference app;
// apiClient.js normalizes the trailing slash, so it doesn't matter whether
// it's present here.
//
// Cross-checked against api_documentation.md (the Flutter app's API surface).
// Where the two disagreed, the doc won and the old path is noted inline so the
// change is easy to revert if the doc turns out to be the stale side.
export const API_ROUTES = {
  AUTH: {
    OTP_REQUEST: '/users/otp/request/',
    OTP_VERIFY: '/users/otp/verify/',
    TOKEN_REFRESH: '/token/refresh/',
  },

  AUTH_USER: {
    GET: (id) => `/users/users/${id}/`,
    UPDATE: (id) => `/users/users/${id}/`,
    ACCOUNT_DELETION_REQUEST: '/users/account-deletion-requests/',
  },

  CUSTOMER: {
    GET: (id) => `/customers/customers/${id}/`,
    // Soft-deactivation (is_active=false), not a hard delete.
    UPDATE: (id) => `/customers/customers/${id}/`,
  },

  PRODUCT: {
    GET: '/products/products/',
    VIDEOS: '/products/product-videos/',
    VIDEO_TITLES: '/products/product-video-titles/',
    HOME_SECTIONS: '/products/home-screen-sections/grouped-into-sections/',
    TRUTH_BOOK_LATEST: '/products/product-truth-books/latest/',
    CONTACT_US: '/products/contact-us/',
  },

  PRODUCT_SUBSCRIPTION_PACKS: {
    GET: '/subscription/subscription_pack/',
    CONSUMPTION_CALCULATOR: '/subscription/subscription_pack/consumption-calculator/',
  },

  PINCODE: {
    GET: '/pincodes/pincode/',
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
    UPDATE: (id) => `/orders/cart-items/${id}/`,
    DELETE: (id) => `/orders/cart-items/${id}/`,
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
    UPDATE_PACK: (id) => `/subscription/subscription_plan/${id}/update-pack/`,
    PREVIEW_PACK_CHANGE: (id) => `/subscription/subscription_plan/${id}/preview-pack-change/`,
  },

  SUBSCRIPTION_CANCEL_REASON: {
    GET: '/subscription/cancellation_reasons/',
  },

  SUBSCRIPTION_SETTINGS: {
    // Singleton settings row — the doc hardcodes id 1.
    GET: '/subscription/subscription_settings/1/',
  },

  SUBSCRIPTION_HOME_SECTIONS: {
    GET: '/subscription/home_screen_section/grouped-into-sections/',
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

  CART: {
    CLEAR: '/orders/cart/clear-cart/',
    APPLY_KIT: '/orders/cart/apply-kit/',
    REMOVE_KIT: '/orders/cart/remove-kit/',
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
    SUBSCRIPTION_ORDERS: (id) => `/orders/order/${id}/subscription-orders/`,
    CHANGE_ADDRESS: (id) => `/orders/order/${id}/change-address/`,
  },

  ORDER_DELIVERY: {
    GET_BY_ID: (id) => `/orders/order-delivery/${id}/`,
    // Same route, PATCH — used to attach a rider rating to a delivery.
    UPDATE: (id) => `/orders/order-delivery/${id}/`,
  },

  GENERATE_INVOICE: {
    GET: '/orders/order/invoice/',
  },

  CUSTOMER_WALLET: {
    // Was `/customers/customers/${id}/` — that returns the customer object with
    // an embedded wallet, which happened to work but is off-contract.
    BALANCE: (id) => `/customers/customer-wallet/${id}/`,
    RECHARGE_OPTIONS: (cartAmount) => `/customers/customer-wallet/recharge/options/${cartAmount ? `?cart_amount=${cartAmount}` : ''}`,
    // Was `/customers/customer-wallet/bonus-slabs/`, which is not a documented
    // route (likely a 404 in production).
    PREPAID_ADVANTAGE_SLABS: '/customers/customer-wallet/prepaid-advantage-slabs/',
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
    DEVICE_REGISTER: '/notifications/devices/register/',
    DEVICE_UNREGISTER: '/notifications/devices/unregister/',
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
