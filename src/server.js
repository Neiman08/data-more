import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. IMPORTS DE RUTAS
import soccerRoutes from './routes/soccer.js';
import nbaRoutes from './routes/nba.js'; // Nueva ruta agregada

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.static('public'));

// 2. CONEXIÓN DE LAS API
app.use('/api', soccerRoutes);
app.use('/api', nbaRoutes); // Conexión de la API de NBA

// 3. RUTAS PARA SERVIR HTML
app.get('/soccer', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/soccer.html'));
});

app.get('/nba', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/nba.html')); // Nueva ruta HTML
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
