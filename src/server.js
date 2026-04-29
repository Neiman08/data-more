import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import gamesRoutes from './routes/games.js';
import soccerRoutes from './routes/soccer.js';
import nbaRoutes from './routes/nba.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static('public'));

app.use('/api', gamesRoutes);
app.use('/api', soccerRoutes);
app.use('/api', nbaRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/soccer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/soccer.html'));
});

app.get('/nba', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/nba.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});