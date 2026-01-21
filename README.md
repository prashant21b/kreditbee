# Mutual Fund Analytics Backend

A production-grade Node.js (Express) backend for mutual fund analytics with Redis-backed rate limiting, MySQL persistence, and precomputed analytics.

🔗 **Live API**: https://kreditbee-1.onrender.com

## Features

- **Rate-Limited API Client**: Redis-backed token bucket rate limiter with three independent buckets (2/sec, 50/min, 300/hr)
- **Data Pipelines**: Backfill (up to 10 years) and incremental sync with crash-safe resume
- **Analytics Engine**: Rolling returns, max drawdown, and CAGR distribution
- **REST API**: Query funds, analytics, and rankings

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: MySQL (Railway)
- **Cache/State**: Redis (Upstash)
- **HTTP Client**: axios
- **Logger**: Winston (JSON logs + rotation)
- **Scheduler**: node-cron

## Infrastructure

| Service | Provider | Purpose |
|---------|----------|---------|
| **Database** | [Railway](https://railway.app) | MySQL hosting for funds, NAV history, and analytics data |
| **Redis** | [Upstash](https://upstash.com) | Rate limiter state persistence (serverless Redis) |
| **Hosting** | [Render](https://render.com) | Backend deployment and hosting |

## API Endpoints

Base URL: `https://kreditbee-1.onrender.com`

### Funds

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/funds` | List all funds (optional: `?category=&amc=`) |
| GET | `/funds/:code` | Get fund metadata + latest NAV |
| GET | `/funds/:code/analytics?window=3Y` | Get analytics for a window |
| GET | `/funds/rank` | Rank funds by metrics |

### Sync

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sync/trigger` | Start data ingestion (`?mode=full\|incremental`) |
| GET | `/sync/status` | Get pipeline status and health |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/migrate` | Create database tables |
| GET | `/admin/tables` | List all tables |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |

## Example Usage

```bash
# List all HDFC funds
curl "https://kreditbee-1.onrender.com/funds?amc=HDFC"

# Get fund details
curl https://kreditbee-1.onrender.com/funds/119551

# Get 3-year analytics
curl "https://kreditbee-1.onrender.com/funds/119551/analytics?window=3Y"

# Rank Mid Cap funds by median return
curl "https://kreditbee-1.onrender.com/funds/rank?category=Mid%20Cap&sort_by=median_return&window=1Y&limit=5"

# Trigger full sync
curl -X POST https://kreditbee-1.onrender.com/sync/trigger

# Check sync status
curl https://kreditbee-1.onrender.com/sync/status
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
│   ├── sync.js            # Sync endpoints
│   └── admin.js           # Admin endpoints
├── services/
│   ├── mfApiClient.js     # External API client
│   ├── schemeDiscovery.js # Scheme filtering
│   ├── backfillService.js # Historical data pipeline
│   ├── incrementalSyncService.js # Daily updates
│   ├── analyticsService.js # Metrics computation
│   └── fundService.js     # Fund CRUD operations
├── dao/
│   ├── fundsDao.js        # Funds table queries
│   ├── navHistoryDao.js   # NAV history queries
│   ├── analyticsDao.js    # Analytics queries
│   ├── syncStateDao.js    # Sync state queries
│   └── pipelineStatusDao.js # Pipeline queries
├── jobs/
│   ├── syncJob.js         # Pipeline orchestration
│   └── scheduler.js       # Cron scheduling
├── utils/
│   ├── redis.js           # Redis/Upstash connection
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

## Local Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Start the server
npm run dev
```

## Docker Setup

Run locally with Docker (includes MySQL and Redis):

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Run database migrations
curl -X POST http://localhost:3000/admin/migrate

# Trigger data sync
curl -X POST http://localhost:3000/sync/trigger

# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Services Started

| Service | Port | Description |
|---------|------|-------------|
| **app** | 3000 | Node.js API server |
| **mysql** | 3306 | MySQL 8.0 database |
| **redis** | 6379 | Redis 7 for rate limiting |

## Testing

```bash
# Run all tests
npm test

# Run analytics tests only
npm run test:analytics
```

### Test Files

| File | Description |
|------|-------------|
| `tests/analytics.test.js` | Analytics calculations (CAGR, drawdown, percentiles) |
| `tests/rateLimiter.test.js` | Rate limiter with mocked Redis |
| `tests/apiResponseTime.test.js` | API response time < 200ms |
| `tests/pipelineResumability.test.js` | Pipeline crash recovery |

## License

ISC
