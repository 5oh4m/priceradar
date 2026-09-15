import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Takes raw scraped review text (array of strings) and returns a
 * structured summary. Cache the output in `review_summaries` — never
 * call this per page-view, only when the cache is stale (e.g. weekly).
 */
export async function summarizeReviews(productTitle, rawReviews) {
  if (!rawReviews || rawReviews.length === 0) {
    return {
      pros: [],
      cons: [],
      sentiment_score: null,
      fake_review_flag: false,
      sample_size: 0,
      note: "No reviews available to summarize.",
    };
  }

  const reviewBlock = rawReviews
    .slice(0, 60) // cap input size / cost
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n");

  const prompt = `You are analyzing real customer reviews for the product: "${productTitle}".

Reviews:
${reviewBlock}

Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "pros": ["short phrase", ...max 5],
  "cons": ["short phrase", ...max 5],
  "sentiment_score": number from 0 to 100 (overall positivity),
  "fake_review_flag": boolean (true if reviews show suspicious patterns like repeated phrasing, generic praise, or unnatural clustering),
  "fake_review_reason": string or null (brief reason if flagged),
  "sample_size": ${rawReviews.length}
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
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
    console.error("Failed to parse AI review JSON:", err, cleaned);
    return { pros: [], cons: [], sentiment_score: null, fake_review_flag: false, sample_size: 0 };
  }
}
