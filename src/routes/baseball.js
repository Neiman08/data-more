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

const last5Cache = {};
const LAST5_CACHE_TTL = 1000 * 60 * 10;

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

async function getLast5(teamId, beforeDate) {
  try {
    if (!teamId) return 'Sin data';

    const cacheKey = `${teamId}-${beforeDate}`;
    const cached = last5Cache[cacheKey];

    if (cached && Date.now() - cached.time < LAST5_CACHE_TTL) {
      return cached.value;
    }

    const end = new Date(beforeDate);
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

        const teamScore = isHome
          ? Number(game.teams?.home?.score ?? 0)
          : Number(game.teams?.away?.score ?? 0);

        const oppScore = isHome
          ? Number(game.teams?.away?.score ?? 0)
          : Number(game.teams?.home?.score ?? 0);

        results.push({
          date: game.gameDate,
          result: teamScore > oppScore ? 'W' : 'L'
        });
      }
    }

    const last5 = results
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(g => g.result)
      .join(' ');

    const value = last5 || 'Sin data';

    last5Cache[cacheKey] = {
      time: Date.now(),
      value
    };

    return value;
  } catch (err) {
    console.error('Error getLast5:', err);
    return 'Sin data';
  }
}

router.get('/games', async (req, res) => {
  try {
    const queryDate = req.query.date || new Date().toISOString().split('T')[0];

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(queryDate)}&hydrate=probablePitcher,linescore,team`;

    const response = await fetch(url);
    const data = await response.json();

    const rawGames = data.dates?.[0]?.games || [];

    const games = await Promise.all(
      rawGames.map(async (game) => {
        const awayTeam = game.teams?.away;
        const homeTeam = game.teams?.home;

        const awayTeamName = awayTeam?.team?.name || '';
        const homeTeamName = homeTeam?.team?.name || '';

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

          status: game.status?.detailedState || 'Scheduled',
          abstractStatus: game.status?.abstractGameState || '',
          codedGameState: game.status?.codedGameState || '',

          awayTeamName,
          homeTeamName,

          awayTeamId,
          homeTeamId,

          awayAbbrev: TEAM_ABBR[awayTeamName] || '',
          homeAbbrev: TEAM_ABBR[homeTeamName] || '',

          awayPitcher: awayTeam?.probablePitcher?.fullName || 'TBD',
          homePitcher: homeTeam?.probablePitcher?.fullName || 'TBD',

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

          runnerOn1b: !!game.linescore?.offense?.first,
          runnerOn2b: !!game.linescore?.offense?.second,
          runnerOn3b: !!game.linescore?.offense?.third
        };
      })
    );

    res.json({
      ok: true,
      date: queryDate,
      count: games.length,
      games
    });
  } catch (error) {
    console.error('Error /api/baseball/games:', error);
    res.status(500).json({
      ok: false,
      message: 'Error cargando juegos MLB',
      error: error.message
    });
  }
});

router.get('/lineup/:id', async (req, res) => {
  try {
    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/game/${req.params.id}/boxscore`
    );

    const data = await response.json();

    res.json({
      ok: true,
      awayLineup: formatLineup(data?.teams?.away?.players),
      homeLineup: formatLineup(data?.teams?.home?.players),
      homeConfirmed: true
    });
  } catch (error) {
    console.error('Error lineup:', error);
    res.json({
      ok: false,
      awayLineup: [],
      homeLineup: []
    });
  }
});

router.get('/player-props/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;

    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`
    );

    const data = await response.json();

    const players = [
      ...Object.values(data?.teams?.home?.players || {}),
      ...Object.values(data?.teams?.away?.players || {})
    ].filter(p => p.battingOrder);

    const props = players.map(p => {
      const batting = p.stats?.batting || {};

      const hits = Number(batting.hits || 0);
      const homeRuns = Number(batting.homeRuns || 0);
      const atBats = Number(batting.atBats || 0);

      let hitChance = Math.floor(Math.random() * 40) + 40;
      let hrChance = Math.floor(Math.random() * 15) + 2;

      if (atBats > 0) {
        hitChance = Math.min(85, Math.max(35, 45 + hits * 12));
        hrChance = Math.min(35, Math.max(2, 4 + homeRuns * 12));
      }

      return {
        name: p.person?.fullName || 'N/A',
        personId: p.person?.id,
        team: p.parentTeamId,
        hitChance,
        hrChance,
        rbiChance: Math.floor(Math.random() * 25) + 10,
        rating: hitChance > 65 ? 'Alta' : hitChance > 55 ? 'Media' : 'Baja'
      };
    });

    res.json({
      ok: true,
      props
    });
  } catch (error) {
    console.error('Error player-props:', error);
    res.json({
      ok: false,
      props: []
    });
  }
});

router.get('/live-scores', async (req, res) => {
  try {
    const response = await fetch(
      'https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore'
    );

    const data = await response.json();

    const games = data.dates?.[0]?.games?.map(g => {
      const ls = g.linescore || {};

      return {
        gamePk: g.gamePk,

        status: g.status?.detailedState || '',
        abstractStatus: g.status?.abstractGameState || '',

        inning: ls.currentInningOrdinal || '',
        inningState: ls.inningState || '',

        balls: ls.balls ?? 0,
        strikes: ls.strikes ?? 0,
        outs: ls.outs ?? 0,

        homeScore: g.teams?.home?.score ?? 0,
        awayScore: g.teams?.away?.score ?? 0,

        runnerOn1b: !!ls.offense?.first,
        runnerOn2b: !!ls.offense?.second,
        runnerOn3b: !!ls.offense?.third
      };
    }) || [];

    res.json({
      ok: true,
      games
    });
  } catch (error) {
    console.error('Error live-scores:', error);
    res.json({
      ok: false,
      games: []
    });
  }
});

router.get('/analyze/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;

    res.json({
      ok: true,
      message: `Análisis generado para el juego ${gamePk}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      ok: false,
      error: error.message
    });
  }
});

export default router;