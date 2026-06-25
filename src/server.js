import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';

// Models
import User from './models/User.js';
import Pick from './models/Pick.js';
import GameAnalysis from './models/GameAnalysis.js';
import PaymentRequest from './models/PaymentRequest.js';

// Routes
import gamesRoutes from './routes/games.js';
import baseballRoutes from './routes/baseball.js';
import soccerRoutes from './routes/soccer.js';
import nbaRoutes from './routes/nba.js';
import horseRoutes from './routes/horseRacing.js';
import gameCenter from './routes/gameCenter.js';
import aiRoutes from './routes/ai.js';
import voiceRoutes from './routes/voice.js';
import ufcRoutes from './routes/ufc.js';

const app = express();

app.use(cors());

console.log('✅ UFC routes imported');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =========================
// FALLBACK .ENV
// =========================

if (!process.env.MONGO_URI) {
  dotenv.config({
    path: path.resolve(__dirname, '../.env')
  });
}

if (!process.env.MONGO_URI) {
  console.error('❌ ERROR: MONGO_URI is not defined.');
  process.exit(1);
}

// =========================
// MONGODB
// =========================

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('🚀 Connected to MongoDB Atlas (Data More PRO)');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
  });

// =========================
// MIDDLEWARE
// =========================

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));

app.use(
  express.static(
    path.join(__dirname, '../public')
  )
);

// =========================
// RATE LIMIT
// =========================

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many requests. Please try again later.'
  }
});

app.use('/api', apiLimiter);

// =========================
// AUTH
// =========================

app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      nombre,
      email,
      telefono,
      password
    } = req.body;

    const userExists = await User.findOne({
      email
    });

    if (userExists) {
      return res.status(400).send(`
        <h1>Error</h1>
        <p>This email is already registered.</p>
      `);
    }

    const hashedPassword =
      await bcrypt.hash(password, 10);

    await new User({
      nombre,
      email,
      telefono,
      password: hashedPassword
    }).save();

    res.redirect('/login');

  } catch (err) {
    console.error(err);

    res.status(500).send(
      'Registration error'
    );
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body;

    const user =
      await User.findOne({ email });

    if (!user) {
      return res.json({
        ok: false,
        message: 'Invalid credentials'
      });
    }

    const validPassword =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!validPassword) {
      return res.json({
        ok: false,
        message: 'Invalid credentials'
      });
    }

    res.json({
      ok: true,
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        telefono: user.telefono || '',
        plan: user.plan || 'free',
        proActivo: user.proActivo || false
      }
    });

  } catch (err) {
    console.error(err);

    res.json({
      ok: false,
      message: 'Login error'
    });
  }
});

// =========================
// ADMIN MIDDLEWARE
// =========================

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || key !== adminKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

// =========================
// PAYMENTS
// =========================

app.post('/api/payment-request', async (req, res) => {
  try {
    const {
      nombre,
      email,
      metodo
    } = req.body;

    const request =
      await PaymentRequest.create({
        nombre,
        email,
        metodo
      });

    res.json({
      ok: true,
      request
    });

  } catch (err) {
    console.error(err);
    res.json({ ok: false });
  }
});

app.get('/api/payment-requests', requireAdmin, async (req, res) => {
  try {
    const requests =
      await PaymentRequest
        .find()
        .sort({ createdAt: -1 });

    res.json({
      ok: true,
      requests
    });

  } catch (err) {
    console.error(err);

    res.json({
      ok: false,
      requests: []
    });
  }
});

app.post('/api/activate-pro', requireAdmin, async (req, res) => {
  try {
    const {
      email,
      requestId
    } = req.body;

    await User.updateOne(
      { email },
      {
        proActivo: true,
        plan: 'pro'
      }
    );

    if (requestId) {
      await PaymentRequest.findByIdAndUpdate(
        requestId,
        { status: 'approved' }
      );
    }

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.json({ ok: false });
  }
});

// =========================
// PICKS
// =========================

const FINAL_BASEBALL_STATES = new Set([
  'final',
  'game over',
  'completed early',
  'completed'
]);

