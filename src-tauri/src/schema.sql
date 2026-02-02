-- Database Schema for mushroomfarm
-- Generated based on src-tauri/src/db.rs and src-tauri/src/lib.rs analysis

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
    safety_stock INTEGER DEFAULT 10, -- 안전 재고 (권장 최소 보유량)
    material_id INTEGER REFERENCES products(product_id), -- 연결된 자재 품목 ID
    material_ratio FLOAT DEFAULT 1.0,  -- 전환 시 자재 소모 비율 (예: 1.0)
    cost_price INTEGER DEFAULT 0,
    item_type VARCHAR(20) DEFAULT 'product',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    product_code VARCHAR(50) UNIQUE,
    status VARCHAR(20) DEFAULT '판매중' -- '판매중', '단종상품'
);

-- 2.1 Inventory Logs (Stock Ledger)
CREATE TABLE IF NOT EXISTS inventory_logs (
    log_id          SERIAL PRIMARY KEY,
    product_name    VARCHAR(100) NOT NULL,
    specification   VARCHAR(100),
    change_type     VARCHAR(20) NOT NULL, -- '입고', '출고', '조정', '취소반품'
    change_quantity INTEGER NOT NULL,      -- 변동량 (+ or -)
    current_stock   INTEGER NOT NULL,      -- 변동 후 재고
    reference_id    VARCHAR(50),           -- sales_id 등 참조 ID
    memo            TEXT,                  -- 상세 사유
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Customers Table
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
    
    -- Added CRM Fields
    anniversary_date    DATE,           -- 기념일 날짜
    anniversary_type    VARCHAR(50),    -- 기념일 종류 (생일, 결혼기념일 등)
    marketing_consent   BOOLEAN DEFAULT FALSE, -- 마케팅 수신 동의
    acquisition_channel VARCHAR(100),   -- 유입 경로 (SNS, 검색 등)
    
    -- Preference Fields
    pref_product_type   VARCHAR(100),   -- 선호 상품군
    pref_package_type   VARCHAR(100),   -- 선호 포장형태
    family_type         VARCHAR(100),   -- 가족 구성 특징
    health_concern      TEXT,           -- 건강 관심사
    sub_interest        BOOLEAN DEFAULT FALSE, -- 정기배송(구독) 관심 여부
    purchase_cycle      VARCHAR(100),   -- 구매 주기
    
    memo TEXT,
    current_balance INTEGER DEFAULT 0,
    join_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT '정상', -- '정상', '말소'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3.1 Customer Addresses Table
CREATE TABLE IF NOT EXISTS customer_addresses (
    address_id       SERIAL PRIMARY KEY,
    customer_id      VARCHAR(20) NOT NULL,
    address_alias    VARCHAR(100) NOT NULL,             -- 별칭 (예: 집, 직장)
    recipient_name   VARCHAR(50) NOT NULL,              -- 받는 사람 성함
    mobile_number    VARCHAR(20) NOT NULL,              -- 받는 사람 연락처
    zip_code         VARCHAR(10),                       -- 우편번호
    address_primary  VARCHAR(255) NOT NULL,             -- 주소
    address_detail   VARCHAR(255),                      -- 상세주소
    is_default       BOOLEAN DEFAULT FALSE,             -- 기본 배송지
    shipping_memo    TEXT,                              -- 배송 요청사항
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE CASCADE
);

-- 4. Sales Table
CREATE TABLE IF NOT EXISTS sales (
    sales_id VARCHAR(20) PRIMARY KEY, -- Format: YYYYMMDD-XXXXX
    customer_id VARCHAR(20), -- FK to customers removed to allow linking to Event IDs
    product_name VARCHAR(100) NOT NULL,
    specification VARCHAR(100),
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT '결제완료', -- '결제완료', '배송준비', '배송완료' etc.
    order_date DATE DEFAULT CURRENT_DATE,
    memo TEXT,
    
    -- Shipping Info
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

-- 5. Events Table (Special Sales / Occasions)
CREATE TABLE IF NOT EXISTS event (
    event_id VARCHAR(20) PRIMARY KEY, -- Format: YYYYMMDD-1XXXX
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

-- 6. Schedule Table (Calendar)
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

-- 7. Company Info Table (Singleton)
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

-- 8. Experience Programs
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

-- 9. Experience Reservations
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

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON sales(order_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_name ON sales(product_name);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_customers_join_date ON customers(join_date);
CREATE INDEX IF NOT EXISTS idx_customers_membership ON customers(membership_level);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock_quantity);
CREATE INDEX IF NOT EXISTS idx_experience_reservations_status ON experience_reservations(status);
CREATE INDEX IF NOT EXISTS idx_schedules_time ON schedules(start_time, end_time);

-- 11. Consultations Table (CRM)
CREATE TABLE IF NOT EXISTS consultations (
    consult_id SERIAL PRIMARY KEY,
    customer_id VARCHAR(20), -- REFERENCES customers(customer_id) removed for flexibility
    guest_name VARCHAR(50) NOT NULL,
    contact VARCHAR(20) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT '전화', -- '전화', '문자', '방문', '기타'
    counselor_name VARCHAR(50) NOT NULL DEFAULT '',
    category VARCHAR(50) NOT NULL, -- '상품문의', '대량구매', '체험문의', '클레임', '기타'
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    answer TEXT,
    status VARCHAR(20) DEFAULT '접수', -- '접수', '처리중', '완료', '보류'
    priority VARCHAR(10) DEFAULT '보통', -- '낮음', '보통', '높음', '긴급'
    sentiment VARCHAR(20),
    consult_date DATE DEFAULT CURRENT_DATE,
    follow_up_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(consult_date);
CREATE INDEX IF NOT EXISTS idx_consultations_customer ON consultations(customer_id);

-- 12. Vendors Table (Suppliers)
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id       SERIAL PRIMARY KEY,
    vendor_name     VARCHAR(100) NOT NULL,
    business_number VARCHAR(20),
    representative  VARCHAR(50),
    mobile_number   VARCHAR(20),
    email           VARCHAR(100),
    address         VARCHAR(255),
    main_items      TEXT, -- 주요 취급 품목
    memo            TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. Purchases Table (Raw materials / Inventory input from vendors)
CREATE TABLE IF NOT EXISTS purchases (
    purchase_id     SERIAL PRIMARY KEY,
    vendor_id       INTEGER REFERENCES vendors(vendor_id),
    purchase_date   DATE DEFAULT CURRENT_DATE,
    item_name       VARCHAR(100) NOT NULL,
    specification   VARCHAR(100),
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_price      INTEGER NOT NULL DEFAULT 0,
    total_amount    INTEGER NOT NULL DEFAULT 0,
    payment_status  VARCHAR(20) DEFAULT '미지급', -- '현금', '카드', '미지급(외상)'
    memo            TEXT,
    inventory_synced BOOLEAN DEFAULT FALSE, -- 재고 연동 여부
    material_item_id INTEGER REFERENCES products(product_id), -- 구매한 자재 품목 ID
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Expenses Table (Operating Expenses / G&A)
CREATE TABLE IF NOT EXISTS expenses (
    expense_id      SERIAL PRIMARY KEY,
    expense_date    DATE DEFAULT CURRENT_DATE,
    category        VARCHAR(50) NOT NULL, -- '인건비', '포장재', '수도광열비', '임대료', '광고비', '기타'
    amount          INTEGER NOT NULL DEFAULT 0,
    payment_method  VARCHAR(20), -- '카드', '계좌이체', '현금'
    memo            TEXT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Financial Indexes
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- 16. Customer Ledger Table (Receivables / Accounts Receivable)
CREATE TABLE IF NOT EXISTS customer_ledger (
    ledger_id       SERIAL PRIMARY KEY,
    customer_id     VARCHAR(20) NOT NULL REFERENCES customers(customer_id),
    transaction_date DATE DEFAULT CURRENT_DATE,
    transaction_type VARCHAR(30) NOT NULL, -- '매출(배송)', '입금', '반품/취소', '이월'
    amount          INTEGER NOT NULL DEFAULT 0, -- 발생 금액 (매출은 +, 입금도 +로 기록하되 로직에서 처리, or 매출+, 입금-)
                                                 -- 일반적 장부: 차변(매출) / 대변(입금). 여기서는 단일 컬럼 + Type으로 구분 권장.
                                                 -- 여기서는 미수금 증가(매출) = Positive, 미수금 감소(입금) = Negative로 저장하거나,
                                                 -- deposit(입금), withdrawal(매출) 컬럼을 분리할 수도 있음.
                                                 -- 편의상: amount(거래금액), balance(잔액)
    description     VARCHAR(255),
    reference_id    VARCHAR(50), -- sales_id or other ref
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger(customer_id);

-- 17. Product Price History (For Auditing)
CREATE TABLE IF NOT EXISTS product_price_history (
    history_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    reason TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_history_product_id ON product_price_history(product_id);

-- 18. Customer Change Logs (For Auditing)
CREATE TABLE IF NOT EXISTS customer_logs (
    log_id          SERIAL PRIMARY KEY,
    customer_id     VARCHAR(20) NOT NULL,
    field_name      VARCHAR(50) NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    changed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by      VARCHAR(50) -- Optional: record user who changed it
);
CREATE INDEX IF NOT EXISTS idx_customer_logs_customer_id ON customer_logs(customer_id);
