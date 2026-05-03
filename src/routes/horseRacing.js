import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

console.log('✅ Router de Hípica (Versión Estructurada con Filtros de Precisión) cargado');

/* =========================================================
   🛠️ ENDPOINT DE DIAGNÓSTICO
   Uso: /api/horse-racing/debug-coordinates?track=gp&date=2026-05-02&page=1
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
   🚀 IMPORTACIÓN ESTRUCTURADA (VERSIÓN DEFINITIVA)
   Uso: /api/horse-racing/import-structured?track=gp&date=2026-05-02
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

      // 2. Extraer corredores con filtros de precisión
      const runners = [];
      rows.forEach((row, rowIndex) => {
        // Anclaje: Número del caballo en zona izquierda (x: 100-190)
        const numberToken = row.items.find(it => /^\d{1,2}$/.test(it.text) && it.x > 100 && it.x < 190);
        
        if (numberToken) {
          // 🔥 NOMBRE: Rango x: 180-240 y filtro estricto de texto (evita pesos/fechas)
          const nameTokens = row.items
            .filter(it => it.x > 180 && it.x < 240)
            .map(it => it.text)
            .filter(t => /^[A-Za-zÁÉÍÓÚÑáéíóúñ'.-]+$/.test(t));

          const horseName = nameTokens.join(' ').trim();
          
          if (horseName && horseName.length > 3) {
            // 🔥 ODDS: Formato N-N normalizado a N/N
            const nextRow = rows[rowIndex + 1];
            const oddsMatch = nextRow?.items.find(it => /^\d+[-/]\d+$/.test(it.text));
            const odds = oddsMatch ? oddsMatch.text.replace('-', '/') : "N/A";
            
            // JOCKEY: Rango x: 290-430 con limpieza de basura numérica
            const jockey = row.items
              .filter(it => it.x > 290 && it.x < 430)
              .map(it => it.text)
              .join(' ')
              .replace(/[0-9.,]/g, '')
              .trim() || "Unknown";
            
            // SPEED FIGURES: Rango x: > 520 y valores realistas (20-120)
            const speedFigures = row.items
              .filter(it => it.x > 520)
              .map(it => parseInt(it.text))
              .filter(n => !isNaN(n) && n > 20 && n < 120);

            runners.push({
              number: numberToken.text,
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
      // Protección: Solo analiza si existen carreras detectadas
      analysis: allRaces.length ? analyzeRace(allRaces[0]) : null
    });

  } catch (error) {
    console.error('❌ Error en el Parser Estructurado:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
