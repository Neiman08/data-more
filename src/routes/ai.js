import express from "express";
import OpenAI from "openai";

const router = express.Router();

function normalizeConfidence(confidence = "") {
  const c = String(confidence).toUpperCase();

  if (c.includes("HIGH") || c.includes("ALTA")) return "HIGH";
  if (c.includes("MEDIUM") || c.includes("MEDIA")) return "MEDIUM";
  if (c.includes("LOW") || c.includes("BAJA")) return "LOW";

  return "";
}

function confidenceScore(confidence = "") {
  const c = normalizeConfidence(confidence);

  if (c === "HIGH") return 3;
  if (c === "MEDIUM") return 2;
  if (c === "LOW") return 1;

  return 0;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function getTeamName(team) {
  if (!team) return "";
  if (typeof team === "string") return team;
  return team.name || team.teamName || team.abbreviation || team.abbr || "";
}

function getGameKey(game = "") {
  return String(game).trim().toUpperCase();
}

function buildOfficialBestByGame(board) {
  const byGame = new Map();

  for (const ml of board.rankedMoneylines) {
    const key = getGameKey(ml.game);

    byGame.set(key, {
      ...ml,
      officialMarket: "Moneyline",
      valueScore: (ml.probability || 0) + (ml.confidenceScore || 0) * 2
    });
  }

  for (const rl of board.rankedRunLines) {
    const key = getGameKey(rl.game);
    const current = byGame.get(key);

    const rlProb = rl.probability || 0;
    const currentProb = current?.probability || 0;

    const rlHasRealValue =
      rlProb >= 60 ||
      (rlProb >= 58 && currentProb <= 62);

    if (!current || rlHasRealValue) {
      byGame.set(key, {
        ...rl,
        confidence: current?.confidence || "",
        confidenceScore: current?.confidenceScore || 0,
        officialMarket: "Run Line",
        valueScore: rlProb + 1.5
      });
    }
  }

  for (const total of board.rankedTeamTotals) {
    const key = getGameKey(total.game);
    const current = byGame.get(key);

    if (!current && total.pick) {
      byGame.set(key, {
        ...total,
        confidence: "",
        confidenceScore: 0,
        officialMarket: "Team Total",
        valueScore: total.probability || 50
      });
    }
  }

  return [...byGame.values()]
    .sort((a, b) => {
      const confDiff = (b.confidenceScore || 0) - (a.confidenceScore || 0);
      if (confDiff !== 0) return confDiff;

      return (
        (b.valueScore || b.probability || 0) -
        (a.valueScore || a.probability || 0)
      );
    })
    .slice(0, 10);
}

function buildAIBoard(games) {
  const moneylines = [];
  const runLines = [];
  const teamTotals = [];
  const hitProps = [];
  const hrProps = [];

  for (const game of games) {
    const awayTeam =
      getTeamName(game.awayTeam) ||
      game.awayTeamName ||
      game.awayName ||
      game.away ||
      game.awayAbbrev ||
      "";

    const homeTeam =
      getTeamName(game.homeTeam) ||
      game.homeTeamName ||
      game.homeName ||
      game.home ||
      game.homeAbbrev ||
      "";

    const gameLabel =
      game.gameLabel ||
      game.matchup ||
      `${awayTeam} vs ${homeTeam}`;

    const mlPick =
      game.moneylinePick ||
      game.winner ||
      game.predictedWinner ||
      game.winnerPick ||
      game?.moneyline?.pick ||
      game?.moneyline?.team ||
      game?.prediction?.winner ||
      "";

    const mlProb =
      toNumber(game.modelProbability) ??
      toNumber(game.probability) ??
      toNumber(game.winProbability) ??
      toNumber(game.mlProbability) ??
      toNumber(game?.moneyline?.probability) ??
      toNumber(game?.prediction?.probability);

    const mlConfidence = normalizeConfidence(
      game.confidence ||
      game.mlConfidence ||
      game?.moneyline?.confidence ||
      game?.prediction?.confidence
    );

    if (mlPick && mlProb !== null) {
      moneylines.push({
        game: gameLabel,
        pick: mlPick,
        market: "Moneyline",
        probability: mlProb,
        confidence: mlConfidence,
        confidenceScore: confidenceScore(mlConfidence)
      });
    }

    const rlPick =
      game.runLinePick ||
      game.handicapPick ||
      game.spreadPick ||
      game?.runLine?.pick ||
      game?.handicap?.pick ||
      "";

    const rlProb =
      toNumber(game.coverProb) ??
      toNumber(game.runLineCoverProb) ??
      toNumber(game?.runLine?.coverProb) ??
      toNumber(game?.handicap?.coverProb);

    if (rlPick && rlPick !== "N/A" && rlProb !== null && rlProb > 0) {
      runLines.push({
        game: gameLabel,
        pick: rlPick,
        market: "Run Line",
        probability: rlProb
      });
    }

    const totals =
      game.teamTotals ||
      game.totals ||
      game.teamTotal ||
      game?.markets?.teamTotals;

    if (totals) {
      if (Array.isArray(totals)) {
        for (const total of totals) {
          const pick = total.pick || total.selection || total.name || "";

          if (pick) {
            teamTotals.push({
              game: gameLabel,
              pick,
              market: "Team Total",
              team: total.team || "",
              line: total.line || "",
              probability: toNumber(total.probability || total.prob)
            });
          }
        }
      } else if (typeof totals === "object") {
        for (const [team, value] of Object.entries(totals)) {
          if (typeof value === "string") {
            teamTotals.push({
              game: gameLabel,
              pick: value,
              market: "Team Total",
              team,
              line: value
            });
          } else if (value && typeof value === "object") {
            const pick = value.pick || value.selection || "";

            if (pick) {
              teamTotals.push({
                game: gameLabel,
                pick,
                market: "Team Total",
                team,
                line: value.line || "",
                probability: toNumber(value.probability || value.prob)
              });
            }
          }
        }
      }
    }

    const props =
      game.playerProps ||
      game.topPlayerProps ||
      game.props ||
      game.players ||
      [];

    const flatProps = Array.isArray(props)
      ? props
      : [
          ...(props.hitProps || []),
          ...(props.hrProps || []),
          ...(props.topHits || []),
          ...(props.topHR || [])
        ];

    for (const player of flatProps) {
      const playerName =
        player.player ||
        player.playerName ||
        player.name ||
        "";

      const team =
        player.team ||
        player.teamName ||
        player.abbr ||
        "";

      const hitProb =
        toNumber(player.hitProb) ??
        toNumber(player.hitProbability) ??
        toNumber(player.hitChance);

      const hrProb =
        toNumber(player.hrProb) ??
        toNumber(player.hrProbability) ??
        toNumber(player.hrChance) ??
        toNumber(player.homeRunChance) ??
        toNumber(player.homeRunProb) ??
        toNumber(player.homeRunProbability) ??
        toNumber(player.homerChance) ??
        toNumber(player.homerProb) ??
        toNumber(player.homerunChance);

      if (playerName && hitProb !== null) {
        hitProps.push({
          player: playerName,
          team,
          market: "Hit",
          probability: hitProb,
          avg: player.avg ?? player.AVG ?? "",
          ops: player.ops ?? player.OPS ?? ""
        });
      }

      if (playerName && hrProb !== null) {
        hrProps.push({
          player: playerName,
          team,
          market: "HR",
          probability: hrProb,
          hr: player.hr ?? player.HR ?? player.homeRuns ?? "",
          slg: player.slg ?? player.SLG ?? ""
        });
      }
    }
  }

  moneylines.sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) {
      return b.confidenceScore - a.confidenceScore;
    }

    return (b.probability || 0) - (a.probability || 0);
  });

  runLines.sort((a, b) => (b.probability || 0) - (a.probability || 0));
  teamTotals.sort((a, b) => (b.probability || 0) - (a.probability || 0));
  hitProps.sort((a, b) => (b.probability || 0) - (a.probability || 0));
  hrProps.sort((a, b) => (b.probability || 0) - (a.probability || 0));

  const baseBoard = {
    rankedMoneylines: moneylines.slice(0, 10),
    rankedRunLines: runLines.slice(0, 10),
    rankedTeamTotals: teamTotals.slice(0, 10),
    rankedHitProps: hitProps.slice(0, 10),
    rankedHrProps: hrProps.slice(0, 10)
  };

  return {
    ...baseBoard,
    officialBestByGame: buildOfficialBestByGame(baseBoard)
  };
}

