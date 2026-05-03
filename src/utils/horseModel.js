/**
 * UTILIDADES MATEMÁTICAS Y DE PARSEO
 */
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function avg(arr) {
  if (!arr?.length) return 0;
  return arr.reduce((a, b) => a + num(b), 0) / arr.length;
}

function variance(arr) {
  if (!arr?.length) return 100;
  const m = avg(arr);
  return arr.reduce((s, v) => s + Math.pow(num(v) - m, 2), 0) / arr.length;
}

function parseOdds(odds) {
  if (!odds || odds === 'N/A') return null;
  const [a, b] = String(odds).replace('-', '/').split('/').map(Number);
  if (!a || !b) return null;
  return a / b;
}

function impliedProbabilityFromOdds(odds) {
  const frac = parseOdds(odds);
  if (!frac) return null;
  return 100 / (frac + 1);
}

/**
 * GENERADORES DE PUNTUACIONES (SCORES)
 */
function getMarketScore(horse) {
  const implied = impliedProbabilityFromOdds(horse.odds);
  if (!implied) return 45;
  return clamp(implied * 3.5, 35, 95);
}

function getSpeedScore(horse) {
  const figs = horse.speedFigures || [];
  if (!figs.length) return 35;

  const recent = figs.slice(-3);
  const last = figs[figs.length - 1];
  const recentAvg = avg(recent);
  const overallAvg = avg(figs);
  const peak = Math.max(...figs);
  const trend = recentAvg - overallAvg;

  return clamp(
    overallAvg * 0.35 +
    recentAvg * 0.35 +
    last * 0.15 +
    peak * 0.10 +
    clamp(trend + 50, 0, 100) * 0.05
  );
}

function getConsistencyScore(horse) {
  const figs = horse.speedFigures || [];
  if (figs.length < 3) return 45;
  const v = variance(figs);
  return clamp(100 - v);
}

function getFormScore(horse) {
  const figs = horse.speedFigures || [];
  if (figs.length < 2) return 45;

  const last = figs[figs.length - 1];
  const prev = figs[figs.length - 2];
  const recent = avg(figs.slice(-3));
  const overall = avg(figs);

  let score = 50;
  if (last > prev) score += 10;
  if (recent > overall) score += 12;
  if (last >= 85) score += 10;
  if (last < 50) score -= 15;

  return clamp(score);
}

function getClassScore(horse, race) {
  const type = String(race?.type || race?.raceType || '').toLowerCase();
  const purse = num(race?.purse, 0);

  let score = 50;
  if (type.includes('stakes')) score += 15;
  if (type.includes('allowance')) score += 10;
  if (type.includes('maiden')) score -= 5;

  if (purse >= 75000) score += 12;
  else if (purse >= 40000) score += 8;
  else if (purse >= 25000) score += 4;

  return clamp(score);
}

function getHumanScore(horse) {
  let score = 50;
  const jockey = String(horse.jockey || '').toLowerCase();
  const trainer = String(horse.trainer || '').toLowerCase();

  if (jockey && jockey !== 'no data') score += 8;
  if (trainer && trainer !== 'no data') score += 8;

  const strongNames = ['irad', 'ortiz', 'prat', 'velazquez', 'saez', 'gafalione', 'zayas', 'rosario'];
  if (strongNames.some(n => jockey.includes(n))) score += 8;

  return clamp(score);
}

function getContextScore(horse, race) {
  let score = 50;
  const surface = String(race?.surface || '').toLowerCase();
  const distance = String(race?.distance || '').toLowerCase();

  if (surface.includes('turf') || surface.includes('dirt') || surface.includes('tapeta')) score += 5;
  if (distance) score += 5;

  return clamp(score);
}

function getPaceScore(horse, race) {
  const figs = horse.speedFigures || [];
  if (!figs.length) return 45;

  const last = figs[figs.length - 1];
  const peak = Math.max(...figs);
  const recent = avg(figs.slice(-3));

  let score = 50;
  if (peak >= 90) score += 12;
  if (recent >= 75) score += 10;
  if (last >= recent) score += 5;

  return clamp(score);
}

function getValueScore(horse, rawModelProb) {
  const implied = impliedProbabilityFromOdds(horse.odds);
  if (!implied) return { valueScore: 45, impliedProbability: null, edge: null, valueTag: 'SIN ODDS' };

  const edge = rawModelProb - implied;
  let valueScore = clamp(50 + edge * 2);

  let valueTag = 'NO VALUE';
  if (edge >= 10) valueTag = 'VALUE ALTO';
  else if (edge >= 5) valueTag = 'VALUE MEDIO';
  else if (edge >= 2) valueTag = 'VALUE BAJO';

  return {
    valueScore,
    impliedProbability: Number(implied.toFixed(2)),
    edge: Number(edge.toFixed(2)),
    valueTag
  };
}

