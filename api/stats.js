import { createClient } from '@supabase/supabase-js';
import { setCORS, handlePreflight } from './_cors.js';

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

    // total checks
    const { count: total_checks } = await supaAdmin
      .from('checks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id);

    // high risk count
    const { count: high_risk_reports } = await supaAdmin
      .from('checks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('risk_level', 'high');

    // average score (last 30d)
    const { data: last30 } = await supaAdmin
      .from('checks')
      .select('score, created_at')
      .eq('user_id', user_id)
      .gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString());

    const avg_risk_30d = Array.isArray(last30) && last30.length
      ? +(last30.reduce((s, r) => s + (Number(r.score) || 0), 0) / last30.length).toFixed(1)
      : 0;

    // most common red flag (simple example: look at `red_flags[].text`)
    const { data: flagsRows } = await supaAdmin
      .from('checks')
      .select('red_flags')
      .eq('user_id', user_id)
      .limit(200);

    const freq = new Map();
    (flagsRows || []).forEach(r => {
      (r.red_flags || []).forEach(f => {
        const key = (f?.text || '').trim();
        if (key) freq.set(key, (freq.get(key) || 0) + 1);
      });
    });
    let most_common_red_flag = '—';
    let max = 0;
    freq.forEach((v, k) => { if (v > max) { max = v; most_common_red_flag = k; } });

    // "scams prevented" – simple proxy: high risk count
    const scams_prevented = high_risk_reports || 0;

    return res.status(200).json({
      total_checks: total_checks || 0,
      high_risk_reports: high_risk_reports || 0,
      avg_risk_30d,
      most_common_red_flag,
      scams_prevented
    });
  } catch (err) {
    console.error('[stats] error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
