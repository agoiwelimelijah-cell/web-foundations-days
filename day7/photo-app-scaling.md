# SnapShare: System Architecture & Scaling Plan

## 1. Starting Facts & Assumptions

### 1.1 Baseline Metrics
* **Total Registered Users:** 10,000,000 (10 million registered accounts).
* **Daily Active Ratio:** 10% of registered users are active on any given day.
* **Daily Active Users (DAU):**
  $$\text{DAU} = 10,000,000 \times 0.10 = 1,000,000\text{ users/day (1 Million DAU)}$$
* **Upload Activity:** Each active user uploads an average of 1 photo per day.
  * Total uploads per day: 1,000,000 * 1 = 1,000,000 photos/day.
* **Feed Browsing Activity:** Each active user views 50 feed pages per day.
  * Total feed views per day: 1,000,000 * 50 = 50,000,000 feed views/day.
* **Media Assets Sizes:**
  * **Original Photo:** Average file size of 2 MB (2,048 KB).
  * **Generated Thumbnail:** Average file size of 50 KB (0.05 MB).
  * **Combined Media Footprint per Upload:** 2 MB + 0.05 MB = 2.05 MB.
* **Traffic Distribution & Peak Factor:**
  * Seconds per standard day: 24 hours * 3,600 seconds = 86,400 seconds.
  * Traffic is non-uniform and spikes during evening leisure hours and special events.
  * **Peak Traffic Multiplier:** 5x average load.

---

## 2. Traffic & Storage Calculations

### 2.1 Uploads Per Second (Write Throughput)
* **Average Uploads Per Second:**
  $$\text{Average Uploads/sec} = \frac{1,000,000\text{ uploads}}{86,400\text{ seconds}} \approx 11.57\text{ uploads/sec}$$
  *(Rounded to ~12 writes/sec)*

* **Peak Uploads Per Second (5x peak multiplier):**
  $$\text{Peak Uploads/sec} = 11.57 \times 5 \approx 57.87\text{ uploads/sec}$$
  *(Rounded to ~58 writes/sec)*

### 2.2 Feed Views Per Second (Read Throughput)
* **Average Feed Views Per Second:**
  $$\text{Average Feed Views/sec} = \frac{50,000,000\text{ feed views}}{86,400\text{ seconds}} \approx 578.70\text{ views/sec}$$
  *(Rounded to ~579 reads/sec)*

* **Peak Feed Views Per Second (5x peak multiplier):**
  $$\text{Peak Feed Views/sec} = 578.70 \times 5 \approx 2,893.52\text{ views/sec}$$
  *(Rounded to ~2,894 reads/sec)*

### 2.3 Photo Storage Capacity Per Year
* **Total Uploads Per Year:**
  $$\text{Annual Uploads} = 1,000,000\text{ uploads/day} \times 365\text{ days} = 365,000,000\text{ photos/year}$$

* **Original Photos Storage:**
  $$365,000,000 \times 2\text{ MB} = 730,000,000\text{ MB} = 730,000\text{ GB} = 730\text{ TB/year}$$

* **Thumbnails Storage:**
  $$365,000,000 \times 0.05\text{ MB} = 18,250,000\text{ MB} = 18,250\text{ GB} = 18.25\text{ TB/year}$$

* **Total Annual Raw Storage Required:**
  $$\text{Total Storage/Year} = 730\text{ TB} + 18.25\text{ TB} = 748.25\text{ TB/year} \approx 0.75\text{ PB/year}$$

### 2.4 Bandwidth Estimates (Ingress vs. Egress)
* **Write Ingress Bandwidth (Original Photo Uploads):**
  * Average Ingress: 11.57 uploads/sec * 2 MB ≈ 23.14 MB/sec (185.1 Mbps).
  * Peak Ingress: 57.87 uploads/sec * 2 MB ≈ 115.74 MB/sec (925.9 Mbps).
