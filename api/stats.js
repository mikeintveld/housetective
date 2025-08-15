// api/stats.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data: totalChecks, error: err1 } = await supabase
      .from('scam_checks')
      .select('*', { count: 'exact', head: true })
    if (err1) throw err1

    const { data: highRisk, error: err2 } = await supabase
      .from('scam_checks')
      .select('*', { count: 'exact', head: true })
      .gte('score', 60)
    if (err2) throw err2

    const { data: avgScore, error: err3 } = await supabase
      .from('scam_checks')
      .select('score')
    if (err3) throw err3

    const avg = avgScore.length
      ? avgScore.reduce((sum, r) => sum + r.score, 0) / avgScore.length
      : 0

    res.status(200).json({
      totalChecks: totalChecks?.length || 0,
      highRiskReports: highRisk?.length || 0,
      avgRiskScore: avg
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
}
