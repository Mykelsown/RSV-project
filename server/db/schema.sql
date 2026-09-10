-- RSV Database Schema
-- Run with: psql -U rsv_user -d rsv_db -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Crude intake records
CREATE TABLE IF NOT EXISTS crude_intake (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tanker_id VARCHAR(100) NOT NULL,
    crude_type VARCHAR(100) NOT NULL,
    volume_barrels NUMERIC(12,2) NOT NULL,
    source_country VARCHAR(100) NOT NULL,
    allocation_reference VARCHAR(100) NOT NULL,
    recorded_by VARCHAR(100) NOT NULL
);

-- Production unit readings
CREATE TABLE IF NOT EXISTS production_unit_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unit_name VARCHAR(100) NOT NULL,
    crude_processed_barrels NUMERIC(12,2) NOT NULL,
    product_output_litres NUMERIC(14,2) NOT NULL,
    yield_percentage NUMERIC(5,2) NOT NULL,
    status VARCHAR(50) NOT NULL
);

-- Truck loading events
CREATE TABLE IF NOT EXISTS truck_loading_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    truck_id VARCHAR(100) NOT NULL,
    driver_id VARCHAR(100) NOT NULL,
    distributor_id VARCHAR(100) NOT NULL,
    distributor_name VARCHAR(200) NOT NULL,
    product_type VARCHAR(100) NOT NULL,
    volume_litres NUMERIC(12,2) NOT NULL,
    destination_region VARCHAR(100) NOT NULL,
    gantry_id VARCHAR(50) NOT NULL
);

-- Daily reconciliations
CREATE TABLE IF NOT EXISTS daily_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_date DATE NOT NULL UNIQUE,
    crude_intake_total_barrels NUMERIC(14,2) NOT NULL,
    expected_output_litres NUMERIC(16,2) NOT NULL,
    actual_output_litres NUMERIC(16,2) NOT NULL,
    trucks_loaded INTEGER NOT NULL,
    commitment_target_litres NUMERIC(16,2) NOT NULL,
    fulfillment_percentage NUMERIC(5,2) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('FULFILLED', 'PARTIAL', 'SHORTFALL')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ledger entries (append-only, hash-chained)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL UNIQUE,
    reconciliation_id UUID NOT NULL REFERENCES daily_reconciliations(id),
    content_hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    message TEXT NOT NULL,
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMPTZ
);

-- Immutable ledger trigger: prevent UPDATE and DELETE on ledger_entries
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'ledger_entries table is immutable. UPDATE and DELETE operations are not allowed.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_immutable
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_modification();
