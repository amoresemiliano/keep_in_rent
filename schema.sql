CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE properties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    calle VARCHAR(255) NOT NULL,
    cp VARCHAR(20) NOT NULL,
    ciudad VARCHAR(100) NOT NULL,
    pais VARCHAR(100) NOT NULL,
    m2 DECIMAL(10,2),
    habitaciones INT,
    banos INT,
    capacidad INT,
    piscina TINYINT(1) DEFAULT 0,
    cochera TINYINT(1) DEFAULT 0,
    balcon TINYINT(1) DEFAULT 0,
    ascensor TINYINT(1) DEFAULT 0,
    custom_features JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    booking_ref VARCHAR(100) NOT NULL,
    platform VARCHAR(50),
    origin VARCHAR(100),
    checkin DATE NOT NULL,
    checkout DATE NOT NULL,
    bruto DECIMAL(10,2) NOT NULL,
    fee_banco DECIMAL(10,2) DEFAULT 0,
    fee_thl DECIMAL(10,2) DEFAULT 0,
    limpieza DECIMAL(10,2) DEFAULT 0,
    net DECIMAL(10,2) NOT NULL,
    nights INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE TABLE expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    date DATE NOT NULL,
    category VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    observations TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
);

CREATE TABLE bank_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    property_id INT NOT NULL,
    booking_id INT NOT NULL,
    val DECIMAL(10,2) DEFAULT 0,
    obs TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);