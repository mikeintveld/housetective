import { createClient } from '@supabase/supabase-js';
import { setCORS, handlePreflight } from '../_cors.js';

const supaAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;
  setCORS(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const { data: userData, error: userErr } = await supaAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const user_id = userData.user.id;

    const { data, error } = await supaAdmin
      .from('checks')
      .select('id, created_at, score, risk_level, red_flags')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ rows: data || [] });
  } catch (err) {
    console.error('[checks/recent] error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
