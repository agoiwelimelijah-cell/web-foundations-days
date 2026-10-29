# TicketHub System Design Document: High-Concurrency Event Ticketing Platform

**Project**: TicketHub  
**Target Scale**: 2,000,000 registered users | 200,000 concurrent users during peak flash sales  
**Document Version**: 1.0.0 — Day 8 Capstone Design  

---

## 1. Requirements

### 1.1 Functional Requirements
1. **Browse & Search Events**: Users can view upcoming concerts, sports matches, and theater events filtered by category, date, artist, and venue.
2. **Interactive Venue & Seat Map**: Users can view venue layouts with real-time seat availability (Available, Held, Sold).
3. **Seat Holding (Cart Reservation)**: When a user selects available seats, the system holds them for **10 minutes**, preventing other users from selecting them while the checkout is completed.
4. **Secure Checkout & Payment**: Users complete payment within the 10-minute hold window. On payment success, the seat status converts permanently to `SOLD`, generating an order and digital ticket with a secure QR code.
5. **Automatic Hold Expiration**: If payment is not completed within 10 minutes, held seats are immediately released back to `AVAILABLE` status.
6. **Ticket Management & Verification**: Users can view their purchased tickets in their profile.

### 1.2 Non-Functional Requirements
1. **Correctness (Zero Double-Booking Guarantee)**: Under no circumstances can two customers purchase or simultaneously hold the exact same seat. Consistency is prioritized over raw availability for the checkout path (ACID transactions, strictly enforced).
2. **High Availability & Fault Tolerance**: 99.99% uptime for browsing and viewing events. Graceful degradation when external payment gateways experience high latency.
3. **Speed & Latency**: 
   - Event browsing and seat map rendering: P95 latency < 150ms.
   - Seat hold and checkout operations: P95 latency < 500ms.
4. **Fairness & Bot Mitigation**: First-come-first-served fairness using a Virtual Waiting Room during flash ticket drops. Rate limiting and CAPTCHA integration to prevent scalper bots from hoarding seats.
5. **Durability & Auditability**: Every state transition (Available -> Held -> Sold -> Cancelled) must be recorded in an immutable ledger/order history table for financial auditing.

---

## 2. Traffic & Capacity Estimates

### 2.1 Baseline Metrics & Assumptions
- **Registered User Base**: 2,000,000 users.
- **Normal Day Traffic**:
  - 50,000 daily active visitors.
  - Average of 10 page views per visitor = 500,000 page views / day.
  - Average tickets sold: 5,000 tickets / day.
- **Big Sale Peak Traffic**:
  - A popular concert goes on sale (e.g., world tour).
  - **20,000 available seats**.
  - **200,000 active users** rush to buy tickets within the **first 10 minutes (600 seconds)**.
  - Average user refreshes seat availability 5 to 10 times in excitement.

### 2.2 Normal Traffic Calculations
- **Read Requests (Page Views & Seat Lookups)**:
  $$\text{Normal Read QPS} = \frac{500,000 \text{ requests}}{86,400 \text{ seconds}} \approx 5.8 \text{ QPS (average)}$$
  $$\text{Peak Normal Read QPS (3x multiplier)} \approx 18 \text{ QPS}$$
- **Write Requests (Purchases & Holds)**:
  $$\text{Normal Write QPS} = \frac{5,000 \text{ tickets}}{86,400 \text{ seconds}} \approx 0.06 \text{ QPS}$$
- **Read-to-Write Ratio**: $\approx 100:1$. A modest relational database can handle this without any strain.

### 2.3 "Big Sale" Peak Traffic Calculations
- **Read Requests (Seat Maps & Event Info in 10 minutes)**:
  $$200,000 \text{ users} \times 8 \text{ requests} = 1,600,000 \text{ requests in 600 seconds}$$
  $$\text{Average Peak Read QPS} = \frac{1,600,000}{600} \approx 2,667 \text{ QPS}$$
  $$\text{Instantaneous Burst Read QPS (at drop time } t=0 \text{)} \approx 8,000 - 12,000 \text{ QPS}$$
