import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, detectSessionInUrl: true } }
);

async function getUser() {
  const { data: u1 } = await supabase.auth.getUser();
  if (u1?.user) return u1.user;
  const { data: s } = await supabase.auth.getSession();
  return s?.session?.user ?? null;
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const htAuth = { supabase, getUser, authHeader };

if (typeof window !== 'undefined') {
  window.htAuth = htAuth;
}

export default htAuth;
