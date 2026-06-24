import express from 'express';

const router = express.Router();

router.get('/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;
    const { date } = req.query;

    if (!gamePk || !date) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros: gamePk y date son requeridos' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const [
      gamesRes,
      lineupRes,
      propsRes,
      analysisRes,
      gameCenterRes
    ] = await Promise.all([
      fetch(`${baseUrl}/api/baseball/games?date=${date}`),
      fetch(`${baseUrl}/api/baseball/lineup/${gamePk}`).catch(() => null),
      fetch(`${baseUrl}/api/baseball/player-props/${gamePk}`).catch(() => null),
      fetch(`${baseUrl}/api/analyze/${gamePk}?date=${date}`).catch(() => null),
      fetch(`${baseUrl}/api/baseball/game-center/${gamePk}?date=${date}`).catch(() => null)
    ]);

    const gamesData = await gamesRes.json();
    const lineupData = lineupRes ? await lineupRes.json() : { ok: false };
    const propsData = propsRes ? await propsRes.json() : { ok: false };
    const analysisData = analysisRes ? await analysisRes.json() : { ok: false };
    const gameCenterData = gameCenterRes ? await gameCenterRes.json() : { ok: false };

    const game = gamesData.games?.find(g => String(g.gamePk) === String(gamePk));

    if (!game) {
      return res.json({ ok: false, error: 'Juego no encontrado' });
    }

    res.json({
      ok: true,
      game,
      lineup: lineupData,
      props: propsData,
      analysis: analysisData?.analysis || null,
      headToHead: gameCenterData?.headToHead || null,
      pitcherStats: gameCenterData?.pitcherStats || null,
      teamStats: gameCenterData?.teamStats || null
    });

  } catch (error) {
    console.error('gameDetails error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
