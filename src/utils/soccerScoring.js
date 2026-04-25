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

function analyzeRecentForm(events, teamName) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 1.25,
      goalsAgainst: 1.25,
      avgGF: 1.25,
      avgGA: 1.25,
      formScore: 50
    };
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  events.slice(0, 5).forEach(event => {
    const home = event.strHomeTeam;
    const away = event.strAwayTeam;

    const homeGoals = parseGoals(event.intHomeScore);
    const awayGoals = parseGoals(event.intAwayScore);

    const isHome = home === teamName;

    const gf = isHome ? homeGoals : awayGoals;
    const ga = isHome ? awayGoals : homeGoals;

    goalsFor += gf;
    goalsAgainst += ga;

    if (gf > ga) wins++;
    else if (gf === ga) draws++;
    else losses++;
  });

  const games = Math.min(events.length, 5);
  const avgGF = goalsFor / games;
  const avgGA = goalsAgainst / games;

  let formScore = 50;
  formScore += wins * 8;
  formScore += draws * 2;
  formScore -= losses * 6;
  formScore += (avgGF - 1.2) * 12;
  formScore -= (avgGA - 1.2) * 10;

  return {
    games,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    avgGF: round(avgGF),
    avgGA: round(avgGA),
    formScore: clamp(formScore)
  };
}

function confidence(prob) {
  if (prob >= 62) return 'alta';
  if (prob >= 55) return 'media';
  return 'baja';
}

export function buildSoccerAnalysis({ match, homeRecentEvents, awayRecentEvents }) {
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;

  const homeForm = analyzeRecentForm(homeRecentEvents, homeTeam);
  const awayForm = analyzeRecentForm(awayRecentEvents, awayTeam);

  const homeBase = homeForm.formScore + 4; // ventaja local
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

  const bttsProb = clamp(
    38 + Math.min(homeProjectedGoals, awayProjectedGoals) * 18,
    35,
    75
  );

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
      over25: over25Prob >= 52 ? 'Over 2.5' : 'Under 2.5',
      over25Probability: round(over25Prob),
      btts: bttsProb >= 52 ? 'Sí' : 'No',
      bttsProbability: round(bttsProb),
      handicap
    },

    notes: [
      'Modelo basado en forma reciente de los últimos partidos.',
      'Incluye goles a favor, goles en contra, rendimiento reciente y localía.',
      'El empate se calcula separado porque fútbol tiene mercado 1X2.'
    ]
  };
}