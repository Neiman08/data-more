import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

console.log('✅ Router de Hípica Estructurado (Rangos Calibrados) cargado');

/* =========================================================
   🛠️ ENDPOINT 1: DIAGNÓSTICO DE COORDENADAS
   Uso: /api/horse-racing/debug-coordinates?track=gp&date=2026-05-02&page=1
========================================================= */
router.get('/debug-coordinates', async (req, res) => {
  try {
    const { date, track, page = 1 } = req.query;
    if (!date || !track) throw new Error("Faltan parámetros: track y date.");

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('No se pudo descargar el PDF');

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

    tokens.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 5) return b.y - a.y;
      return a.x - b.x;
    });

    res.json({ ok: true, tokens: tokens.slice(0, 500) });
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
    if (!date || !track) throw new Error("Parámetros track y date obligatorios.");

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('PDF no encontrado en el servidor');

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

      // 1. Agrupar por líneas (Y) con margen de 5px
      const rows = [];
      tokens.forEach(token => {
        let row = rows.find(r => Math.abs(r.y - token.y) < 5);
        if (!row) {
          row = { y: token.y, items: [] };
          rows.push(row);
        }
        row.items.push(token);
      });

      rows.sort((a, b) => b.y - a.y);
      rows.forEach(r => r.items.sort((a, b) => a.x - b.x));

      // 2. Extraer corredores usando coordenadas calibradas (Ajuste Final)
      const runners = [];
      rows.forEach((row, rowIndex) => {
        const firstItem = row.items[0];
        
        // 🔥 NÚMERO DEL CABALLO: Rango x entre 130 y 180
        if (/^\d{1,2}$/.test(firstItem?.text) && firstItem.x > 130 && firstItem.x < 180) {
          
          // 🔥 NOMBRE: Rango x entre 170 y 260
          const horseName = row.items.find(it => it.x > 170 && it.x < 260)?.text;
          
          if (horseName) {
            // Odds: Buscamos en la fila de abajo en la misma columna izquierda
            const nextRow = rows[rowIndex + 1];
            const odds = nextRow?.items.find(it => it.x < 180 && it.text.includes('-'))?.text || "N/A";
            
            // 🔥 JOCKEY: Rango x entre 300 y 420
            const jockey = row.items.find(it => it.x > 300 && it.x < 420)?.text || "Unknown";
            
            // Speed Figures: zona de ratings a la derecha (x > 530)
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

    res.json({
      ok: true,
      url,
      totalRaces: allRaces.length,
      races: allRaces,
      analysis: allRaces.length ? analyzeRace(allRaces[0]) : null
    });

  } catch (error) {
    console.error('❌ Error en Proceso Estructurado:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
