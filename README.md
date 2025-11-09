# QueueCTL — Distributed Background Job Queue (made in Node.js)

QueueCTL is a lightweight, background job queue system with:

- CLI-based job management
- Multiple worker processes
- Automatic retries with exponential backoff
- Dead Letter Queue (DLQ) handling for permanently failed jobs
- Persistent SQLite storage (survives restarts)
- Dashboard to view & control the system

This project is built to demonstrate system design fundamentals for backend infrastructure & distributed processing.

---

## 1. Setup Instructions

### **Requirements**
- Node.js (≥ 16.x recommended)
- SQLite3 (pre-installed on most Linux/macOS)

### **Installation**
```bash
git clone https://github.com/TejasMG12/queuectl
cd queuectl
npm install
````

### **Initialize Database**

```bash
node db.js
```

### **Make CLI globally usable**

```bash
npm install -g .
```

Now you can run the `queuectl` command directly in terminal.

---

## 2. Usage Examples (CLI Commands)

### **Enqueue a Job**

```bash
queuectl enqueue '{"id":"job1","command":"echo hello","max_retries":3}'
```

### **Start Workers**

Run 3 workers in background that continuously poll jobs:

```bash
queuectl worker start --count 3
```

### **Stop Workers Gracefully**

```bash
queuectl worker stop
```

### **View System Status**

```bash
queuectl status
```

### **List Jobs by State**

```bash
queuectl list --state pending
```

### **Dead Letter Queue**

```bash
queuectl dlq list
queuectl dlq retry job1
```

### **Configuration**

```bash
queuectl config set backoff_base 3
queuectl config get
```

---

## 3. Architecture Overview

### **Job Specification**

Example job object stored in SQLite:

```json
{
  "id": "unique-job-id",
  "command": "echo 'Hello World'",
  "state": "pending",
  "attempts": 0,
  "max_retries": 3,
  "created_at": "2025-11-04T10:30:00Z",
  "updated_at": "2025-11-04T10:30:00Z"
}
```

### **Job Lifecycle**

| State        | Meaning                           |
| ------------ | --------------------------------- |
| `pending`    | Ready to be picked up by a worker |
| `processing` | Being executed                    |
| `completed`  | Successfully executed             |
| `failed`     | Failed but retryable              |
| `dead`       | Permanently failed → moved to DLQ |

### **Workers**

Workers continuously:

1. Fetch next `pending` job.
2. Lock job to itself (`processing` state + worker id).
3. Run command in a child process.
4. If success → mark completed.
5. If failure → retry with exponential backoff:

   ```
   delay = backoff_base ^ attempts
   ```
6. If retries exceeded → move to DLQ.

### **Persistence**

All jobs & failure logs stored in:

```
queuectl.db (SQLite)
```

This ensures:

* No job loss on restart
* Workers can run across different machines if shared DB is remote

---

## 4. Assumptions & Trade-offs

| Decision                      | Reason                          | Trade-off                                   |
| ----------------------------- | ------------------------------- | ------------------------------------------- |
| SQLite                        | Simple, fast, transactional     | Not ideal for huge distributed clusters     |
| File-based worker stop signal | Easy graceful shutdown          | Needs coordination if multi-host            |
| CLI-first control             | Simpler integration for servers | GUI kept minimal for assignment             |
| Exponential backoff retries   | Realistic production pattern    | Does not yet support jitter/delay variation |

---

## 5. Testing Instructions

### **Basic Flow Test**

```bash
queuectl enqueue '{"id":"t1","command":"echo hi"}'
queuectl worker start --count 1
queuectl status
```

### **Failure & Retry Test**

```bash
queuectl enqueue '{"id":"fail1","command":"exit 1","max_retries":2}'
queuectl worker start
queuectl status
queuectl dlq list
```

### **Multiple Workers**

```bash
queuectl enqueue '{"id":"multi1","command":"sleep 2"}'
queuectl enqueue '{"id":"multi2","command":"sleep 2"}'
queuectl worker start --count 5
```

---

## 6. Job Timeout Handling (Optional)

Workers may specify timeouts (if enabled):

```
queuectl worker start --timeout 5000
```

Any job exceeding timeout is treated as failed and retried / moved to DLQ.

---

## 7. Web Dashboard (Optional Feature)

Start dashboard:

```bash
npm run dashboard
```

Then open:

```
http://localhost:8080
```

### Features:

* View counts of job states
* Enqueue jobs from UI
* Stop workers
* Retry DLQ jobs
* View job history
