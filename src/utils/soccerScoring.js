function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function round(n, decimals = 2) {
  return Number(Number(n).toFixed(decimals));
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function getLeagueGoalFactor(leagueKey = '') {
  const key = String(leagueKey || '').toLowerCase();

  const map = {
    epl: 0.20,
    laliga: 0.05,
    seriea: -0.05,
    bundesliga: 0.25,
    ligue1: 0.00,
    champions: 0.15,
    europa: 0.10,
    conference: 0.10,
    brasil: 0.05,
    argentina: -0.10,
    mls: 0.35,
    ligamx: 0.15
  };

  return map[key] ?? 0;
}

function analyzeRecentForm(events = [], teamName = '', teamId = null) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      avgGF: 1.15,
      avgGA: 1.15,
      formScore: 50,
      formText: 'N/D'
    };
  }

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let points = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  const form = [];

  events.slice(0, 5).forEach(event => {
    const homeName = String(event.strHomeTeam || '').toLowerCase();
    const awayName = String(event.strAwayTeam || '').toLowerCase();
    const targetName = String(teamName || '').toLowerCase();

    const isHome =
      Number(event.homeTeamId) === Number(teamId) ||
      homeName === targetName;

    const isAway =
      Number(event.awayTeamId) === Number(teamId) ||
      awayName === targetName;

    if (!isHome && !isAway) return;

    const homeGoals = safeNumber(event.intHomeScore);
    const awayGoals = safeNumber(event.intAwayScore);

    const gf = isHome ? homeGoals : awayGoals;
    const ga = isHome ? awayGoals : homeGoals;

    goalsFor += gf;
    goalsAgainst += ga;

    if (gf > ga) {
      wins++;
      points += 3;
      form.push('W');
    } else if (gf === ga) {
      draws++;
      points += 1;
      form.push('D');
    } else {
      losses++;
      form.push('L');
    }
  });

  const games = wins + draws + losses;

  if (!games) {
    return {
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      avgGF: 1.15,
      avgGA: 1.15,
      formScore: 50,
      formText: 'N/D'
    };
  }

  const avgGF = goalsFor / games;
  const avgGA = goalsAgainst / games;

  const formScore = clamp(
    50 +
      points * 2.4 +
      wins * 2.8 +
      draws * 0.8 -
      losses * 2.5 +
      (goalsFor - goalsAgainst) * 3.0 +
      (avgGF - 1.2) * 7 -
      (avgGA - 1.2) * 6,
    25,
    85
  );

  return {
    games,
    wins,
    draws,
    losses,
    points,
    goalsFor,
    goalsAgainst,
    avgGF: round(avgGF),
    avgGA: round(avgGA),
    formScore: round(formScore),
    formText: form.join(' ')
  };
}

function expectedGoals(attack, opponentDefense, leagueFactor, homeBoost = 0) {
  return clamp(
    attack * 0.62 + opponentDefense * 0.38 + leagueFactor + homeBoost,
    0.45,
    3.4
  );
}

function getConfidence(prob) {
  if (prob >= 64) return 'ALTA';
  if (prob >= 56) return 'MEDIA';
  return 'BAJA';
}

export function buildSoccerAnalysis({ match, homeRecentEvents = [], awayRecentEvents = [] }) {
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;

  const homeForm = analyzeRecentForm(homeRecentEvents, homeTeam, match.homeTeamId);
  const awayForm = analyzeRecentForm(awayRecentEvents, awayTeam, match.awayTeamId);

  const leagueFactor = getLeagueGoalFactor(match.leagueKey);

  const homeXG = expectedGoals(homeForm.avgGF, awayForm.avgGA, leagueFactor, 0.18);
  const awayXG = expectedGoals(awayForm.avgGF, homeForm.avgGA, leagueFactor, 0);

  const totalXG = homeXG + awayXG;

  const homePower =
    homeForm.formScore +
    homeXG * 12 +
    homeForm.points * 0.9 +
    2.5;

  const awayPower =
    awayForm.formScore +
    awayXG * 12 +
    awayForm.points * 0.9;

  const totalPower = homePower + awayPower || 1;

  let rawHome = (homePower / totalPower) * 100;
  let rawAway = (awayPower / totalPower) * 100;

  const diff = Math.abs(rawHome - rawAway);

  let draw = clamp(
    31 - diff * 0.33 - Math.max(0, totalXG - 2.4) * 3.8,
    16,
    31
  );

  let homeWin = rawHome * ((100 - draw) / 100);
  let awayWin = rawAway * ((100 - draw) / 100);

  const norm = homeWin + awayWin + draw || 1;

  homeWin = round((homeWin / norm) * 100);
  awayWin = round((awayWin / norm) * 100);
  draw = round((draw / norm) * 100);

  let pick = homeTeam;
  let pickProb = homeWin;

  if (awayWin > homeWin && awayWin > draw) {
    pick = awayTeam;
    pickProb = awayWin;
  }

  if (draw > homeWin && draw > awayWin) {
    pick = 'Empate';
    pickProb = draw;
  }

  const over25Prob = clamp(round(35 + totalXG * 12.5), 35, 76);

  const bttsProb = clamp(
    round(38 + Math.min(homeXG, awayXG) * 18 + totalXG * 3),
    30,
    72
  );

  const handicap =
    pick === 'Empate'
      ? 'Empate / Doble oportunidad'
      : Math.abs(homeWin - awayWin) >= 10
        ? `${pick} -0.5`
        : `${pick} +0.5`;

  return {
    matchId: match.matchId,
    matchup: `${homeTeam} vs ${awayTeam}`,

    pick,
    confidence: getConfidence(pickProb),
    probability: round(pickProb),

    market: '1X2 / Principal',
    projectedTotal: round(totalXG),

    modelNote:
      'Modelo PRO: forma real, goles esperados, defensa, empate dinámico, ritmo por liga y localía controlada.',

    probabilities: {
      homeWin,
      draw,
      awayWin,
      pickProbability: round(pickProb)
    },

    expectedGoals: {
      home: round(homeXG),
      away: round(awayXG),
      total: round(totalXG)
    },

    form: {
      home: {
        record: `${homeForm.wins}-${homeForm.draws}-${homeForm.losses}`,
        form: homeForm.formText,
        goalsFor: homeForm.goalsFor,
        goalsAgainst: homeForm.goalsAgainst,
        avgGF: homeForm.avgGF,
        avgGA: homeForm.avgGA,
        formScore: homeForm.formScore
      },
      away: {
        record: `${awayForm.wins}-${awayForm.draws}-${awayForm.losses}`,
        form: awayForm.formText,
        goalsFor: awayForm.goalsFor,
        goalsAgainst: awayForm.goalsAgainst,
        avgGF: awayForm.avgGF,
        avgGA: awayForm.avgGA,
        formScore: awayForm.formScore
      }
    },

    goals: {
      homeProjectedGoals: round(homeXG),
      awayProjectedGoals: round(awayXG),
      projectedTotal: round(totalXG)
    },

    markets: {
      over25: over25Prob >= 52 ? 'Over 2.5' : 'Under 2.5',
      over25Probability: round(over25Prob),

      btts: bttsProb >= 52 ? 'Sí' : 'No',
      bttsProbability: round(bttsProb),

      handicap
    },

    notes: [
      'Se eliminó el sesgo al equipo local.',
      'El empate ahora se calcula dinámicamente.',
      'El modelo usa goles esperados estimados.',
      'Cada liga tiene su propio ritmo ofensivo.',
      'Si no hay últimos 5 reales, usa valores neutrales para evitar picks falsos.'
    ],

    playerProps: []
  };
}