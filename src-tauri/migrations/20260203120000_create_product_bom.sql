CREATE TABLE IF NOT EXISTS product_bom (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    ratio DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_bom_item UNIQUE (product_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_product_bom_pid ON product_bom(product_id);

-- Optional: Comments
COMMENT ON TABLE product_bom IS 'Bill of Materials for products';
COMMENT ON COLUMN product_bom.ratio IS 'Required quantity of material per 1 unit of product';
