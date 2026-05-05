import express from 'express';

const router = express.Router();

router.get('/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;
    const { date } = req.query;

    if (!gamePk || !date) {
      return res.status(400).json({ ok:false, error:'Faltan parámetros' });
    }

    // 🔥 LLAMADAS EN PARALELO
    const [
      gamesRes,
      lineupRes,
      propsRes,
      analysisRes
    ] = await Promise.all([
      fetch(`http://localhost:3000/api/baseball/games?date=${date}`),
      fetch(`http://localhost:3000/api/baseball/lineup/${gamePk}`).catch(()=>null),
      fetch(`http://localhost:3000/api/baseball/player-props/${gamePk}`).catch(()=>null),
      fetch(`http://localhost:3000/api/analyze/${gamePk}?date=${date}`).catch(()=>null)
    ]);

    const gamesData = await gamesRes.json();
    const lineupData = lineupRes ? await lineupRes.json() : { ok:false };
    const propsData = propsRes ? await propsRes.json() : { ok:false };
    const analysisData = analysisRes ? await analysisRes.json() : { ok:false };

    const game = gamesData.games.find(g => String(g.gamePk) === String(gamePk));

    if (!game) {
      return res.json({ ok:false, error:'Juego no encontrado' });
    }

    // 🔥 SIMULACIÓN PRO (luego lo hacemos real)
    const headToHead = {
      totalGames: 4,
      awayWins: 3,
      homeWins: 1,
      lastResults: ['W','W','L','W']
    };

    const pitcherStats = {
      away: {
        name: game.awayPitcher,
        wins: 2,
        losses: 2,
        ERA: 3.45,
        WHIP: 1.22,
        K: 45
      },
      home: {
        name: game.homePitcher,
        wins: 3,
        losses: 1,
        ERA: 2.90,
        WHIP: 1.10,
        K: 52
      }
    };

    res.json({
      ok: true,
      game,
      lineup: lineupData,
      props: propsData,
      analysis: analysisData?.analysis || null,
      headToHead,
      pitcherStats
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok:false, error:error.message });
  }
});

export default router;