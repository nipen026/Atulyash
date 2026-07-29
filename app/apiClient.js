import { API_BASE_URL, STORAGE_KEYS } from './config.js';
import { API_ROUTES } from './endpoints.js';

// The backend 301-redirects any path missing a trailing slash (verified against
// every endpoint used here). Redirects can drop the Authorization header on a
// cross-origin request, so always normalize to exactly one trailing slash
// before the querystring rather than relying on callers to get it right.
function normalizePath(path) {
  const [base, query] = path.split('?');
  const withSlash = base.endsWith('/') ? base : `${base}/`;
  return query ? `${withSlash}?${query}` : withSlash;
}

/**
 * Appends query params to a route, skipping null/undefined/'' so callers can
 * pass optional filters inline without building conditionals at every callsite.
 * Merges correctly with routes that already carry a querystring.
 * @param {string} path
 * @param {Record<string, string|number|boolean|null|undefined>} params
 */
export function withQuery(path, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    search.append(key, String(value));
  });
  const qs = search.toString();
  if (!qs) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${qs}`;
}

/**
 * Pulls a list out of a response body whose shape varies by endpoint.
 *
 * Some endpoints are DRF-paginated (`{count, results}`), some return a bare
 * array, and some wrap the list in an endpoint-specific key
 * (`{options: [...]}`). The old `data?.results || data || []` idiom silently
 * returned the *object* for that last case — `|| []` can't fire on a truthy
 * object — and callers then crashed on `.map`. Always returns an array.
 *
 * @param {any} data response body
 * @param {string[]} preferredKeys endpoint-specific keys to check before the generic ones
 */
export function toList(data, preferredKeys = []) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];

  for (const key of [...preferredKeys, 'results', 'data', 'items']) {
    if (Array.isArray(data[key])) return data[key];
  }

  // Unknown wrapper key: fall back to the first array-valued property rather
  // than dropping data we clearly received.
  return Object.values(data).find(Array.isArray) || [];
}

let refreshPromise = null;

async function refreshTokens() {
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  if (!refreshToken) return false;

  refreshPromise = fetch(`${API_BASE_URL}${normalizePath(API_ROUTES.AUTH.TOKEN_REFRESH)}`, {
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
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
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
