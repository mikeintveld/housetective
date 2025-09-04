export function setCORS(res, origin = process.env.CORS_ORIGIN || '*') {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') {
    setCORS(res);
    return res.status(204).end();
  }
  return false; // not a preflight
}
