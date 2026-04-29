import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

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

// --- DEBUG ---
console.log('--- Validación de Variables ---');
console.log('PORT:', process.env.PORT);
console.log('ODDS_API_KEY:', process.env.ODDS_API_KEY ? 'OK' : 'ERROR');
console.log('-------------------------------');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// 3. RUTAS API (🔥 CORREGIDO)
app.use('/api', gamesRoutes);
app.use('/api/baseball', baseballRoutes);

// 🔥 IMPORTANTE: SIN PREFIJO EXTRA
app.use('/api', soccerRoutes);
app.use('/api', nbaRoutes);

// 4. RUTAS FRONTEND
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/soccer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/soccer.html'));
});

app.get('/nba', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/nba.html'));
});

// 5. INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});