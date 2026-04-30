import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import User from './models/User.js';
import Pick from './models/Pick.js';
import GameAnalysis from './models/GameAnalysis.js';

import gamesRoutes from './routes/games.js';
import baseballRoutes from './routes/baseball.js';
import soccerRoutes from './routes/soccer.js';
import nbaRoutes from './routes/nba.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Configuración de variables de entorno
if (!process.env.MONGO_URI) {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

if (!process.env.MONGO_URI) {
  console.error('❌ ERROR: MONGO_URI no está definida. Revisa tu archivo .env o Render Environment Variables.');
  process.exit(1);
}

// Conexión a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🚀 Conectado a MongoDB Atlas (Data More PRO)'))
  .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// --- RUTAS DE AUTENTICACIÓN (API) ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).send('<h1>Error</h1><p>El correo ya está registrado.</p><a href="/registro">Intentar de nuevo</a>');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ nombre, email, password: hashedPassword });
    await newUser.save();

    res.redirect('/login');
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).send('Error en el servidor durante el registro');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ ok: false, message: 'Usuario no encontrado' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ ok: false, message: 'Contraseña incorrecta' });
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
    console.error('Error en login:', err);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
});

// --- RUTAS DE PICKS Y ANÁLISIS (API) ---

app.post('/api/picks/save', async (req, res) => {
  try {
    const picks = Array.isArray(req.body) ? req.body : [req.body];

    const cleanPicks = picks
      .filter(p => p && p.market && p.pick)
      .map(p => ({
        date: p.date,
        market: p.market,
        gamePk: String(p.gamePk),
        playerName: p.playerName || '',
        team: p.team || '',
        pick: p.pick,
        result: p.result || 'pending'
      }));

    if (!cleanPicks.length) {
      return res.status(400).json({ ok: false, message: 'No hay picks válidos' });
    }

    const saved = await Pick.insertMany(cleanPicks);
    res.json({ ok: true, saved: saved.length });
  } catch (err) {
    console.error('Error guardando picks:', err);
    res.status(500).json({ ok: false, message: 'Error guardando picks' });
  }
});

app.post('/api/analysis/lock', async (req, res) => {
  try {
    const { date, gamePk, lineupConfirmed, analysis, props } = req.body;

    if (!date || !gamePk || !analysis) {
      return res.status(400).json({ ok: false, message: 'Faltan datos' });
    }

    const existing = await GameAnalysis.findOne({ date, gamePk: String(gamePk) });
    if (existing) {
      return res.json({ ok: true, locked: true, source: 'mongo', analysis: existing });
    }

    if (!lineupConfirmed) {
      return res.json({ ok: true, locked: false, message: 'Lineup no confirmado' });
    }

    const saved = await GameAnalysis.create({
      date,
      gamePk: String(gamePk),
      lineupConfirmed: true,
      moneyline: analysis.pick ? {
        pick: analysis.pick,
        confidence: analysis.confidence,
        away: analysis.away,
        home: analysis.home
      } : {},
      runLine: analysis.runLine || {},
      teamTotals: analysis.teamTotals || {},
      playerProps: props || []
    });

    res.json({ ok: true, locked: true, source: 'new', analysis: saved });
  } catch (err) {
    console.error('Error congelando análisis:', err);
    res.status(500).json({ ok: false, message: 'Error congelando análisis' });
  }
});

// --- ESTADÍSTICAS (API) ---

app.get('/api/stats/daily-performance', async (req, res) => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = yesterday.toISOString().split('T')[0];

    const picks = await Pick.find({ date });

    const calc = (arr) => {
      const graded = arr.filter(p => p.result === 'win' || p.result === 'loss');
      const wins = graded.filter(p => p.result === 'win').length;
      return graded.length ? Math.round((wins / graded.length) * 100) : 0;
    };

    res.json({
      ok: true,
      date,
      mlSuccess: calc(picks.filter(p => p.market === 'ML')),
      rlSuccess: calc(picks.filter(p => p.market === 'RL')),
      propsSuccess: calc(picks.filter(p => ['HIT', 'HR'].includes(p.market))),
      totalWins: picks.filter(p => p.result === 'win').length
    });
  } catch (err) {
    console.error('Error en performance:', err);
    res.status(500).json({ ok: false, message: 'Error calculando estadísticas' });
  }
});

// --- IMPORTACIÓN DE RUTAS MODULARES ---
app.use('/api', gamesRoutes);
app.use('/api/baseball', baseballRoutes);
app.use('/api', soccerRoutes);
app.use('/api', nbaRoutes);

// --- RUTAS DE FRONTEND (PÁGINAS HTML) ---

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/registro', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/registro.html'));
});

app.get('/soccer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/soccer.html'));
});

app.get('/nba', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/nba.html'));
});

app.get('/pro', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pro.html'));
});

app.get('/pago-manual', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pago-manual.html'));
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
