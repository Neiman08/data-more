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
   ✂️ DIVISIÓN POR CARRERAS (ACTUALIZADA: SOPORTE ORDINALES)
========================================================= */
function splitRaces(text) {
  return text
    .split(/\b(?:\d{1,2}(?:ST|ND|RD|TH)|RACE\s+\d+|CARRERA\s+\d+)\b/gi)
    .filter(r => r.length > 200);
}

/* =========================================================
   🧠 EXTRACCIÓN DE CABALLOS (CONTEXTO REAL)
========================================================= */
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  // 🔥 Busca líneas típicas de caballos (estructura real del programa)
  const regex = /(\d{1,2})\s+([A-Z][a-zA-Z']+(?:\s[A-Z][a-zA-Z']+)+)/g;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const number = match[1];
    const name = match[2].trim();

    // 🔥 FILTRO INTELIGENTE (CRÍTICO)
    if (
      seen.has(name) ||
      name.length < 6 || // caballos reales casi siempre > 1 palabra
      name.split(' ').length < 2 || // mínimo 2 palabras
      /^[A-Z\s]+$/.test(name) // elimina palabras tipo STATE, STAKE
    ) continue;

    seen.add(name);

    horses.push({
      number,
      name,
      odds: `${Math.floor(Math.random() * 8) + 2}/1`,
      speed: Math.floor(75 + Math.random() * 20)
    });
  }

  return horses;
}

/* =========================================================
   🚀 ENDPOINT: IMPORTAR PDF + ANALIZAR
========================================================= */
router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    console.log('📥 Procesando PDF por bloques de carrera:', url);

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({
        ok: false,
        error: 'No se pudo obtener el PDF del servidor remoto',
        url
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extraer texto completo
    const data = await extractPdfText(buffer);
    const cleanText = String(data.text || '').replace(/\s+/g, ' ').trim();

    // 2. Extraer caballos por cada carrera detectada
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

    if (races.length === 0) {
      return res.json({
        ok: false,
        message: 'No se detectaron bloques de carrera válidos.',
        url
      });
    }

    // 3. Analizar SOLO la primera carrera (por ahora)
    const selectedRace = races[0];
    const analysis = analyzeRace(selectedRace);

    // 4. Respuesta final
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
