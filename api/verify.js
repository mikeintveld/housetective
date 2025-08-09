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
    const { url, imageDataUrl } = body;

    if (!url && !imageDataUrl) {
      return res.status(400).json({ error: "Provide 'url' or 'imageDataUrl' in JSON body." });
    }

    // 1) Best-effort extract text from URL
    let pageText = "";
    if (url) {
      try {
        const resp = await fetch(url, { headers: { "User-Agent": "RentalGuard/1.0 (+https://vercel.app)" } });
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

    // 2) Build Responses API input with the correct block types
    const userContent = [
      url ? { type: "input_text", text: `page_url: ${url}` } : null,
      pageText ? { type: "input_text", text: `page_text: ${pageText}` } : null,
      imageDataUrl ? { type: "input_image", image_url: imageDataUrl } : null,
    ].filter(Boolean);

    const input = [
      { role: "system", content: [{ type: "input_text", text: DEFAULT_SYSTEM_PROMPT }] },
      { role: "user", content: userContent },
    ];

    // 3) Call OpenAI (no text.format / response_format — avoid 400s across SDK versions)
    const response = await client.responses.create({
      model: process.env.RENTALGUARD_MODEL || "gpt-4.1-mini",
      input,
      temperature: 0.2,
      max_output_tokens: 600,
    });

    // 4) Parse JSON safely
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

const DEFAULT_SYSTEM_PROMPT = `
You are "RentalGuard", an expert that detects rental-listing scams. Analyze the provided inputs:
- page_text: plain text extracted from a listing URL (if provided)
- page_url: the URL itself (if provided)
- images: one or more listing screenshots (if provided)

Output STRICT JSON matching this schema:
{
  "score": number,
  "verdict": string,
  "top_signals": string[],
  "advice": string[],
  "notes": string
}

Scoring rubric (0–100):
- 0–19: No meaningful red flags.
- 20–39: Mild concerns but plausible.
- 40–59: Uncertain / mixed; several weak-to-moderate signals.
- 60–79: Likely scam; multiple strong red flags.
- 80–100: Clear scam indicators or severe risk.

Evidence to weigh (no assumptions; be explicit about uncertainty):
- Pricing far below market; pressure to pay before viewing.
- Refuses tours; claims they are abroad; urgency.
- Requests crypto/wire/gift cards; ID/deposit before viewing; off-platform chat.
- Mismatched identities/contacts; generic emails.
- Address/photo mismatches; watermarks; stock-looking images.
- Poor language quality; templated phrasing across cities.
- Impersonation; brand-new domain; thin social proof.
- Image cues: watermarks/overlays/contradictions.

Calibration:
- Single weak signal → low score + uncertainty.
- Several moderate signals → 40–70.
- Severe signals (pay before viewing, crypto/wire, passport upfront, overseas owner refusing viewing) → 75–100.

Tone: factual, calm, actionable. If inputs are insufficient, return "uncertain" with what to check next.
Return ONLY the JSON. No extra text.
`.trim();


