import express from 'express';

const router = express.Router();
const ODDS_API = 'https://api.the-odds-api.com/v4/sports/baseball_mlb/odds';

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
  "Athletics": "ATH",
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

const TEAM_ID_TO_ABBR = {
  111: "BOS", 110: "BAL", 147: "NYY", 141: "TOR", 139: "TB",
  114: "CLE", 116: "DET", 118: "KC", 142: "MIN", 145: "CWS",
  117: "HOU", 140: "TEX", 136: "SEA", 133: "ATH", 108: "LAA",
  144: "ATL", 143: "PHI", 121: "NYM", 146: "MIA", 120: "WSH",
  112: "CHC", 138: "STL", 158: "MIL", 113: "CIN", 134: "PIT",
  119: "LAD", 137: "SF", 135: "SD", 109: "ARI", 115: "COL"
};

const BALLPARKS = {
  108: { name: 'Angel Stadium', lat: 33.8003, lon: -117.8827, roof: 'Open Air' },
  109: { name: 'Chase Field', lat: 33.4455, lon: -112.0667, roof: 'Retractable' },
  110: { name: 'Camden Yards', lat: 39.2840, lon: -76.6217, roof: 'Open Air' },
  111: { name: 'Fenway Park', lat: 42.3467, lon: -71.0972, roof: 'Open Air' },
  112: { name: 'Wrigley Field', lat: 41.9484, lon: -87.6553, roof: 'Open Air' },
  113: { name: 'Great American Ball Park', lat: 39.0979, lon: -84.5082, roof: 'Open Air' },
  114: { name: 'Progressive Field', lat: 41.4962, lon: -81.6852, roof: 'Open Air' },
  115: { name: 'Coors Field', lat: 39.7562, lon: -104.9942, roof: 'Open Air' },
  116: { name: 'Comerica Park', lat: 42.3390, lon: -83.0485, roof: 'Open Air' },
  117: { name: 'Daikin Park', lat: 29.7573, lon: -95.3555, roof: 'Retractable' },
  118: { name: 'Kauffman Stadium', lat: 39.0517, lon: -94.4803, roof: 'Open Air' },
  119: { name: 'Dodger Stadium', lat: 34.0739, lon: -118.2400, roof: 'Open Air' },
  120: { name: 'Nationals Park', lat: 38.8730, lon: -77.0074, roof: 'Open Air' },
  121: { name: 'Citi Field', lat: 40.7571, lon: -73.8458, roof: 'Open Air' },
  133: { name: 'Sutter Health Park', lat: 38.5804, lon: -121.5130, roof: 'Open Air' },
  134: { name: 'PNC Park', lat: 40.4469, lon: -80.0057, roof: 'Open Air' },
  135: { name: 'Petco Park', lat: 32.7076, lon: -117.1570, roof: 'Open Air' },
  136: { name: 'T-Mobile Park', lat: 47.5914, lon: -122.3325, roof: 'Retractable' },
  137: { name: 'Oracle Park', lat: 37.7786, lon: -122.3893, roof: 'Open Air' },
  138: { name: 'Busch Stadium', lat: 38.6226, lon: -90.1928, roof: 'Open Air' },
  139: { name: 'Tropicana Field', lat: 27.7682, lon: -82.6534, roof: 'Fixed Roof' },
  140: { name: 'Globe Life Field', lat: 32.7473, lon: -97.0842, roof: 'Retractable' },
  141: { name: 'Rogers Centre', lat: 43.6414, lon: -79.3894, roof: 'Retractable' },
  142: { name: 'Target Field', lat: 44.9817, lon: -93.2776, roof: 'Open Air' },
  143: { name: 'Citizens Bank Park', lat: 39.9061, lon: -75.1665, roof: 'Open Air' },
  144: { name: 'Truist Park', lat: 33.8908, lon: -84.4678, roof: 'Open Air' },
  145: { name: 'Rate Field', lat: 41.8300, lon: -87.6339, roof: 'Open Air' },
  146: { name: 'loanDepot park', lat: 25.7781, lon: -80.2197, roof: 'Retractable' },
  147: { name: 'Yankee Stadium', lat: 40.8296, lon: -73.9262, roof: 'Open Air' },
  158: { name: 'American Family Field', lat: 43.0280, lon: -87.9712, roof: 'Retractable' }
};

const last5Cache = {};
const LAST5_CACHE_TTL = 1000 * 60 * 10;

function getChicagoDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function formatLineup(players) {
  return Object.values(players || {})
    .filter(p => p.battingOrder)
    .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder))
    .map(p => ({
      battingOrder: p.battingOrder,
      name: p.person?.fullName || '',
      pos: p.position?.abbreviation || '',
      personId: p.person?.id
    }));
}

function formatTime(dateString) {
  try {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function seasonYear(date) {
  return new Date(date || Date.now()).getFullYear();
}

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseInningsPitched(value) {
  if (!value) return 0;
  const [whole, fraction] = String(value).split('.');
  let innings = Number(whole || 0);
  if (fraction === '1') innings += 1 / 3;
  if (fraction === '2') innings += 2 / 3;
  return innings;
}

function normalizeName(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function americanToImplied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
}

function formatAmericanOdds(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n)) return null;
  return n > 0 ? `+${n}` : String(n);
}

function formatPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : null;
}

async function fetchCurrentOdds() {
  try {
    if (!process.env.ODDS_API_KEY) return [];

    const url = new URL(ODDS_API);
    url.searchParams.set('apiKey', process.env.ODDS_API_KEY);
    url.searchParams.set('regions', process.env.ODDS_REGION || 'us');
    url.searchParams.set('markets', process.env.ODDS_MARKETS || 'h2h,spreads,totals');
    url.searchParams.set('oddsFormat', 'american');

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      console.error('Odds API error:', response.status);
      return [];
    }

    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetchCurrentOdds:', err.message);
    return [];
  }
}

