import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const BASE_URL = 'https://api.theracingapi.com/v1';

function getAuthHeaders() {
  const username = process.env.RACING_API_USERNAME;
  const password = process.env.RACING_API_PASSWORD;

  const token = Buffer.from(`${username}:${password}`).toString('base64');

  return {
    Authorization: `Basic ${token}`,
    'Content-Type': 'application/json'
  };
}

// 🏇 Obtener carreras del día
router.get('/racecards', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const response = await fetch(`${BASE_URL}/racecards?date=${date}`, {
      headers: getAuthHeaders()
    });

    const data = await response.json();

    res.json({
      ok: true,
      date,
      meetings: data.racecards || []
    });

  } catch (error) {
    console.error(error);
    res.json({ ok: false });
  }
});

// 🏇 Obtener una carrera específica
router.get('/race/:raceId', async (req, res) => {
  try {
    const raceId = req.params.raceId;

    const response = await fetch(`${BASE_URL}/racecards/${raceId}`, {
      headers: getAuthHeaders()
    });

    const data = await response.json();

    res.json({
      ok: true,
      race: data
    });

  } catch (error) {
    res.json({ ok: false });
  }
});

export default router;