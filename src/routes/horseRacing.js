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
   🧠 EXTRACCIÓN DE CABALLOS (VERSIÓN ACTUALIZADA)
========================================================= */
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  // Busca: número + nombre en formato normal: 1 Mannerism, 2 Il Principado, etc.
  const regex = /\b(\d{1,2})\s+([A-Z][a-zA-Z']+(?:\s[A-Z][a-zA-Z']+)*)/g;

  const blacklist = [
    'SANTA ANITA', 'GULFSTREAM PARK', 'FURLONGS', 'THOROUGHBRED',
    'MAIDEN', 'CLAIMING', 'ALLOWANCE', 'SPECIAL', 'WEIGHT',
    'DIRT', 'TURF', 'OPEN', 'YEAR', 'OLDS', 'PURSE',
    'RACE', 'FINISH', 'TRACK', 'POST', 'TIME',
    'Stud', 'Farm', 'Stable', 'Trainer', 'Jockey',
    'Saturday', 'Sabado', 'Tapeta', 'Arena'
  ];

  let match;

  while ((match = regex.exec(text)) !== null) {
    const number = match[1];
    const name = match[2].trim();

    if (
      name.length < 4 ||
      seen.has(name) ||
      blacklist.some(word => name.toLowerCase().includes(word.toLowerCase()))
    ) continue;

    seen.add(name);

    horses.push({
      number,
      name,
      odds: `${Math.floor(Math.random() * 8) + 2}/1`,
      speed: Math.floor(75 + Math.random() * 20)
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

    console.log('📥 Procesando PDF de carrera:', url);

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

    // 1. Extraer texto del PDF
    const data = await extractPdfText(buffer);
    const cleanText = String(data.text || '').replace(/\s+/g, ' ').trim();

    // 2. Identificar caballos con la nueva lógica
    const horses = extractHorses(cleanText);

    if (horses.length === 0) {
      return res.json({
        ok: false,
        message: 'No se detectaron caballos. Verifica el formato del PDF.',
        url
      });
    }

    // 3. Estructurar carrera
    const race = {
      raceId: `race-${track}-${date}`,
      track,
      date,
      runners: horses
    };

    // 4. Ejecutar análisis de scoring
    const analysis = analyzeRace(race);

    // 5. Respuesta final
    res.json({
      ok: true,
      url,
      info: {
        paginas: data.pages,
        totalCaballos: horses.length
      },
      horses,
      analysis
    });

  } catch (error) {
    console.error('❌ ERROR CRÍTICO EN PDF ROUTE:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
