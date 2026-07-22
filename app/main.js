import { mountApp, openModal } from './ui.js';
import { mountAccount, openAccount } from './account.js';
import { isAuthenticated } from './auth.js';

function updateAccountEntryVisibility() {
  document.querySelectorAll('[data-open-account]').forEach((el) => {
    el.classList.toggle('is-hidden', !isAuthenticated());
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const appRoot = document.getElementById('appRoot');
  const accountRoot = document.getElementById('accountRoot');
  if (!appRoot || !accountRoot) return;

  mountApp(appRoot);
  mountAccount(accountRoot);
  updateAccountEntryVisibility();

  document.addEventListener('atulyash:auth-changed', updateAccountEntryVisibility);

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
