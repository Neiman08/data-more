import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

console.log('✅ Router de Hípica (Versión Pro: Parser Semi-Inteligente Blindado) cargado');

/* =========================================================
   🛠️ ENDPOINT DE DIAGNÓSTICO
========================================================= */
router.get('/debug-coordinates', async (req, res) => {
  try {
    const { date, track, page = 1 } = req.query;
    if (!date || !track) throw new Error("Parámetros track y date obligatorios.");

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const pdf = await pdfjs.getDocument({ data }).promise;
    
    const pageNum = parseInt(page);
    const pdfPage = await pdf.getPage(pageNum);
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
   🚀 IMPORTACIÓN ESTRUCTURADA (VERSION SEMI-INTELIGENTE)
========================================================= */
router.get('/import-structured', async (req, res) => {
  try {
    const { date, track } = req.query;
    if (!date || !track) throw new Error("Parámetros track y date obligatorios.");

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('PDF no encontrado en el servidor origen');

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

      // 1. Agrupar por líneas (Y)
      const rows = [];
      tokens.forEach(token => {
        let row = rows.find(r => Math.abs(r.y - token.y) < 4);
        if (!row) {
          row = { y: token.y, items: [] };
          rows.push(row);
        }
        row.items.push(token);
      });

      rows.sort((a, b) => b.y - a.y);
      rows.forEach(r => r.items.sort((a, b) => a.x - b.x));

      // 2. Extraer corredores con lógica de vecindad y anti-duplicados
      const runners = [];

      rows.forEach((row, rowIndex) => {
        // Número del caballo: (Anclaje x: 5-25)
        const numberToken = row.items.find(it =>
          /^\d{1,2}$/.test(it.text) && it.x > 5 && it.x < 25
        );

        // 🔥 CONTROL DE DUPLICADOS: Si el número ya fue procesado, saltamos la fila
        if (numberToken && runners.find(r => r.number === numberToken.text)) return;

        // NOMBRE (MULTI-TOKEN): Limpieza de Studs y prefijos
        const nameTokens = row.items
          .filter(it =>
            it.x > 30 &&
            it.x < 145 &&
            /^[A-Za-zÁÉÍÓÚÑáéíóúñ' .-]+$/.test(it.text) &&
            !it.text.startsWith('Stud') &&
            !it.text.startsWith('CA') &&
            !it.text.startsWith('CC') &&
            !it.text.startsWith('CT') &&
            !it.text.startsWith('p.')
          )
          .map(it => it.text);

        const horseName = nameTokens.join(' ').trim();

        if (!numberToken || !horseName || horseName.length < 3) return;

        // 🔥 JOCKEY: Escaneo de vecindad superior e incluye fila actual
        const upperRows = rows.slice(Math.max(0, rowIndex - 6), rowIndex);
        const jockeyToken = [...upperRows, row]
          .flatMap(r => r.items)
          .find(it =>
            it.x > 160 &&
            it.x < 260 &&
            /[A-Za-z]/.test(it.text) &&
            it.text.includes('.')
          );

        const jockey = jockeyToken
          ? jockeyToken.text.replace(/[0-9,]/g, '').trim()
          : null;

        // 🔥 ODDS: Escaneo de vecindad inferior
        const lowerRows = rows.slice(rowIndex + 1, rowIndex + 8);
        const oddsToken = lowerRows
          .flatMap(r => r.items)
          .find(it =>
            it.x > 5 &&
            it.x < 40 &&
            /\d+[-/]\d+$/.test(it.text)
          );

        const odds = oddsToken ? oddsToken.text.replace('-', '/') : 'N/A';

        // SPEED FIGURES: Tomar ratings cercanos
        const nearbyRows = rows.slice(Math.max(0, rowIndex - 4), rowIndex + 3);
        const speedFigures = nearbyRows
          .flatMap(r => r.items)
          .filter(it => it.x > 530)
          .map(it => parseInt(it.text))
          .filter(n => !isNaN(n) && n > 10 && n < 130);

        runners.push({
          number: numberToken.text,
          name: horseName,
          odds,
          jockey,
          speedFigures
        });
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
    console.error('❌ Error Crítico en el Parser:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;