function boardIsEmpty(board) {
  return (
    board.rankedMoneylines.length === 0 &&
    board.rankedRunLines.length === 0 &&
    board.rankedTeamTotals.length === 0 &&
    board.rankedHitProps.length === 0 &&
    board.rankedHrProps.length === 0
  );
}

router.post("/analyze", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_API_KEY is not loaded on the server"
      });
    }

    const games = req.body.games || [];

    if (!games.length) {
      return res.status(400).json({
        success: false,
        error: "No games received"
      });
    }

    const aiBoard = buildAIBoard(games);

    console.log("🔥 RAW GAME SAMPLE:");
    console.log(JSON.stringify(games[0], null, 2));

    console.log("✅ AI BOARD:");
    console.log(JSON.stringify(aiBoard, null, 2));

    if (boardIsEmpty(aiBoard)) {
      return res.json({
        success: true,
        board: aiBoard,
        analysis: `
🤖 AI BETTING SELECTOR

⚠️ Analyze at least one game first.

The AI is receiving schedule data only.

Missing completed model data:
- Moneyline pick
- Model probability
- Confidence
- Run Line
- Cover probability
- Team Totals
- Player Props

Run ANALYZE WITH AI on one game or RUN FULL ANALYSIS for the full slate.
`
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const prompt = `
You are AI Betting Selector.

Select the best betting plays using ONLY this ordered board.
Do NOT use external information.
Do NOT invent players, teams, probabilities, or confidence levels.
Do NOT change confidence levels.
Do NOT recalculate probabilities.
Do NOT use raw schedule data.
Do NOT use recent records unless they are included in the board.

IMPORTANT RULES:
- HIGH, MEDIUM, and LOW are confidence levels.
- Risk must be: Low, Medium, Medium-high, or High.
- If Confidence is LOW, Risk must be Medium-high or High.
- If Confidence is MEDIUM, Risk must be Medium.
- If Confidence is HIGH, Risk can be Low or Medium.

GAME EXCLUSIVITY RULE:
For each game, there can be ONLY ONE main recommended play.
Use officialBestByGame as the official list for:
- BEST PLAYS
- CONSERVATIVE TICKET
- AGGRESSIVE TICKET

FORBIDDEN:
- Recommending ML and RL from the same team as strong plays at the same time.
- Duplicating the same game across correlated markets.
- Inventing unavailable picks.

TOTALS RULE:
- If rankedTeamTotals has plays, you must evaluate if any deserve to be included.
- If there is a Team Total Over or Under, it can be used as a recommended Over/Under play.

CONSERVATIVE TICKET:
- Maximum 4 plays.
- Only one play per game.
- Use ONLY picks included in officialBestByGame.
- Prioritize stability.
- Avoid HR props.

AGGRESSIVE TICKET:
- Maximum 5 plays.
- Only one play per game.
- Use ONLY picks included in officialBestByGame.
- May include 1 Hit Prop or 1 HR Prop if there is value.

BOARD:
${JSON.stringify(aiBoard, null, 2)}

FINAL FORMAT:

🤖 AI BETTING SELECTOR

🎯 BEST PLAYS

1. Pick:
- Market:
- Team/Player:
- Probability:
- Confidence:
- Signal:
- Reason:
- Risk:

2. Pick:
- Market:
- Team/Player:
- Probability:
- Confidence:
- Signal:
- Reason:
- Risk:

3. Pick:
- Market:
- Team/Player:
- Probability:
- Confidence:
- Signal:
- Reason:
- Risk:

4. Pick:
- Market:
- Team/Player:
- Probability:
- Confidence:
- Signal:
- Reason:
- Risk:

5. Pick:
- Market:
- Team/Player:
- Probability:
- Confidence:
- Signal:
- Reason:
- Risk:

━━━━━━━━━━━━━━━━━━━━

⚾ BEST MONEYLINE PLAYS

Include ONLY picks from officialBestByGame where market is Moneyline.

1.
2.
3.

━━━━━━━━━━━━━━━━━━━━

📊 BEST RUN LINE PLAYS

Include ONLY picks from officialBestByGame where market is Run Line.

1.
2.
3.

━━━━━━━━━━━━━━━━━━━━

📈 BEST TOTALS / TEAM TOTALS

1.
2.
3.

━━━━━━━━━━━━━━━━━━━━

🔥 TOP 5 HIT PROPS

If rankedHitProps has data, show the best 5 Hit Props.
Only if rankedHitProps is empty respond:
⚠️ Hit Props unavailable.

━━━━━━━━━━━━━━━━━━━━

💣 TOP 5 HR PROPS

If rankedHrProps has data, show the best 5 HR Props.
Only if rankedHrProps is empty respond:
⚠️ HR Props unavailable.

━━━━━━━━━━━━━━━━━━━━

🎟️ CONSERVATIVE TICKET

━━━━━━━━━━━━━━━━━━━━

🚀 AGGRESSIVE TICKET

━━━━━━━━━━━━━━━━━━━━

⚠️ PLAYS TO AVOID

━━━━━━━━━━━━━━━━━━━━

🧠 FINAL CALL

- Best overall play:
- Best value market:
- Best player prop:
- Final recommendation:
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are AI Betting Selector. Use officialBestByGame only for main picks. Do not invent, recalculate, or change confidence levels. If rankedHitProps or rankedHrProps contain data, you must display them."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0
    });

    const analysis =
      completion.choices?.[0]?.message?.content ||
      "No analysis generated.";

    res.json({
      success: true,
      board: aiBoard,
      analysis
    });

  } catch (error) {
    console.error("AI ERROR FULL:", error);

    res.status(500).json({
      success: false,
      error: "AI analysis failed",
      details: error.message || String(error),
      status: error.status || null,
      code: error.code || null,
      type: error.type || null
    });
  }
});

export default router;