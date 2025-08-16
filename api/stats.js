// /pages/api/stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.authorization || '' } } }
  );

  // total checks
  const { count: total_checks, error: e1 } = await supabase
    .from('checks')
    .select('id', { count: 'exact', head: true });
  if (e1) return res.status(400).json({ error: e1.message });

  // high risk reports (score >= 60)
  const { count: high_risk_reports, error: e2 } = await supabase
    .from('checks')
    .select('id', { count: 'exact', head: true })
    .gte('score', 60);
  if (e2) return res.status(400).json({ error: e2.message });

  // last 30 days
  const since = new Date(); since.setDate(since.getDate() - 30);
  const { data: last30, error: e3 } = await supabase
    .from('checks')
    .select('score, red_flags')
    .gte('created_at', since.toISOString());
  if (e3) return res.status(400).json({ error: e3.message });

  const avg_risk_30d = last30?.length ? last30.reduce((s, r) => s + (r.score || 0), 0) / last30.length : 0;

  // most common first red flag
  const tally: Record<string, number> = {};
  last30?.forEach(r => {
    const t = Array.isArray(r.red_flags) && r.red_flags[0]?.text ? r.red_flags[0].text : null;
    if (t) tally[t] = (tally[t] || 0) + 1;
  });
  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
  const most_common_red_flag = top?.[0] || '—';
  const most_common_red_flag_pct = top ? Number(((top[1] / (last30?.length || 1)) * 100).toFixed(1)) : null;

  res.status(200).json({
    total_checks,
    scams_prevented: high_risk_reports || 0,
    high_risk_reports,
    avg_risk_30d: Number(avg_risk_30d.toFixed(1)),
    most_common_red_flag,
    most_common_red_flag_pct
  });
}


