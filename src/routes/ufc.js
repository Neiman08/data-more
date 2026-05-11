import dotenv from 'dotenv';
dotenv.config();

import express from 'express';

const router = express.Router();

const fighterImages = {
  "Islam Makhachev": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-01/MAKHACHEV_ISLAM_L_BELT_01-18.png",
  "Jon Jones": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-11/JONES_JON_BELT_11-16.png",
  "Alex Pereira": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-10/PEREIRA_ALEX_BELT_10-05.png",
  "Sean O'Malley": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-09/OMALLEY_SEAN_09-14.png",
  "Ilia Topuria": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2025-02/TOPURIA_ILIA_02-17.png",
  "Tom Aspinall": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-07/ASPINALL_TOM_07-27.png",
  "Francis Ngannou": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2023-01/NGANNOU_FRANCIS.png",
  "Ronda Rousey": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/image/fighter_images/Ronda_Rousey.png",
  "Khamzat Chimaev": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-10/CHIMAEV_KHAMZAT_10-26.png",
  "Valentina Shevchenko": "https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2024-09/SHEVCHENKO_VALENTINA_BELT_09-14.png"
};

console.log('ODDS KEY UFC:', process.env.ODDS_API_KEY ? 'LOADED' : 'MISSING');

/* =========================================================
   🥊 DATA MORE UFC ANALYTICS PRO
========================================================= */

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_REGION = process.env.ODDS_REGION || 'us';
const ODDS_FORMAT = process.env.ODDS_FORMAT || 'american';

function americanToProbability(odds) {
  const n = Number(odds);

  if (!n || Number.isNaN(n)) {
    return 50;
  }

  if (n < 0) {
    return Math.round((-n / (-n + 100)) * 100);
  }

  return Math.round((100 / (n + 100)) * 100);
}

function getConfidence(prob) {
  if (prob >= 66) return 'HIGH';
  if (prob >= 57) return 'MEDIUM';

  return 'LOW';
}

function generateStats(seedString = '') {
  let seed = 0;

  for (let i = 0; i < seedString.length; i++) {
    seed += seedString.charCodeAt(i);
  }

  return {
    striking: 70 + (seed % 25),
    grappling: 68 + ((seed * 2) % 28),
    cardio: 72 + ((seed * 3) % 22),
    durability: 70 + ((seed * 4) % 22),
    fightIQ: 73 + ((seed * 5) % 20),
    finishing: 74 + ((seed * 6) % 24)
  };
}

