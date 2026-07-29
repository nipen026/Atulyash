const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const siteHeader = document.getElementById('siteHeader');
const menuToggle = document.getElementById('menuToggle');
const primaryNav = document.getElementById('primaryNav');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

const updateHeaderDepth = () => {
  siteHeader?.classList.toggle('is-scrolled', window.scrollY > 12);
};

updateHeaderDepth();
window.addEventListener('scroll', updateHeaderDepth, { passive: true });

const closeMenu = ({ returnFocus = false } = {}) => {
  if (!menuToggle || !primaryNav) return;
  primaryNav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.querySelector('.sr-only').textContent = 'Open navigation';
  document.body.classList.remove('menu-open');
  if (returnFocus) menuToggle.focus();
};

if (menuToggle && primaryNav) {
  menuToggle.addEventListener('click', () => {
    const willOpen = menuToggle.getAttribute('aria-expanded') !== 'true';
    primaryNav.classList.toggle('is-open', willOpen);
    menuToggle.setAttribute('aria-expanded', String(willOpen));
    menuToggle.querySelector('.sr-only').textContent = willOpen ? 'Close navigation' : 'Open navigation';
    document.body.classList.toggle('menu-open', willOpen);
    if (willOpen) primaryNav.querySelector('a')?.focus();
  });

  primaryNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => closeMenu({ returnFocus: window.innerWidth <= 1040 }));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && primaryNav.classList.contains('is-open')) {
      closeMenu({ returnFocus: true });
    }
  });

  document.addEventListener('click', (event) => {
    if (
      primaryNav.classList.contains('is-open') &&
      !primaryNav.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      closeMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1040) closeMenu();
  });
}

const rotisPerDay = document.getElementById('rotisPerDay');
const rotisOutput = document.getElementById('rotisOutput');
const weeklyOutput = document.getElementById('weeklyOutput');
const calculatorMonthlyNote = document.getElementById('calculatorMonthlyNote');
const calculatorRecommended = document.getElementById('calculatorRecommended');
const calculatorRecommendedName = document.getElementById('calculatorRecommendedName');
const calculatorInfoTrigger = document.getElementById('calculatorInfoTrigger');
const calculatorInfoModal = document.getElementById('calculatorInfoModal');
const calculatorInfoExplanation = document.getElementById('calculatorInfoExplanation');
const calculatorInfoWeekly = document.getElementById('calculatorInfoWeekly');
const calculatorInfoMonthly = document.getElementById('calculatorInfoMonthly');
const deliveryDay = document.getElementById('deliveryDay');
const calculatorCta = document.getElementById('calculatorCta');

let quantityHasRendered = false;
let quantityAnimation;
let calculatorFetchTimer;
let latestCalculatorData = null;

const updateSliderProgress = () => {
  if (!rotisPerDay || !rotisOutput) return;
  const value = Number(rotisPerDay.value);
  const minimum = Number(rotisPerDay.min);
  const maximum = Number(rotisPerDay.max);
  const progress = ((value - minimum) / (maximum - minimum)) * 100;
  rotisOutput.textContent = value;
  rotisPerDay.style.setProperty('--range-progress', `${progress}%`);
};

