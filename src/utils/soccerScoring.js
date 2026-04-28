export function buildSoccerAnalysis({ match, homeRecentEvents, awayRecentEvents }) {
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;

  const homeForm = analyzeRecentForm(homeRecentEvents, homeTeam);
  const awayForm = analyzeRecentForm(awayRecentEvents, awayTeam);

  const homeBase = homeForm.formScore + 4;
  const awayBase = awayForm.formScore;

  const totalPower = homeBase + awayBase;

  let homeWin = totalPower ? (homeBase / totalPower) * 75 : 38;
  let awayWin = totalPower ? (awayBase / totalPower) * 75 : 34;

  const draw = clamp(
    28 - Math.abs(homeBase - awayBase) * 0.12,
    18,
    32
  );

  const remaining = 100 - draw;
  const winTotal = homeWin + awayWin;

  homeWin = (homeWin / winTotal) * remaining;
  awayWin = (awayWin / winTotal) * remaining;

  const homeProjectedGoals = clamp(
    1.15 + (homeForm.avgGF * 0.55) - (awayForm.avgGA * 0.25),
    0.3,
    3.8
  );

  const awayProjectedGoals = clamp(
    1.00 + (awayForm.avgGF * 0.55) - (homeForm.avgGA * 0.25),
    0.2,
    3.5
  );

  const projectedTotal = homeProjectedGoals + awayProjectedGoals;

  const over25Prob = clamp(
    45 + (projectedTotal - 2.4) * 18,
    35,
    75
  );

  // 🔥 NUEVO BTTS MÁS INTELIGENTE
  const minGoals = Math.min(homeProjectedGoals, awayProjectedGoals);

  const bttsProb = clamp(
    25 +
    (minGoals * 18) +                              // ambos deben anotar
    ((homeForm.avgGA + awayForm.avgGA - 2.2) * 10) // defensas débiles
    - (Math.abs(homeWin - awayWin) * 0.15),        // partidos desbalanceados bajan BTTS
    20,
    75
  );

  // 🔥 UMBRAL MÁS ESTRICTO
  let bttsPick = 'No';
  if (bttsProb >= 62 && minGoals >= 0.9) {
    bttsPick = 'Sí';
  }

  let pick = 'Draw';
  let pickProb = draw;

  if (homeWin > awayWin && homeWin > draw) {
    pick = homeTeam;
    pickProb = homeWin;
  }

  if (awayWin > homeWin && awayWin > draw) {
    pick = awayTeam;
    pickProb = awayWin;
  }

  const handicap =
    homeWin >= awayWin
      ? `${homeTeam} -0.5`
      : `${awayTeam} +0.5`;

  return {
    matchId: match.matchId,
    matchup: `${homeTeam} vs ${awayTeam}`,
    pick,
    confidence: confidence(pickProb),

    // 🔥 DATOS PARA FRONTEND
    probability: round(pickProb),
    market: '1X2 / Principal',
    projectedTotal: round(projectedTotal),
    modelNote: 'Modelo basado en forma reciente, goles a favor, goles en contra, localía y balance ofensivo/defensivo.',

    probabilities: {
      homeWin: round(homeWin),
      draw: round(draw),
      awayWin: round(awayWin),
      pickProbability: round(pickProb)
    },

    form: {
      home: homeForm,
      away: awayForm
    },

    goals: {
      homeProjectedGoals: round(homeProjectedGoals),
      awayProjectedGoals: round(awayProjectedGoals),
      projectedTotal: round(projectedTotal)
    },

    markets: {
      over25: over25Prob >= 55 ? 'Over 2.5' : 'Under 2.5',
      over25Probability: round(over25Prob),
      btts: bttsPick,
      bttsProbability: round(bttsProb),
      handicap
    },

    notes: [
      'Modelo basado en forma reciente.',
      'BTTS requiere probabilidad alta + ambos equipos con gol esperado.',
      'Se penalizan partidos desbalanceados.'
    ]
  };
}