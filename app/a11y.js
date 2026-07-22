const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => el.offsetParent !== null);
}

/** Moves focus into the panel when a modal opens (first focusable element, or the panel itself). */
export function focusFirst(panelEl) {
  const [first] = getFocusable(panelEl);
  (first || panelEl).focus?.();
}

/**
 * Keeps Tab/Shift+Tab cycling within the panel while a modal is open, and
 * closes it on Escape. Returns a cleanup function to call when the modal closes.
 */
export function trapFocus(panelEl, onEscape) {
  function handleKeydown(e) {
    if (e.key === 'Escape') {
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = getFocusable(panelEl);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', handleKeydown);
  return () => document.removeEventListener('keydown', handleKeydown);
}
