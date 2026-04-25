import express from 'express';

const router = express.Router();

const API_KEY = '3';

const leaguesMap = {
  epl: { id: '4328', name: 'English Premier League' },
  laliga: { id: '4335', name: 'Spanish La Liga' },
  seriea: { id: '4332', name: 'Italian Serie A' },
  bundesliga: { id: '4331', name: 'German Bundesliga' },
  ligue1: { id: '4334', name: 'French Ligue 1' },
  eredivisie: { id: '4337', name: 'Dutch Eredivisie' },
  portugal: { id: '4344', name: 'Portuguese Primeira Liga' }
};

function getLeagueFromRequest(req) {
  const key = String(req.query.league || 'epl').toLowerCase();
  return {
    key,
    ...(leaguesMap[key] || leaguesMap.epl)
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();

  console.log('URL:', url);
  console.log('STATUS:', res.status);

  if (text.trim().startsWith('<')) {
    throw new Error('La API devolvió HTML, no JSON');
  }

  return JSON.parse(text);
}

function sameLeague(event, league) {
  const eventLeagueId = String(event.idLeague || '');
  const eventLeagueName = String(event.strLeague || '').toLowerCase();
  const selectedLeagueName = String(league.name || '').toLowerCase();

  return (
    eventLeagueId === String(league.id) ||
    eventLeagueName === selectedLeagueName ||
    eventLeagueName.includes(selectedLeagueName) ||
    selectedLeagueName.includes(eventLeagueName)
  );
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function demoGames(league, selectedDate = null) {
  const date = selectedDate || today();

  const gamesByLeague = {
    epl: [
      ['Manchester United', 'Chelsea'],
      ['Arsenal', 'Liverpool'],
      ['Tottenham', 'Newcastle']
    ],
    laliga: [
      ['Real Madrid', 'Barcelona'],
      ['Atletico Madrid', 'Sevilla'],
      ['Valencia', 'Villarreal']
    ],
    seriea: [
      ['Inter Milan', 'Juventus'],
      ['AC Milan', 'Napoli'],
      ['Roma', 'Lazio']
    ],
    bundesliga: [
      ['Bayern Munich', 'Borussia Dortmund'],
      ['RB Leipzig', 'Bayer Leverkusen'],
      ['Stuttgart', 'Eintracht Frankfurt']
    ],
    ligue1: [
      ['PSG', 'Marseille'],
      ['Lyon', 'Monaco'],
      ['Lille', 'Nice']
    ],
    eredivisie: [
      ['Ajax', 'PSV Eindhoven'],
      ['Feyenoord', 'AZ Alkmaar'],
      ['Twente', 'Utrecht']
    ],
    portugal: [
      ['Benfica', 'Porto'],
      ['Sporting CP', 'Braga'],
      ['Boavista', 'Guimaraes']
    ]
  };

  const list = gamesByLeague[league.key] || gamesByLeague.epl;

  return list.map((teams, index) => ({
    idEvent: `demo-${league.key}-${index + 1}`,
    dateEvent: date,
    strTime: index === 0 ? '15:00:00' : index === 1 ? '17:30:00' : '20:00:00',
    strHomeTeam: teams[0],
    strAwayTeam: teams[1],
    idHomeTeam: `demo-home-${index + 1}`,
    idAwayTeam: `demo-away-${index + 1}`,
    strLeague: league.name,
    idLeague: league.id
  }));
}

async function getGamesByDate(league, selectedDate) {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${selectedDate}&s=Soccer`;
    const data = await fetchJson(url);
    const events = data.events || [];

    const filtered = events
      .filter(e => e.dateEvent === selectedDate)
      .filter(e => sameLeague(e, league));

    return filtered;
  } catch (error) {
    console.log('ERROR getGamesByDate:', error.message);
    return [];
  }
}

async function getNextLeagueGames(league) {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsnextleague.php?id=${league.id}`;
    const data = await fetchJson(url);
    const events = data.events || [];

    const filtered = events.filter(e => sameLeague(e, league));

    if (filtered.length > 0) {
      return filtered;
    }

    console.log('⚠️ API vacía, usando fallback demo');
    return demoGames(league);

  } catch (error) {
    console.log('ERROR getNextLeagueGames:', error.message);
    console.log('⚠️ Usando fallback demo');
    return demoGames(league);
  }
}

async function getSoccerGames(league, selectedDate) {
  if (selectedDate) {
    const gamesByDate = await getGamesByDate(league, selectedDate);

    if (gamesByDate.length > 0) {
      return {
        games: gamesByDate,
        source: 'eventsday',
        usedDate: selectedDate
      };
    }

    const nextGames = await getNextLeagueGames(league);

    if (nextGames.length > 0) {
      return {
        games: nextGames.map(game => ({
          ...game,
          dateEvent: game.dateEvent || selectedDate
        })),
        source: 'fallback_next_available',
        usedDate: nextGames[0]?.dateEvent || selectedDate
      };
    }

    return {
      games: demoGames(league, selectedDate),
      source: 'fallback_demo',
      usedDate: selectedDate
    };
  }

  const nextGames = await getNextLeagueGames(league);

  return {
    games: nextGames.length > 0 ? nextGames : demoGames(league),
    source: nextGames.length > 0 ? 'eventsnextleague' : 'fallback_demo',
    usedDate: nextGames[0]?.dateEvent || today()
  };
}

router.get('/soccer-games', async (req, res) => {
  try {
    const league = getLeagueFromRequest(req);
    const selectedDate = req.query.date || null;

    const result = await getSoccerGames(league, selectedDate);

    const formattedGames = result.games.map(g => ({
      matchId: g.idEvent,
      date: g.dateEvent,
      time: g.strTime,
      homeTeam: g.strHomeTeam,
      awayTeam: g.strAwayTeam,
      homeTeamId: g.idHomeTeam,
      awayTeamId: g.idAwayTeam,
      league: g.strLeague || league.name,
      leagueKey: league.key,
      leagueId: league.id
    }));

    res.json({
      ok: true,
      selectedLeague: league.name,
      selectedLeagueKey: league.key,
      selectedLeagueId: league.id,
      requestedDate: selectedDate,
      usedDate: result.usedDate,
      source: result.source,
      count: formattedGames.length,
      games: formattedGames
    });

  } catch (error) {
    console.error('ERROR SOCCER GAMES:', error.message);

    res.json({
      ok: false,
      error: error.message,
      count: 0,
      games: []
    });
  }
});

router.get('/soccer-analyze/:id', async (req, res) => {
  try {
    const random = Math.random();

    let confidence = 'baja';
    if (random > 0.75) confidence = 'alta';
    else if (random > 0.55) confidence = 'media';

    const homeProb = Number((Math.random() * 40 + 30).toFixed(2));
    const drawProb = 20;
    const awayProb = Number((100 - homeProb - drawProb).toFixed(2));

    const analysis = {
      pick: homeProb > awayProb ? 'HOME' : 'AWAY',
      confidence,
      bet: random > 0.4,
      betType: random > 0.7 ? 'STRONG BET' : 'LEAN BET',

      probabilities: {
        homeWin: homeProb,
        draw: drawProb,
        awayWin: awayProb
      },

      markets: {
        over25: random > 0.5 ? 'Over 2.5' : 'Under 2.5',
        over25Probability: Number((Math.random() * 20 + 50).toFixed(1)),
        btts: 'Sí',
        bttsProbability: Number((Math.random() * 15 + 50).toFixed(1)),
        handicap: homeProb > awayProb ? 'HOME -0.5' : 'AWAY +0.5'
      },

      form: {
        home: Number((Math.random() * 40 + 50).toFixed(1)),
        away: Number((Math.random() * 40 + 50).toFixed(1))
      }
    };

    res.json({ ok: true, analysis });

  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});

export default router;