import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

dotenv.config();

import gamesRoutes from './routes/games.js';
import baseballRoutes from './routes/baseball.js';
import soccerRoutes from './routes/soccer.js';
import nbaRoutes from './routes/nba.js';
import Pick from './models/Pick.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🚀 Conectado a MongoDB Atlas (Data More PRO)'))
  .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

const userSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fechaRegistro: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Registro
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

    res.send('<h1>✅ Registro Exitoso</h1><p>Bienvenido a Data More. Ya puedes volver al inicio.</p><a href="/">Volver al inicio</a>');
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).send('Error en el servidor durante el registro');
  }
});

// Guardar picks
app.post('/api/picks/save', async (req, res) => {
  try {
    const picks = Array.isArray(req.body) ? req.body : [req.body];

    const cleanPicks = picks
      .filter(p => p && p.market && p.pick)
      .map(p => ({
        date: p.date,
        market: p.market,
        gamePk: p.gamePk,
        playerName: p.playerName || '',
        team: p.team || '',
        pick: p.pick,
        result: p.result || 'pending'
      }));

    if (!cleanPicks.length) {
      return res.status(400).json({ ok: false, message: 'No hay picks válidos para guardar' });
    }

    const saved = await Pick.insertMany(cleanPicks);

    res.json({ ok: true, saved: saved.length });
  } catch (err) {
    console.error('Error guardando picks:', err);
    res.status(500).json({ ok: false, message: 'Error guardando picks' });
  }
});

// Banner real basado en MongoDB
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

    const ml = picks.filter(p => p.market === 'ML');
    const rl = picks.filter(p => p.market === 'RL');
    const hits = picks.filter(p => p.market === 'HIT');
    const hr = picks.filter(p => p.market === 'HR');

    const hitWinners = hits.filter(p => p.result === 'win').map(p => p.playerName).filter(Boolean);
    const hrWinners = hr.filter(p => p.result === 'win').map(p => p.playerName).filter(Boolean);

    res.json({
      ok: true,
      date,
      mlSuccess: calc(ml),
      rlSuccess: calc(rl),
      propsSuccess: calc([...hits, ...hr]),
      totalWins: picks.filter(p => p.result === 'win').length,
      topPlayers: hrWinners.length
        ? `HR: ${hrWinners.join(', ')} ✅`
        : hitWinners.length
          ? `Hits: ${hitWinners.join(', ')} ✅`
          : 'Pendiente de resultados oficiales'
    });
  } catch (err) {
    console.error('Error en daily-performance:', err);
    res.status(500).json({ ok: false, message: 'Error calculando estadísticas' });
  }
});

// Rutas API existentes
app.use('/api', gamesRoutes);
app.use('/api/baseball', baseballRoutes);
app.use('/api', soccerRoutes);
app.use('/api', nbaRoutes);

// Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/soccer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/soccer.html'));
});

app.get('/nba', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/nba.html'));
});

app.get('/registro', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/registro.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});