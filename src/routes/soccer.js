import express from 'express';
import { buildSoccerAnalysis } from '../utils/soccerScoring.js';

const router = express.Router();

const API_KEY = 'e73294acbe5f4d1caf074f170732073d';

const leaguesMap = {
  epl: { id: 'PL', name: 'Premier League' },
  laliga: { id: 'PD', name: 'La Liga' },
  seriea: { id: 'SA', name: 'Serie A' },
  bundesliga: { id: 'BL1', name: 'Bundesliga' },
  ligue1: { id: 'FL1', name: 'Ligue 1' }
};

const cache = {};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getLeague(req) {
  const key = String(req.query.league || 'epl').toLowerCase();
  return {
    key: leaguesMap[key] ? key : 'epl',
    ...(leaguesMap[key] || leaguesMap.epl)
  };
}

async function footballDataFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, {
      headers: { 'X-Auth-Token': API_KEY }
    });

    const data = await res.json();

    if (res.status === 429) {
      const waitSeconds = Number(data.message?.match(/\d+/)?.[0] || 5);
      console.log(`⏳ Rate limit. Esperando ${waitSeconds} segundos...`);
      await sleep(waitSeconds * 1000);
      continue;
    }

    if (!res.ok) {
      console.error('Football-data error:', data);
      return null;
    }

    return data;
  }

  return null;
}

async function getSoccerGames(leagueCode, selectedDate) {
  const cacheKey = `games-${leagueCode}-${selectedDate || 'all'}`;

  if (cache[cacheKey]) return cache[cacheKey];

  const url = `https://api.football-data.org/v4/competitions/${leagueCode}/matches`;
  const data = await footballDataFetch(url);

  if (!data || !data.matches) return [];

  let matches = data.matches;

  if (selectedDate) {
    matches = matches.filter(m => m.utcDate.startsWith(selectedDate));
  }

  cache[cacheKey] = matches;
  return matches;
}

async function getFinishedMatches(leagueCode) {
  const cacheKey = `finished-${leagueCode}`;

  if (cache[cacheKey]) return cache[cacheKey];

  const url = `https://api.football-data.org/v4/competitions/${leagueCode}/matches?status=FINISHED`;
  const data = await footballDataFetch(url);

  if (!data || !data.matches) return [];

  cache[cacheKey] = data.matches;
  return data.matches;
}

function getRecentTeamMatchesFromList(allFinishedMatches, teamId) {
  return allFinishedMatches
    .filter(m => m.homeTeam.id === teamId || m.awayTeam.id === teamId)
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
    .slice(0, 5)
    .map(m => ({
      strHomeTeam: m.homeTeam.name,
      strAwayTeam: m.awayTeam.name,
      intHomeScore: m.score.fullTime.home,
      intAwayScore: m.score.fullTime.away
    }));
}

function formatMatch(m) {
  return {
    matchId: m.id,
    date: m.utcDate.split('T')[0],
    time: m.utcDate.split('T')[1].substring(0, 5) + ' UTC',
    homeTeam: m.homeTeam.name,
    awayTeam: m.awayTeam.name,
    homeTeamId: m.homeTeam.id,
    awayTeamId: m.awayTeam.id,
    league: m.competition.name,
    status: m.status
  };
}

function buildMatchObject(matchRaw) {
  return {
    matchId: matchRaw.id,
    matchup: `${matchRaw.homeTeam.name} vs ${matchRaw.awayTeam.name}`,
    homeTeam: matchRaw.homeTeam.name,
    awayTeam: matchRaw.awayTeam.name,
    homeTeamId: matchRaw.homeTeam.id,
    awayTeamId: matchRaw.awayTeam.id
  };
}

function getBetType(analysis) {
  if (analysis.confidence === 'alta') return '💰 STRONG BET';
  if (analysis.confidence === 'media') return '💰 LEAN BET';
  return '🚫 NO BET';
}

