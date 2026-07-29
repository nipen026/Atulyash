import { apiClient, withQuery, toList } from './apiClient.js';
import { API_ROUTES } from './endpoints.js';

/** Public, moderator-approved reviews for display on the marketing page. */
export async function fetchPublicReviews() {
  const res = await apiClient({
    url: withQuery(API_ROUTES.REVIEW.GET, { page_size: 50, is_active: true, to_display: true }),
  });
  return toList(res.data, ['reviews']);
}

/**
 * The review a customer already left for an order, or null. Used to decide
 * between "Rate this order" and showing the existing rating.
 */
export async function fetchOrderReview(orderId) {
  const res = await apiClient({
    url: withQuery(API_ROUTES.REVIEW.GET, { page_size: 10, is_active: true, order: orderId }),
  });
  const results = toList(res.data, ['reviews']);
  return results[0] || null;
}

/**
 * Submits a product review for a completed order. `to_display` is false because
 * reviews go through moderation before appearing publicly.
 */
export async function submitReview({ orderId, productId, userId, rating, review }) {
  const res = await apiClient({
    url: API_ROUTES.REVIEW.POST,
    method: 'POST',
    body: {
      order: orderId,
      product: productId,
      user: userId,
      rating,
      review,
      is_active: true,
      to_display: false,
    },
  });
  return res.data;
}

export async function updateReview(reviewId, { rating, review }) {
  const res = await apiClient({
    url: API_ROUTES.REVIEW.UPDATE(reviewId),
    method: 'PATCH',
    body: {
      ...(rating !== undefined ? { rating } : {}),
      ...(review !== undefined ? { review } : {}),
    },
  });
  return res.data;
}

/**
 * Rates the delivery rider for a completed delivery. This patches the delivery
 * record itself rather than creating a review row.
 */
export async function rateRider(deliveryId, rating) {
  const res = await apiClient({
    url: API_ROUTES.ORDER_DELIVERY.UPDATE(deliveryId),
    method: 'PATCH',
    body: { rider_rating: rating },
  });
  return res.data;
}