function isSameMatchup(oddsGame, awayName, homeName) {
  const oddsAway = normalizeName(oddsGame?.away_team);
  const oddsHome = normalizeName(oddsGame?.home_team);
  const away = normalizeName(awayName);
  const home = normalizeName(homeName);

  return (
    oddsAway &&
    oddsHome &&
    away &&
    home &&
    (oddsAway.includes(away) || away.includes(oddsAway)) &&
    (oddsHome.includes(home) || home.includes(oddsHome))
  );
}

function isSameOddsWindow(oddsGame, rawGame) {
  const oddsTime = new Date(oddsGame?.commence_time).getTime();
  const gameTime = new Date(rawGame?.gameDate).getTime();
  if (!Number.isFinite(oddsTime) || !Number.isFinite(gameTime)) return false;

  const hoursDiff = Math.abs(oddsTime - gameTime) / (1000 * 60 * 60);
  return hoursDiff <= 18;
}

function findOddsForRawGame(oddsData, rawGame) {
  const awayName = rawGame?.teams?.away?.team?.name;
  const homeName = rawGame?.teams?.home?.team?.name;

  return (oddsData || []).find(oddsGame =>
    isSameMatchup(oddsGame, awayName, homeName) &&
    isSameOddsWindow(oddsGame, rawGame)
  ) || null;
}

function getMarket(bookmaker, marketKey) {
  return bookmaker?.markets?.find(market => market.key === marketKey) || null;
}

function outcomeForTeam(market, teamName) {
  const team = normalizeName(teamName);
  return market?.outcomes?.find(outcome => {
    const name = normalizeName(outcome.name);
    return name && team && (name.includes(team) || team.includes(name));
  }) || null;
}

function formatSpread(outcome) {
  if (!outcome || outcome.point === undefined || outcome.price === undefined) return null;
  const point = Number(outcome.point);
  const pointText = Number.isFinite(point) && point > 0 ? `+${point}` : String(outcome.point);
  return `${pointText} (${formatAmericanOdds(outcome.price)})`;
}

function formatTotal(outcome) {
  if (!outcome || outcome.point === undefined || outcome.price === undefined) return null;
  return `${outcome.name} ${outcome.point} (${formatAmericanOdds(outcome.price)})`;
}

function normalizeOddsForGame(oddsGame, rawGame, modelFavorite, modelPct) {
  if (!oddsGame?.bookmakers?.length) return null;

  const preferredBook = oddsGame.bookmakers.find(book => book.key === 'fanduel') ||
    oddsGame.bookmakers.find(book => book.key === 'draftkings') ||
    oddsGame.bookmakers[0];

  const awayName = rawGame?.teams?.away?.team?.name;
  const homeName = rawGame?.teams?.home?.team?.name;
  const h2h = getMarket(preferredBook, 'h2h');
  const spreads = getMarket(preferredBook, 'spreads');
  const totals = getMarket(preferredBook, 'totals');

  const awayMl = outcomeForTeam(h2h, awayName);
  const homeMl = outcomeForTeam(h2h, homeName);
  const awaySpread = outcomeForTeam(spreads, awayName);
  const homeSpread = outcomeForTeam(spreads, homeName);
  const total = totals?.outcomes?.find(outcome => outcome.name === 'Over') || totals?.outcomes?.[0];
  const modelSide = normalizeName(modelFavorite).includes(normalizeName(homeName)) ? homeName : awayName;
  const modelOutcome = outcomeForTeam(h2h, modelSide);
  const implied = americanToImplied(modelOutcome?.price);
  const edge = implied !== null && Number.isFinite(Number(modelPct))
    ? Number(modelPct) - (implied * 100)
    : null;

  return {
    source: 'The Odds API',
    sportsbook: preferredBook.title || preferredBook.key,
    eventId: oddsGame.id,
    lastUpdate: h2h?.last_update || preferredBook.last_update,
    currentMoneyline: [
      awayMl ? `${TEAM_ABBR[awayName] || TEAM_ID_TO_ABBR[rawGame?.teams?.away?.team?.id] || awayName}: ${formatAmericanOdds(awayMl.price)}` : null,
      homeMl ? `${TEAM_ABBR[homeName] || TEAM_ID_TO_ABBR[rawGame?.teams?.home?.team?.id] || homeName}: ${formatAmericanOdds(homeMl.price)}` : null
    ].filter(Boolean).join(' / ') || null,
    currentSpread: [
      awaySpread ? `${TEAM_ABBR[awayName] || TEAM_ID_TO_ABBR[rawGame?.teams?.away?.team?.id] || awayName} ${formatSpread(awaySpread)}` : null,
      homeSpread ? `${TEAM_ABBR[homeName] || TEAM_ID_TO_ABBR[rawGame?.teams?.home?.team?.id] || homeName} ${formatSpread(homeSpread)}` : null
    ].filter(Boolean).join(' / ') || null,
    currentTotal: total ? formatTotal(total) : null,
    modelSide,
    modelSideMoneyline: modelOutcome ? formatAmericanOdds(modelOutcome.price) : null,
    vegasImplied: formatPct(implied !== null ? implied * 100 : null),
    dataMoreProbability: formatPct(modelPct),
    modelEdge: edge !== null ? `${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%` : null
  };
}

