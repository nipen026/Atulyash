import { GOOGLE_PLACES_API_KEY } from './config.js';
import { requestOtp, verifyOtp, isAuthenticated, getCustomerId, getCartId, logout } from './auth.js';
import {
  fetchSubscriptionPacks,
  fetchAddresses,
  createAddress,
  previewWeeklyPlan,
  addSubscriptionToCart,
  getCart,
  applyCoupon,
  removeCoupon,
  placeOrder,
  verifyOrderPayment,
  openRazorpayCheckout,
} from './storefront.js';
import { fadeIn } from './animate.js';
import { focusFirst, trapFocus } from './a11y.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

let root = null;
let state = {};
let releaseFocusTrap = null;
let lastFocusedBeforeOpen = null;

function initialState() {
  return {
    step: isAuthenticated() ? 'loading' : 'login',
    mobile: '',
    otp: '',
    error: null,
    busy: false,
    addresses: [],
    selectedAddressId: null,
    packs: [],
    selectedPackId: null,
    deliveryDay: DAYS[0],
    previewData: null,
    selectedStartDate: null,
    cart: null,
    couponCode: '',
    paymentMethod: 'razorpay',
    confirmation: null,
  };
}

function setState(patch) {
  state = { ...state, ...patch };
  render();
}

export function openModal() {
  if (!root) return;
  state = initialState();
  lastFocusedBeforeOpen = document.activeElement;
  root.classList.add('is-open');
  document.body.classList.add('atulyash-app-open');
  render();
  if (state.step === 'loading') bootAuthenticated();

  const panel = root.querySelector('.atulyash-app-panel');
  focusFirst(panel);
  releaseFocusTrap = trapFocus(panel, closeModal);
}

export function closeModal() {
  root.classList.remove('is-open');
  document.body.classList.remove('atulyash-app-open');
  releaseFocusTrap?.();
  releaseFocusTrap = null;
  lastFocusedBeforeOpen?.focus?.();
}

async function bootAuthenticated() {
  try {
    const addresses = await fetchAddresses(getCustomerId());
    if (addresses.length > 0) {
      setState({ step: 'browse', addresses, selectedAddressId: addresses[0].id });
      loadPacks();
    } else {
      setState({ step: 'address', addresses });
    }
  } catch (err) {
    setState({ step: 'login', error: describeError(err) });
  }
}

function describeError(err) {
  if (err?.data && typeof err.data === 'object') {
    const firstKey = Object.keys(err.data)[0];
    const firstVal = err.data[firstKey];
    if (Array.isArray(firstVal)) return `${firstKey}: ${firstVal[0]}`;
  }
  return err?.message || 'Something went wrong. Please try again.';
}

async function loadPacks() {
  try {
    const packs = await fetchSubscriptionPacks();
    setState({ packs, selectedPackId: packs[0]?.id ?? null });
  } catch (err) {
    setState({ error: describeError(err) });
  }
}

// ---- Step handlers ----