- **Write Requests (Hold & Checkout Attempts)**:
  - 200,000 users competing for 20,000 seats.
  $$\text{Average Peak Write QPS} = \frac{200,000 \text{ hold attempts}}{600 \text{ seconds}} \approx 333 \text{ QPS}$$
  $$\text{Burst Write QPS (initial 30 seconds)} \approx 1,500 - 2,500 \text{ write attempts/sec}$$
  - **Successful Checkout Completions**: 20,000 seats sold in 600 seconds $\approx 33.3$ successful DB writes/second.

### 2.4 Comparison Summary

| Metric | Normal Day Traffic | "Big Sale" Peak (10-min Drop) | Surge Multiplier |
| :--- | :--- | :--- | :--- |
| **Concurrent Visitors** | ~500 concurrent | 200,000 concurrent | **400x** |
| **Read Throughput** | ~6 QPS (peak 18 QPS) | ~2,667 QPS (burst 10,000 QPS) | **~500x - 600x** |
| **Write Throughput** | 0.06 QPS | ~333 QPS (burst 2,000 QPS) | **~5,500x** |
| **Data Contention** | Low, dispersed over thousands of events | **Extreme hotspot** on a single event's 20,000 rows | Severe lock contention |

---

## 3. API Design

The API adheres to RESTful conventions, using JSON over HTTPS, standard status codes, and JWT Bearer token authentication for protected endpoints.

### 3.1 Endpoint Summary

| Method | Path | Description | Auth Required | Success Status |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/events` | Browse and filter upcoming events with pagination | No | `200 OK` |
| `GET` | `/api/v1/events/{id}/seats` | Retrieve seat layout and real-time availability status | Optional | `200 OK` |
| `POST` | `/api/v1/events/{id}/seats/hold` | Temporarily hold selected seats for 10 minutes | Yes (User) | `201 Created` |
| `POST` | `/api/v1/orders/checkout` | Process payment and convert held seats into confirmed order | Yes (User) | `201 Created` |
| `GET` | `/api/v1/users/me/tickets` | View user's purchased tickets and entry QR codes | Yes (User) | `200 OK` |

---

### 3.2 Detailed Endpoint Specifications

#### 1. Hold Seats (Temporary 10-Minute Lock)
- **Endpoint**: `POST /api/v1/events/{eventId}/seats/hold`
- **Headers**: `Authorization: Bearer <token>`, `Idempotency-Key: <uuid>`
- **Request Body**:
```json
{
  "seatIds": [4012, 4013]
}
Success Response (201 Created):
code
JSON
{
  "holdToken": "hld_982b61ae-d35b-426c-85f0-62e5b8d2994e",
  "eventId": 108,
  "seats": [
    { "seatId": 4012, "section": "Floor-A", "row": "3", "seatNumber": "15", "price": 120.00 },
    { "seatId": 4013, "section": "Floor-A", "row": "3", "seatNumber": "16", "price": 120.00 }
  ],
  "totalPrice": 240.00,
  "expiresAt": "2026-10-27T12:40:00Z",
  "expiresInSeconds": 600
}
Conflict Response (409 Conflict - Seat already held or sold):
code
JSON
{
  "error": {
    "code": "SEATS_UNAVAILABLE",
    "message": "Seat 4012 is currently held by another customer. Please choose other seats.",
    "conflictingSeatIds": [4012]
  }
}
2. Checkout & Confirm Payment
Endpoint: POST /api/v1/orders/checkout
Headers: Authorization: Bearer <token>, Idempotency-Key: <uuid>
Request Body:
code
JSON
{
  "holdToken": "hld_982b61ae-d35b-426c-85f0-62e5b8d2994e",
  "paymentMethodId": "pm_card_visa_4242",
  "billingZip": "94105"
}
Success Response (201 Created):
code
JSON
{
  "orderId": "ord_8820491",
  "status": "CONFIRMED",
  "paymentStatus": "PAID",
  "totalPaid": 240.00,
  "tickets": [
    {
      "ticketId": "tkt_502188",
      "seat": "Floor-A, Row 3, Seat 15",
      "qrCodePayload": "TKT-HUB-108-4012-SECUREHASH882"
    },
    {
      "ticketId": "tkt_502189",
      "seat": "Floor-A, Row 3, Seat 16",
      "qrCodePayload": "TKT-HUB-108-4013-SECUREHASH883"
    }
  ],
  "createdAt": "2026-10-27T12:35:12Z"
}
3. View User Tickets
Endpoint: GET /api/v1/users/me/tickets
Success Response (200 OK):
code
JSON
{
  "tickets": [
    {
      "ticketId": "tkt_502188",
      "eventName": "Neon Horizon World Tour",
      "venue": "Metropolis Arena",
      "eventDate": "2026-11-15T20:00:00Z",
      "section": "Floor-A",
      "row": "3",
      "seatNumber": "15",
      "status": "VALID",
      "qrCodeUrl": "https://cdn.tickethub.com/qr/tkt_502188.svg"
    }
  ]
}
4. Data Model
A relational PostgreSQL database is chosen for this system because seat reservations require strict ACID transactions, row-level locks, foreign key consistency, and conditional UPDATE statements to prevent double-booking.
4.1 Entity Relationship Overview
users (1) ────< orders (N) : One user places many orders.
events (1) ────< seats (N) : One event contains thousands of distinct seat inventory rows.
orders (1) ────< seats (N) : One completed order reserves one or multiple seats.
seats (1) ────< tickets (1) : Every sold seat issues exactly one ticket linked to the order.
code
Code
+---------------+           +---------------+
|     users     | 1       N |    orders     |
+---------------+-----------+---------------+
| id (PK)       |           | id (PK)       |
| email         |           | user_id (FK)  |
| password_hash |           | total_amount  |
| full_name     |           | status        |
+---------------+           +---------------+
                                    | 1
                                    |
                                    | N
