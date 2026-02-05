-- 1. Base Schema Setup
-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    specification VARCHAR(100),
    unit_price INTEGER NOT NULL DEFAULT 0,
    stock_quantity INTEGER DEFAULT 0,
    safety_stock INTEGER DEFAULT 10,
    material_id INTEGER REFERENCES products(product_id),
    material_ratio FLOAT DEFAULT 1.0,
    cost_price INTEGER DEFAULT 0,
    item_type VARCHAR(20) DEFAULT 'product',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    product_code VARCHAR(50) UNIQUE,
    status VARCHAR(20) DEFAULT '판매중'
);

-- Inventory Logs
CREATE TABLE IF NOT EXISTS inventory_logs (
    log_id          SERIAL PRIMARY KEY,
    product_name    VARCHAR(100) NOT NULL,
    specification   VARCHAR(100),
    change_type     VARCHAR(20) NOT NULL,
    change_quantity INTEGER NOT NULL,
    current_stock   INTEGER NOT NULL,
    reference_id    VARCHAR(50),
    memo            TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    product_code    VARCHAR(50),
    product_id      INTEGER
);

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(20) PRIMARY KEY,
    customer_name VARCHAR(50) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    membership_level VARCHAR(20),
    phone_number VARCHAR(20),
    email VARCHAR(100),
    zip_code VARCHAR(10),
    address_primary VARCHAR(255),
    address_detail VARCHAR(255),
    anniversary_date    DATE,
    anniversary_type    VARCHAR(50),
    marketing_consent   BOOLEAN DEFAULT FALSE,
    acquisition_channel VARCHAR(100),
    pref_product_type   VARCHAR(100),
    pref_package_type   VARCHAR(100),
    family_type         VARCHAR(100),
    health_concern      TEXT,
    sub_interest        BOOLEAN DEFAULT FALSE,
    purchase_cycle      VARCHAR(100),
    memo TEXT,
    current_balance INTEGER DEFAULT 0,
    join_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT '정상',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
    address_id       SERIAL PRIMARY KEY,
    customer_id      VARCHAR(20) NOT NULL,
    address_alias    VARCHAR(100) NOT NULL,
    recipient_name   VARCHAR(50) NOT NULL,
    mobile_number    VARCHAR(20) NOT NULL,
    zip_code         VARCHAR(10),
    address_primary  VARCHAR(255) NOT NULL,
    address_detail   VARCHAR(255),
    is_default       BOOLEAN DEFAULT FALSE,
    shipping_memo    TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- Sales Table
CREATE TABLE IF NOT EXISTS sales (
    sales_id VARCHAR(20) PRIMARY KEY,
    customer_id VARCHAR(20),
    product_name VARCHAR(100) NOT NULL,
    specification VARCHAR(100),
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT '결제완료',
    order_date DATE DEFAULT CURRENT_DATE,
    memo TEXT,
    shipping_name VARCHAR(50),
    shipping_zip_code VARCHAR(10),
    shipping_address_primary VARCHAR(255),
    shipping_address_detail VARCHAR(255),
    shipping_mobile_number VARCHAR(20),
    shipping_date DATE,
    courier_name VARCHAR(50),
    tracking_number VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    product_code VARCHAR(50),
    product_id INTEGER,
    discount_rate INTEGER DEFAULT 0,
    paid_amount INTEGER DEFAULT 0,
    payment_status VARCHAR(20) DEFAULT '입금완료'
);

