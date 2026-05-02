import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

console.log('✅ Router de Hípica Estructurado cargado correctamente');

/* =========================================================
   🛠️ ENDPOINT 1: DIAGNÓSTICO DE COORDENADAS
   Uso: /api/horse-racing/debug-coordinates?track=gp&date=2026-05-02&page=1
========================================================= */
router.get('/debug-coordinates', async (req, res) => {
  try {
    const { date, track, page = 1 } = req.query;
    if (!date || !track) throw new Error("Faltan parámetros date (YYYY-MM-DD) y track (ej: gp)");

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('PDF no encontrado en el servidor');

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const pdf = await pdfjs.getDocument({ data }).promise;
    
    const pageNum = parseInt(page);
    const pdfPage = await pdf.getPage(pageNum);
    const textContent = await pdfPage.getTextContent();

    const tokens = textContent.items.map(item => ({
      text: item.str,
      x: parseFloat(item.transform[4].toFixed(2)),
      y: parseFloat(item.transform[5].toFixed(2)),
      w: parseFloat(item.width.toFixed(2))
    })).filter(item => item.text.trim() !== "");

    // Ordenar para lectura lógica: Y descendente, luego X ascendente
    tokens.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
      return a.x - b.x;
    });

    res.json({
      ok: true,
      info: { track, date, page: pageNum, totalPages: pdf.numPages },
      tokens: tokens.slice(0, 500) 
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* =========================================================
   🚀 ENDPOINT 2: IMPORTACIÓN ESTRUCTURADA (PRO)
   Uso: /api/horse-racing/import-structured?track=gp&date=2026-05-02
========================================================= */
router.get('/import-structured', async (req, res) => {
  try {
    const { date, track } = req.query;
    if (!date || !track) throw new Error("Parámetros track y date obligatorios");

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo descargar el PDF del servidor remoto');

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const pdf = await pdfjs.getDocument({ data }).promise;

    const allRaces = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const tokens = textContent.items.map(item => ({
        text: item.str.trim(),
        x: item.transform[4],
        y: item.transform[5]
      })).filter(t => t.text !== "");

      // 1. Agrupar por filas (Y) con margen de error de 5px
      const rows = [];
      tokens.forEach(token => {
        let row = rows.find(r => Math.abs(r.y - token.y) < 5);
        if (!row) {
          row = { y: token.y, items: [] };
          rows.push(row);
        }
        row.items.push(token);
      });

      // Ordenar filas y elementos internos
      rows.sort((a, b) => b.y - a.y);
      rows.forEach(r => r.items.sort((a, b) => a.x - b.x));

      // 2. Extraer corredores usando los rangos de coordenadas validados
      const runners = [];
      rows.forEach((row, rowIndex) => {
        const firstItem = row.items[0];
        
        // El número del caballo está en el extremo izquierdo (x < 20)
        if (/^\d{1,2}$/.test(firstItem?.text) && firstItem.x < 20) {
          
          // Nombre del caballo: rango x entre 30 y 150
          const horseName = row.items.find(it => it.x > 30 && it.x < 150)?.text;
          
          if (horseName) {
            // Odds: Buscamos en la fila de abajo (rowIndex + 1) en la misma zona izquierda
            const nextRow = rows[rowIndex + 1];
            const odds = nextRow?.items.find(it => it.x < 30 && it.text.includes('-'))?.text || "N/A";
            
            // Jockey: rango x entre 170 y 250
            const jockey = row.items.find(it => it.x > 170 && it.x < 250)?.text || "Unknown";
            
            // Speed Figures: zona derecha de la tabla (x > 530)
            const speedFigures = row.items
              .filter(it => it.x > 530)
              .map(it => parseInt(it.text))
              .filter(n => !isNaN(n));

            runners.push({
              number: firstItem.text,
              name: horseName,
              odds: odds,
              jockey: jockey,
              speedFigures: speedFigures
            });
          }
        }
      });

      if (runners.length > 0) {
        allRaces.push({
          raceNumber: i,
          track: track.toUpperCase(),
          date: date,
          runners: runners
        });
      }
    }

    // 3. Respuesta final con protección para el análisis
    res.json({
      ok: true,
      url,
      totalRaces: allRaces.length,
      races: allRaces,
      // Solo ejecutamos analyzeRace si hay datos para evitar que el servidor caiga
      analysis: allRaces.length ? analyzeRace(allRaces[0]) : null
    });

  } catch (error) {
    console.error('❌ Error en Proceso Estructurado:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
