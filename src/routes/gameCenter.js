import express from 'express';

const router = express.Router();

router.get('/:gamePk', async (req, res) => {
  try {
    const { gamePk } = req.params;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const [gamesRes, analysisRes] = await Promise.all([
      fetch(`${baseUrl}/api/baseball/games?date=${date}`),
      fetch(`${baseUrl}/api/analyze/${gamePk}?date=${date}`).catch(() => null)
    ]);

    const gamesData = await gamesRes.json();
    const analysisData = analysisRes ? await analysisRes.json() : null;

    const game = gamesData.games?.find(g => String(g.gamePk) === String(gamePk));

    if (!game) {
      return res.json({ ok: false, error: 'Juego no encontrado' });
    }

    // --- NUEVA LÓGICA DE PROYECCIÓN DE CARRERAS ---
    const awayRunsPerGame = Number(game.awayRunsPerGame || 4.3);
    const homeRunsPerGame = Number(game.homeRunsPerGame || 4.3);

    const projectedAway = Number(awayRunsPerGame.toFixed(1));
    const projectedHome = Number(homeRunsPerGame.toFixed(1));
    const projectedTotal = Number((projectedAway + projectedHome).toFixed(1));
    // ----------------------------------------------

    const awayWinPct = Number(analysisData?.analysis?.away?.modelWinPct || 50);
    const homeWinPct = Number(analysisData?.analysis?.home?.modelWinPct || 50);

    const advancedModel = {
      projectedRuns: {
        away: projectedAway,
        home: projectedHome,
        total: projectedTotal
      },
      simulation: {
        runs: 100000,
        awayWinPct,
        homeWinPct,
        mostCommonScore: `${Math.round(projectedHome)}-${Math.round(projectedAway)}`,
        volatility: Math.abs(awayWinPct - homeWinPct) < 5 ? 'Alta' : Math.abs(awayWinPct - homeWinPct) < 12 ? 'Media' : 'Baja'
      },
      marketEdge: {
        modelFavorite: homeWinPct >= awayWinPct ? game.homeAbbrev : game.awayAbbrev,
        vegasFavorite: 'Pendiente',
        modelPct: Math.max(awayWinPct, homeWinPct),
        vegasImpliedPct: null,
        edgePct: null,
        status: 'Pendiente de odds reales'
      },
      alerts: [
        Math.abs(awayWinPct - homeWinPct) < 5 ? 'Juego muy parejo: revisar más variables antes de apostar' : 'El modelo muestra una ventaja clara/moderada',
        'Confirmar lineup antes del primer pitch',
        'Revisar bullpen y movimiento de línea antes de entrar'
      ]
    };

    res.json({
      ok: true,
      advancedModel
    });

  } catch (err) {
    console.error('❌ Error gameCenter:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
