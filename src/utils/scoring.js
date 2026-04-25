function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  return Number(Number(value).toFixed(decimals));
}

function americanOddsToImpliedProb(odds) {
  if (odds === null || odds === undefined) return null;
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function extractMoneyline(odds, teamName) {
  if (!odds?.bookmakers?.length) return null;

  for (const bookmaker of odds.bookmakers) {
    const market = bookmaker.markets?.find(m => m.key === 'h2h');
    if (!market) continue;

    const outcome = market.outcomes?.find(o => o.name === teamName);
    if (outcome?.price !== undefined) return outcome.price;
  }

  return null;
}

function calcPitcherScore(pitcher) {
  if (!pitcher) return 50;

  const era = safeNumber(pitcher.era, 4.20);
  const whip = safeNumber(pitcher.whip, 1.30);
  const innings = safeNumber(pitcher.inningsPitched, 0);
  const strikeOuts = safeNumber(pitcher.strikeOuts, 0);
  const walks = safeNumber(pitcher.baseOnBalls, 0);

  const k9 = innings > 0 ? (strikeOuts / innings) * 9 : 7;
  const bb9 = innings > 0 ? (walks / innings) * 9 : 3;

  let score = 50;
  score += (4.20 - era) * 8;
  score += (1.30 - whip) * 25;
  score += (k9 - 7) * 2;
  score -= (bb9 - 3) * 3;

  return clamp(score);
}

function calcOffenseScore(team) {
  if (!team) return 50;

  const avg = safeNumber(team.avg, 0.250);
  const obp = safeNumber(team.obp, 0.320);
  const slg = safeNumber(team.slg, 0.400);
  const ops = safeNumber(team.ops, 0.720);
  const gamesPlayed = safeNumber(team.gamesPlayed, 1);
  const runs = safeNumber(team.runs, 4);
  const runsPerGame = runs / Math.max(gamesPlayed, 1);

  let score = 50;
  score += (avg - 0.250) * 120;
  score += (obp - 0.320) * 100;
  score += (slg - 0.400) * 80;
  score += (ops - 0.720) * 60;
  score += (runsPerGame - 4.3) * 4;

  return clamp(score);
}

function confidenceFromProb(prob) {
  if (prob >= 62) return 'alta';
  if (prob >= 56) return 'media';
  return 'baja';
}

/* RUN LINE CORREGIDO - REGLA PRO FINAL */
function buildRunLinePick({
  awayTeam,
  homeTeam,
  awayFinalScore,
  homeFinalScore,
  awayModelWinPct,
  homeModelWinPct,
  pick
}) {
  const pickIsAway = pick === awayTeam;
  const pickProb = pickIsAway ? awayModelWinPct : homeModelWinPct;

  const projectedMargin = pickIsAway
    ? awayFinalScore - homeFinalScore
    : homeFinalScore - awayFinalScore;

  if (pickProb < 58 || projectedMargin <= 1.5) {
    return {
      pick: null,
      projectedMargin: round(projectedMargin),
      coverProb: 0,
      confidence: 'baja'
    };
  }

  const rlPick = `${pick} -1.5`;

  const marginBoost = Math.min((projectedMargin - 1.5) * 2, 5);
  const coverProb = clamp(pickProb - 8 + marginBoost, 52, 68);

  let rlConfidence = 'baja';

  if (coverProb >= 62 && projectedMargin >= 15) {
    rlConfidence = 'alta';
  } else if (coverProb >= 58 && projectedMargin >= 10) {
    rlConfidence = 'media';
  } else {
    return {
      pick: null,
      projectedMargin: round(projectedMargin),
      coverProb: 0,
      confidence: 'baja'
    };
  }

  return {
    pick: rlPick,
    projectedMargin: round(projectedMargin),
    coverProb: round(coverProb),
    confidence: rlConfidence
  };
}

function buildTeamTotalPick(teamName, projectedRuns) {
  const line = Math.round(projectedRuns * 2) / 2;
  const diff = projectedRuns - line;
  const pick = `${teamName} ${diff >= 0 ? 'over' : 'under'} ${line.toFixed(1)}`;
  const probability = clamp(52 + Math.abs(diff) * 18, 50, 68);

  return {
    pick,
    line: round(line, 1),
    projectedRuns: round(projectedRuns),
    probability: round(probability),
    confidence: confidenceFromProb(probability)
  };
}

export function buildGameAnalysis({
  game,
  awayHitting,
  homeHitting,
  awayPitcher,
  homePitcher,
  odds
}) {
  const awayTeam = game.teams.away.team.name;
  const homeTeam = game.teams.home.team.name;

  const awayPitcherScore = calcPitcherScore(awayPitcher);
  const homePitcherScore = calcPitcherScore(homePitcher);

  const awayOffenseScore = calcOffenseScore(awayHitting);
  const homeOffenseScore = calcOffenseScore(homeHitting);

  const awayBaseScore = awayPitcherScore * 0.58 + awayOffenseScore * 0.42;
  const homeBaseScore = homePitcherScore * 0.58 + homeOffenseScore * 0.42 + 2.5;

  const awayMoneyline = extractMoneyline(odds, awayTeam);
  const homeMoneyline = extractMoneyline(odds, homeTeam);

  const awayImplied = americanOddsToImpliedProb(awayMoneyline);
  const homeImplied = americanOddsToImpliedProb(homeMoneyline);

  const totalBase = awayBaseScore + homeBaseScore;
  const awayModelWinPct = totalBase ? (awayBaseScore / totalBase) * 100 : 50;
  const homeModelWinPct = totalBase ? (homeBaseScore / totalBase) * 100 : 50;

  const awayEdge = awayImplied !== null ? awayModelWinPct - awayImplied * 100 : null;
  const homeEdge = homeImplied !== null ? homeModelWinPct - homeImplied * 100 : null;

  const awayValueBoost = awayEdge !== null ? clamp(50 + awayEdge * 2, 35, 70) : 50;
  const homeValueBoost = homeEdge !== null ? clamp(50 + homeEdge * 2, 35, 70) : 50;

  const awayFinalScore = awayBaseScore * 0.90 + awayValueBoost * 0.10;
  const homeFinalScore = homeBaseScore * 0.90 + homeValueBoost * 0.10;

  const pickIsAway = awayFinalScore > homeFinalScore;
  const pick = pickIsAway ? awayTeam : homeTeam;
  const modelPct = pickIsAway ? awayModelWinPct : homeModelWinPct;
  const confidence = confidenceFromProb(modelPct);

  const runLine = buildRunLinePick({
    awayTeam,
    homeTeam,
    awayFinalScore,
    homeFinalScore,
    awayModelWinPct,
    homeModelWinPct,
    pick
  });

  const awayProjectedRuns = clamp(
    4.3 + (awayOffenseScore - 50) * 0.05 - (homePitcherScore - 50) * 0.045,
    2.2,
    8
  );

  const homeProjectedRuns = clamp(
    4.4 + (homeOffenseScore - 50) * 0.05 - (awayPitcherScore - 50) * 0.045 + 0.15,
    2.2,
    8
  );

  const awayTeamTotal = buildTeamTotalPick(awayTeam, awayProjectedRuns);
  const homeTeamTotal = buildTeamTotalPick(homeTeam, homeProjectedRuns);

  return {
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    matchup: `${awayTeam} vs ${homeTeam}`,
    pick,
    confidence,
    away: {
      team: awayTeam,
      finalScore: round(awayFinalScore),
      modelWinPct: round(awayModelWinPct),
      pitcherScore: round(awayPitcherScore),
      offenseScore: round(awayOffenseScore),
      moneyline: awayMoneyline,
      impliedProb: awayImplied !== null ? round(awayImplied * 100) : null,
      edge: awayEdge !== null ? round(awayEdge) : null
    },
    home: {
      team: homeTeam,
      finalScore: round(homeFinalScore),
      modelWinPct: round(homeModelWinPct),
      pitcherScore: round(homePitcherScore),
      offenseScore: round(homeOffenseScore),
      moneyline: homeMoneyline,
      impliedProb: homeImplied !== null ? round(homeImplied * 100) : null,
      edge: homeEdge !== null ? round(homeEdge) : null
    },
    runLine,
    teamTotals: {
      away: awayTeamTotal,
      home: homeTeamTotal,
      combinedProjectedTotal: round(awayProjectedRuns + homeProjectedRuns)
    },
    notes: [
      'Modelo MLB basado en pitcher, ofensiva, localía y odds cuando están disponibles.',
      'El modelo compara probabilidad propia contra la probabilidad implícita.',
      'Run Line solo se activa con probabilidad y margen suficientes.',
      'Team Totals salen de proyección ofensiva y pitcheo.'
    ]
  };
}