-- Event Table
CREATE TABLE IF NOT EXISTS event (
    event_id VARCHAR(20) PRIMARY KEY,
    event_name VARCHAR(100) NOT NULL,
    organizer VARCHAR(100),
    manager_name VARCHAR(50),
    manager_contact VARCHAR(20),
    location_address VARCHAR(255),
    location_detail VARCHAR(255),
    start_date DATE,
    end_date DATE,
    memo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schedules
CREATE TABLE IF NOT EXISTS schedules (
    schedule_id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR(20),
    related_type VARCHAR(20),
    related_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Company Info
CREATE TABLE IF NOT EXISTS company_info (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(100) NOT NULL,
    representative_name VARCHAR(50),
    phone_number VARCHAR(20),
    mobile_number VARCHAR(20),
    business_reg_number VARCHAR(20),
    registration_date TIMESTAMP,
    memo TEXT,
    address VARCHAR(255),
    business_type VARCHAR(100),
    item VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- Experience Programs
CREATE TABLE IF NOT EXISTS experience_programs (
    program_id SERIAL PRIMARY KEY,
    program_name VARCHAR(100) NOT NULL,
    description TEXT,
    duration_min INTEGER DEFAULT 60,
    max_capacity INTEGER DEFAULT 10,
    price_per_person INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Experience Reservations
CREATE TABLE IF NOT EXISTS experience_reservations (
    reservation_id SERIAL PRIMARY KEY,
    program_id INTEGER REFERENCES experience_programs(program_id),
    customer_id VARCHAR(20) REFERENCES customers(customer_id) ON DELETE SET NULL,
    guest_name VARCHAR(50) NOT NULL,
    guest_contact VARCHAR(20) NOT NULL,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    participant_count INTEGER DEFAULT 1,
    total_amount INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT '예약완료',
    payment_status VARCHAR(20) DEFAULT '미결제',
    memo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Consultations
CREATE TABLE IF NOT EXISTS consultations (
    consult_id SERIAL PRIMARY KEY,
    customer_id VARCHAR(20),
    guest_name VARCHAR(50) NOT NULL,
    contact VARCHAR(20) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT '전화',
    counselor_name VARCHAR(50) NOT NULL DEFAULT '',
    category VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    answer TEXT,
    status VARCHAR(20) DEFAULT '접수',
    priority VARCHAR(10) DEFAULT '보통',
    sentiment VARCHAR(20),
    consult_date DATE DEFAULT CURRENT_DATE,
    follow_up_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales Claims (Returns/Cancellations)
CREATE TABLE IF NOT EXISTS sales_claims (
    claim_id SERIAL PRIMARY KEY,
    sales_id VARCHAR(20) NOT NULL,
    customer_id VARCHAR(20),
    claim_type VARCHAR(50) NOT NULL,    -- '취소', '반품', '교환'
    claim_status VARCHAR(50) DEFAULT '접수', -- '접수', '처리중', '완료', '거부'
    reason_category VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1,
    refund_amount INTEGER DEFAULT 0,
    is_inventory_recovered BOOLEAN DEFAULT FALSE,
    memo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id       SERIAL PRIMARY KEY,
    vendor_name     VARCHAR(100) NOT NULL,
    business_number VARCHAR(20),
    representative  VARCHAR(50),
    mobile_number   VARCHAR(20),
    email           VARCHAR(100),
    address         VARCHAR(255),
    main_items      TEXT,
    memo            TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
    purchase_id     SERIAL PRIMARY KEY,
    vendor_id       INTEGER REFERENCES vendors(vendor_id),
    purchase_date   DATE DEFAULT CURRENT_DATE,
    item_name       VARCHAR(100) NOT NULL,
    specification   VARCHAR(100),
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_price      INTEGER NOT NULL DEFAULT 0,
    total_amount    INTEGER NOT NULL DEFAULT 0,
    payment_status  VARCHAR(20) DEFAULT '미지급',
    memo            TEXT,
    inventory_synced BOOLEAN DEFAULT FALSE,
    material_item_id INTEGER REFERENCES products(product_id),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
    expense_id      SERIAL PRIMARY KEY,
    expense_date    DATE DEFAULT CURRENT_DATE,
    category        VARCHAR(50) NOT NULL,
    amount          INTEGER NOT NULL DEFAULT 0,
    payment_method  VARCHAR(20),
    memo            TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Ledger
CREATE TABLE IF NOT EXISTS customer_ledger (
    ledger_id       SERIAL PRIMARY KEY,
    customer_id     VARCHAR(20) NOT NULL REFERENCES customers(customer_id),
    transaction_date DATE DEFAULT CURRENT_DATE,
    transaction_type VARCHAR(30) NOT NULL,
    amount          INTEGER NOT NULL DEFAULT 0,
    description     VARCHAR(255),
    reference_id    VARCHAR(50),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product Price History
CREATE TABLE IF NOT EXISTS product_price_history (
    history_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Change Logs
CREATE TABLE IF NOT EXISTS customer_logs (
    log_id          SERIAL PRIMARY KEY,
    customer_id     VARCHAR(20) NOT NULL,
    field_name      VARCHAR(50) NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    changed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by      VARCHAR(50)
);

-- Deletion Logs (from db.rs)
CREATE TABLE IF NOT EXISTS deletion_log (
    log_id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    deleted_info TEXT,
    deleted_by VARCHAR(100),
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_fts ON sales USING GIN (to_tsvector('simple', product_name || ' ' || COALESCE(shipping_name, '') || ' ' || COALESCE(memo, '')));
CREATE INDEX IF NOT EXISTS idx_customers_fts ON customers USING GIN (to_tsvector('simple', customer_name || ' ' || mobile_number || ' ' || COALESCE(memo, '')));
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON sales (order_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_updated_at ON sales (updated_at);
CREATE INDEX IF NOT EXISTS idx_products_product_name ON products (product_name);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_name ON inventory_logs (product_name);
CREATE INDEX IF NOT EXISTS idx_customers_join_date ON customers(join_date);
CREATE INDEX IF NOT EXISTS idx_customers_membership ON customers(membership_level);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_experience_reservations_status ON experience_reservations(status);
CREATE INDEX IF NOT EXISTS idx_schedules_time ON schedules(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(consult_date);
CREATE INDEX IF NOT EXISTS idx_consultations_customer ON consultations(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_history_product_id ON product_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_customer_logs_customer_id ON customer_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_deletion_log_at ON deletion_log(deleted_at);


-- 2. DYNAMIC SETUP BLOCKS (from db.rs)

DO $$ 
DECLARE
    t text;
    tables_to_update text[] := ARRAY['users', 'products', 'customers', 'customer_addresses', 'sales', 'event', 'schedules', 'experience_programs', 'experience_reservations', 'consultations', 'vendors', 'purchases', 'expenses', 'customer_ledger', 'sales_claims', 'inventory_logs', 'company_info'];
BEGIN 
    -- rename 'name' to 'customer_name' if exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='name') THEN
        ALTER TABLE customers RENAME COLUMN name TO customer_name;
    END IF;
    
    -- Products Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='safety_stock') THEN ALTER TABLE products ADD COLUMN safety_stock INTEGER DEFAULT 10; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='cost_price') THEN ALTER TABLE products ADD COLUMN cost_price INTEGER DEFAULT 0; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='item_type') THEN ALTER TABLE products ADD COLUMN item_type VARCHAR(20) DEFAULT 'product'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='material_id') THEN ALTER TABLE products ADD COLUMN material_id INTEGER; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='material_ratio') THEN ALTER TABLE products ADD COLUMN material_ratio FLOAT DEFAULT 1.0; END IF;

    -- Sales Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='discount_rate') THEN ALTER TABLE sales ADD COLUMN discount_rate INTEGER DEFAULT 0; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='paid_amount') THEN ALTER TABLE sales ADD COLUMN paid_amount INTEGER DEFAULT 0; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='payment_status') THEN ALTER TABLE sales ADD COLUMN payment_status VARCHAR(20) DEFAULT '입금완료'; END IF;
    
    -- Customers Table
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='current_balance') THEN ALTER TABLE customers ADD COLUMN current_balance INTEGER DEFAULT 0; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='email') THEN ALTER TABLE customers ADD COLUMN email VARCHAR(100); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='anniversary_date') THEN ALTER TABLE customers ADD COLUMN anniversary_date DATE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='anniversary_type') THEN ALTER TABLE customers ADD COLUMN anniversary_type VARCHAR(50); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='marketing_consent') THEN ALTER TABLE customers ADD COLUMN marketing_consent BOOLEAN DEFAULT FALSE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='status') THEN ALTER TABLE customers ADD COLUMN status VARCHAR(20) DEFAULT '정상'; END IF;

    -- Company Info
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_info' AND column_name='address') THEN ALTER TABLE company_info ADD COLUMN address VARCHAR(255); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_info' AND column_name='business_type') THEN ALTER TABLE company_info ADD COLUMN business_type VARCHAR(100); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_info' AND column_name='item') THEN ALTER TABLE company_info ADD COLUMN item VARCHAR(100); END IF;
    
    -- Schedules
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedules' AND column_name='related_type') THEN ALTER TABLE schedules ADD COLUMN related_type VARCHAR(20); END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedules' AND column_name='related_id') THEN ALTER TABLE schedules ADD COLUMN related_id INTEGER; END IF;

    -- Consultations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consultations' AND column_name='sentiment') THEN ALTER TABLE consultations ADD COLUMN sentiment VARCHAR(20); END IF;
    
    -- Purchases
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='inventory_synced') THEN ALTER TABLE purchases ADD COLUMN inventory_synced BOOLEAN DEFAULT FALSE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchases' AND column_name='material_item_id') THEN ALTER TABLE purchases ADD COLUMN material_item_id INTEGER; END IF;

    -- UPDATED_AT Columns for all major tables
    FOREACH t IN ARRAY tables_to_update
    LOOP
        -- Check if table exists before trying to alter
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'updated_at') THEN
              EXECUTE format('ALTER TABLE %I ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', t);
          END IF;
        END IF;
    END LOOP;
