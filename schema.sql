-- ======================================================================
-- Gym Registration System - the complete database
-- Run this ONCE in MySQL Workbench to create everything from zero.
-- WARNING: it deletes the old "gym_db" database if it exists.
-- ======================================================================

DROP DATABASE IF EXISTS gym_db;
CREATE DATABASE gym_db;
USE gym_db;

-- Members and the admin (the role column says which one)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'member',
    reset_code VARCHAR(10) NULL,
    reset_expires DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Membership plans
CREATE TABLE plans (
    plan_id INT AUTO_INCREMENT PRIMARY KEY,
    plan_name VARCHAR(50) NOT NULL,
    duration_months INT NOT NULL,
    price DECIMAL(8,2) NOT NULL,
    features TEXT
);

-- Coaches
CREATE TABLE coaches (
    coach_id INT AUTO_INCREMENT PRIMARY KEY,
    coach_name VARCHAR(100) NOT NULL,
    specialization VARCHAR(100) NOT NULL,
    experience_years INT,
    bio TEXT
);

-- Session times of the coaches (booked_by is empty while the time is free)
CREATE TABLE coach_slots (
    slot_id INT AUTO_INCREMENT PRIMARY KEY,
    coach_id INT NOT NULL,
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    booked_by INT NULL,
    FOREIGN KEY (coach_id) REFERENCES coaches(coach_id) ON DELETE CASCADE,
    FOREIGN KEY (booked_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Offers and promo codes
CREATE TABLE offers (
    offer_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    discount_percent INT NOT NULL,
    end_date DATE,
    promo_code VARCHAR(30) NULL UNIQUE,
    first_order_only TINYINT(1) NOT NULL DEFAULT 0
);

-- The memberships that members bought
CREATE TABLE memberships (
    membership_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plan_id INT NOT NULL,
    coach_id INT NULL,
    offer_id INT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(plan_id),
    FOREIGN KEY (coach_id) REFERENCES coaches(coach_id) ON DELETE SET NULL,
    FOREIGN KEY (offer_id) REFERENCES offers(offer_id) ON DELETE SET NULL
);

-- Payments and refunds (the card number is never saved)
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    membership_id INT NOT NULL,
    amount DECIMAL(8,2) NOT NULL,
    payment_method VARCHAR(30) NOT NULL,
    payment_status VARCHAR(20) NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    refund_amount DECIMAL(8,2) NULL,
    refunded_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (membership_id) REFERENCES memberships(membership_id) ON DELETE CASCADE
);

-- Ratings and reviews of coaches (one review per member per coach)
CREATE TABLE coach_reviews (
    review_id INT AUTO_INCREMENT PRIMARY KEY,
    coach_id INT NOT NULL,
    user_id INT NOT NULL,
    rating TINYINT NOT NULL,
    review_text VARCHAR(500) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY one_review_per_member (coach_id, user_id),
    FOREIGN KEY (coach_id) REFERENCES coaches(coach_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- The optional fitness profile of a member (skipped = 1 means the member skipped the questions)
CREATE TABLE member_profiles (
    user_id INT PRIMARY KEY,
    weight_kg DECIMAL(5,1) NULL,
    height_cm DECIMAL(5,1) NULL,
    goal VARCHAR(40) NULL,
    experience VARCHAR(20) NULL,
    notes VARCHAR(500) NULL,
    skipped TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Messages from the Contact page
CREATE TABLE contact_messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    subject VARCHAR(150) NULL,
    message_text TEXT NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ======================================================================
-- Sample data (change it any time from the admin panel)
-- ======================================================================

INSERT INTO plans (plan_name, duration_months, price, features) VALUES
('Monthly', 1, 500.00, 'Full gym access, locker room'),
('3 Months', 3, 1350.00, 'Full gym access, locker room, 1 free session'),
('6 Months', 6, 2400.00, 'Full gym access, locker room, 3 free sessions'),
('Annual', 12, 4200.00, 'Full gym access, locker room, 6 free sessions');

INSERT INTO coaches (coach_name, specialization, experience_years, bio) VALUES
('Ahmed Samir', 'Strength Training', 8, 'Helps you build muscle and get stronger.'),
('Sara Ali', 'Yoga and Flexibility', 5, 'Focuses on mobility, balance and relaxation.'),
('Omar Khaled', 'Cardio and Weight Loss', 6, 'Builds fat loss plans that fit your life.');

INSERT INTO coach_slots (coach_id, slot_date, slot_time) VALUES
(1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00'),
(1, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '14:00:00'),
(1, DATE_ADD(CURDATE(), INTERVAL 4 DAY), '10:00:00'),
(2, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:00:00'),
(2, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '17:00:00'),
(2, DATE_ADD(CURDATE(), INTERVAL 4 DAY), '09:00:00'),
(3, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '16:00:00'),
(3, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '18:00:00'),
(3, DATE_ADD(CURDATE(), INTERVAL 4 DAY), '16:00:00');

INSERT INTO offers (title, description, discount_percent, end_date, promo_code, first_order_only) VALUES
('New Member Deal', 'Get 10 percent off your first membership.', 10, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 'NEWMEMBER10', 1),
('Annual Saver', 'Get 15 percent off when you pay for a full year.', 15, DATE_ADD(CURDATE(), INTERVAL 90 DAY), 'ANNUAL15', 0);

-- The admin account is created by running create_admin.py (see README.md)
SELECT 'Database created successfully' AS result;
