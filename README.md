# MLB Picks Base

Backend base para una app de análisis y predicción MLB.

## Qué hace esta base
- Trae juegos del día desde MLB Stats API
- Extrae pitchers probables y equipos
- Calcula un score base por juego
- Expone endpoints REST para conectar luego con web app o app móvil
- Integra odds opcionales con The Odds API si agregas tu API key

## Requisitos
- Node.js 20+

## Instalación
```bash
npm install
cp .env.example .env
npm run dev
```

## Endpoints
### Health
`GET /api/health`

### Juegos del día
`GET /api/games?date=2026-04-22`

### Análisis de un juego
`GET /api/analyze/:gamePk?date=2026-04-22`

## Notas
- Esta versión usa una fórmula base simple para lanzar rápido el MVP.
- El módulo de odds se activa solo si configuras `ODDS_API_KEY`.
- Luego puedes ampliar con bullpen real, lineup confirmado, weather, park factors y historial.
