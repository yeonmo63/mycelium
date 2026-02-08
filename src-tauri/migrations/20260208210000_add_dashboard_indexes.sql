-- Add indexes to speed up dashboard queries
CREATE INDEX IF NOT EXISTS idx_sales_order_date_status ON sales(order_date, status);
CREATE INDEX IF NOT EXISTS idx_customers_join_date ON customers(join_date);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_experience_reservations_date_status ON experience_reservations(reservation_date, status);
CREATE INDEX IF NOT EXISTS idx_schedules_time_range ON schedules(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_products_safety_stock ON products(safety_stock, stock_quantity);