async function getLast5(teamId, beforeDate) {
  try {
    if (!teamId) return '---';

    const cacheKey = `${teamId}-${beforeDate}`;
    const cached = last5Cache[cacheKey];

    if (cached && Date.now() - cached.time < LAST5_CACHE_TTL) {
      return cached.value;
    }

    const end = new Date(beforeDate || new Date());
    end.setDate(end.getDate() - 1);

    const start = new Date(end);
    start.setDate(start.getDate() - 90);

    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0];

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`;
    const response = await fetch(url);
    const data = await response.json();

    const results = [];

    for (const day of data.dates || []) {
      for (const game of day.games || []) {
        if (game.status?.abstractGameState !== 'Final') continue;

        const isHome = Number(game.teams?.home?.team?.id) === Number(teamId);
        const teamScore = isHome ? Number(game.teams?.home?.score ?? 0) : Number(game.teams?.away?.score ?? 0);
        const oppScore = isHome ? Number(game.teams?.away?.score ?? 0) : Number(game.teams?.home?.score ?? 0);

        results.push({
          date: game.gameDate,
          result: teamScore > oppScore ? 'W' : 'L'
        });
      }
    }

    const value = results
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(g => g.result)
      .join(' ') || '---';

    last5Cache[cacheKey] = { time: Date.now(), value };

    return value;
  } catch (err) {
    console.error('Error getLast5:', err);
    return '---';
  }
}

async function getPitcherStats(pitcherId, season) {
  try {
    if (!pitcherId) return null;

    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=season&group=pitching&season=${season}`;
    const response = await fetch(url);
    const data = await response.json();
    const stat = data?.stats?.[0]?.splits?.[0]?.stat || {};

    return {
      id: pitcherId,
      wins: safeNumber(stat.wins),
      losses: safeNumber(stat.losses),
      ERA: stat.era || null,
      WHIP: stat.whip || null,
      IP: stat.inningsPitched || null,
      hits: safeNumber(stat.hits),
      K: safeNumber(stat.strikeOuts),
      BB: safeNumber(stat.baseOnBalls),
      HR: safeNumber(stat.homeRuns),
      battersFaced: safeNumber(stat.battersFaced),
      qualityStarts: safeNumber(stat.qualityStarts),
      gamesStarted: safeNumber(stat.gamesStarted),
      record: stat.wins != null && stat.losses != null ? `${stat.wins}-${stat.losses}` : 'Pending'
    };
  } catch (err) {
    console.error('Error getPitcherStats:', err);
    return null;
  }
}

async function getTeamStats(teamId, season) {
  try {
    if (!teamId) return null;

    const [hitRes, pitchRes] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=hitting&season=${season}`),
      fetch(`https://statsapi.mlb.com/api/v1/teams/${teamId}/stats?stats=season&group=pitching&season=${season}`)
    ]);

    const hitData = await hitRes.json();
    const pitchData = await pitchRes.json();

    const hitting = hitData?.stats?.[0]?.splits?.[0]?.stat || {};
    const pitching = pitchData?.stats?.[0]?.splits?.[0]?.stat || {};

    return {
      AVG: hitting.avg || null,
      runs: safeNumber(hitting.runs),
      gamesPlayed: safeNumber(hitting.gamesPlayed),
      hits: safeNumber(hitting.hits),
      HR: safeNumber(hitting.homeRuns),
      OBP: hitting.obp || null,
      SLG: hitting.slg || null,
      OPS: hitting.ops || null,
      RBI: safeNumber(hitting.rbi),
      BB: safeNumber(hitting.baseOnBalls),
      K: safeNumber(hitting.strikeOuts),
      ERA: pitching.era || null,
      WHIP: pitching.whip || null,
      pitchingBB: safeNumber(pitching.baseOnBalls),
      pitchingK: safeNumber(pitching.strikeOuts),
      pitchingHR: safeNumber(pitching.homeRuns)
    };
  } catch (err) {
    console.error('Error getTeamStats:', err);
    return null;
  }
}

