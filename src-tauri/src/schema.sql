-- Database Schema for Mycelium
-- This file serves as a reference for the current database structure.
-- The actual schema is managed via migrations in src-tauri/migrations.

-- 1. Users Table (Admin & Staff)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(20) NOT NULL, -- 'admin', 'viewer', etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Products Table
CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    specification VARCHAR(100),
    unit_price INTEGER NOT NULL DEFAULT 0,
    stock_quantity INTEGER DEFAULT 0,
    safety_stock INTEGER DEFAULT 10,
    material_id INTEGER REFERENCES products(product_id),
    material_ratio FLOAT DEFAULT 1.0,
    aux_material_id INTEGER REFERENCES products(product_id),
    aux_material_ratio DOUBLE PRECISION DEFAULT 1.0,
    cost_price INTEGER DEFAULT 0,
    item_type VARCHAR(20) DEFAULT 'product',
    product_code VARCHAR(50) UNIQUE,
    status VARCHAR(20) DEFAULT '판매중', -- '판매중', '단종상품'
    category VARCHAR(50),
    tax_type VARCHAR(20) DEFAULT '면세',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Inventory Logs (Stock Ledger)
CREATE TABLE IF NOT EXISTS inventory_logs (
    log_id          SERIAL PRIMARY KEY,
    product_id      INTEGER REFERENCES products(product_id),
    product_name    VARCHAR(100) NOT NULL,
    specification   VARCHAR(100),
    product_code    VARCHAR(50),
    change_type     VARCHAR(20) NOT NULL, -- '입고', '출고', '조정', '취소반품'
    change_quantity INTEGER NOT NULL,      -- 변동량 (+ or -)
    current_stock   INTEGER NOT NULL,      -- 변동 후 재고
    reference_id    VARCHAR(50),           -- sales_id 등 참조 ID
    memo            TEXT,                  -- 상세 사유
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Customers Table (CRM)
CREATE TABLE IF NOT EXISTS customers (
    customer_id VARCHAR(20) PRIMARY KEY, -- Format: YYYYMMDD-XXXX
    customer_name VARCHAR(50) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    membership_level VARCHAR(20),
    phone_number VARCHAR(20),
    email VARCHAR(100),
    zip_code VARCHAR(10),
    address_primary VARCHAR(255),
    address_detail VARCHAR(255),
    anniversary_date DATE,
    anniversary_type VARCHAR(50),
    marketing_consent BOOLEAN DEFAULT FALSE,
    acquisition_channel VARCHAR(100),
    pref_product_type VARCHAR(100),
    pref_package_type VARCHAR(100),
    family_type VARCHAR(100),
    health_concern TEXT,
    sub_interest BOOLEAN DEFAULT FALSE,
    purchase_cycle VARCHAR(100),
    memo TEXT,
    current_balance INTEGER DEFAULT 0,
    join_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT '정상', -- '정상', '말소'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
    address_id       SERIAL PRIMARY KEY,
    customer_id      VARCHAR(20) NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    address_alias    VARCHAR(100) NOT NULL,
    recipient_name   VARCHAR(50) NOT NULL,
    mobile_number    VARCHAR(20) NOT NULL,
    zip_code         VARCHAR(10),
    address_primary  VARCHAR(255) NOT NULL,
    address_detail   VARCHAR(255),
    is_default       BOOLEAN DEFAULT FALSE,
    shipping_memo    TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Sales Table
CREATE TABLE IF NOT EXISTS sales (
    sales_id VARCHAR(20) PRIMARY KEY,
    customer_id VARCHAR(20),
    product_id INTEGER REFERENCES products(product_id),
    product_name VARCHAR(100) NOT NULL,
    product_code VARCHAR(50),
    specification VARCHAR(100),
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,
    discount_rate INTEGER DEFAULT 0,
    paid_amount INTEGER DEFAULT 0,
    payment_status VARCHAR(20) DEFAULT '입금완료',
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
    supply_value INTEGER DEFAULT 0,
    vat_amount INTEGER DEFAULT 0,
    tax_exempt_value INTEGER DEFAULT 0,
    tax_type VARCHAR(20),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Event Table (Special Sales Groups)
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

-- 8. Schedules Table
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

-- 9. Company Info Table (Singleton)
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Experience Programs & Reservations
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

-- 11. Consultations Table (CRM)
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

-- 12. Vendors & Purchases
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

-- 13. Expenses Table
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

-- 14. Customer Ledger (Accounts Receivable)
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

-- 15. Sales Claims (Returns/Cancellations)
CREATE TABLE IF NOT EXISTS sales_claims (
    claim_id SERIAL PRIMARY KEY,
    sales_id VARCHAR(20) NOT NULL,
    customer_id VARCHAR(20),
    claim_type VARCHAR(50) NOT NULL,
    claim_status VARCHAR(50) DEFAULT '접수',
    reason_category VARCHAR(100),
    quantity INTEGER NOT NULL DEFAULT 1,
    refund_amount INTEGER DEFAULT 0,
    is_inventory_recovered BOOLEAN DEFAULT FALSE,
    memo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Product BOM (Bill of Materials)
CREATE TABLE IF NOT EXISTS product_bom (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    ratio DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_bom_item UNIQUE (product_id, material_id)
);

-- 17. Auditing Tables
CREATE TABLE IF NOT EXISTS product_price_history (
    history_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_logs (
    log_id          SERIAL PRIMARY KEY,
    customer_id     VARCHAR(20) NOT NULL,
    field_name      VARCHAR(50) NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    changed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by      VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS deletion_log (
    log_id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100) NOT NULL,
    deleted_info TEXT,
    deleted_by VARCHAR(100),
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. Production Management (GAP/HACCP)
CREATE TABLE IF NOT EXISTS production_spaces (
    space_id SERIAL PRIMARY KEY,
    space_name VARCHAR(100) NOT NULL,
    space_type VARCHAR(50),
    location_info TEXT,
    area_size NUMERIC(10, 2),
    area_unit VARCHAR(20) DEFAULT 'm2',
    is_active BOOLEAN DEFAULT TRUE,
    memo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_code VARCHAR(50) UNIQUE NOT NULL,
    product_id INTEGER REFERENCES products(product_id),
    space_id INTEGER REFERENCES production_spaces(space_id),
    start_date DATE NOT NULL,
    end_date DATE,
    expected_harvest_date DATE,
    status VARCHAR(50) DEFAULT 'initialized',
    initial_quantity NUMERIC(10, 2),
    unit VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS farming_logs (
    log_id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES production_batches(batch_id),
    space_id INTEGER REFERENCES production_spaces(space_id),
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    worker_name VARCHAR(100),
    work_type VARCHAR(50) NOT NULL,
    work_content TEXT NOT NULL,
    input_materials JSONB, 
    env_data JSONB,
    photos JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS harvest_records (
    harvest_id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES production_batches(batch_id),
    harvest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity NUMERIC(10, 2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    grade VARCHAR(50),
    traceability_code VARCHAR(100),
    memo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19. Indexes
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON sales(order_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile_number);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_date ON inventory_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_farming_logs_date ON farming_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_harvest_records_date ON harvest_records(harvest_date);
