// api/checks/new.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // server-side only
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1) Validate caller's JWT from Supabase
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    const userId = userData.user.id;

    // 2) Extract payload from browser
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const row = {
      user_id: userId,            // explicit; trigger would also fill this
      score: Number(body.score) || 0,
      red_flags: Array.isArray(body.red_flags) ? body.red_flags : [],
      top_signals: Array.isArray(body.top_signals) ? body.top_signals : [],
      advice: Array.isArray(body.advice) ? body.advice : [],
      recommendation: body.recommendation || '',
      notes: body.notes || ''
    };

    // 3) Insert
    const { data, error } = await supabase
      .from('checks')
      .insert(row)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true, row: data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
