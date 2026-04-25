import express from 'express';

const router = express.Router();

router.get('/soccer-games', async (req, res) => {
  try {
    const response = await fetch(
      'https://api.football-data.org/v4/matches',
      {
        headers: {
          'X-Auth-Token': 'YOUR_API_KEY'
        }
      }
    );

    const data = await response.json();

    res.json({
      ok: true,
      matches: data.matches || []
    });

  } catch (error) {
    res.json({
      ok: false,
      error: error.message
    });
  }
});

export default router;