END $$;


DO $$
BEGIN
    -- Add columns to products
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='product_code') THEN
        ALTER TABLE products ADD COLUMN product_code VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='status') THEN
        ALTER TABLE products ADD COLUMN status VARCHAR(20) DEFAULT '판매중';
    END IF;

    -- Add columns to sales
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='product_code') THEN
        ALTER TABLE sales ADD COLUMN product_code VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='product_id') THEN
        ALTER TABLE sales ADD COLUMN product_id INTEGER;
    END IF;

    -- Add columns to inventory_logs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='product_code') THEN
        ALTER TABLE inventory_logs ADD COLUMN product_code VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_logs' AND column_name='product_id') THEN
        ALTER TABLE inventory_logs ADD COLUMN product_id INTEGER;
    END IF;

    -- Data correction for existing records
    UPDATE inventory_logs l SET product_id = p.product_id FROM products p 
    WHERE l.product_id IS NULL AND (l.product_code = p.product_code OR (l.product_code IS NULL AND l.product_name = p.product_name AND l.specification IS NOT DISTINCT FROM p.specification));
    
    UPDATE sales s SET product_id = p.product_id FROM products p 
    WHERE s.product_id IS NULL AND (s.product_code = p.product_code OR (s.product_code IS NULL AND s.product_name = p.product_name AND s.specification IS NOT DISTINCT FROM p.specification));
