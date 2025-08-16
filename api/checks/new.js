// /pages/api/checks/new.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,        // anon key so RLS applies
    { global: { headers: { Authorization: req.headers.authorization || '' } } } // Bearer <JWT>
  );

  const { score, red_flags = [], top_signals = [], advice = [], recommendation = '', notes = '' } = req.body || {};
  if (typeof score !== 'number') return res.status(400).json({ error: 'Score must be a number' });

  const { data, error } = await supabase
    .from('checks')
    .insert([{ score, red_flags, top_signals, advice, recommendation, notes }])
    .select('*')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ ok: true, row: data });
}



