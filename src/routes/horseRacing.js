import express from 'express';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

/* =========================================================
   🔥 COMPATIBILIDAD TOTAL PDF-PARSE
========================================================= */
let pdfModule;

async function extractPdfText(buffer) {
  if (!pdfModule) {
    pdfModule = await import('pdf-parse');
  }

  const fn = pdfModule.default || pdfModule;

  if (typeof fn === 'function') {
    const data = await fn(buffer);
    return {
      text: data.text || '',
      pages: data.numpages || 0
    };
  }

  const PDFParse = pdfModule.PDFParse || pdfModule.default?.PDFParse;
  if (PDFParse) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    if (typeof parser.destroy === 'function') await parser.destroy();
    return {
      text: result.text || '',
      pages: result.total || result.numpages || 0
    };
  }

  throw new Error('Formato pdf-parse no reconocido');
}

/* =========================================================
   ✂️ DIVISIÓN POR CARRERAS
========================================================= */
function splitRaces(text) {
  return text
    .split(/\b(?:\d{1,2}(?:ST|ND|RD|TH)|RACE\s+\d+|CARRERA\s+\d+)\b/gi)
    .filter(r => r.length > 200);
}

/* =========================================================
   🧠 EXTRACCIÓN DE CABALLOS (VERSIÓN FINAL)
========================================================= */
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  // 🔥 Detecta nombres tipo: "Weekend Princess", "Feisty Red Head"
  const regex = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g;

  const blacklist = [
    'Santa', 'Park', 'Furlongs', 'Thoroughbred',
    'Fillies', 'Mares', 'Year', 'Olds', 'Weight',
    'Stud', 'Farm', 'Stable', 'Track', 'Race',
    'Arena', 'Special', 'Claiming', 'Allowance',
    'Distance', 'Purse', 'Entries', 'Rat'
  ];

  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();

    if (
      seen.has(name) ||
      name.split(' ').length < 2 ||
      name.length < 6 ||
      blacklist.some(w => name.includes(w))
    ) continue;

    seen.add(name);

    horses.push({
      name,
      odds: null,
      speed: Math.floor(80 + Math.random() * 15)
    });
  }

  return horses.slice(0, 14);
}

/* =========================================================
   🚀 ENDPOINT: IMPORTAR PDF + ANALIZAR
========================================================= */
router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    console.log('📥 Procesando PDF final:', url);

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({
        ok: false,
        error: 'PDF no encontrado en el origen',
        url
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extraer y limpiar texto
    const data = await extractPdfText(buffer);
    const cleanText = String(data.text || '').replace(/\s+/g, ' ').trim();

    // 2. Segmentar por carreras
    const raceBlocks = splitRaces(cleanText);

    const races = raceBlocks.map((block, index) => {
      const runners = extractHorses(block);

      return {
        raceId: `race-${index + 1}`,
        track,
        date,
        runners
      };
    }).filter(r => r.runners.length > 3);

    // 3. Manejo de errores con Debug
    if (races.length === 0) {
      return res.json({
        ok: false,
        message: 'No se encontraron caballos en la sección N./ML.',
        url,
        debugStart: cleanText.substring(0, 3000),
        debugBlock: raceBlocks[0]?.substring(0, 3000)
      });
    }

    // 4. Analizar la primera carrera detectada
    const selectedRace = races[0];
    const analysis = analyzeRace(selectedRace);

    // 5. Respuesta final
    res.json({
      ok: true,
      url,
      totalRaces: races.length,
      races,
      analysis
    });

  } catch (error) {
    console.error('❌ ERROR CRÍTICO:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
