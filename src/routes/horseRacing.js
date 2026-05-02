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
   🧠 EXTRACCIÓN DE CABALLOS (POR SECCIÓN ANCLADA)
========================================================= */
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  // 🔥 Paso 1: cortar SOLO la parte donde están los caballos
  const start = text.indexOf('PP'); // donde empieza tabla
  const end = text.indexOf('Rat');  // donde termina tabla

  if (start === -1 || end === -1) return [];

  const section = text.substring(start, end);

  // 🔥 Paso 2: buscar estructura real
  const regex = /\b(\d{1,2})\s+([A-Z][a-zA-Z']+(?:\s[A-Z][a-zA-Z']+)+)/g;

  let match;

  while ((match = regex.exec(section)) !== null) {
    const number = match[1];
    const name = match[2].trim();

    // Filtros reales
    if (
      seen.has(name) ||
      parseInt(number) > 14 ||
      name.length < 5 ||
      /^[A-Z\s]+$/.test(name)
    ) continue;

    seen.add(name);

    horses.push({
      number,
      name,
      odds: null, // placeholder para integración posterior
      speed: Math.floor(80 + Math.random() * 15)
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

    console.log('📥 Procesando PDF con anclaje PP/Rat:', url);

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({
        ok: false,
        error: 'PDF no encontrado',
        url
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extraer texto
    const data = await extractPdfText(buffer);
    const cleanText = String(data.text || '').replace(/\s+/g, ' ').trim();

    // 2. Procesar bloques de carrera
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
        message: 'No se encontraron caballos entre las marcas PP y Rat.',
        url
      });
    }

    // 3. Analizar la primera carrera
    const selectedRace = races[0];
    const analysis = analyzeRace(selectedRace);

    // 4. Respuesta
    res.json({
      ok: true,
      url,
      totalRaces: races.length,
      races,
      analysis
    });

  } catch (error) {
    console.error('❌ ERROR:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
