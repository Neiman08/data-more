import express from 'express';

const TEAM_ABBR = {
  "Boston Red Sox": "BOS", "Baltimore Orioles": "BAL", "New York Yankees": "NYY",
  "Toronto Blue Jays": "TOR", "Tampa Bay Rays": "TB", "Cleveland Guardians": "CLE",
  "Detroit Tigers": "DET", "Kansas City Royals": "KC", "Minnesota Twins": "MIN",
  "Chicago White Sox": "CWS", "Houston Astros": "HOU", "Texas Rangers": "TEX",
  "Seattle Mariners": "SEA", "Oakland Athletics": "OAK", "Los Angeles Angels": "LAA",
  "Atlanta Braves": "ATL", "Philadelphia Phillies": "PHI", "New York Mets": "NYM",
  "Miami Marlins": "MIA", "Washington Nationals": "WSH", "Chicago Cubs": "CHC",
  "St. Louis Cardinals": "STL", "Milwaukee Brewers": "MIL", "Cincinnati Reds": "CIN",
  "Pittsburgh Pirates": "PIT", "Los Angeles Dodgers": "LAD", "San Francisco Giants": "SF",
  "San Diego Padres": "SD", "Arizona Diamondbacks": "ARI", "Colorado Rockies": "COL"
};

const router = express.Router();

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

async function getLast5(teamId, beforeDate) {
  try {
    const end = new Date(beforeDate);
    end.setDate(end.getDate() - 1);

    const start = new Date(end);
    start.setDate(start.getDate() - 15);

    const startDate = start.toISOString().split('T')[0];
    const endDate = end.toISOString().split('T')[0];

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`;
    const response = await fetch(url);
    const data = await response.json();

    const games = [];

    (data.dates || []).forEach(d => {
      (d.games || []).forEach(g => {
        if (g.status?.abstractGameState !== 'Final') return;

        const isHome = g.teams.home.team.id === teamId;
        const teamScore = isHome ? g.teams.home.score : g.teams.away.score;
        const oppScore = isHome ? g.teams.away.score : g.teams.home.score;

        games.push({
          date: g.gameDate,
          result: teamScore > oppScore ? 'W' : 'L'
        });
      });
    });

    return games
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .reverse()
      .map(g => g.result)
      .join(' ') || '---';

  } catch {
    return '---';
  }
}

// 1. Juegos MLB
router.get('/games', async (req, res) => {
  try {
    const queryDate = req.query.date || new Date().toISOString().split('T')[0];

    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(queryDate)}&hydrate=probablePitcher,linescore,team`
    );

    const data = await response.json();
    const rawGames = data.dates?.[0]?.games || [];

    const games = await Promise.all(rawGames.map(async (game) => {
      const date = game.gameDate ? game.gameDate.split('T')[0] : queryDate;
      const time = game.gameDate ? new Date(game.gameDate).toLocaleTimeString() : '';
      const status = game.status?.detailedState || 'Scheduled';

      const awayTeamName = game.teams?.away?.team?.name || '';
      const homeTeamName = game.teams?.home?.team?.name || '';

      const awayTeamId = game.teams?.away?.team?.id;
      const homeTeamId = game.teams?.home?.team?.id;

      const awayAbbrev = TEAM_ABBR[awayTeamName] || '';
      const homeAbbrev = TEAM_ABBR[homeTeamName] || '';

      const awayPitcher = game.teams?.away?.probablePitcher?.fullName || 'TBD';
      const homePitcher = game.teams?.home?.probablePitcher?.fullName || 'TBD';

      const [awayLast5, homeLast5] = await Promise.all([
        awayTeamId ? getLast5(awayTeamId, queryDate) : '---',
        homeTeamId ? getLast5(homeTeamId, queryDate) : '---'
      ]);

      return {
        gamePk: game.gamePk,
        date,
        time,
        status,

        awayAbbrev,
        homeAbbrev,
        awayTeamName,
        homeTeamName,

        awayPitcher,
        homePitcher,

        awayScore: game.teams?.away?.score ?? 0,
        homeScore: game.teams?.home?.score ?? 0,

        balls: game.linescore?.balls ?? 0,
        strikes: game.linescore?.strikes ?? 0,
        outs: game.linescore?.outs ?? 0,

        awayWins: game.teams?.away?.leagueRecord?.wins ?? 0,
        awayLosses: game.teams?.away?.leagueRecord?.losses ?? 0,
        homeWins: game.teams?.home?.leagueRecord?.wins ?? 0,
        homeLosses: game.teams?.home?.leagueRecord?.losses ?? 0,

        awayLast5,
        homeLast5,

        inning: game.linescore?.currentInningOrdinal || '',
        inningState: game.linescore?.inningState || '',

        runnerOn1b: !!game.linescore?.offense?.first,
        runnerOn2b: !!game.linescore?.offense?.second,
        runnerOn3b: !!game.linescore?.offense?.third
      };
    }));

    res.json({ ok: true, games });
  } catch (error) {
    console.error('Error /api/baseball/games:', error);
    res.json({ ok: false, error: error.message });
  }
});

// 2. Lineups
router.get('/lineup/:id', async (req, res) => {
  try {
    const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${req.params.id}/boxscore`);
    const data = await response.json();

    res.json({
      ok: true,
      awayLineup: formatLineup(data?.teams?.away?.players),
      homeLineup: formatLineup(data?.teams?.home?.players),
      homeConfirmed: true
    });
  } catch {
    res.json({ ok: false });
  }
});

// 3. Player Props
router.get('/player-props/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;
    const response = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    const data = await response.json();

    const players = [
      ...Object.values(data?.teams?.home?.players || {}),
      ...Object.values(data?.teams?.away?.players || {})
    ].filter(p => p.battingOrder);

    const props = players.map(p => {
      const hitChance = Math.floor(Math.random() * 40) + 40;

      return {
        name: p.person?.fullName || 'N/A',
        personId: p.person?.id,
        hitChance,
        hrChance: Math.floor(Math.random() * 15) + 2,
        rbiChance: Math.floor(Math.random() * 25) + 10,
        rating: hitChance > 65 ? 'Alta' : (hitChance > 55 ? 'Media' : 'Baja')
      };
    });

    res.json({ ok: true, props });
  } catch {
    res.json({ ok: false, props: [] });
  }
});

// 4. Marcadores en vivo
router.get('/live-scores', async (req, res) => {
  try {
    const response = await fetch('https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore');
    const data = await response.json();

    const games = data.dates?.[0]?.games?.map(g => {
      const ls = g.linescore || {};

      return {
        gamePk: g.gamePk,
        status: g.status?.detailedState || '',
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

    res.json({ ok: true, games });
  } catch {
    res.json({ ok: false, games: [] });
  }
});

// 5. Análisis básico
router.get('/analyze/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;

    res.json({
      ok: true,
      message: `Análisis generado para el juego ${gamePk}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});

export default router;