import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseModel.js';

const router = express.Router();

console.log('✅ Router de Hípica cargado');

// TRACKS DINÁMICOS
const TRACKS = [
  { name: 'Louisiana Downs', code: 'lad' },
  { name: 'Mountaineer', code: 'mnr' },
  { name: 'Parx Racing', code: 'prx' },
  { name: 'Thistledown', code: 'tdn' }
];

// 🔍 Detectar qué hipódromos tienen PDF hoy
router.get('/tracks', async (req, res) => {
  const { date } = req.query;

  const available = [];

  for (const t of TRACKS) {
    try {
      const url = `http://eloasiss.com/descargas/revista/download/${date}/${t.code}.pdf`;
      const r = await fetch(url, { method: 'HEAD' });

      if (r.ok) available.push(t);
    } catch {}
  }

  res.json({
    ok: true,
    tracks: available
  });
});

// 📄 PDF
router.get('/pdf', async (req, res) => {
  const { date, track } = req.query;

  const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
  const response = await fetch(url);

  if (!response.ok) {
    return res.status(404).send('PDF no encontrado');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  res.setHeader('Content-Type', 'application/pdf');
  res.send(buffer);
});

// 🚀 IMPORT STRUCTURED
router.get('/import-structured', async (req, res) => {
  try {
    const { date, track } = req.query;

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('PDF no encontrado en el servidor origen');
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true
    }).promise;

    const races = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();

      const tokens = text.items.map(t => t.str.trim()).filter(Boolean);

      // 🔥 Simplificado (funciona mejor que el complejo roto)
      const runners = tokens
        .filter(t => /^[A-Za-z]/.test(t))
        .slice(0, 10)
        .map((name, idx) => ({
          number: idx + 1,
          name,
          odds: 'N/A',
          jockey: 'N/A',
          speedFigures: []
        }));

      if (runners.length) {
        races.push({
          raceNumber: i,
          track,
          date,
          runners,
          analysis: analyzeRace({
            runners
          })
        });
      }
    }

    res.json({
      ok: true,
      races
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

export default router;