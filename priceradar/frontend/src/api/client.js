import axios from "axios";

const client = axios.create({ baseURL: "/api" });

/**
 * Returns the full search payload:
 *   { query, generatedAt, intent, storeErrors, reviewQueue, results, otherVariants }
 */
export async function searchProducts(query) {
  const { data } = await client.get("/search", { params: { q: query } });
  return data;
}

export async function getReviewSummary(productId, rawReviews = []) {
  const { data } = await client.post(`/products/${productId}/reviews`, { rawReviews });
  return data;
}

export async function getSuggestions(productId) {
  const { data } = await client.get(`/products/${productId}/suggestions`);
  return data;
}

export default client;