function normalizePickPayload(raw) {
  const result = String(raw.result || 'pending').toLowerCase();
  const allowedResults = ['pending', 'win', 'loss', 'push'];

  return {
    date: raw.date,
    sport: raw.sport || 'MLB',
    event: raw.event,
    homeTeam: raw.homeTeam,
    awayTeam: raw.awayTeam,
    market: raw.market,
    pick: raw.pick,
    odds: raw.odds,
    line: raw.line,
    stake: raw.stake ?? 1,
    result: allowedResults.includes(result) ? result : 'pending',
    finalScore: raw.finalScore,
    profit: raw.profit,
    gamePk: raw.gamePk ? String(raw.gamePk) : undefined,
    fixtureId: raw.fixtureId ? String(raw.fixtureId) : undefined,
    playerName: raw.playerName,
    team: raw.team,
    source: raw.source || 'Data More',
    updatedAt: new Date()
  };
}

function pickQueryFor(payload) {
  const key = {
    date: payload.date,
    sport: payload.sport || 'MLB',
    market: payload.market,
    pick: payload.pick
  };

  if (payload.gamePk) return { ...key, gamePk: String(payload.gamePk) };
  if (payload.fixtureId) return { ...key, fixtureId: String(payload.fixtureId) };

  return {
    ...key,
    event: payload.event || '',
    playerName: payload.playerName || ''
  };
}

function normalizeTeamName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function calculateProfit(result, odds, stake = 1) {
  if (result === 'pending') return null;
  if (result === 'loss') return -Math.abs(Number(stake) || 1);
  if (result === 'push') return 0;

  const numericOdds = Number(odds);
  const units = Number(stake) || 1;

  if (!Number.isFinite(numericOdds)) return 0.91 * units;
  if (numericOdds > 0) return (numericOdds / 100) * units;
  if (numericOdds < 0) return (100 / Math.abs(numericOdds)) * units;

  return 0.91 * units;
}

async function loadMlbGamesForDate(date) {
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=linescore,team`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`MLB Stats API returned HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.dates?.[0]?.games || [];
}

function normalizeMlbGradeGame(game) {
  const away = game.teams?.away;
  const home = game.teams?.home;
  const status = String(game.status?.detailedState || game.status?.abstractGameState || '').toLowerCase();
  const awayScore = away?.score;
  const homeScore = home?.score;
  const isFinal = FINAL_BASEBALL_STATES.has(status) || status.includes('final');

  return {
    gamePk: String(game.gamePk),
    isFinal,
    awayTeam: away?.team?.name || '',
    homeTeam: home?.team?.name || '',
    awayScore,
    homeScore,
    finalScore: `${away?.team?.name || 'Away'} ${awayScore ?? 0} - ${home?.team?.name || 'Home'} ${homeScore ?? 0}`,
    winner: Number(awayScore) > Number(homeScore)
      ? away?.team?.name || ''
      : Number(homeScore) > Number(awayScore)
        ? home?.team?.name || ''
        : ''
  };
}

function gradeMlbPick(pick, game) {
  if (!game || !game.isFinal) return { result: 'pending', profit: null };

  const market = String(pick.market || '').toUpperCase();
  const pickText = normalizeTeamName(pick.team || pick.pick);
  const winner = normalizeTeamName(game.winner);
  const away = normalizeTeamName(game.awayTeam);
  const home = normalizeTeamName(game.homeTeam);

  if (market === 'ML') {
    if (!winner || !pickText) return { result: 'pending', profit: null };

    const pickedWinner = pickText.includes(winner) || winner.includes(pickText);
    const result = pickedWinner ? 'win' : 'loss';

    return {
      result,
      profit: calculateProfit(result, pick.odds, pick.stake)
    };
  }

  if (market === 'RL') {
    const rawLine = Number(
      pick.line ??
      String(pick.pick || '').match(/([+-]\d+(?:\.\d+)?)/)?.[1]
    );

    const pickedAway = pickText.includes(away) || away.includes(pickText);
    const pickedHome = pickText.includes(home) || home.includes(pickText);

    if (!Number.isFinite(rawLine) || (!pickedAway && !pickedHome)) {
      return { result: 'pending', profit: null };
    }

    const margin = pickedAway
      ? Number(game.awayScore) - Number(game.homeScore)
      : Number(game.homeScore) - Number(game.awayScore);
    const adjusted = margin + rawLine;
    const result = adjusted > 0 ? 'win' : adjusted < 0 ? 'loss' : 'push';

    return {
      result,
      profit: calculateProfit(result, pick.odds, pick.stake)
    };
  }

  return { result: 'pending', profit: null };
}

