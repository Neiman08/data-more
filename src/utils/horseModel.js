export function analyzeRace(race) {
  if (!race || !race.runners || race.runners.length === 0) {
    return null;
  }

  const runners = race.runners.map(r => {
    const figs = r.speedFigures || [];

    if (figs.length === 0) {
      return { ...r, score: 0, probability: 0 };
    }

    // 🔥 PROMEDIO
    const avg = figs.reduce((a, b) => a + b, 0) / figs.length;

    // 🔥 ÚLTIMO VALOR (forma reciente)
    const last = figs[figs.length - 1];

    // 🔥 TENDENCIA (últimos 3)
    const recent = figs.slice(-3);
    const trend = recent.length > 0
      ? recent.reduce((a, b) => a + b, 0) / recent.length
      : avg;

    // 🔥 CONSISTENCIA (menos variación = mejor)
    const variance = figs.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / figs.length;
    const consistency = 100 - Math.min(variance, 100);

    // 🔥 ODDS FACTOR (valor escondido)
    let oddsFactor = 5;
    if (r.odds && r.odds !== "N/A") {
      const [num] = r.odds.split('/');
      oddsFactor = 100 / (parseFloat(num) + 1);
    }

    // 🧠 SCORE FINAL
    const score =
      avg * 0.5 +
      trend * 0.2 +
      last * 0.1 +
      consistency * 0.1 +
      oddsFactor * 0.1;

    return {
      ...r,
      avg: Math.round(avg),
      trend: Math.round(trend),
      last,
      consistency: Math.round(consistency),
      score
    };
  });

  // 🔥 ORDENAR
  runners.sort((a, b) => b.score - a.score);

  // 🔥 PROBABILIDADES
  const total = runners.reduce((sum, r) => sum + r.score, 0);

  runners.forEach(r => {
    r.probability = total > 0
      ? ((r.score / total) * 100).toFixed(2)
      : 0;
  });

  // 🔥 PICKS
  const top = runners[0];
  const second = runners[1];
  const third = runners[2];

  return {
    pick: top?.name,
    confidence:
      top?.probability > 25 ? "ALTA" :
      top?.probability > 18 ? "MEDIA" : "BAJA",

    top3: runners.slice(0, 3),

    bets: {
      win: top?.name,
      exacta: `${top?.name} / ${second?.name}`,
      trifecta: `${top?.name} / ${second?.name} / ${third?.name}`
    },

    fullRanking: runners
  };
}