import { apiClient, withQuery, toList } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';
import { fetchConsumptionCalculator } from './subscriptionManagement.js';
import { fetchPublicReviews } from './reviews.js';

// ---- Fetchers ----

/** Short promotional/instructional product videos for the homepage rails. */
export async function fetchProductVideos() {
  const res = await apiClient({ url: withQuery(API_ROUTES.PRODUCT.VIDEOS, { is_active: true }) });
  return toList(res.data, ['videos']);
}

/** Header/subtitle overlay copy for the video rails. */
export async function fetchProductVideoTitles() {
  const res = await apiClient({ url: API_ROUTES.PRODUCT.VIDEO_TITLES });
  return toList(res.data, ['titles']);
}

/**
 * The CMS-driven homepage layout: banners, offers, products and categories
 * already grouped into sections. `isWeb` asks for desktop grid layouts.
 */
export async function fetchHomeSections({ isWeb = true } = {}) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.PRODUCT.HOME_SECTIONS, { is_active: true, is_web: isWeb }),
  });
  return toList(res.data, ['sections']);
}

/** Same idea, for the subscription landing surface. */
export async function fetchSubscriptionHomeSections({ isWeb = true } = {}) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.SUBSCRIPTION_HOME_SECTIONS.GET, { is_active: true, is_web: isWeb }),
  });
  return toList(res.data, ['sections']);
}

/**
 * Customer FAQs from /customers/customer-faqs/?page_size=100&is_active=true.
 *
 * The payload names the question `name` and the answer `description` (not
 * `question`/`answer`), and carries a category (`faq_type` + `faq_type_name`)
 * plus an `order_rank` for ordering within that category. Normalised here to a
 * stable shape so the two render sites — the marketing page and the account
 * Help tab — don't each have to know the API's field names.
 *
 * @returns {Promise<Array<{id:number, question:string, answer:string, category:string, typeId:number, rank:number}>>}
 */
export async function fetchFaqs() {
  const res = await apiClient({
    url: withQuery(API_ROUTES.CUSTOMER_FAQ.GET, { page_size: 100, is_active: true }),
  });

  return toList(res.data, ['faqs'])
    .map((faq) => ({
      id: faq.id,
      // Fall back to question/answer in case the serializer is ever renamed.
      question: faq.name ?? faq.question ?? '',
      answer: faq.description ?? faq.answer ?? '',
      category: faq.faq_type_name ?? '',
      typeId: Number(faq.faq_type ?? 0),
      rank: Number(faq.order_rank ?? 0),
    }))
    // Drop rows with no question — an empty <details> is worse than nothing.
    .filter((faq) => faq.question.trim() !== '')
    .sort((a, b) => a.typeId - b.typeId || a.rank - b.rank || a.id - b.id);
}

/** Groups normalised FAQs into `[{category, items}]`, preserving sort order. */
export function groupFaqsByCategory(faqs) {
  const groups = [];
  for (const faq of faqs) {
    const label = faq.category || 'General';
    let group = groups.find((g) => g.category === label);
    if (!group) {
      group = { category: label, items: [] };
      groups.push(group);
    }
    group.items.push(faq);
  }
  return groups;
}

/** Latest Product Truth Book — ingredient transparency + quality certifications. */
export async function fetchTruthBook() {
  const res = await apiClient({
    url: withQuery(API_ROUTES.PRODUCT.TRUTH_BOOK_LATEST, { is_active: true }),
  });
  // `latest/` returns a single object on some deployments and a list on others.
  const data = res.data;
  if (Array.isArray(data)) return data[0] || null;
  return data?.results?.[0] ?? data ?? null;
}

export async function fetchContactUs() {
  const res = await apiClient({ url: withQuery(API_ROUTES.PRODUCT.CONTACT_US, { is_active: true }) });
  const data = res.data;
  if (Array.isArray(data)) return data[0] || null;
  return data?.results?.[0] ?? data ?? null;
}

// ---- Marketing-page hydration ----
//
// index.html ships static copy for FAQs and contact details so the page is
// useful with JS disabled and if the API is down. These helpers replace that
// copy only once real data arrives — never blank a section on failure.

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function hydrateFaqs() {
  const list = document.querySelector('[data-faq-list]');
  if (!list) return;

  const faqs = await fetchFaqs();
  // Keep the hand-written static FAQs rather than replacing them with nothing.
  if (faqs.length === 0) return;

  // Kept flat (not grouped) so the section's `data-motion-sequence` animation
  // still sees <details> as direct children; the category rides along as a
  // label on each row instead.
  list.innerHTML = faqs.map((faq) => `
    <details>
      <summary>${escapeHtml(faq.question)}<span aria-hidden="true">+</span></summary>
      <p>${escapeHtml(faq.answer)}</p>
    </details>
  `).join('');
}