app.get('/api/picks', async (req, res) => {
  try {
    const date = req.query.date;
    const sport = String(req.query.sport || 'all');

    if (!date) {
      return res.status(400).json({ ok: false, error: 'date is required' });
    }

    const query = { date };

    if (sport.toLowerCase() !== 'all') {
      const sportRegex = new RegExp(`^${sport}$`, 'i');

      if (sport.toLowerCase() === 'mlb') {
        query.$or = [
          { sport: sportRegex },
          { sport: { $exists: false } },
          { sport: '' }
        ];
      } else {
        query.sport = sportRegex;
      }
    }

    const picks = await Pick.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      ok: true,
      date,
      sport,
      count: picks.length,
      picks
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Unable to load picks.' });
  }
});

app.post('/api/picks/save', async (req, res) => {
  try {
    const picks = Array.isArray(req.body)
      ? req.body
      : [req.body];

    const clean = picks.filter(
      p => p.date && p.market && p.pick
    );

    const saved = [];

    for (const pick of clean) {
      const payload = normalizePickPayload(pick);

      const doc = await Pick.findOneAndUpdate(
        pickQueryFor(payload),
        {
          $set: payload,
          $setOnInsert: { createdAt: new Date() }
        },
        {
          new: true,
          upsert: true
        }
      );

      saved.push(doc);
    }

    res.json({ ok: true, count: saved.length, picks: saved });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Unable to save picks.' });
  }
});