function getConfidence(top, second, fieldSize) {
  const diff = num(top?.probability) - num(second?.probability);
  if (fieldSize >= 10 && diff < 4) return 'BAJA';
  if (diff >= 8 && num(top?.probability) >= 22) return 'ALTA';
  if (diff >= 4) return 'MEDIA';
  return 'BAJA';
}

/**
 * FUNCIÓN PRINCIPAL DE ANÁLISIS
 */
export function analyzeRace(race) {
  if (!race || !Array.isArray(race.runners) || race.runners.length === 0) return null;

  const base = race.runners.map(horse => {
    const speedScore = getSpeedScore(horse);
    const formScore = getFormScore(horse);
    const marketScore = getMarketScore(horse);
    const classScore = getClassScore(horse, race);
    const paceScore = getPaceScore(horse, race);
    const humanScore = getHumanScore(horse);
    const contextScore = getContextScore(horse, race);
    const consistencyScore = getConsistencyScore(horse);

    let rawScore = 0;

    // BIFURCACIÓN DE LÓGICA SEGÚN DISPONIBILIDAD DE DATA
    if (!horse.speedFigures || horse.speedFigures.length < 3) {
      // Poca data: El mercado y el factor humano pesan más
      rawScore =
        marketScore * 0.30 +
        humanScore * 0.18 +
        classScore * 0.14 +
        speedScore * 0.16 +
        formScore * 0.12 +
        paceScore * 0.07 +
        contextScore * 0.03;
    } else {
      // Data completa: El mérito real (Speed/Form) domina el 56% del score
      rawScore =
        speedScore * 0.36 +
        formScore * 0.20 +
        marketScore * 0.18 +
        classScore * 0.10 +
        paceScore * 0.07 +
        humanScore * 0.05 +
        contextScore * 0.03 +
        consistencyScore * 0.01;
    }

    const odds = parseOdds(horse.odds);

    // PROTECCIÓN DEL FAVORITO (6%)
    if (odds && odds <= 2.5) {
      rawScore *= 1.06;
    }

    // PROTECCIÓN DEL LONGSHOT CON SEÑALES REALES (8%)
    if (odds && odds >= 8 && speedScore >= 70 && formScore >= 60) {
      rawScore *= 1.08;
    }

    return {
      ...horse,
      speedScore: Number(speedScore.toFixed(2)),
      formScore: Number(formScore.toFixed(2)),
      marketScore: Number(marketScore.toFixed(2)),
      classScore: Number(classScore.toFixed(2)),
      paceScore: Number(paceScore.toFixed(2)),
      humanScore: Number(humanScore.toFixed(2)),
      contextScore: Number(contextScore.toFixed(2)),
      consistencyScore: Number(consistencyScore.toFixed(2)),
      rawScore
    };
  });

  const rawTotal = base.reduce((s, h) => s + h.rawScore, 0);

  const withRawProb = base.map(h => ({
    ...h,
    rawModelProbability: rawTotal ? (h.rawScore / rawTotal) * 100 : 0
  }));

  const withValue = withRawProb.map(h => {
    const value = getValueScore(h, h.rawModelProbability);
    // 5% de peso al valor para dar el toque final de "atractivo" a la apuesta
    const finalScore = h.rawScore * 0.95 + value.valueScore * 0.05;

    return {
      ...h,
      impliedProbability: value.impliedProbability,
      edge: value.edge,
      valueTag: value.valueTag,
      valueScore: Number(value.valueScore.toFixed(2)),
      score: Number(finalScore.toFixed(2))
    };
  });

  const total = withValue.reduce((s, h) => s + h.score, 0);

  const ranked = withValue
    .map(h => ({
      ...h,
      probability: total ? Number(((h.score / total) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];
  const third = ranked[2];

  return {
    pick: top?.name || 'N/A',
    confidence: getConfidence(top, second, ranked.length),
    playable:
      top?.probability >= 18 && (top?.probability - (second?.probability || 0)) >= 3
        ? 'JUGABLE'
        : 'RIESGO',
    top3: ranked.slice(0, 3),
    valueBets: ranked.filter(h => h.edge !== null && h.edge >= 3).slice(0, 3),
    bets: {
      win: top?.name || 'N/A',
      exacta: top && second ? `${top.name} / ${second.name}` : 'N/A',
      trifecta: top && second && third ? `${top.name} / ${second.name} / ${third.name}` : 'N/A'
    },
    fullRanking: ranked
  };
}
