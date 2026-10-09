# School Database Design & Architecture

This document explains the relational database architecture for the school course enrolment system specified in `day6/school.sql`.

---

## 1. Table Explanations

* **`students`**:
  * Stores core identity and contact data for individual learners.
  * Columns:
    * `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`): Unique numeric surrogate key for each student.
    * `name` (`TEXT NOT NULL`): Full name of the student.
    * `email` (`TEXT UNIQUE NOT NULL`): The student's primary institutional email address, guaranteed unique across all records.
    * `created_at` (`TIMESTAMP DEFAULT CURRENT_TIMESTAMP`): Audit timestamp recording when the student registered.

* **`courses`**:
  * Stores academic offerings managed by the institution.
  * Columns:
    * `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`): Unique numeric identifier for the course.
    * `code` (`TEXT UNIQUE NOT NULL`): Official course alphanumeric code (e.g., `CS101`, `WEB201`).
    * `title` (`TEXT NOT NULL`): Full human-readable course title.
    * `credits` (`INTEGER NOT NULL DEFAULT 3`): Number of academic credit units associated with completing the course.

* **`enrolments`**:
  * Serves as the junction (associative) table connecting students to the courses they take.
  * Columns:
    * `id` (`INTEGER PRIMARY KEY AUTOINCREMENT`): Unique record identifier for the enrolment instance.
    * `student_id` (`INTEGER NOT NULL`): Foreign key referencing `students(id)`.
    * `course_id` (`INTEGER NOT NULL`): Foreign key referencing `courses(id)`.
    * `enrolled_date` (`DATE DEFAULT (DATE('now'))`): Date when enrolment occurred.
    * `grade` (`TEXT`): Academic grade earned by the student (e.g., `'A'`, `'B+'`).
  * Constraints:
    * `UNIQUE(student_id, course_id)`: Enforces business logic preventing a student from enrolling in the identical course multiple times simultaneously.

---

## 2. Entity Relationships & Join Table Justification

* **Many-to-Many Relationship ($M:N$)**:
  * A single student can take multiple courses simultaneously (e.g., Alice takes CS101, WEB201, and DB301).
  * A single course can be attended by multiple students simultaneously (e.g., CS101 is attended by Alice and Bob).
  * Therefore, the relationship between **Students** and **Courses** is inherently **Many-to-Many**.

* **One-to-Many Relationships ($1:N$)**:
  * **`students` $\to$ `enrolments`**: One student has zero, one, or many enrolment records ($1:N$).
  * **`courses` $\to$ `enrolments`**: One course has zero, one, or many enrolment records ($1:N$).

* **Why a Join Table (`enrolments`) is Needed**:
  * Relational databases do not support direct many-to-many linkages without violating the First Normal Form (1NF) or creating massive redundancy.
  * Placing a `course_id` column inside `students` would limit each student to only one course (or require comma-separated values, which breaks atomicity and indexing).
  * Placing a `student_id` column inside `courses` would limit each course to only one student.
  * The join table decomposes the $M:N$ relationship into two clean $1:N$ relationships while providing a natural location to store relationship-specific attributes such as `grade` and `enrolled_date`.

---

## 3. Recommended Index & Rationale

* **Index Statement**:
  ```sql
  CREATE INDEX idx_enrolments_student_id ON enrolments(student_id);
  ```
* **Reasoning**:
  * In relational databases like SQLite and PostgreSQL, joining `enrolments` against `students` (such as looking up student transcripts or computing GPA) performs a scan on the foreign key column `student_id`.
  * While SQLite automatically creates an internal B-Tree index for unique constraints (such as `UNIQUE(student_id, course_id)` which already covers queries filtering `student_id` first), adding an explicit index on `enrolments(course_id)` or `enrolments(student_id)` guarantees fast $O(\log N)$ joins and filter lookups as enrolment tables grow to hundreds of thousands of rows.
  * If the primary lookup pattern is listing class rosters by course, creating `CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);` is equally crucial because the leading column of `UNIQUE(student_id, course_id)` is `student_id`, leaving `course_id` unindexed for standalone course joins.

---

## 4. Architectural Choice: SQL vs. NoSQL

For this academic enrolment system, **SQL (Relational Database)** is unquestionably the superior architectural choice over a NoSQL document or key-value store. Academic records require strict referential integrity (ACID compliance) so that a grade or enrolment cannot exist without a valid student and course record, preventing orphaned or dangling references. Furthermore, a relational schema prevents data duplication through normalization: course metadata (such as titles, codes, and credit hours) is maintained in a single place, avoiding the consistency nightmares of denormalized NoSQL documents where updating a course title would require updating thousands of embedded student sub-documents. Finally, relational SQL engines naturally handle diverse multi-table analytical aggregations (such as counting enrolled students per course, detecting un-enrolled students via `LEFT JOIN`, and calculating GPAs) with standard declarative syntax and relational constraints (`UNIQUE`, foreign keys, and `ON DELETE CASCADE`) enforced at the database engine level.