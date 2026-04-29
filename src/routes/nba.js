import express from 'express';
import { buildNBAAnalysis } from '../utils/nbaScoring.js';

const router = express.Router();

const NBA_API_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const cache = {};

/**
 * Obtiene la URL del logo oficial desde la CDN de ESPN
 */
function getLogo(teamName) {
  const map = {
    'Los Angeles Lakers': 'lal', 'Golden State Warriors': 'gsw', 'Boston Celtics': 'bos',
    'Miami Heat': 'mia', 'Chicago Bulls': 'chi', 'Milwaukee Bucks': 'mil',
    'Phoenix Suns': 'phx', 'Denver Nuggets': 'den', 'Dallas Mavericks': 'dal',
    'New York Knicks': 'nyk', 'Philadelphia 76ers': 'phi', 'Cleveland Cavaliers': 'cle',
    'Atlanta Hawks': 'atl', 'Brooklyn Nets': 'bkn', 'Toronto Raptors': 'tor',
    'Utah Jazz': 'uta', 'Sacramento Kings': 'sac', 'San Antonio Spurs': 'sas',
    'Houston Rockets': 'hou', 'Orlando Magic': 'orl', 'Indiana Pacers': 'ind',
    'Detroit Pistons': 'det', 'Washington Wizards': 'was', 'Charlotte Hornets': 'cha',
    'Minnesota Timberwolves': 'min', 'Oklahoma City Thunder': 'okc', 
    'New Orleans Pelicans': 'nop', 'Portland Trail Blazers': 'por', 
    'Los Angeles Clippers': 'lac', 'Memphis Grizzlies': 'mem'
  };

  const code = map[teamName];
  if (!code) return '/logo.png';

  return `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchAPI(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      return data;
    } catch {
      await sleep(1000);
    }
  }
  return null;
}

function formatGame(g) {
  return {
    gameId: g.idEvent,
    date: g.dateEvent,
    time: g.strTime || '',
    homeTeam: g.strHomeTeam,
    awayTeam: g.strAwayTeam,
    homeScore: g.intHomeScore ?? null,
    awayScore: g.intAwayScore ?? null,
    homeLogo: getLogo(g.strHomeTeam),
    awayLogo: getLogo(g.strAwayTeam),
    status: g.strStatus || 'Scheduled',
    league: 'NBA'
  };
}

async function getGames(date) {
  const key = `nba-${date}`;
  if (cache[key]) return cache[key];

  const url = `${NBA_API_BASE}/eventsday.php?d=${date}&l=NBA`;
  const data = await fetchAPI(url);

  // --- LÍNEA ACTUALIZADA AQUÍ ---
  if (!data || !data.events || data.events.length === 0) {
    return [
      {
        gameId: '1',
        date: date,
        time: '19:00',
        homeTeam: 'Los Angeles Lakers',
        awayTeam: 'Golden State Warriors',
        homeScore: null,
        awayScore: null,
        homeLogo: getLogo('Los Angeles Lakers'),
        awayLogo: getLogo('Golden State Warriors'),
        status: 'Scheduled',
        league: 'NBA'
      }
    ];
  }
  // -----------------------------

  const games = data.events.map(formatGame);
  cache[key] = games;

  return games;
}

async function getRecent(team) {
  const url = `${NBA_API_BASE}/searchevents.php?e=${encodeURIComponent(team)}`;
  const data = await fetchAPI(url);

  if (!data || !data.event) return [];

  return data.event
    .filter(e => e.intHomeScore !== null && e.intAwayScore !== null)
    .slice(0, 5)
    .map(e => ({
      strHomeTeam: e.strHomeTeam,
      strAwayTeam: e.strAwayTeam,
      intHomeScore: e.intHomeScore,
      intAwayScore: e.intAwayScore
    }));
}

async function analyzeGame(game) {
  const homeRecentEvents = await getRecent(game.homeTeam);
  const awayRecentEvents = await getRecent(game.awayTeam);

  const match = {
    matchId: game.gameId,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    matchup: `${game.awayTeam} vs ${game.homeTeam}`
  };

  return buildNBAAnalysis({
    match,
    homeRecentEvents,
    awayRecentEvents
  });
}

// ================= ROUTES =================

router.get('/nba-games', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const games = await getGames(date);
    res.json({ ok: true, games });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

router.get('/nba-analyze/:id', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const games = await getGames(date);
    const game = games.find(g => String(g.gameId) === req.params.id);

    if (!game) return res.json({ ok: false });

    const analysis = await analyzeGame(game);
    res.json({ ok: true, analysis });
  } catch {
    res.status(500).json({ ok: false });
  }
});

router.get('/nba-ticket', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const games = await getGames(date);

    const analyses = [];
    for (const g of games) {
      const a = await analyzeGame(g);
      if (a) analyses.push(a);
    }

    const picks = analyses
      .filter(a => a.probability >= 55)
      .sort((a, b) => b.probability - a.probability);

    res.json({
      ok: true,
      ticket: {
        seguro: picks.slice(0, 3),
        medio: picks.slice(0, 5),
        grande: picks.slice(0, 8)
      }
    });
  } catch {
    res.status(500).json({ ok: false });
  }
});

export default router;
