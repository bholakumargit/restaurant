

```sql
CREATE DATABASE IF NOT EXISTS restaurant_db;
USE restaurant_db;

CREATE TABLE tables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  table_number INT NOT NULL UNIQUE,
  capacity INT NOT NULL,
  floor_zone VARCHAR(100) NOT NULL,
  status ENUM('available','occupied','dirty') DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  table_id INT NOT NULL,
  settled TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  settled_at TIMESTAMP NULL,
  FOREIGN KEY (table_id) REFERENCES tables(id)
);

CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  category ENUM('food','beverage') NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Sample data
INSERT INTO tables (table_number, capacity, floor_zone, status) VALUES
(1, 4, 'Ground Floor', 'occupied'),
(2, 2, 'Ground Floor', 'available'),
(3, 6, 'Terrace', 'dirty'),
(4, 4, 'Terrace', 'occupied'),
(5, 8, 'First Floor', 'available'),
(6, 2, 'First Floor', 'available');
```


