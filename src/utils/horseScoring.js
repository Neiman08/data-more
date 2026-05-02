<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Data More Horse Racing</title>

  <style>
    body {
      margin: 0;
      background: #0d1117;
      color: white;
      font-family: Arial, sans-serif;
      padding: 20px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }

    .logo {
      width: 55px;
      height: 55px;
    }

    h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 900;
    }

    .controls {
      display: flex;
      gap: 10px;
      margin-bottom: 25px;
      flex-wrap: wrap;
    }

    button, a {
      border: none;
      border-radius: 10px;
      padding: 12px 18px;
      font-weight: 800;
      cursor: pointer;
      text-decoration: none;
      color: white;
    }

    .btn-load { background: #8b5cf6; }
    .btn-mlb { background: #2563eb; }
    .btn-soccer { background: #22c55e; color: #052e16; }
    .btn-nba { background: #f97316; }
    .btn-horse { background: #a855f7; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 18px;
    }

    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-left: 5px solid #a855f7;
      border-radius: 16px;
      padding: 18px;
    }

    .race-title {
      font-size: 18px;
      font-weight: 900;
      color: #c084fc;
      margin-bottom: 8px;
    }

    .meta {
      color: #94a3b8;
      font-size: 13px;
      margin-bottom: 12px;
    }

    .runner {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,.07);
      font-size: 13px;
    }

    .btn-analyze {
      width: 100%;
      background: #2563eb;
      margin-top: 14px;
    }

    .analysis {
      display: none;
      margin-top: 14px;
      background: rgba(15,23,42,.9);
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 14px;
    }

    .section-title {
      color: #38bdf8;
      font-size: 13px;
      font-weight: 900;
      margin: 12px 0 8px;
      text-transform: uppercase;
    }

    .pick-box {
      background: rgba(34,197,94,.12);
      border: 1px solid rgba(34,197,94,.35);
      padding: 10px;
      border-radius: 10px;
    }

    .value-box {
      background: rgba(250,204,21,.12);
      border: 1px solid rgba(250,204,21,.35);
      padding: 10px;
      border-radius: 10px;
      margin-bottom: 8px;
    }

    .rank-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      padding: 5px 0;
    }

    .bet {
      font-size: 12px;
      background: #0f172a;
      padding: 8px;
      border-radius: 8px;
      margin-top: 5px;
    }
  </style>
</head>

<body>

<div class="header">
  <img src="/logo.png" class="logo" onerror="this.style.display='none'">
  <h1>DATA MORE HORSE</h1>
</div>

<div class="controls">
  <button class="btn-load" onclick="loadRaces()">🏇 Cargar Carreras</button>
  <a class="btn-mlb" href="/">⚾ MLB</a>
  <a class="btn-soccer" href="/soccer">⚽ Soccer</a>
  <a class="btn-nba" href="/nba">🏀 NBA</a>
</div>

<div id="races" class="grid"></div>

<script>
async function loadRaces() {
  const container = document.getElementById('races');
  container.innerHTML = 'Cargando...';

  const res = await fetch('/api/horse-racing/racecards');
  const data = await res.json();

  container.innerHTML = '';

  data.races.forEach(race => {
    container.innerHTML += `
      <div class="card">
        <div class="race-title">${race.track}</div>
        <div class="meta">${race.time}</div>

        ${race.runners.map(h => `
          <div class="runner">
            <span>${h.name}</span>
            <span>${h.odds}</span>
          </div>
        `).join('')}

        <button class="btn-analyze" onclick="analyzeRace('${race.raceId}', this)">ANALIZAR</button>
        <div class="analysis" id="a-${race.raceId}"></div>
      </div>
    `;
  });
}

async function analyzeRace(id, btn) {
  btn.innerText = '...';

  const res = await fetch('/api/horse-racing/analyze/' + id);
  const data = await res.json();
  const a = data.analysis;

  const box = document.getElementById('a-' + id);
  box.style.display = 'block';

  box.innerHTML = `
    <div class="section-title">PICK</div>
    <div class="pick-box">
      ${a.pick.horse} (${a.pick.probability}%)
    </div>

    <div class="section-title">VALUE</div>
    ${a.valueBets.map(v => `
      <div class="value-box">${v.horse} | Edge ${v.edge}%</div>
    `).join('')}

    <div class="section-title">TOP 4</div>
    ${a.top4.map(h => `
      <div class="rank-row">${h.horse} (${h.probability}%)</div>
    `).join('')}

    <div class="section-title">BETS</div>
    <div class="bet">Win: ${a.bets.win}</div>
    <div class="bet">Exacta: ${a.bets.exacta}</div>
    <div class="bet">Trifecta: ${a.bets.trifecta}</div>
  `;

  btn.innerText = 'RE-ANALIZAR';
}

loadRaces();
</script>

</body>
</html>