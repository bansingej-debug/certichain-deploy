/* CertiChain AI server
 * Receives certificate images from the website, asks Claude to examine them, returns the JSON the site expects.
 * Needs Node 18+ (built-in fetch). No npm packages required.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  (required) your key from console.anthropic.com. Keep it only on the server.
 *   ALLOWED_ORIGIN     (recommended) your site, e.g. https://your-username.github.io  (use * only for testing)
 *   MODEL              (optional) default claude-sonnet-5-5
 *   PORT               (optional) default 3000
 *   RATE_PER_MIN       (optional) requests per IP per minute, default 15
 */
const http = require('http');

const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const PORT = +process.env.PORT || 3000;
const ORIGIN = process.env.ALLOWED_ORIGIN || '';
const RATE = +process.env.RATE_PER_MIN || 15;
const MAX_BODY = 15 * 1024 * 1024;   // 15 MB
const MAX_IMAGES = 5;

/* The instructions live here, not in the browser, so nobody can use your key for other purposes. */
const PROMPT = `You are a careful forensic document examiner. The images show one certificate or official document (degree, marksheet, transcript, ID, letter): the first is the whole page, any others are zoomed tiles of its top-left, top-right, bottom-left and bottom-right areas. Do these things.
1) Judge only concrete visible evidence of editing or forgery, such as inconsistent fonts or sizes within one line, text misaligned with its neighbours, cloned or pasted regions, mismatched backgrounds around text, spelling mistakes, or an obviously fake seal or signature. Do NOT penalise low resolution, compression, phone photos, screenshots, scan noise, shadows, unusual design or decorative fonts. If you see no concrete evidence of tampering, give high scores (80 or more) and leave anomalies empty. List an anomaly only when you can point to it.
2) Read the printed values exactly as written: student name, course or degree, grade or percentage, year, and institution. Use an empty string for anything you cannot read clearly. Never guess.
3) Set verdict to "fake" only when you see concrete evidence of editing or fabrication, or the page is not a certificate or official document at all. Otherwise set it to "original".
Return ONLY JSON: {"isCertificate":true or false,"verdict":"original" or "fake","looksGenuine":0-100,"checks":{"fonts":0-100,"seal":0-100,"layout":0-100,"tamperSigns":0-100},"anomalies":["short strings"],"summary":"one or two sentences","extracted":{"name":"","course":"","grade":"","year":"","institution":""}}. For every score, a higher number means more authentic.`;

const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 60000)) hits.delete(k);
  return arr.length > RATE;
}

function cors(req, res) {
  const o = req.headers.origin;
  if (ORIGIN === '*' || (ORIGIN && o === ORIGIN)) {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN === '*' ? '*' : o);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Files are too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseModelJson(text) {
  const clean = String(text).replace(/```json|```/g, '').trim();
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
  return JSON.parse(a >= 0 && b > a ? clean.slice(a, b + 1) : clean);
}

async function analyze(images) {
  const content = images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
  content.push({ type: 'text', text: PROMPT });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: 'user', content }] })
  });
  if (!r.ok) throw Object.assign(new Error('Claude API error ' + r.status), { code: 502 });
  const j = await r.json();
  const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  return parseModelJson(text);
}

async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || !/^\/analyze\/?$/.test(req.url)) return send(res, 404, { error: 'Not found' });
  const o = req.headers.origin;
  if (ORIGIN && ORIGIN !== '*' && o && o !== ORIGIN) return send(res, 403, { error: 'Origin not allowed' });
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  if (limited(ip)) return send(res, 429, { error: 'Too many requests. Try again in a minute.' });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 500, { error: 'Server is missing ANTHROPIC_API_KEY' });
  try {
    const body = JSON.parse(await readBody(req) || '{}');
    const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
    if (!images.length || !images.every(s => typeof s === 'string' && /^[A-Za-z0-9+/=]+$/.test(s))) return send(res, 400, { error: 'Send 1 to 5 base64 JPEG images in "images"' });
    send(res, 200, await analyze(images));
  } catch (e) {
    const code = e.code === 413 ? 413 : e.code === 502 ? 502 : e instanceof SyntaxError ? 502 : 500;
    send(res, code, { error: e.message || 'Server error' });
  }
}

module.exports = { handler, parseModelJson };
if (require.main === module) http.createServer(handler).listen(PORT, () => console.log('CertiChain AI server on port ' + PORT + ', model ' + MODEL));