const renderCalculatorResult = (data) => {
  latestCalculatorData = data;
  const weeklyKg = data?.estimates?.weekly_kg ?? 0;
  const monthlyKg = data?.estimates?.monthly_kg ?? 0;
  const bestPlan = data?.recommended_plans?.find((plan) => plan.is_recommended);

  if (weeklyOutput) {
    weeklyOutput.textContent = `${weeklyKg} kg`;
    if (quantityHasRendered && !reducedMotion.matches && typeof weeklyOutput.animate === 'function') {
      quantityAnimation?.cancel();
      quantityAnimation = weeklyOutput.animate([
        { opacity: 0.55, transform: 'translateY(7px) scale(0.96)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], {
        duration: 220,
        easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)'
      });
    }
    quantityHasRendered = true;
  }

  if (calculatorMonthlyNote) {
    calculatorMonthlyNote.textContent = `Approximate guide, ~${monthlyKg} kg per month`;
  }

  if (calculatorRecommended && calculatorRecommendedName) {
    if (bestPlan) {
      calculatorRecommendedName.textContent = bestPlan.pack_name;
      calculatorRecommended.hidden = false;
    } else {
      calculatorRecommended.hidden = true;
    }
  }

  if (calculatorInfoExplanation && data?.explanation) {
    calculatorInfoExplanation.textContent = data.explanation;
  }
  if (calculatorInfoWeekly) calculatorInfoWeekly.textContent = `${weeklyKg} kg`;
  if (calculatorInfoMonthly) {
    calculatorInfoMonthly.textContent = bestPlan ? `${bestPlan.pack_weight_kg} kg/month` : `${monthlyKg} kg/month`;
  }

  if (calculatorCta) {
    const day = deliveryDay?.value || 'Tuesday';
    const rotis = rotisPerDay?.value || '';
    const subject = 'My Atulyash weekly requirement';
    const body = [
      'Hello Atulyash team,',
      '',
      `My household eats approximately ${rotis} rotis per day.`,
      `Suggested weekly quantity: ${weeklyKg} kg (~${monthlyKg} kg per month).`,
      `Preferred delivery day: ${day}.`,
      '',
      'Please share availability for my first Atulyash experience.'
    ].join('\n');
    calculatorCta.href = `mailto:atulyashfoods@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
};

// This file is a classic script, so it can't import app/apiClient.js. Instead of
// hardcoding a second copy of the API host, it asks app/content.js — which is a
// module and owns the shared client — to make the call, and renders the reply.
const fetchCalculatorEstimate = () => {
  if (!rotisPerDay) return;
  document.dispatchEvent(new CustomEvent('atulyash:calculator-request', {
    detail: { rotisPerDay: Number(rotisPerDay.value) }
  }));
};

document.addEventListener('atulyash:calculator-result', (event) => {
  if (event.detail?.data) renderCalculatorResult(event.detail.data);
});

document.addEventListener('atulyash:calculator-error', (event) => {
  console.error('Atta calculator error:', event.detail?.error);
  if (calculatorMonthlyNote) {
    calculatorMonthlyNote.textContent = 'Could not fetch an estimate right now — please try again.';
  }
});

const scheduleCalculatorEstimate = () => {
  updateSliderProgress();
  clearTimeout(calculatorFetchTimer);
  calculatorFetchTimer = setTimeout(fetchCalculatorEstimate, 400);
};

if (rotisPerDay) {
  rotisPerDay.addEventListener('input', scheduleCalculatorEstimate);
  deliveryDay?.addEventListener('change', () => {
    if (latestCalculatorData) renderCalculatorResult(latestCalculatorData);
  });
  updateSliderProgress();
  // Deferred to DOMContentLoaded: app/content.js is a module, so it evaluates
  // after this file. Requesting immediately would fire before it's listening.
  document.addEventListener('DOMContentLoaded', fetchCalculatorEstimate);
}

if (calculatorInfoTrigger && calculatorInfoModal) {
  const openCalculatorInfo = () => {
    calculatorInfoModal.hidden = false;
    calculatorInfoModal.querySelector('[data-calc-info-close]')?.focus();
  };
  const closeCalculatorInfo = () => {
    calculatorInfoModal.hidden = true;
    calculatorInfoTrigger.focus();
  };

  calculatorInfoTrigger.addEventListener('click', openCalculatorInfo);
  calculatorInfoModal.querySelectorAll('[data-calc-info-close]').forEach((el) => {
    el.addEventListener('click', closeCalculatorInfo);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !calculatorInfoModal.hidden) closeCalculatorInfo();
  });
}

const revealItems = document.querySelectorAll('.reveal');
const veerInvestigation = document.getElementById('veerInvestigation');
let veerInvestigationObserver;
let veerMotionPlayed = false;
let revealObserver;
let entranceObserver;

const configureVeerInvestigation = (motionPreference = reducedMotion) => {
  if (!veerInvestigation) return;

  veerInvestigationObserver?.disconnect();
  veerInvestigation.classList.remove('is-motion-ready', 'is-investigating');

  if (motionPreference.matches || veerMotionPlayed) return;

  veerInvestigation.classList.add('is-motion-ready');

  const beginInvestigation = () => {
    veerMotionPlayed = true;
    veerInvestigation.classList.add('is-investigating');
    veerInvestigationObserver?.disconnect();
  };

  if (!('IntersectionObserver' in window)) {
    beginInvestigation();
    return;
  }

  veerInvestigationObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) beginInvestigation();
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.32 });

  veerInvestigationObserver.observe(veerInvestigation);
};

const configureRevealItems = (motionPreference = reducedMotion) => {
  revealObserver?.disconnect();

  if (motionPreference.matches || !('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  revealItems.forEach((item) => {
    if (!item.classList.contains('is-visible')) revealObserver.observe(item);
  });
};

const staggerGroups = [
  { selector: '.news-grid .reveal', columns: 3, delay: 80 },
  { selector: '.question-grid .reveal', columns: 3, delay: 80 },
  { selector: '.compromise-grid .reveal', columns: 2, delay: 90 }
];

staggerGroups.forEach(({ selector, columns, delay }) => {
  document.querySelectorAll(selector).forEach((item, index) => {
    item.style.setProperty('--reveal-delay', `${(index % columns) * delay}ms`);
  });
});

const motionHeadings = document.querySelectorAll([
  '.signature-orbit-heading > h2',
  '.weekly-copy > h2',
  '.awareness-statement > h2',
  '.questions-heading > h2',
  '.compromises-header > h2',
  '.film-copy > h2',
  '.faq-heading > h2',
  '.start-copy > h2'
].join(','));

motionHeadings.forEach((heading) => heading.classList.add('motion-heading'));

const motionSequences = document.querySelectorAll('[data-motion-sequence]');
motionSequences.forEach((sequence) => {
  [...sequence.children].forEach((item, index) => {
    item.style.setProperty('--sequence-index', index);
    item.style.setProperty('--sequence-delay', `${index * 70}ms`);
  });
});

const motionScenes = document.querySelectorAll('[data-motion-scene]');

const showEntranceItem = (item) => {
  if (item.classList.contains('motion-heading')) item.classList.add('is-heading-visible');
  if (item.matches('[data-motion-sequence], [data-motion-scene]')) item.classList.add('is-inview');
};

const configureEntranceItems = (motionPreference = reducedMotion) => {
  entranceObserver?.disconnect();
  const items = [...motionHeadings, ...motionSequences, ...motionScenes];

  if (motionPreference.matches || !('IntersectionObserver' in window)) {
    items.forEach(showEntranceItem);
    return;
  }

  entranceObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      showEntranceItem(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });

  items.forEach((item) => {
    const alreadyShown = item.classList.contains('is-heading-visible') || item.classList.contains('is-inview');
    if (!alreadyShown) entranceObserver.observe(item);
  });
};

const heroDepthScene = document.querySelector('[data-hero-depth]');
let heroDepthFrame = 0;
let heroPointerX = 0;
let heroPointerY = 0;
let heroDepthEnabled = false;

const resetHeroDepth = () => {
  if (!heroDepthScene) return;
  if (heroDepthFrame) cancelAnimationFrame(heroDepthFrame);
  heroDepthFrame = 0;
  heroDepthScene.classList.remove('is-depth-active');
  heroDepthScene.style.setProperty('--hero-rotate-x', '0deg');
  heroDepthScene.style.setProperty('--hero-rotate-y', '0deg');
  heroDepthScene.style.setProperty('--hero-shift-x', '0px');
  heroDepthScene.style.setProperty('--hero-shift-y', '0px');
  heroDepthScene.style.setProperty('--hero-pointer-x', '50%');
  heroDepthScene.style.setProperty('--hero-pointer-y', '50%');
};

const renderHeroDepth = () => {
  heroDepthFrame = 0;
  if (!heroDepthScene || !heroDepthEnabled) return;
  const bounds = heroDepthScene.getBoundingClientRect();
  const normalizedX = Math.max(-1, Math.min(1, ((heroPointerX - bounds.left) / bounds.width - 0.5) * 2));
  const normalizedY = Math.max(-1, Math.min(1, ((heroPointerY - bounds.top) / bounds.height - 0.5) * 2));

  heroDepthScene.classList.add('is-depth-active');
  heroDepthScene.style.setProperty('--hero-rotate-x', `${(-normalizedY * 3.5).toFixed(2)}deg`);
  heroDepthScene.style.setProperty('--hero-rotate-y', `${(normalizedX * 4.5).toFixed(2)}deg`);
  heroDepthScene.style.setProperty('--hero-shift-x', `${(normalizedX * 10).toFixed(1)}px`);
  heroDepthScene.style.setProperty('--hero-shift-y', `${(normalizedY * 7).toFixed(1)}px`);
  heroDepthScene.style.setProperty('--hero-pointer-x', `${((normalizedX + 1) * 50).toFixed(1)}%`);
  heroDepthScene.style.setProperty('--hero-pointer-y', `${((normalizedY + 1) * 50).toFixed(1)}%`);
};

const onHeroPointerMove = (event) => {
  heroPointerX = event.clientX;
  heroPointerY = event.clientY;
  if (!heroDepthFrame) heroDepthFrame = requestAnimationFrame(renderHeroDepth);
};

const onDocumentPointerMove = (event) => {
  if (heroDepthScene?.classList.contains('is-depth-active') && !heroDepthScene.contains(event.target)) {
    resetHeroDepth();
  }
};

const syncHeroDepth = () => {
  if (!heroDepthScene) return;
  const shouldEnable = finePointer.matches && !reducedMotion.matches && window.innerWidth > 900;
  if (shouldEnable === heroDepthEnabled) return;
  heroDepthEnabled = shouldEnable;

  if (heroDepthEnabled) {
    heroDepthScene.addEventListener('pointermove', onHeroPointerMove, { passive: true });
    heroDepthScene.addEventListener('pointerleave', resetHeroDepth);
    document.addEventListener('pointermove', onDocumentPointerMove, { passive: true });
  } else {
    heroDepthScene.removeEventListener('pointermove', onHeroPointerMove);
    heroDepthScene.removeEventListener('pointerleave', resetHeroDepth);
    document.removeEventListener('pointermove', onDocumentPointerMove);
    resetHeroDepth();
  }
};

const atulyashCursor = document.getElementById('atulyashCursor');
const atulyashCursorLabel = atulyashCursor?.querySelector('.atulyash-cursor-label');
let cursorFrame = 0;
let cursorX = -100;
let cursorY = -100;
let cursorEnabled = false;
let cursorTarget;

const renderAtulyashCursor = () => {
  cursorFrame = 0;
  if (!atulyashCursor || !cursorEnabled) return;
  atulyashCursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
};

const hideAtulyashCursor = () => {
  atulyashCursor?.classList.remove('is-visible', 'is-pressed');
};

const updateCursorContext = (target) => {
  if (!atulyashCursor || !(target instanceof Element)) return;

  const hiddenZone = target.closest('input, select, textarea, video, iframe, [contenteditable="true"]');
  const interactive = target.closest('a, button, summary, [role="button"]');
  const branded = interactive ? null : target.closest('[data-cursor-label]');

  atulyashCursor.classList.toggle('is-hidden-zone', Boolean(hiddenZone));
  atulyashCursor.classList.toggle('is-interactive', Boolean(interactive));
  atulyashCursor.classList.toggle('is-branded', Boolean(branded));
  if (atulyashCursorLabel) atulyashCursorLabel.textContent = branded?.dataset.cursorLabel || '';
};

const onCursorPointerMove = (event) => {
  cursorX = event.clientX;
  cursorY = event.clientY;
  atulyashCursor?.classList.add('is-visible');

  if (event.target !== cursorTarget) {
    cursorTarget = event.target;
    updateCursorContext(cursorTarget);
  }

  if (!cursorFrame) cursorFrame = requestAnimationFrame(renderAtulyashCursor);
};

const onCursorPointerDown = () => atulyashCursor?.classList.add('is-pressed');
const onCursorPointerUp = () => atulyashCursor?.classList.remove('is-pressed');

const updateCursorAvailability = () => {
  if (!atulyashCursor) return;
  const shouldEnable = finePointer.matches && !reducedMotion.matches && window.innerWidth > 900;
  if (shouldEnable === cursorEnabled) return;
  cursorEnabled = shouldEnable;

  if (cursorEnabled) {
    document.documentElement.classList.add('cursor-ready');
    document.addEventListener('pointermove', onCursorPointerMove, { passive: true });
    document.addEventListener('pointerdown', onCursorPointerDown, { passive: true });
    document.addEventListener('pointerup', onCursorPointerUp, { passive: true });
  } else {
    document.documentElement.classList.remove('cursor-ready');
    document.removeEventListener('pointermove', onCursorPointerMove);
    document.removeEventListener('pointerdown', onCursorPointerDown);
    document.removeEventListener('pointerup', onCursorPointerUp);
    hideAtulyashCursor();
  }
};

const orbitShowcase = document.getElementById('orbitShowcase');
const orbitToggle = document.getElementById('orbitToggle');

if (orbitShowcase && orbitToggle) {
  const orbitLabel = orbitToggle.querySelector('.orbit-toggle-label');
  const orbitIcon = orbitToggle.querySelector('.orbit-toggle-icon');

  orbitToggle.addEventListener('click', () => {
    const paused = orbitShowcase.classList.toggle('is-paused');
    orbitToggle.setAttribute('aria-pressed', String(paused));
    orbitLabel.textContent = paused ? 'Play orbit' : 'Pause orbit';
    orbitIcon.textContent = paused ? '▶' : 'Ⅱ';
  });

  const updateOrbitPreference = (event) => {
    orbitToggle.hidden = event.matches;
  };

  updateOrbitPreference(reducedMotion);
  reducedMotion.addEventListener?.('change', updateOrbitPreference);
}

const processVideo = document.querySelector('.film-frame video');
document.addEventListener('visibilitychange', () => {
  if (document.hidden && processVideo && !processVideo.paused) processVideo.pause();
  if (orbitShowcase) orbitShowcase.classList.toggle('is-page-hidden', document.hidden);
  if (document.hidden) resetHeroDepth();
});

const initializeMotionSystems = () => {
  document.documentElement.classList.add('motion-ready');
  configureVeerInvestigation();
  configureRevealItems();
  configureEntranceItems();
  syncHeroDepth();
};

const updateMotionPreference = (event) => {
  configureVeerInvestigation(event);
  configureRevealItems(event);
  configureEntranceItems(event);
  syncHeroDepth();
};

try {
  initializeMotionSystems();
} catch (error) {
  document.documentElement.classList.remove('motion-ready');
  revealItems.forEach((item) => item.classList.add('is-visible'));
  [...motionHeadings, ...motionSequences, ...motionScenes].forEach(showEntranceItem);
}

reducedMotion.addEventListener?.('change', updateMotionPreference);
finePointer.addEventListener?.('change', syncHeroDepth);
reducedMotion.addEventListener?.('change', updateCursorAvailability);
finePointer.addEventListener?.('change', updateCursorAvailability);
window.addEventListener('resize', syncHeroDepth, { passive: true });
window.addEventListener('resize', updateCursorAvailability, { passive: true });
window.addEventListener('blur', resetHeroDepth);
window.addEventListener('blur', hideAtulyashCursor);
document.addEventListener('mouseleave', hideAtulyashCursor);
updateCursorAvailability();
