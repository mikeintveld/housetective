// housetective/api/stats.js
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // CORS
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://your.site';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[stats] Missing env vars');
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  // If a user JWT is provided, use anon key + Authorization so RLS filters by user.
  const authHeader = req.headers.authorization;
  const hasJWT = !!(authHeader && authHeader.toLowerCase().startsWith('bearer '));
  const anonKey = SUPABASE_ANON_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = hasJWT && anonKey
    ? createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

  try {
    // KPIs (if using anon+JWT, RLS will naturally scope to that user's rows)
    const { data: kpi, error: kpiErr } = await supabase
      .from('kpis')
      .select('*')
      .maybeSingle();

    if (kpiErr) {
      console.error('[stats] KPI view error:', kpiErr);
      return res.status(500).json({ error: 'KPI query failed' });
    }

    // Snake_case for the Webflow embed; accept both 30d or alltime column names.
    const totals = {
      total_checks: Number(kpi?.total_checks ?? 0),
      high_risk_reports: Number(kpi?.high_risk_reports ?? 0),
      scams_prevented: Number(kpi?.scams_prevented ?? kpi?.high_risk_reports ?? 0),
      avg_risk_30d: Number.parseFloat(kpi?.avg_risk_30d ?? kpi?.avg_risk_alltime ?? 0),
      most_common_red_flag: kpi?.most_common_red_flag || '—',
    };

    // Recent 5 (RLS will also scope this list if anon+JWT is used)
    const { data: recent, error: rErr } = await supabase
      .from('checks')
      .select('created_at, score, risk_level, red_flags')
      .order('created_at', { ascending: false })
      .limit(5);

    if (rErr) {
      console.error('[stats] recent error:', rErr);
      return res.status(500).json({ error: 'Recent query failed' });
    }

    const recentChecks = (recent ?? []).map(r => {
      const raw = Number(r.score);
      const score = Number.isFinite(raw) ? Math.round(raw) : 0;
      const red_flags = Array.isArray(r.red_flags) ? r.red_flags : [];
      const topFlag =
        red_flags.length && red_flags[0]?.text
          ? String(red_flags[0].text).trim() || '—'
          : '—';
      return {
        created_at: r.created_at,
        score,
        risk_level: r.risk_level || 'unknown',
        red_flags,
        topFlag,
      };
    });

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ kpi: totals, recentChecks });
  } catch (e) {
    console.error('[stats] crash:', e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};

