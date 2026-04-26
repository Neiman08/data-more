import express from 'express';

const router = express.Router();

// --- FUNCIONES AUXILIARES ---

function getBestProbability(analysis) {
  const awayProb = Number(analysis?.away?.modelWinPct || 0);
  const homeProb = Number(analysis?.home?.modelWinPct || 0);
  return Math.max(awayProb, homeProb);
}

function buildSuggestedTicket(analyses) {
  const picks = analyses
    .filter(a => a && a.pick)
    .map(a => ({
      gamePk: a.gamePk,
      matchup: a.matchup,
      pick: a.pick,
      market: 'Moneyline',
      confidence: a.confidence,
      probability: getBestProbability(a)
    }))
    .filter(p => {
      const conf = String(p.confidence || '').toLowerCase();
      return (
        (conf === 'alta' && p.probability >= 58) ||
        (conf === 'media' && p.probability >= 56)
      );
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4);

  return {
    ticketType: picks.length >= 3 ? 'Parlay sugerido' : 'Straight Bets',
    totalPicks: picks.length,
    picks,
    note: 'Ticket generado con los análisis reales de la fecha seleccionada.'
  };
}

function formatLineup(players) {
  return Object.values(players || {})
    .filter(p => p.battingOrder)
    .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))
    .map(p => ({
      battingOrder: p.battingOrder,
      order: p.battingOrder,
      name: p.person?.fullName || '',
      pos: p.position?.abbreviation || '',
      position: p.position?.abbreviation || '',
      batSide: p.batSide?.code || ''
    }));
}

// --- RUTAS ---

router.get('/', (req, res) => {
  res.send('BASEBALL ROUTE OK');
});

// Obtener juegos del día con pitchers
router.get('/games', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=probablePitcher`
    );

    const data = await response.json();

    const games = data.dates?.[0]?.games?.map(g => ({
      gamePk: g.gamePk,
      id: g.gamePk,
      date,
      status: g.status?.detailedState || 'Scheduled',
      gameDate: g.gameDate,
      homeTeam: g.teams?.home?.team?.name || '',
      awayTeam: g.teams?.away?.team?.name || '',
      // Mapeo directo para que el frontend reciba awayPitcher y homePitcher
      homePitcher: g.teams?.home?.probablePitcher?.fullName || 'TBD',
      awayPitcher: g.teams?.away?.probablePitcher?.fullName || 'TBD'
    })) || [];

    res.json({
      ok: true,
      date,
      count: games.length,
      games
    });

  } catch (error) {
    console.error('ERROR BASEBALL GAMES:', error.message);
    res.json({
      ok: false,
      error: error.message,
      games: []
    });
  }
});

// Lógica compartida para lineups
async function getLineupByGamePk(gamePk, res) {
  try {
    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`
    );

    const data = await response.json();

    const homeLineup = formatLineup(data?.teams?.home?.players);
    const awayLineup = formatLineup(data?.teams?.away?.players);

    res.json({
      ok: true,
      gamePk,
      homeTeam: data?.teams?.home?.team?.name || '',
      awayTeam: data?.teams?.away?.team?.name || '',
      homeLineup,
      awayLineup,
      home: homeLineup,
      away: awayLineup,
      homeConfirmed: homeLineup.length > 0,
      awayConfirmed: awayLineup.length > 0
    });

  } catch (error) {
    console.error('ERROR BASEBALL LINEUP:', error.message);
    res.json({
      ok: false,
      error: error.message,
      homeLineup: [],
      awayLineup: [],
      home: [],
      away: []
    });
  }
}

router.get('/lineup/:id', async (req, res) => {
  return getLineupByGamePk(req.params.id, res);
});

router.get('/lineups/:gamePk', async (req, res) => {
  return getLineupByGamePk(req.params.gamePk, res);
});

// Ruta para generar tickets inteligentes
router.get('/ticket', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

    const gamesRes = await fetch(`${baseUrl}/api/games?date=${encodeURIComponent(date)}`);
    const gamesData = await gamesRes.json();

    if (!gamesData.ok || !gamesData.games || !gamesData.games.length) {
      return res.json({
        ok: true,
        date,
        ticket: {
          ticketType: 'Sin ticket',
          totalPicks: 0,
          picks: [],
          note: `No hay juegos disponibles para ${date}.`
        }
      });
    }

    const analyses = [];

    for (const game of gamesData.games) {
      try {
        const analyzeRes = await fetch(
          `${baseUrl}/api/analyze/${game.gamePk}?date=${encodeURIComponent(date)}`
        );

        const analyzeData = await analyzeRes.json();

        if (analyzeData.ok && analyzeData.analysis) {
          analyses.push(analyzeData.analysis);
        }
      } catch (err) {
        console.log(`No se pudo analizar juego ${game.gamePk}:`, err.message);
      }
    }

    const ticket = buildSuggestedTicket(analyses);

    res.json({
      ok: true,
      date,
      gamesAnalyzed: analyses.length,
      ticket
    });

  } catch (error) {
    console.error('ERROR BASEBALL TICKET:', error.message);
    res.json({
      ok: false,
      error: error.message,
      ticket: {
        ticketType: 'Error',
        totalPicks: 0,
        picks: [],
        note: 'No se pudo generar el ticket.'
      }
    });
  }
});

// --- NUEVA RUTA PARA PLAYER PROPS ---
router.get('/player-props/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;

    res.json({
      ok: true,
      gamePk,
      message: 'Player props endpoint funcionando',
      props: []
    });

  } catch (error) {
    res.json({
      ok: false,
      error: error.message,
      props: []
    });
  }
});

export default router;
