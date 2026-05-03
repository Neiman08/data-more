import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

/* =========================================================
   🛠️ ENDPOINT DE DIAGNÓSTICO
========================================================= */
router.get('/debug-coordinates', async (req, res) => {
  try {
    const { date, track, page = 1 } = req.query;
    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const pdf = await pdfjs.getDocument({ data }).promise;
    const pdfPage = await pdf.getPage(parseInt(page));
    const textContent = await pdfPage.getTextContent();

    const tokens = textContent.items.map(item => ({
      text: item.str,
      x: parseFloat(item.transform[4].toFixed(2)),
      y: parseFloat(item.transform[5].toFixed(2))
    })).filter(item => item.text.trim() !== "");

    tokens.sort((a, b) => b.y - a.y || a.x - b.x);
    res.json({ ok: true, tokens: tokens.slice(0, 500) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* =========================================================
   🚀 IMPORTACIÓN ESTRUCTURADA (OPTIMIZADA)
========================================================= */
router.get('/import-structured', async (req, res) => {
  try {
    const { date, track } = req.query;
    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('PDF no encontrado');

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

      const runners = [];
      rows.forEach((row, rowIndex) => {
        // FLEXIBILIDAD: Buscamos cualquier token que sea un número en la zona izquierda
        const numberToken = row.items.find(it => /^\d{1,2}$/.test(it.text) && it.x > 100 && it.x < 190);
        
        if (numberToken) {
          // NOMBRE: Un poco más de margen a la izquierda (160 en adelante)
          const nameTokens = row.items
            .filter(it => it.x > 160 && it.x < 280)
            .map(it => it.text);
          const horseName = nameTokens.join(' ').trim();
          
          if (horseName && horseName.length > 3) {
            const nextRow = rows[rowIndex + 1];
            const odds = nextRow?.items.find(it => it.x < 190 && it.text.includes('-'))?.text || "N/A";
            
            const jockey = row.items
              .filter(it => it.x > 290 && it.x < 430)
              .map(it => it.text)
              .join(' ')
              .replace(/[0-9.,]/g, '')
              .trim() || "Unknown";
            
            const speedFigures = row.items
              .filter(it => it.x > 520)
              .map(it => parseInt(it.text))
              .filter(n => !isNaN(n) && n > 20 && n < 120);

            runners.push({
              number: numberToken.text,
              name: horseName,
              odds,
              jockey,
              speedFigures
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
    console.error('❌ Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
