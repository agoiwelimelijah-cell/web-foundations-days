-- ============================================================================
-- Day 6 Assignment: School Database (SQLite)
-- Repository: web-foundations-days | Folder: day6/
-- ============================================================================

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- 1. DDL: CREATE TABLE Statements
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    enrolled_date DATE DEFAULT (DATE('now')),
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- 2. DML: INSERT Statements
INSERT INTO students (name, email) VALUES
    ('Alice Johnson', 'alice.johnson@example.com'),
    ('Bob Smith', 'bob.smith@example.com'),
    ('Charlie Brown', 'charlie.brown@example.com'),
    ('Diana Prince', 'diana.prince@example.com');

INSERT INTO courses (code, title, credits) VALUES
    ('CS101', 'Introduction to Computer Science', 4),
    ('WEB201', 'Full-Stack Web Foundations', 3),
    ('DB301', 'Relational Databases and SQL', 3),
    ('MATH150', 'Discrete Mathematics', 4);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),
    (1, 2, 'B+'),
    (1, 3, 'A-'),
    (2, 1, 'B'),
    (2, 2, 'C+'),
    (3, 3, 'A');

-- 3. Five Required Queries

-- Query 1: All courses for one student (by student name)
SELECT 
    s.name AS student_name,
    c.code AS course_code,
    c.title AS course_title,
    c.credits,
    e.grade
FROM students s
JOIN enrolments e ON s.id = e.student_id
JOIN courses c ON e.course_id = c.id
WHERE s.name = 'Alice Johnson'
ORDER BY c.code;

-- Query 2: All students on one course (by course title)
SELECT 
    c.title AS course_title,
    s.name AS student_name,
    s.email AS student_email,
    e.grade
FROM courses c
JOIN enrolments e ON c.id = e.course_id
JOIN students s ON e.student_id = s.id
WHERE c.title = 'Full-Stack Web Foundations'
ORDER BY s.name;

-- Query 3: The number of students per course (LEFT JOIN includes courses with 0 students)
SELECT 
    c.code AS course_code,
    c.title AS course_title,
    COUNT(e.student_id) AS total_enrolled_students
FROM courses c
LEFT JOIN enrolments e ON c.id = e.course_id
GROUP BY c.id, c.code, c.title
ORDER BY total_enrolled_students DESC, c.code ASC;

-- Query 4: Students who have no enrolments
SELECT 
    s.id AS student_id,
    s.name AS student_name,
    s.email AS student_email
FROM students s
LEFT JOIN enrolments e ON s.id = e.student_id
WHERE e.id IS NULL;

-- Query 5: Update of one enrolment's grade
UPDATE enrolments
SET grade = 'A'
WHERE student_id = (SELECT id FROM students WHERE name = 'Bob Smith')
  AND course_id = (SELECT id FROM courses WHERE code = 'WEB201');

-- Verification of Query 5:
SELECT 
    s.name AS student_name,
    c.code AS course_code,
    c.title AS course_title,
    e.grade AS updated_grade
FROM enrolments e
JOIN students s ON e.student_id = s.id
JOIN courses c ON e.course_id = c.id
WHERE s.name = 'Bob Smith' AND c.code = 'WEB201';