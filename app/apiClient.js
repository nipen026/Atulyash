import { API_BASE_URL, STORAGE_KEYS } from './config.js';

// The backend 301-redirects any path missing a trailing slash (verified against
// every endpoint used here). Redirects can drop the Authorization header on a
// cross-origin request, so always normalize to exactly one trailing slash
// before the querystring rather than relying on callers to get it right.
function normalizePath(path) {
  const [base, query] = path.split('?');
  const withSlash = base.endsWith('/') ? base : `${base}/`;
  return query ? `${withSlash}?${query}` : withSlash;
}

let refreshPromise = null;

async function refreshTokens() {
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) return false;

  refreshPromise = fetch(`${API_BASE_URL}${normalizePath('/token/refresh/')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      if (!data?.access) return false;
      localStorage.setItem(STORAGE_KEYS.token, data.access);
      if (data.refresh) localStorage.setItem(STORAGE_KEYS.refreshToken, data.refresh);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      // Keep the promise cached briefly so near-simultaneous 401s reuse it,
      // same dedup pattern as the Next.js app's lib/apiClient.ts.
      setTimeout(() => {
        refreshPromise = null;
      }, 2000);
    });

  return refreshPromise;
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.token);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.customerId);
  localStorage.removeItem(STORAGE_KEYS.cartId);
}

/**
 * @param {{url: string, method?: string, body?: any, headers?: Record<string,string>, _retried?: boolean}} opts
 */
export async function apiClient({ url, method = 'GET', body = null, headers = {}, _retried = false }) {
  const fullUrl = `${API_BASE_URL}${normalizePath(url)}`;
  const isFormData = body instanceof FormData;
  const token = localStorage.getItem(STORAGE_KEYS.token);

  const res = await fetch(fullUrl, {
    method,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: isFormData ? body : JSON.stringify(body) } : {}),
  });

  let data = null;
  if (res.status !== 204) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (res.ok) {
    return { status: res.status, data };
  }

  const isAuthEndpoint = url.includes('/otp/') || url.includes('/token/refresh/');
  if (res.status === 401 && !_retried && !isAuthEndpoint) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return apiClient({ url, method, body, headers, _retried: true });
    }
    clearSession();
  }

  const error = new Error(data?.detail || data?.message || `Request failed (${res.status})`);
  error.status = res.status;
  error.data = data;
  throw error;
}
