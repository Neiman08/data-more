const MLB_BASE_URL = 'https://statsapi.mlb.com/api/v1';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'mlb-picks-base/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`MLB request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getScheduleByDate(date) {
  const url = `${MLB_BASE_URL}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team`; 
  const data = await fetchJson(url);
  return data.dates?.flatMap((d) => d.games) || [];
}

export async function getTeamHittingStats(teamId) {
  const url = `${MLB_BASE_URL}/teams/${teamId}/stats?stats=season&group=hitting&sportIds=1`;
  const data = await fetchJson(url);
  const split = data.stats?.[0]?.splits?.[0]?.stat || {};

  return {
    teamId,
    avg: Number(split.avg || 0),
    obp: Number(split.obp || 0),
    slg: Number(split.slg || 0),
    ops: Number(split.ops || 0),
    runs: Number(split.runs || 0),
    gamesPlayed: Number(split.gamesPlayed || 0)
  };
}

export async function getPitcherStats(personId) {
  const url = `${MLB_BASE_URL}/people/${personId}/stats?stats=season&group=pitching&sportIds=1`;
  const data = await fetchJson(url);
  const split = data.stats?.[0]?.splits?.[0]?.stat || {};

  return {
    personId,
    era: Number(split.era || 0),
    whip: Number(split.whip || 0),
    inningsPitched: Number(split.inningsPitched || 0),
    strikeOuts: Number(split.strikeOuts || 0),
    baseOnBalls: Number(split.baseOnBalls || 0),
    gamesStarted: Number(split.gamesStarted || 0)
  };
}
