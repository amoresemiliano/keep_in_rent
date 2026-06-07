-- Upgrade script for existing BlueHost database
-- Run this in phpMyAdmin to add the new tables without losing existing data

CREATE TABLE IF NOT EXISTS property_users (
    property_id INT NOT NULL,
    user_id INT NOT NULL,
    role VARCHAR(20) DEFAULT 'viewer',
    PRIMARY KEY (property_id, user_id),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS global_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(50) NOT NULL UNIQUE,
    setting_value JSON NOT NULL
);

-- Insertar valores por defecto para categorías y canales (ignorará si ya existen)
INSERT IGNORE INTO global_settings (setting_key, setting_value) VALUES
('expense_categories', '["Luz", "Gas", "Internet", "Comunidad", "IBI", "Mantenimiento"]'),
('booking_platforms', '["Booking", "Airbnb", "Directo"]');
