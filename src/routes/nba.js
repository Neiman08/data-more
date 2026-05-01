import express from 'express';
import { buildNBAAnalysis } from '../utils/nbaScoring.js';

const router = express.Router();

const NBA_SCOREBOARD_API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
const NBA_SUMMARY_API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary';

const cache = {};
const CACHE_TTL = 20 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAPI(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) return null;
      await sleep(800);
    }
  }
  return null;
}

function getLogo(teamName) {
  const map = {
    'Los Angeles Lakers': 'lal',
    'Golden State Warriors': 'gsw',
    'Boston Celtics': 'bos',
    'Miami Heat': 'mia',
    'Chicago Bulls': 'chi',
    'Milwaukee Bucks': 'mil',
    'Phoenix Suns': 'phx',
    'Denver Nuggets': 'den',
    'Dallas Mavericks': 'dal',
    'New York Knicks': 'nyk',
    'Philadelphia 76ers': 'phi',
    'Cleveland Cavaliers': 'cle',
    'Atlanta Hawks': 'atl',
    'Brooklyn Nets': 'bkn',
    'Toronto Raptors': 'tor',
    'Utah Jazz': 'uta',
    'Sacramento Kings': 'sac',
    'San Antonio Spurs': 'sas',
    'Houston Rockets': 'hou',
    'Orlando Magic': 'orl',
    'Indiana Pacers': 'ind',
    'Detroit Pistons': 'det',
    'Washington Wizards': 'was',
    'Charlotte Hornets': 'cha',
    'Minnesota Timberwolves': 'min',
    'Oklahoma City Thunder': 'okc',
    'New Orleans Pelicans': 'nop',
    'Portland Trail Blazers': 'por',
    'Los Angeles Clippers': 'lac',
    'Memphis Grizzlies': 'mem'
  };

  const code = map[teamName];
  return code ? `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png` : '/logo.png';
}

function formatDateForESPN(date) {
  return String(date).replaceAll('-', '');
}

function formatGameTime(dateString) {
  try {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'TBD';
  }
}

function normalizeStatus(event) {
  const type = event.status?.type || {};
  return {
    status: type.description || 'Scheduled',
    statusShort: type.shortDetail || type.detail || '',
    state: type.state || '',
    completed: Boolean(type.completed),
    isLive: type.state === 'in',
    isPre: type.state === 'pre',
    isPost: type.state === 'post'
  };
}

async function getGames(date) {
  const key = `nba-games-${date}`;
  const now = Date.now();

  if (cache[key] && now - cache[key].time < CACHE_TTL) {
    return cache[key].data;
  }

  const espnDate = formatDateForESPN(date);
  const url = `${NBA_SCOREBOARD_API}?dates=${espnDate}`;
  const data = await fetchAPI(url);

  if (!data || !Array.isArray(data.events)) {
    return [];
  }

  const games = data.events.map(event => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors || [];

    const home = competitors.find(t => t.homeAway === 'home');
    const away = competitors.find(t => t.homeAway === 'away');

    const homeTeam = home?.team?.displayName || 'Home Team';
    const awayTeam = away?.team?.displayName || 'Away Team';

    const statusInfo = normalizeStatus(event);

    return {
      gameId: event.id,
      date,
      time: formatGameTime(event.date),
      homeTeam,
      awayTeam,
      homeAbbrev: home?.team?.abbreviation || '',
      awayAbbrev: away?.team?.abbreviation || '',
      homeScore: Number(home?.score ?? 0),
      awayScore: Number(away?.score ?? 0),
      homeLogo: home?.team?.logo || getLogo(homeTeam),
      awayLogo: away?.team?.logo || getLogo(awayTeam),
      status: statusInfo.status,
      statusShort: statusInfo.statusShort,
      state: statusInfo.state,
      completed: statusInfo.completed,
      isLive: statusInfo.isLive,
      isPre: statusInfo.isPre,
      isPost: statusInfo.isPost,
      period: competition?.status?.period || event.status?.period || null,
      clock: competition?.status?.displayClock || event.status?.displayClock || '',
      venue: competition?.venue?.fullName || '',
      league: 'NBA'
    };
  });

  cache[key] = {
    time: now,
    data: games
  };

  return games;
}

async function getGameSummary(gameId) {
  const key = `nba-summary-${gameId}`;
  const now = Date.now();

  if (cache[key] && now - cache[key].time < CACHE_TTL) {
    return cache[key].data;
  }

  const url = `${NBA_SUMMARY_API}?event=${gameId}`;
  const data = await fetchAPI(url);

  cache[key] = {
    time: now,
    data
  };

  return data;
}

