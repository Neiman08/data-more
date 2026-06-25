import express from 'express';
import { buildSoccerAnalysis } from '../utils/soccerScoring.js';

const router = express.Router();
const API_URL = 'https://v3.football.api-sports.io';

const LEAGUES = {
  world_cup: { id: 1, name: 'FIFA World Cup' },
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

const LEAGUE_IDS = new Set(Object.values(LEAGUES).map(l => l.id));
const DEFAULT_TIMEZONE = 'America/Chicago';

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

function getLocalDate(timezone = DEFAULT_TIMEZONE, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimezone(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getChicagoDate() {
  return getLocalDate(DEFAULT_TIMEZONE);
}

function getDate(req) {
  return req.query.date || getChicagoDate();
}

function normalizeTimezone(timezone) {
  try {
    if (!timezone) return DEFAULT_TIMEZONE;

    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone
    }).format(new Date());

    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function getTimezone(req) {
  return normalizeTimezone(req.query.timezone);
}

function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function formatLocalTime(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: normalizeTimezone(timezone),
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function normalizeKickoff(rawDate, timezone) {
  const safeTimezone = normalizeTimezone(timezone);

  if (!rawDate) {
    const localDate = getLocalDate(safeTimezone);

    return {
      utcKickoff: '',
      localKickoff: '',
      localDate,
      localTime: 'TBD',
      timezone: safeTimezone
    };
  }

  const kickoffDate = new Date(rawDate);
  const localDate = getLocalDate(safeTimezone, kickoffDate);
  const localTime = formatLocalTime(kickoffDate, safeTimezone);

  return {
    utcKickoff: rawDate,
    localKickoff: `${localDate} ${localTime}`,
    localDate,
    localTime,
    timezone: safeTimezone
  };
}

function getFixtureStatus(fixture = {}) {
  const status = fixture.status || {};

  return {
    short: status.short || 'NS',
    long: status.long || 'Not Started',
    elapsed: status.elapsed ?? null,
    extra: status.extra ?? null
  };
}

function buildLiveClock(elapsed, extraTime) {
  if (elapsed === null || elapsed === undefined) return null;

  return extraTime
    ? `${elapsed}+${extraTime}'`
    : `${elapsed}'`;
}

function isLiveStatus(status) {
  return ['LIVE', '1H', '2H', 'HT', 'ET'].includes(
    String(status || '').toUpperCase()
  );
}

function hasApiErrors(data) {
  if (!data?.errors) return false;

  if (Array.isArray(data.errors)) return data.errors.length > 0;
  if (typeof data.errors === 'object') return Object.keys(data.errors).length > 0;

  return Boolean(data.errors);
}

function hasFatalApiError(data) {
  if (!hasApiErrors(data)) return false;

  const text = JSON.stringify(data.errors).toLowerCase();

  return (
    text.includes('request') ||
    text.includes('key') ||
    text.includes('token') ||
    text.includes('account') ||
    text.includes('subscription')
  );
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

async function formatFixture(g, leagueKey = '', timezone = DEFAULT_TIMEZONE) {

  const kickoff = normalizeKickoff(
    g.fixture?.date,
    timezone
  );
  const fixtureStatus = getFixtureStatus(g.fixture);
  const liveClock = buildLiveClock(
    fixtureStatus.elapsed,
    fixtureStatus.extra
  );

  const [
    homeRecent,
    awayRecent
  ] = await Promise.all([
    getLast5TeamMatches(g.teams.home.id, kickoff.localDate),
    getLast5TeamMatches(g.teams.away.id, kickoff.localDate)
  ]);

  return {
    matchId: g.fixture.id,
    fixtureId: g.fixture.id,

    date: kickoff.localDate,
    utcKickoff: kickoff.utcKickoff,
    localKickoff: kickoff.localKickoff,
    localDate: kickoff.localDate,
    localTime: kickoff.localTime,
    timezone: kickoff.timezone,

    time: g.fixture.status.elapsed
      ? `${g.fixture.status.elapsed}'`
      : kickoff.localTime,

    status: fixtureStatus.short,
    statusLong: fixtureStatus.long,
    elapsed: fixtureStatus.elapsed,
    minute: fixtureStatus.elapsed,
    extraTime: fixtureStatus.extra,
    liveClock,

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

function formatFixtureForList(g, timezone = DEFAULT_TIMEZONE) {
  const leagueKey = Object.keys(LEAGUES).find(k => LEAGUES[k].id === g.league?.id) || '';
  const rawDate = g.fixture?.date || '';
  const kickoff = normalizeKickoff(rawDate, timezone);
  const fixtureStatus = getFixtureStatus(g.fixture);
  const liveClock = buildLiveClock(
    fixtureStatus.elapsed,
    fixtureStatus.extra
  );

  return {
    matchId: g.fixture.id,
    fixtureId: g.fixture.id,
    date: kickoff.localDate,
    kickoff: rawDate,
    utcKickoff: kickoff.utcKickoff,
    localKickoff: kickoff.localKickoff,
    localDate: kickoff.localDate,
    localTime: kickoff.localTime,
    timezone: kickoff.timezone,
    time: kickoff.localTime,
    status: fixtureStatus.short,
    statusLong: fixtureStatus.long,
    elapsed: fixtureStatus.elapsed,
    minute: fixtureStatus.elapsed,
    extraTime: fixtureStatus.extra,
    liveClock,
    leagueKey,
    leagueName: g.league?.name || '',
    leagueId: g.league?.id || null,
    league: g.league?.name || '',
    round: g.league?.round || '',
    homeTeam: g.teams?.home?.name || '',
    awayTeam: g.teams?.away?.name || '',
    homeTeamId: g.teams?.home?.id || null,
    awayTeamId: g.teams?.away?.id || null,
    homeLogo: g.teams?.home?.logo || '',
    awayLogo: g.teams?.away?.logo || '',
    score: {
      home: g.goals?.home ?? null,
      away: g.goals?.away ?? null,
      display: (g.goals?.home !== null && g.goals?.home !== undefined)
        ? `${g.goals.home}-${g.goals.away}`
        : 'vs'
    },
    homeScore: g.goals?.home ?? 0,
    awayScore: g.goals?.away ?? 0,
    homeForm: '---',
    awayForm: '---',
    homeRecord: '---',
    awayRecord: '---'
  };
}

async function getGlobalFixtures(date, timezone = DEFAULT_TIMEZONE) {
  const safeTimezone = normalizeTimezone(timezone);
  const cacheKey = `global-${safeTimezone}-${date}`;
  const cached = cache.fixtures[cacheKey];

  if (
    cached &&
    Date.now() - cached.timestamp < cache.TTL &&
    !cached.data.some(g => isLiveStatus(g.status))
  ) {
    return cached.data;
  }

  // Query the surrounding UTC dates, then filter by localDate. This prevents
  // late-night UTC kickoffs from leaking into the wrong local board day.
  const apiDates = [
    shiftDate(date, -1),
    date,
    shiftDate(date, 1)
  ];

  const responses = await Promise.all(
    apiDates.map(apiDate => apiFootball(`/fixtures?date=${apiDate}`))
  );

  const apiErrors = responses
    .filter(data => hasApiErrors(data))
    .map(data => data.errors);
  const hasAnyFixtureResponse = responses.some(data => (data?.response || []).length > 0);
  const allResponsesFailed = responses.every(data => hasApiErrors(data));
  const hasFatalError = responses.some(data => hasFatalApiError(data));

  if (!hasAnyFixtureResponse && apiErrors.length && (allResponsesFailed || hasFatalError)) {
    const err = new Error('API-Football returned no fixtures for the requested board.');
    err.apiErrors = apiErrors;
    throw err;
  }

  const byFixture = new Map();

  for (const data of responses) {
    for (const game of data?.response || []) {
      const fixtureId = game.fixture?.id;

      if (fixtureId && !byFixture.has(fixtureId)) {
        byFixture.set(fixtureId, game);
      }
    }
  }

  const games = [...byFixture.values()]
    .filter(g => LEAGUE_IDS.has(g.league?.id))
    .map(g => formatFixtureForList(g, safeTimezone))
    .filter(g => g.localDate === date);

  if (!games.some(g => isLiveStatus(g.status))) {
    cache.fixtures[cacheKey] = { data: games, timestamp: Date.now() };
  } else {
    delete cache.fixtures[cacheKey];
  }

  return games;
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
      let shotChance = 20;
      let assistChance = 6;
      let cardRisk = 10;

      // FORWARDS
      if (
        ['F', 'FW', 'ST', 'CF', 'LW', 'RW', 'SS']
          .includes(pos)
      ) {

        goalChance = 28 + Math.floor(Math.random() * 10);
        shotChance = 70 + Math.floor(Math.random() * 15);
        assistChance = 14 + Math.floor(Math.random() * 10);
        cardRisk = 12;
      }

      // MIDFIELDERS
      else if (
        ['M', 'CM', 'CDM', 'CAM', 'LM', 'RM', 'AM']
          .includes(pos)
      ) {

        goalChance = 10 + Math.floor(Math.random() * 10);
        shotChance = 40 + Math.floor(Math.random() * 20);
        assistChance = 22 + Math.floor(Math.random() * 18);
        cardRisk = 18;
      }

      // DEFENDERS
      else if (
        ['D', 'CB', 'LB', 'RB', 'LWB', 'RWB']
          .includes(pos)
      ) {

        goalChance = 3 + Math.floor(Math.random() * 5);
        shotChance = 10 + Math.floor(Math.random() * 12);
        assistChance = 5 + Math.floor(Math.random() * 8);
        cardRisk = 30;
      }

      // GOALKEEPERS
      else if (
        ['G', 'GK']
          .includes(pos)
      ) {

        goalChance = 1;
        shotChance = 1;
        assistChance = 1;
        cardRisk = 4;
      }

      players.push({

        name: p.name,
        player: p.name,

        team: team.teamName,

        pos,
        position: pos,

        probability: goalChance,

        goalChance,
        shotChance,
        assistChance,
        cardRisk

      });
    }
  }

  return players
    .sort((a, b) => {

      const aScore =
        (a.goalChance * 1.7) +
        (a.assistChance * 1.1);

      const bScore =
        (b.goalChance * 1.7) +
        (b.assistChance * 1.1);

      return bScore - aScore;
    })
    .slice(0, 15);
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
    const timezone = getTimezone(req);

    const games = await getGlobalFixtures(date, timezone);

    res.json({
      ok: true,
      selectedDate: date,
      timezone,
      count: games.length,
      games
    });

  } catch (err) {

    res.status(502).json({
      ok: false,
      error: 'Unable to load global soccer games from API-Football.',
      details: err.apiErrors || undefined,
      games: []
    });
  }
});

router.get('/analyze/:id', async (req, res) => {

  try {

    const date = getDate(req);
    const timezone = getTimezone(req);

    const games = await getGlobalFixtures(date, timezone);

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
