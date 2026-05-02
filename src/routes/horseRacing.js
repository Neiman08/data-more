import express from 'express';
import pdf from 'pdf-parse';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

// Datos Demo (se mantienen igual)
const demoRaces = [
  {
    raceId: 'demo-1',
    track: 'Santa Anita Park',
    raceNumber: 1,
    time: '3:30 PM',
    surface: 'Dirt',
    distance: '6F',
    type: 'Allowance',
    runners: [
      { name: 'Fast Storm', form: '1-2-3', odds: '3/1', jockey: 'J. Hernandez', trainer: 'Baffert', speed: 91 },
      { name: 'Golden Pace', form: '2-1-4', odds: '5/1', jockey: 'R. Vazquez', trainer: 'Miller', speed: 88 },
      { name: 'Late Thunder', form: '4-3-1', odds: '6/1', jockey: 'F. Prat', trainer: 'Mandella', speed: 86 },
      { name: 'Blue Rocket', form: '5-2-2', odds: '8/1', jockey: 'M. Smith', trainer: 'O’Neill', speed: 82 }
    ]
  }
];

router.get('/racecards', (req, res) => res.json({ ok: true, races: demoRaces }));

router.get('/analyze/:raceId', (req, res) => {
  const race = demoRaces.find(r => r.raceId === req.params.raceId);
  if (!race) return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({ ok: true, analysis: analyzeRace(race) });
});

router.get('/program-url', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const track = String(req.query.track || 'sa').toLowerCase();
  res.json({ ok: true, url: `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf` });
});

// --- EL ENDPOINT ACTUALIZADO CON PARSER ---
router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();
    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    console.log('🚀 Iniciando extracción de texto de:', url);

    const response = await fetch(url);
    if (!response.ok) return res.status(404).json({ ok: false, error: 'PDF no encontrado' });

    // Convertimos a Buffer para pdf-parse
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extraer texto
    const data = await pdf(buffer);

    // Limpieza: Quitamos espacios dobles y saltos de línea innecesarios
    const cleanText = data.text.replace(/\s+/g, ' ').trim();

    res.json({
      ok: true,
      url,
      info: {
        paginas: data.numpages,
        caracteres: cleanText.length
      },
      // Mostramos una muestra más grande para analizar los patrones de los caballos
      rawText: cleanText.substring(0, 5000) 
    });

  } catch (error) {
    console.error('❌ Error en el Parser:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
