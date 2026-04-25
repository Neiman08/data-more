function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  return Number(Number(value).toFixed(decimals));
}

function parseGoals(value) {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

// 🔥 NUEVO SISTEMA DE CONFIANZA (PRO + EQUILIBRADO)
function confidence(prob, diff = 0) {
  if (prob >= 61 && diff >= 10) return 'alta';
  if (prob >= 55 && diff >= 6) return 'media';
  if (prob >= 50 && diff >= 4) return 'baja';
  return 'muy baja';
}

// 🔥 ANALIZA FORMA RECIENTE
function analyzeRecentForm(events, teamName) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      avgGF: 1.2,
      avgGA: 1.2,
      formScore: 50
    };
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  const recent = events.slice(0, 5);

  recent.forEach(event => {
    const homeTeam = event.strHomeTeam;
    const awayTeam = event.strAwayTeam;

    const homeGoals = parseGoals(event.intHomeScore);
    const awayGoals = parseGoals(event.intAwayScore);

    const isHome = homeTeam === teamName;

    const gf = isHome ? homeGoals : awayGoals;
    const ga = isHome ? awayGoals : homeGoals;

    goalsFor += gf;
    goalsAgainst += ga;

    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;
  });

  const games = recent.length || 1;
  const avgGF = goalsFor / games;
  const avgGA = goalsAgainst / games;

  let formScore = 50;

  formScore += wins * 7;
  formScore += draws * 2;
  formScore -= losses * 5;
  formScore += (avgGF - 1.2) * 10;
  formScore -= (avgGA - 1.2) * 9;

  formScore = clamp(formScore, 0, 100);

  return {
    games,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    avgGF: round(avgGF, 2),
    avgGA: round(avgGA, 2),
    formScore: round(formScore, 1)
  };
}

// 🔥 MODELO PRINCIPAL
export function buildSoccerAnalysis({ match, homeRecentEvents, awayRecentEvents }) {
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;

  const homeForm = analyzeRecentForm(homeRecentEvents, homeTeam);
  const awayForm = analyzeRecentForm(awayRecentEvents, awayTeam);

  const homeBase = homeForm.formScore + 3;
  const awayBase = awayForm.formScore;

  const totalPower = homeBase + awayBase;

  let homeWin = totalPower ? (homeBase / totalPower) * 72 : 38;
  let awayWin = totalPower ? (awayBase / totalPower) * 72 : 34;

  const draw = clamp(
    26 - Math.abs(homeBase - awayBase) * 0.10,
    20,
    30
  );

  const remaining = 100 - draw;
  const winTotal = homeWin + awayWin;

  homeWin = winTotal ? (homeWin / winTotal) * remaining : 38;
  awayWin = winTotal ? (awayWin / winTotal) * remaining : 34;

  // 🔥 DIFERENCIA REAL ENTRE EQUIPOS
  const diff = Math.abs(homeWin - awayWin);

  // 🔥 GOLES
  const homeProjectedGoals = clamp(
    1.2 + homeForm.avgGF * 0.5 - awayForm.avgGA * 0.25,
    0.4,
    3.5
  );

  const awayProjectedGoals = clamp(
    1.05 + awayForm.avgGF * 0.5 - homeForm.avgGA * 0.25,
    0.3,
    3.2
  );

  const totalGoals = homeProjectedGoals + awayProjectedGoals;

  const over25Prob = clamp(
    48 + (totalGoals - 2.4) * 15,
    40,
    72
  );

  const bttsProb = clamp(
    42 + Math.min(homeProjectedGoals, awayProjectedGoals) * 16,
    40,
    70
  );

  // 🔥 PICK
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

  // 🔥 NUEVA CONFIANZA
  const pickConfidence = confidence(pickProb, diff);

  // 🔥 HANDICAP
  let handicap = 'N/A';

  if (homeWin >= 56) {
    handicap = `${homeTeam} -0.5`;
  } else if (awayWin >= 56) {
    handicap = `${awayTeam} -0.5`;
  } else if (homeWin > awayWin) {
    handicap = `${homeTeam} +0.5`;
  } else {
    handicap = `${awayTeam} +0.5`;
  }

  // 🔥 SISTEMA DE APUESTAS BALANCEADO
  let bet = false;
  let betType = 'NO BET';

  if (pickProb >= 61 && diff >= 10) {
    bet = true;
    betType = 'STRONG BET';
  } else if (pickProb >= 55 && diff >= 6) {
    bet = true;
    betType = 'MEDIUM BET';
  } else if (pickProb >= 50 && diff >= 4) {
    bet = true;
    betType = 'LEAN BET';
  } else if (over25Prob >= 61) {
    bet = true;
    betType = 'OVER 2.5 BET';
  } else if (bttsProb >= 61) {
    bet = true;
    betType = 'BTTS BET';
  }

  return {
    matchId: match.matchId,
    matchup: `${homeTeam} vs ${awayTeam}`,
    pick,
    confidence: pickConfidence,
    bet,
    betType,

    probabilities: {
      homeWin: round(homeWin, 2),
      draw: round(draw, 2),
      awayWin: round(awayWin, 2),
      pickProbability: round(pickProb, 2),
      diff: round(diff, 2)
    },

    form: {
      home: homeForm.formScore,
      away: awayForm.formScore
    },

    goals: {
      homeProjectedGoals: round(homeProjectedGoals, 2),
      awayProjectedGoals: round(awayProjectedGoals, 2),
      total: round(totalGoals, 2)
    },

    markets: {
      over25: over25Prob >= 52 ? 'Over 2.5' : 'Under 2.5',
      over25Probability: round(over25Prob, 1),
      btts: bttsProb >= 52 ? 'Sí' : 'No',
      bttsProbability: round(bttsProb, 1),
      handicap
    }
  };
}