app.post('/api/picks/grade', async (req, res) => {
  try {
    const date = req.query.date || req.body?.date;

    if (!date) {
      return res.status(400).json({ ok: false, error: 'date is required' });
    }

    const picks = await Pick.find({
      date,
      $or: [
        { sport: /^MLB$/i },
        { sport: { $exists: false } },
        { sport: '' }
      ]
    });

    const rawGames = await loadMlbGamesForDate(date);
    const gamesByPk = new Map(
      rawGames
        .map(normalizeMlbGradeGame)
        .map(game => [game.gamePk, game])
    );

    const graded = [];

    for (const pick of picks) {
      const game = gamesByPk.get(String(pick.gamePk || ''));
      const grade = gradeMlbPick(pick, game);

      pick.result = grade.result;
      pick.profit = grade.profit;
      pick.finalScore = game?.finalScore || pick.finalScore;
      pick.homeTeam = pick.homeTeam || game?.homeTeam;
      pick.awayTeam = pick.awayTeam || game?.awayTeam;
      pick.event = pick.event || (game ? `${game.awayTeam} @ ${game.homeTeam}` : pick.event);
      pick.updatedAt = new Date();

      await pick.save();

      graded.push({
        id: pick._id,
        gamePk: pick.gamePk,
        market: pick.market,
        pick: pick.pick,
        result: pick.result,
        finalScore: pick.finalScore,
        profit: pick.profit
      });
    }

    res.json({
      ok: true,
      date,
      sport: 'MLB',
      count: graded.length,
      graded
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Unable to grade picks.' });
  }
});

// =========================
// ROUTES
// =========================

app.use('/api', gamesRoutes);

app.use('/api/baseball', baseballRoutes);

app.use('/api/soccer', soccerRoutes);

app.use('/api', nbaRoutes);

app.use('/api/horse-racing', horseRoutes);

app.use('/api/game-center', gameCenter);

app.use('/api/ai', aiRoutes);

app.use('/api/voice', voiceRoutes);

app.use('/api/ufc', ufcRoutes);

console.log('✅ UFC API mounted at /api/ufc/fights');

// =========================
// TOP PICKS WIDGET API
// =========================

app.get('/api/top-picks', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Direct MLB Stats API call — no internal localhost dependency
    const mlbRes = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=team`
    );
    const mlbData = await mlbRes.json();
    const rawGames = mlbData.dates?.[0]?.games || [];

    if (!rawGames.length) {
      return res.json({ ok: false, picks: [] });
    }

    const picks = rawGames
      .map(game => {
        const awayRecord = game.teams?.away?.leagueRecord;
        const homeRecord = game.teams?.home?.leagueRecord;
        const awayAbbrev = game.teams?.away?.team?.abbreviation || '';
        const homeAbbrev = game.teams?.home?.team?.abbreviation || '';

        const awayG = (awayRecord?.wins || 0) + (awayRecord?.losses || 0);
        const homeG = (homeRecord?.wins || 0) + (homeRecord?.losses || 0);

        const awayPct = awayG > 0 ? ((awayRecord.wins / awayG) * 100) : 50;
        const homePct = homeG > 0 ? ((homeRecord.wins / homeG) * 100) : 50;

        const bestPct = Math.max(awayPct, homePct);
        const favorite = homePct >= awayPct ? homeAbbrev : awayAbbrev;

        return {
          icon: '⚾',
          label: `${favorite} Moneyline`,
          market: `${bestPct.toFixed(1)}%`,
          confidence: bestPct
        };
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);

    res.json({ ok: true, picks });

  } catch (error) {
    console.error('TOP PICKS API ERROR:', error);
    res.status(500).json({ ok: false, picks: [] });
  }
});

// =========================
// DAILY STATS
// =========================

app.get('/api/stats/daily-performance', async (req, res) => {
  try {
    const yesterday = new Date();

    yesterday.setDate(
      yesterday.getDate() - 1
    );

    const date = yesterday
      .toISOString()
      .split('T')[0];

    const picks =
      await Pick.find({ date });

    const calc = (arr) => {
      const graded = arr.filter(
        p =>
          p.result === 'win' ||
          p.result === 'loss'
      );

      const wins = graded.filter(
        p => p.result === 'win'
      ).length;

      return graded.length
        ? Math.round(
            (wins / graded.length) * 100
          )
        : 0;
    };

    const hitWinners = picks
      .filter(p =>
        p.market === 'HIT' &&
        p.result === 'win'
      )
      .map(p => p.playerName)
      .filter(Boolean);

    const hrWinners = picks
      .filter(p =>
        p.market === 'HR' &&
        p.result === 'win'
      )
      .map(p => p.playerName)
      .filter(Boolean);

    res.json({
      ok: true,
      date,
      mlSuccess: calc(
        picks.filter(
          p => p.market === 'ML'
        )
      ),
      propsSuccess: calc(
        picks.filter(p =>
          ['HIT', 'HR'].includes(
            p.market
          )
        )
      ),
      totalWins:
        picks.filter(
          p => p.result === 'win'
        ).length,

      topPlayers:
        hrWinners.length
          ? `HR: ${hrWinners.join(', ')} ✅`
          : hitWinners.length
            ? `Hits: ${hitWinners.join(', ')} ✅`
            : 'Pending'
    });

  } catch (err) {
    console.error(
      'Stats error:',
      err
    );

    res.status(500).json({
      ok: false
    });
  }
});

// =========================
// FRONTEND
// =========================

app.get('/', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/index.html'
    )
  );
});

app.get('/login', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/login.html'
    )
  );
});

app.get('/registro', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/registro.html'
    )
  );
});

app.get('/soccer', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/soccer.html'
    )
  );
});

app.get('/nba', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/nba.html'
    )
  );
});

app.get('/horse', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/horse.html'
    )
  );
});

app.get('/ufc', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/ufc.html'
    )
  );
});

app.get('/ufc.html', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/ufc.html'
    )
  );
});

app.get('/mlb.html', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/mlb.html'
    )
  );
});

app.get('/picks.html', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/picks.html'
    )
  );
});

app.get('/pricing.html', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/pricing.html'
    )
  );
});

app.get('/resultados.html', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/resultados.html'
    )
  );
});

app.get('/estadisticas.html', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/estadisticas.html'
    )
  );
});

app.get('/faq.html', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/faq.html'
    )
  );
});

app.get('/game-detail.html', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/game-detail.html'
    )
  );
});

app.get('/pro', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/pro.html'
    )
  );
});

app.get('/pago-manual', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/pago-manual.html'
    )
  );
});

app.get('/admin-payments', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      '../public/admin-payments.html'
    )
  );
});

// =========================
// START SERVER
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
🚀 Data More Server Running
🌐 http://localhost:${PORT}
  `);
});
