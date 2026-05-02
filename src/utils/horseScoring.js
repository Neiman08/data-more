function oddsToImplied(odds) {
  if (!odds || !odds.includes('/')) return 20;
  const [a, b] = odds.split('/').map(Number);
  return Number(((b / (a + b)) * 100).toFixed(2));
}

function formScore(form = '') {
  const results = String(form).split('-').map(Number);
  let score = 50;

  results.forEach(pos => {
    if (pos === 1) score += 14;
    else if (pos === 2) score += 9;
    else if (pos === 3) score += 5;
    else if (pos >= 6) score -= 7;
    else score -= 2;
  });

  return score;
}

export function analyzeRace(race) {
  const runners = race.runners.map(h => {
    const fs = formScore(h.form);
    const speed = Number(h.speed || 75);
    const implied = oddsToImplied(h.odds);

    const rawScore =
      fs * 0.45 +
      speed * 0.40 +
      (100 - implied) * 0.15;

    return {
      horse: h.name,
      jockey: h.jockey,
      trainer: h.trainer,
      odds: h.odds,
      impliedProbability: implied,
      modelScore: Number(rawScore.toFixed(2))
    };
  });

  const total = runners.reduce((sum, h) => sum + h.modelScore, 0);

  const ranked = runners
    .map(h => ({
      ...h,
      probability: Number(((h.modelScore / total) * 100).toFixed(2)),
      edge: Number((((h.modelScore / total) * 100) - h.impliedProbability).toFixed(2))
    }))
    .sort((a, b) => b.probability - a.probability);

  return {
    pick: ranked[0],
    top4: ranked.slice(0, 4),
    bets: {
      win: ranked[0].horse,
      exacta: `${ranked[0].horse} / ${ranked[1].horse}, ${ranked[2].horse}`,
      trifecta: `${ranked[0].horse} / ${ranked[1].horse}, ${ranked[2].horse} / ${ranked[1].horse}, ${ranked[2].horse}, ${ranked[3].horse}`
    }
  };
}