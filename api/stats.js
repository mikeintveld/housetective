// housetective/api/stats.js
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS (lock this down in production)
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://your.site';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[stats] Missing env vars');
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1) KPIs from SQL view
    const { data: kpi, error: kpiErr } = await supabase
      .from('kpis')
      .select('*')
      .maybeSingle();

    if (kpiErr) {
      console.error('[stats] KPI view error:', kpiErr);
      return res.status(500).json({ error: 'KPI query failed' });
    }

    // Normalize KPI payload to snake_case expected by the Webflow embed
    const totals = {
      total_checks: Number(kpi?.total_checks ?? 0),
      high_risk_reports: Number(kpi?.high_risk_reports ?? 0),
      scams_prevented: Number(
        kpi?.scams_prevented ?? kpi?.high_risk_reports ?? 0
      ),
      // accept either avg_risk_30d (windowed) or avg_risk_alltime (forever)
      avg_risk_30d: Number.parseFloat(
        kpi?.avg_risk_30d ?? kpi?.avg_risk_alltime ?? 0
      ),
      most_common_red_flag: kpi?.most_common_red_flag || '—',
    };

    // 2) Recent 5 checks (preserve created_at, risk_level, red_flags)
    const { data: recent, error: rErr } = await supabase
      .from('checks')
      .select('created_at, score, risk_level, red_flags')
      .order('created_at', { ascending: false })
      .limit(5);

    if (rErr) {
      console.error('[stats] recent error:', rErr);
      return res.status(500).json({ error: 'Recent query failed' });
    }

    const recentChecks = (recent ?? []).map((r) => {
      const raw = Number(r.score);
      const score = Number.isFinite(raw) ? Math.round(raw) : 0;
      const red_flags = Array.isArray(r.red_flags) ? r.red_flags : [];

      // Derive a topFlag for convenience (client also handles this)
      const topFlag =
        red_flags.length && red_flags[0]?.text
          ? String(red_flags[0].text).trim() || '—'
          : '—';

      return {
        created_at: r.created_at,                 // keep DB field name
        score,
        risk_level: r.risk_level || 'unknown',    // snake_case
        red_flags,                                 // pass-through
        topFlag,                                   // extra helper for UI
      };
    });

    // small cache since this is aggregated/public-ish data
    res.setHeader('Cache-Control', 'public, max-age=60');

    return res.status(200).json({ kpi: totals, recentChecks });
  } catch (e) {
    console.error('[stats] crash:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};

