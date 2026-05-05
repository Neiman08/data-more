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
  conference: { id: 848, name: 'Conference League' },
  brasil: { id: 71, name: 'Brasileirão Serie A' },
  argentina: { id: 128, name: 'Liga Argentina' },
  mls: { id: 253, name: 'MLS' },
  ligamx: { id: 262, name: 'Liga MX' }
};

const cache = {
  fixtures: {},
  TTL: 60 * 1000
};

function getHeaders() {
  const key = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY;

  return {
    'x-apisports-key': key
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

function getSoccerSeason(date, leagueKey = '') {
  const d = new Date(`${date}T12:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;

  if (['mls', 'brasil', 'argentina', 'ligamx'].includes(leagueKey)) {
    return year;
  }

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
  const season = getSoccerSeason(date, leagueKey);

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
        market: 'Goal / Shots',
        goalChance,
        shotChance
      });
    }
  }

  return players
    .sort((a, b) => b.goalChance - a.goalChance)
    .slice(0, 8);
}

async function getLast5TeamMatches(teamId, date) {
  try {
    const season = getSoccerSeason(date);
    const data = await apiFootball(`/fixtures?team=${teamId}&season=${season}&last=5`);

    return (data?.response || []).map(g => ({
      strHomeTeam: g.teams.home.name,
      strAwayTeam: g.teams.away.name,
      intHomeScore: g.goals.home ?? 0,
      intAwayScore: g.goals.away ?? 0,
      homeTeamId: g.teams.home.id,
      awayTeamId: g.teams.away.id,
      status: g.fixture.status.short,
      date: g.fixture.date
    }));
  } catch {
    return [];
  }
}

function buildPublicSoccerAnalysis(analysis) {
  return {
    pick: analysis.pick || null,
    probability: Number(analysis.probability || analysis.pickProbability || 0).toFixed(2),
    confidence: analysis.confidence || 'MEDIUM',
    oneX2: analysis.oneX2 || analysis.probabilities || null,
    over25: analysis.over25 || analysis.totalPick || null,
    btts: analysis.btts || analysis.bothTeamsToScore || null
  };
}

router.get('/games', async (req, res) => {
  try {
    const date = getDate(req);
    const leagueKey = String(req.query.league || 'epl').toLowerCase();

    const games = await getFixturesByLeague(leagueKey, date);

    res.json({
      ok: true,
      selectedDate: date,
      leagueKey,
      count: games.length,
      games
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Unable to load soccer games.',
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
      count: games.length,
      games
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Unable to load global soccer games.',
      games: []
    });
  }
});

router.get('/lineups/:fixtureId', async (req, res) => {
  try {
    const lineups = await getLineups(req.params.fixtureId);

    res.json({
      ok: true,
      available: !!lineups,
      message: lineups ? 'Lineups available' : 'Lineups not published yet',
      lineups: lineups || []
    });
  } catch (error) {
    res.json({
      ok: false,
      error: 'Unable to load lineups.',
      lineups: []
    });
  }
});

router.get('/player-props/:fixtureId', async (req, res) => {
  try {
    const lineups = await getLineups(req.params.fixtureId);

    if (!lineups) {
      return res.json({
        ok: true,
        available: false,
        message: 'Lineups not published yet',
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
      error: 'Unable to load player props.',
      props: []
    });
  }
});

router.get('/analyze/:id', async (req, res) => {
  try {
    const date = getDate(req);
    const leagueKey = String(req.query.league || '').toLowerCase();

    const games = await getGlobalFixtures(date);
    const matchRaw = games.find(g => String(g.matchId) === String(req.params.id));

    if (!matchRaw) {
      return res.status(404).json({
        ok: false,
        error: 'Match not found.'
      });
    }

    const [homeRecentEvents, awayRecentEvents] = await Promise.all([
      getLast5TeamMatches(matchRaw.homeTeamId, date),
      getLast5TeamMatches(matchRaw.awayTeamId, date)
    ]);

    const privateAnalysis = buildSoccerAnalysis({
      match: {
        matchId: matchRaw.matchId,
        matchup: `${matchRaw.homeTeam} vs ${matchRaw.awayTeam}`,
        homeTeam: matchRaw.homeTeam,
        awayTeam: matchRaw.awayTeam,
        homeTeamId: matchRaw.homeTeamId,
        awayTeamId: matchRaw.awayTeamId,
        league: matchRaw.leagueName,
        leagueKey: matchRaw.leagueKey || leagueKey
      },
      homeRecentEvents,
      awayRecentEvents
    });

    res.json({
      ok: true,
      analysis: buildPublicSoccerAnalysis(privateAnalysis)
    });

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Unable to run soccer analysis.'
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
      gamesAnalyzed: games.length,
      ticket: {
        ticketType: 'Global Soccer Ticket',
        totalPicks: 0,
        picks: [],
        safe: [],
        medium: [],
        aggressive: [],
        note: 'Connected to major global soccer leagues.'
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'Unable to build global soccer ticket.',
      ticket: {
        ticketType: 'Error',
        totalPicks: 0,
        picks: [],
        safe: [],
        medium: [],
        aggressive: []
      }
    });
  }
});

router.get('/debug', (req, res) => {
  return res.status(404).json({
    ok: false,
    error: 'Not found'
  });
});

export default router;