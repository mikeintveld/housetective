# RentalGuard — Webflow + Vercel starter

This project provides a serverless endpoint your Webflow site can call to verify rental listings and return a 0–100 scam risk score with reasons.

## Quick start (Vercel)

1. **Import to Vercel**
   - Create a new Git repo with these files or use the Vercel “Import Project” flow and upload the folder.

2. **Environment variables**
   - In Vercel Project Settings → *Environment Variables*, add:
     - `OPENAI_API_KEY` = your OpenAI API key
     - (optional) `RENTALGUARD_MODEL` = `gpt-4.1-mini`
     - `SUPABASE_URL` = your Supabase project URL
     - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service role key (server only)
     - (optional) `CORS_ORIGIN` = allowed origin for CORS
     - `NEXT_PUBLIC_SUPABASE_URL` = same as `SUPABASE_URL` but safe for the browser
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key

3. **Deploy**
   - After deploy, your endpoint will be:
     ```
     https://YOUR-PROJECT.vercel.app/api/verify
     ```

4. **Connect Webflow**
   - Paste the contents of `webflow-embed.html` into a Webflow **Embed** element.
   - Change the `fetch(...)` URL to your Vercel URL above.

## Local testing (optional)

```bash
npm install
# vercel dev is recommended if you have Vercel CLI:
# npm i -g vercel
# vercel dev
```

Then test:
```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

## Notes
- Your API key must stay **server-side**. Do not put it into Webflow.
- This function accepts either:
  - `url` (string) of the listing, **or**
  - `imageDataUrl` (string) of a PNG/JPG screenshot (data URL).
- The model response is forced to strict JSON.
