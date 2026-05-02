import express from 'express';
import { createRequire } from 'module';
import { analyzeRace } from '../utils/horseScoring.js';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
const pdf = pdfParseModule.default || pdfParseModule;

const router = express.Router();

const demoRaces = [
  {
    raceId: 'demo-1',
    track: 'Santa Anita Park',
    raceNumber: 1,
    runners: [
      { name: 'Fast Storm', odds: '3/1', speed: 91 },
      { name: 'Golden Pace', odds: '5/1', speed: 88 }
    ]
  }
];

router.get('/racecards', (req, res) => {
  res.json({ ok: true, races: demoRaces });
});

router.get('/analyze/:raceId', (req, res) => {
  const race = demoRaces.find(r => r.raceId === req.params.raceId);

  if (!race) {
    return res.status(404).json({ ok: false, error: 'No encontrado' });
  }

  res.json({ ok: true, analysis: analyzeRace(race) });
});

router.get('/program-url', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const track = String(req.query.track || 'sa').toLowerCase();

  res.json({
    ok: true,
    date,
    track,
    url: `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`
  });
});

router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();
    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).json({
        ok: false,
        error: 'PDF no encontrado'
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const data = await pdf(buffer);
    const cleanText = String(data.text || '').replace(/\s+/g, ' ').trim();

    res.json({
      ok: true,
      url,
      info: {
        paginas: data.numpages,
        caracteres: cleanText.length
      },
      textoExtraido: cleanText.substring(0, 5000)
    });

  } catch (error) {
    console.error('❌ Error procesando PDF:', error);
    res.status(500).json({
      ok: false,
      error: 'Error procesando PDF: ' + error.message
    });
  }
});

export default router;