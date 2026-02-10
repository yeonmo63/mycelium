-- Roadmap Enhancements Migration
-- 1. Add version field for Optimistic Locking to key tables
ALTER TABLE products ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE customers ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE sales ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE production_batches ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE schedules ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE company_info ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE experience_programs ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE experience_reservations ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE consultations ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE vendors ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE purchases ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE expenses ADD COLUMN version INTEGER DEFAULT 1;

-- 2. Create system_logs table for Enhanced Auditing
CREATE TABLE IF NOT EXISTS system_logs (
    log_id          SERIAL PRIMARY KEY,
    user_id         INTEGER, -- Can be NULL if not logged in or system action
    username        VARCHAR(50),
    action_type     VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', etc.
    table_name      VARCHAR(100),
    record_id       VARCHAR(100),
    old_data        JSONB,
    new_data        JSONB,
    memo            TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for performance
CREATE INDEX idx_system_logs_created_at ON system_logs(created_at);
CREATE INDEX idx_system_logs_table_record ON system_logs(table_name, record_id);
