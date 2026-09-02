/**
 * Alternatif proxy AI memakai Firebase Cloud Functions (Node 20, gen 2).
 * Pakai ini bila lebih suka satu atap dengan Firestore yang sudah dipakai.
 * Catatan: panggilan keluar ke OpenAI memerlukan paket Blaze (pay as you go).
 *
 * Letakkan sebagai functions/index.js, lalu:
 *   firebase functions:secrets:set OPENAI_API_KEY
 *   firebase deploy --only functions:aiProxy
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

const ALLOWED_ORIGINS = [
  'https://sofyanhsubekti-rgb.github.io',
  'http://localhost:8777',
  'http://localhost:8778',
];

const MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 3000;
const TEMPERATURE = 0.6;
const MAX_PROMPT_CHARS = 20000;

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

exports.aiProxy = onRequest(
  { secrets: [OPENAI_API_KEY], region: 'asia-southeast2', cors: false, maxInstances: 5 },
  async (req, res) => {
    const origin = req.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);

    if (allowed) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan metode POST.' });
    if (!allowed) return res.status(403).json({ error: 'Origin tidak diizinkan.' });

    const prompt = req.body && typeof req.body.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!prompt) return res.status(400).json({ error: 'Field "prompt" wajib diisi.' });
    if (prompt.length > MAX_PROMPT_CHARS) return res.status(413).json({ error: 'Prompt terlalu panjang.' });

    try {
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + OPENAI_API_KEY.value(),
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

      if (!upstream.ok) {
        return res.status(502).json({ error: 'Layanan AI menolak permintaan (' + upstream.status + ').' });
      }
      const data = await upstream.json();
      const content = data?.choices?.[0]?.message?.content || '';
      if (!content) return res.status(502).json({ error: 'Jawaban AI kosong.' });
      return res.status(200).json({ content });
    } catch (e) {
      console.error('aiProxy error:', e);
      return res.status(502).json({ error: 'Gagal menghubungi layanan AI.' });
    }
  }
);
