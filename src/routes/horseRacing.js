import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

/* =========================================================
   🛠️ ENDPOINT DE DIAGNÓSTICO (NUEVO)
   Objetivo: Ver la "radiografía" de coordenadas del PDF
========================================================= */
router.get('/debug-coordinates', async (req, res) => {
  try {
    const { date, track, page = 1 } = req.query;
    
    if (!date || !track) {
      return res.status(400).json({ ok: false, error: "Faltan parámetros: date y track son obligatorios." });
    }

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    console.log(`🔍 Diagnosticando coordenadas: ${url} (Página ${page})`);

    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo descargar el PDF.');

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // Cargar documento con PDF.js
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    
    const pageNum = parseInt(page);
    if (pageNum > pdf.numPages) throw new Error(`La página ${pageNum} no existe. Total: ${pdf.numPages}`);

    const pdfPage = await pdf.getPage(pageNum);
    const textContent = await pdfPage.getTextContent();

    // Extraer tokens con coordenadas exactas
    const debugTokens = textContent.items.map(item => ({
      text: item.str,
      x: parseFloat(item.transform[4].toFixed(2)),
      y: parseFloat(item.transform[5].toFixed(2)),
      width: parseFloat(item.width.toFixed(2)),
      height: parseFloat(item.height.toFixed(2))
    })).filter(item => item.text.trim() !== "");

    // Ordenar de arriba hacia abajo (Y descendente) y luego de izquierda a derecha (X ascendente)
    const sortedTokens = debugTokens.sort((a, b) => {
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
        totalTokens: sortedTokens.length
      },
      sample: sortedTokens.slice(0, 400) // Enviamos una muestra amplia para calibrar columnas
    });

  } catch (error) {
    console.error('❌ Error en Debug:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* =========================================================
   🚀 ENDPOINT ACTUAL: IMPORT-PROGRAM (TEXT-BASED)
   Se mantiene activo para compatibilidad mientras calibramos
========================================================= */
// ... (Aquí va tu código anterior de /import-program y las funciones extractHorses / splitRaces)

export default router;
