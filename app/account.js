import { getCustomerId } from './auth.js';
import { fetchAddresses, createAddress, updateAddress, deleteAddress } from './storefront.js';
import { fetchOrders, reorder, downloadInvoice } from './orders.js';
import {
  fetchActiveSubscriptions,
  fetchCancellationReasons,
  cancelSubscription,
  fetchSkipSummary,
  fetchSkippableDeliveries,
  skipDelivery,
  unskipDelivery,
  fetchVacations,
  startVacation,
  endVacation,
} from './subscriptionManagement.js';
import {
  fetchWalletBalance,
  fetchRechargeOptions,
  previewRecharge,
  rechargeWallet,
  fetchWalletTransactions,
} from './wallet.js';
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './notifications.js';
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
];

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

    subscriptions: null,
    cancellationReasons: [],
    skipSummary: null,
    skippableDeliveries: null,
    subscriptionView: 'overview', // overview | skip | vacation | cancel
    vacations: [],
    vacationStart: todayIso(),
    vacationEnd: todayIso(),

    walletBalance: null,
    rechargeOptions: [],
    rechargePreview: null,
    customRechargeAmount: '',

    addresses: null,
    editingAddressId: null,

    notifications: null,
    notificationsPage: 1,
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
      const orders = await fetchOrders(customerId);
      setState({ orders });
    } else if (tab === 'subscription' && state.subscriptions === null) {
      const subscriptions = await fetchActiveSubscriptions(customerId);
      setState({ subscriptions });
    } else if (tab === 'wallet' && state.walletBalance === null) {
      const [balance, options, transactions] = await Promise.all([
        fetchWalletBalance(customerId),
        fetchRechargeOptions().catch(() => []),
        fetchWalletTransactions().catch(() => []),
      ]);
      setState({ walletBalance: balance, rechargeOptions: options, walletTransactions: transactions });
    } else if (tab === 'addresses' && state.addresses === null) {
      const addresses = await fetchAddresses(customerId);
      setState({ addresses });
    } else if (tab === 'notifications' && state.notifications === null) {
      const { results } = await fetchNotifications(1);
      setState({ notifications: results });
    }
  } catch (err) {
    // Seed just this tab's field so its "Loading…" placeholder doesn't
    // persist forever underneath the error banner — but leave the other
    // tabs' fields untouched (still null) so switching to them still
    // triggers a real fetch instead of showing a false "nothing here".
    const fallbackByTab = {
      orders: { orders: [] },
      subscription: { subscriptions: [] },
      wallet: { walletBalance: {}, rechargeOptions: [], walletTransactions: [] },
      addresses: { addresses: [] },
      notifications: { notifications: [] },
    };
    setState({ error: describeError(err), ...(fallbackByTab[tab] || {}) });
  }
}

// ---- Orders ----

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

