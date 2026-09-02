/**
 * Proxy AI untuk SGM Office (Cloudflare Workers)
 *
 * Tujuan: API key OpenAI disimpan sebagai secret di server, tidak pernah
 * ikut terkirim ke browser. Halaman hanya mengirim { prompt }, model dan
 * batas token ditentukan di sini.
 *
 * Secret yang wajib diset:  OPENAI_API_KEY
 * Binding opsional (rate limit): KV namespace bernama RATE
 */

const ALLOWED_ORIGINS = [
  'https://sofyanhsubekti-rgb.github.io',
  'http://localhost:8777',
  'http://localhost:8778',
];

// Ditentukan di server supaya tidak bisa diubah dari browser
const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 3000;
const TEMPERATURE = 0.6;
const MAX_PROMPT_CHARS = 20000;

// Rate limit per IP (hanya aktif bila KV namespace RATE di-bind)
// Satu kantor biasanya berbagi satu IP publik, jadi batas jangan terlalu ketat.
// Sekali menyusun laporan = 1 permintaan, dan hasilnya di-cache di browser.
const RATE_MAX = 60;        // maksimal permintaan
const RATE_WINDOW = 3600;   // per berapa detik

const SYSTEM_PROMPT = [
  'Kamu adalah Analis Keuangan Senior BPR (Bank Perkreditan Rakyat) dengan pengalaman 15+ tahun.',
  'Tugas: menyusun analisis laporan kinerja kantor kas dengan standar berikut:',
  '- Gunakan bahasa Indonesia formal dan profesional layaknya laporan resmi perbankan',
  '- Setiap poin analisis WAJIB mencantumkan data angka aktual dan perbandingan antar periode',
  '- Gunakan istilah perbankan yang tepat (NOA, NPL, kolektabilitas, DPK, outstanding, restrukturisasi, dll)',
  '- Berikan interpretasi terhadap kenaikan/penurunan data, bukan hanya menyebutkan angka',
  '- Sertakan implikasi bisnis dari setiap perubahan data',
  '- Format output: HTML murni dengan inline style, JANGAN gunakan markdown atau code block',
].join('\n');

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin || '') },
  });
}

async function underRateLimit(env, ip) {
  if (!env.RATE) return true; // KV belum di-bind: lewati pembatasan
  const key = 'rl:' + ip;
  const current = parseInt((await env.RATE.get(key)) || '0', 10);
  if (current >= RATE_MAX) return false;
  await env.RATE.put(key, String(current + 1), { expirationTtl: RATE_WINDOW });
  return true;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowed ? origin : '') });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Gunakan metode POST.' }, 405, allowed ? origin : '');
    }
    if (!allowed) {
      return json({ error: 'Origin tidak diizinkan.' }, 403, '');
    }
    if (!env.OPENAI_API_KEY) {
      return json({ error: 'Server belum dikonfigurasi: OPENAI_API_KEY kosong.' }, 500, origin);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'anon';
    if (!(await underRateLimit(env, ip))) {
      return json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, 429, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Body harus JSON.' }, 400, origin);
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return json({ error: 'Field "prompt" wajib diisi.' }, 400, origin);
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return json({ error: 'Prompt terlalu panjang.' }, 413, origin);
    }

    let upstream;
    try {
      upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + env.OPENAI_API_KEY,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS,
        }),
      });
    } catch (e) {
      return json({ error: 'Gagal menghubungi layanan AI.' }, 502, origin);
    }

    if (!upstream.ok) {
      // Jangan teruskan detail error upstream (bisa membocorkan info akun)
      let detail = '';
      try {
        const err = await upstream.json();
        detail = (err && err.error && err.error.type) || '';
      } catch (e) {}
      return json(
        { error: 'Layanan AI menolak permintaan (' + upstream.status + (detail ? ': ' + detail : '') + ').' },
        502,
        origin
      );
    }

    const data = await upstream.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    if (!content) {
      return json({ error: 'Jawaban AI kosong.' }, 502, origin);
    }
    return json({ content }, 200, origin);
  },
};
