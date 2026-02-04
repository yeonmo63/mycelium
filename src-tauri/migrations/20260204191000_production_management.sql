-- Production Spaces (Facilities, Fields, Greenhouse, etc.)
CREATE TABLE IF NOT EXISTS production_spaces (
    space_id SERIAL PRIMARY KEY,
    space_name VARCHAR(100) NOT NULL,
    space_type VARCHAR(50), -- 'cultivation', 'processing', 'storage', 'lab', etc.
    location_info TEXT, -- GPS or address or building/room number
    area_size NUMERIC(10, 2),
    area_unit VARCHAR(20) DEFAULT 'm2', -- 'm2', 'pyeong', etc.
    is_active BOOLEAN DEFAULT TRUE,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Production Batches (A single cycle of growth or production)
CREATE TABLE IF NOT EXISTS production_batches (
    batch_id SERIAL PRIMARY KEY,
    batch_code VARCHAR(50) UNIQUE NOT NULL, -- Logical ID like 'BATCH-2024-ASH-001'
    product_id INTEGER REFERENCES products(product_id),
    space_id INTEGER REFERENCES production_spaces(space_id),
    start_date DATE NOT NULL,
    end_date DATE,
    expected_harvest_date DATE,
    status VARCHAR(50) DEFAULT 'initialized', -- 'growing', 'completed', 'failed', etc.
    initial_quantity NUMERIC(10, 2),
    unit VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Farming & Production Logs (The core for GAP/HACCP)
CREATE TABLE IF NOT EXISTS farming_logs (
    log_id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES production_batches(batch_id),
    space_id INTEGER REFERENCES production_spaces(space_id),
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    worker_name VARCHAR(100), -- Critical for GAP/HACCP
    work_type VARCHAR(50) NOT NULL, -- 'plant', 'water', 'fertilize', 'pesticide', 'harvest', 'clean', 'inspect', 'education'
    work_content TEXT NOT NULL,
    
    -- Inputs (JSONB for flexibility: [{id: 1, name: 'Fertilizer A', amount: 5, unit: 'kg'}])
    input_materials JSONB, 
    
    -- Environment (JSONB: {temp: 24.5, humidity: 60, co2: 1000})
    env_data JSONB,
    
    -- Attachments (Photo URLs or reference numbers)
    photos JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Harvest Records
CREATE TABLE IF NOT EXISTS harvest_records (
    harvest_id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES production_batches(batch_id),
    harvest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity NUMERIC(10, 2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    grade VARCHAR(50),
    traceability_code VARCHAR(100), -- Lot Number for barcodes
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_production_spaces_modtime BEFORE UPDATE ON production_spaces FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_production_batches_modtime BEFORE UPDATE ON production_batches FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
CREATE TRIGGER update_farming_logs_modtime BEFORE UPDATE ON farming_logs FOR EACH ROW EXECUTE PROCEDURE update_modified_column();
