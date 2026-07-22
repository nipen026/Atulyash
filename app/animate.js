const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Subtle fade+rise used when a modal step/tab swaps its content. */
export function fadeIn(el) {
  if (!el || REDUCE_MOTION.matches) return;
  el.animate(
    [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 200, easing: 'ease' }
  );
}
