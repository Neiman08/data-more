import express from 'express';
import { analyzeRace } from '../utils/horseScoring.js';

const router = express.Router();

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

// Obtener todas las carreras (Demo)
router.get('/racecards', async (req, res) => {
  res.json({
    ok: true,
    source: 'free-demo-model',
    races: demoRaces
  });
});

// Analizar una carrera específica
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

// Generar URL del programa/revista PDF
router.get('/program-url', (req, res) => {
  // Si no viene fecha, usa la actual (YYYY-MM-DD)
  const date = req.query.date || new Date().toISOString().split('T')[0];
  // El hipódromo por defecto es 'sa' (Santa Anita)
  const track = String(req.query.track || 'sa').toLowerCase();

  const url = `http://eloasiss.com/descargas/revista/download/${date}/${track}.pdf`;

  res.json({
    ok: true,
    date,
    track,
    url
  });
});

export default router;
