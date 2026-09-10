# RSV — Real-Time Refinery Output and Crude Supply Verification

A tamper-evident, real-time system for the Dangote Petroleum Refinery that records crude intake, production unit throughput, and truck loading (gantry) events, reconciles them daily, and surfaces the results on role-specific dashboards.

## Architecture

- **Backend:** Go with Chi router
- **Database:** PostgreSQL 15 (Docker)
- **Frontend:** React + TypeScript + Tailwind CSS
- **Charts:** Recharts
- **Real-time:** Server-Sent Events (SSE)

## Quick Start

```bash
# Start PostgreSQL
docker-compose up -d

# Start backend (in /server)
cd server
go run ./cmd/main.go

# Start frontend (in /client)
cd client
npm install
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/seed | Seed 7 days of historical data |
| POST | /api/v1/reconcile/run | Run reconciliation for today |
| POST | /api/v1/crude-intake | Insert crude intake record |
| POST | /api/v1/production-readings | Insert production unit reading |
| POST | /api/v1/truck-loading | Insert truck loading event |
| GET | /api/v1/dashboard/today | Today's summary |
| GET | /api/v1/reconciliations | All reconciliations |
| GET | /api/v1/reconciliations/:date | Reconciliation by date |
| GET | /api/v1/ledger | Paginated ledger entries |
| GET | /api/v1/alerts | Unacknowledged alerts |
| PATCH | /api/v1/alerts/:id/acknowledge | Acknowledge an alert |
| GET | /api/v1/events | SSE endpoint for live updates |
