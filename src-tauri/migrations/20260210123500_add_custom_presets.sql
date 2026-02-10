-- Add custom presets table
CREATE TABLE IF NOT EXISTS custom_presets (
    preset_id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    preset_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
