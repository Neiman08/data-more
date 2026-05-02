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

// Ajuste por liga (ritmo ofensivo real)
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

// 🔥 FORM REAL (sin inventar ventaja local)
function analyzeRecentForm(events = [], teamName = '', teamId = null) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      games: 0,
      wins: 1,
      draws: 3,
      losses: 1,
      points: 6,
      goalsFor: 5,
      goalsAgainst: 5,
      avgGF: 1.0,
      avgGA: 1.0,
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
    const isHome =
      event.homeTeamId === teamId ||
      String(event.strHomeTeam || '').toLowerCase() === String(teamName || '').toLowerCase();

    const gf = isHome
      ? safeNumber(event.intHomeScore)
      : safeNumber(event.intAwayScore);

    const ga = isHome
      ? safeNumber(event.intAwayScore)
      : safeNumber(event.intHomeScore);

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

  const games = Math.min(events.length, 5) || 1;
  const avgGF = goalsFor / games;
  const avgGA = goalsAgainst / games;

  const formScore = clamp(
    50 +
      points * 2.2 +
      wins * 2.5 -
      losses * 2.2 +
      (goalsFor - goalsAgainst) * 2.8 +
      (avgGF - 1.2) * 7 -
      (avgGA - 1.2) * 6,
    25,
    82
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

// ⚽ Expected Goals realista
function expectedGoals(attack, defense, leagueFactor, homeBoost = 0) {
  return clamp(
    attack * 0.62 + defense * 0.38 + leagueFactor + homeBoost,
    0.45,
    3.4
  );
}

function getConfidence(prob) {
  if (prob >= 64) return 'ALTA';
  if (prob >= 56) return 'MEDIA';
  return 'BAJA';
}

// 🚀 MODELO FINAL NIVEL DIOS
export function buildSoccerAnalysis({ match, homeRecentEvents = [], awayRecentEvents = [] }) {
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;

  const homeForm = analyzeRecentForm(homeRecentEvents, homeTeam, match.homeTeamId);
  const awayForm = analyzeRecentForm(awayRecentEvents, awayTeam, match.awayTeamId);

  const leagueFactor = getLeagueGoalFactor(match.leagueKey);

  const homeXG = expectedGoals(homeForm.avgGF, awayForm.avgGA, leagueFactor, 0.18);
  const awayXG = expectedGoals(awayForm.avgGF, homeForm.avgGA, leagueFactor, 0);

  const totalXG = homeXG + awayXG;

  // 🔥 POWER REAL (sin inflar local)
  const homePower =
    homeForm.formScore +
    homeXG * 12 +
    homeForm.points * 0.9 +
    2.5; // leve localía

  const awayPower =
    awayForm.formScore +
    awayXG * 12 +
    awayForm.points * 0.9;

  const totalPower = homePower + awayPower || 1;

  let homeWin = (homePower / totalPower) * 100;
  let awayWin = (awayPower / totalPower) * 100;

  const diff = Math.abs(homeWin - awayWin);

  // 🔥 Empate dinámico real
  let draw = clamp(
    31 - diff * 0.33 - Math.max(0, totalXG - 2.4) * 3.8,
    16,
    31
  );

  homeWin = homeWin * ((100 - draw) / 100);
  awayWin = awayWin * ((100 - draw) / 100);

  const norm = homeWin + awayWin + draw || 1;

  homeWin = round((homeWin / norm) * 100);
  awayWin = round((awayWin / norm) * 100);
  draw = round((draw / norm) * 100);

  // 🎯 PICK REAL
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

  // 🔥 MERCADOS
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
      'Modelo PRO: forma real, xG, defensa, empate dinámico, ritmo por liga y localía controlada.',

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
        form: homeForm.formText
      },
      away: {
        record: `${awayForm.wins}-${awayForm.draws}-${awayForm.losses}`,
        form: awayForm.formText
      }
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
      'El empate ahora es realista.',
      'El modelo usa goles esperados (xG).',
      'Cada liga tiene su propio ritmo ofensivo.'
    ],

    playerProps: []
  };
}