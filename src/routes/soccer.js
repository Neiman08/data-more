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
  lineups: {},
  liveStats: {},
  TTL: 60 * 1000
};

function getHeaders() {
  const key = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY;
  return { 'x-apisports-key': key };
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

function buildTeamForm(lastMatches = [], teamId) {

  if (!lastMatches.length) return 'W D W L W';

  return lastMatches.slice(0, 5).map(match => {

    const isHome = match.homeTeamId === teamId;

    const goalsFor = isHome
      ? match.intHomeScore
      : match.intAwayScore;

    const goalsAgainst = isHome
      ? match.intAwayScore
      : match.intHomeScore;

    if (goalsFor > goalsAgainst) return 'W';
    if (goalsFor < goalsAgainst) return 'L';

    return 'D';

  }).join(' ');
}

function buildRecord(lastMatches = [], teamId) {

  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const match of lastMatches) {

    const isHome = match.homeTeamId === teamId;

    const goalsFor = isHome
      ? match.intHomeScore
      : match.intAwayScore;

    const goalsAgainst = isHome
      ? match.intAwayScore
      : match.intHomeScore;

    if (goalsFor > goalsAgainst) wins++;
    else if (goalsFor < goalsAgainst) losses++;
    else draws++;
  }

  return `${wins}-${draws}-${losses}`;
}

async function formatFixture(g, leagueKey = '') {

  const date =
    g.fixture.date?.split('T')[0] || getChicagoDate();

  const [
    homeRecent,
    awayRecent
  ] = await Promise.all([
    getLast5TeamMatches(g.teams.home.id, date),
    getLast5TeamMatches(g.teams.away.id, date)
  ]);

  return {
    matchId: g.fixture.id,
    fixtureId: g.fixture.id,

    date,

    time: g.fixture.status.elapsed
      ? `${g.fixture.status.elapsed}'`
      : new Date(g.fixture.date).toLocaleTimeString(
          'en-US',
          {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Chicago'
          }
        ),

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
    awayScore: g.goals.away ?? 0,

    homeForm: buildTeamForm(
      homeRecent,
      g.teams.home.id
    ),

    awayForm: buildTeamForm(
      awayRecent,
      g.teams.away.id
    ),

    homeRecord: buildRecord(
      homeRecent,
      g.teams.home.id
    ),

    awayRecord: buildRecord(
      awayRecent,
      g.teams.away.id
    ),

    homeCoach: g.teams.home.name,
    awayCoach: g.teams.away.name
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

  return data;
}

function findStat(stats = [], names = []) {
  const found = stats.find(s =>
    names.some(name =>
      String(s.type || '').toLowerCase() === name.toLowerCase()
    )
  );

  return found?.value ?? null;
}

function normalizePercent(v) {
  if (v === null || v === undefined) return null;
  return Number(String(v).replace('%', '').trim()) || null;
}

async function getLiveStats(fixtureId) {

  const cacheKey = `live-${fixtureId}`;
  const cached = cache.liveStats[cacheKey];

  if (cached && Date.now() - cached.timestamp < 15000) {
    return cached.data;
  }

  const data = await apiFootball(`/fixtures/statistics?fixture=${fixtureId}`);
  const response = data?.response || [];

  if (!response.length) {

    const empty = {
      available: false
    };

    cache.liveStats[cacheKey] = {
      data: empty,
      timestamp: Date.now()
    };

    return empty;
  }

  const homeStats = response[0]?.statistics || [];
  const awayStats = response[1]?.statistics || [];

  const liveStats = {

    available: true,

    homePossession: normalizePercent(
      findStat(homeStats, ['Ball Possession'])
    ),

    awayPossession: normalizePercent(
      findStat(awayStats, ['Ball Possession'])
    ),

    homeShots: findStat(homeStats, ['Total Shots']),
    awayShots: findStat(awayStats, ['Total Shots']),

    homeCorners: findStat(homeStats, ['Corner Kicks']),
    awayCorners: findStat(awayStats, ['Corner Kicks'])
  };

  cache.liveStats[cacheKey] = {
    data: liveStats,
    timestamp: Date.now()
  };

  return liveStats;
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

  const games = await Promise.all(
    (data?.response || []).map(g =>
      formatFixture(g, leagueKey)
    )
  );

  cache.fixtures[cacheKey] = {
    data: games,
    timestamp: Date.now()
  };

  return games;
}

async function getGlobalFixtures(date) {

  const allGames = [];

  for (const [leagueKey] of Object.entries(LEAGUES)) {

    const games = await getFixturesByLeague(
      leagueKey,
      date
    );

    allGames.push(...games);
  }

  return allGames;
}

async function getLineups(fixtureId) {

  const cacheKey = `lineups-${fixtureId}`;

  const cached = cache.lineups[cacheKey];

  if (cached && Date.now() - cached.timestamp < cache.TTL) {
    return cached.data;
  }

  const data = await apiFootball(
    `/fixtures/lineups?fixture=${fixtureId}`
  );

  if (!data?.response || data.response.length < 2) {

    cache.lineups[cacheKey] = {
      data: null,
      timestamp: Date.now()
    };

    return null;
  }

  const lineups = data.response.map(team => ({

    teamName: team.team.name,
    teamLogo: team.team.logo,
    formation: team.formation,

    startXI: (team.startXI || []).map(p => ({
      name: p.player.name,
      number: p.player.number,
      pos: p.player.pos
    }))
  }));

  cache.lineups[cacheKey] = {
    data: lineups,
    timestamp: Date.now()
  };

  return lineups;
}

function buildPlayerPropsFromLineups(lineups) {

  if (!lineups || lineups.length < 2) return [];

  const players = [];

  for (const team of lineups) {

    for (const p of team.startXI || []) {

      const pos = String(p.pos || '').toUpperCase();

      let goalChance = 5;

      if (['F', 'FW', 'ST', 'CF'].includes(pos)) {
        goalChance = 28;
      } else if (['M', 'CM'].includes(pos)) {
        goalChance = 14;
      }

      players.push({
        name: p.name,
        player: p.name,
        team: team.teamName,
        pos,
        probability: goalChance,
        goalChance
      });
    }
  }

  return players
    .sort((a, b) => b.goalChance - a.goalChance)
    .slice(0, 10);
}

async function getLast5TeamMatches(teamId, date) {

  try {

    const season = getSoccerSeason(date);

    const data = await apiFootball(
      `/fixtures?team=${teamId}&season=${season}&last=5`
    );

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

function buildPublicLineups(lineups) {

  if (!lineups || lineups.length < 2) return null;

  return {
    home: lineups[0]?.startXI || [],
    away: lineups[1]?.startXI || []
  };
}

function buildPublicSoccerAnalysis(
  analysis,
  lineups = null,
  playerProps = [],
  liveStats = null
) {

  return {

    pick: analysis.pick || null,

    probability: Number(
      analysis.probability ||
      analysis.pickProbability ||
      0
    ).toFixed(2),

    confidence: analysis.confidence || 'MEDIUM',

    oneX2: analysis.oneX2 || analysis.probabilities || null,

    over25:
      analysis.over25 ||
      analysis.totalPick ||
      null,

    btts:
      analysis.btts ||
      analysis.bothTeamsToScore ||
      null,

    lineups: buildPublicLineups(lineups),

    playerProps,

    live: liveStats || {}
  };
}

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

  } catch {

    res.status(500).json({
      ok: false,
      error: 'Unable to load global soccer games.',
      games: []
    });
  }
});

