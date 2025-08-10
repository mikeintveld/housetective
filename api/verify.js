// /api/verify — Vercel serverless function (Node 20)
// ENV: OPENAI_API_KEY (required), RENTALGUARD_MODEL (optional, default gpt-4.1-mini)

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { url, imageDataUrl, meta } = body;

    if (!url && !imageDataUrl) {
      return res.status(400).json({ error: "Provide 'url' or 'imageDataUrl' in JSON body." });
    }

    // 1) Try to fetch & strip text (OK if it fails; FB often blocks)
    let pageText = "";
    if (url) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": "RentalGuard/1.0 (+https://housetective.com)" } });
        const html = await r.text();
        pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 24000);
      } catch (e) {
        console.warn("Fetch/strip failed:", e?.message || e);
      }
    }

    // 2) Build Responses API payload (use correct block types)
    const userBlocks = [
      url ? { type: "input_text", text: `page_url: ${url}` } : null,
      pageText ? { type: "input_text", text: `page_text: ${pageText}` } : null,
      imageDataUrl ? { type: "input_image", image_url: imageDataUrl } : null,
      meta?.notes ? { type: "input_text", text: `user_notes: ${meta.notes}` } : null,
    ].filter(Boolean);

    const input = [
      { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
      { role: "user",   content: userBlocks.length ? userBlocks : [{ type: "input_text", text: "No content provided." }] },
    ];

    // 3) Call OpenAI (no deprecated response_format / text.format)
    let raw;
    try {
      const ai = await client.responses.create({
        model: process.env.RENTALGUARD_MODEL || "gpt-4.1-mini",
        input,
        temperature: 0.2,
        max_output_tokens: 700,
      });
      raw = ai.output_text || ai.content?.[0]?.text || "";
    } catch (e) {
      const status = e?.status || e?.code || 500;
      if (status === 401) {
        return res.status(502).json({ error: "Server is missing/has an invalid OpenAI API key." });
      }
      if (status === 429) {
        return res.status(503).json({ error: "AI temporarily unavailable (quota/rate limit). Please try again soon." });
      }
      console.error("OpenAI error:", e);
      return res.status(502).json({ error: "Upstream AI error." });
    }

    // 4) Parse JSON robustly (extract JSON chunk if model added text)
    const parsed = coerceResult(safeParseJSON(raw));

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("verify.js error:", err);
    return res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
}

/* ---------- Helpers ---------- */

function safeParseJSON(text) {
  if (!text || typeof text !== "string") return null;
  // Try direct parse
  try { return JSON.parse(text); } catch {}
  // Try to extract the largest {} block
  const match = text.match(/{[\s\S]*}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

// Ensure we always return complete, non-undefined fields
function coerceResult(obj) {
  const fallback = {
    score: 0,
    verdict: "uncertain",
    top_signals: [],
    advice: [
      "Request an in-person or live video tour before paying anything.",
      "Never send deposits or ID documents before viewing.",
      "Use secure, traceable payment methods; avoid crypto or wire.",
    ],
    notes: "Limited information available; proceed cautiously.",
    explanation: "Insufficient or blocked page content. Provided general safety guidance.",
  };

  if (!obj || typeof obj !== "object") return fallback;

  const scoreNum = clampNumber(obj.score, 0, 100, 0);
  const verdict = str(obj.verdict, "uncertain");
  const topSignals = arrOfStrings(obj.top_signals);
  const advice = arrOfStrings(obj.advice, fallback.advice);
  const notes = str(obj.notes, fallback.notes);

  // Ensure explanation always exists (some UIs display it)
  const explanation = str(
    obj.explanation,
    topSignals.length ? topSignals.join(" • ") : fallback.explanation
  );

  return { score: scoreNum, verdict, top_signals: topSignals, advice, notes, explanation };
}

function clampNumber(n, min, max, dflt) {
  const v = Number(n);
  if (Number.isFinite(v)) return Math.max(min, Math.min(max, v));
  return dflt;
}
function str(v, dflt = "") {
  return typeof v === "string" && v.trim() ? v.trim() : dflt;
}
function arrOfStrings(v, dflt = []) {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  return dflt;
}

/* ---------- System Prompt ---------- */
const SYSTEM_PROMPT = `
You are "RentalGuard", an expert that detects rental-listing scams.
You will receive:
- page_url: the listing URL (may be login-gated)
- page_text: stripped text from the page (may be empty)
- user_notes: optional user message
- input_image: optional screenshot(s)

Return STRICT JSON ONLY with this EXACT shape:
{
  "score": number,                 // 0 = definitely legit, 100 = definitely scam
  "verdict": "no-scam" | "likely-no-scam" | "uncertain" | "likely-scam" | "scam",
  "top_signals": string[],         // 3–8 concise bullets
  "advice": string[],              // 3–6 next steps to verify safely
  "notes": string,                 // nuance or limits of analysis
  "explanation": string            // short human-readable one-liner for UIs
}

Scoring:
- 0–19: No meaningful red flags.
- 20–39: Mild concerns; plausible.
- 40–59: Uncertain; mixed evidence.
- 60–79: Likely scam; multiple strong red flags.
- 80–100: Clear scam indicators or severe risk.

Weigh evidence (be explicit about uncertainty; do not invent facts):
- Below-market price, urgency/pressure, overseas owner, refuses viewing.
- Requests crypto/wire/gift cards; ID or deposit before viewing.
- Off-platform messaging (WhatsApp/Telegram), generic emails, mismatched identities.
- Address/photo mismatches, stock photos, watermarks, overlays with phone numbers.
- Poor language, reused templates; brand/domain impersonation; thin social proof.
- Image contradictions vs text.

If inputs are thin (e.g., login wall) keep score conservative and reflect uncertainty in "notes".
Return ONLY the JSON. No extra text, no markdown.
`.trim();



