import express from 'express';
import pdf from 'pdf-parse';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

// Datos de ejemplo (Demo)
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

// 1. Obtener todas las carreras (Demo)
router.get('/racecards', async (req, res) => {
  res.json({
    ok: true,
    source: 'free-demo-model',
    races: demoRaces
  });
});

// 2. Analizar una carrera específica por ID
router.get('/analyze/:raceId', async (req, res) => {
  const race = demoRaces.find(r => r.raceId === req.params.raceId);

  if (!race) {
    return res.status(404).json({ ok: false, error: 'Carrera no encontrada' });
  }

  const analysis = analyzeRace(race);

  res.json({
    ok: true,
    race,
    analysis
  });
});

// 3. Generar URL del programa/revista PDF
router.get('/program-url', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const track = String(req.query.track || 'sa').toLowerCase();

  const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

  res.json({
    ok: true,
    date,
    track,
    url
  });
});

// 4. Importar y extraer texto del PDF (Procesamiento Real)
router.get('/import-program', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const track = String(req.query.track || 'sa').toLowerCase();

    const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

    console.log('📥 Descargando y procesando PDF:', url);

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).json({
        ok: false,
        error: 'PDF no encontrado'
      });
    }

    // Obtenemos el contenido del archivo
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extraemos el texto usando pdf-parse
    const data = await pdf(buffer);

    // Limpiamos el texto para que sea una sola línea continua y más fácil de leer
    const cleanText = data.text.replace(/\s+/g, ' ').trim();

    res.json({
      ok: true,
      url,
      info: {
        paginas: data.numpages,
        caracteresTotales: cleanText.length
      },
      // Enviamos los primeros 5000 caracteres para ver la estructura de los datos
      textoExtraido: cleanText.substring(0, 5000)
    });

  } catch (error) {
    console.error('❌ Error en el Parser:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
