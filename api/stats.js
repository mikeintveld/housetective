// api/stats.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Validate caller
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) return res.status(401).json({ error: 'Invalid token' });
    const userId = userData.user.id;

    // Aggregate KPIs for this user
    const { data: allRows, error } = await supabase
      .from('checks')
      .select('score, red_flags, risk_level')
      .eq('user_id', userId);

    if (error) return res.status(400).json({ error: error.message });

    const total_checks = allRows.length;
    const high_risk_reports = allRows.filter(r => r.risk_level === 'high').length;
    const scams_prevented = high_risk_reports; // your business rule (adjust if needed)

    // Avg over last 30 days
    const thirtyDaysAgo = Date.now() - 30*24*60*60*1000;
    const last30 = allRows.filter(r => new Date(r.created_at || 0).getTime() >= thirtyDaysAgo);
    const avg_risk_30d = last30.length ? (last30.reduce((s, r) => s + Number(r.score || 0), 0) / last30.length) : 0;

    // Most common red flag text
    const counts = new Map();
    for (const r of allRows) {
      const flags = Array.isArray(r.red_flags) ? r.red_flags : [];
      for (const f of flags) {
        const key = (f?.text || '').trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    let most_common_red_flag = '—', most_common_red_flag_pct = 0;
    if (counts.size && total_checks) {
      let top = ['', 0];
      counts.forEach((v, k) => { if (v > top[1]) top = [k, v]; });
      most_common_red_flag = top[0];
      most_common_red_flag_pct = Math.round((top[1] / total_checks) * 100);
    }

    return res.status(200).json({
      total_checks,
      high_risk_reports,
      scams_prevented,
      avg_risk_30d,
      most_common_red_flag,
      most_common_red_flag_pct
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
