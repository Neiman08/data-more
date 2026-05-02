import express from 'express';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

// --- LÓGICA DE PDF-PARSE (COMPATIBILIDAD) ---
let pdfModule;

async function extractPdfText(buffer) {
  if (!pdfModule) {
    pdfModule = await import('pdf-parse');
  }

  const fn = pdfModule.default || pdfModule;

  // Caso 1: Versión tradicional
  if (typeof fn === 'function') {
    const data = await fn(buffer);
    return {
      text: data.text || '',
      pages: data.numpages || 0
    };
  }

  // Caso 2: Versión basada en clases (PDFParse)
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

// --- NUEVA LÓGICA DE EXTRACCIÓN DE CABALLOS ---
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  // 🔥 Detecta: número (1-2 dígitos) + nombre del caballo (Palabras en Mayúsculas)
  const regex = /\b(\d{1,2})\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const number = match[1];
    const name = match[2].trim();

    // ❌ Filtros de validación y limpieza
    if (
      name.length < 4 ||
      seen.has(name) ||
      name.includes('Stud') ||
      name.includes('Farm') ||
      name.includes('Stable') ||
      name.includes('Trainer') ||
      name.includes('Jockey')
    ) continue;

    seen.add(name);

    horses.push({
      number,
      name,
      odds: `${Math.floor(Math.random() * 10) + 2}/1`, // Simulado por ahora
      speed: 75 + Math.random() * 20
    });
  }

  // Retornamos máximo 12 para evitar falsos positivos masivos
  return horses.slice(0, 12);
}

// --- RUTAS / ENDPOINTS ---

// Demo estática
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

// Importación y procesamiento REAL
router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();
    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    console.log('📥 Procesando PDF:', url);

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(404).json({ ok: false, error: 'PDF no encontrado', url });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extracción de texto
    const data = await extractPdfText(buffer);
    const cleanText = String(data.text || '').replace(/\s+/g, ' ').trim();

    // Procesar caballos con la nueva lógica
    const horses = extractHorses(cleanText);

    const race = {
      raceId: `real-${track}-${date}`,
      track: track,
      runners: horses
    };

    // Análisis final
    const analysis = analyzeRace(race);

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
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