* **Read Egress Bandwidth (Feed View Thumbnail & Photo Delivery):**
  * Assuming each feed view displays an average of 10 thumbnails (10 * 50 KB = 500 KB):
  * Average Egress: 578.70 views/sec * 0.5 MB ≈ 289.35 MB/sec (2.31 Gbps).
  * Peak Egress: 2,893.52 views/sec * 0.5 MB ≈ 1,446.76 MB/sec (11.57 Gbps).
  * *Note: Over 95% of this egress bandwidth is absorbed and served directly by the Edge CDN, preventing origin network exhaustion.*

---

## 3. Read-Heavy vs. Write-Heavy Analysis

### 3.1 Traffic Ratio
Comparing total daily interactions:
$$\text{Read-to-Write Ratio} = \frac{50,000,000\text{ feed views}}{1,000,000\text{ photo uploads}} = 50:1$$

The system is **overwhelmingly read-heavy**, processing 50 read operations for every 1 write operation.

### 3.2 Architectural Implications for the Design
1. **Aggressive Multi-Tier Caching:** Because reads outnumber writes 50 to 1, serving feed data and images from origin disk or primary databases would quickly saturate I/O. We place an edge Content Delivery Network (CDN) in front of object storage to cache static images, and an in-memory Redis cluster in front of the database to cache generated user feeds and profile timelines.
2. **Database Read/Write Separation (Primary-Replica Topology):** Write queries (11.6 avg / 58 peak QPS) are routed exclusively to the Primary Database node. Read queries (579 avg / 2,894 peak QPS) are spread across horizontal Read Replicas using database load balancers and connection pools.
3. **Asynchronous Write Pipeline:** Rather than forcing clients to wait synchronously while high-resolution photos are resized into thumbnails, uploads trigger an asynchronous background message queue. This guarantees fast client write response times (<200ms) while smoothing out background processing spikes.

---

## 4. Why Photos Should Not Be Stored Inside the Database

Photos must **never** be stored as binary large objects (BLOBs) directly inside relational or document databases for the following critical reasons:

1. **Database Memory & Buffer Pool Contamination:** Databases utilize memory buffer pools (e.g., InnoDB Buffer Pool) to keep frequently accessed indexes and table pages in RAM. Loading multi-megabyte image payloads flushes valuable index pages and active table rows out of memory, drastically degrading overall query throughput.
2. **Exploding Backup, Restore, and WAL Overhead:** Relational databases record transactions in a Write-Ahead Log (WAL). Storing 748 TB of annual binary data in tables would inflate WAL files and binary logs by gigabytes per minute. Nightly database backups, point-in-time recoveries, and replica catch-ups would become virtually impossible to complete within operational timeframes.
3. **Severe Read Replica Replication Lag:** Replicas process WAL logs sequentially. Transmitting megabyte-sized photo binaries over database replication streams causes massive replication lag, resulting in stale reads on the feed.
4. **Prohibitive Storage Costs:** High-performance database storage (such as AWS EBS gp3/io2 provisioned IOPS SSDs) costs $0.08 to $0.20+ per GB/month. In contrast, cloud object storage costs $0.015 to $0.023 per GB/month—an immediate 70%–85% cost savings.
5. **No Native Edge Streaming or HTTP Byte-Range Support:** Databases cannot natively negotiate HTTP Range requests, audio/video streaming, or CDN edge integration.

### Where Photos Go Instead
Photos belong in **Distributed Cloud Object Storage** (such as Amazon S3, Google Cloud Storage, or Cloudflare R2). Object storage is specifically engineered for multi-petabyte unstructured binary data, offering 99.999999999% (11 nines) durability, effortless horizontal scaling, native HTTP/S streaming, presigned upload URLs, and seamless integration with global CDN edge networks.

The database stores **only lightweight structured metadata** (such as photo_id, user_id, s3_object_key, thumbnail_s3_key, created_at, width, height, caption, and file_size_bytes), which requires less than 1 KB per record.

---

## 5. System Architecture Diagram

