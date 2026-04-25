const ODDS_BASE_URL = 'https://api.the-odds-api.com/v4/sports/baseball_mlb/odds';

export async function getMlbOdds() {
  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey || apiKey === 'your_odds_api_key_here') {
    return [];
  }

  const url = new URL(ODDS_BASE_URL);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', process.env.ODDS_REGION || 'us');
  url.searchParams.set('markets', process.env.ODDS_MARKETS || 'h2h');
  url.searchParams.set('oddsFormat', 'american');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'mlb-picks-base/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Odds API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
