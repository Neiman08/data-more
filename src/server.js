import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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

const DEFAULT_CORS_ORIGINS = [
  'https://data-more.onrender.com',
  'https://data-more.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const allowedCorsOrigins = (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS.join(','))
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(helmet());

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedCorsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  }
}));

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

app.use(express.json({ limit: '100kb' }));

app.use(express.urlencoded({
  limit: '100kb',
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many auth attempts. Please try again later.'
  }
});

const picksSaveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many pick save requests. Please try again later.'
  }
});

const gradeAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many admin requests. Please try again later.'
  }
});

const aiEndpointLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many AI requests. Please try again later.'
  }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/ai', aiEndpointLimiter);
app.use('/api/analyze', aiEndpointLimiter);
app.use('/api/soccer/analyze', aiEndpointLimiter);
app.use('/api/nba-analyze', aiEndpointLimiter);
app.use('/api/nba-ticket', aiEndpointLimiter);
app.use('/api/ufc/simulate', aiEndpointLimiter);

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
// ADMIN / VALIDATION MIDDLEWARE
// =========================

function requireAdminKey(req, res, next) {
  const key = req.headers['x-admin-key'];
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey || key !== adminKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  next();
}

const dangerousPayloadKeys = new Set([
  '$where',
  '$set',
  '$push',
  '$inc',
  '$rename',
  '$unset',
  '__proto__',
  'constructor',
  'prototype'
]);

function containsDangerousKeys(value) {
  if (!value || typeof value !== 'object') return false;

  if (Array.isArray(value)) {
    return value.some(item => containsDangerousKeys(item));
  }

  return Object.entries(value).some(([key, nested]) =>
    dangerousPayloadKeys.has(key) ||
    key.startsWith('$') ||
    containsDangerousKeys(nested)
  );
}

function isValidPickPayload(pick) {
  if (!pick || typeof pick !== 'object' || Array.isArray(pick)) return false;
  if (containsDangerousKeys(pick)) return false;

  const requiredStrings = ['date', 'market', 'pick'];
  const hasRequired = requiredStrings.every(field =>
    typeof pick[field] === 'string' &&
    pick[field].trim().length > 0 &&
    pick[field].length <= 200
  );

  if (!hasRequired) return false;

  const optionalStrings = [
    'sport',
    'event',
    'homeTeam',
    'awayTeam',
    'gamePk',
    'fixtureId',
    'playerName',
    'team',
    'source',
    'finalScore'
  ];

  return optionalStrings.every(field =>
    pick[field] === undefined ||
    pick[field] === null ||
    (typeof pick[field] === 'string' && pick[field].length <= 500)
  );
}