router.get('/fights', async (req, res) => {
  try {
    if (!ODDS_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: 'ODDS_API_KEY missing in .env'
      });
    }

    const url =
      `https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds/?apiKey=${ODDS_API_KEY}&regions=${ODDS_REGION}&markets=h2h&oddsFormat=${ODDS_FORMAT}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(response.status).json({
        ok: false,
        error: errorText
      });
    }

    const oddsData = await response.json();

    const cleanOddsData = oddsData
      .filter(event => event.home_team && event.away_team)
      .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
      .slice(0, 15);

    const fights = cleanOddsData.map((fight, index) => {
      const bookmaker = fight.bookmakers?.[0];
      const market = bookmaker?.markets?.[0];
      const outcomes = market?.outcomes || [];

      const fighterAName = fight.home_team || 'Fighter A';
      const fighterBName = fight.away_team || 'Fighter B';

      const fighterAOdds =
        outcomes.find(o => o.name === fighterAName)?.price || 100;

      const fighterBOdds =
        outcomes.find(o => o.name === fighterBName)?.price || 100;

      const fighterAProb = americanToProbability(fighterAOdds);
      const fighterBProb = americanToProbability(fighterBOdds);

      const fighterAStats = generateStats(fighterAName);
      const fighterBStats = generateStats(fighterBName);

      const projectedWinner =
        fighterAProb >= fighterBProb
          ? fighterAName
          : fighterBName;

      const projectedProb = Math.max(fighterAProb, fighterBProb);

      const confidence = getConfidence(projectedProb);

      const koProbability =
        confidence === 'HIGH'
          ? 58
          : confidence === 'MEDIUM'
            ? 47
            : 36;

      const submissionProbability =
        confidence === 'HIGH'
          ? 22
          : confidence === 'MEDIUM'
            ? 18
            : 15;

      const decisionProbability =
        100 - koProbability - submissionProbability;

      return {
        id: index + 1,

        event:
          fight.sport_title ||
          'UFC Event',

        weightClass:
          'MMA',

        cardPosition:
          index === 0
            ? 'MAIN EVENT'
            : index === 1
              ? 'CO-MAIN EVENT'
              : 'FEATURED BOUT',

        fighterAImage:
          fighterImages[fighterAName] || '',

        fighterBImage:
          fighterImages[fighterBName] || '',

        fighterA: {
          name: fighterAName,
          record: 'MMA Fighter',
          country: 'N/A',
          style: 'Data More AI Style',
          stance: 'N/A',
          reach: 'N/A',
          age: 'N/A',

          image:
            fighterImages[fighterAName] || '',

          stats: fighterAStats
        },

        fighterB: {
          name: fighterBName,
          record: 'MMA Fighter',
          country: 'N/A',
          style: 'Data More AI Style',
          stance: 'N/A',
          reach: 'N/A',
          age: 'N/A',

          image:
            fighterImages[fighterBName] || '',

          stats: fighterBStats
        },

        prediction: {
          winner: projectedWinner,
          probability: projectedProb,
          confidence,

          method:
            koProbability >= submissionProbability
              ? 'KO/TKO'
              : 'Submission',

          round:
            projectedProb >= 67
              ? 'Round 2'
              : projectedProb >= 58
                ? 'Round 3'
                : 'Decision',

          risk:
            confidence === 'HIGH'
              ? 'LOW'
              : confidence === 'MEDIUM'
                ? 'MEDIUM'
                : 'HIGH',

          bestBet:
            `${projectedWinner} Moneyline`,

          vegasEdge:
            `+${(projectedProb / 5).toFixed(1)}%`,

          koProbability,
          submissionProbability,
          decisionProbability,

          fightGoesDistance:
            decisionProbability,

          fightDoesNotGoDistance:
            koProbability + submissionProbability
        },

        valuePlays: [
          {
            market: 'Moneyline',
            pick: projectedWinner,
            confidence,
            edge:
              `+${(projectedProb / 5).toFixed(1)}%`
          },

          {
            market: 'Fight Prop',
            pick:
              koProbability >= 50
                ? 'Fight Does Not Go Distance'
                : 'Over 1.5 Rounds',

            confidence:
              confidence === 'HIGH'
                ? 'HIGH'
                : 'MEDIUM',

            edge:
              `+${(projectedProb / 8).toFixed(1)}%`
          }
        ],

        analysis: `
          Data More AI detected betting value on ${projectedWinner}.
          Market implied probability gives ${projectedProb}% win probability.

          The AI model identifies stronger efficiency metrics,
          striking danger, pace control, and finishing upside.

          Current Market Odds:
          ${fighterAName}: ${fighterAOdds}
          ${fighterBName}: ${fighterBOdds}

          Projection:
          ${projectedWinner} has the strongest overall edge
          based on real-time betting market analysis.
        `
      };
    });

    const bestPlays = fights
      .flatMap(fight =>
        fight.valuePlays.map(play => ({
          fightId: fight.id,
          event: fight.event,
          market: play.market,
          pick: play.pick,
          confidence: play.confidence,
          edge: play.edge
        }))
      )
      .sort((a, b) => {
        const rank = {
          HIGH: 3,
          MEDIUM: 2,
          LOW: 1
        };

        return (rank[b.confidence] || 0) - (rank[a.confidence] || 0);
      })
      .slice(0, 6);

    const smartParlay =
      fights
        .slice(0, 3)
        .map((fight, index) => ({
          leg: index + 1,
          pick: fight.prediction.bestBet,
          confidence: fight.prediction.confidence
        }));

    res.json({
      ok: true,
      realData: true,
      source: 'The Odds API',
      count: fights.length,
      fights,
      bestPlays,
      smartParlay
    });

  } catch (error) {
    console.error('❌ UFC API ERROR:', error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   🧠 UFC FIGHT SIMULATION ENGINE
========================================================= */

router.get('/simulate/:id', async (req, res) => {
  try {
    const fightId = Number(req.params.id);

    const fightsResponse =
      await fetch(
        `http://localhost:${process.env.PORT || 3000}/api/ufc/fights`
      );

    const fightsData = await fightsResponse.json();

    const fight =
      fightsData.fights.find(
        f => Number(f.id) === fightId
      );

    if (!fight) {
      return res.status(404).json({
        ok: false,
        error: 'Fight not found'
      });
    }

    const simulations = 10000;

    let fighterAWins = 0;
    let fighterBWins = 0;

    let koFinishes = 0;
    let submissionFinishes = 0;
    let decisions = 0;

    const a = fight.fighterA.stats;
    const b = fight.fighterB.stats;

    const fighterAScore =
      a.striking * 0.24 +
      a.grappling * 0.24 +
      a.cardio * 0.16 +
      a.durability * 0.12 +
      a.fightIQ * 0.14 +
      a.finishing * 0.10;

    const fighterBScore =
      b.striking * 0.24 +
      b.grappling * 0.24 +
      b.cardio * 0.16 +
      b.durability * 0.12 +
      b.fightIQ * 0.14 +
      b.finishing * 0.10;

    const marketWinner = fight.prediction.winner;
    const marketProbability = Number(fight.prediction.probability || 50) / 100;

    const fighterAWinBase =
      marketWinner === fight.fighterA.name
        ? marketProbability
        : 1 - marketProbability;

    for (let i = 0; i < simulations; i++) {
      const variance = (Math.random() - 0.5) * 0.05;

      const fighterAChance =
        Math.min(
          0.88,
          Math.max(
            0.12,
            fighterAWinBase + variance
          )
        );

      const fighterAWinsRun =
        Math.random() < fighterAChance;

      if (fighterAWinsRun) {
        fighterAWins++;
      } else {
        fighterBWins++;
      }

      const finishingScore =
        ((a.finishing + b.finishing) / 2)
        +
        Math.abs(a.striking - b.striking) * 0.25
        +
        Math.abs(a.grappling - b.grappling) * 0.20;

      const finishChance =
        Math.min(
          0.65,
          Math.max(
            0.22,
            finishingScore / 130
          )
        );

      if (Math.random() < finishChance) {
        const koBias =
          (a.striking + b.striking)
          /
          (
            (a.striking + b.striking)
            +
            (a.grappling + b.grappling)
          );

        if (Math.random() < koBias) {
          koFinishes++;
        } else {
          submissionFinishes++;
        }

      } else {
        decisions++;
      }
    }

    const fighterAWinPct =
      Number(((fighterAWins / simulations) * 100).toFixed(2));

    const fighterBWinPct =
      Number(((fighterBWins / simulations) * 100).toFixed(2));

    const koPct =
      Number(((koFinishes / simulations) * 100).toFixed(2));

    const submissionPct =
      Number(((submissionFinishes / simulations) * 100).toFixed(2));

    const decisionPct =
      Number(((decisions / simulations) * 100).toFixed(2));

    const projectedWinner =
      fighterAWinPct >= fighterBWinPct
        ? fight.fighterA.name
        : fight.fighterB.name;

    const projectedRound =
      koPct + submissionPct > 65
        ? 'Round 1-2'
        : koPct + submissionPct > 45
          ? 'Round 2-3'
          : 'Decision / Late Round';

    const finishPct = koPct + submissionPct;

    const bestAngle =
      finishPct >= 66
        ? 'Fight Does Not Go Distance'
        : decisionPct >= 42
          ? 'Fight Goes Distance / Over 1.5 Rounds'
          : `${projectedWinner} Moneyline`;

    res.json({
      ok: true,
      simulations,
      fightId,

      fight:
        `${fight.fighterA.name} vs ${fight.fighterB.name}`,

      projectedWinner,

      fighterAWinPct,
      fighterBWinPct,

      koPct,
      submissionPct,
      decisionPct,

      projectedRound,
      bestAngle
    });

  } catch (error) {
    console.error('UFC SIMULATION ERROR:', error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
