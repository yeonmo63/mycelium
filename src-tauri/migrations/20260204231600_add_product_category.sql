-- Add category column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Update existing products with inferred categories based on names
UPDATE products SET category = '박스/포장' WHERE item_type IN ('aux_material', 'raw_material', 'material') AND (product_name LIKE '%박스%' OR product_name LIKE '%상자%');
UPDATE products SET category = '라벨/스티커' WHERE item_type IN ('aux_material', 'raw_material', 'material') AND (product_name LIKE '%스티커%' OR product_name LIKE '%라벨%');
UPDATE products SET category = '비닐/봉투' WHERE item_type IN ('aux_material', 'raw_material', 'material') AND (product_name LIKE '%비닐%' OR product_name LIKE '%봉투%');
UPDATE products SET category = '생산재' WHERE item_type IN ('aux_material', 'raw_material', 'material') AND (product_name LIKE '%배지%' OR product_name LIKE '%종균%');
UPDATE products SET category = '기타 소모품' WHERE item_type IN ('aux_material', 'raw_material', 'material') AND category IS NULL;
