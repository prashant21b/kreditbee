# Mutual Fund Analytics Backend

A production-grade Node.js (Express) backend for mutual fund analytics with Redis-backed rate limiting, MySQL persistence, and precomputed analytics.

## Features

- **Rate-Limited API Client**: Redis-backed token bucket rate limiter with three independent buckets (2/sec, 50/min, 300/hr)
- **Data Pipelines**: Backfill (up to 10 years) and incremental sync with crash-safe resume
- **Analytics Engine**: Rolling returns, max drawdown, and CAGR distribution
- **REST API**: Query funds, analytics, and rankings

## Tech Stack

- **Runtime**: Node.js (JavaScript)
- **Framework**: Express.js
- **Database**: MySQL (InnoDB)
- **Cache/State**: Redis
- **HTTP Client**: axios
- **Logger**: Winston (JSON logs + rotation)
- **Scheduler**: node-cron

## Quick Start

### Prerequisites

- Node.js >= 18
- MySQL 8.0+
- Redis 6.0+

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your MySQL and Redis credentials

# Run database migrations
npm run migrate

# Start the server
npm start
# Or for development with auto-reload
npm run dev
```

## API Endpoints

### Funds

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/funds` | List all funds (optional: `?category=&amc=`) |
| GET | `/funds/:code` | Get fund metadata + latest NAV |
| GET | `/funds/:code/analytics` | Get analytics (optional: `?window=1Y\|3Y\|5Y\|10Y`) |
| GET | `/funds/rank` | Rank funds by metrics |

#### Ranking Query Parameters
- `category` (required): Category to filter by
- `sort_by`: `median_return` (default) or `max_drawdown`
- `window` (required): `1Y`, `3Y`, `5Y`, or `10Y`
- `limit`: Number of results (default: 5)

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sync/trigger` | Start data ingestion (`?mode=full\|incremental`) |
| GET | `/sync/status` | Get pipeline status and health |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |

## Example Usage

```bash
# List all HDFC funds
curl "http://localhost:3000/funds?amc=HDFC"

# Get fund details
curl http://localhost:3000/funds/119551

# Get 3-year analytics
curl "http://localhost:3000/funds/119551/analytics?window=3Y"

# Rank Mid Cap funds by median return
curl "http://localhost:3000/funds/rank?category=Mid%20Cap&sort_by=median_return&window=1Y&limit=5"

# Trigger full sync
curl -X POST http://localhost:3000/sync/trigger

# Check sync status
curl http://localhost:3000/sync/status
```

## Rate Limiting

The API client respects mfapi.in rate limits using three independent token buckets:

| Bucket | Capacity | Refill Rate |
|--------|----------|-------------|
| Per-second | 2 | 2/second |
| Per-minute | 50 | 50/minute |
| Per-hour | 300 | 300/hour |

All three buckets must have tokens for a request to proceed. Bucket state is persisted in Redis and survives service restarts.

## Project Structure

```
src/
├── app.js                 # Express application setup
├── server.js              # Entry point, server startup
├── config/
│   └── index.js           # Configuration from env vars
├── routes/
│   ├── funds.js           # Fund endpoints
│   └── sync.js            # Sync endpoints
├── services/
│   ├── mfApiClient.js     # External API client
│   ├── schemeDiscovery.js # Scheme filtering
│   ├── backfillService.js # Historical data pipeline
│   ├── incrementalSyncService.js # Daily updates
│   ├── analyticsService.js # Metrics computation
│   └── fundService.js     # Fund CRUD operations
├── jobs/
│   ├── syncJob.js         # Pipeline orchestration
│   └── scheduler.js       # Cron scheduling
├── utils/
│   ├── redis.js           # Redis connection
│   └── rateLimiter.js     # Token bucket rate limiter
├── db/
│   ├── connection.js      # MySQL pool
│   ├── migrate.js         # Migration runner
│   └── migrations/
│       └── 001_initial_schema.sql
└── logger/
    └── index.js           # Winston configuration
```

## Analytics Computed

For each fund and window (1Y, 3Y, 5Y, 10Y):

- **Rolling Returns**: min, max, median, p25, p75
- **Max Drawdown**: Peak-to-trough decline
- **CAGR Distribution**: min, max, median

## License

ISC
