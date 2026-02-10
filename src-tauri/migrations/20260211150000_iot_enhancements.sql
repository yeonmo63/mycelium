-- Sensor Management Table
CREATE TABLE IF NOT EXISTS sensors (
    sensor_id SERIAL PRIMARY KEY,
    sensor_name VARCHAR(100) NOT NULL,
    space_id INTEGER REFERENCES production_spaces(space_id),
    device_type VARCHAR(20) NOT NULL, -- 'wifi', 'usb', 'bluetooth', 'virtual'
    connection_info VARCHAR(255),    -- IP address, COM port, MAC address
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Historical Sensor Readings (High-frequency data)
CREATE TABLE IF NOT EXISTS sensor_readings (
    reading_id BIGSERIAL PRIMARY KEY,
    sensor_id INTEGER REFERENCES sensors(sensor_id) ON DELETE CASCADE,
    temperature NUMERIC(5, 2),
    humidity NUMERIC(5, 2),
    co2 NUMERIC(10, 2),
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for updated_at on sensors
DROP TRIGGER IF EXISTS update_sensors_modtime ON sensors;
CREATE TRIGGER update_sensors_modtime BEFORE UPDATE ON sensors FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- Initial Sensors
INSERT INTO sensors (sensor_name, device_type, connection_info) 
VALUES ('Main Lab Monitor', 'virtual', 'internal://sim-001'),
       ('WiFi Greenhouse-A', 'wifi', '192.168.1.105'),
       ('USB Processing Unit', 'usb', 'COM3')
ON CONFLICT DO NOTHING;