+---------------+ 1       N +---------------+ 1       1 +---------------+
|    events     |-----------|     seats     |-----------|    tickets    |
+---------------+           +---------------+           +---------------+
| id (PK)       |           | id (PK)       |           | id (PK)       |
| title         |           | event_id (FK) |           | order_id (FK) |
| venue         |           | order_id (FK) |           | seat_id (FK)  |
| event_date    |           | section, row  |           | qr_code_hash  |
| total_seats   |           | status        |           | status        |
| status        |           | hold_expires  |           +---------------+
+---------------+           | version (OCC) |
                            +---------------+
4.2 SQL DDL Statements (CREATE TABLE)
code
SQL
-- 1. USERS TABLE
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. EVENTS TABLE
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    venue VARCHAR(200) NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_seats INT NOT NULL CHECK (total_seats > 0),
    status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED' 
        CHECK (status IN ('SCHEDULED', 'ON_SALE', 'SOLD_OUT', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. ORDERS TABLE
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id BIGINT NOT NULL REFERENCES events(id),
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'EXPIRED', 'REFUNDED')),
    idempotency_key VARCHAR(100) UNIQUE,
    payment_reference VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. SEATS TABLE (Core Concurrency Engine)
CREATE TABLE seats (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    order_id BIGINT REFERENCES orders(id),
    section VARCHAR(50) NOT NULL,
    row_num VARCHAR(20) NOT NULL,
    seat_num VARCHAR(20) NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
        CHECK (status IN ('AVAILABLE', 'HELD', 'SOLD')),
    held_by_user_id BIGINT REFERENCES users(id),
    hold_token VARCHAR(100),
    hold_expires_at TIMESTAMP WITH TIME ZONE,
    version INT NOT NULL DEFAULT 0, -- For Optimistic Concurrency Control
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Prevent duplicate seat identifiers for the exact same event
    CONSTRAINT uq_event_seat UNIQUE (event_id, section, row_num, seat_num)
);

