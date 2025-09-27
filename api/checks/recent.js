// /pages/api/checks/recent.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { setCORS } from '../../../api/_cors'   // adjust path if needed

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setCORS(res) // <-- CORS headers for cross-origin dashboard

  if (req.method === 'OPTIONS') return res.status(204).end()

  // Prefer server env + service key on a server route to avoid RLS headaches
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await supabase
    .from('checks')
    .select('id, created_at, score, risk_level, red_flags')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return res.status(400).json({ error: error.message })
  return res.status(200).json({ rows: data })
}

