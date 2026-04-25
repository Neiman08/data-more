import express from 'express';

const router = express.Router();

function getBestProbability(analysis) {
  const awayProb = Number(analysis?.away?.modelWinPct || 0);
  const homeProb = Number(analysis?.home?.modelWinPct || 0);

  return Math.max(awayProb, homeProb);
}

function buildSuggestedTicket(analyses) {
  const picks = analyses
    .filter(a => a && a.pick)
    .map(a => ({
      gamePk: a.gamePk,
      matchup: a.matchup,
      pick: a.pick,
      market: 'Moneyline',
      confidence: a.confidence,
      probability: getBestProbability(a)
    }))
    .filter(p => {
      const conf = String(p.confidence || '').toLowerCase();
      return (
        (conf === 'alta' && p.probability >= 58) ||
        (conf === 'media' && p.probability >= 56)
      );
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 4);

  return {
    ticketType: picks.length >= 3 ? 'Parlay sugerido' : 'Straight Bets',
    totalPicks: picks.length,
    picks,
    note: 'Ticket generado con los análisis reales de la fecha seleccionada.'
  };
}

router.get('/', (req, res) => {
  res.send('BASEBALL ROUTE OK');
});

router.get('/ticket', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

    const gamesRes = await fetch(`${baseUrl}/api/games?date=${encodeURIComponent(date)}`);
    const gamesData = await gamesRes.json();

    if (!gamesData.ok || !gamesData.games || !gamesData.games.length) {
      return res.json({
        ok: true,
        date,
        ticket: {
          ticketType: 'Sin ticket',
          totalPicks: 0,
          picks: [],
          note: `No hay juegos disponibles para ${date}.`
        }
      });
    }

    const analyses = [];

    for (const game of gamesData.games) {
      try {
        const analyzeRes = await fetch(
          `${baseUrl}/api/analyze/${game.gamePk}?date=${encodeURIComponent(date)}`
        );

        const analyzeData = await analyzeRes.json();

        if (analyzeData.ok && analyzeData.analysis) {
          analyses.push(analyzeData.analysis);
        }
      } catch (err) {
        console.log(`No se pudo analizar juego ${game.gamePk}:`, err.message);
      }
    }

    const ticket = buildSuggestedTicket(analyses);

    res.json({
      ok: true,
      date,
      gamesAnalyzed: analyses.length,
      ticket
    });

  } catch (error) {
    console.error('ERROR BASEBALL TICKET:', error.message);

    res.json({
      ok: false,
      error: error.message,
      ticket: {
        ticketType: 'Error',
        totalPicks: 0,
        picks: [],
        note: 'No se pudo generar el ticket.'
      }
    });
  }
});

export default router;