```
[Mobile / Web Client]
      |
      | 1. Read: Fetch Feed & Images (HTTPS)
      +-------------------------------------------------------------+
      |                                                             |
      v                                                             v
[Content Delivery Network (CDN)]                           [Application Load Balancer (ALB)]
  (Caches photos & thumbnails globally)                      (TLS termination & health checks)
      |                                                             |
      | Cache Miss                                                  | Round-Robin / Least Conn
      v                                                             v
[Distributed Object Storage (S3 / GCS)]                   +-----------------------------------+
  (Raw Photos: 2 MB | Thumbnails: 50 KB)                  |      App Server Fleet (Stateless) |
      ^                                                   |  [App-1]    [App-2]    [App-3]    |
      |                                                   +-----------------------------------+
      | 2. Direct Upload via Presigned URL                         |              |
      |                                                            | Cache Feed   | Read/Write
      |                                                            v              v
      |                                                   [In-Memory Cache]   [DB Load Balancer]
      |                                                   (Redis Cluster:     (Proxy / PgBouncer)
      |                                                    Feed Timelines)        /        \
      |                                                                          / Writes   \ Reads
      |                                                                         v            v
      | 3. Thumbnail Job (Worker reads/writes)                             [Primary DB]  [Read Replicas]
      +------------------------------------+                              (Postgres/SQL) (Horizontal)
                                           |                                    |
                                           |                                    | Async Replication
                                           v                                    v
                                    [Message Queue]                     [Replica 1] [Replica 2]
                                    (SQS / RabbitMQ)
                                           |
                                           | 4. Pull Job
                                           v
                                    [Worker Fleet]
                               (Image Resizing / 50KB)
```

---

## 6. Component Explanations (One Sentence Per Component)

1. **CDN (Content Delivery Network):** Caches photos and thumbnails at edge locations near end users to drastically reduce read latency and offload static media traffic from origin infrastructure.
2. **Load Balancer:** Distributes incoming user API traffic evenly across multiple stateless application servers while providing automatic failover and SSL/TLS termination.
3. **App Servers:** Executes core application business logic, authenticates requests, coordinates feed generation, and issues presigned storage upload URLs.
4. **Cache (Redis Cluster):** Stores precomputed user feed timelines and popular metadata in memory to deliver sub-millisecond read responses and shield the relational database from high-volume read traffic.
5. **Database (Primary):** Serves as the authoritative source of truth for transactional metadata writes, including user accounts, photo catalog records, and follower relationships.
6. **Database Read Replica:** Handles high-volume read queries asynchronously replicated from the primary database to ensure feed views and profile fetches never contend with upload writes.
7. **Object Storage:** Stores unstructured binary photo and thumbnail files cheaply and reliably with eleven nines of durability and virtually infinite horizontal scalability.
8. **Queue (Message Broker):** Decouples write requests from resource-heavy processing by buffering thumbnail generation tasks asynchronously.
9. **Worker (Thumbnail Generator):** Consumes tasks from the message queue to fetch original photos from object storage, resize them into 50 KB thumbnails, upload the thumbnails back to object storage, and update the database metadata.

---

## 7. Step-by-Step Upload Flow

The upload pipeline uses **Direct-to-Object-Storage Presigned URLs** to prevent large binary payloads from saturating app server bandwidth and CPU memory:

1. **Upload Request & Pre-flight:**
   The client issues an HTTP POST request to /api/v1/photos/upload-request to an App Server via the Load Balancer, sending metadata (user ID, image dimensions, file size, content-type).
2. **Presigned URL Generation:**
   The App Server verifies user authentication and rate limits, generates a unique photo_id (UUIDv7) and secure storage key, requests an S3 presigned PUT URL from Object Storage (valid for 10 minutes), and returns the URL and photo_id to the client.
3. **Direct Binary Upload:**
   The client uploads the raw 2 MB photo file directly to Distributed Object Storage using the presigned URL via HTTP PUT, completely bypassing the application server fleet.
4. **Upload Confirmation & Metadata Persistence:**
   Upon successful direct upload (HTTP 200 from Object Storage), the client sends a confirmation POST to /api/v1/photos/confirm with the photo_id. The App Server writes the initial metadata record into the **Primary Database** with status PROCESSING.
