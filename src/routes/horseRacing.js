import express from 'express';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

/* =========================================================
   🔥 COMPATIBILIDAD TOTAL PDF-PARSE (TODAS VERSIONES)
========================================================= */
let pdfModule;

async function extractPdfText(buffer) {
  if (!pdfModule) {
    pdfModule = await import('pdf-parse');
  }

  const fn = pdfModule.default || pdfModule;

  // Caso 1: función directa
  if (typeof fn === 'function') {
    const data = await fn(buffer);
    return {
      text: data.text || '',
      pages: data.numpages || 0
    };
  }

  // Caso 2: nueva versión con clase
  const PDFParse = pdfModule.PDFParse || pdfModule.default?.PDFParse;

  if (PDFParse) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    if (typeof parser.destroy === 'function') {
      await parser.destroy();
    }

    return {
      text: result.text || '',
      pages: result.total || result.numpages || 0
    };
  }

  throw new Error('Formato pdf-parse no reconocido');
}

/* =========================================================
   🧠 EXTRACCIÓN REAL DE CABALLOS (BASADA EN "odds")
========================================================= */
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  // 🔥 ESTE ES EL PATRÓN CORRECTO DEL PDF
  const regex = /([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)\s+odds\s+(\d+\/\d+)/gi;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();
    const odds = match[2].trim();

    // ❌ FILTROS PARA LIMPIAR BASURA
    if (
      name.length < 4 ||
      seen.has(name) ||
      name.includes('FURLONGS') ||
      name.includes('THOROUGHBRED') ||
      name.includes('MAIDEN') ||
      name.includes('CLAIMING') ||
      name.includes('ALLOWANCE') ||
      name.includes('Tapeta') ||
      name.includes('Dirt') ||
      name.includes('Turf')
    ) continue;

    seen.add(name);

    horses.push({
      name,
      odds,
      speed: 75 + Math.random() * 20 // temporal
    });
  }

  return horses.slice(0, 12);
}

/* =========================================================
   🧪 DEMO
========================================================= */
router.get('/racecards', (req, res) => {
  res.json({
    ok: true,
    races: [
      {
        raceId: 'demo-1',
        track: 'Santa Anita Park',
        runners: [{ name: 'Fast Storm', odds: '3/1', speed: 91 }]
      }
    ]
  });
});

/* =========================================================
   🚀 IMPORTAR PDF + ANALIZAR
========================================================= */
router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    console.log('📥 Procesando PDF:', url);

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

    const cleanText = String(data.text || '')
      .replace(/\s+/g, ' ')
      .trim();

    // 2. Extraer caballos
    const horses = extractHorses(cleanText);

    // 3. Crear carrera
    const race = {
      raceId: `real-${track}-${date}`,
      track,
      runners: horses
    };

    // 4. Analizar
    const analysis = analyzeRace(race);

    // 5. Respuesta final
    res.json({
      ok: true,
      url,
      info: {
        paginas: data.pages,
        caballosDetectados: horses.length
      },
      horses,
      analysis
    });

  } catch (error) {
    console.error('❌ ERROR PDF:', error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;