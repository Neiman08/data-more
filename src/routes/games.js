import express from 'express';
import { buildGameAnalysis } from '../utils/scoring.js';

const router = express.Router();

const MLB_API = 'https://statsapi.mlb.com/api/v1';
const ODDS_API = 'https://api.the-odds-api.com/v4/sports/baseball_mlb/odds';

function num(value) {
  if (value === undefined || value === null || value === '-') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function parseInnings(ip) {
  if (!ip) return 0;

  const [whole, frac] = String(ip).split('.');
  let innings = Number(whole || 0);

  if (frac === '1') innings += 1 / 3;
  if (frac === '2') innings += 2 / 3;

  return innings;
}

function normalizeTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function findOddsForGame(oddsData, awayTeam, homeTeam) {
  if (!Array.isArray(oddsData)) return null;

  const away = normalizeTeamName(awayTeam);
  const home = normalizeTeamName(homeTeam);

  return oddsData.find(o => {
    const oAway = normalizeTeamName(o.away_team);
    const oHome = normalizeTeamName(o.home_team);

    return (
      (oAway.includes(away) || away.includes(oAway)) &&
      (oHome.includes(home) || home.includes(oHome))
    );
  }) || null;
}

async function fetchOdds() {
  if (!process.env.ODDS_API_KEY) {
    console.log('Falta ODDS_API_KEY en .env');
    // CAMBIO: Ahora devuelve null en lugar de []
    return null;
  }

  const region = process.env.ODDS_REGION || 'us';
  const markets = process.env.ODDS_MARKETS || 'h2h,spreads,totals';

  const url =
    `${ODDS_API}?apiKey=${process.env.ODDS_API_KEY}` +
    `&regions=${region}` +
    `&markets=${markets}` +
    `&oddsFormat=american`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    console.log('Odds API error:', data);
    // CAMBIO: Ahora devuelve null en lugar de []
    return null;
  }

  console.log('🔥 ODDS ENCONTRADAS:', data.length);

  return data;
}

async function fetchSchedule(date) {
  const url = `${MLB_API}/schedule?sportId=1&date=${date}&hydrate=probablePitcher`;
  const res = await fetch(url);
  const data = await res.json();

  const games = data.dates?.[0]?.games || [];

  return games.map(game => ({
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    status: game.status?.detailedState || 'N/D',

    awayTeam: game.teams.away.team.name,
    homeTeam: game.teams.home.team.name,

    awayTeamId: game.teams.away.team.id,
    homeTeamId: game.teams.home.team.id,

    awayProbablePitcher: game.teams.away.probablePitcher?.fullName || null,
    homeProbablePitcher: game.teams.home.probablePitcher?.fullName || null,

    awayProbablePitcherId: game.teams.away.probablePitcher?.id || null,
    homeProbablePitcherId: game.teams.home.probablePitcher?.id || null,

    rawGame: game
  }));
}

async function fetchTeamHitting(teamId) {
  if (!teamId) return null;

  const url = `${MLB_API}/teams/${teamId}/stats?stats=season&group=hitting`;
  const res = await fetch(url);
  const data = await res.json();

  const stat = data.stats?.[0]?.splits?.[0]?.stat;
  if (!stat) return null;

  return {
    gamesPlayed: num(stat.gamesPlayed) || 0,
    runs: num(stat.runs) || 0,
    avg: num(stat.avg) || 0.250,
    obp: num(stat.obp) || 0.320,
    slg: num(stat.slg) || 0.400,
    ops: num(stat.ops) || 0.720
  };
}

async function fetchPitcherStats(playerId) {
  if (!playerId) return null;

  const url = `${MLB_API}/people/${playerId}/stats?stats=season&group=pitching`;
  const res = await fetch(url);
  const data = await res.json();

  const stat = data.stats?.[0]?.splits?.[0]?.stat;
  if (!stat) return null;

  return {
    era: num(stat.era) || 4.20,
    whip: num(stat.whip) || 1.30,
    inningsPitched: parseInnings(stat.inningsPitched),
    strikeOuts: num(stat.strikeOuts) || 0,
    baseOnBalls: num(stat.baseOnBalls) || 0,
    gamesStarted: num(stat.gamesStarted) || 0
  };
}

// Rutas actualizadas
router.get('/games', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const [games, oddsData] = await Promise.all([
      fetchSchedule(date),
      fetchOdds()
    ]);

    const gamesWithOdds = games.map(game => ({
      gamePk: game.gamePk,
      gameDate: game.gameDate,
      status: game.status,

      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,

      awayProbablePitcher: game.awayProbablePitcher,
      homeProbablePitcher: game.homeProbablePitcher,

      // CAMBIO: Validación ternaria para findOddsForGame
      odds: oddsData
        ? findOddsForGame(oddsData, game.awayTeam, game.homeTeam)
        : null
    }));

    res.json({
      ok: true,
      date,
      count: gamesWithOdds.length,
      games: gamesWithOdds
    });

  } catch (error) {
    console.error('ERROR /games:', error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/analyze/:gamePk', async (req, res) => {
  try {
    const gamePk = Number(req.params.gamePk);
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const [games, oddsData] = await Promise.all([
      fetchSchedule(date),
      fetchOdds()
    ]);

    const game = games.find(g => Number(g.gamePk) === gamePk);

    if (!game) {
      return res.status(404).json({
        ok: false,
        error: 'Juego no encontrado'
      });
    }

    const [
      awayHitting,
      homeHitting,
      awayPitcher,
      homePitcher
    ] = await Promise.all([
      fetchTeamHitting(game.awayTeamId),
      fetchTeamHitting(game.homeTeamId),
      fetchPitcherStats(game.awayProbablePitcherId),
      fetchPitcherStats(game.homeProbablePitcherId)
    ]);

    // CAMBIO: Validación ternaria para findOddsForGame
    const odds = oddsData
      ? findOddsForGame(oddsData, game.awayTeam, game.homeTeam)
      : null;

    const analysis = buildGameAnalysis({
      game: game.rawGame,
      awayHitting,
      homeHitting,
      awayPitcher,
      homePitcher,
      odds
    });

    res.json({
      ok: true,
      analysis
    });

  } catch (error) {
    console.error('ERROR /analyze:', error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