async function hydrateContactDetails() {
  const container = document.querySelector('[data-contact-actions]');
  if (!container) return;

  const contact = await fetchContactUs();
  if (!contact) return;

  const email = contact.email || contact.support_email;
  const phone = contact.phone || contact.phone_number || contact.helpline_number;
  if (!email && !phone) return;

  const parts = [];
  if (email) {
    parts.push(`<a href="mailto:${escapeHtml(email)}" class="text-action text-action-dark">Write to us <span aria-hidden="true">&rarr;</span></a>`);
  }
  if (phone) {
    const dialable = String(phone).replace(/[^\d+]/g, '');
    parts.push(`<a href="tel:${escapeHtml(dialable)}" class="text-action text-action-dark">Call us on ${escapeHtml(phone)} <span aria-hidden="true">&rarr;</span></a>`);
  }
  container.innerHTML = parts.join('');
}

async function hydrateTruthBook() {
  const container = document.querySelector('[data-truth-book]');
  if (!container) return;

  const book = await fetchTruthBook();
  const url = book?.file || book?.document || book?.pdf || book?.url;
  if (!url) return;

  container.innerHTML = `
    <a class="text-action text-action-dark" href="${escapeHtml(url)}" target="_blank" rel="noopener">
      ${escapeHtml(book.title || 'Read the Atulyash Truth Book')} <span aria-hidden="true">&rarr;</span>
    </a>
  `;
  container.hidden = false;
}

async function hydrateProductVideos() {
  const rail = document.querySelector('[data-product-videos]');
  if (!rail) return;

  const [videos, titles] = await Promise.all([
    fetchProductVideos(),
    fetchProductVideoTitles().catch(() => []),
  ]);
  if (videos.length === 0) return;

  const heading = titles[0];
  const headingEl = document.querySelector('[data-product-videos-title]');
  if (headingEl && heading?.title) headingEl.textContent = heading.title;

  rail.innerHTML = videos.map((video) => {
    const src = video.video || video.video_url || video.file;
    if (!src) return '';
    return `
      <figure class="atulyash-video-card">
        <video controls playsinline preload="metadata"
          ${video.thumbnail ? `poster="${escapeHtml(video.thumbnail)}"` : ''}>
          <source src="${escapeHtml(src)}" type="video/mp4">
        </video>
        ${video.title ? `<figcaption>${escapeHtml(video.title)}</figcaption>` : ''}
      </figure>
    `;
  }).join('');

  const section = rail.closest('[data-product-videos-section]');
  if (section) section.hidden = false;
}

async function hydrateReviews() {
  const rail = document.querySelector('[data-reviews-rail]');
  if (!rail) return;

  const reviews = await fetchPublicReviews();
  if (reviews.length === 0) return;

  rail.innerHTML = reviews.slice(0, 9).map((r) => `
    <blockquote class="atulyash-review-card">
      <div class="atulyash-review-stars" aria-label="${escapeHtml(r.rating)} out of 5">
        ${'&#9733;'.repeat(Math.round(Number(r.rating) || 0))}${'&#9734;'.repeat(Math.max(0, 5 - Math.round(Number(r.rating) || 0)))}
      </div>
      <p>${escapeHtml(r.review)}</p>
      ${r.user_name ? `<cite>${escapeHtml(r.user_name)}</cite>` : ''}
    </blockquote>
  `).join('');

  const section = rail.closest('[data-reviews-section]');
  if (section) section.hidden = false;
}

/**
 * The atta calculator lives in script.js (a classic script, so it can't import
 * these modules). It asks for an estimate by dispatching
 * `atulyash:calculator-request` and renders whatever comes back on
 * `atulyash:calculator-result` — that indirection is what lets the request go
 * through the shared apiClient instead of a second hardcoded API host.
 */
// Registered at module-evaluation time, not inside hydrateMarketingContent():
// script.js is a classic script that runs before this module, so the listener
// has to exist by the time it fires its first request on DOMContentLoaded.
function wireCalculatorBridge() {
  document.addEventListener('atulyash:calculator-request', async (event) => {
    const rotisPerDay = event.detail?.rotisPerDay;
    if (!rotisPerDay) return;

    try {
      const data = await fetchConsumptionCalculator(rotisPerDay);
      document.dispatchEvent(new CustomEvent('atulyash:calculator-result', { detail: { data } }));
    } catch (err) {
      document.dispatchEvent(new CustomEvent('atulyash:calculator-error', { detail: { error: err } }));
    }
  });
}

/**
 * Hydrates every CMS-backed part of the marketing page. Each section is
 * independent and failure-tolerant: one dead endpoint must not take the others
 * (or the static fallback copy) down with it.
 */
export function hydrateMarketingContent() {
  [hydrateFaqs, hydrateContactDetails, hydrateTruthBook, hydrateProductVideos, hydrateReviews]
    .forEach((task) => {
      task().catch(() => {
        // Static markup already in the page stays as the fallback.
      });
    });
}

wireCalculatorBridge();