function getTicketMarket(analysis) {
  const pickProb = Number(analysis?.probabilities?.pickProbability || 0);
  const overProb = Number(analysis?.markets?.over25Probability || 0);
  const bttsProb = Number(analysis?.markets?.bttsProbability || 0);

  const options = [
    {
      market: 'Moneyline / 1X2',
      pick: analysis.pick,
      probability: pickProb,
      confidence: analysis.confidence
    },
    {
      market: 'Over/Under 2.5',
      pick: analysis.markets.over25,
      probability: overProb,
      confidence: overProb >= 62 ? 'alta' : overProb >= 55 ? 'media' : 'baja'
    },
    {
      market: 'BTTS',
      pick: analysis.markets.btts === 'Sí' ? 'BTTS Sí' : 'BTTS No',
      probability: bttsProb,
      confidence: bttsProb >= 62 ? 'alta' : bttsProb >= 55 ? 'media' : 'baja'
    }
  ];

  return options.sort((a, b) => b.probability - a.probability)[0];
}

function buildSoccerTicket(analyses) {
  const picks = analyses
    .filter(Boolean)
    .map(a => {
      const bestMarket = getTicketMarket(a);

      return {
        matchId: a.matchId,
        matchup: a.matchup,
        pick: bestMarket.pick,
        market: bestMarket.market,
        probability: bestMarket.probability,
        confidence: bestMarket.confidence,
        betType: getBetType({ confidence: bestMarket.confidence })
      };
    })
    .filter(p => {
      const conf = String(p.confidence || '').toLowerCase();
      return (
        (conf === 'alta' && p.probability >= 60) ||
        (conf === 'media' && p.probability >= 56)
      );
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  return {
    ticketType: picks.length >= 3 ? 'Parlay sugerido' : 'Straight Bets',
    totalPicks: picks.length,
    picks,
    note: 'Ticket sugerido basado en probabilidad, forma reciente y confianza del modelo.'
  };
}

async function analyzeMatch(matchRaw, leagueCode, allFinishedMatches) {
  const match = buildMatchObject(matchRaw);

  const homeRecentEvents = getRecentTeamMatchesFromList(
    allFinishedMatches,
    match.homeTeamId
  );

  const awayRecentEvents = getRecentTeamMatchesFromList(
    allFinishedMatches,
    match.awayTeamId
  );

  return buildSoccerAnalysis({
    match,
    homeRecentEvents,
    awayRecentEvents
  });
}

// --- Rutas Existentes ---

router.get('/soccer-games', async (req, res) => {
  try {
    const league = getLeague(req);
    const selectedDate = req.query.date || null;

    const matches = await getSoccerGames(league.id, selectedDate);
    const formattedGames = matches.map(formatMatch);

    res.json({
      ok: true,
      league: league.name,
      leagueKey: league.key,
      selectedDate,
      count: formattedGames.length,
      games: formattedGames
    });

  } catch (error) {
    console.error('ERROR SOCCER GAMES:', error.message);
    res.status(500).json({ ok: false, error: error.message, games: [] });
  }
});

router.get('/soccer-analyze/:id', async (req, res) => {
  try {
    const league = getLeague(req);
    const selectedDate = req.query.date || null;
    const matchId = String(req.params.id);

    const matches = await getSoccerGames(league.id, selectedDate);
    const matchRaw = matches.find(m => String(m.id) === matchId);

    if (!matchRaw) {
      return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    }

    const allFinishedMatches = await getFinishedMatches(league.id);
    const analysis = await analyzeMatch(matchRaw, league.id, allFinishedMatches);

    res.json({ ok: true, league: league.name, leagueKey: league.key, selectedDate, analysis });

  } catch (error) {
    console.error('ERROR SOCCER ANALYZE:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/soccer-ticket', async (req, res) => {
  try {
    const league = getLeague(req);
    const selectedDate = req.query.date || null;

    const matches = await getSoccerGames(league.id, selectedDate);

    if (!matches.length) {
      return res.json({
        ok: true,
        league: league.name,
        leagueKey: league.key,
        selectedDate,
        gamesAnalyzed: 0,
        ticket: {
          ticketType: 'Sin ticket',
          totalPicks: 0,
          picks: [],
          note: 'No hay partidos para esta liga y fecha.'
        }
      });
    }

    const allFinishedMatches = await getFinishedMatches(league.id);

    const analyses = await Promise.all(
      matches.map(matchRaw =>
        analyzeMatch(matchRaw, league.id, allFinishedMatches)
      )
    );

    const ticket = buildSoccerTicket(analyses);

    res.json({ ok: true, league: league.name, leagueKey: league.key, selectedDate, gamesAnalyzed: analyses.length, ticket });

  } catch (error) {
    console.error('ERROR SOCCER TICKET:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// --- Nuevas Rutas Globales ---

router.get('/soccer-games-global', async (req, res) => {
  try {
    const selectedDate = req.query.date || null;
    const allGames = [];

    for (const [leagueKey, leagueData] of Object.entries(leaguesMap)) {
      const matches = await getSoccerGames(leagueData.id, selectedDate);

      const formatted = matches.map(m => ({
        ...formatMatch(m),
        leagueKey,
        leagueName: leagueData.name
      }));

      allGames.push(...formatted);
    }

    res.json({
      ok: true,
      selectedDate,
      count: allGames.length,
      games: allGames
    });

  } catch (error) {
    console.error('ERROR SOCCER GLOBAL GAMES:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      games: []
    });
  }
});

router.get('/soccer-ticket-global', async (req, res) => {
  try {
    const selectedDate = req.query.date || null;
    const allAnalyses = [];

    for (const [leagueKey, leagueData] of Object.entries(leaguesMap)) {
      const matches = await getSoccerGames(leagueData.id, selectedDate);
      const allFinishedMatches = await getFinishedMatches(leagueData.id);

      for (const matchRaw of matches) {
        const analysis = await analyzeMatch(
          matchRaw,
          leagueData.id,
          allFinishedMatches
        );

        const bestMarket = getTicketMarket(analysis);

        allAnalyses.push({
          matchId: analysis.matchId,
          league: leagueData.name,
          leagueKey,
          matchup: analysis.matchup,
          pick: bestMarket.pick,
          market: bestMarket.market,
          probability: bestMarket.probability,
          confidence: bestMarket.confidence,
          betType: getBetType({ confidence: bestMarket.confidence })
        });
      }
    }

    const validPicks = allAnalyses
      .filter(p => {
        const conf = String(p.confidence || '').toLowerCase();
        const prob = Number(p.probability || 0);

        return (
          (conf === 'alta' && prob >= 60) ||
          (conf === 'media' && prob >= 57)
        );
      })
      .sort((a, b) => Number(b.probability) - Number(a.probability));

    res.json({
      ok: true,
      selectedDate,
      gamesAnalyzed: allAnalyses.length,
      ticket: {
        ticketType: 'Ticket Global Soccer',
        totalPicks: validPicks.length,
        picks: validPicks,
        seguro: validPicks.slice(0, 4),
        medio: validPicks.slice(0, 7),
        grande: validPicks.slice(0, 12),
        note: 'Ticket mixto generado con los mejores picks de Premier League, La Liga, Serie A, Bundesliga y Ligue 1.'
      }
    });

  } catch (error) {
    console.error('ERROR SOCCER GLOBAL TICKET:', error.message);
    res.status(500).json({
      ok: false,
      error: error.message,
      ticket: {
        ticketType: 'Error',
        totalPicks: 0,
        picks: [],
        seguro: [],
        medio: [],
        grande: [],
        note: 'No se pudo generar el ticket global.'
      }
    });
  }
});

export default router;
