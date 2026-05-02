import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

console.log('✅ Router de Hípica (Diagnóstico + Import) cargado');

/* =========================================================
   🛠️ ENDPOINT 1: DIAGNÓSTICO DE COORDENADAS
   Uso: /api/horse-racing/debug-coordinates?track=gp&date=2026-05-02&page=1
========================================================= */
router.get('/debug-coordinates', async (req, res) => {
  try {
    const { date, track, page = 1 } = req.query;
    
    if (!date || !track) {
      return res.status(400).json({ 
        ok: false, 
        error: "Faltan parámetros: date (YYYY-MM-DD) y track (ej: gp) son obligatorios." 
      });
    }

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    console.log(`🔍 Iniciando escaneo de coordenadas en: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`PDF no encontrado en: ${url}`);

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    const pageNum = parseInt(page);
    if (pageNum > pdf.numPages) throw new Error(`La página ${pageNum} no existe. Total: ${pdf.numPages}`);

    const pdfPage = await pdf.getPage(pageNum);
    const textContent = await pdfPage.getTextContent();

    const debugTokens = textContent.items.map(item => ({
      text: item.str,
      x: parseFloat(item.transform[4].toFixed(2)),
      y: parseFloat(item.transform[5].toFixed(2)),
      w: parseFloat(item.width.toFixed(2))
    })).filter(item => item.text.trim() !== "");

    // Ordenamos por Y (arriba a abajo) para que el JSON siga el flujo de lectura
    debugTokens.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
      return a.x - b.x;
    });

    res.json({
      ok: true,
      info: {
        track,
        date,
        page: pageNum,
        totalPages: pdf.numPages,
        totalTokens: debugTokens.length
      },
      tokens: debugTokens.slice(0, 500) // Primeros 500 tokens para calibración
    });

  } catch (error) {
    console.error('❌ Error en Debug:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* =========================================================
   🚀 ENDPOINT 2: IMPORT-PROGRAM (BASADO EN TEXTO PLANO)
   Uso: /api/horse-racing/import-program?track=gp&date=2026-05-02
========================================================= */
router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return res.status(404).json({ ok: false, error: 'PDF no encontrado', url });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extraer texto con pdf-parse (Lógica original)
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

    if (races.length === 0) {
      return res.json({
        ok: false,
        message: 'No se encontraron caballos válidos.',
        url,
        debugStart: cleanText.substring(0, 3000),
        debugBlock: raceBlocks[0]?.substring(0, 3000)
      });
    }

    const selectedRace = races[0];
    const analysis = analyzeRace(selectedRace);

    res.json({
      ok: true,
      url,
      totalRaces: races.length,
      races,
      analysis
    });

  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* =========================================================
   🧠 FUNCIONES DE APOYO (TEXT-BASED)
========================================================= */

async function extractPdfText(buffer) {
  let pdfModule = await import('pdf-parse');
  const fn = pdfModule.default || pdfModule;
  const data = await fn(buffer);
  return { text: data.text || '', pages: data.numpages || 0 };
}

function splitRaces(text) {
  return text
    .split(/\b(?:\d{1,2}(?:ST|ND|RD|TH)|RACE\s+\d+|CARRERA\s+\d+)\b/gi)
    .filter(r => r.length > 200);
}

function extractHorses(text) {
  const horses = [];
  const seen = new Set();
  const regex = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)\b/g;
  const blacklist = ['Santa', 'Park', 'Furlongs', 'Thoroughbred', 'Weight', 'Track', 'Race', 'Arena', 'Purse', 'Rat'];

  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();
    if (seen.has(name) || name.split(' ').length < 2 || name.length < 6 || blacklist.some(w => name.includes(w))) continue;
    seen.add(name);
    horses.push({
      name,
      odds: null,
      speed: Math.floor(80 + Math.random() * 15)
    });
  }
  return horses.slice(0, 14);
}

export default router;
