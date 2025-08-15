// /api/checks/new.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // CORS (loose for testing)
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return res.status(500).json({ error: 'Missing Supabase env vars' });

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

    if (!Number.isFinite(Number(score))) return res.status(400).json({ error: 'score must be a number' });

    const supabase = createClient(url, key);
    const { data, error } = await supabase.from('checks').insert([{
      score: Number(score),
      red_flags, top_signals, advice, recommendation, notes
    }]).select('id, created_at, score, risk_level').single();

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true, row: data });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}


