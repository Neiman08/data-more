function oddsToImplied(odds) {
  if (!odds || !odds.includes('/')) return 20;

  const [a, b] = odds.split('/').map(Number);
  return Number(((b / (a + b)) * 100).toFixed(2));
}

function formScore(form = '') {
  const results = String(form).split('-').map(Number);

  let score = 50;

  results.forEach(pos => {
    if (pos === 1) score += 15;
    else if (pos === 2) score += 10;
    else if (pos === 3) score += 5;
    else if (pos >= 6) score -= 8;
    else score -= 2;
  });

  return score;
}

export function analyzeRace(race) {
  if (!race?.runners?.length) {
    return { error: 'No runners data' };
  }

  const runners = race.runners.map(h => {
    const fs = formScore(h.form);
    const speed = Number(h.speed || 75);
    const implied = oddsToImplied(h.odds);

    const score =
      fs * 0.5 +
      speed * 0.35 +
      (100 - implied) * 0.15;

    return {
      horse: h.name,
      odds: h.odds,
      implied,
      score: Number(score.toFixed(2))
    };
  });

  const total = runners.reduce((sum, h) => sum + h.score, 0);

  const ranked = runners
    .map(h => ({
      ...h,
      probability: Number(((h.score / total) * 100).toFixed(2)),
      edge: Number((((h.score / total) * 100) - h.implied).toFixed(2))
    }))
    .sort((a, b) => b.probability - a.probability);

  return {
    pick: ranked[0],
    ranking: ranked
  };
}