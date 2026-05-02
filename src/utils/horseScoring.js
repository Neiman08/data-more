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

function confidenceLevel(probability, edge) {
  if (probability >= 30 && edge >= 8) return 'ALTA';
  if (probability >= 22 && edge >= 5) return 'MEDIA';
  return 'BAJA';
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
      jockey: h.jockey || '',
      trainer: h.trainer || '',
      form: h.form || '',
      odds: h.odds,
      implied,
      score: Number(score.toFixed(2))
    };
  });

  const total = runners.reduce((sum, h) => sum + h.score, 0);

  const ranked = runners
    .map(h => {
      const probability = Number(((h.score / total) * 100).toFixed(2));
      const edge = Number((probability - h.implied).toFixed(2));

      return {
        ...h,
        probability,
        edge,
        confidence: confidenceLevel(probability, edge)
      };
    })
    .sort((a, b) => b.probability - a.probability);

  const valueBets = ranked.filter(h => h.edge > 5 && h.probability > 15);

  return {
    pick: ranked[0],
    top4: ranked.slice(0, 4),
    valueBets,
    ranking: ranked,
    bets: {
      win: ranked[0]?.horse || null,
      exacta: ranked[1] && ranked[2]
        ? `${ranked[0].horse} / ${ranked[1].horse}, ${ranked[2].horse}`
        : null,
      trifecta: ranked[1] && ranked[2] && ranked[3]
        ? `${ranked[0].horse} / ${ranked[1].horse}, ${ranked[2].horse} / ${ranked[1].horse}, ${ranked[2].horse}, ${ranked[3].horse}`
        : null
    }
  };
}