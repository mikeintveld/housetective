// api/stats.js  — CommonJS (matches your repo's serverless style)
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS (leave '*' while testing; restrict later)
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[stats] Missing Supabase env vars');
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Try KPIs view first (public.kpis)
    const { data: kpi, error: kpiErr } = await supabase.from('kpis').select('*').single();

    let totals = {
      totalChecks: 0,
      highRiskReports: 0,
      scamsPrevented: 0,
      avgRisk30d: 0,
      mostCommonRedFlag: '—'
    };

    if (kpiErr) {
      // 2) Fallback: aggregate directly from public.checks
      console.warn('[stats] kpis view missing, falling back to checks:', kpiErr.message);

      const { data: all, error: allErr } = await supabase
        .from('checks') // <<<<<<  IMPORTANT: use 'checks', not 'scam_checks'
        .select('created_at, score, risk_level, red_flags');

      if (allErr) {
        console.error('[stats] checks fallback error:', allErr);
        return res.status(500).json({ error: allErr.message || 'Query failed' });
      }

      const total = all.length;
      const high = all.filter(r => r.risk_level === 'high').length;

      const now = Date.now();
      const last30 = all.filter(r => (now - new Date(r.created_at).getTime()) <= 30*24*60*60*1000);
      const avg30 = last30.length
        ? last30.reduce((s, r) => s + Number(r.score || 0), 0) / last30.length
        : 0;

      // most common red flag (first flag text per row)
      const counts = {};
      for (const row of all) {
        if (Array.isArray(row.red_flags) && row.red_flags.length) {
          const t = String(row.red_flags[0]?.text || '').trim();
          if (t) counts[t] = (counts[t] || 0) + 1;
        }
      }
      const topFlag = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

      totals = {
        totalChecks: total,
        highRiskReports: high,
        scamsPrevented: high, // define differently if needed
        avgRisk30d: Number(avg30.toFixed(1)),
        mostCommonRedFlag: topFlag
      };
    } else {
      totals = {
        totalChecks: kpi.total_checks,
        highRiskReports: kpi.high_risk_reports,
        scamsPrevented: kpi.scams_prevented,
        avgRisk30d: Number(kpi.avg_risk_30d),
        mostCommonRedFlag: kpi.most_common_red_flag
      };
    }

    // Recent checks (from public.checks)
    const { data: recent, error: rErr } = await supabase
      .from('checks') // <<<<<<  IMPORTANT
      .select('created_at, score, risk_level, red_flags')
      .order('created_at', { ascending: false })
      .limit(5);

    if (rErr) {
      console.error('[stats] recent error:', rErr);
      return res.status(500).json({ error: rErr.message || 'Recent query failed' });
    }

    const recentChecks = (recent || []).map(r => ({
      date: new Date(r.created_at).toISOString().slice(0,10),
      score: Math.round(Number(r.score)),
      risk: r.risk_level,
      topFlag: (Array.isArray(r.red_flags) && r.red_flags[0]?.text)
        ? String(r.red_flags[0].text)
        : '—'
    }));

    return res.status(200).json({ kpi: totals, recentChecks });
  } catch (e) {
    console.error('[stats] crash:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};

