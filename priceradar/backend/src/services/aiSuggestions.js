import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Given a product + its price + a short spec summary, ask Claude to name
 * 2-3 alternatives worth considering at that price point, with reasons.
 * This does NOT invent prices — it names real, well-known products;
 * you then look up their actual current price via the same aggregator
 * before showing it to the user (don't trust AI-generated prices).
 */
export async function suggestAlternatives({ title, price, category, keySpecs }) {
  const prompt = `A shopper is considering buying: "${title}" priced at ₹${price} (category: ${category}).
Known specs: ${keySpecs || "not provided"}.

Suggest 2-3 real, currently-sold alternative products (same category, similar price range ±20%) that could be a better value, and briefly say why each might be preferable (e.g. better processor, better battery life, better brand reliability for this price tier).

Respond ONLY with valid JSON, no markdown fences:
{
  "alternatives": [
    { "product_name": "string", "reason": "one sentence", "approx_price_range": "₹X - ₹Y" }
  ]
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  return safeParseJson(text);
}

function safeParseJson(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Failed to parse AI suggestions JSON:", err, cleaned);
    return { alternatives: [] };
  }
}
