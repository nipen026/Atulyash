import { getCustomerId, getUserId, logout } from './auth.js';
import {
  fetchAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  fetchSubscriptionPacks,
} from './storefront.js';
import {
  fetchOrders,
  fetchOrderById,
  fetchSubscriptionOrders,
  fetchOrderDelivery,
  changeOrderAddress,
  reorder,
  downloadInvoice,
} from './orders.js';
import {
  fetchActiveSubscriptions,
  fetchCancellationReasons,
  cancelSubscription,
  fetchSubscriptionSettings,
  fetchSkipSummary,
  fetchSkippableDeliveries,
  skipDelivery,
  unskipDelivery,
  previewPackChange,
  updateSubscriptionPack,
  fetchVacations,
  startVacation,
  endVacation,
} from './subscriptionManagement.js';
import {
  fetchWalletBalance,
  fetchRechargeOptions,
  fetchPrepaidAdvantageSlabs,
  previewRecharge,
  rechargeWallet,
  fetchWalletTransactions,
} from './wallet.js';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './notifications.js';
import {
  fetchUserProfile,
  updateUserProfile,
  fetchCustomerProfile,
  deactivateCustomer,
  submitAccountDeletionRequest,
} from './profile.js';
import { fetchOrderReview, submitReview, rateRider } from './reviews.js';
import { fetchFaqs, groupFaqsByCategory, fetchContactUs, fetchTruthBook } from './content.js';
import { fadeIn } from './animate.js';
import { focusFirst, trapFocus } from './a11y.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const TABS = [
  { id: 'orders', label: 'Orders' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'profile', label: 'Profile' },
  { id: 'help', label: 'Help' },
];

const NOTIFICATION_FILTERS = [
  { id: 'all', label: 'All', params: {} },
  { id: 'unread', label: 'Unread', params: { is_read: false } },
  { id: 'orders', label: 'Orders', params: { category: 'orders' } },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

let root = null;
let state = {};
let releaseFocusTrap = null;
let lastFocusedBeforeOpen = null;

function initialState() {
  return {
    activeTab: 'orders',
    busy: false,
    error: null,
    notice: null,

    orders: null,
    ordersCount: 0,
    ordersPage: 1,
    ordersFilter: null, // null = all, true = one-time only, false = subscription only
    // Order detail drill-down
    openOrder: null,
    openOrderDeliveries: null,
    openOrderReview: null,
    changingAddressForOrder: false,
    ratingDeliveryId: null,

    subscriptions: null,
    subscriptionSettings: null,
    cancellationReasons: [],
    skipSummary: null,
    skippableDeliveries: null,
    subscriptionView: 'overview', // overview | skip | vacation | cancel | edit-pack
    vacations: [],
    vacationStart: todayIso(),
    vacationEnd: todayIso(),
    // Pack-change flow
    editPacks: [],
    editPackId: null,
    editDeliveryDay: DAYS[0],
    packChangePreview: null,

    walletBalance: null,
    rechargeOptions: [],
    prepaidSlabs: [],
    walletTransactions: [],
    rechargePreview: null,
    customRechargeAmount: '',

    addresses: null,
    editingAddressId: null,

    notifications: null,
    notificationsPage: 1,
    notificationsCount: 0,
    notificationsFilter: 'all',

    userProfile: null,
    customerProfile: null,
    profileView: 'details', // details | delete-account

    faqs: null,
    contactDetails: null,
    truthBook: null,
  };
}

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

export function mountAccount(rootEl) {
  root = rootEl;
  root.innerHTML = `
    <div class="atulyash-app-backdrop" data-close></div>
    <div class="atulyash-app-panel atulyash-account-panel" role="dialog" aria-modal="true" aria-label="Your Atulyash account">
      <button class="atulyash-app-close" type="button" aria-label="Close" data-close>&times;</button>
      <div class="atulyash-account-tabs" data-tabs></div>
      <div class="atulyash-app-body"></div>
    </div>
  `;
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeAccount));
}

export function openAccount() {
  if (!root) return;
  state = initialState();
  lastFocusedBeforeOpen = document.activeElement;
  root.classList.add('is-open');
  document.body.classList.add('atulyash-app-open');
  render();
  loadTab('orders');

  const panel = root.querySelector('.atulyash-app-panel');
  focusFirst(panel);
  releaseFocusTrap = trapFocus(panel, closeAccount);
}

export function closeAccount() {
  root.classList.remove('is-open');
  document.body.classList.remove('atulyash-app-open');
  releaseFocusTrap?.();
  releaseFocusTrap = null;
  lastFocusedBeforeOpen?.focus?.();
}

function describeError(err) {
  if (err?.data && typeof err.data === 'object') {
    const firstKey = Object.keys(err.data)[0];
    const firstVal = err.data[firstKey];
    if (Array.isArray(firstVal)) return `${firstKey}: ${firstVal[0]}`;
  }
  return err?.message || 'Something went wrong. Please try again.';
}

async function loadTab(tab) {
  const customerId = getCustomerId();
  setState({ activeTab: tab, error: null, notice: null });

  try {
    if (tab === 'orders' && state.orders === null) {
      const { results, count } = await fetchOrders(customerId, { page: 1, oneTime: state.ordersFilter });
      setState({ orders: results, ordersCount: count, ordersPage: 1 });
    } else if (tab === 'subscription' && state.subscriptions === null) {
      const [subscriptions, settings] = await Promise.all([
        fetchActiveSubscriptions(customerId),
        fetchSubscriptionSettings(),
      ]);
      setState({ subscriptions, subscriptionSettings: settings });
    } else if (tab === 'wallet' && state.walletBalance === null) {
      const [balance, options, slabs, transactions] = await Promise.all([
        fetchWalletBalance(customerId),
        fetchRechargeOptions().catch(() => []),
        fetchPrepaidAdvantageSlabs().catch(() => []),
        fetchWalletTransactions().catch(() => []),
      ]);
      setState({
        walletBalance: balance,
        rechargeOptions: options,
        prepaidSlabs: slabs,
        walletTransactions: transactions,
      });
    } else if (tab === 'addresses' && state.addresses === null) {
      const addresses = await fetchAddresses(customerId);
      setState({ addresses });
    } else if (tab === 'notifications' && state.notifications === null) {
      const { results, count } = await fetchNotifications({ page: 1 });
      setState({ notifications: results, notificationsCount: count, notificationsPage: 1 });
    } else if (tab === 'profile' && state.userProfile === null) {
      const userId = getUserId();
      const [user, customer] = await Promise.all([
        userId ? fetchUserProfile(userId) : Promise.resolve({}),
        fetchCustomerProfile(customerId).catch(() => null),
      ]);
      setState({ userProfile: user, customerProfile: customer });
    } else if (tab === 'help' && state.faqs === null) {
      const [faqs, contact, truthBook] = await Promise.all([
        fetchFaqs().catch(() => []),
        fetchContactUs().catch(() => null),
        fetchTruthBook().catch(() => null),
      ]);
      setState({ faqs, contactDetails: contact, truthBook });
    }
  } catch (err) {
    // Seed just this tab's field so its "Loading…" placeholder doesn't
    // persist forever underneath the error banner — but leave the other
    // tabs' fields untouched (still null) so switching to them still
    // triggers a real fetch instead of showing a false "nothing here".
    const fallbackByTab = {
      orders: { orders: [] },
      subscription: { subscriptions: [] },
      wallet: { walletBalance: {}, rechargeOptions: [], prepaidSlabs: [], walletTransactions: [] },
      addresses: { addresses: [] },
      notifications: { notifications: [] },
      profile: { userProfile: {}, customerProfile: null },
      help: { faqs: [] },
    };
    setState({ error: describeError(err), ...(fallbackByTab[tab] || {}) });
  }
}