END $$;

-- Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Migration for existing users
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deletion_log' AND column_name='deleted_info') THEN
        ALTER TABLE deletion_log ADD COLUMN deleted_info TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deletion_log' AND column_name='deleted_by') THEN
        ALTER TABLE deletion_log ADD COLUMN deleted_by VARCHAR(100);
    END IF;
END $$;

-- Sequence Synchronization
DO $$
DECLARE
    t text;
    c text;
    seq text;
BEGIN
    FOR t, c IN 
        SELECT table_name, column_name 
        FROM information_schema.columns 
        WHERE column_default LIKE 'nextval%' 
          AND table_schema = 'public'
    LOOP
        EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE(MAX(%I), 0) + 1, false) FROM %I', t, c, c, t);
    END LOOP;
END $$;

-- Log deletion trigger function
CREATE OR REPLACE FUNCTION log_deletion() RETURNS TRIGGER AS $$
DECLARE
    v_record_id VARCHAR(100);
    v_deleted_info TEXT := NULL;
    v_deleted_by VARCHAR(100) := NULL;
BEGIN
    BEGIN v_deleted_by := current_setting('mycelium.current_user', true); EXCEPTION WHEN OTHERS THEN v_deleted_by := NULL; END;

    CASE TG_TABLE_NAME
        WHEN 'users' THEN 
            v_record_id := OLD.id::VARCHAR;
            v_deleted_info := '사용자: ' || OLD.username;
        WHEN 'products' THEN 
            v_record_id := OLD.product_id::VARCHAR;
            v_deleted_info := '상품: ' || OLD.product_name || ' (' || COALESCE(OLD.specification, '-') || ')';
        WHEN 'customers' THEN 
            v_record_id := OLD.customer_id::VARCHAR;
            v_deleted_info := '고객: ' || OLD.customer_name || ' (' || 
                CASE WHEN length(OLD.mobile_number) >= 8 
                        THEN left(OLD.mobile_number, 4) || '****' || right(OLD.mobile_number, 4)
                        ELSE '정체불명' END || ')';
        WHEN 'sales' THEN v_record_id := OLD.sales_id::VARCHAR;
        WHEN 'event' THEN v_record_id := OLD.event_id::VARCHAR;
        WHEN 'schedules' THEN v_record_id := OLD.schedule_id::VARCHAR;
        WHEN 'company_info' THEN v_record_id := OLD.id::VARCHAR;
        WHEN 'experience_programs' THEN v_record_id := OLD.program_id::VARCHAR;
        WHEN 'experience_reservations' THEN v_record_id := OLD.reservation_id::VARCHAR;
        WHEN 'consultations' THEN v_record_id := OLD.consult_id::VARCHAR;
        WHEN 'vendors' THEN v_record_id := OLD.vendor_id::VARCHAR;
        WHEN 'purchases' THEN v_record_id := OLD.purchase_id::VARCHAR;
        WHEN 'expenses' THEN v_record_id := OLD.expense_id::VARCHAR;
        WHEN 'customer_ledger' THEN v_record_id := OLD.ledger_id::VARCHAR;
        WHEN 'sales_claims' THEN v_record_id := OLD.claim_id::VARCHAR;
        WHEN 'inventory_logs' THEN v_record_id := OLD.log_id::VARCHAR;
        ELSE v_record_id := 'unknown';
    END CASE;

    INSERT INTO deletion_log (table_name, record_id, deleted_info, deleted_by) 
    VALUES (TG_TABLE_NAME, v_record_id, v_deleted_info, v_deleted_by);
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
DO $$
DECLARE
    t text;
    tables_to_trigger text[] := ARRAY['users', 'products', 'customers', 'customer_addresses', 'sales', 'event', 'schedules', 'company_info', 'experience_programs', 'experience_reservations', 'consultations', 'vendors', 'purchases', 'expenses', 'customer_ledger', 'sales_claims', 'inventory_logs'];
