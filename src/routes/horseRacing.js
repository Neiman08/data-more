import express from 'express';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

// --- CONFIGURACIÓN DE PDF-PARSE (COMPATIBILIDAD TOTAL) ---
let pdfModule;

async function extractPdfText(buffer) {
  if (!pdfModule) {
    pdfModule = await import('pdf-parse');
  }

  const fn = pdfModule.default || pdfModule;

  // Caso 1: Versión tradicional (función directa)
  if (typeof fn === 'function') {
    const data = await fn(buffer);
    return {
      text: data.text || '',
      pages: data.numpages || 0
    };
  }

  // Caso 2: Versión moderna (clase PDFParse)
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
 * Lógica de extracción: número del programa + nombre del caballo
 */
function extractHorses(text) {
  const horses = [];
  const seen = new Set();

  // 🔥 Detecta: número (1-2 dígitos) + nombre del caballo (Palabras en Mayúsculas)
  const regex = /\b(\d{1,2})\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*)/g;

  let match;

  while ((match = regex.exec(text)) !== null) {
    const number = match[1];
    const name = match[2].trim();

    // ❌ Filtros para evitar capturar entrenadores, studs o basura común
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
      odds: `${Math.floor(Math.random() * 10) + 2}/1`, // Simulado temporalmente
      speed: 75 + Math.random() * 20
    });
  }

  return horses.slice(0, 12);
}

// --- ENDPOINTS ---

/**
 * Endpoint de prueba con datos estáticos
 */
router.get('/racecards', (req, res) => {
  res.json({
    ok: true,
    races: [
      {
        raceId: 'demo-1',
        track: 'Santa Anita Park',
        runners: [
          { name: 'Fast Storm', odds: '3/1', speed: 91 },
          { name: 'Golden Pace', odds: '5/1', speed: 88 }
        ]
      }
    ]
  });
});

/**
 * Análisis de una carrera específica por ID
 */
router.get('/analyze/:raceId', (req, res) => {
  // Aquí normalmente buscarías en una DB, por ahora simulamos con el helper
  res.json({
    ok: true,
    message: "Análisis procesado"
  });
});

/**
 * Genera la URL de descarga basada en fecha y track
 */
router.get('/program-url', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const track = String(req.query.track || 'sa').toLowerCase();

  res.json({
    ok: true,
    url: `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`
  });
});

/**
 * IMPORTACIÓN REAL: Descarga el PDF, extrae texto y analiza
 */
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
        error: 'PDF no encontrado en el servidor externo',
        url
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extraer texto del PDF
    const data = await extractPdfText(buffer);

    // 2. Limpiar espacios y saltos de línea
    const cleanText = String(data.text || '').replace(/\s+/g, ' ').trim();

    // 3. Extraer caballos con la nueva lógica de RegEx
    const horses = extractHorses(cleanText);

    // 4. Estructurar para el motor de scoring
    const race = {
      raceId: `real-${track}-${date}`,
      track: track,
      runners: horses
    };

    const analysis = analyzeRace(race);

    // ✅ RESPUESTA CON DEBUG TEXT PARA AJUSTES
    res.json({
      ok: true,
      url,
      info: {
        paginas: data.pages,
        caracteres: cleanText.length,
        caballosDetectados: horses.length
      },
      debugText: cleanText.substring(0, 3000), // Muestra los primeros 3k caracteres
      horses,
      analysis
    });

  } catch (error) {
    console.error('❌ ERROR CRÍTICO EN PDF:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