async function handleSkip(subId, deliveryId) {
  setState({ busy: true, error: null });
  try {
    await skipDelivery(subId, deliveryId);
    const deliveries = await fetchSkippableDeliveries(subId);
    setState({ busy: false, skippableDeliveries: deliveries, notice: 'Delivery skipped.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleUnskip(subId, deliveryId) {
  setState({ busy: true, error: null });
  try {
    await unskipDelivery(subId, deliveryId);
    const deliveries = await fetchSkippableDeliveries(subId);
    setState({ busy: false, skippableDeliveries: deliveries, notice: 'Delivery restored.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function openVacationView(sub) {
  setState({ busy: true, error: null });
  try {
    const vacations = await fetchVacations(sub.customer_address);
    setState({ busy: false, subscriptionView: 'vacation', vacations });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleStartVacation(subId) {
  setState({ busy: true, error: null });
  try {
    await startVacation({ subscriptionId: subId, startDate: state.vacationStart, endDate: state.vacationEnd });
    const sub = (state.subscriptions || []).find((s) => s.id === subId);
    const vacations = await fetchVacations(sub?.customer_address);
    setState({ busy: false, vacations, notice: 'Vacation mode scheduled.' });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleEndVacation(vacationId, subId) {
  setState({ busy: true, error: null });
  try {
    await endVacation(vacationId);
    const sub = (state.subscriptions || []).find((s) => s.id === subId);
    const vacations = await fetchVacations(sub?.customer_address);
    setState({ busy: false, vacations, notice: 'Vacation mode ended.' });
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

async function handleCancelSubscription(subId, reasonId) {
  setState({ busy: true, error: null });
  try {
    await cancelSubscription(subId, reasonId);
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

async function handleMarkRead(id) {
  try {
    await markNotificationRead(id);
    const { results } = await fetchNotifications(1);
    setState({ notifications: results });
  } catch (err) {
    setState({ error: describeError(err) });
  }
}

async function handleMarkAllRead() {
  setState({ busy: true, error: null });
  try {
    await markAllNotificationsRead();
    const { results } = await fetchNotifications(1);
    setState({ busy: false, notifications: results, notice: 'All caught up.' });
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
    default: return '';
  }
}

function renderOrders() {
  if (state.orders === null) return `<p class="atulyash-app-loading">Loading your orders…</p>`;
  if (state.orders.length === 0) return `<h2>Your orders</h2><p class="atulyash-app-sub">You haven't placed an order yet.</p>`;

  const rows = state.orders.map((order) => `
    <div class="atulyash-list-row">
      <div>
        <strong>Order #${escapeHtml(order.id)}</strong>
        <span class="atulyash-app-sub">${formatDate(order.created_at || order.order_date)} &middot; ${escapeHtml(order.status || order.order_status || '')}</span>
      </div>
      <div class="atulyash-list-row-actions">
        <span>&#8377;${escapeHtml(order.total_amount ?? order.amount ?? '0')}</span>
        <button class="atulyash-app-link" type="button" data-action="reorder" data-id="${order.id}" ${state.busy ? 'disabled' : ''}>Reorder</button>
        <button class="atulyash-app-link" type="button" data-action="invoice" data-id="${order.id}" data-delivery="${order.delivery_id || ''}" ${state.busy ? 'disabled' : ''}>Invoice</button>
      </div>
    </div>
  `).join('');

  return `<h2>Your orders</h2><div class="atulyash-list">${rows}</div>`;
}

function renderSubscription() {
  if (state.subscriptions === null) return `<p class="atulyash-app-loading">Loading your subscription…</p>`;
  if (state.subscriptions.length === 0) return `<h2>Subscription</h2><p class="atulyash-app-sub">You don't have an active subscription yet — use "Start My Weekly Plan Online" to set one up.</p>`;

  const sub = state.subscriptions[0];

  if (state.subscriptionView === 'skip') {
    const deliveries = state.skippableDeliveries || [];
    const rows = deliveries.map((d) => `
      <div class="atulyash-list-row">
        <span>${formatDate(d.delivery_date || d.date)}</span>
        ${d.is_skipped
          ? `<button class="atulyash-app-link" type="button" data-action="unskip" data-delivery="${d.id}">Restore</button>`
          : `<button class="atulyash-app-link" type="button" data-action="skip" data-delivery="${d.id}" ${state.busy ? 'disabled' : ''}>Skip</button>`}
      </div>
    `).join('');
    return `
      <h2>Skip a delivery</h2>
      ${state.skipSummary ? `<p class="atulyash-app-sub">Skipping refunds &#8377;${escapeHtml(state.skipSummary.refund_amount ?? 0)} to your wallet per skipped delivery.</p>` : ''}
      <div class="atulyash-list">${rows || '<p>No upcoming deliveries to skip.</p>'}</div>
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
    return `
      <h2>Cancel subscription</h2>
      <p class="atulyash-app-sub">We're sorry to see you go. Let us know why:</p>
      <form data-form="cancel-subscription">
        <select name="reason" required>${options || '<option value="">No reasons configured</option>'}</select>
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

  return `
    <h2>Wallet</h2>
    <div class="atulyash-cart-totals"><div class="atulyash-cart-total"><span>Balance</span><span>&#8377;${escapeHtml(balance)}</span></div></div>
    <p class="atulyash-app-sub">Top up your wallet:</p>
    <div class="atulyash-plan-grid">${optionButtons || '<p>No recharge offers right now.</p>'}</div>
    <form data-form="custom-recharge" class="atulyash-app-row">
      <input name="amount" type="number" min="1" placeholder="Custom amount" value="${escapeHtml(state.customRechargeAmount)}">
      <button class="button button-dark" type="submit" ${state.busy ? 'disabled' : ''}>Recharge</button>
    </form>
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

  return `
    <div class="atulyash-app-row"><h2>Notifications</h2><button class="atulyash-app-link" type="button" data-action="mark-all-read" ${state.busy ? 'disabled' : ''}>Mark all read</button></div>
    <div class="atulyash-list">${rows || '<p>No notifications yet.</p>'}</div>
  `;
}

// ---- Event wiring ----

function attachHandlers(body) {
  body.querySelectorAll('[data-action="reorder"]').forEach((btn) => {
    btn.addEventListener('click', () => handleReorder(btn.dataset.id));
  });
  body.querySelectorAll('[data-action="invoice"]').forEach((btn) => {
    btn.addEventListener('click', () => handleDownloadInvoice({ id: btn.dataset.id, delivery_id: btn.dataset.delivery }));
  });

  body.querySelector('[data-action="open-skip"]')?.addEventListener('click', (e) => openSkipView(e.target.dataset.sub));
  body.querySelector('[data-action="open-vacation"]')?.addEventListener('click', (e) => {
    const sub = (state.subscriptions || []).find((s) => String(s.id) === e.target.dataset.sub);
    openVacationView(sub || {});
  });
  body.querySelector('[data-action="open-cancel"]')?.addEventListener('click', openCancelView);
  body.querySelector('[data-action="back-to-subscription"]')?.addEventListener('click', () => setState({ subscriptionView: 'overview' }));

  body.querySelectorAll('[data-action="skip"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSkip(state.subscriptions[0].id, btn.dataset.delivery));
  });
  body.querySelectorAll('[data-action="unskip"]').forEach((btn) => {
    btn.addEventListener('click', () => handleUnskip(state.subscriptions[0].id, btn.dataset.delivery));
  });

  const vacationForm = body.querySelector('[data-form="vacation"]');
  vacationForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(vacationForm);
    setState({ vacationStart: fd.get('startDate'), vacationEnd: fd.get('endDate') });
    handleStartVacation(e.submitter.dataset.sub);
  });
  body.querySelectorAll('[data-action="end-vacation"]').forEach((btn) => {
    btn.addEventListener('click', () => handleEndVacation(btn.dataset.id, btn.dataset.sub));
  });

  const cancelForm = body.querySelector('[data-form="cancel-subscription"]');
  cancelForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const reason = new FormData(cancelForm).get('reason');
    handleCancelSubscription(e.submitter.dataset.sub, reason);
  });

  body.querySelectorAll('[data-action="recharge"]').forEach((btn) => {
    btn.addEventListener('click', () => handleRecharge(btn.dataset.amount));
  });
  const customRechargeForm = body.querySelector('[data-form="custom-recharge"]');
  customRechargeForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = new FormData(customRechargeForm).get('amount');
    if (amount) handleRecharge(amount);
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
}