BEGIN
    FOREACH t IN ARRAY tables_to_trigger
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_set_updated_at_' || t) THEN
              EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', 'trg_set_updated_at_' || t, t);
          END IF;
        END IF;
    END LOOP;
END $$;

-- Apply deletion triggers
DO $$
DECLARE
    t text;
    tables_to_delete_log text[] := ARRAY['users', 'products', 'customers', 'customer_addresses', 'sales', 'event', 'schedules', 'company_info', 'experience_programs', 'experience_reservations', 'consultations', 'vendors', 'purchases', 'expenses', 'customer_ledger', 'sales_claims', 'inventory_logs'];
BEGIN
    FOREACH t IN ARRAY tables_to_delete_log
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_log_deletion_' || t) THEN
              EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_deletion()', 'trg_log_deletion_' || t, t);
          END IF;
        END IF;
    END LOOP;
END $$;


-- Stock Management Trigger
CREATE OR REPLACE FUNCTION manage_product_stock() RETURNS TRIGGER AS $$
DECLARE
    v_final_stock INTEGER;
    v_p_id INTEGER;
BEGIN
    -- Resolve Product ID
    IF (NEW.product_id IS NOT NULL) THEN
        v_p_id := NEW.product_id;
    ELSIF (NEW.product_code IS NOT NULL) THEN
        SELECT product_id INTO v_p_id FROM products WHERE product_code = NEW.product_code;
    ELSE
        SELECT product_id INTO v_p_id FROM products WHERE product_name = NEW.product_name AND specification IS NOT DISTINCT FROM NEW.specification;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        IF (NEW.status NOT IN ('취소', '반품', '반품완료')) THEN
            UPDATE products SET stock_quantity = stock_quantity - NEW.quantity
            WHERE product_id = v_p_id
            RETURNING stock_quantity INTO v_final_stock;

            INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, reference_id, memo)
            VALUES (v_p_id, NEW.product_name, NEW.specification, NEW.product_code, '출고', -NEW.quantity, COALESCE(v_final_stock, 0), NEW.sales_id, '판매 등록');
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        -- Resolve ID for OLD record
        IF (OLD.product_id IS NOT NULL) THEN v_p_id := OLD.product_id;
        ELSIF (OLD.product_code IS NOT NULL) THEN SELECT product_id INTO v_p_id FROM products WHERE product_code = OLD.product_code;
        ELSE SELECT product_id INTO v_p_id FROM products WHERE product_name = OLD.product_name AND specification IS NOT DISTINCT FROM OLD.specification;
        END IF;

        IF (OLD.status NOT IN ('취소', '반품', '반품완료')) THEN
            UPDATE products SET stock_quantity = stock_quantity + OLD.quantity
            WHERE product_id = v_p_id
            RETURNING stock_quantity INTO v_final_stock;

            INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, reference_id, memo)
            VALUES (v_p_id, OLD.product_name, OLD.specification, OLD.product_code, '취소반품', OLD.quantity, COALESCE(v_final_stock, 0), OLD.sales_id, '판매 삭제(복구)');
        END IF;
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Logic for Status Changes or Quantity Changes
        IF (OLD.status NOT IN ('취소', '반품', '반품완료') AND NEW.status IN ('취소', '반품', '반품완료')) THEN
            UPDATE products SET stock_quantity = stock_quantity + OLD.quantity
            WHERE product_id = v_p_id
            RETURNING stock_quantity INTO v_final_stock;

            INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, reference_id, memo)
            VALUES (v_p_id, OLD.product_name, OLD.specification, OLD.product_code, '취소반품', OLD.quantity, COALESCE(v_final_stock, 0), OLD.sales_id, '상태 변경(취소/반품)');
        ELSIF (OLD.status IN ('취소', '반품', '반품완료') AND NEW.status NOT IN ('취소', '반품', '반품완료')) THEN
            UPDATE products SET stock_quantity = stock_quantity - NEW.quantity
            WHERE product_id = v_p_id
            RETURNING stock_quantity INTO v_final_stock;

            INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, reference_id, memo)
            VALUES (v_p_id, NEW.product_name, NEW.specification, NEW.product_code, '출고', -NEW.quantity, COALESCE(v_final_stock, 0), NEW.sales_id, '상태 변경(정상전환)');
        ELSIF (OLD.status NOT IN ('취소', '반품', '반품완료') AND NEW.status NOT IN ('취소', '반품', '반품완료')) THEN
            IF (v_p_id IS NOT NULL) THEN
                IF (OLD.quantity <> NEW.quantity) THEN
                    UPDATE products SET stock_quantity = stock_quantity + (OLD.quantity - NEW.quantity)
                    WHERE product_id = v_p_id
                    RETURNING stock_quantity INTO v_final_stock;

                    INSERT INTO inventory_logs (product_id, product_name, specification, product_code, change_type, change_quantity, current_stock, reference_id, memo)
                    VALUES (v_p_id, NEW.product_name, NEW.specification, NEW.product_code, '조정', (OLD.quantity - NEW.quantity), COALESCE(v_final_stock, 0), NEW.sales_id, '수량 수정');
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manage_stock ON sales;
CREATE TRIGGER trg_manage_stock AFTER INSERT OR UPDATE OR DELETE ON sales FOR EACH ROW EXECUTE FUNCTION manage_product_stock();
