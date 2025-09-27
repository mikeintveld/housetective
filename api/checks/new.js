// /api/checks/new.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !serviceKey) return res.status(500).json({ error: 'Missing Supabase env vars' });

    let body = req.body;
    if (!body || typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }

    const {
      score,
      red_flags = [],
      top_signals = [],
      advice = [],
      recommendation = '',
      notes = ''
    } = body;

    if (!Number.isFinite(Number(score))) {
      return res.status(400).json({ error: 'score must be a number' });
    }

    const authHeader = req.headers.authorization;
    const hasJWT = !!(authHeader && authHeader.toLowerCase().startsWith('bearer '));

    // Prefer anon key + Authorization when a user JWT is present (so trigger sets user_id)
    const supabase = hasJWT && anonKey
      ? createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } })
      : createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data, error } = await supabase.from('checks').insert([{
      score: Number(score),
      red_flags, top_signals, advice, recommendation, notes
      // user_id will be set by trigger if JWT present; remains NULL otherwise
    }]).select('id, created_at, score, risk_level, user_id').single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, row: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}

