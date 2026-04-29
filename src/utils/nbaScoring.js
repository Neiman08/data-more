// utils/nbaScoring.js

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 2) {
  return Number(Number(value).toFixed(decimals));
}

function parsePoints(value) {
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

// 🔥 ANALIZA ÚLTIMOS JUEGOS
function analyzeRecentForm(events, teamName) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      games: 0,
      wins: 0,
      losses: 0,
      avgPF: 105,
      avgPA: 105,
      formScore: 50
    };
  }

  let wins = 0;
  let losses = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;

  events.slice(0, 5).forEach(event => {
    const home = event.strHomeTeam;
    const away = event.strAwayTeam;

    const homePts = parsePoints(event.intHomeScore);
    const awayPts = parsePoints(event.intAwayScore);

    const isHome = home === teamName;

    const pf = isHome ? homePts : awayPts;
    const pa = isHome ? awayPts : homePts;

    pointsFor += pf;
    pointsAgainst += pa;

    if (pf > pa) wins++;
    else losses++;
  });

  const games = Math.min(events.length, 5);
  const avgPF = pointsFor / games;
  const avgPA = pointsAgainst / games;

  // 🔥 POWER SCORE NBA
  let formScore = 50;
  formScore += wins * 4;
  formScore -= losses * 3;
  formScore += (avgPF - 105) * 0.8;
  formScore -= (avgPA - 105) * 0.7;

  return {
    games,
    wins,
    losses,
    avgPF: round(avgPF),
    avgPA: round(avgPA),
    formScore: clamp(formScore)
  };
}

function confidence(prob) {
  if (prob >= 62) return 'alta';
  if (prob >= 55) return 'media';
  return 'baja';
}

// 🚀 FUNCIÓN PRINCIPAL
export function buildNBAAnalysis({ match, homeRecentEvents, awayRecentEvents }) {
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;

  const homeForm = analyzeRecentForm(homeRecentEvents, homeTeam);
  const awayForm = analyzeRecentForm(awayRecentEvents, awayTeam);

  // ⚡ POWER
  const homePower = homeForm.formScore + 3; // localía
  const awayPower = awayForm.formScore;

  const totalPower = homePower + awayPower;

  let homeWin = totalPower ? (homePower / totalPower) * 100 : 50;
  let awayWin = 100 - homeWin;

  // 🏀 PROYECCIÓN DE PUNTOS
  const homeProjected = clamp(
    105 +
      (homeForm.avgPF * 0.5) -
      (awayForm.avgPA * 0.4) +
      3,
    85,
    140
  );

  const awayProjected = clamp(
    102 +
      (awayForm.avgPF * 0.5) -
      (homeForm.avgPA * 0.4),
    85,
    140
  );

  const totalProjected = homeProjected + awayProjected;

  // 📉 SPREAD
  const spread = round(homeProjected - awayProjected);

  // 📈 TOTAL (OVER / UNDER)
  let overProb = clamp(
    50 + (totalProjected - 220) * 2,
    35,
    75
  );

  // 🔥 AJUSTES PARA EVITAR "TODO OVER"
  if (totalProjected < 215) overProb -= 8;
  if (totalProjected > 235) overProb += 6;

  // 🏀 TEAM TOTALS
  const homeTT = homeProjected;
  const awayTT = awayProjected;

  let pick = homeTeam;
  let pickProb = homeWin;

  if (awayWin > homeWin) {
    pick = awayTeam;
    pickProb = awayWin;
  }

  return {
    matchId: match.matchId,
    matchup: `${homeTeam} vs ${awayTeam}`,
    pick,
    confidence: confidence(pickProb),

    probability: round(pickProb),
    market: 'Moneyline',

    probabilities: {
      homeWin: round(homeWin),
      awayWin: round(awayWin)
    },

    form: {
      home: homeForm,
      away: awayForm
    },

    projections: {
      homeProjected: round(homeProjected),
      awayProjected: round(awayProjected),
      totalProjected: round(totalProjected),
      spread
    },

    markets: {
      spread: spread > 0 ? `${homeTeam} -${spread}` : `${awayTeam} +${Math.abs(spread)}`,
      overUnder: overProb >= 55 ? 'Over' : 'Under',
      overProbability: round(overProb),

      homeTeamTotal: round(homeTT),
      awayTeamTotal: round(awayTT)
    },

    modelNote:
      'Modelo basado en forma reciente, puntos anotados, defensa y ventaja local en NBA.'
  };
}