async function handleSendOtp(mobile) {
  setState({ busy: true, error: null });
  try {
    await requestOtp(mobile);
    setState({ busy: false, step: 'otp', mobile });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleVerifyOtp(mobile, otp) {
  setState({ busy: true, error: null });
  try {
    await verifyOtp(mobile, otp);
    const addresses = await fetchAddresses(getCustomerId());
    if (addresses.length > 0) {
      setState({ busy: false, step: 'browse', addresses, selectedAddressId: addresses[0].id });
      loadPacks();
    } else {
      setState({ busy: false, step: 'address', addresses });
    }
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

// latitude/longitude must be truncated to 9 chars — same constraint as
// AddressFormModal.tsx's formatCoordinate (backend column limit).
function formatCoordinate(value) {
  const str = String(value);
  return str.length > 9 ? str.substring(0, 9) : str;
}

async function handleSaveAddress(formValues) {
  setState({ busy: true, error: null });
  try {
    const address = await createAddress({
      is_active: true,
      description: formValues.description || '',
      full_address: formValues.fullAddress,
      house_name: formValues.houseName || '',
      floor: formValues.floor || '',
      landmark: formValues.landmark || '',
      tower_wing: '',
      city: formValues.city,
      state: formValues.state,
      country: 'IN',
      is_default: true,
      address_type: 'HOME',
      address_phone: formValues.phone || '',
      customer: Number(getCustomerId()),
      pincode: formValues.pincode,
      ...(formValues.latitude ? { latitude: formatCoordinate(formValues.latitude) } : {}),
      ...(formValues.longitude ? { longitude: formatCoordinate(formValues.longitude) } : {}),
    });
    setState({
      busy: false,
      step: 'browse',
      addresses: [address],
      selectedAddressId: address.id,
    });
    loadPacks();
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handlePreview() {
  setState({ busy: true, error: null });
  try {
    const data = await previewWeeklyPlan({
      addressId: state.selectedAddressId,
      subscriptionPackId: state.selectedPackId,
      deliveryDay: state.deliveryDay.toLowerCase(),
    });
    setState({
      busy: false,
      step: 'preview',
      previewData: data,
      selectedStartDate: data?.delivery_dates?.[0] || null,
    });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleAddToCart() {
  setState({ busy: true, error: null });
  try {
    await addSubscriptionToCart({
      subscriptionPackId: state.selectedPackId,
      startDate: state.selectedStartDate,
      addressId: state.selectedAddressId,
      deliveryDay: state.deliveryDay.toLowerCase(),
    });
    const cartId = getCartId();
    const cart = cartId ? await getCart(cartId) : null;
    setState({ busy: false, step: 'cart', cart });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleApplyCoupon(code) {
  setState({ busy: true, error: null });
  try {
    await applyCoupon(code);
    const cart = await getCart(getCartId());
    setState({ busy: false, cart });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handleRemoveCoupon() {
  setState({ busy: true, error: null });
  try {
    await removeCoupon();
    const cart = await getCart(getCartId());
    setState({ busy: false, cart });
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

async function handlePlaceOrder() {
  setState({ busy: true, error: null });
  try {
    const data = await placeOrder({
      addressId: state.selectedAddressId,
      paymentMethod: state.paymentMethod,
    });

    if (state.paymentMethod === 'razorpay' && data?.razorpay_order_id) {
      setState({ busy: false });
      openRazorpayCheckout(
        {
          orderId: data.razorpay_order_id,
          amount: data.amount,
          currency: data.currency,
          description: data.order_id ? `Order ${data.order_id}` : '',
        },
        async (payload) => {
          setState({ busy: true });
          try {
            const verified = await verifyOrderPayment({
              razorpayOrderId: payload.razorpay_order_id,
              razorpayPaymentId: payload.razorpay_payment_id,
              razorpaySignature: payload.razorpay_signature,
            });
            setState({ busy: false, step: 'confirmation', confirmation: { status: 'SUCCESS', data: verified } });
          } catch (err) {
            setState({ busy: false, step: 'confirmation', confirmation: { status: 'FAILED', message: describeError(err) } });
          }
        },
        (err) => {
          setState({ error: err.message || 'Payment failed or was cancelled.' });
        }
      );
    } else {
      setState({
        busy: false,
        step: 'confirmation',
        confirmation: {
          status: data?.payment_status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          data,
          message: data?.message,
        },
      });
    }
  } catch (err) {
    setState({ busy: false, error: describeError(err) });
  }
}

function handleLogout() {
  logout();
  closeModal();
}

// ---- Google Places autocomplete (lazy-loaded) ----

let placesScriptPromise = null;

function loadGooglePlaces() {
  if (window.google?.maps?.places) return Promise.resolve();
  if (placesScriptPromise) return placesScriptPromise;

  placesScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places`;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Google Places'));
    document.body.appendChild(script);
  });

  return placesScriptPromise;
}

function wireAddressAutocomplete(inputEl, onPlaceSelected) {
  loadGooglePlaces()
    .then(() => {
      const autocomplete = new window.google.maps.places.Autocomplete(inputEl, {
        componentRestrictions: { country: 'in' },
        fields: ['address_components', 'formatted_address', 'geometry'],
      });
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        const components = place.address_components || [];
        const get = (type) => components.find((c) => c.types.includes(type))?.long_name || '';
        onPlaceSelected({
          formattedAddress: place.formatted_address || inputEl.value,
          city: get('locality') || get('administrative_area_level_2'),
          state: get('administrative_area_level_1'),
          pincode: get('postal_code'),
          latitude: place.geometry?.location?.lat(),
          longitude: place.geometry?.location?.lng(),
        });
      });
    })
    .catch(() => {
      // Autocomplete is a progressive enhancement — plain text entry still works.
    });
}

// ---- Rendering ----

function render() {
  if (!root) return;
  const body = root.querySelector('.atulyash-app-body');
  body.innerHTML = renderStep();
  attachHandlers(body);
  fadeIn(body);

  const showLogout = !['login', 'otp', 'loading'].includes(state.step);
  root.querySelector('[data-close-logout]')?.classList.toggle('is-hidden', !showLogout);
}

function renderStep() {
  switch (state.step) {
    case 'loading':
      return `<p class="atulyash-app-loading">Loading your account…</p>`;
    case 'login':
      return renderLogin();
    case 'otp':
      return renderOtp();
    case 'address':
      return renderAddress();
    case 'browse':
      return renderBrowse();
    case 'preview':
      return renderPreview();
    case 'cart':
      return renderCart();
    case 'confirmation':
      return renderConfirmation();
    default:
      return '';
  }
}

function renderErrorBanner() {
  return state.error ? `<p class="atulyash-app-error" role="alert">${escapeHtml(state.error)}</p>` : '';
}

function renderLogin() {
  return `
    <h2>Start your weekly plan</h2>
    <p class="atulyash-app-sub">Enter your mobile number — we'll send you a one-time code.</p>
    ${renderErrorBanner()}
    <form data-form="login">
      <label for="atulyashMobile">Mobile number</label>
      <input id="atulyashMobile" name="mobile" type="tel" inputmode="numeric" maxlength="10" required placeholder="98765 43210" value="${escapeHtml(state.mobile)}">
      <button class="button button-primary button-block" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Sending…' : 'Send OTP'}</button>
    </form>
  `;
}

function renderOtp() {
  return `
    <h2>Verify your number</h2>
    <p class="atulyash-app-sub">Enter the code sent to +91 ${escapeHtml(state.mobile)}.</p>
    ${renderErrorBanner()}
    <form data-form="otp">
      <label for="atulyashOtp">One-time code</label>
      <input id="atulyashOtp" name="otp" type="text" inputmode="numeric" maxlength="4" required placeholder="4-digit code">
      <button class="button button-primary button-block" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Verifying…' : 'Verify & continue'}</button>
      <button class="atulyash-app-link" type="button" data-action="back-to-login">Change number</button>
    </form>
  `;
}

function renderAddress() {
  return `
    <h2>Delivery address</h2>
    <p class="atulyash-app-sub">Where should we deliver your weekly atta?</p>
    ${renderErrorBanner()}
    <form data-form="address">
      <label for="atulyashLine1">Address</label>
      <input id="atulyashLine1" name="fullAddress" type="text" required placeholder="Start typing your address">
      <label for="atulyashLine2">Flat / house name, floor, landmark</label>
      <input id="atulyashLine2" name="landmark" type="text">
      <div class="atulyash-app-row">
        <div>
          <label for="atulyashCity">City</label>
          <input id="atulyashCity" name="city" type="text" required>
        </div>
        <div>
          <label for="atulyashState">State</label>
          <input id="atulyashState" name="state" type="text" required>
        </div>
      </div>
      <div class="atulyash-app-row">
        <div>
          <label for="atulyashPincode">Pincode</label>
          <input id="atulyashPincode" name="pincode" type="text" inputmode="numeric" maxlength="6" required>
        </div>
        <div>
          <label for="atulyashPhone">Contact number</label>
          <input id="atulyashPhone" name="phone" type="tel" maxlength="10" value="${escapeHtml(state.mobile)}">
        </div>
      </div>
      <button class="button button-primary button-block" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Saving…' : 'Save address & continue'}</button>
    </form>
  `;
}

function renderBrowse() {
  if (state.packs.length === 0) {
    return `<p class="atulyash-app-loading">Loading plans…</p>`;
  }
  const cards = state.packs.map((pack) => `
    <label class="atulyash-plan-card ${state.selectedPackId === pack.id ? 'is-selected' : ''}">
      <input type="radio" name="pack" value="${pack.id}" ${state.selectedPackId === pack.id ? 'checked' : ''}>
      <span class="atulyash-plan-name">${escapeHtml(pack.name)}</span>
      <span class="atulyash-plan-detail">${escapeHtml(pack.weekly_quantity)} kg/week &middot; &#8377;${escapeHtml(pack.weekly_price)}/week</span>
    </label>
  `).join('');

  const dayOptions = DAYS.map((day) => `<option value="${day}" ${state.deliveryDay === day ? 'selected' : ''}>${day}</option>`).join('');

  return `
    <h2>Choose your weekly plan</h2>
    ${renderErrorBanner()}
    <div class="atulyash-plan-grid" data-plan-grid>${cards}</div>
    <label for="atulyashDeliveryDay">Preferred delivery day</label>
    <select id="atulyashDeliveryDay" data-delivery-day>${dayOptions}</select>
    <button class="button button-primary button-block" data-action="preview" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Checking availability…' : 'See delivery dates'}</button>
  `;
}

function renderPreview() {
  const dates = state.previewData?.delivery_dates || [];
  const options = dates.map((d) => `
    <label class="atulyash-date-chip ${state.selectedStartDate === d ? 'is-selected' : ''}">
      <input type="radio" name="startDate" value="${d}" ${state.selectedStartDate === d ? 'checked' : ''}>
      ${formatDate(d)}
    </label>
  `).join('');

  return `
    <h2>Pick your first delivery</h2>
    ${renderErrorBanner()}
    <div class="atulyash-date-grid" data-date-grid>${options || '<p>No delivery dates available for this address.</p>'}</div>
    <button class="button button-primary button-block" data-action="add-to-cart" ${state.busy || !state.selectedStartDate ? 'disabled' : ''}>${state.busy ? 'Adding…' : 'Add to cart'}</button>
    <button class="atulyash-app-link" type="button" data-action="back-to-browse">Change plan</button>
  `;
}

function renderCart() {
  const cart = state.cart || {};
  const items = cart.items || [];
  const itemRows = items.map((item) => `
    <div class="atulyash-cart-row">
      <span>${escapeHtml(item.product_name || item.subscription_pack_name || item.product_pack_name || 'Item')} &times; ${escapeHtml(item.quantity ?? 1)}</span>
      <span>&#8377;${escapeHtml(item.price ?? item.weekly_price ?? '0')}</span>
    </div>
  `).join('');

  return `
    <h2>Your cart</h2>
    ${renderErrorBanner()}
    <div class="atulyash-cart-items">${itemRows || '<p>Your cart is empty.</p>'}</div>
    <form data-form="coupon" class="atulyash-app-row">
      <input name="couponCode" type="text" placeholder="Coupon code" value="${escapeHtml(state.couponCode)}">
      <button class="button button-dark" type="submit" ${state.busy ? 'disabled' : ''}>Apply</button>
      ${cart.applied_coupon ? `<button class="atulyash-app-link" type="button" data-action="remove-coupon">Remove</button>` : ''}
    </form>
    <div class="atulyash-cart-totals">
      <div><span>Items total</span><span>&#8377;${escapeHtml(cart.items_total ?? 0)}</span></div>
      <div><span>Delivery fee</span><span>&#8377;${escapeHtml(cart.delivery_fee ?? 0)}</span></div>
      ${cart.applied_coupon_discount ? `<div><span>Coupon discount</span><span>-&#8377;${escapeHtml(cart.applied_coupon_discount)}</span></div>` : ''}
      <div class="atulyash-cart-total"><span>Total</span><span>&#8377;${escapeHtml(cart.cart_total ?? 0)}</span></div>
    </div>
    <label>Payment method</label>
    <div class="atulyash-app-row" data-payment-method>
      <label><input type="radio" name="paymentMethod" value="razorpay" ${state.paymentMethod === 'razorpay' ? 'checked' : ''}> Card / UPI (Razorpay)</label>
      <label><input type="radio" name="paymentMethod" value="wallet" ${state.paymentMethod === 'wallet' ? 'checked' : ''}> Wallet</label>
    </div>
    <button class="button button-primary button-block" data-action="place-order" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Placing order…' : 'Place order'}</button>
  `;
}

function renderConfirmation() {
  const ok = state.confirmation?.status === 'SUCCESS';
  return `
    <h2>${ok ? 'Order confirmed' : 'Order not completed'}</h2>
    <p class="atulyash-app-sub">${escapeHtml(ok ? 'Thank you — your weekly plan is on its way.' : (state.confirmation?.message || 'Something went wrong with the payment.'))}</p>
    <button class="button button-primary button-block" data-action="close">Close</button>
  `;
}

// ---- Event wiring ----

function attachHandlers(body) {
  const loginForm = body.querySelector('[data-form="login"]');
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const mobile = new FormData(loginForm).get('mobile')?.toString().trim();
    if (mobile) handleSendOtp(mobile);
  });

  const otpForm = body.querySelector('[data-form="otp"]');
  otpForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const otp = new FormData(otpForm).get('otp')?.toString().trim();
    if (otp) handleVerifyOtp(state.mobile, otp);
  });
  body.querySelector('[data-action="back-to-login"]')?.addEventListener('click', () => setState({ step: 'login', error: null }));

  const addressForm = body.querySelector('[data-form="address"]');
  if (addressForm) {
    const line1Input = addressForm.querySelector('#atulyashLine1');
    let placeData = {};
    wireAddressAutocomplete(line1Input, (data) => {
      placeData = data;
      addressForm.querySelector('#atulyashCity').value = data.city || '';
      addressForm.querySelector('#atulyashState').value = data.state || '';
      addressForm.querySelector('#atulyashPincode').value = data.pincode || '';
    });
    addressForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(addressForm);
      handleSaveAddress({
        fullAddress: fd.get('fullAddress')?.toString().trim(),
        landmark: fd.get('landmark')?.toString().trim(),
        city: fd.get('city')?.toString().trim(),
        state: fd.get('state')?.toString().trim(),
        pincode: fd.get('pincode')?.toString().trim(),
        phone: fd.get('phone')?.toString().trim(),
        latitude: placeData.latitude,
        longitude: placeData.longitude,
      });
    });
  }

  body.querySelector('[data-plan-grid]')?.addEventListener('change', (e) => {
    const value = e.target?.value;
    if (value) setState({ selectedPackId: Number(value) });
  });
  body.querySelector('[data-delivery-day]')?.addEventListener('change', (e) => {
    setState({ deliveryDay: e.target.value });
  });
  body.querySelector('[data-action="preview"]')?.addEventListener('click', handlePreview);

  body.querySelector('[data-date-grid]')?.addEventListener('change', (e) => {
    if (e.target?.value) setState({ selectedStartDate: e.target.value });
  });
  body.querySelector('[data-action="add-to-cart"]')?.addEventListener('click', handleAddToCart);
  body.querySelector('[data-action="back-to-browse"]')?.addEventListener('click', () => setState({ step: 'browse', error: null }));

  const couponForm = body.querySelector('[data-form="coupon"]');
  couponForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = new FormData(couponForm).get('couponCode')?.toString().trim();
    if (code) handleApplyCoupon(code);
  });
  body.querySelector('[data-action="remove-coupon"]')?.addEventListener('click', handleRemoveCoupon);
  body.querySelector('[data-payment-method]')?.addEventListener('change', (e) => {
    if (e.target?.name === 'paymentMethod') setState({ paymentMethod: e.target.value });
  });
  body.querySelector('[data-action="place-order"]')?.addEventListener('click', handlePlaceOrder);

  body.querySelector('[data-action="close"]')?.addEventListener('click', closeModal);
}

export function mountApp(rootEl) {
  root = rootEl;
  root.innerHTML = `
    <div class="atulyash-app-backdrop" data-close></div>
    <div class="atulyash-app-panel" role="dialog" aria-modal="true" aria-label="Start your Atulyash weekly plan">
      <button class="atulyash-app-close" type="button" aria-label="Close" data-close>&times;</button>
      <button class="atulyash-app-logout" type="button" data-close-logout>Log out</button>
      <div class="atulyash-app-body"></div>
    </div>
  `;
  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  root.querySelector('[data-close-logout]')?.addEventListener('click', handleLogout);
}
