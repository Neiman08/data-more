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

// Helper para obtener la fecha actual en la zona horaria de Chicago (Central Time)
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
        results.push({ date: game.gameDate, result: teamScore > oppScore ? 'W' : 'L' });
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

// Rutas
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
      const [awayLast5, homeLast5] = await Promise.all([
        getLast5(awayTeam?.team?.id, queryDate),
        getLast5(homeTeam?.team?.id, queryDate)
      ]);

      return {
        gamePk: game.gamePk,
        date: game.gameDate ? game.gameDate.split('T')[0] : queryDate,
        time: formatTime(game.gameDate),
      
        status: game.status?.detailedState || 'Scheduled',
        abstractStatus: game.status?.abstractGameState || '',
      
        awayTeamName: awayTeam?.team?.name || '',
        homeTeamName: homeTeam?.team?.name || '',
      
        awayAbbrev: TEAM_ABBR[awayTeam?.team?.name] || '',
        homeAbbrev: TEAM_ABBR[homeTeam?.team?.name] || '',
      
        awayPitcher: awayTeam?.probablePitcher?.fullName || 'TBD',
        homePitcher: homeTeam?.probablePitcher?.fullName || 'TBD',
      
        // ✅ SCORE
        awayScore: awayTeam?.score ?? 0,
        homeScore: homeTeam?.score ?? 0,
      
        // ✅ RECORD
        awayWins: awayTeam?.leagueRecord?.wins ?? 0,
        awayLosses: awayTeam?.leagueRecord?.losses ?? 0,
        homeWins: homeTeam?.leagueRecord?.wins ?? 0,
        homeLosses: homeTeam?.leagueRecord?.losses ?? 0,
      
        awayLast5,
        homeLast5,
      
        // ✅ LIVE DATA
        inning: game.linescore?.currentInningOrdinal || '',
        inningState: game.linescore?.inningState || '',
      
        balls: game.linescore?.balls ?? 0,
        strikes: game.linescore?.strikes ?? 0,
        outs: game.linescore?.outs ?? 0,
      
        // ✅ BASES (CRÍTICO)
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

router.get('/player-props/:gamePk', async (req, res) => {
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

        const hitRate = ab > 0 ? hits / ab : avg || 0;
        const hrRate = ab > 0 ? hr / ab : 0;

        const hitChance = Math.min(88, Math.max(35, Math.round((hitRate * 100) + (obp * 18) + (ops * 10))));
        const hrChance = Math.min(35, Math.max(2, Math.round((hrRate * 100) + (slg * 12) + (ops * 4))));

        return {
          name: player.person.fullName,
          personId: id,
          team: player.parentTeamId || '',
          hitChance,
          hrChance,
          homeRuns: hr,
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

    const topHits = [...allProps].sort((a, b) => b.hitChance - a.hitChance).slice(0, 3);
    const topHR = [...allProps].sort((a, b) => b.hrChance - a.hrChance).slice(0, 3);

    res.json({ ok: true, topHits, topHR });
  } catch (error) {
    res.json({ ok: false, topHits: [], topHR: [] });
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
    
      // ✅ CONTADOR
      balls: g.linescore?.balls ?? 0,
      strikes: g.linescore?.strikes ?? 0,
      outs: g.linescore?.outs ?? 0,
    
      // ✅ BASES
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
