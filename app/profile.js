import { apiClient } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';

/**
 * Base auth-user record (name, email, profile picture). The user id is not the
 * same as the customer id — it's carried in the JWT as `user_id`.
 */
export async function fetchUserProfile(userId) {
  const res = await apiClient({ url: API_ROUTES.AUTH_USER.GET(userId) });
  return res.data;
}

/**
 * Patches name/email and optionally the profile picture. A picture forces
 * multipart/form-data (apiClient skips its JSON Content-Type for FormData);
 * without one we send JSON so unrelated fields aren't coerced to strings.
 */
export async function updateUserProfile(userId, { name, email, profilePicture } = {}) {
  let body;

  if (profilePicture) {
    body = new FormData();
    if (name !== undefined) body.append('name', name ?? '');
    if (email !== undefined) body.append('email', email ?? '');
    body.append('profile_picture', profilePicture);
  } else {
    body = {
      ...(name !== undefined ? { name } : {}),
      ...(email !== undefined ? { email } : {}),
    };
  }

  const res = await apiClient({
    url: API_ROUTES.AUTH_USER.UPDATE(userId),
    method: 'PATCH',
    body,
  });
  return res.data;
}

/** Customer record — service tier, wallet summary, status. */
export async function fetchCustomerProfile(customerId) {
  const res = await apiClient({ url: API_ROUTES.CUSTOMER.GET(customerId) });
  return res.data;
}

/**
 * Soft-deactivates the account (is_active=false): hides the profile and halts
 * recurring subscription charges. Reversible server-side, unlike a deletion
 * request — see `submitAccountDeletionRequest`.
 */
export async function deactivateCustomer(customerId) {
  const res = await apiClient({
    url: API_ROUTES.CUSTOMER.UPDATE(customerId),
    method: 'PATCH',
    body: { is_active: false },
  });
  return res.data;
}

/**
 * Files a formal account-deletion request, which starts the backend's
 * data-purge verification workflow. This is the privacy-compliance path and is
 * not reversible from the client.
 */
export async function submitAccountDeletionRequest(reason) {
  const res = await apiClient({
    url: API_ROUTES.AUTH_USER.ACCOUNT_DELETION_REQUEST,
    method: 'POST',
    body: { reason },
  });
  return res.data;
}