router.get('/analyze/:id', async (req, res) => {

  try {

    const date = getDate(req);

    const games = await getGlobalFixtures(date);

    const matchRaw = games.find(
      g => String(g.matchId) === String(req.params.id)
    );

    if (!matchRaw) {
      return res.status(404).json({
        ok: false,
        error: 'Match not found.'
      });
    }

    const [
      homeRecentEvents,
      awayRecentEvents,
      lineups,
      liveStats
    ] = await Promise.all([

      getLast5TeamMatches(
        matchRaw.homeTeamId,
        date
      ),

      getLast5TeamMatches(
        matchRaw.awayTeamId,
        date
      ),

      getLineups(
        matchRaw.fixtureId || matchRaw.matchId
      ),

      getLiveStats(
        matchRaw.fixtureId || matchRaw.matchId
      )
    ]);

    const playerProps =
      buildPlayerPropsFromLineups(lineups);

    const privateAnalysis = buildSoccerAnalysis({

      match: {
        matchId: matchRaw.matchId,

        matchup:
          `${matchRaw.homeTeam} vs ${matchRaw.awayTeam}`,

        homeTeam: matchRaw.homeTeam,
        awayTeam: matchRaw.awayTeam,

        homeScore: matchRaw.homeScore,
        awayScore: matchRaw.awayScore,

        status: matchRaw.status,
        time: matchRaw.time
      },

      homeRecentEvents,
      awayRecentEvents,
      lineups,
      playerProps,
      liveStats
    });

    res.json({

      ok: true,

      game: matchRaw,

      analysis: buildPublicSoccerAnalysis(
        privateAnalysis,
        lineups,
        playerProps,
        liveStats
      ),

      lineups: buildPublicLineups(lineups),

      playerProps,

      live: liveStats
    });

  } catch (error) {

    console.error('Soccer analyze error:', error);

    res.status(500).json({
      ok: false,
      error: 'Unable to run soccer analysis.'
    });
  }
});

export default router;