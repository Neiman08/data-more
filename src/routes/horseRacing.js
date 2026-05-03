import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

console.log('✅ Router de Hípica (Versión Estructurada GP Final) cargado');

/* =========================================================
   🛠️ ENDPOINT DE DIAGNÓSTICO
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
      y: parseFloat(item.transform[5].toFixed(2))
    })).filter(item => item.text.trim() !== "");

    // Ordenamiento por flujo de lectura lógico
    tokens.sort((a, b) => b.y - a.y || a.x - b.x);

    res.json({ ok: true, tokens: tokens.slice(0, 500) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* =========================================================
   🚀 IMPORTACIÓN ESTRUCTURADA (VERSIÓN DEFINITIVA GP)
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

      // 1. Agrupar por líneas (Y) con margen de 4px
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

      // 2. Extraer corredores con los rangos calibrados para Gulfstream Park
      const runners = [];
      rows.forEach((row, rowIndex) => {
        
        // 🔥 NÚMERO (Anclaje central: x ~150)
        const numberToken = row.items.find(it => 
          /^\d{1,2}$/.test(it.text) && it.x > 140 && it.x < 165
        );
        
        if (numberToken) {
          // 🔥 NOMBRE (Ubicado a la izquierda del número: x ~34)
          const horseName = row.items.find(it => 
            it.x > 30 && it.x < 150 && 
            /^[A-Za-zÁÉÍÓÚÑáéíóúñ' .-]+$/.test(it.text)
          )?.text?.trim();
          
          if (horseName) {
            // ODDS (Normalización de formato debajo del nombre/número)
            const nextRow = rows[rowIndex + 1];
            const oddsMatch = nextRow?.items.find(it => /^\d+[-/]\d+$/.test(it.text) && it.x < 60);
            const odds = oddsMatch ? oddsMatch.text.replace('-', '/') : "N/A";
            
            // 🔥 JOCKEY (Ubicado a la derecha del número: x ~176)
            const jockey = row.items.find(it => 
              it.x > 170 && it.x < 230 && 
              /^[A-Za-zÁÉÍÓÚÑáéíóúñ. ]+$/.test(it.text)
            )?.text || "Unknown";
            
            // RATINGS / SPEED FIGURES (Zona derecha: x > 530)
            const speedFigures = row.items
              .filter(it => it.x > 500)
              .map(it => parseInt(it.text))
              .filter(n => !isNaN(n) && n > 10 && n < 130);

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
      analysis: allRaces.length ? analyzeRace(allRaces[0]) : null
    });

  } catch (error) {
    console.error('❌ Error en el Parser:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;