function parsePlayerPropsFromSummary(summary) {
  const props = [];

  const playersGroups = summary?.boxscore?.players || [];

  playersGroups.forEach(teamGroup => {
    const teamName = teamGroup.team?.displayName || teamGroup.team?.shortDisplayName || '';

    (teamGroup.statistics || []).forEach(statGroup => {
      const labels = statGroup.labels || [];
      const athletes = statGroup.athletes || [];

      athletes.forEach(row => {
        const athlete = row.athlete || {};
        const stats = row.stats || [];

        const name = athlete.displayName || athlete.shortName;
        if (!name) return;

        const pointsIdx = labels.findIndex(l => ['PTS', 'Points'].includes(l));
        const reboundsIdx = labels.findIndex(l => ['REB', 'Rebounds'].includes(l));
        const assistsIdx = labels.findIndex(l => ['AST', 'Assists'].includes(l));

        const points = Number(stats[pointsIdx] || 0);
        const rebounds = Number(stats[reboundsIdx] || 0);
        const assists = Number(stats[assistsIdx] || 0);

        if (points > 0) {
          props.push({
            name,
            team: teamName,
            market: 'Points',
            line: points >= 20 ? 'Over 19.5 Pts' : 'Over 9.5 Pts',
            chance: Math.min(82, Math.max(45, Math.round(45 + points * 1.4)))
          });
        }

        if (rebounds > 0) {
          props.push({
            name,
            team: teamName,
            market: 'Rebounds',
            line: rebounds >= 8 ? 'Over 7.5 Reb' : 'Over 4.5 Reb',
            chance: Math.min(78, Math.max(42, Math.round(45 + rebounds * 2.5)))
          });
        }

        if (assists > 0) {
          props.push({
            name,
            team: teamName,
            market: 'Assists',
            line: assists >= 6 ? 'Over 5.5 Ast' : 'Over 3.5 Ast',
            chance: Math.min(78, Math.max(42, Math.round(45 + assists * 3)))
          });
        }
      });
    });
  });

  return props
    .sort((a, b) => b.chance - a.chance)
    .slice(0, 8);
}

async function getRecent(team) {
  const SEARCH_API = 'https://www.thesportsdb.com/api/v1/json/3/searchevents.php';
  const url = `${SEARCH_API}?e=${encodeURIComponent(team)}`;
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
  const [homeRecentEvents, awayRecentEvents, summary] = await Promise.all([
    getRecent(game.homeTeam),
    getRecent(game.awayTeam),
    getGameSummary(game.gameId)
  ]);

  const match = {
    matchId: game.gameId,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    status: game.status,
    state: game.state,
    matchup: `${game.awayTeam} vs ${game.homeTeam}`
  };

  const analysis = buildNBAAnalysis({
    match,
    homeRecentEvents,
    awayRecentEvents
  });

  const playerProps = parsePlayerPropsFromSummary(summary);

  return {
    ...analysis,
    playerProps,
    live: {
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      status: game.status,
      period: game.period,
      clock: game.clock
    },
    note: playerProps.length
      ? 'Player props generados desde boxscore ESPN.'
      : 'Player props NBA se activan cuando ESPN publica boxscore/jugadores.'
  };
}

// ================= ROUTES =================

router.get('/nba-games', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const games = await getGames(date);

    res.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      games
    });
  } catch (e) {
    console.error('Error /nba-games:', e);
    res.status(500).json({ ok: false, message: 'Error cargando NBA games' });
  }
});

router.get('/nba-analyze/:id', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const games = await getGames(date);
    const game = games.find(g => String(g.gameId) === String(req.params.id));

    if (!game) {
      return res.status(404).json({ ok: false, message: 'Juego NBA no encontrado' });
    }

    const analysis = await analyzeGame(game);

    res.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      game,
      analysis
    });
  } catch (e) {
    console.error('Error /nba-analyze:', e);
    res.status(500).json({ ok: false, message: 'Error analizando NBA' });
  }
});

router.get('/nba/player-props/:id', async (req, res) => {
  try {
    const summary = await getGameSummary(req.params.id);
    const props = parsePlayerPropsFromSummary(summary);

    res.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      props,
      message: props.length
        ? 'Props disponibles'
        : 'ESPN aún no publicó jugadores/boxscore para este juego'
    });
  } catch (e) {
    console.error('Error /nba/player-props:', e);
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
      await sleep(250);
    }

    const picks = analyses
      .filter(a => Number(a.probability) >= 50)
      .sort((a, b) => Number(b.probability) - Number(a.probability));

    res.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      ticket: {
        seguro: picks.slice(0, 3),
        medio: picks.slice(0, 5),
        grande: picks.slice(0, 8)
      }
    });
  } catch (e) {
    console.error('Error /nba-ticket:', e);
    res.status(500).json({ ok: false });
  }
});

export default router;