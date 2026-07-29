import { mountApp, openModal } from './ui.js';
import { mountAccount, openAccount } from './account.js';
import { isAuthenticated } from './auth.js';
import { hydrateMarketingContent } from './content.js';
import { fetchUnreadCount } from './notifications.js';

function updateAccountEntryVisibility() {
  document.querySelectorAll('[data-open-account]').forEach((el) => {
    el.classList.toggle('is-hidden', !isAuthenticated());
  });
}

/** Unread badge on the "My account" entry point. Silent on failure. */
async function updateUnreadBadge() {
  const badges = document.querySelectorAll('[data-unread-badge]');
  if (badges.length === 0 || !isAuthenticated()) {
    badges.forEach((b) => { b.hidden = true; });
    return;
  }

  try {
    const count = await fetchUnreadCount();
    badges.forEach((badge) => {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = count === 0;
    });
  } catch {
    badges.forEach((b) => { b.hidden = true; });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // CMS-backed marketing sections are independent of the app modals, so hydrate
  // them even if the modal roots are missing from the page.
  hydrateMarketingContent();

  const appRoot = document.getElementById('appRoot');
  const accountRoot = document.getElementById('accountRoot');
  if (!appRoot || !accountRoot) return;

  mountApp(appRoot);
  mountAccount(accountRoot);
  updateAccountEntryVisibility();
  updateUnreadBadge();

  document.addEventListener('atulyash:auth-changed', () => {
    updateAccountEntryVisibility();
    updateUnreadBadge();
  });

  document.querySelectorAll('[data-open-app]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  document.querySelectorAll('[data-open-account]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      openAccount();
    });
  });
});
