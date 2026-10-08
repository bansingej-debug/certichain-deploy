// Vercel serverless function: POST /api/analyze
// Receives certificate images from the CertiChain page, asks Claude to examine them,
// and returns the JSON verdict the page expects. The API key stays here, never in the page.
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   ANTHROPIC_API_KEY  required
//   ALLOWED_ORIGINS    required, comma separated, e.g. https://yourname.github.io
//   CLAUDE_MODEL       optional, default claude-sonnet-5-5

const PROMPT = "You are a careful forensic document examiner. The images show one certificate or official document (degree, marksheet, transcript, ID, letter): the first is the whole page, any others are zoomed tiles of its top-left, top-right, bottom-left and bottom-right areas. Do two things.\n1) Judge only concrete visible evidence of editing or forgery, such as inconsistent fonts or sizes within one line, text misaligned with its neighbours, cloned or pasted regions, mismatched backgrounds around text, spelling mistakes, or an obviously fake seal or signature. Do NOT penalise low resolution, compression, phone photos, screenshots, scan noise, shadows, unusual design or decorative fonts. If you see no concrete evidence of tampering, give high scores (80 or more) and leave anomalies empty. List an anomaly only when you can point to it.\n2) Read the printed values exactly as written: student name, course or degree, grade or percentage, year, and institution. Use an empty string for anything you cannot read clearly. Never guess.\n3) Set verdict to \"fake\" only when you see concrete evidence of editing or fabrication, or the page is not a certificate or official document at all. Otherwise set it to \"original\".\nReturn ONLY JSON: {\"isCertificate\":true or false,\"verdict\":\"original\" or \"fake\",\"looksGenuine\":0-100,\"checks\":{\"fonts\":0-100,\"seal\":0-100,\"layout\":0-100,\"tamperSigns\":0-100},\"anomalies\":[\"short strings\"],\"summary\":\"one or two sentences\",\"extracted\":{\"name\":\"\",\"course\":\"\",\"grade\":\"\",\"year\":\"\",\"institution\":\"\"}}. For every score, a higher number means more authentic.";

const MAX_IMAGES = 5;
const MAX_B64_CHARS = 2_000_000; // per image, about 1.5 MB
const hits = new Map(); // best-effort rate limit, resets when the function instance restarts

function allowed(origin) {
  const list = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.includes(origin);
}

function limited(ip) {
  const now = Date.now(), win = 60_000, max = 12;
  const arr = (hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (allowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  if (!allowed(origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many checks. Wait a minute and try again.' });

  const images = req.body && req.body.images;
  if (!Array.isArray(images) || !images.length || images.length > MAX_IMAGES ||
      images.some(i => typeof i !== 'string' || !i.length || i.length > MAX_B64_CHARS || !/^[A-Za-z0-9+/=]+$/.test(i))) {
    return res.status(400).json({ error: 'Send 1 to ' + MAX_IMAGES + ' base64 JPEG images' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            ...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
            { type: 'text', text: PROMPT }
          ]
        }]
      })
    });
    if (!r.ok) return res.status(502).json({ error: 'AI provider error ' + r.status });
    const out = await r.json();
    const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    if (start < 0 || end < 0) return res.status(502).json({ error: 'AI returned no JSON' });
    return res.status(200).json(JSON.parse(clean.slice(start, end + 1)));
  } catch (e) {
    return res.status(502).json({ error: 'Could not read the AI answer' });
  }
}
