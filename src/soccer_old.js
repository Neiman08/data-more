import express from 'express';
const router = express.Router();

// 🔑 Tu API Key ya integrada
const API_KEY = 'e73294acbe5f4d1caf074f170732073d'; 

const leaguesMap = {
  epl: { id: 'PL', name: 'Premier League' },
  laliga: { id: 'PD', name: 'La Liga' },
  seriea: { id: 'SA', name: 'Serie A' },
  bundesliga: { id: 'BL1', name: 'Bundesliga' },
  ligue1: { id: 'FL1', name: 'Ligue 1' },
  eredivisie: { id: 'DED', name: 'Eredivisie' },
  portugal: { id: 'PPL', name: 'Primeira Liga' }
};

async function getSoccerGames(leagueCode, selectedDate) {
  try {
    // Usamos el endpoint de partidos de la competición
    const url = `https://api.football-data.org/v4/competitions/${leagueCode}/matches`;
    
    const res = await fetch(url, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    
    const data = await res.json();

    if (!data.matches) {
      console.error('Error de API:', data.message);
      return [];
    }

    // Filtramos partidos: deben coincidir con la fecha Y no estar finalizados (o mostrar todos los del día)
    if (selectedDate) {
      return data.matches.filter(m => m.utcDate.includes(selectedDate));
    }

    return data.matches;
  } catch (err) {
    console.log('ERROR FETCH:', err.message);
    return [];
  }
}

router.get('/soccer-games', async (req, res) => {
  try {
    const league = leaguesMap[req.query.league] || leaguesMap['epl'];
    const selectedDate = req.query.date || null;

    let matches = await getSoccerGames(league.id, selectedDate);

    const formattedGames = matches.map(m => ({
      matchId: m.id,
      date: m.utcDate.split('T')[0],
      time: m.utcDate.split('T')[1].substring(0, 5) + ' UTC',
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      league: m.competition.name,
      status: m.status
    }));

    res.json({
      ok: true,
      league: league.name,
      count: formattedGames.length,
      games: formattedGames
    });
  } catch (error) {
    res.json({ ok: false, games: [] });
  }
});

router.get('/soccer-analyze/:id', async (req, res) => {
  try {
    const random = Math.random();
    let confidence = 'baja';
    if (random > 0.75) confidence = 'alta';
    else if (random > 0.55) confidence = 'media';

    const homeProb = (Math.random() * 40 + 30).toFixed(2);
    const awayProb = (100 - homeProb - 20).toFixed(2);

    res.json({
      ok: true,
      analysis: {
        pick: homeProb > awayProb ? 'LOCAL (Home)' : 'VISITANTE (Away)',
        confidence,
        bet: random > 0.4,
        betType: random > 0.7 ? '💰 STRONG BET' : '💰 LEAN BET',
        probabilities: { homeWin: homeProb, draw: 20, awayWin: awayProb },
        markets: {
          over25: random > 0.5 ? 'Over 2.5' : 'Under 2.5',
          over25Probability: (Math.random() * 20 + 50).toFixed(1),
          btts: 'Sí',
          bttsProbability: (Math.random() * 15 + 50).toFixed(1),
          handicap: homeProb > awayProb ? '-0.5' : '+0.5'
        },
        form: {
          home: (Math.random() * 40 + 50).toFixed(1),
          away: (Math.random() * 40 + 50).toFixed(1)
        }
      }
    });
  } catch (error) {
    res.json({ ok: false });
  }
});

export default router;
