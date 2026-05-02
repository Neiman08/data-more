export function analyzeRace(race) {
  if (!race?.runners) return [];

  return race.runners.map(horse => {
    const form = (horse.form || '').split('').slice(0, 5);

    let score = 50;

    form.forEach(r => {
      if (r === '1') score += 10;
      else if (r === '2') score += 6;
      else if (r === '3') score += 3;
      else if (r === '0') score -= 5;
    });

    const odds = Number(horse.odds_decimal) || 5;

    const probability = Math.min(80, (100 / odds) + (score / 5));

    return {
      name: horse.horse,
      odds,
      probability: Number(probability.toFixed(2)),
      score
    };
  }).sort((a, b) => b.probability - a.probability);
}