5. **Enqueuing Thumbnail Job:**
   The App Server creates a payload { photo_id: "...", s3_key: "...", user_id: "..." } and publishes it to the **Message Queue** (e.g., AWS SQS or RabbitMQ). The App Server immediately responds to the client with upload_successful: true.
6. **Worker Processing:**
   An available worker from the **Worker Fleet** pulls the message from the queue, downloads the raw 2 MB photo from Object Storage into memory/local disk, and generates an optimized 50 KB thumbnail (320px WebP/JPEG format).
7. **Thumbnail Persistence & Metadata Update:**
   The worker uploads the generated 50 KB thumbnail file to Object Storage at a dedicated key (e.g., /thumbnails/{photo_id}.webp) and updates the **Primary Database** record with the thumbnail_url and sets status to READY.
8. **Feed Invalidation & Cache Warm:**
   The worker (or an auxiliary fan-out task) invalidates or prepends the new post to the creator's follower feed timelines stored in the **Redis Cache**; the message is deleted from the queue upon successful completion.

---

## 8. Scalability Deep Dive: Sharding, Caching & Load Balancing

### 8.1 Sharding Strategy (Database Horizontal Partitioning)
* **Partition Key:** Shard database tables by user_id using **Consistent Hashing**.
  * By hashing the user_id, all photos, user profiles, and follow relationships owned by a specific creator map deterministically to the same physical database shard.
  * This enables single-shard transactional writes and eliminates expensive cross-shard distributed transactions for user-centric queries.
