// /pages/api/checks/recent.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: req.headers.authorization || '' } } }
  );

  const { data, error } = await supabase
    .from('checks')
    .select('id, created_at, score, risk_level, red_flags')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ rows: data });
}
