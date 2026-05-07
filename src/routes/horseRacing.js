import express from 'express';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyzeRace } from '../utils/horseModel.js';

const router = express.Router();

console.log('✅ Router de Hípica (Versión Pro: Parser Semi-Inteligente Blindado) cargado');

const TRACKS = [
  // HOY ACTIVOS (ya confirmados)
  { name: 'Louisiana Downs', code: 'lad' },
  { name: 'Mountaineer', code: 'mnr' },
  { name: 'Parx Racing', code: 'prx' },
  { name: 'Thistledown', code: 'tdn' },
  { name: 'Delta Downs', code: 'ded' },
  { name: 'Horseshoe Indianapolis', code: 'ind' },
  { name: 'Penn National', code: 'pen' },

  // PRINCIPALES USA
  { name: 'Gulfstream Park', code: 'gp' },
  { name: 'Churchill Downs', code: 'cd' },
  { name: 'Santa Anita Park', code: 'sa' },
  { name: 'Belmont Park', code: 'bel' },
  { name: 'Aqueduct', code: 'aqu' },
  { name: 'Keeneland', code: 'kee' },
  { name: 'Saratoga', code: 'sar' },
  { name: 'Del Mar', code: 'dmr' },

  // SECUNDARIOS / REGIONALES
  { name: 'Tampa Bay Downs', code: 'tam' },
  { name: 'Fair Grounds', code: 'fg' },
  { name: 'Oaklawn Park', code: 'op' },
  { name: 'Golden Gate Fields', code: 'gg' },
  { name: 'Laurel Park', code: 'lr' },
  { name: 'Pimlico', code: 'pim' },
  { name: 'Monmouth Park', code: 'mth' },
  { name: 'Delaware Park', code: 'del' },
  { name: 'Charles Town', code: 'ct' },
  { name: 'Remington Park', code: 'rp' },
  { name: 'Sam Houston', code: 'hou' },
  { name: 'Evangeline Downs', code: 'evd' },
  { name: 'Finger Lakes', code: 'fl' },
  { name: 'Prairie Meadows', code: 'prm' },
  { name: 'Hawthorne', code: 'haw' },
  { name: 'Canterbury Park', code: 'cbt' },
  { name: 'Will Rogers Downs', code: 'wr' },

  // HARNESS / MIXTOS
  { name: 'Meadowlands', code: 'med' },
  { name: 'Yonkers Raceway', code: 'yon' },
  { name: 'Hoosier Park', code: 'hoo' }
];

async function pdfExists(date, code) {
  const url = `http://eloasiss.com/descargas/revista/download/${date}/${code}.pdf`;

  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

router.get('/tracks', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        ok: false,
        error: 'Falta el parámetro date'
      });
    }

    const available = [];

    for (const track of TRACKS) {
      const exists = await pdfExists(date, track.code);

      if (exists) {
        available.push(track);
      }
    }

    res.json({
      ok: true,
      date,
      count: available.length,
      tracks: available
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      tracks: []
    });
  }
});

/* =========================================================
   📄 ENDPOINT: PROXY PDF (VISUALIZACIÓN)
========================================================= */
router.get('/pdf', async (req, res) => {
  try {
    const { date, track } = req.query;

    if (!date || !track) {
      return res.status(400).send('Faltan parámetros date y track');
    }

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).send('PDF no disponible todavía en el servidor de origen');
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');

    res.send(buffer);

  } catch (error) {
    console.error('❌ Error sirviendo PDF:', error);
    res.status(500).send('Error cargando PDF');
  }
});

/* =========================================================
   🛠️ ENDPOINT: DIAGNÓSTICO DE COORDENADAS
========================================================= */
router.get('/debug-coordinates', async (req, res) => {
  try {
    const { date, track, page = 1 } = req.query;

    if (!date || !track) {
      throw new Error("Parámetros track y date obligatorios.");
    }

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
    }))
    .filter(item => item.text.trim() !== "");

    tokens.sort((a, b) => b.y - a.y || a.x - b.x);

    res.json({
      ok: true,
      tokens: tokens.slice(0, 500)
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   🚀 ENDPOINT: IMPORTACIÓN ESTRUCTURADA + IA
========================================================= */
router.get('/import-structured', async (req, res) => {
  try {
    const { date, track } = req.query;

    if (!date || !track) {
      throw new Error("Parámetros track y date obligatorios.");
    }

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('PDF no encontrado en el servidor origen');
    }

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
      }))
      .filter(t => t.text !== "");

      const rows = [];

      tokens.forEach(token => {

        let row = rows.find(r => Math.abs(r.y - token.y) < 4);

        if (!row) {
          row = {
            y: token.y,
            items: []
          };

          rows.push(row);
        }

        row.items.push(token);
      });

      rows.sort((a, b) => b.y - a.y);

      rows.forEach(r =>
        r.items.sort((a, b) => a.x - b.x)
      );

      const runners = [];

      rows.forEach((row, rowIndex) => {

        const numberToken = row.items.find(it =>
          /^\d{1,2}$/.test(it.text) &&
          it.x > 5 &&
          it.x < 25
        );

        if (
          numberToken &&
          runners.find(r => r.number === numberToken.text)
        ) {
          return;
        }

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

        if (
          !numberToken ||
          !horseName ||
          horseName.length < 3
        ) {
          return;
        }

        const upperRows = rows.slice(
          Math.max(0, rowIndex - 6),
          rowIndex
        );

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
          : 'No data';

        const lowerRows = rows.slice(
          rowIndex + 1,
          rowIndex + 8
        );

        const oddsToken = lowerRows
          .flatMap(r => r.items)
          .find(it =>
            it.x > 5 &&
            it.x < 40 &&
            /\d+[-/]\d+$/.test(it.text)
          );

        const odds = oddsToken
          ? oddsToken.text.replace('-', '/')
          : 'N/A';

        const nearbyRows = rows.slice(
          Math.max(0, rowIndex - 4),
          rowIndex + 3
        );

        const speedFigures = nearbyRows
          .flatMap(r => r.items)
          .filter(it => it.x > 530)
          .map(it => parseInt(it.text))
          .filter(n =>
            !isNaN(n) &&
            n > 10 &&
            n < 130
          );

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
          date,
          runners
        });
      }
    }

    const racesWithAnalysis = allRaces.map(race => ({
      ...race,
      analysis: analyzeRace(race)
    }));

    res.json({
      ok: true,
      url,
      totalRaces: racesWithAnalysis.length,
      races: racesWithAnalysis
    });

  } catch (error) {

    console.error('❌ Error Crítico en el Parser:', error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;