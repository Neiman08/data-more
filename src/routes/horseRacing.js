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
   🧠 EXTRACCIÓN REFINADA (NÚMERO + NOMBRE)
========================================================= */
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  // Regex: Detecta número seguido de nombre en MAYÚSCULAS
  const regex = /\b(\d{1,2})\s+([A-Z]{3,}(?:\s[A-Z]{3,})*)/g;

  // Filtros de ruido para evitar cabeceras y metadatos del programa
  const blacklist = [
    'FURLONGS', 'THOROUGHBRED', 'MAIDEN', 'CLAIMING', 'ALLOWANCE', 
    'SPECIAL', 'WEIGHT', 'DIRT', 'TURF', 'OPEN', 'YEAR', 'OLDS', 
    'PURSE', 'RACE', 'FINISH', 'TRACK', 'POST', 'TIME'
  ];

  let match;
  while ((match = regex.exec(text)) !== null) {
    const number = match[1];
    const name = match[2].trim();

    if (
      name.length < 4 || 
      seen.has(name) || 
      blacklist.some(word => name.includes(word))
    ) continue;

    seen.add(name);

    horses.push({
      number,
      name,
      odds: `${Math.floor(Math.random() * 8) + 2}/1`, // Simulado por ahora
      speed: Math.floor(75 + Math.random() * 20)      // Simulado por ahora
    });
  }

  return horses.slice(0, 14); // Límite estándar de competidores
}

/* =========================================================
   🚀 ENDPOINT: IMPORTAR PDF + ANALIZAR
========================================================= */
router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    console.log('📥 Descargando y procesando:', url);

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

    // 2. Identificar caballos
    const horses = extractHorses(cleanText);

    if (horses.length === 0) {
      return res.json({
        ok: false,
        message: 'No se detectaron caballos con el formato actual',
        debug: cleanText.substring(0, 200)
      });
    }

    // 3. Crear estructura de carrera
    const race = {
      raceId: `race-${track}-${date}`,
      track,
      date,
      runners: horses
    };

    // 4. Analizar con tu utilidad scoring
    const analysis = analyzeRace(race);

    // 5. Respuesta
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
    console.error('❌ ERROR CRÍTICO:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
