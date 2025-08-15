// api/checks/new.js
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { score, redFlags, riskLevel } = req.body
    if (typeof score !== 'number') {
      return res.status(400).json({ error: 'Invalid score' })
    }

    const { error } = await supabase
      .from('scam_checks')
      .insert([{ score, red_flags: redFlags || [], risk_level: riskLevel || 'unknown' }])

    if (error) throw error

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Server error' })
  }
}