function validatePicksPayload(req, res, next) {
  if (containsDangerousKeys(req.body)) {
    return res.status(400).json({ ok: false, error: 'Invalid pick payload.' });
  }

  const picks = Array.isArray(req.body) ? req.body : [req.body];

  if (!picks.length || picks.length > 25 || !picks.every(isValidPickPayload)) {
    return res.status(400).json({ ok: false, error: 'Invalid pick payload.' });
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

app.get('/api/payment-requests', gradeAdminLimiter, requireAdminKey, async (req, res) => {
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

app.post('/api/activate-pro', gradeAdminLimiter, requireAdminKey, async (req, res) => {
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

function normalizePickMarket(market = '') {
  const compact = String(market || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (compact === 'ML' || compact === 'MONEYLINE' || compact === 'WINNER') return 'ML';
  if (compact === 'RL' || compact === 'RUNLINE') return 'RL';
  if (compact === '1X2' || compact === 'THREEWAY') return '1X2';

  return compact;
}

function gradeMlbPick(pick, game) {
  if (!game || !game.isFinal) return { result: 'pending', profit: null };

  const market = normalizePickMarket(pick.market);
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

function isFinalSoccerStatus(status) {
  return ['FT', 'AET', 'PEN'].includes(String(status || '').toUpperCase());
}

async function loadSoccerFixtureById(fixtureId) {
  const key = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY;

  if (!key || !fixtureId) return null;

  const response = await fetch(
    `https://v3.football.api-sports.io/fixtures?id=${encodeURIComponent(fixtureId)}`,
    {
      headers: { 'x-apisports-key': key }
    }
  );

  if (!response.ok) {
    throw new Error(`API-Football returned HTTP ${response.status}`);
  }

  const data = await response.json();
  const raw = data.response?.[0];

  if (!raw) return null;

  return {
    fixtureId: String(raw.fixture?.id || fixtureId),
    status: raw.fixture?.status?.short || '',
    homeTeam: raw.teams?.home?.name || '',
    awayTeam: raw.teams?.away?.name || '',
    homeScore: raw.goals?.home ?? raw.score?.fulltime?.home,
    awayScore: raw.goals?.away ?? raw.score?.fulltime?.away,
    finalScore: `${raw.teams?.home?.name || 'Home'} ${raw.goals?.home ?? 0} - ${raw.teams?.away?.name || 'Away'} ${raw.goals?.away ?? 0}`
  };
}

function gradeSoccerPick(pick, fixture) {
  if (!fixture || !isFinalSoccerStatus(fixture.status)) {
    return { result: 'pending', profit: null };
  }

  const market = normalizePickMarket(pick.market);
  const pickText = normalizeTeamName(pick.team || pick.pick);
  const home = normalizeTeamName(fixture.homeTeam);
  const away = normalizeTeamName(fixture.awayTeam);
  const isDrawPick = /(^|[^a-z])draw([^a-z]|$)|empate|tie/i.test(String(pick.pick || ''));

  if (market !== '1X2' && market !== 'ML') {
    return { result: 'pending', profit: null };
  }

  if (Number(fixture.homeScore) === Number(fixture.awayScore)) {
    const result = isDrawPick ? 'win' : 'loss';
    return {
      result,
      profit: calculateProfit(result, pick.odds, pick.stake)
    };
  }

  const winner = Number(fixture.homeScore) > Number(fixture.awayScore)
    ? home
    : away;
  const pickedWinner = pickText && (pickText.includes(winner) || winner.includes(pickText));
  const result = pickedWinner ? 'win' : 'loss';

  return {
    result,
    profit: calculateProfit(result, pick.odds, pick.stake)
  };
}

async function gradeMlbPicksForDate(date) {
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
      sport: pick.sport || 'MLB',
      gamePk: pick.gamePk,
      market: pick.market,
      pick: pick.pick,
      result: pick.result,
      finalScore: pick.finalScore,
      profit: pick.profit
    });
  }

  return graded;
}

async function gradeSoccerPicksForDate(date) {
  const picks = await Pick.find({
    date,
    sport: /^Soccer$/i
  });

  const fixtureCache = new Map();
  const graded = [];

  for (const pick of picks) {
    const fixtureId = String(pick.fixtureId || '');
    let fixture = fixtureCache.get(fixtureId);

    if (!fixtureCache.has(fixtureId)) {
      fixture = fixtureId ? await loadSoccerFixtureById(fixtureId) : null;
      fixtureCache.set(fixtureId, fixture);
    }

    const grade = gradeSoccerPick(pick, fixture);

    pick.result = grade.result;
    pick.profit = grade.profit;
    pick.finalScore = fixture?.finalScore || pick.finalScore;
    pick.homeTeam = pick.homeTeam || fixture?.homeTeam;
    pick.awayTeam = pick.awayTeam || fixture?.awayTeam;
    pick.event = pick.event || (fixture ? `${fixture.homeTeam} vs ${fixture.awayTeam}` : pick.event);
    pick.updatedAt = new Date();

    await pick.save();

    graded.push({
      id: pick._id,
      sport: 'Soccer',
      fixtureId: pick.fixtureId,
      market: pick.market,
      pick: pick.pick,
      result: pick.result,
      finalScore: pick.finalScore,
      profit: pick.profit
    });
  }

  return graded;
}

async function gradePicksForDate(date, sport = 'all') {
  const selected = String(sport || 'all').toLowerCase();
  const graded = [];

  if (selected === 'all' || selected === 'mlb') {
    graded.push(...await gradeMlbPicksForDate(date));
  }

  if (selected === 'all' || selected === 'soccer') {
    graded.push(...await gradeSoccerPicksForDate(date));
  }

  return graded;
}

function shiftISODate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function localISODate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function formatPercentNumber(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : 0;
}

function summarizePicks(picks = []) {
  const total = picks.length;
  const wins = picks.filter(p => p.result === 'win').length;
  const losses = picks.filter(p => p.result === 'loss').length;
  const pushes = picks.filter(p => p.result === 'push').length;
  const pending = picks.filter(p => p.result === 'pending').length;
  const settled = wins + losses + pushes;
  const graded = wins + losses;
  const profit = picks.reduce((sum, pick) => sum + (Number(pick.profit) || 0), 0);
  const stake = picks
    .filter(pick => ['win', 'loss', 'push'].includes(pick.result))
    .reduce((sum, pick) => sum + (Number(pick.stake) || 1), 0);

  return {
    total,
    settled,
    pending,
    wins,
    losses,
    pushes,
    profit: Number(profit.toFixed(2)),
    stake: Number(stake.toFixed(2)),
    winRate: graded ? formatPercentNumber((wins / graded) * 100) : 0,
    roi: stake ? formatPercentNumber((profit / stake) * 100) : 0
  };
}

async function gradeRecentPendingPicks() {
  const today = localISODate();
  const dates = Array.from({ length: 8 }, (_, index) => shiftISODate(today, -index));

  for (const date of dates) {
    const pending = await Pick.exists({
      date,
      result: 'pending',
      $or: [
        { sport: /^MLB$/i },
        { sport: /^Soccer$/i },
        { sport: { $exists: false } },
        { sport: '' }
      ]
    });

    if (pending) {
      await gradePicksForDate(date, 'all');
    }
  }
}

app.get('/api/performance/summary', async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 30));
    const endDate = localISODate();
    const startDate = shiftISODate(endDate, -(days - 1));
    const sport = String(req.query.sport || 'all');
    const query = {
      date: {
        $gte: startDate,
        $lte: endDate
      }
    };

    if (sport.toLowerCase() !== 'all') {
      query.sport = new RegExp(`^${sport}$`, 'i');
    }

    const picks = await Pick.find(query).lean();
    const normalized = picks.map(pick => ({
      ...pick,
      sport: pick.sport || 'MLB',
      result: pick.result || 'pending'
    }));
    const overall = summarizePicks(normalized);
    const sports = ['MLB', 'Soccer', 'Horse Racing', 'UFC'].map(name => ({
      sport: name,
      ...summarizePicks(
        normalized.filter(pick =>
          String(pick.sport || 'MLB').toLowerCase() === name.toLowerCase()
        )
      )
    }));
    const bestSport = [...sports]
      .filter(item => item.settled > 0)
      .sort((a, b) => b.roi - a.roi || b.winRate - a.winRate)[0]?.sport || 'N/A';

    res.json({
      ok: true,
      days,
      startDate,
      endDate,
      overall,
      sports,
      bestSport
    });
  } catch (err) {
    console.error('Performance summary error:', err);
    res.status(500).json({ ok: false, error: 'Unable to load performance summary.' });
  }
});

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

app.post('/api/picks/save', picksSaveLimiter, validatePicksPayload, async (req, res) => {
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
          returnDocument: 'after',
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

app.post('/api/picks/grade', gradeAdminLimiter, requireAdminKey, async (req, res) => {
  try {
    const date = req.query.date || req.body?.date;
    const sport = req.query.sport || req.body?.sport || 'all';

    if (!date) {
      return res.status(400).json({ ok: false, error: 'date is required' });
    }

    const graded = await gradePicksForDate(date, sport);

    res.json({
      ok: true,
      date,
      sport,
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
// PICKS GRADING JOB
// =========================

setTimeout(() => {
  gradeRecentPendingPicks().catch(err => {
    console.error('Initial picks grading job failed:', err.message);
  });
}, 30 * 1000);

setInterval(() => {
  gradeRecentPendingPicks().catch(err => {
    console.error('Scheduled picks grading job failed:', err.message);
  });
}, 60 * 60 * 1000);

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
