// api/checks/new.js
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS: keep '*' while testing; then lock to your domain.
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[checks/new] Missing env vars');
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  let body = req.body;
  try {
    // Vercel may give body as string or Buffer depending on client
    if (Buffer.isBuffer(body)) body = body.toString('utf8');
    if (typeof body === 'string') body = JSON.parse(body);
  } catch (e) {
    console.error('[checks/new] JSON parse error:', e);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const payload = body || {};
  const score = Number(payload.score);
  const red_flags = Array.isArray(payload.red_flags) ? payload.red_flags : (payload.redFlags || []);
  const top_signals = Array.isArray(payload.top_signals) ? payload.top_signals : (payload.topSignals || []);
  const advice = Array.isArray(payload.advice) ? payload.advice : (payload.tips || []);
  const recommendation = payload.recommendation ?? null;
  const notes = payload.notes ?? null;

  if (!Number.isFinite(score)) {
    console.error('[checks/new] Invalid score:', payload.score);
    return res.status(400).json({ error: 'Missing/invalid "score" number' });
  }

  console.log('[checks/new] incoming', { score, red_flags_len: red_flags.length });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from('checks').insert({
      score, red_flags, top_signals, advice, recommendation, notes
    });
    if (error) {
      console.error('[checks/new] Supabase insert error:', error);
      return res.status(500).json({ error: error.message || 'Insert failed' });
    }
    console.log('[checks/new] saved ok');
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[checks/new] crash:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
