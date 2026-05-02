import express from 'express';
import { buildSoccerAnalysis } from '../utils/soccerScoring.js';

const router = express.Router();
const API_URL = 'https://v3.football.api-sports.io';

const LEAGUES = {
  epl: { id: 39, name: 'Premier League' },
  laliga: { id: 140, name: 'La Liga' },
  seriea: { id: 135, name: 'Serie A' },
  bundesliga: { id: 78, name: 'Bundesliga' },
  ligue1: { id: 61, name: 'Ligue 1' },
  champions: { id: 2, name: 'Champions League' },
  europa: { id: 3, name: 'Europa League' },
  conference: { id: 848, name: 'Conference League' }
};

const cache = {
  fixtures: {},
  TTL: 60 * 1000
};

function getHeaders() {
  return {
    'x-apisports-key': process.env.FOOTBALL_API_KEY
  };
}

function getChicagoDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getDate(req) {
  return req.query.date || getChicagoDate();
}

// ✅ TEMPORADA CORRECTA PARA LIGAS EUROPEAS
function getSoccerSeason(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  // Enero a julio pertenecen a la temporada que empezó el año anterior
  return month <= 7 ? year - 1 : year;
}

function formatFixture(g, leagueKey = '') {
  return {
    matchId: g.fixture.id,
    fixtureId: g.fixture.id,

    date: g.fixture.date?.split('T')[0],

    time: g.fixture.status.elapsed
      ? `${g.fixture.status.elapsed}'`
      : new Date(g.fixture.date).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Chicago'
        }),

    status: g.fixture.status.short,
    statusLong: g.fixture.status.long,

    leagueKey,
    leagueName: g.league.name,
    league: g.league.name,

    homeTeam: g.teams.home.name,
    awayTeam: g.teams.away.name,

    homeTeamId: g.teams.home.id,
    awayTeamId: g.teams.away.id,

    homeLogo: g.teams.home.logo,
    awayLogo: g.teams.away.logo,

    homeScore: g.goals.home ?? 0,
    awayScore: g.goals.away ?? 0
  };
}

async function apiFootball(path) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: getHeaders()
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('API-Football error:', data);
    return null;
  }

  if (data?.errors && Object.keys(data.errors).length > 0) {
    console.error('API-Football errors:', data.errors);
  }

  return data;
}

async function getFixturesByLeague(leagueKey, date) {
  const league = LEAGUES[leagueKey] || LEAGUES.epl;
  const season = getSoccerSeason(date);

  const cacheKey = `${leagueKey}-${season}-${date}`;
  const cached = cache.fixtures[cacheKey];

  if (cached && Date.now() - cached.timestamp < cache.TTL) {
    return cached.data;
  }

  const data = await apiFootball(
    `/fixtures?league=${league.id}&season=${season}&date=${date}`
  );

  const games = (data?.response || []).map(g => formatFixture(g, leagueKey));

  cache.fixtures[cacheKey] = {
    data: games,
    timestamp: Date.now()
  };

  return games;
}

async function getGlobalFixtures(date) {
  const allGames = [];

  for (const [leagueKey] of Object.entries(LEAGUES)) {
    const games = await getFixturesByLeague(leagueKey, date);
    allGames.push(...games);
  }

  return allGames;
}

async function getLineups(fixtureId) {
  const data = await apiFootball(`/fixtures/lineups?fixture=${fixtureId}`);

  if (!data?.response || data.response.length < 2) {
    return null;
  }

  return data.response.map(team => ({
    teamName: team.team.name,
    teamLogo: team.team.logo,
    formation: team.formation,

    startXI: (team.startXI || []).map(p => ({
      name: p.player.name,
      number: p.player.number,
      pos: p.player.pos,
      grid: p.player.grid
    })),

    substitutes: (team.substitutes || []).map(p => ({
      name: p.player.name,
      number: p.player.number,
      pos: p.player.pos
    }))
  }));
}

