import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
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

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallback .env
if (!process.env.MONGO_URI) {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

if (!process.env.MONGO_URI) {
  console.error('❌ ERROR: MONGO_URI is not defined.');
  process.exit(1);
}

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🚀 Connected to MongoDB Atlas (Data More PRO)'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

// Rate Limit
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

    const { nombre, email, password } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).send(`
        <h1>Error</h1>
        <p>This email is already registered.</p>
      `);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await new User({
      nombre,
      email,
      password: hashedPassword
    }).save();

    res.redirect('/login');

  } catch (err) {

    console.error(err);

    res.status(500).send('Registration error');
  }
});

app.post('/api/auth/login', async (req, res) => {

  try {

    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({
        ok: false,
        message: 'Invalid credentials'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);

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
// PAYMENTS
// =========================

app.post('/api/payment-request', async (req, res) => {

  try {

    const { nombre, email, metodo } = req.body;

    const request = await PaymentRequest.create({
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

    res.json({
      ok: false
    });
  }
});

app.get('/api/payment-requests', async (req, res) => {

  try {

    const requests = await PaymentRequest
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

app.post('/api/activate-pro', async (req, res) => {

  try {

    const { email, requestId } = req.body;

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

app.post('/api/picks/save', async (req, res) => {

  try {

    const picks = Array.isArray(req.body)
      ? req.body
      : [req.body];

    const clean = picks.filter(
      p => p.market && p.pick
    );

    await Pick.insertMany(clean);

    res.json({ ok: true });

  } catch (err) {

    console.error(err);

    res.json({ ok: false });
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

    const picks = await Pick.find({ date });

    const calc = (arr) => {

      const graded = arr.filter(
        p => p.result === 'win' || p.result === 'loss'
      );

      const wins = graded.filter(
        p => p.result === 'win'
      ).length;

      return graded.length
        ? Math.round((wins / graded.length) * 100)
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
        picks.filter(p => p.market === 'ML')
      ),

      propsSuccess: calc(
        picks.filter(p =>
          ['HIT', 'HR'].includes(p.market)
        )
      ),

      totalWins: picks.filter(
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

    console.error('Stats error:', err);

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
    path.join(__dirname, '../public/index.html')
  );
});

app.get('/login', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/login.html')
  );
});

app.get('/registro', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/registro.html')
  );
});

app.get('/soccer', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/soccer.html')
  );
});

app.get('/nba', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/nba.html')
  );
});

app.get('/horse', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/horse.html')
  );
});

app.get('/mlb.html', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/mlb.html')
  );
});

app.get('/picks.html', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/picks.html')
  );
});

app.get('/precios.html', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/precios.html')
  );
});

app.get('/resultados.html', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/resultados.html')
  );
});

app.get('/estadisticas.html', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/estadisticas.html')
  );
});

app.get('/faq.html', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/faq.html')
  );
});

app.get('/game-detail.html', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/game-detail.html')
  );
});

app.get('/pro', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/pro.html')
  );
});

app.get('/pago-manual', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/pago-manual.html')
  );
});

app.get('/admin-payments', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../public/admin-payments.html')
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