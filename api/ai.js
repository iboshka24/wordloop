/**
 * Серверный прокси для WordLoop (Vercel Serverless Function).
 * Ключ хранится в переменных окружения Vercel и наружу в браузер не утекает:
 *   vercel env add OPENAI_API_KEY        (обязательно для серверного ИИ)
 *   vercel env add OPENAI_BASE_URL       (опционально, по умолчанию https://api.openai.com/v1)
 *   vercel env add OPENAI_MODEL          (опционально, по умолчанию gpt-4o-mini)
 *
 * Если ключ не задан, клиент автоматически использует браузерный ключ или бесплатный авто-перевод.
 */
const DEFAULT_BASE = 'https://api.openai.com/v1';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Health / status probe
  if (req.method === 'GET') {
    const base = (process.env.OPENAI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
    const model = process.env.OPENAI_MODEL || (/tokenharbor/i.test(base) ? 'claude-sonnet-4.6' : 'gpt-4o-mini');
    return res.status(200).json({
      status: 'ok',
      serverKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      model
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const authHeader = req.headers.authorization || '';
  const clientBearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  const bodyKey = (body && typeof body.apiKey === 'string') ? body.apiKey.trim() : '';
  const key = process.env.OPENAI_API_KEY || clientBearer || bodyKey;

  if (!key) {
    return res.status(501).json({
      code: 'no-key',
      error: 'OPENAI_API_KEY не задан в переменных окружения Vercel и не передан из браузера.'
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : null;

  if (!messages || !messages.length) {
    return res.status(400).json({ code: 'bad-request', error: 'Нужен массив messages.' });
  }

  const base = (body.baseUrl || process.env.OPENAI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
  const defaultModel = process.env.OPENAI_MODEL || (/tokenharbor/i.test(base) ? 'claude-sonnet-4.6' : 'gpt-4o-mini');
  const model = (typeof body.model === 'string' && body.model.trim()) || defaultModel;

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key
  };

  if (/openrouter\.ai/i.test(base)) {
    headers['HTTP-Referer'] = 'https://wordloop.vercel.app';
    headers['X-Title'] = 'WordLoop Flashcards';
  }

  try {
    const upstream = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.2
      }),
      signal: AbortSignal.timeout(30000)
    });

    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (!upstream.ok) {
      let msg = 'Upstream ' + upstream.status;
      try {
        const j = JSON.parse(text);
        msg = (j.error && (j.error.message || j.error)) || msg;
      } catch (e) {}
      return res.status(upstream.status).json({ error: msg });
    }

    let data = {};
    try { data = JSON.parse(text); } catch (e) {}
    const content = data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    return res.status(200).json({ text: content || '' });
  } catch (err) {
    return res.status(502).json({ error: 'Не удалось достучаться до API: ' + (err.message || err) });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
