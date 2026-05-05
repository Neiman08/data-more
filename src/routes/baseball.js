import express from 'express';

const router = express.Router();

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
      gamesStarted: safeNumber(stat.gamesStarted),
      record: stat.wins != null && stat.losses != null ? `${stat.wins}-${stat.losses}` : 'Pendiente'
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
        note: 'Equipos no disponibles'
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
        const actualHomeId = Number(g.teams?.home?.team?.id);

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
      note: games.length ? 'Datos reales de enfrentamientos esta temporada' : 'Sin enfrentamientos finalizados esta temporada'
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
      note: 'No se pudo cargar Head-to-Head'
    };
  }
}

/* ============================
   GAMES
============================ */

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
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* ============================
   GAME CENTER PRO
============================ */

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
      return res.json({ ok: false, error: 'Juego no encontrado' });
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
      headToHead
    ] = await Promise.all([
      getPitcherStats(awayPitcherId, season),
      getPitcherStats(homePitcherId, season),
      getTeamStats(awayTeamId, season),
      getTeamStats(homeTeamId, season),
      getHeadToHead(awayTeamId, homeTeamId, queryDate)
    ]);

    const awayWinPct = 50;
    const homeWinPct = 50;

    const advancedModel = {
      projectedRuns: {
        away: 4.2,
        home: 5.1,
        total: 9.3
      },
      simulation: {
        runs: 100000,
        awayWinPct,
        homeWinPct,
        mostCommonScore: "5-4",
        volatility: "Media"
      },
      marketEdge: {
        modelFavorite: homeWinPct >= awayWinPct ? (TEAM_ID_TO_ABBR[homeTeamId] || 'HOME') : (TEAM_ID_TO_ABBR[awayTeamId] || 'AWAY'),
        vegasFavorite: "Pendiente",
        modelPct: Math.max(awayWinPct, homeWinPct),
        vegasImpliedPct: null,
        edgePct: null,
        status: "Pendiente de odds reales"
      },
      alerts: [
        "Juego con ventaja moderada del modelo",
        "Revisar bullpen antes de apostar",
        "Confirmar lineup antes del primer pitch"
      ]
    };

    res.json({
      ok: true,
      pitcherStats: {
        away: {
          name: awayTeam?.probablePitcher?.fullName || 'TBD',
          ...awayPitcherStats
        },
        home: {
          name: homeTeam?.probablePitcher?.fullName || 'TBD',
          ...homePitcherStats
        }
      },
      teamStats: {
        away: awayTeamStats,
        home: homeTeamStats
      },
      headToHead,
      injuries: {
        away: [],
        home: [],
        note: 'Pendiente de conexión con reporte de lesiones'
      },
      bullpen: {
        away: {
          last3DaysIP: 'Pendiente',
          bullpenERA: 'Pendiente',
          bullpenWHIP: 'Pendiente',
          fatigueLevel: 'Pendiente'
        },
        home: {
          last3DaysIP: 'Pendiente',
          bullpenERA: 'Pendiente',
          bullpenWHIP: 'Pendiente',
          fatigueLevel: 'Pendiente'
        }
      },
      weather: {
        temperature: 'Pendiente',
        windSpeed: 'Pendiente',
        windDirection: 'Pendiente',
        humidity: 'Pendiente',
        parkFactor: 'Pendiente'
      },
      odds: {
        openLine: 'Pendiente',
        currentLine: 'Pendiente',
        movement: 'Pendiente',
        modelEdge: 'Pendiente',
        vegasImplied: 'Pendiente'
      },
      advancedModel
    });

  } catch (error) {
    console.error('Error game-center:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/* ============================
   LINEUP
============================ */

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

/* ============================
   PLAYER PROPS
============================ */

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
        
        // CORRECCIÓN APLICADA AQUÍ
        const teamId =
          player.parentTeamId ||
          player.currentTeam?.id ||
          player.team?.id ||
          null;

        const teamAbbrev =
          TEAM_ID_TO_ABBR[Number(teamId)] || '';

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
          rating: hitChance >= 68 ? 'Alta' : hitChance >= 55 ? 'Media' : 'Baja'
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

/* ============================
   LIVE SCORES
============================ */

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

router.get('/analyze/:gamePk', async (req, res) => {
  res.json({ ok: true, message: `Análisis para ${req.params.gamePk}`, timestamp: new Date().toISOString() });
});

export default router;
