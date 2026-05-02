import express from 'express';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

// 🔥 Compatibilidad TOTAL con pdf-parse (todas versiones)
let pdfModule;

async function extractPdfText(buffer) {
  if (!pdfModule) {
    pdfModule = await import('pdf-parse');
  }

  const fn = pdfModule.default || pdfModule;

  // Caso 1: versión vieja (función directa)
  if (typeof fn === 'function') {
    const data = await fn(buffer);
    return {
      text: data.text || '',
      pages: data.numpages || 0
    };
  }

  // Caso 2: versión nueva (clase PDFParse)
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

  throw new Error('Formato de pdf-parse no reconocido');
}

/**
 * Función mejorada para extraer caballos con filtrado y control de duplicados
 */
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  const blacklist = [
    'Track', 'Park', 'Race', 'Trainer', 'Jockey',
    'Stud', 'Farm', 'LLC', 'Corp', 'Stable',
    'Santa', 'Allowance', 'Claiming'
  ];

  const regex = /([A-Z][a-zA-Z']+(?:\s[A-Z][a-zA-Z']+)+)\s+(\d+\/\d+)/g;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();
    const odds = match[2].trim();

    // ❌ Filtrar basura
    if (
      name.length < 5 ||
      blacklist.some(word => name.includes(word))
    ) continue;

    // ❌ Evitar duplicados
    if (seen.has(name)) continue;
    seen.add(name);

    horses.push({
      name,
      odds,
      speed: 75 + Math.random() * 20
    });
  }

  return horses.slice(0, 12);
}

// 🧪 DEMO DATA
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

// 📊 ENDPOINTS

router.get('/racecards', (req, res) => {
  res.json({
    ok: true,
    races: demoRaces
  });
});

router.get('/analyze/:raceId', (req, res) => {
  const race = demoRaces.find(r => r.raceId === req.params.raceId);

  if (!race) {
    return res.status(404).json({
      ok: false,
      error: 'Carrera no encontrada'
    });
  }

  res.json({
    ok: true,
    analysis: analyzeRace(race)
  });
});

// 🔗 GENERAR URL PDF
router.get('/program-url', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const track = String(req.query.track || 'sa').toLowerCase();

  res.json({
    ok: true,
    url: `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`
  });
});

// 🚀 IMPORTAR Y LEER PDF REAL
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

    // 🔥 Extracción de texto
    const data = await extractPdfText(buffer);

    const cleanText = String(data.text || '')
      .replace(/\s+/g, ' ')
      .trim();

    // 🐎 Extracción de caballos (Nueva Lógica)
    const horses = extractHorses(cleanText);

    // 🏁 Preparación para el análisis
    const race = {
      raceId: `real-${track}-${date}`,
      track: track,
      runners: horses
    };

    const analysis = analyzeRace(race);

    // ✅ RESPUESTA FINAL
    res.json({
      ok: true,
      url,
      track,
      info: {
        paginas: data.pages,
        caracteres: cleanText.length,
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