* **Mitigating Hotspots (Celebrity / Influencer Problem):**
  * When a user with 500,000+ followers posts, fanning out writes to 500,000 separate user feed inboxes would overwhelm individual shards.
  * Solution: We implement a **Hybrid Fan-out Model**:
    * Standard users (<25,000 followers): Fan-out on write (push to followers' Redis timelines).
    * High-follower accounts (>25,000 followers): Fan-out on read (pull dynamic posts at read time and merge with the follower's cached feed).
* **Virtual Nodes:** Consistent hashing rings utilize 256 virtual nodes per physical shard to ensure uniform data distribution and seamless rebalancing when scaling out shard capacity.

### 8.2 Caching Strategy (Multi-Tier Caching)
* **Tier 1: Global Edge CDN (Cloudflare / CloudFront):**
  * Caches static media assets (original photos and 50 KB thumbnails).
  * Cache headers: Cache-Control: public, max-age=31536000, immutable with content-hashed URLs (e.g., /img/abc-123_thumb.webp).
  * Expected edge hit ratio: >95%, eliminating origin object storage egress costs.
* **Tier 2: In-Memory Redis Cluster (Feed Cache):**
  * Stores precomputed user feed timelines using Redis Sorted Sets (ZSET), where the member is photo_id and the score is the Unix timestamp created_at.
  * Memory footprint: Keeping the most recent 800 photo IDs per active user feed requires ~8 KB per user. For 1,000,000 DAU:
    1,000,000 * 8 KB ≈ 8 GB of RAM
  * An 8-node Redis cluster with 32 GB RAM easily holds active feed timelines in memory with an eviction policy of allkeys-lru.
* **Tier 3: Database Query & Connection Cache:**
  * Application-level caching for user profile queries and follower graphs with 60-second TTL.

### 8.3 Database Load Balancing & Read Replication
* **Topology:** 1 Primary Database (Active) + 1 Standby Hot Replica (Failover in alternate Availability Zone) + 3 Read Replicas (Horizontal Read Scaling).
* **Connection Pooling & Routing (PgBouncer / AWS RDS Proxy):**
  * Microservices connect to a database proxy layer rather than maintaining direct open database connections.
  * The proxy automatically splits traffic based on SQL statement type:
    * INSERT, UPDATE, DELETE, and explicit write transactions route strictly to the **Primary Database**.
    * SELECT queries route across **Read Replicas** via weighted round-robin.
* **Replication Lag Guard:**
  * Replicas report replication lag (in milliseconds). The proxy dynamically removes any replica whose lag exceeds 500ms to prevent users from seeing stale data after actions like profile updates.

---

## 9. Architectural Trade-offs

### Trade-off 1: Direct Client-to-Object-Storage Uploads vs. Uploading via Application Servers
* **Decision Chosen:** Direct uploads using Presigned URLs generated by the App Server.
* **Advantages:**
  * Offloads massive binary network traffic (23 MB/s average, 116 MB/s peak) entirely from the App Server fleet.
  * App servers do not suffer memory exhaustion or socket starvation from slow mobile client connections.
  * Significant infrastructure cost savings, keeping the app server tier lightweight and stateless.
* **Disadvantages & Mitigations:**
  * Loss of immediate server-side validation: The server cannot inspect the photo file contents before it hits object storage.
  * Mitigation: We restrict presigned URLs with strict S3 bucket policies enforcing maximum file size limits (5 MB), MIME-type constraints (image/jpeg, image/png, image/webp), and run automated virus/malware scanning inside the background worker pipeline before publishing.

### Trade-off 2: Fan-out on Write (Push Model) vs. Fan-out on Read (Pull Model) for Feed Generation
* **Decision Chosen:** Hybrid Fan-out Model (Push for regular users, Pull for high-follower accounts).
* **Comparison:**
  * Pure Fan-out on Write: When a user uploads a photo, the system writes the photo ID into every follower's feed inbox. This makes reads instantaneous (O(1) from Redis cache), but a celebrity with 2 million followers triggers 2 million database writes per upload.
  * Pure Fan-out on Read: Feeds are computed on demand when a user opens the app by querying followee tables and sorting photos in real time. Writes are trivial (O(1)), but feed reads become computationally expensive (O(N log N) multi-table joins), which would cripple the database at 2,894 peak read QPS.
* **Why the Hybrid Trade-off Wins:**
  * Regular users (99.9% of the user base) push their new photo IDs to their followers' Redis timelines upon upload.
  * High-follower accounts skip write fan-out; their latest posts are fetched and merged into the user's feed in memory during read requests. This delivers sub-50ms feed reads while capping write amplification.

### Trade-off 3: Asynchronous Queue-Based Thumbnail Generation vs. Synchronous Inline Resizing
* **Decision Chosen:** Asynchronous processing via a Message Queue and dedicated Worker Fleet.
* **Advantages:**
  * The client receives a fast upload response (<200ms) without waiting for CPU-intensive image compression and resizing algorithms to execute.
  * Spikes in photo uploads do not cause API timeouts or crash user-facing web servers; requests accumulate safely in the queue and workers scale horizontally based on queue depth.
* **Disadvantages & Mitigations:**
  * Eventual consistency: For a few seconds after uploading, the thumbnail is not immediately visible in the feed or search results.
  * Mitigation: The mobile client displays a local cached preview of the original photo in the user's own feed immediately, while showing a lightweight spinner badge until the worker completes the thumbnail job.

---

## 10. Summary Matrix

| Metric / Dimension | Specification / Value | Engineering Rationale |
| :--- | :--- | :--- |
| **Registered Users** | 10,000,000 | Baseline customer base |
| **Daily Active Users (DAU)** | 1,000,000 (10%) | 1M daily engaged users |
| **Uploads (Writes)** | 1,000,000 / day | Avg: 11.6/s | Peak: 57.9/s |
| **Feed Views (Reads)** | 50,000,000 / day | Avg: 578.7/s | Peak: 2,893.5/s |
| **Read-to-Write Ratio** | 50 : 1 | Overwhelmingly read-heavy |
| **Storage Growth / Year** | 748.25 TB/year | 730 TB (Originals) + 18.25 TB (Thumbnails) |
| **Storage Layer** | Distributed Object Storage | 11 9's durability; avoids DB bloat & high EBS costs |
| **Caching Tier** | Edge CDN + Redis Cluster | Serves >95% static bytes & precomputed feeds |
| **DB Architecture** | Primary + 3 Read Replicas | Connection proxy splits reads & writes |
| **Processing Paradigm** | Asynchronous Queue + Workers | Decouples CPU-heavy thumbnail resizing from API |
