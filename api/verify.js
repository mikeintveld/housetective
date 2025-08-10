// /api/verify — Vercel serverless function (Node 20)
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { url, imageDataUrl, meta } = body;

    if (!url && !imageDataUrl) {
      return res.status(400).json({ error: "Provide 'url' or 'imageDataUrl' in JSON body." });
    }

    // ---------- Try to fetch page text (ok if it fails) ----------
    let pageText = "";
    let fetchErr = null;
    if (url) {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "RentalGuard/1.0 (+https://housetective.com)" },
        });
        const html = await r.text();
        pageText = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 24000);
      } catch (e) {
        fetchErr = e?.message || String(e);
      }
    }

    // ---------- FAST FALLBACK: no page text & no image ----------
    if (!pageText && !imageDataUrl) {
      return res.status(200).json({
        score: 50,
        verdict: "uncertain",
        top_signals: [
          "Listing content could not be accessed (login wall or blocked).",
          "No page text or images available to analyze.",
          "Legitimacy cannot be determined from the URL alone."
        ],
        advice: [
          "Upload a screenshot of the listing so we can inspect text and images.",
          "Ask the poster for a live video tour before paying anything.",
          "Do not send deposits or ID documents until after viewing in person.",
        ],
        notes: fetchErr ? `Fetch error: ${fetchErr}` : "Page content unavailable.",
        explanation: "We couldn’t access the listing. Upload a screenshot for a deeper check.",
        needs_image: true
      });
    }

    // ---------- Build multimodal input for the model ----------
    const userBlocks = [
      url ? { type: "input_text", text: `page_url: ${url}` } : null,
      pageText ? { type: "input_text", text: `page_text: ${pageText}` } : null,
      imageDataUrl ? { type: "input_image", image_url: imageDataUrl } : null,
      meta?.notes ? { type: "input_text", text: `user_notes: ${meta.notes}` } : null,
    ].filter(Boolean);

    const input = [
      { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
      { role: "user",   content: userBlocks },
    ];

    // ---------- Call OpenAI (map common errors nicely) ----------
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
      if (status === 401) return res.status(502).json({ error: "Server is missing/has an invalid OpenAI API key." });
      if (status === 429) return res.status(503).json({ error: "AI temporarily unavailable (quota/rate limit). Please try again soon." });
      console.error("OpenAI error:", e);
      return res.status(502).json({ error: "Upstream AI error." });
    }

    // ---------- Parse & coerce ----------
    const parsed = coerceResult(safeParseJSON(raw));
    return res.status(200).json(parsed);

  } catch (err) {
    console.error("verify.js error:", err);
    return res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
}

/* ---------------- Helpers ---------------- */
function safeParseJSON(text) {
  if (!text || typeof text !== "string") return null;
  try { return JSON.parse(text); } catch {}
  const m = text.match(/{[\s\S]*}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
function coerceResult(obj) {
  const fallback = {
    score: 0, verdict: "uncertain", top_signals: [],
    advice: [
      "Request an in-person or live video tour before paying anything.",
      "Never send deposits or ID documents before viewing.",
      "Use secure, traceable payment methods; avoid crypto or wire."
    ],
    notes: "Limited information available; proceed cautiously.",
    explanation: "General safety guidance due to limited inputs."
  };
  if (!obj || typeof obj !== "object") return fallback;
  const score = clamp(obj.score, 0, 100, 0);
  const verdict = str(obj.verdict, "uncertain");
  const top_signals = arr(obj.top_signals, []);
  const advice = arr(obj.advice, fallback.advice);
  const notes = str(obj.notes, fallback.notes);
  const explanation = str(obj.explanation,
    top_signals.length ? top_signals.join(" • ") : fallback.explanation
  );
  return { score, verdict, top_signals, advice, notes, explanation };
}
const clamp = (n,min,max,d=0)=>Number.isFinite(+n)?Math.max(min,Math.min(max,+n)):d;
const str = (v,d="") => (typeof v==="string" && v.trim()) ? v.trim() : d;
const arr = (v,d=[]) => Array.isArray(v) ? v.map(x=>String(x)).filter(Boolean) : d;

/* ---------------- Prompt ---------------- */
const SYSTEM_PROMPT = `
You are "RentalGuard", an expert that detects rental-listing scams.
Return STRICT JSON ONLY with:
{
  "score": number,
  "verdict": "no-scam" | "likely-no-scam" | "uncertain" | "likely-scam" | "scam",
  "top_signals": string[],
  "advice": string[],
  "notes": string,
  "explanation": string
}
Weigh below-market price, pressure to pay before viewing, remote owner, crypto/wire,
ID/deposit before viewing, off-platform chat (WhatsApp/Telegram), mismatched identities,
photo/address inconsistencies, stock/watermarked images, poor language, impersonation.
Be explicit about uncertainty when inputs are thin. Return ONLY JSON. No extra text.
`.trim();