-- 5. TICKETS TABLE
CREATE TABLE tickets (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seat_id BIGINT NOT NULL UNIQUE REFERENCES seats(id),
    qr_code_hash VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'USED', 'REVOKED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- PERFORMANCE INDEXES
CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_seats_hold_expiry ON seats(status, hold_expires_at) WHERE status = 'HELD';
CREATE INDEX idx_orders_user ON orders(user_id);
5. Prevention of Double-Booking
Preventing two users from purchasing the exact same seat during high concurrency requires defense-in-depth across the API, memory, and database layers:
5.1 Atomic Conditional DB Update (Optimistic Concurrency Control)
When a user attempts to hold a seat, we never perform a vulnerable SELECT followed by an uncoordinated UPDATE. Instead, we execute an atomic conditional update that directly checks the state in the SQL WHERE clause:
code
SQL
-- Atomic Seat Hold Transaction
UPDATE seats
SET status = 'HELD',
    held_by_user_id = :userId,
    hold_token = :holdToken,
    hold_expires_at = NOW() + INTERVAL '10 minutes',
    version = version + 1
WHERE id = :seatId
  AND (
    status = 'AVAILABLE' 
    OR (status = 'HELD' AND hold_expires_at < NOW()) -- Automatically re-claim expired holds
  );
How it guarantees correctness: Relational databases (PostgreSQL/MySQL) acquire an exclusive row-level write lock on the target row during the UPDATE. If 100 concurrent requests try to hold the same seat simultaneously:
The first transaction acquires the row lock, validates status = 'AVAILABLE', increments version, sets status = 'HELD', and commits.
The remaining 99 transactions evaluate the WHERE condition sequentially after the lock releases; since the row is now HELD and not expired, the UPDATE affects 0 rows.
The application checks the affected row count: if rows_affected == 0, it immediately raises a 409 Conflict to the user.
5.2 Redis Distributed Lock & Token Bucket (Speed Layer)
To protect PostgreSQL from being crushed by thousands of simultaneous queries hitting the same row, an in-memory distributed lock is maintained in Redis:
A Lua script in Redis performs an atomic check-and-set:
SET event:{eventId}:seat:{seatId}:hold {userId} NX EX 600
NX ensures the key is set only if it does not already exist.
EX 600 ensures automatic expiration in 10 minutes (TTL).
If Redis returns 0, the request fails instantly in memory (< 2ms) without touching the database disk.
5.3 Idempotency Keys at Checkout
When the user submits payment:
The request includes an Idempotency-Key header generated by the frontend.
If the user double-clicks the "Submit Payment" button or experiences a network timeout retry, the order service checks if the idempotency key already exists. If so, it returns the cached response rather than creating a duplicate charge.
6. System Architecture & Peak Sale Survival
6.1 Architecture Diagram
code
Code
[200,000 Concurrent Users]
              │
              ▼
    ┌────────────────────┐
    │  Cloudflare CDN    │ ── Cache static assets, bundle JS, seat map SVGs
    │  & DDoS Shield     │
    └─────────┬──────────┘
              │
              ▼
    ┌────────────────────┐
    │ Virtual Waiting    │ ── Throttles admission: allows 500 users/sec
    │ Room (Queue Token) │    into the active ticketing booking funnel
    └─────────┬──────────┘
              │ (Admitted requests with valid Queue JWT)
              ▼
    ┌────────────────────┐
    │    ALB / NGINX     │ ── Layer 7 Load Balancer with SSL termination
    │   Load Balancers   │
    └─────────┬──────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌──────────────┐   ┌──────────────┐
│ App Server 1 │   │ App Server 2 │ ── (Horizontal Auto-scaling Cluster: 50+ pods)
│ (Go/Node.js) │   │ (Go/Node.js) │
└──────┬───────┘   └──────┬───────┘
       │                  │
       ├──────────────────┼──────────────────────────────┐
       │                  │                              │
       ▼                  ▼                              ▼
┌───────────────────────────────┐              ┌────────────────────────┐
│      Redis Cluster            │              │ Message Queue          │
│  - Active Holds (10m TTL)     │              │ (RabbitMQ / Kafka)     │
│  - Real-time Seat Map Cache   │              └───────────┬────────────┘
│  - Distributed Lock Engine    │                          │
└──────────────┬────────────────┘                          ▼
               │                               ┌────────────────────────┐
               │ Writes committed on hold/buy  │ Asynchronous Workers   │
               ▼                               │ - Send confirmation email
┌───────────────────────────────┐              │ - Generate PDF ticket  │
│  Primary PostgreSQL DB (ACID) │              │ - Payment Webhooks     │
│  - Row-level lock engine      │              └────────────────────────┘
│  - Orders, Users, Tickets     │
└──────────────┬────────────────┘
               │
      Streaming Replication
               │
               ▼
┌───────────────────────────────┐
│  Read Replica PostgreSQL DB   │ ── Serves non-critical read queries
└───────────────────────────────┘    (user order history, public catalog)
6.2 Component Explanations
Cloudflare CDN & WAF:
Problem Solved: Offloads 95% of traffic by serving static assets (HTML, CSS, JS, venue SVGs) from edge nodes close to the user, blocking DDoS attacks and malicious bot networks.
Virtual Waiting Room (Queue-IT / Cloudflare Waiting Room):
Problem Solved: When 200,000 users arrive simultaneously, admitting all 200,000 directly to the database would trigger connection exhaustion and crash the servers. The waiting room assigns each user a queue position and steadily admits users at a rate the database can comfortably handle (e.g., 500 users/sec).
Application Server Cluster (Auto-scaling):
Problem Solved: Stateless API services running in Docker/Kubernetes that scale horizontally from 5 instances during normal operations to 50+ instances during flash ticket drops.
Redis In-Memory Cluster:
Problem Solved: Stores seat availability bitmaps and temporary 10-minute hold tokens. Resolves concurrent hold race conditions in RAM (<2ms latency) before requests ever reach the disk database.
Primary PostgreSQL Database:
Problem Solved: The single source of truth enforcing ACID transactions, row-level locks, and relational integrity. Handles write operations (UPDATE seats, INSERT INTO orders).
PostgreSQL Read Replicas:
Problem Solved: Offloads non-critical queries (browsing past events, checking profile details) from the primary database, reserving 100% of the primary's IOPS for the ticket sale.
Message Queue (RabbitMQ / Kafka) & Background Workers:
Problem Solved: Decouples slow, non-critical post-payment tasks (generating PDF tickets with cryptographic QR codes, sending confirmation emails/SMS) so the user's checkout response completes in under 200ms without blocking.
6.3 How the System Survives the "Big Sale"
Edge Throttling: 200,000 users land on the site. Cloudflare serves the cached event landing page.
Fair Admission: Users enter the Virtual Waiting Room. A cryptographic signed cookie grants entry to 500 users every second.
Seat Map Fetch: Admitted users load the seat map. The frontend queries GET /seats, served directly from Redis cache within 5ms.
Hold Competition: Thousands click seat "Row 3, Seat 15". The first request atomically acquires the lock in Redis and updates the PostgreSQL seat row to status = 'HELD'. All other requests fail fast with 409 Conflict and prompt users to select another seat.
Checkout & Completion: The winner pays within 10 minutes. The payment succeeds, the seat status changes to SOLD, an order record is inserted, and a message is pushed to RabbitMQ for asynchronous ticket delivery.
7. Trade-offs & Deep Engineering Decisions
7.1 Trade-off 1: Optimistic Locking vs. Pessimistic Locking
Choice Made: Hybrid approach — In-memory Redis lock followed by an Optimistic Concurrency Control (OCC) conditional update (WHERE status = 'AVAILABLE' AND version = :v).
Alternative: Pessimistic Locking (SELECT * FROM seats WHERE id = :id FOR UPDATE;).
Rationale:
Pessimistic locking holds database row locks across network round-trips, causing lock queue pileups, connection pool exhaustion, and severe deadlocks under high concurrency.
OCC executes as an instant atomic single-statement query. If the row was changed, the query immediately returns 0 rows affected, allowing the app server to fail fast without locking database threads.
7.2 Trade-off 2: Virtual Waiting Room (User Experience vs. System Survival)
Choice Made: Enforcing a strict Virtual Waiting Room during flash sales.
Alternative: Allowing all 200,000 users to freely hit the API endpoints simultaneously.
Rationale:
In a free-for-all, 200,000 users hammering the API causes catastrophic 504 Gateway Timeouts, crashing the entire platform so nobody gets tickets.
While waiting in a queue introduces user friction, it guarantees 100% platform stability, deterministic throughput, and provably fair first-come-first-served ticket allocation.
7.3 Trade-off 3: Eventual Consistency for Seat Map Displays vs. Strong Consistency for Holds
Choice Made: Seat map visual rendering is eventually consistent (cached in Redis with a 2-second TTL), while the Hold and Checkout endpoints are strictly ACID consistent.
Rationale:
Serving 10,000 seat map queries per second with direct DB transactions would overload the database engine.
Showing a seat as "green" on a user's map that was held 1 second ago is acceptable: when the user clicks it, the atomic hold endpoint rejects it with a friendly notification ("Someone just grabbed this seat!"). This shields the system from 90% of database load.
