import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 1. Configurar dotenv al inicio
dotenv.config(); 

// 2. Importación de rutas
import gamesRoutes from './routes/games.js';
import baseballRoutes from './routes/baseball.js';
import soccerRoutes from './routes/soccer.js';
import nbaRoutes from './routes/nba.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- TEST DE DEPURACIÓN ---
console.log('--- Validación de Variables ---');
console.log('PORT en .env:', process.env.PORT);
console.log('ODDS_API_KEY cargada:', process.env.ODDS_API_KEY ? 'SÍ' : 'NO (Error)');
console.log('-------------------------------');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// 3. Configuración de Rutas de la API
// Se recomienda asignar el prefijo del deporte aquí para limpiar los archivos internos de rutas
app.use('/api', gamesRoutes);
app.use('/api/baseball', baseballRoutes); // Las rutas en baseball.js ahora deben ser '/' y '/analyze/:gamePk'
app.use('/api/soccer', soccerRoutes);     // Las rutas en soccer.js deben ser relativas a /api/soccer
app.use('/api/nba', nbaRoutes);           // Las rutas en nba.js deben ser relativas a /api/nba

// 4. Rutas para servir archivos HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/soccer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/soccer.html'));
});

app.get('/nba', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/nba.html'));
});

// 5. Inicio del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
