import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import gamesRoute from './routes/games.js';
import soccerRoute from './routes/soccer.js';
import baseballRoutes from './routes/baseball.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', gamesRoute);
app.use('/api', soccerRoute);
app.use('/api/baseball', baseballRoutes);

app.get('/api/test', (req, res) => {
  res.send('SERVER TEST OK');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/soccer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/soccer.html'));
});

app.listen(PORT, () => {
  console.log(`🔥 Server corriendo en http://localhost:${PORT}`);
  console.log('✅ Baseball route mounted at /api/baseball');
});