async function getHeadToHead(awayTeamId, homeTeamId, date) {
  try {
    if (!awayTeamId || !homeTeamId) {
      return {
        totalGames: 0,
        awayWins: 0,
        homeWins: 0,
        awayRuns: 0,
        homeRuns: 0,
        lastResults: [],
        games: [],
        note: 'Teams unavailable'
      };
    }

    const season = seasonYear(date);
    const startDate = `${season}-03-01`;
    const endDate = date || getChicagoDate();

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${awayTeamId}&opponentId=${homeTeamId}&startDate=${startDate}&endDate=${endDate}`;
    const response = await fetch(url);
    const data = await response.json();

    let awayWins = 0;
    let homeWins = 0;
    let awayRuns = 0;
    let homeRuns = 0;
    const games = [];

    for (const day of data.dates || []) {
      for (const g of day.games || []) {
        if (g.status?.abstractGameState !== 'Final') continue;

        const actualAwayId = Number(g.teams?.away?.team?.id);
        const actualAwayScore = Number(g.teams?.away?.score ?? 0);
        const actualHomeScore = Number(g.teams?.home?.score ?? 0);

        const awayTeamWasVisitor = actualAwayId === Number(awayTeamId);

        const trackedAwayScore = awayTeamWasVisitor ? actualAwayScore : actualHomeScore;
        const trackedHomeScore = awayTeamWasVisitor ? actualHomeScore : actualAwayScore;

        awayRuns += trackedAwayScore;
        homeRuns += trackedHomeScore;

        if (trackedAwayScore > trackedHomeScore) awayWins++;
        else homeWins++;

        games.push({
          date: g.gameDate?.split('T')[0],
          awayScore: trackedAwayScore,
          homeScore: trackedHomeScore,
          winner: trackedAwayScore > trackedHomeScore ? TEAM_ID_TO_ABBR[awayTeamId] : TEAM_ID_TO_ABBR[homeTeamId]
        });
      }
    }

    const sortedGames = games.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      totalGames: games.length,
      awayWins,
      homeWins,
      awayRuns,
      homeRuns,
      avgAwayRuns: games.length ? Number((awayRuns / games.length).toFixed(2)) : 0,
      avgHomeRuns: games.length ? Number((homeRuns / games.length).toFixed(2)) : 0,
      lastResults: sortedGames.slice(0, 5).map(g => g.winner),
      games: sortedGames.slice(0, 5),
      note: games.length ? 'Real head-to-head data from this season' : 'No completed head-to-head games this season'
    };
  } catch (err) {
    console.error('Error getHeadToHead:', err);
    return {
      totalGames: 0,
      awayWins: 0,
      homeWins: 0,
      awayRuns: 0,
      homeRuns: 0,
      lastResults: [],
      games: [],
      note: 'Unable to load head-to-head data'
    };
  }
}

async function getRecentCompletedGames(teamId, beforeDate, limit = 3) {
  try {
    if (!teamId) return [];

    const end = new Date(`${beforeDate || getChicagoDate()}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);

    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 14);

    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`;
    const response = await fetch(url);
    const data = await response.json();
    const games = [];

    for (const day of data.dates || []) {
      for (const game of day.games || []) {
        if (game.status?.abstractGameState !== 'Final') continue;
        games.push({
          gamePk: game.gamePk,
          gameDate: game.gameDate
        });
      }
    }

    return games
      .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate))
      .slice(0, limit);
  } catch (err) {
    console.error('Error getRecentCompletedGames:', err);
    return [];
  }
}

async function getTeamReliefUsageForGame(teamId, gamePk) {
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    const data = await response.json();
    const side = Number(data?.teams?.away?.team?.id) === Number(teamId) ? 'away' :
      Number(data?.teams?.home?.team?.id) === Number(teamId) ? 'home' : null;

    if (!side) return null;

    const team = data.teams?.[side] || {};
    const pitcherIds = team.pitchers || [];
    const starterId = pitcherIds[0];
    const relievers = pitcherIds
      .filter(id => Number(id) !== Number(starterId))
      .map(id => {
        const player = team.players?.[`ID${id}`];
        const pitching = player?.stats?.pitching || {};
        const pitches = safeNumber(pitching.numberOfPitches) ?? safeNumber(pitching.pitchesThrown) ?? 0;
        const innings = parseInningsPitched(pitching.inningsPitched);

        return {
          id: String(id),
          name: player?.person?.fullName || '',
          pitches,
          innings,
          earnedRuns: safeNumber(pitching.earnedRuns) ?? 0,
          hits: safeNumber(pitching.hits) ?? 0,
          walks: safeNumber(pitching.baseOnBalls) ?? 0
        };
      })
      .filter(reliever => reliever.innings > 0 || reliever.pitches > 0);

    return {
      gamePk: String(gamePk),
      relievers,
      pitchCount: relievers.reduce((sum, reliever) => sum + reliever.pitches, 0),
      innings: relievers.reduce((sum, reliever) => sum + reliever.innings, 0),
      earnedRuns: relievers.reduce((sum, reliever) => sum + reliever.earnedRuns, 0),
      hits: relievers.reduce((sum, reliever) => sum + reliever.hits, 0),
      walks: relievers.reduce((sum, reliever) => sum + reliever.walks, 0)
    };
  } catch (err) {
    console.error('Error getTeamReliefUsageForGame:', err);
    return null;
  }
}

async function getBullpenIntelligence(teamId, date) {
  const recentGames = await getRecentCompletedGames(teamId, date, 3);
  if (!recentGames.length) return null;

  const usage = (await Promise.all(
    recentGames.map(game => getTeamReliefUsageForGame(teamId, game.gamePk))
  )).filter(Boolean);

  if (!usage.length) return null;

  const latest = usage[0];
  const previous = usage[1];
  const latestIds = new Set(latest.relievers.map(reliever => reliever.id));
  const previousIds = new Set(previous?.relievers?.map(reliever => reliever.id) || []);
  const backToBackNames = latest.relievers
    .filter(reliever => previousIds.has(reliever.id))
    .map(reliever => reliever.name)
    .filter(Boolean);
  const totals = usage.reduce((sum, game) => ({
    innings: sum.innings + game.innings,
    earnedRuns: sum.earnedRuns + game.earnedRuns,
    hits: sum.hits + game.hits,
    walks: sum.walks + game.walks,
    pitchCount: sum.pitchCount + game.pitchCount
  }), { innings: 0, earnedRuns: 0, hits: 0, walks: 0, pitchCount: 0 });

  if (!latest.relievers.length && totals.pitchCount <= 0) return null;

  const era = totals.innings > 0 ? ((totals.earnedRuns * 9) / totals.innings).toFixed(2) : null;
  const whip = totals.innings > 0 ? ((totals.hits + totals.walks) / totals.innings).toFixed(2) : null;
  const fatigueScore = Math.round(
    latest.pitchCount +
    (backToBackNames.length * 12) +
    (totals.pitchCount / Math.max(usage.length, 1) * 0.35)
  );
  const fatigue = fatigueScore >= 80 ? 'High' : fatigueScore >= 45 ? 'Medium' : 'Low';
  const rating = fatigue === 'High' ? 'Stressed' : fatigue === 'Medium' ? 'Watch' : 'Fresh';

  return {
    fatigue,
    fatigueScore,
    lastGamePitchCount: latest.pitchCount,
    relieversUsedYesterday: latest.relievers.length,
    backToBackRisk: backToBackNames.length ? backToBackNames.slice(0, 3).join(', ') : 'None',
    bullpenRating: rating,
    last3GamesPitchCount: totals.pitchCount,
    bullpenERA: era,
    bullpenWHIP: whip
  };
}

function nearestHourlyIndex(times = [], targetISO) {
  const target = new Date(targetISO).getTime();
  if (!Number.isFinite(target) || !times.length) return -1;

  let bestIndex = -1;
  let bestDiff = Infinity;

  times.forEach((time, index) => {
    const value = new Date(time).getTime();
    const diff = Math.abs(value - target);
    if (Number.isFinite(value) && diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function windDirectionLabel(degrees) {
  const n = Number(degrees);
  if (!Number.isFinite(n)) return null;
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(n / 45) % 8];
}

function weatherImpact({ temperature, windSpeed, rainProbability }) {
  const temp = Number(temperature);
  const wind = Number(windSpeed);
  const rain = Number(rainProbability);
  const warmBoost = Number.isFinite(temp) && temp >= 78;
  const coldDrag = Number.isFinite(temp) && temp <= 55;
  const windBoost = Number.isFinite(wind) && wind >= 12;
  const rainDrag = Number.isFinite(rain) && rain >= 45;

  if (rainDrag) {
    return {
      runEnvironment: 'Suppressed',
      hrImpact: 'Lower',
      totalImpact: 'Under lean'
    };
  }

  if (warmBoost && windBoost) {
    return {
      runEnvironment: 'Hitter friendly',
      hrImpact: 'Boost',
      totalImpact: 'Over lean'
    };
  }

  if (coldDrag) {
    return {
      runEnvironment: 'Pitcher friendly',
      hrImpact: 'Lower',
      totalImpact: 'Under lean'
    };
  }

  return {
    runEnvironment: warmBoost || windBoost ? 'Slight boost' : 'Neutral',
    hrImpact: warmBoost || windBoost ? 'Slight boost' : 'Neutral',
    totalImpact: warmBoost || windBoost ? 'Slight over lean' : 'Neutral'
  };
}

async function getWeatherContext(homeTeamId, gameDate) {
  try {
    const park = BALLPARKS[Number(homeTeamId)];
    if (!park?.lat || !park?.lon || !gameDate) return null;

    const date = new Date(gameDate).toISOString().slice(0, 10);
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', park.lat);
    url.searchParams.set('longitude', park.lon);
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('start_date', date);
    url.searchParams.set('end_date', date);
    url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,precipitation_probability,pressure_msl,wind_speed_10m,wind_direction_10m');
    url.searchParams.set('temperature_unit', 'fahrenheit');
    url.searchParams.set('wind_speed_unit', 'mph');

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const hourly = data.hourly || {};
    const index = nearestHourlyIndex(hourly.time || [], gameDate);
    if (index < 0) return null;

    const temperature = safeNumber(hourly.temperature_2m?.[index]);
    const humidity = safeNumber(hourly.relative_humidity_2m?.[index]);
    const rainProbability = safeNumber(hourly.precipitation_probability?.[index]);
    const pressure = safeNumber(hourly.pressure_msl?.[index]);
    const windSpeed = safeNumber(hourly.wind_speed_10m?.[index]);
    const windDirectionDegrees = safeNumber(hourly.wind_direction_10m?.[index]);

    if ([temperature, humidity, windSpeed].every(value => value === null)) return null;

    return {
      source: 'Open-Meteo',
      venue: park.name,
      roofStatus: park.roof,
      temperature: temperature !== null ? `${Math.round(temperature)}°F` : null,
      humidity: humidity !== null ? `${Math.round(humidity)}%` : null,
      rainProbability: rainProbability !== null ? `${Math.round(rainProbability)}%` : null,
      pressure: pressure !== null ? `${Math.round(pressure)} hPa` : null,
      windSpeed: windSpeed !== null ? `${Math.round(windSpeed)} mph` : null,
      windDirection: windDirectionLabel(windDirectionDegrees),
      ...weatherImpact({ temperature, windSpeed, rainProbability })
    };
  } catch (err) {
    console.error('Error getWeatherContext:', err);
    return null;
  }
}

async function getPitcherVsOpponentHistory(pitcherId, opponentTeamId, season) {
  try {
    if (!pitcherId || !opponentTeamId) return null;

    const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=gameLog&group=pitching&season=${season}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const splits = data?.stats?.[0]?.splits || [];
    const games = splits.filter(split => {
      const opponentId = split.opponent?.id;
      return opponentId && Number(opponentId) === Number(opponentTeamId);
    });

    if (!games.length) return null;

    const totals = games.reduce((sum, split) => {
      const stat = split.stat || {};
      return {
        starts: sum.starts + (Number(stat.gamesStarted || 0) > 0 ? 1 : 0),
        innings: sum.innings + parseInningsPitched(stat.inningsPitched),
        earnedRuns: sum.earnedRuns + (safeNumber(stat.earnedRuns) ?? 0),
        hits: sum.hits + (safeNumber(stat.hits) ?? 0),
        walks: sum.walks + (safeNumber(stat.baseOnBalls) ?? 0),
        strikeouts: sum.strikeouts + (safeNumber(stat.strikeOuts) ?? 0),
        homeRuns: sum.homeRuns + (safeNumber(stat.homeRuns) ?? 0),
        atBats: sum.atBats + (safeNumber(stat.atBats) ?? 0),
        totalBases: sum.totalBases + (safeNumber(stat.totalBases) ?? 0)
      };
    }, {
      starts: 0,
      innings: 0,
      earnedRuns: 0,
      hits: 0,
      walks: 0,
      strikeouts: 0,
      homeRuns: 0,
      atBats: 0,
      totalBases: 0
    });

    if (totals.innings <= 0) return null;

    return {
      starts: totals.starts || games.length,
      innings: totals.innings.toFixed(1),
      ERA: ((totals.earnedRuns * 9) / totals.innings).toFixed(2),
      WHIP: ((totals.hits + totals.walks) / totals.innings).toFixed(2),
      strikeouts: totals.strikeouts,
      walks: totals.walks,
      homeRuns: totals.homeRuns,
      avgAgainst: totals.atBats > 0 ? (totals.hits / totals.atBats).toFixed(3).replace(/^0/, '') : null,
      opsAgainst: totals.atBats > 0 ? ((totals.hits + totals.walks) / Math.max(totals.atBats + totals.walks, 1) + (totals.totalBases / totals.atBats)).toFixed(3).replace(/^0/, '') : null
    };
  } catch (err) {
    console.error('Error getPitcherVsOpponentHistory:', err);
    return null;
  }
}

function buildPublicGameCenter({
  awayTeam,
  homeTeam,
  awayPitcherStats,
  homePitcherStats,
  awayTeamStats,
  homeTeamStats,
  headToHead,
  odds,
  bullpen,
  weather,
  pitcherVsOpponent
}) {
  const awayRunsPerGame = awayTeamStats?.runs
    ? awayTeamStats.runs / Math.max(awayTeamStats.gamesPlayed || 35, 1)
    : 4.2;
  const homeRunsPerGame = homeTeamStats?.runs
    ? homeTeamStats.runs / Math.max(homeTeamStats.gamesPlayed || 35, 1)
    : 4.2;

  const awayPitcherERA = Number(awayPitcherStats?.ERA || awayTeamStats?.ERA || 4.20);
  const homePitcherERA = Number(homePitcherStats?.ERA || homeTeamStats?.ERA || 4.20);

  const projectedAwayRuns = Math.max(
    2.1,
    ((awayRunsPerGame * 0.65) + (homePitcherERA * 0.35))
  ).toFixed(2);

  const projectedHomeRuns = Math.max(
    2.1,
    ((homeRunsPerGame * 0.65) + (awayPitcherERA * 0.35) + 0.15)
  ).toFixed(2);

  const projectedTotal = (
    Number(projectedAwayRuns) + Number(projectedHomeRuns)
  ).toFixed(2);

  const awayWinPct = Math.round(
    (Number(projectedAwayRuns) / (Number(projectedAwayRuns) + Number(projectedHomeRuns))) * 100
  );

  const homeWinPct = 100 - awayWinPct;

  const modelFavorite =
    homeWinPct > awayWinPct
      ? homeTeam?.team?.name
      : awayTeam?.team?.name;
  const modelPct = Math.max(awayWinPct, homeWinPct);
  const oddsStatus = odds
    ? 'Current sportsbook odds available.'
    : 'Model edge ready. Waiting for real sportsbook odds.';

  return {
    ok: true,
    pitcherStats: {
      away: {
        name: awayTeam?.probablePitcher?.fullName || 'TBD',
        wins: awayPitcherStats?.wins ?? 0,
        losses: awayPitcherStats?.losses ?? 0,
        ERA: awayPitcherStats?.ERA || '--',
        WHIP: awayPitcherStats?.WHIP || '--',
        IP: awayPitcherStats?.IP || '--',
        K: awayPitcherStats?.K ?? 0,
        BB: awayPitcherStats?.BB ?? 0,
        HR: awayPitcherStats?.HR ?? 0,
        battersFaced: awayPitcherStats?.battersFaced ?? null,
        qualityStarts: awayPitcherStats?.qualityStarts ?? null,
        gamesStarted: awayPitcherStats?.gamesStarted ?? 0,
        record: awayPitcherStats?.record || '--'
      },
      home: {
        name: homeTeam?.probablePitcher?.fullName || 'TBD',
        wins: homePitcherStats?.wins ?? 0,
        losses: homePitcherStats?.losses ?? 0,
        ERA: homePitcherStats?.ERA || '--',
        WHIP: homePitcherStats?.WHIP || '--',
        IP: homePitcherStats?.IP || '--',
        K: homePitcherStats?.K ?? 0,
        BB: homePitcherStats?.BB ?? 0,
        HR: homePitcherStats?.HR ?? 0,
        battersFaced: homePitcherStats?.battersFaced ?? null,
        qualityStarts: homePitcherStats?.qualityStarts ?? null,
        gamesStarted: homePitcherStats?.gamesStarted ?? 0,
        record: homePitcherStats?.record || '--'
      }
    },
    teamStats: {
      away: {
        AVG: awayTeamStats?.AVG || '--',
        OBP: awayTeamStats?.OBP || '--',
        SLG: awayTeamStats?.SLG || '--',
        OPS: awayTeamStats?.OPS || '--',
        runs: awayTeamStats?.runs ?? 0,
        hits: awayTeamStats?.hits ?? 0,
        HR: awayTeamStats?.HR ?? 0,
        RBI: awayTeamStats?.RBI ?? 0,
        BB: awayTeamStats?.BB ?? 0,
        K: awayTeamStats?.K ?? 0,
        ERA: awayTeamStats?.ERA || '--',
        WHIP: awayTeamStats?.WHIP || '--'
      },
      home: {
        AVG: homeTeamStats?.AVG || '--',
        OBP: homeTeamStats?.OBP || '--',
        SLG: homeTeamStats?.SLG || '--',
        OPS: homeTeamStats?.OPS || '--',
        runs: homeTeamStats?.runs ?? 0,
        hits: homeTeamStats?.hits ?? 0,
        HR: homeTeamStats?.HR ?? 0,
        RBI: homeTeamStats?.RBI ?? 0,
        BB: homeTeamStats?.BB ?? 0,
        K: homeTeamStats?.K ?? 0,
        ERA: homeTeamStats?.ERA || '--',
        WHIP: homeTeamStats?.WHIP || '--'
      }
    },
    advancedModel: {
      projectedRuns: {
        away: projectedAwayRuns,
        home: projectedHomeRuns,
        total: projectedTotal
      },
      simulation: {
        runs: projectedTotal,
        awayWinPct,
        homeWinPct,
        mostCommonScore: `${Math.round(projectedAwayRuns)}-${Math.round(projectedHomeRuns)}`,
        volatility: projectedTotal >= 9 ? 'High' : projectedTotal >= 7.5 ? 'Medium' : 'Low'
      },
      marketEdge: {
        modelFavorite,
        vegasFavorite: odds?.modelSide || null,
        modelPct,
        vegasImpliedPct: odds?.vegasImplied || null,
        edgePct: odds?.modelEdge || null,
        status: oddsStatus
      },
      alerts: [
        'Review confirmed lineup before first pitch',
        'Check bullpen usage before final betting decision',
        projectedTotal >= 9 ? 'High scoring environment detected' : 'Moderate scoring projection'
      ]
    },
    headToHead: {
      totalGames: headToHead.totalGames,
      awayWins: headToHead.awayWins,
      homeWins: headToHead.homeWins,
      awayRuns: headToHead.awayRuns,
      homeRuns: headToHead.homeRuns,
      note: headToHead.note
    },
    injuries: {
      away: [],
      home: []
    },
    bullpen: bullpen || {},
    weather: weather || {},
    pitcherVsOpponent: pitcherVsOpponent || {},
    odds: odds || {}
  };
}

router.get('/games', async (req, res) => {
  try {
    const queryDate = req.query.date || getChicagoDate();
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(queryDate)}&hydrate=probablePitcher,linescore,team`;
    const response = await fetch(url);
    const data = await response.json();
    const rawGames = data.dates?.[0]?.games || [];

    const games = await Promise.all(rawGames.map(async (game) => {
      const awayTeam = game.teams?.away;
      const homeTeam = game.teams?.home;

      const awayTeamId = awayTeam?.team?.id;
      const homeTeamId = homeTeam?.team?.id;

      const [awayLast5, homeLast5] = await Promise.all([
        getLast5(awayTeamId, queryDate),
        getLast5(homeTeamId, queryDate)
      ]);

      return {
        gamePk: game.gamePk,
        date: game.gameDate ? game.gameDate.split('T')[0] : queryDate,
        time: formatTime(game.gameDate),
        gameTime: formatTime(game.gameDate),
        status: game.status?.detailedState || 'Scheduled',
        abstractStatus: game.status?.abstractGameState || '',
        awayTeamId,
        homeTeamId,
        awayTeamName: awayTeam?.team?.name || '',
        homeTeamName: homeTeam?.team?.name || '',
        awayAbbrev: TEAM_ABBR[awayTeam?.team?.name] || TEAM_ID_TO_ABBR[awayTeamId] || '',
        homeAbbrev: TEAM_ABBR[homeTeam?.team?.name] || TEAM_ID_TO_ABBR[homeTeamId] || '',
        awayPitcher: awayTeam?.probablePitcher?.fullName || 'TBD',
        homePitcher: homeTeam?.probablePitcher?.fullName || 'TBD',
        awayPitcherId: awayTeam?.probablePitcher?.id || null,
        homePitcherId: homeTeam?.probablePitcher?.id || null,
        awayScore: awayTeam?.score ?? 0,
        homeScore: homeTeam?.score ?? 0,
        awayWins: awayTeam?.leagueRecord?.wins ?? 0,
        awayLosses: awayTeam?.leagueRecord?.losses ?? 0,
        homeWins: homeTeam?.leagueRecord?.wins ?? 0,
        homeLosses: homeTeam?.leagueRecord?.losses ?? 0,
        awayLast5,
        homeLast5,
        inning: game.linescore?.currentInningOrdinal || '',
        inningState: game.linescore?.inningState || '',
        balls: game.linescore?.balls ?? 0,
        strikes: game.linescore?.strikes ?? 0,
        outs: game.linescore?.outs ?? 0,
        runnerOn1b: game.linescore?.offense?.first ? true : false,
        runnerOn2b: game.linescore?.offense?.second ? true : false,
        runnerOn3b: game.linescore?.offense?.third ? true : false
      };
    }));

    res.json({ ok: true, date: queryDate, games });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Unable to load MLB games.' });
  }
});

