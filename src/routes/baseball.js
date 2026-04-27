import express from 'express';

const TEAM_ABBR = {
  "Boston Red Sox": "BOS",
  "Baltimore Orioles": "BAL",
  "New York Yankees": "NYY",
  "Toronto Blue Jays": "TOR",
  "Tampa Bay Rays": "TB",
  "Cleveland Guardians": "CLE",
  "Detroit Tigers": "DET",
  "Kansas City Royals": "KC",
  "Minnesota Twins": "MIN",
  "Chicago White Sox": "CWS",

  "Houston Astros": "HOU",
  "Texas Rangers": "TEX",
  "Seattle Mariners": "SEA",
  "Oakland Athletics": "OAK",
  "Los Angeles Angels": "LAA",

  "Atlanta Braves": "ATL",
  "Philadelphia Phillies": "PHI",
  "New York Mets": "NYM",
  "Miami Marlins": "MIA",
  "Washington Nationals": "WSH",

  "Chicago Cubs": "CHC",
  "St. Louis Cardinals": "STL",
  "Milwaukee Brewers": "MIL",
  "Cincinnati Reds": "CIN",
  "Pittsburgh Pirates": "PIT",

  "Los Angeles Dodgers": "LAD",
  "San Francisco Giants": "SF",
  "San Diego Padres": "SD",
  "Arizona Diamondbacks": "ARI",
  "Colorado Rockies": "COL"
};

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

// --- RUTA PARA PLAYER PROPS ---
router.get('/player-props/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;

    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`
    );

    const data = await response.json();

    const homeTeam = data?.teams?.home?.team?.name || '';
    const awayTeam = data?.teams?.away?.team?.name || '';

    const homePlayers = Object.values(data?.teams?.home?.players || {})
      .filter(p => p.battingOrder)
      .map(p => ({ ...p, team: homeTeam }));

    const awayPlayers = Object.values(data?.teams?.away?.players || {})
      .filter(p => p.battingOrder)
      .map(p => ({ ...p, team: awayTeam }));

    const players = [...homePlayers, ...awayPlayers];

    const props = players.map(p => {
      const name = p.person?.fullName || 'N/A';

      const hitChance = Math.floor(Math.random() * 40) + 40;
      const hrChance = Math.floor(Math.random() * 20) + 5;
      const rbiChance = Math.floor(Math.random() * 30) + 20;

      let rating = 'Baja';
      if (hitChance > 65) rating = 'Alta';
      else if (hitChance > 55) rating = 'Media';

      return {
        name,
        team: p.team,
        hitChance,
        hrChance,
        rbiChance,
        rating
      };
    });

    res.json({
      ok: true,
      gamePk,
      totalPlayers: props.length,
      props
    });

  } catch (error) {
    console.error('ERROR PLAYER PROPS:', error.message);
    res.json({
      ok: false,
      error: error.message,
      props: []
    });
  }
});

// --- LIVE SCORES PRO PARA TICKER Y CARDS ESPN STYLE ---
router.get('/live-scores', async (req, res) => {
  try {
    const response = await fetch(
      'https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore'
    );

    const data = await response.json();

    const games = data.dates?.[0]?.games?.map(g => {
      const linescore = g.linescore || {};
      const offense = linescore.offense || {};

      return {
        gamePk: g.gamePk,
        status: g.status?.detailedState || '',
        abstractState: g.status?.abstractGameState || '',

        inning: linescore.currentInning || '',
        inningOrdinal: linescore.currentInningOrdinal || '',
        inningState: linescore.inningState || '',
        outs: linescore.outs ?? 0,

        balls: linescore.balls ?? 0,
        strikes: linescore.strikes ?? 0,

        homeTeam: g.teams?.home?.team?.name || '',
        awayTeam: g.teams?.away?.team?.name || '',

        // Uso del mapa TEAM_ABBR para asegurar consistencia
        homeAbbrev: TEAM_ABBR[g.teams?.home?.team?.name] || '',
        awayAbbrev: TEAM_ABBR[g.teams?.away?.team?.name] || '',

        homeScore: g.teams?.home?.score ?? 0,
        awayScore: g.teams?.away?.score ?? 0,

        bases: {
          first: !!offense.first,
          second: !!offense.second,
          third: !!offense.third
        }
      };
    }) || [];

    res.json({
      ok: true,
      count: games.length,
      games
    });

  } catch (error) {
    console.error('ERROR LIVE SCORES:', error.message);

    res.json({
      ok: false,
      error: error.message,
      games: []
    });
  }
});

export default router;
