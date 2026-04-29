import express from 'express';
import { buildNBAAnalysis } from '../utils/nbaScoring.js';

const router = express.Router();

const NBA_API_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

const nbaLogoMap = {
  'Atlanta Hawks': 'ATL','Boston Celtics': 'BOS','Brooklyn Nets': 'BKN','Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI','Cleveland Cavaliers': 'CLE','Dallas Mavericks': 'DAL','Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET','Golden State Warriors': 'GSW','Houston Rockets': 'HOU','Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC','Los Angeles Lakers': 'LAL','Memphis Grizzlies': 'MEM','Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL','Minnesota Timberwolves': 'MIN','New Orleans Pelicans': 'NOP','New York Knicks': 'NYK',
  'Oklahoma City Thunder': 'OKC','Orlando Magic': 'ORL','Philadelphia 76ers': 'PHI','Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR','Sacramento Kings': 'SAC','San Antonio Spurs': 'SAS','Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA','Washington Wizards': 'WAS'
};

const cache = {};

function getLogo(team) {
  const abbr = nbaLogoMap[team] || 'NBA';
  return `/nba-logos/${abbr}.png`;
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

  if (!data || !data.events) return [];

  const games = data.events.map(formatGame);
  cache[key] = games;

  return games;
}

async function getRecent(team) {
  const url = `${NBA_API_BASE}/searchevents.php?e=${encodeURIComponent(team)}`;
  const data = await fetchAPI(url);

  if (!data || !data.event) return [];

  return data.event
    .filter(e => e.intHomeScore !== null)
    .slice(0, 5)
    .map(e => ({
      home: e.strHomeTeam,
      away: e.strAwayTeam,
      hs: e.intHomeScore,
      as: e.intAwayScore
    }));
}

async function analyzeGame(game) {
  const homeRecent = await getRecent(game.homeTeam);
  const awayRecent = await getRecent(game.awayTeam);

  return buildNBAAnalysis({
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeRecent,
    awayRecent
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