router.get('/game-center/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;
    const queryDate = req.query.date || getChicagoDate();
    const season = seasonYear(queryDate);

    const gamesUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(queryDate)}&hydrate=probablePitcher,linescore,team`;
    const gamesRes = await fetch(gamesUrl);
    const gamesData = await gamesRes.json();
    const rawGames = gamesData.dates?.[0]?.games || [];
    const rawGame = rawGames.find(g => String(g.gamePk) === String(gamePk));

    if (!rawGame) {
      return res.json({ ok: false, error: 'Game not found.' });
    }

    const awayTeam = rawGame.teams?.away;
    const homeTeam = rawGame.teams?.home;

    const awayTeamId = awayTeam?.team?.id;
    const homeTeamId = homeTeam?.team?.id;
    const awayPitcherId = awayTeam?.probablePitcher?.id || null;
    const homePitcherId = homeTeam?.probablePitcher?.id || null;

    const [
      awayPitcherStats,
      homePitcherStats,
      awayTeamStats,
      homeTeamStats,
      headToHead,
      oddsData,
      awayBullpen,
      homeBullpen,
      weather,
      awayPitcherVsOpponent,
      homePitcherVsOpponent
    ] = await Promise.all([
      getPitcherStats(awayPitcherId, season),
      getPitcherStats(homePitcherId, season),
      getTeamStats(awayTeamId, season),
      getTeamStats(homeTeamId, season),
      getHeadToHead(awayTeamId, homeTeamId, queryDate),
      fetchCurrentOdds(),
      getBullpenIntelligence(awayTeamId, queryDate),
      getBullpenIntelligence(homeTeamId, queryDate),
      getWeatherContext(homeTeamId, rawGame.gameDate),
      getPitcherVsOpponentHistory(awayPitcherId, homeTeamId, season),
      getPitcherVsOpponentHistory(homePitcherId, awayTeamId, season)
    ]);
    const rawOdds = findOddsForRawGame(oddsData, rawGame);

    const projectedCenter = buildPublicGameCenter({
      awayTeam,
      homeTeam,
      awayPitcherStats,
      homePitcherStats,
      awayTeamStats,
      homeTeamStats,
      headToHead,
      odds: null,
      bullpen: {
        away: awayBullpen,
        home: homeBullpen
      },
      weather,
      pitcherVsOpponent: {
        away: awayPitcherVsOpponent,
        home: homePitcherVsOpponent
      }
    });
    const odds = normalizeOddsForGame(
      rawOdds,
      rawGame,
      projectedCenter.advancedModel.marketEdge.modelFavorite,
      projectedCenter.advancedModel.marketEdge.modelPct
    );

    res.json(buildPublicGameCenter({
      awayTeam,
      homeTeam,
      awayPitcherStats,
      homePitcherStats,
      awayTeamStats,
      homeTeamStats,
      headToHead,
      odds,
      bullpen: {
        away: awayBullpen,
        home: homeBullpen
      },
      weather,
      pitcherVsOpponent: {
        away: awayPitcherVsOpponent,
        home: homePitcherVsOpponent
      }
    }));

  } catch (error) {
    console.error('Error game-center:', error);
    res.status(500).json({ ok: false, error: 'Unable to load game center.' });
  }
});

router.get('/lineup/:id', async (req, res) => {
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${req.params.id}/boxscore`);
    const data = await response.json();

    res.json({
      ok: true,
      awayLineup: formatLineup(data?.teams?.away?.players),
      homeLineup: formatLineup(data?.teams?.home?.players)
    });
  } catch (error) {
    res.json({ ok: false, awayLineup: [], homeLineup: [] });
  }
});