// ---- Orders ----

async function loadOrders({ page = state.ordersPage, oneTime = state.ordersFilter } = {}) {
  setState({ busy: true, error: null });
  try {
    const { results, count } = await fetchOrders(getCustomerId(), { page, oneTime });
    setState({ busy: false, orders: results, ordersCount: count, ordersPage: page, ordersFilter: oneTime });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

/**
 * Opens the detail view for an order. Subscription orders additionally carry
 * their generated per-delivery schedule, and we look up any existing review so
 * the view can offer "rate this order" only when it hasn't been rated yet.
 */
async function openOrderDetail(orderId) {
  setState({ busy: true, error: null, notice: null });
  try {
    const order = await fetchOrderById(orderId);
    const isSubscription = Boolean(order?.subscription || order?.subscription_plan || order?.one_time === false);

    const [deliveries, review] = await Promise.all([
      isSubscription
        ? fetchSubscriptionOrders(orderId).then((r) => r.results).catch(() => [])
        : Promise.resolve([]),
      fetchOrderReview(orderId).catch(() => null),
    ]);

    setState({
      busy: false,
      openOrder: order,
      openOrderDeliveries: deliveries,
      openOrderReview: review,
      changingAddressForOrder: false,
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

function closeOrderDetail() {
  setState({
    openOrder: null,
    openOrderDeliveries: null,
    openOrderReview: null,
    changingAddressForOrder: false,
    error: null,
  });
}

async function handleChangeOrderAddress(orderId, addressId) {
  setState({ busy: true, error: null });
  try {
    await changeOrderAddress(orderId, Number(addressId));
    const order = await fetchOrderById(orderId);
    setState({
      busy: false,
      openOrder: order,
      changingAddressForOrder: false,
      notice: 'Delivery address updated for this order.',
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

/** Loads the address list on demand — the Orders tab doesn't fetch it upfront. */
async function openChangeOrderAddress() {
  setState({ busy: true, error: null });
  try {
    const addresses = state.addresses ?? await fetchAddresses(getCustomerId());
    setState({ busy: false, addresses, changingAddressForOrder: true });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleSubmitReview(orderId, { productId, rating, review }) {
  setState({ busy: true, error: null });
  try {
    const saved = await submitReview({
      orderId,
      productId,
      userId: getUserId() ? Number(getUserId()) : undefined,
      rating: Number(rating),
      review,
    });
    setState({
      busy: false,
      openOrderReview: saved,
      notice: 'Thanks — your review is in moderation and will appear once approved.',
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleRateRider(deliveryId, rating) {
  setState({ busy: true, error: null });
  try {
    await rateRider(deliveryId, Number(rating));
    // Re-read the delivery so the stored rating (not the optimistic value) shows.
    const updated = await fetchOrderDelivery(deliveryId).catch(() => null);
    const deliveries = (state.openOrderDeliveries || []).map((d) => (
      String(d.id) === String(deliveryId) ? { ...d, ...(updated || { rider_rating: rating }) } : d
    ));
    setState({ busy: false, openOrderDeliveries: deliveries, notice: 'Thanks for rating your rider.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleReorder(orderId) {
  setState({ busy: true, error: null, notice: null });
  try {
    await reorder(orderId);
    setState({ busy: false, notice: 'Added to your cart. Open "Start My Weekly Plan Online" to check out.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleDownloadInvoice(order) {
  setState({ busy: true, error: null });
  try {
    await downloadInvoice({ deliveryId: order.delivery_id || order.id });
    setState({ busy: false });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

// ---- Subscription ----

async function openSkipView(subId) {
  setState({ busy: true, error: null });
  try {
    const [summary, deliveries] = await Promise.all([
      fetchSkipSummary(subId),
      fetchSkippableDeliveries(subId),
    ]);
    setState({ busy: false, subscriptionView: 'skip', skipSummary: summary, skippableDeliveries: deliveries });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleSkip(subId, { deliveryId, deliveryDate }) {
  setState({ busy: true, error: null });
  try {
    await skipDelivery(subId, { deliveryId, deliveryDate });
    const [deliveries, summary] = await Promise.all([
      fetchSkippableDeliveries(subId),
      fetchSkipSummary(subId).catch(() => state.skipSummary),
    ]);
    setState({ busy: false, skippableDeliveries: deliveries, skipSummary: summary, notice: 'Delivery skipped.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleUnskip(subId, { deliveryId, deliveryDate }) {
  setState({ busy: true, error: null });
  try {
    await unskipDelivery(subId, { deliveryId, deliveryDate });
    const [deliveries, summary] = await Promise.all([
      fetchSkippableDeliveries(subId),
      fetchSkipSummary(subId).catch(() => state.skipSummary),
    ]);
    setState({ busy: false, skippableDeliveries: deliveries, skipSummary: summary, notice: 'Delivery restored.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function openVacationView() {
  setState({ busy: true, error: null });
  try {
    const vacations = await fetchVacations(getCustomerId());
    setState({ busy: false, subscriptionView: 'vacation', vacations });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleStartVacation(subId) {
  if (state.vacationEnd < state.vacationStart) {
    setState({ error: 'The vacation end date cannot be before the start date.' });
    return;
  }
  setState({ busy: true, error: null });
  try {
    await startVacation({ subscriptionId: subId, startDate: state.vacationStart, endDate: state.vacationEnd });
    const vacations = await fetchVacations(getCustomerId());
    setState({ busy: false, vacations, notice: 'Vacation mode scheduled.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleEndVacation(vacationId) {
  setState({ busy: true, error: null });
  try {
    await endVacation(vacationId);
    const vacations = await fetchVacations(getCustomerId());
    setState({ busy: false, vacations, notice: 'Vacation mode ended.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

// ---- Change subscription pack ----

async function openEditPackView(sub) {
  setState({ busy: true, error: null });
  try {
    const packs = await fetchSubscriptionPacks();
    setState({
      busy: false,
      subscriptionView: 'edit-pack',
      editPacks: packs,
      editPackId: sub?.subscription_pack?.id ?? sub?.subscription_pack ?? packs[0]?.id ?? null,
      editDeliveryDay: sub?.delivery_day || DAYS[0],
      packChangePreview: null,
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handlePreviewPackChange(planId) {
  setState({ busy: true, error: null });
  try {
    const preview = await previewPackChange(planId, {
      newPackId: state.editPackId,
      newDeliveryDay: state.editDeliveryDay,
    });
    setState({ busy: false, packChangePreview: preview });
  } catch (err) {
    setState({ busy: false, error: describeError(err), packChangePreview: null });
  }
}

async function handleConfirmPackChange(planId) {
  setState({ busy: true, error: null });
  try {
    await updateSubscriptionPack(planId, {
      newPackId: state.editPackId,
      newDeliveryDay: state.editDeliveryDay,
    });
    const subscriptions = await fetchActiveSubscriptions(getCustomerId());
    setState({
      busy: false,
      subscriptions,
      subscriptionView: 'overview',
      packChangePreview: null,
      notice: 'Your plan has been updated.',
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function openCancelView() {
  setState({ busy: true, error: null });
  try {
    const reasons = await fetchCancellationReasons();
    setState({ busy: false, subscriptionView: 'cancel', cancellationReasons: reasons });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleCancelSubscription(subId, reasonId, detail = '') {
  setState({ busy: true, error: null });
  try {
    await cancelSubscription(subId, reasonId, detail);
    const subscriptions = await fetchActiveSubscriptions(getCustomerId());
    setState({ busy: false, subscriptions, subscriptionView: 'overview', notice: 'Subscription cancelled.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

// ---- Wallet ----

async function handlePreviewRecharge(amount) {
  setState({ busy: true, error: null });
  try {
    const preview = await previewRecharge(amount);
    setState({ busy: false, rechargePreview: preview });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

function handleRecharge(amount) {
  setState({ busy: true, error: null });
  rechargeWallet(Number(amount), {
    onSuccess: async () => {
      const [balance, transactions] = await Promise.all([
        fetchWalletBalance(getCustomerId()),
        fetchWalletTransactions().catch(() => []),
      ]);
      setState({ busy: false, walletBalance: balance, walletTransactions: transactions, notice: 'Wallet recharged successfully.' });
    },
    onError: (err) => setState({ busy: false, error: err.message || 'Recharge failed.' }),
  });
}

// ---- Addresses ----

function formatCoordinate(value) {
  const str = String(value);
  return str.length > 9 ? str.substring(0, 9) : str;
}

async function handleSaveAddressEdit(addressId, formValues) {
  setState({ busy: true, error: null });
  try {
    const payload = {
      full_address: formValues.fullAddress,
      landmark: formValues.landmark || '',
      city: formValues.city,
      state: formValues.state,
      pincode: formValues.pincode,
      address_phone: formValues.phone || '',
    };
    if (addressId) {
      await updateAddress(addressId, payload);
    } else {
      await createAddress({
        ...payload,
        is_active: true,
        description: '',
        house_name: '',
        floor: '',
        tower_wing: '',
        country: 'IN',
        is_default: false,
        address_type: 'HOME',
        customer: Number(getCustomerId()),
      });
    }
    const addresses = await fetchAddresses(getCustomerId());
    setState({ busy: false, addresses, editingAddressId: null, notice: 'Address saved.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleDeleteAddress(addressId) {
  setState({ busy: true, error: null });
  try {
    await deleteAddress(addressId);
    const addresses = await fetchAddresses(getCustomerId());
    setState({ busy: false, addresses, notice: 'Address removed.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

// ---- Notifications ----

function notificationFilterParams(filterId = state.notificationsFilter) {
  const filter = NOTIFICATION_FILTERS.find((f) => f.id === filterId) || NOTIFICATION_FILTERS[0];
  return {
    category: filter.params.category ?? null,
    isRead: filter.params.is_read ?? null,
  };
}

async function loadNotifications({ page = 1, filterId = state.notificationsFilter } = {}) {
  setState({ busy: true, error: null });
  try {
    const { results, count } = await fetchNotifications({ page, ...notificationFilterParams(filterId) });
    setState({
      busy: false,
      notifications: results,
      notificationsCount: count,
      notificationsPage: page,
      notificationsFilter: filterId,
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleMarkRead(id) {
  try {
    await markNotificationRead(id);
    const { results, count } = await fetchNotifications({
      page: state.notificationsPage,
      ...notificationFilterParams(),
    });
    setState({ notifications: results, notificationsCount: count });
  } catch (err) {
    setState({ error: describeError(err) });
  }
}

async function handleMarkAllRead() {
  setState({ busy: true, error: null });
  try {
    await markAllNotificationsRead();
    const { results, count } = await fetchNotifications({ page: 1, ...notificationFilterParams() });
    setState({
      busy: false,
      notifications: results,
      notificationsCount: count,
      notificationsPage: 1,
      notice: 'All caught up.',
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

// ---- Profile ----

async function handleSaveProfile({ name, email, profilePicture }) {
  const userId = getUserId();
  if (!userId) {
    setState({ error: 'We could not identify your account. Please log out and sign in again.' });
    return;
  }

  setState({ busy: true, error: null, notice: null });
  try {
    const updated = await updateUserProfile(userId, { name, email, profilePicture });
    setState({ busy: false, userProfile: updated, notice: 'Profile updated.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

/**
 * Soft-deactivation. Ends the session afterwards because the account can no
 * longer be used — staying logged in would just produce failures.
 */
async function handleDeactivateAccount() {
  setState({ busy: true, error: null });
  try {
    await deactivateCustomer(getCustomerId());
    setState({ busy: false, notice: 'Your account has been deactivated. Signing you out…' });
    setTimeout(() => {
      logout().catch(() => {});
      closeAccount();
    }, 1500);
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleRequestAccountDeletion(reason) {
  setState({ busy: true, error: null });
  try {
    await submitAccountDeletionRequest(reason);
    setState({
      busy: false,
      profileView: 'details',
      notice: 'Deletion request submitted. Our team will confirm by email once your data is removed.',
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

// ---- Rendering ----

function render() {
  if (!root) return;
  const tabsEl = root.querySelector('[data-tabs]');
  tabsEl.innerHTML = TABS.map((t) => `
    <button class="atulyash-account-tab ${state.activeTab === t.id ? 'is-active' : ''}" data-tab="${t.id}" type="button">${t.label}</button>
  `).join('');
  tabsEl.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => loadTab(btn.dataset.tab));
  });

  const body = root.querySelector('.atulyash-app-body');
  body.innerHTML = renderBanners() + renderTab();
  attachHandlers(body);
  fadeIn(body);
}

function renderBanners() {
  let html = '';
  if (state.error) html += `<p class="atulyash-app-error" role="alert">${escapeHtml(state.error)}</p>`;
  if (state.notice) html += `<p class="atulyash-app-notice" role="status">${escapeHtml(state.notice)}</p>`;
  return html;
}

function renderTab() {
  switch (state.activeTab) {
    case 'orders': return renderOrders();
    case 'subscription': return renderSubscription();
    case 'wallet': return renderWallet();
    case 'addresses': return renderAddresses();
    case 'notifications': return renderNotifications();
    case 'profile': return renderProfile();
    case 'help': return renderHelp();
    default: return '';
  }
}

/** Shared pager. Renders nothing when everything fits on one page. */
function renderPager({ page, count, pageSize, action }) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (totalPages <= 1) return '';
  return `
    <div class="atulyash-pager">
      <button class="atulyash-app-link" type="button" data-action="${action}" data-page="${page - 1}" ${page <= 1 || state.busy ? 'disabled' : ''}>Previous</button>
      <span class="atulyash-app-sub">Page ${page} of ${totalPages}</span>
      <button class="atulyash-app-link" type="button" data-action="${action}" data-page="${page + 1}" ${page >= totalPages || state.busy ? 'disabled' : ''}>Next</button>
    </div>
  `;
}

function renderStarPicker(name, current = 0) {
  return `
    <div class="atulyash-stars" role="radiogroup" aria-label="Rating out of 5">
      ${[1, 2, 3, 4, 5].map((n) => `
        <label class="atulyash-star ${n <= current ? 'is-on' : ''}">
          <input type="radio" name="${name}" value="${n}" ${n === current ? 'checked' : ''} required>
          <span aria-hidden="true">&#9733;</span>
          <span class="sr-only">${n} star${n > 1 ? 's' : ''}</span>
        </label>
      `).join('')}
    </div>
  `;
}

function renderOrderDetail() {
  const order = state.openOrder;
  const deliveries = state.openOrderDeliveries || [];
  const review = state.openOrderReview;

  const deliveryRows = deliveries.map((d) => {
    const rated = d.rider_rating;
    const isRating = String(state.ratingDeliveryId) === String(d.id);

    return `
      <div class="atulyash-list-row">
        <div>
          <strong>${formatDate(d.delivery_date || d.date)}</strong>
          <span class="atulyash-app-sub">${escapeHtml(d.status || d.delivery_status || '')}${d.rider_name ? ` &middot; ${escapeHtml(d.rider_name)}` : ''}</span>
          ${isRating ? `
            <form data-form="rate-rider" data-delivery="${d.id}">
              ${renderStarPicker(`riderRating-${d.id}`)}
              <button class="button button-dark" type="submit" ${state.busy ? 'disabled' : ''}>Save rating</button>
              <button class="atulyash-app-link" type="button" data-action="cancel-rate-rider">Cancel</button>
            </form>
          ` : ''}
        </div>
        <div class="atulyash-list-row-actions">
          ${rated
            ? `<span class="atulyash-app-sub">Rider rated ${escapeHtml(rated)}/5</span>`
            : (isRating
              ? ''
              : `<button class="atulyash-app-link" type="button" data-action="open-rate-rider" data-delivery="${d.id}" ${state.busy ? 'disabled' : ''}>Rate rider</button>`)}
          <button class="atulyash-app-link" type="button" data-action="invoice" data-id="${order.id}" data-delivery="${d.id}" ${state.busy ? 'disabled' : ''}>Invoice</button>
        </div>
      </div>
    `;
  }).join('');

  if (state.changingAddressForOrder) {
    const options = (state.addresses || []).map((a) => `
      <option value="${a.id}">${escapeHtml(a.full_address || a.description || `Address ${a.id}`)}</option>
    `).join('');
    return `
      <h2>Change delivery address</h2>
      <p class="atulyash-app-sub">Order #${escapeHtml(order.id)}. This only works before the order is dispatched.</p>
      <form data-form="change-order-address">
        <select name="addressId" required>${options || '<option value="">No saved addresses</option>'}</select>
        <button class="button button-primary button-block" type="submit" data-id="${order.id}" ${state.busy ? 'disabled' : ''}>Update address</button>
      </form>
      <button class="atulyash-app-link" type="button" data-action="cancel-change-order-address">Back</button>
    `;
  }

  return `
    <h2>Order #${escapeHtml(order.id)}</h2>
    <p class="atulyash-app-sub">
      ${formatDate(order.created_at || order.order_date)} &middot;
      ${escapeHtml(order.status || order.order_status || '')} &middot;
      &#8377;${escapeHtml(order.total_amount ?? order.amount ?? '0')}
    </p>

    ${order.delivery_address || order.customer_address
      ? `<div class="atulyash-cart-totals"><div><span>Delivering to</span><span>${escapeHtml(order.delivery_address?.full_address || order.customer_address?.full_address || '')}</span></div></div>`
      : ''}

    <div class="atulyash-app-row atulyash-cart-actions">
      <button class="atulyash-app-link" type="button" data-action="open-change-order-address" ${state.busy ? 'disabled' : ''}>Change address</button>
      <button class="atulyash-app-link" type="button" data-action="reorder" data-id="${order.id}" ${state.busy ? 'disabled' : ''}>Reorder</button>
      <button class="atulyash-app-link" type="button" data-action="invoice" data-id="${order.id}" data-delivery="${order.delivery_id || ''}" ${state.busy ? 'disabled' : ''}>Invoice</button>
    </div>

    ${deliveries.length > 0 ? `
      <h2>Deliveries</h2>
      <div class="atulyash-list">${deliveryRows}</div>
    ` : ''}

    <h2>Your review</h2>
    ${review
      ? `
        <div class="atulyash-cart-totals">
          <div><span>Rating</span><span>${escapeHtml(review.rating)}/5</span></div>
          ${review.review ? `<div><span>Review</span><span>${escapeHtml(review.review)}</span></div>` : ''}
        </div>
        ${review.to_display === false ? `<p class="atulyash-app-sub">In moderation — it'll appear publicly once approved.</p>` : ''}
      `
      : `
        <form data-form="submit-review">
          ${renderStarPicker('rating')}
          <label for="atulyashReviewText">Tell us about the atta</label>
          <textarea id="atulyashReviewText" name="review" rows="3" required></textarea>
          <input type="hidden" name="productId" value="${escapeHtml(order.items?.[0]?.product ?? order.items?.[0]?.product_id ?? '')}">
          <button class="button button-primary button-block" type="submit" data-id="${order.id}" ${state.busy ? 'disabled' : ''}>Submit review</button>
        </form>
      `}

    <button class="atulyash-app-link" type="button" data-action="close-order-detail">Back to orders</button>
  `;
}

function renderOrders() {
  if (state.openOrder) return renderOrderDetail();
  if (state.orders === null) return `<p class="atulyash-app-loading">Loading your orders…</p>`;

  const filters = [
    { id: 'all', label: 'All', value: null },
    { id: 'one-time', label: 'One-time', value: true },
    { id: 'subscription', label: 'Subscription', value: false },
  ];
  const filterBar = `
    <div class="atulyash-filter-bar">
      ${filters.map((f) => `
        <button class="atulyash-chip ${state.ordersFilter === f.value ? 'is-active' : ''}" type="button"
          data-action="filter-orders" data-filter="${f.id}" ${state.busy ? 'disabled' : ''}>${f.label}</button>
      `).join('')}
    </div>
  `;

  if (state.orders.length === 0) {
    return `<h2>Your orders</h2>${filterBar}<p class="atulyash-app-sub">No orders to show here yet.</p>`;
  }

  const rows = state.orders.map((order) => `
    <div class="atulyash-list-row">
      <div>
        <strong>Order #${escapeHtml(order.id)}</strong>
        <span class="atulyash-app-sub">${formatDate(order.created_at || order.order_date)} &middot; ${escapeHtml(order.status || order.order_status || '')}</span>
      </div>
      <div class="atulyash-list-row-actions">
        <span>&#8377;${escapeHtml(order.total_amount ?? order.amount ?? '0')}</span>
        <button class="atulyash-app-link" type="button" data-action="open-order" data-id="${order.id}" ${state.busy ? 'disabled' : ''}>Details</button>
        <button class="atulyash-app-link" type="button" data-action="reorder" data-id="${order.id}" ${state.busy ? 'disabled' : ''}>Reorder</button>
      </div>
    </div>
  `).join('');

  return `
    <h2>Your orders</h2>
    ${filterBar}
    <div class="atulyash-list">${rows}</div>
    ${renderPager({ page: state.ordersPage, count: state.ordersCount, pageSize: 15, action: 'orders-page' })}
  `;
}

function renderSubscription() {
  if (state.subscriptions === null) return `<p class="atulyash-app-loading">Loading your subscription…</p>`;
  if (state.subscriptions.length === 0) return `<h2>Subscription</h2><p class="atulyash-app-sub">You don't have an active subscription yet — use "Start My Weekly Plan Online" to set one up.</p>`;

  const sub = state.subscriptions[0];

  if (state.subscriptionView === 'skip') {
    const deliveries = state.skippableDeliveries || [];
    const summary = state.skipSummary || {};
    const settings = state.subscriptionSettings || {};

    // Prefer the plan's own summary; fall back to the global policy setting.
    const allowed = summary.skips_allowed ?? summary.allowed_skips ?? settings.max_skips_per_cycle ?? settings.skip_limit;
    const used = summary.skips_used ?? summary.used_skips;
    const remaining = summary.skips_remaining ?? summary.remaining_skips
      ?? (allowed !== undefined && used !== undefined ? allowed - used : undefined);
    const exhausted = remaining !== undefined && Number(remaining) <= 0;

    const rows = deliveries.map((d) => {
      const date = d.delivery_date || d.date;
      return `
        <div class="atulyash-list-row">
          <span>${formatDate(date)}</span>
          ${d.is_skipped
            ? `<button class="atulyash-app-link" type="button" data-action="unskip" data-delivery="${d.id}" data-date="${escapeHtml(date)}" ${state.busy ? 'disabled' : ''}>Restore</button>`
            : `<button class="atulyash-app-link" type="button" data-action="skip" data-delivery="${d.id}" data-date="${escapeHtml(date)}" ${state.busy || exhausted ? 'disabled' : ''}>Skip</button>`}
        </div>
      `;
    }).join('');

    return `
      <h2>Skip a delivery</h2>
      ${remaining !== undefined
        ? `<p class="atulyash-app-sub">${escapeHtml(remaining)} of ${escapeHtml(allowed ?? '—')} skips left this cycle.</p>`
        : ''}
      ${summary.refund_amount ? `<p class="atulyash-app-sub">Skipping refunds &#8377;${escapeHtml(summary.refund_amount)} to your wallet per skipped delivery.</p>` : ''}
      ${exhausted ? `<p class="atulyash-app-notice" role="status">You've used all your skips for this cycle. You can still restore a skipped delivery.</p>` : ''}
      <div class="atulyash-list">${rows || '<p>No upcoming deliveries to skip.</p>'}</div>
      <button class="atulyash-app-link" type="button" data-action="back-to-subscription">Back</button>
    `;
  }

  if (state.subscriptionView === 'edit-pack') {
    const packOptions = (state.editPacks || []).map((p) => `
      <option value="${p.id}" ${String(state.editPackId) === String(p.id) ? 'selected' : ''}>
        ${escapeHtml(p.name)}${p.weekly_quantity ? ` — ${escapeHtml(p.weekly_quantity)} kg/week` : ''}
      </option>
    `).join('');
    const dayOptions = DAYS.map((day) => `
      <option value="${day}" ${state.editDeliveryDay === day ? 'selected' : ''}>${day}</option>
    `).join('');

    const previewDates = state.packChangePreview?.delivery_dates || [];

    return `
      <h2>Change your plan</h2>
      <p class="atulyash-app-sub">Preview the new schedule before confirming — the change applies from your next delivery.</p>
      <label for="atulyashEditPack">Plan</label>
      <select id="atulyashEditPack" data-edit-pack>${packOptions || '<option value="">No plans available</option>'}</select>
      <label for="atulyashEditDay">Delivery day</label>
      <select id="atulyashEditDay" data-edit-day>${dayOptions}</select>

      <button class="button button-dark button-block" type="button" data-action="preview-pack-change" data-sub="${sub.id}" ${state.busy ? 'disabled' : ''}>
        ${state.busy ? 'Checking…' : 'Preview new dates'}
      </button>

      ${state.packChangePreview ? `
        <div class="atulyash-date-grid">
          ${previewDates.length > 0
            ? previewDates.map((d) => `<span class="atulyash-date-chip">${formatDate(d)}</span>`).join('')
            : '<p>No dates returned for this combination.</p>'}
        </div>
        ${state.packChangePreview.price_difference
          ? `<div class="atulyash-cart-totals"><div><span>Price difference</span><span>&#8377;${escapeHtml(state.packChangePreview.price_difference)}</span></div></div>`
          : ''}
        <button class="button button-primary button-block" type="button" data-action="confirm-pack-change" data-sub="${sub.id}" ${state.busy ? 'disabled' : ''}>Confirm change</button>
      ` : ''}

      <button class="atulyash-app-link" type="button" data-action="back-to-subscription">Back</button>
    `;
  }

  if (state.subscriptionView === 'vacation') {
    const rows = (state.vacations || []).map((v) => `
      <div class="atulyash-list-row">
        <span>${formatDate(v.start_date)} &ndash; ${formatDate(v.end_date)}</span>
        ${v.is_active !== false ? `<button class="atulyash-app-link" type="button" data-action="end-vacation" data-id="${v.id}" data-sub="${sub.id}">End now</button>` : ''}
      </div>
    `).join('');
    return `
      <h2>Vacation mode</h2>
      <div class="atulyash-list">${rows || '<p>No vacations scheduled.</p>'}</div>
      <form data-form="vacation">
        <div class="atulyash-app-row">
          <div>
            <label for="atulyashVacStart">Start date</label>
            <input id="atulyashVacStart" name="startDate" type="date" value="${state.vacationStart}" min="${todayIso()}">
          </div>
          <div>
            <label for="atulyashVacEnd">End date</label>
            <input id="atulyashVacEnd" name="endDate" type="date" value="${state.vacationEnd}" min="${state.vacationStart}">
          </div>
        </div>
        <button class="button button-primary button-block" type="submit" data-sub="${sub.id}" ${state.busy ? 'disabled' : ''}>Schedule vacation</button>
      </form>
      <button class="atulyash-app-link" type="button" data-action="back-to-subscription">Back</button>
    `;
  }

  if (state.subscriptionView === 'cancel') {
    const options = (state.cancellationReasons || []).map((r) => `<option value="${r.id}">${escapeHtml(r.reason || r.name)}</option>`).join('');
    const noticeDays = state.subscriptionSettings?.cancellation_notice_days;
    return `
      <h2>Cancel subscription</h2>
      <p class="atulyash-app-sub">We're sorry to see you go. Let us know why:</p>
      ${noticeDays ? `<p class="atulyash-app-notice" role="status">Cancellations take effect after ${escapeHtml(noticeDays)} days' notice.</p>` : ''}
      <form data-form="cancel-subscription">
        <select name="reason" required>${options || '<option value="">No reasons configured</option>'}</select>
        <label for="atulyashCancelDetail">Anything else you'd like us to know? (optional)</label>
        <textarea id="atulyashCancelDetail" name="detail" rows="3"></textarea>
        <button class="button button-primary button-block" type="submit" data-sub="${sub.id}" ${state.busy ? 'disabled' : ''}>Confirm cancellation</button>
      </form>
      <button class="atulyash-app-link" type="button" data-action="back-to-subscription">Back</button>
    `;
  }

  return `
    <h2>Your subscription</h2>
    <div class="atulyash-plan-card is-selected">
      <span class="atulyash-plan-name">${escapeHtml(sub.subscription_pack?.name || sub.subscription_pack_name || 'Weekly plan')}</span>
      <span class="atulyash-plan-detail">${escapeHtml(sub.delivery_day || '')} delivery &middot; ${escapeHtml(sub.status || (sub.is_active ? 'Active' : 'Inactive'))}</span>
    </div>
    <div class="atulyash-app-row">
      <button class="button button-dark" type="button" data-action="open-skip" data-sub="${sub.id}">Skip a delivery</button>
      <button class="button button-dark" type="button" data-action="open-vacation" data-sub="${sub.id}">Vacation mode</button>
    </div>
    <div class="atulyash-app-row">
      <button class="button button-dark" type="button" data-action="open-edit-pack" data-sub="${sub.id}">Change plan</button>
    </div>
    <button class="atulyash-app-link" type="button" data-action="open-cancel">Cancel subscription</button>
  `;
}

function renderWallet() {
  if (state.walletBalance === null) return `<p class="atulyash-app-loading">Loading your wallet…</p>`;

  const balance = state.walletBalance.wallet_balance ?? state.walletBalance.balance ?? 0;
  const optionButtons = (state.rechargeOptions || []).map((opt) => `
    <button class="atulyash-plan-card" type="button" data-action="recharge" data-amount="${opt.recharge_amount ?? opt.amount}">
      <span class="atulyash-plan-name">&#8377;${escapeHtml(opt.recharge_amount ?? opt.amount)}</span>
      <span class="atulyash-plan-detail">+ &#8377;${escapeHtml(opt.prepaid_advantage_amount ?? opt.bonus ?? 0)} bonus</span>
    </button>
  `).join('');

  const transactions = (state.walletTransactions || []).slice(0, 10).map((tx) => `
    <div class="atulyash-list-row">
      <span>${formatDate(tx.created_at || tx.date)} &middot; ${escapeHtml(tx.description || tx.transaction_type || '')}</span>
      <span>&#8377;${escapeHtml(tx.amount ?? 0)}</span>
    </div>
  `).join('');

  const slabRows = (state.prepaidSlabs || []).map((slab) => {
    const from = slab.min_amount ?? slab.from_amount ?? slab.amount_from;
    const to = slab.max_amount ?? slab.to_amount ?? slab.amount_to;
    const bonus = slab.bonus_amount ?? slab.prepaid_advantage_amount ?? slab.bonus_percentage;
    const isPercent = slab.bonus_percentage !== undefined && slab.bonus_amount === undefined;
    return `
      <div class="atulyash-list-row">
        <span>&#8377;${escapeHtml(from ?? 0)}${to ? ` – &#8377;${escapeHtml(to)}` : '+'}</span>
        <span>+ ${isPercent ? `${escapeHtml(bonus)}%` : `&#8377;${escapeHtml(bonus ?? 0)}`}</span>
      </div>
    `;
  }).join('');

  return `
    <h2>Wallet</h2>
    <div class="atulyash-cart-totals"><div class="atulyash-cart-total"><span>Balance</span><span>&#8377;${escapeHtml(balance)}</span></div></div>
    <p class="atulyash-app-sub">Top up your wallet:</p>
    <div class="atulyash-plan-grid">${optionButtons || '<p>No recharge offers right now.</p>'}</div>
    <form data-form="custom-recharge" class="atulyash-app-row">
      <input name="amount" type="number" min="1" placeholder="Custom amount" value="${escapeHtml(state.customRechargeAmount)}">
      <button class="atulyash-app-link" type="button" data-action="preview-recharge" ${state.busy ? 'disabled' : ''}>Preview</button>
      <button class="button button-dark" type="submit" ${state.busy ? 'disabled' : ''}>Recharge</button>
    </form>
    ${state.rechargePreview ? `
      <div class="atulyash-cart-totals">
        <div><span>You pay</span><span>&#8377;${escapeHtml(state.rechargePreview.amount ?? 0)}</span></div>
        ${state.rechargePreview.bonus_amount ? `<div><span>Bonus credit</span><span>+ &#8377;${escapeHtml(state.rechargePreview.bonus_amount)}</span></div>` : ''}
        <div class="atulyash-cart-total"><span>Wallet credit</span><span>&#8377;${escapeHtml(state.rechargePreview.total_credit ?? state.rechargePreview.credited_amount ?? state.rechargePreview.amount ?? 0)}</span></div>
      </div>
    ` : ''}
    ${slabRows ? `
      <h2>Prepaid advantage</h2>
      <p class="atulyash-app-sub">Recharge more, get more added to your wallet.</p>
      <div class="atulyash-list">${slabRows}</div>
    ` : ''}
    <h2>Recent activity</h2>
    <div class="atulyash-list">${transactions || '<p>No transactions yet.</p>'}</div>
  `;
}

function renderAddresses() {
  if (state.addresses === null) return `<p class="atulyash-app-loading">Loading your addresses…</p>`;

  if (state.editingAddressId !== null) {
    const existing = state.editingAddressId === 'new'
      ? {}
      : state.addresses.find((a) => a.id === state.editingAddressId) || {};
    return `
      <h2>${state.editingAddressId === 'new' ? 'Add address' : 'Edit address'}</h2>
      <form data-form="address-edit">
        <label for="atulyashEditFull">Address</label>
        <input id="atulyashEditFull" name="fullAddress" type="text" required value="${escapeHtml(existing.full_address)}">
        <label for="atulyashEditLandmark">Flat / house name, floor, landmark</label>
        <input id="atulyashEditLandmark" name="landmark" type="text" value="${escapeHtml(existing.landmark)}">
        <div class="atulyash-app-row">
          <div><label for="atulyashEditCity">City</label><input id="atulyashEditCity" name="city" type="text" required value="${escapeHtml(existing.city)}"></div>
          <div><label for="atulyashEditState">State</label><input id="atulyashEditState" name="state" type="text" required value="${escapeHtml(existing.state)}"></div>
        </div>
        <div class="atulyash-app-row">
          <div><label for="atulyashEditPincode">Pincode</label><input id="atulyashEditPincode" name="pincode" type="text" maxlength="6" required value="${escapeHtml(existing.pincode)}"></div>
          <div><label for="atulyashEditPhone">Contact number</label><input id="atulyashEditPhone" name="phone" type="tel" maxlength="10" value="${escapeHtml(existing.address_phone)}"></div>
        </div>
        <button class="button button-primary button-block" type="submit" ${state.busy ? 'disabled' : ''}>Save address</button>
        <button class="atulyash-app-link" type="button" data-action="cancel-edit-address">Cancel</button>
      </form>
    `;
  }

  const rows = state.addresses.map((addr) => `
    <div class="atulyash-list-row">
      <div>
        <strong>${escapeHtml(addr.full_address || addr.description || 'Address')}</strong>
        <span class="atulyash-app-sub">${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} ${escapeHtml(addr.pincode)}</span>
      </div>
      <div class="atulyash-list-row-actions">
        <button class="atulyash-app-link" type="button" data-action="edit-address" data-id="${addr.id}">Edit</button>
        <button class="atulyash-app-link" type="button" data-action="delete-address" data-id="${addr.id}" ${state.busy ? 'disabled' : ''}>Delete</button>
      </div>
    </div>
  `).join('');

  return `
    <h2>Your addresses</h2>
    <div class="atulyash-list">${rows || '<p>No saved addresses.</p>'}</div>
    <button class="button button-dark button-block" type="button" data-action="add-address">Add new address</button>
  `;
}

function renderNotifications() {
  if (state.notifications === null) return `<p class="atulyash-app-loading">Loading notifications…</p>`;

  const rows = state.notifications.map((n) => `
    <div class="atulyash-list-row ${n.is_read ? '' : 'is-unread'}"
      ${n.is_read ? '' : `data-action="mark-read" data-id="${n.id}" role="button" tabindex="0" aria-label="Mark as read"`}>
      <div>
        <strong>${escapeHtml(n.title || n.heading || 'Update')}</strong>
        <span class="atulyash-app-sub">${escapeHtml(n.message || n.body || '')}</span>
      </div>
      <span class="atulyash-app-sub">${formatDate(n.created_at)}</span>
    </div>
  `).join('');

  const filterBar = `
    <div class="atulyash-filter-bar">
      ${NOTIFICATION_FILTERS.map((f) => `
        <button class="atulyash-chip ${state.notificationsFilter === f.id ? 'is-active' : ''}" type="button"
          data-action="filter-notifications" data-filter="${f.id}" ${state.busy ? 'disabled' : ''}>${f.label}</button>
      `).join('')}
    </div>
  `;

  return `
    <div class="atulyash-app-row"><h2>Notifications</h2><button class="atulyash-app-link" type="button" data-action="mark-all-read" ${state.busy ? 'disabled' : ''}>Mark all read</button></div>
    ${filterBar}
    <div class="atulyash-list">${rows || '<p>No notifications here.</p>'}</div>
    ${renderPager({ page: state.notificationsPage, count: state.notificationsCount, pageSize: 10, action: 'notifications-page' })}
  `;
}

function renderProfile() {
  if (state.userProfile === null) return `<p class="atulyash-app-loading">Loading your profile…</p>`;

  if (state.profileView === 'delete-account') {
    return `
      <h2>Delete your account</h2>
      <p class="atulyash-app-sub">
        This asks our team to permanently erase your account and personal data. It can't be undone,
        and any active subscription will be cancelled. If you'd rather just pause, deactivate instead.
      </p>
      <form data-form="delete-account">
        <label for="atulyashDeleteReason">Why are you leaving?</label>
        <textarea id="atulyashDeleteReason" name="reason" rows="3" required></textarea>
        <button class="button button-primary button-block" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Submitting…' : 'Request account deletion'}
        </button>
      </form>
      <button class="atulyash-app-link" type="button" data-action="back-to-profile">Back</button>
    `;
  }

  const user = state.userProfile || {};
  const customer = state.customerProfile || {};
  const picture = user.profile_picture || user.profile_photo;

  return `
    <h2>Your profile</h2>
    ${picture ? `<img class="atulyash-avatar" src="${escapeHtml(picture)}" alt="" width="72" height="72">` : ''}
    <form data-form="profile">
      <label for="atulyashProfileName">Name</label>
      <input id="atulyashProfileName" name="name" type="text" value="${escapeHtml(user.name || user.full_name)}">
      <label for="atulyashProfileEmail">Email</label>
      <input id="atulyashProfileEmail" name="email" type="email" value="${escapeHtml(user.email)}">
      <label for="atulyashProfilePhoto">Profile picture</label>
      <input id="atulyashProfilePhoto" name="profilePicture" type="file" accept="image/*">
      <button class="button button-primary button-block" type="submit" ${state.busy ? 'disabled' : ''}>
        ${state.busy ? 'Saving…' : 'Save profile'}
      </button>
    </form>

    <div class="atulyash-cart-totals">
      <div><span>Mobile</span><span>${escapeHtml(user.mobile || customer.mobile || '—')}</span></div>
      ${customer.customer_type ? `<div><span>Customer type</span><span>${escapeHtml(customer.customer_type)}</span></div>` : ''}
    </div>

    <h2>Account</h2>
    <p class="atulyash-app-sub">
      Deactivating hides your profile and stops recurring charges — you can come back later.
      Deletion is permanent.
    </p>
    <div class="atulyash-app-row">
      <button class="atulyash-app-link" type="button" data-action="deactivate-account" ${state.busy ? 'disabled' : ''}>Deactivate account</button>
      <button class="atulyash-app-link" type="button" data-action="open-delete-account" ${state.busy ? 'disabled' : ''}>Delete account</button>
    </div>
  `;
}

function renderHelp() {
  if (state.faqs === null) return `<p class="atulyash-app-loading">Loading help…</p>`;

  const contact = state.contactDetails || {};
  const email = contact.email || contact.support_email;
  const phone = contact.phone || contact.phone_number || contact.helpline_number;
  const truthBookUrl = state.truthBook?.file || state.truthBook?.document || state.truthBook?.pdf || state.truthBook?.url;

  // Grouped by the API's faq_type_name (Payment / Order / Delivery / Misc).
  const faqRows = groupFaqsByCategory(state.faqs || []).map((group) => `
    <h3 class="atulyash-faq-group">${escapeHtml(group.category)}</h3>
    ${group.items.map((faq) => `
      <details>
        <summary>${escapeHtml(faq.question)}<span aria-hidden="true">+</span></summary>
        <p>${escapeHtml(faq.answer)}</p>
      </details>
    `).join('')}
  `).join('');

  return `
    <h2>Contact us</h2>
    ${email || phone ? `
      <div class="atulyash-cart-totals">
        ${email ? `<div><span>Email</span><span><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></span></div>` : ''}
        ${phone ? `<div><span>Phone</span><span><a href="tel:${escapeHtml(String(phone).replace(/[^\d+]/g, ''))}">${escapeHtml(phone)}</a></span></div>` : ''}
      </div>
    ` : `<p class="atulyash-app-sub">Write to us at <a href="mailto:atulyashfoods@gmail.com">atulyashfoods@gmail.com</a>.</p>`}

    ${truthBookUrl ? `
      <h2>Truth Book</h2>
      <p class="atulyash-app-sub">Ingredient details and quality certifications for every product.</p>
      <a class="button button-dark button-block" href="${escapeHtml(truthBookUrl)}" target="_blank" rel="noopener">
        ${escapeHtml(state.truthBook.title || 'Open the Truth Book')}
      </a>
    ` : ''}

    <h2>Frequently asked</h2>
    <div class="atulyash-faq-list">${faqRows || '<p class="atulyash-app-sub">No FAQs available right now.</p>'}</div>
  `;
}

// ---- Event wiring ----

function attachHandlers(body) {
  // ---- Orders ----
  body.querySelectorAll('[data-action="reorder"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReorder(btn.dataset.id));
  });
  body.querySelectorAll('[data-action="invoice"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDownloadInvoice({ id: btn.dataset.id, delivery_id: btn.dataset.delivery }));
  });
  body.querySelectorAll('[data-action="open-order"]').forEach((btn) => {
    btn.addEventListener('click', () => openOrderDetail(btn.dataset.id));
  });
  body.querySelector('[data-action="close-order-detail"]')?.addEventListener('click', closeOrderDetail);

  body.querySelectorAll('[data-action="filter-orders"]').forEach((btn) => {
    const valueByFilter = { all: null, 'one-time': true, subscription: false };
    btn.addEventListener('click', () => loadOrders({ page: 1, oneTime: valueByFilter[btn.dataset.filter] }));
  });
  body.querySelectorAll('[data-action="orders-page"]').forEach((btn) => {
    btn.addEventListener('click', () => loadOrders({ page: Number(btn.dataset.page) }));
  });

  body.querySelector('[data-action="open-change-order-address"]')?.addEventListener('click', openChangeOrderAddress);
  body.querySelector('[data-action="cancel-change-order-address"]')?.addEventListener('click', () => setState({ changingAddressForOrder: false }));
  const changeAddressForm = body.querySelector('[data-form="change-order-address"]');
  changeAddressForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const addressId = new FormData(changeAddressForm).get('addressId');
    if (addressId) handleChangeOrderAddress(e.submitter.dataset.id, addressId);
  });

  const reviewForm = body.querySelector('[data-form="submit-review"]');
  reviewForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(reviewForm);
    handleSubmitReview(e.submitter.dataset.id, {
      productId: fd.get('productId') ? Number(fd.get('productId')) : undefined,
      rating: fd.get('rating'),
      review: fd.get('review')?.toString().trim(),
    });
  });

  body.querySelectorAll('[data-action="open-rate-rider"]').forEach((btn) => {
    btn.addEventListener('click', () => setState({ ratingDeliveryId: btn.dataset.delivery }));
  });
  body.querySelector('[data-action="cancel-rate-rider"]')?.addEventListener('click', () => setState({ ratingDeliveryId: null }));
  body.querySelectorAll('[data-form="rate-rider"]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const deliveryId = form.dataset.delivery;
      const rating = new FormData(form).get(`riderRating-${deliveryId}`);
      if (rating) handleRateRider(deliveryId, rating);
    });
  });

  // ---- Subscription ----
  body.querySelector('[data-action="open-skip"]')?.addEventListener('click', (e) => openSkipView(e.target.dataset.sub));
  body.querySelector('[data-action="open-vacation"]')?.addEventListener('click', () => openVacationView());
  body.querySelector('[data-action="open-cancel"]')?.addEventListener('click', openCancelView);
  body.querySelector('[data-action="open-edit-pack"]')?.addEventListener('click', (e) => {
    const sub = (state.subscriptions || []).find((s) => String(s.id) === e.target.dataset.sub);
    openEditPackView(sub || {});
  });
  body.querySelector('[data-action="back-to-subscription"]')?.addEventListener('click', () => setState({
    subscriptionView: 'overview',
    packChangePreview: null,
    error: null,
  }));

  body.querySelector('[data-edit-pack]')?.addEventListener('change', (e) => {
    // Any change invalidates the preview it produced.
    setState({ editPackId: Number(e.target.value), packChangePreview: null });
  });
  body.querySelector('[data-edit-day]')?.addEventListener('change', (e) => {
    setState({ editDeliveryDay: e.target.value, packChangePreview: null });
  });
  body.querySelector('[data-action="preview-pack-change"]')?.addEventListener('click', (e) => {
    handlePreviewPackChange(e.target.dataset.sub);
  });
  body.querySelector('[data-action="confirm-pack-change"]')?.addEventListener('click', (e) => {
    handleConfirmPackChange(e.target.dataset.sub);
  });

  body.querySelectorAll('[data-action="skip"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSkip(state.subscriptions[0].id, {
      deliveryId: btn.dataset.delivery,
      deliveryDate: btn.dataset.date,
    }));
  });
  body.querySelectorAll('[data-action="unskip"]').forEach((btn) => {
    btn.addEventListener('click', () => handleUnskip(state.subscriptions[0].id, {
      deliveryId: btn.dataset.delivery,
      deliveryDate: btn.dataset.date,
    }));
  });

  const vacationForm = body.querySelector('[data-form="vacation"]');
  vacationForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(vacationForm);
    setState({ vacationStart: fd.get('startDate'), vacationEnd: fd.get('endDate') });
    handleStartVacation(e.submitter.dataset.sub);
  });
  body.querySelectorAll('[data-action="end-vacation"]').forEach((btn) => {
    btn.addEventListener('click', () => handleEndVacation(btn.dataset.id));
  });

  const cancelForm = body.querySelector('[data-form="cancel-subscription"]');
  cancelForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(cancelForm);
    handleCancelSubscription(
      e.submitter.dataset.sub,
      fd.get('reason'),
      fd.get('detail')?.toString().trim() || ''
    );
  });

  // ---- Wallet ----
  body.querySelectorAll('[data-action="recharge"]').forEach((btn) => {
    btn.addEventListener('click', () => handleRecharge(btn.dataset.amount));
  });
  const customRechargeForm = body.querySelector('[data-form="custom-recharge"]');
  customRechargeForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = new FormData(customRechargeForm).get('amount');
    if (amount) handleRecharge(amount);
  });
  body.querySelector('[data-action="preview-recharge"]')?.addEventListener('click', () => {
    const amount = new FormData(customRechargeForm).get('amount');
    if (amount) handlePreviewRecharge(Number(amount));
  });

  body.querySelector('[data-action="add-address"]')?.addEventListener('click', () => setState({ editingAddressId: 'new' }));
  body.querySelectorAll('[data-action="edit-address"]').forEach((btn) => {
    btn.addEventListener('click', () => setState({ editingAddressId: Number(btn.dataset.id) }));
  });
  body.querySelectorAll('[data-action="delete-address"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteAddress(btn.dataset.id));
  });
  body.querySelector('[data-action="cancel-edit-address"]')?.addEventListener('click', () => setState({ editingAddressId: null }));

  const addressEditForm = body.querySelector('[data-form="address-edit"]');
  addressEditForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(addressEditForm);
    const id = state.editingAddressId === 'new' ? null : state.editingAddressId;
    handleSaveAddressEdit(id, {
      fullAddress: fd.get('fullAddress')?.toString().trim(),
      landmark: fd.get('landmark')?.toString().trim(),
      city: fd.get('city')?.toString().trim(),
      state: fd.get('state')?.toString().trim(),
      pincode: fd.get('pincode')?.toString().trim(),
      phone: fd.get('phone')?.toString().trim(),
    });
  });

  // ---- Notifications ----
  body.querySelectorAll('[data-action="mark-read"]').forEach((row) => {
    row.addEventListener('click', () => handleMarkRead(row.dataset.id));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleMarkRead(row.dataset.id);
      }
    });
  });
  body.querySelector('[data-action="mark-all-read"]')?.addEventListener('click', handleMarkAllRead);
  body.querySelectorAll('[data-action="filter-notifications"]').forEach((btn) => {
    btn.addEventListener('click', () => loadNotifications({ page: 1, filterId: btn.dataset.filter }));
  });
  body.querySelectorAll('[data-action="notifications-page"]').forEach((btn) => {
    btn.addEventListener('click', () => loadNotifications({ page: Number(btn.dataset.page) }));
  });

  // ---- Profile ----
  const profileForm = body.querySelector('[data-form="profile"]');
  profileForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(profileForm);
    const file = fd.get('profilePicture');
    handleSaveProfile({
      name: fd.get('name')?.toString().trim(),
      email: fd.get('email')?.toString().trim(),
      // An empty file input still yields a File with size 0 — don't upload that.
      profilePicture: file instanceof File && file.size > 0 ? file : null,
    });
  });

  body.querySelector('[data-action="open-delete-account"]')?.addEventListener('click', () => {
    setState({ profileView: 'delete-account', error: null, notice: null });
  });
  body.querySelector('[data-action="back-to-profile"]')?.addEventListener('click', () => {
    setState({ profileView: 'details', error: null });
  });
  body.querySelector('[data-action="deactivate-account"]')?.addEventListener('click', () => {
    // Irreversible from the UI's point of view, so make the user say yes.
    if (window.confirm('Deactivate your account? Your subscription charges will stop and your profile will be hidden.')) {
      handleDeactivateAccount();
    }
  });

  const deleteForm = body.querySelector('[data-form="delete-account"]');
  deleteForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const reason = new FormData(deleteForm).get('reason')?.toString().trim();
    if (!reason) return;
    if (window.confirm('Submit a permanent account deletion request? This cannot be undone.')) {
      handleRequestAccountDeletion(reason);
    }
  });

  // Star pickers: reflect the chosen rating without a full re-render, so the
  // textarea keeps its content and focus.
  body.querySelectorAll('.atulyash-stars').forEach((group) => {
    group.addEventListener('change', () => {
      const labels = [...group.querySelectorAll('.atulyash-star')];
      const chosen = labels.findIndex((l) => l.querySelector('input')?.checked);
      labels.forEach((label, i) => label.classList.toggle('is-on', i <= chosen));
    });
  });
}
