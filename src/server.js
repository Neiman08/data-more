import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// 1. Cargar variables de entorno
dotenv.config();

// 2. Importar rutas
import gamesRoutes from './routes/games.js';
import baseballRoutes from './routes/baseball.js';
import soccerRoutes from './routes/soccer.js';
import nbaRoutes from './routes/nba.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONEXIÓN A MONGODB ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🚀 Conectado a MongoDB Atlas (Data More PRO)'))
  .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

// --- MODELO DE USUARIO ---
const userSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fechaRegistro: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(express.static('public'));

// --- RUTAS DE AUTENTICACIÓN & STATS ---

// Registro de usuarios
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    let userExists = await User.findOne({ email });
    if (userExists) return res.status(400).send('<h1>Error</h1><p>El correo ya está registrado.</p><a href="/registro">Intentar de nuevo</a>');

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

// Ruta dinámica para el Banner de Logros
app.get('/api/stats/daily-performance', (req, res) => {
  res.json({
    ok: true,
    mlSuccess: 78,
    propsSuccess: 64,
    totalWins: 12,
    topPlayers: "Ohtani, Judge, Soto"
  });
});

// 3. RUTAS API EXISTENTES
app.use('/api', gamesRoutes);
app.use('/api/baseball', baseballRoutes);
app.use('/api', soccerRoutes);
app.use('/api', nbaRoutes);

// 4. RUTAS FRONTEND
// Se asume que los archivos están en una carpeta 'public' al mismo nivel o superior
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

// 5. INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
