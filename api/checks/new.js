import { createClient } from '@supabase/supabase-js';
import { setCORS, handlePreflight } from '../_cors.js';

const supaAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // 1) Preflight
  if (handlePreflight(req, res)) return;

  // 2) CORS on all responses
  setCORS(res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 3) Verify JWT (Authorization: Bearer <token>)
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const { data: userData, error: userErr } = await supaAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user_id = userData.user.id;

    // 4) Parse payload
    const {
      score = 0,
      red_flags = [],
      top_signals = [],
      advice = [],
      recommendation = '',
      notes = ''
    } = (req.body && typeof req.body === 'object') ? req.body
      : JSON.parse(req.body || '{}');

    // 5) Insert row
    const { data, error } = await supaAdmin
      .from('checks')
      .insert([{
        user_id,
        score,
        red_flags,
        top_signals,
        advice,
        recommendation,
        notes
      }])
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    // 6) Done
    return res.status(201).json({ ok: true, row: data });
  } catch (err) {
    console.error('[checks/new] error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

