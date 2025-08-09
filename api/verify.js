// Vercel Serverless Function: /api/verify
// Runtime: Node 20 (global fetch)
// Env vars in Vercel: OPENAI_API_KEY (required), RENTALGUARD_MODEL (optional)

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- CORS ---
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
    const { url, imageDataUrl } = body;

    if (!url && !imageDataUrl) {
      return res.status(400).json({ error: "Provide 'url' or 'imageDataUrl' in JSON body." });
    }

    // --- 1) Best-effort fetch + strip page text ---
    let pageText = "";
    if (url) {
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": "RentalGuard/1.0 (+https://vercel.app)" },
        });
        const html = await resp.text();
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

    // --- 2) Build Responses API input with correct block types ---
    const userContent = [
      url ? { type: "input_text", text: `page_url: ${url}` } : null,
      pageText ? { type: "input_text", text: `page_text: ${pageText}` } : null,
      imageDataUrl ? { type: "input_image", image_url: imageDataUrl } : null,
    ].filter(Boolean);

    const input = [
      { role: "system", content: [{ type: "input_text", text: DEFAULT_SYSTEM_PROMPT }] },
      { role: "user",   content: userContent },
    ];

    // --- 3) Call OpenAI Responses API ---
    const response = await client.responses.create({
      model: process.env.RENTALGUARD_MODEL || "gpt-4.1-mini",
      input,
      text: { format: "json" }, // replaces deprecated response_format
      temperature: 0.2,
      max_output_tokens: 600,
    });

    // --- 4) Parse model JSON safely ---
    const raw = response.output_text || response.content?.[0]?.text || "";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("Model did not return JSON. Raw:", raw);
      return res.status(502).json({ error: "Model did not return JSON." });
    }

    parsed.score = Math.max(0, Math.min(100, Number(parsed.score || 0)));

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("verify.js error:", err);
    return res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
}

// --- System Prompt ---
const DEFAULT_SYSTEM_PROMPT = `
You are "RentalGuard", an expert that detects rental-listing scams. Analyze the provided inputs:
- page_text: plain text extracted from a listing URL (if provided)
- page_url: the URL itself (if provided)
- images: one or more listing screenshots (if provided)

Output STRICT JSON matching this schema:
{
  "score": number,           // 0 = definitely legit, 100 = definitely scam
  "verdict": string,         // one of: "no-scam", "likely-no-scam", "uncertain", "likely-scam", "scam"
  "top_signals": string[],   // 3–8 concise bullets explaining the score
  "advice": string[],        // 3–6 practical next steps to verify safely
  "notes": string            // short nuance (if any), mention limits of the analysis
}

Scoring rubric (0–100):
- 0–19: No meaningful red flags.
- 20–39: Mild concerns but plausible.
- 40–59: Uncertain / mixed; several weak-to-moderate signals.
- 60–79: Likely scam; multiple strong red flags.
- 80–100: Clear scam indicators or severe risk.

Evidence to weigh (DO NOT assume facts not present; be explicit about uncertainty):
- Pricing: far below market; suspicious discounts; "pay now to reserve" before viewing.
- Viewing & access: refuses in-person / video tour; claims they are abroad; pressure/urgency.
- Payments & docs: requests crypto, wire, gift cards, Western Union/MoneyGram; asks for deposit/ID before viewing; asks to move chat to WhatsApp/Telegram; nonstandard application links.
- Identity & contact: mismatched names/emails/phone; generic Gmail/Outlook; WhatsApp overlays in images.
- Listing consistency: address missing/mismatched, photos from different properties, watermarks/logos from other sites, stock-looking interiors.
- Language quality: heavy grammar errors, template-like phrasing reused across cities.
- Web signals: brand/domain impersonation, recently registered domain, broken trust pages, social proof that’s thin/inconsistent.
- Image cues: watermarks, overlays with phone numbers, low-res artifacts suggesting copy/paste; text in images contradicts page_text.

Calibration:
- If only a single weak signal exists, keep score low and explain uncertainty.
- If several moderate signals combine, push into 40–70 range.
- If any severe signal (payment before viewing, crypto/wire, passport upfront, overseas owner refusing viewing), push 75–100.

Safety & tone:
- Be factual, calm, and actionable. No legal advice.
- If inputs are insufficient, return an "uncertain" verdict with specific missing items to check.

Return ONLY the JSON. No extra text.
`.trim();