function buildPlayerPropsFromLineups(lineups) {
  if (!lineups || lineups.length < 2) return [];

  const players = [];

  for (const team of lineups) {
    for (const p of team.startXI || []) {
      let goalChance = 5;
      let shotChance = 35;

      if (['F', 'FW', 'ST'].includes(p.pos)) {
        goalChance = 28;
        shotChance = 72;
      } else if (['M', 'AM'].includes(p.pos)) {
        goalChance = 16;
        shotChance = 55;
      } else if (['D'].includes(p.pos)) {
        goalChance = 6;
        shotChance = 28;
      } else if (['G', 'GK'].includes(p.pos)) {
        goalChance = 1;
        shotChance = 5;
      }

      players.push({
        name: p.name,
        team: team.teamName,
        pos: p.pos,
        market: 'Gol / Tiros',
        goalChance,
        shotChance
      });
    }
  }

  return players
    .sort((a, b) => b.goalChance - a.goalChance)
    .slice(0, 8);
}

// =====================
// ROUTES
// =====================

router.get('/games', async (req, res) => {
  try {
    const date = getDate(req);
    const leagueKey = String(req.query.league || 'epl').toLowerCase();

    const games = await getFixturesByLeague(leagueKey, date);

    res.json({
      ok: true,
      selectedDate: date,
      leagueKey,
      season: getSoccerSeason(date),
      count: games.length,
      games
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      games: []
    });
  }
});

router.get('/games-global', async (req, res) => {
  try {
    const date = getDate(req);
    const games = await getGlobalFixtures(date);

    res.json({
      ok: true,
      selectedDate: date,
      season: getSoccerSeason(date),
      count: games.length,
      games
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      games: []
    });
  }
});

router.get('/lineups/:fixtureId', async (req, res) => {
  try {
    const lineups = await getLineups(req.params.fixtureId);

    if (!lineups) {
      return res.json({
        ok: false,
        message: 'Alineaciones no disponibles',
        lineups: []
      });
    }

    res.json({
      ok: true,
      lineups
    });

  } catch (error) {
    res.json({
      ok: false,
      error: error.message,
      lineups: []
    });
  }
});

router.get('/player-props/:fixtureId', async (req, res) => {
  try {
    const lineups = await getLineups(req.params.fixtureId);

    if (!lineups) {
      return res.json({
        ok: false,
        message: 'Alineaciones no disponibles',
        props: []
      });
    }

    const props = buildPlayerPropsFromLineups(lineups);

    res.json({
      ok: true,
      props
    });

  } catch (error) {
    res.json({
      ok: false,
      error: error.message,
      props: []
    });
  }
});

router.get('/analyze/:id', async (req, res) => {
  try {
    const date = getDate(req);
    const leagueKey = String(req.query.league || 'epl').toLowerCase();

    const games = await getFixturesByLeague(leagueKey, date);
    const matchRaw = games.find(g => String(g.matchId) === String(req.params.id));

    if (!matchRaw) {
      return res.status(404).json({
        ok: false,
        error: 'Partido no encontrado'
      });
    }

    const analysis = buildSoccerAnalysis({
      match: {
        matchId: matchRaw.matchId,
        matchup: `${matchRaw.homeTeam} vs ${matchRaw.awayTeam}`,
        homeTeam: matchRaw.homeTeam,
        awayTeam: matchRaw.awayTeam,
        homeTeamId: matchRaw.homeTeamId,
        awayTeamId: matchRaw.awayTeamId
      },
      homeRecentEvents: [],
      awayRecentEvents: []
    });

    res.json({
      ok: true,
      selectedDate: date,
      leagueKey,
      season: getSoccerSeason(date),
      analysis
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/ticket-global', async (req, res) => {
  try {
    const date = getDate(req);
    const games = await getGlobalFixtures(date);

    res.json({
      ok: true,
      selectedDate: date,
      season: getSoccerSeason(date),
      gamesAnalyzed: games.length,
      ticket: {
        ticketType: 'Ticket Global Soccer',
        totalPicks: 0,
        picks: [],
        seguro: [],
        medio: [],
        grande: [],
        note: 'Conectado a API-Football con temporada europea correcta.'
      }
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
      ticket: {
        ticketType: 'Error',
        totalPicks: 0,
        picks: [],
        seguro: [],
        medio: [],
        grande: []
      }
    });
  }
});

export default router;