router.get('/player-props/:gamePk', async (req, req_res) => {
  try {
    const { gamePk } = req.params;
    const season = new Date().getFullYear();

    const boxRes = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    const boxData = await boxRes.json();

    const players = [
      ...Object.values(boxData?.teams?.home?.players || {}),
      ...Object.values(boxData?.teams?.away?.players || {})
    ].filter(p => p.battingOrder && p.person?.id);

    async function getPlayerStats(player) {
      try {
        const id = player.person.id;
        const teamId =
          player.parentTeamId ||
          player.currentTeam?.id ||
          player.team?.id ||
          null;

        const teamAbbrev = TEAM_ID_TO_ABBR[Number(teamId)] || '';

        const statsRes = await fetch(
          `https://statsapi.mlb.com/api/v1/people/${id}/stats?stats=season&group=hitting&season=${season}`
        );

        const statsData = await statsRes.json();
        const stat = statsData?.stats?.[0]?.splits?.[0]?.stat || {};

        const avg = Number(stat.avg || 0);
        const obp = Number(stat.obp || 0);
        const slg = Number(stat.slg || 0);
        const ops = Number(stat.ops || 0);
        const ab = Number(stat.atBats || 0);
        const hits = Number(stat.hits || 0);
        const hr = Number(stat.homeRuns || 0);
        const rbi = Number(stat.rbi || 0);

        const hitRate = ab > 0 ? hits / ab : avg || 0;
        const hrRate = ab > 0 ? hr / ab : 0;

        const hitChance = Math.min(88, Math.max(35, Math.round((hitRate * 100) + (obp * 18) + (ops * 10))));
        const hrChance = Math.min(35, Math.max(2, Math.round((hrRate * 100) + (slg * 12) + (ops * 4))));

        return {
          name: player.person.fullName,
          personId: id,
          teamId,
          team: teamAbbrev,
          teamAbbrev,
          hitChance,
          hrChance,
          homeRuns: hr,
          rbi,
          avg,
          ops,
          slg,
          rating: hitChance >= 68 ? 'High' : hitChance >= 55 ? 'Medium' : 'Low'
        };
      } catch {
        return null;
      }
    }

    const allProps = (await Promise.all(players.map(getPlayerStats))).filter(Boolean);

    const topHits = [...allProps].sort((a, b) => b.hitChance - a.hitChance).slice(0, 12);
    const topHR = [...allProps].sort((a, b) => b.hrChance - a.hrChance).slice(0, 12);

    req_res.json({ ok: true, allProps, topHits, topHR });
  } catch (error) {
    req_res.json({ ok: false, allProps: [], topHits: [], topHR: [] });
  }
});

router.get('/live-scores', async (req, res) => {
  try {
    const response = await fetch('https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore');
    const data = await response.json();

    const games = data.dates?.[0]?.games?.map(g => ({
      gamePk: g.gamePk,
      status: g.status?.detailedState || '',
      inning: g.linescore?.currentInningOrdinal || '',
      inningState: g.linescore?.inningState || '',
      homeScore: g.teams?.home?.score ?? 0,
      awayScore: g.teams?.away?.score ?? 0,
      balls: g.linescore?.balls ?? 0,
      strikes: g.linescore?.strikes ?? 0,
      outs: g.linescore?.outs ?? 0,
      runnerOn1b: g.linescore?.offense?.first ? true : false,
      runnerOn2b: g.linescore?.offense?.second ? true : false,
      runnerOn3b: g.linescore?.offense?.third ? true : false
    })) || [];

    res.json({ ok: true, games });
  } catch (error) {
    res.json({ ok: false, games: [] });
  }
});

export default router;
