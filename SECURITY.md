# 🔐 Security Implementation Documentation

## QR Attendance System - Security Architecture v4.0

---

## Table of Contents

1. [Overview](#overview)
2. [Security Philosophy](#security-philosophy)
3. [Threat Model](#threat-model)
4. [Security Solutions Implemented](#security-solutions-implemented)
5. [Technical Implementation](#technical-implementation)
6. [Security Levels](#security-levels)
7. [Audit & Monitoring](#audit--monitoring)
8. [Deployment Requirements](#deployment-requirements)
9. [Known Limitations](#known-limitations)

---

## Overview

This document describes the comprehensive security measures implemented in the QR Attendance System to prevent cheating, proxy attendance, and abuse.

### Security Principle

> **The client (student device) is never trusted. Every important check is server-side and time-bound.**

---

## Security Philosophy

The system is designed with the understanding that:

| Assumption | Impact |
|------------|--------|
| Attendance = academic record | High stakes for abuse |
| Students are incentivized to cheat | Must assume adversarial users |
| System operates in uncontrolled environments | Cannot trust client-side data |
| QR codes can be shared | Must bind tokens to specific students |

---

## Threat Model

### What Attackers CAN Do

| Attack Vector | Mitigation |
|--------------|------------|
| Share QR codes via WhatsApp/screenshot | Student-bound tokens, device binding |
| Share login credentials | Device fingerprinting, multi-device limits |
| Use mock/spoofed GPS locations | Multi-factor location validation, accuracy checks |
| Use same device for multiple accounts | Device-per-session limits, abuse detection |
| Script/automate API calls | Rate limiting, token replay protection |
| Replay captured tokens | Time-bound tokens, one-time use nonces |

### What Attackers CANNOT Do

- Break cryptographic HMAC signatures
- Access server secrets
- Modify backend logic
- Bypass server-side validation

---

## Security Solutions Implemented

### 1. Student-Bound Attendance Tokens (CRITICAL)

**Problem:** Same QR token works for all students
**Solution:** HMAC-signed tokens binding session + student + device + time

```
attendanceHash = HMAC(
    sessionId + studentId + deviceFingerprint + timeWindow,
    SERVER_SECRET
)
```

**Files:**
- `server/utils/security.js` - Token generation/validation
- `server/models/Session.js` - QR token methods

### 2. Rotating QR Codes

**Implementation:**
- QR codes rotate every 30 seconds
- Each QR contains: `sessionId`, `token`, `nonce`, `timestamp`
- Server validates HMAC signature on every request

**QR Data Structure:**
```json
{
    "s": "session_id",
    "t": "hmac_token",
    "n": "random_nonce",
    "ts": 1703929200000,
    "e": 1703929230000
}
```

### 3. Device Fingerprinting

**Purpose:** Prevent one device from marking attendance for multiple students

**Components Collected:**
- User-Agent
- Screen resolution
- Platform
- Browser features
- Timezone

**Rules:**
- Max 3 devices per student
- Same device cannot mark for multiple students in one session
- Trust score decreases with suspicious activity

**Files:**
- `server/models/DeviceRegistry.js` - Device management
- `server/utils/security.js` - Fingerprint hashing

### 4. Replay Protection (Redis)

**Mechanism:**
```
SET attendance:{sessionId}:{studentId} = true (TTL = session duration)
SET token:used:{sessionId}:{nonce} = true (TTL = 60s)
```

**Before marking attendance:**
1. Check if student already marked (Redis)
2. Check if token/nonce already used
3. If new, mark as used atomically

**Files:**
- `server/config/redis.js` - Redis service

### 5. Enhanced Geolocation Validation

**Checks Performed:**
1. Distance from session center
2. GPS accuracy validation
3. Spoofing detection flags:
   - Perfect accuracy (< 3m) = suspicion
   - Zero altitude = suspicion
   - Low precision coordinates = suspicion
   - Location jumps/teleportation = high suspicion
   - Speed mismatch = suspicion

**Files:**
- `server/utils/geolocation.js` - Validation logic

### 6. Rate Limiting & Abuse Detection

**Limits:**
- 10 attendance attempts per minute per student
- 5 device switches per day
- 5 failed validations before temporary block

**Detection:**
- Suspicious activity logging
- Abuse pattern analysis
- Automatic trust score reduction

**Files:**
- `server/middleware/rateLimiter.js`

### 7. Comprehensive Audit Logging

**Every attendance attempt logs:**
- Student ID, session ID
- Device hash, user agent
- IP address
- Location (lat, lng, accuracy)
- Validation results (token, time, location, device)
- Security flags detected
- Suspicion score

**Files:**
- `server/models/AuditLog.js`

---

## Technical Implementation

### Complete Attendance Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Professor  │     │   Redis     │     │   MongoDB   │
│  Dashboard  │     │   Cache     │     │  Database   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                    │                    │
       │ Start Session      │                    │
       │────────────────────┼───────────────────>│
       │                    │                    │
       │ Cache Session      │                    │
       │───────────────────>│                    │
       │                    │                    │
       │ Generate QR        │                    │
       │<───────────────────│                    │
       │                    │                    │
       │    ┌───────────────┼────────────────┐   │
       │    │   QR Rotates  │                │   │
       │    │   Every 30s   │                │   │
       │    └───────────────┼────────────────┘   │
       │                    │                    │

┌─────────────┐
│  Student    │
│    App      │
└──────┬──────┘
       │ Scan QR
       │
       │ POST /attendance/mark
       │ {sessionId, token, nonce, timestamp,
       │  lat, lng, deviceFingerprint}
       │
       │             ┌──────────────────────────────────────┐
       │             │ VALIDATION CHAIN                     │
       │             ├──────────────────────────────────────┤
       │             │ 1. Role Check (is student?)          │
       │             │ 2. Block Check (is blocked?)         │
       │             │ 3. Session Valid (active, time OK?)  │
       │             │ 4. Token Valid (HMAC, time window?)  │
       │             │ 5. Replay Check (already marked?)    │
       │             │ 6. Device Valid (fingerprint, limit?)│
       │             │ 7. Academic Match (branch, year?)    │
       │             │ 8. Location Valid (distance, spoof?) │
       │             └──────────────────────────────────────┘
       │
       │             ALL PASS ────> Create Attendance Record
       │                            Log Audit
       │                            Update Redis
       │
       │<────────────────── Response (success/error)
```

### Validation Order (Optimized)

1. **Role Check** - Fastest, no DB call
2. **Block Check** - Redis lookup
3. **Session Fetch** - Single DB call with populate
4. **Time Window** - In-memory calculation
5. **Token Validation** - HMAC comparison
6. **Replay Protection** - Redis check
7. **Device Validation** - DB + Redis
8. **Academic Eligibility** - In-memory comparison
9. **Geolocation** - Complex validation

---

## Security Levels

Professors can choose session security level:

| Level | Token | Device | Location | Description |
|-------|-------|--------|----------|-------------|
| Standard | Rotating | Enforced | Validated | Default, balanced security |
| Strict | Rotating | Enforced | Strict + spoofing detection fails | Higher security |
| Paranoid | Rotating | Enforced | Multi-sample required | Maximum security |

---

## Audit & Monitoring

### Audit Log Events

| Event Type | Description |
|------------|-------------|
| ATTENDANCE_ATTEMPT | Any attendance marking attempt |
| ATTENDANCE_SUCCESS | Successful attendance |
| ATTENDANCE_FAILED | Failed attempt with reason |
| SESSION_START | Professor started session |
| SESSION_STOP | Professor stopped session |
| QR_GENERATED | QR code generated/refreshed |
| DEVICE_REGISTERED | New device registered |
| DEVICE_BLOCKED | Device blocked due to abuse |
| RATE_LIMIT_HIT | Rate limit exceeded |
| SUSPICIOUS_ACTIVITY | Flagged suspicious behavior |

### Security Flags

| Flag | Description | Suspicion Score |
|------|-------------|----------------|
| PERFECT_ACCURACY | GPS accuracy < 3m | +20 |
| ZERO_ALTITUDE | Altitude exactly 0 | +10 |
| LOW_PRECISION | Coordinates too round | +15 |
| LOCATION_JUMP | Teleportation detected | +50 |
| SPEED_MISMATCH | Speed doesn't match movement | +25 |
| DEVICE_SWITCHING | New device detected | +10 |
| SHARED_DEVICE | Device used by another student | +40 |
| TOKEN_REPLAY | Attempted token reuse | +30 |

---

## Deployment Requirements

### Our Production Stack

| Component | Service | Purpose |
|-----------|---------|--------|
| **Frontend** | Vercel | React app hosting with CDN |
| **Backend** | Render | Node.js/Express API server |
| **Database** | MongoDB Atlas | Cloud-hosted MongoDB |
| **Cache** | Upstash Redis | Serverless Redis for session caching |
| **Auth** | Google OAuth + JWT | Secure authentication |

### Required Technologies

- **Node.js** >= 18
- **MongoDB** >= 5.0
- **Redis** >= 6.0 (for full security features)

### Redis Setup (Upstash)

We use **Upstash Redis** for serverless, globally distributed caching:

**Setup:**
1. Create free account at [upstash.com](https://upstash.com)
2. Create a new Redis database
3. Copy the connection URL to your environment variables

**Local Development:**
```bash
# No local Redis needed - use Upstash free tier for development
# Or install Redis locally:
# Linux: sudo apt install redis-server
# macOS: brew install redis
# Windows: Use WSL2 with Linux instructions
```

### Environment Variables

```env
# Authentication
JWT_SECRET=minimum-32-character-secret-key
GOOGLE_CLIENT_ID=your-google-client-id

# Database
MONGODB_URI=mongodb+srv://...

# Redis (Upstash)
REDIS_URL=redis://default:password@host:port

# Security tuning
QR_ROTATION_INTERVAL=30000
MAX_DEVICES_PER_STUDENT=3
SUSPICION_THRESHOLD=50
```

---

## Degraded Mode (No Redis)

If Redis is unavailable, the system operates in **degraded mode**:

| Feature | With Redis | Without Redis |
|---------|------------|---------------|
| Rotating QR | ✅ | ✅ (stored in MongoDB) |
| Token replay protection | ✅ Real-time | ⚠️ DB-only (race condition possible) |
| Rate limiting | ✅ Distributed | ⚠️ Memory-based (per-instance) |
| Device tracking | ✅ Fast cache | ⚠️ DB-only |
| Abuse logging | ✅ Fast | ⚠️ DB-only |

> ⚠️ **Production deployments should always use Redis**

---

## Known Limitations

### Cannot Fully Prevent

1. **Advanced GPS Spoofing** - Sophisticated spoofing apps may bypass detection
2. **Device Sharing** - If students share devices outside of sessions
3. **Credential Sharing** - If students share Google accounts (mitigated by device limits)

### Mitigations Are Deterrents

The goal is to make cheating:
- **Difficult** - Multiple checks to bypass
- **Risky** - High detection probability
- **Traceable** - Full audit trail
- **Not worth it** - Effort exceeds benefit

---

## API Endpoints (Security-Related)

### Attendance

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/attendance/mark` | Mark attendance (rate limited) |
| GET | `/api/attendance/suspicious` | Get flagged records (admin) |
| GET | `/api/attendance/audit/:studentId` | Get student audit log (admin) |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions/:id/refresh-qr` | Force QR refresh |
| PUT | `/api/sessions/:id/settings` | Update security settings |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health/security` | Security status & feature availability |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 5.0.0 | 2025-01 | Cloud deployment (Vercel + Render + Upstash), documentation update |
| 4.0.0 | 2024-12 | Complete security overhaul, 7-layer validation |
| 3.0.0 | 2024-12 | Basic QR rotation |
| 2.0.0 | 2024-11 | Device fingerprinting |
| 1.0.0 | 2024-10 | Initial release |

---

## Contact

For security issues or vulnerabilities, please contact the development team directly.

---

*This document should be updated whenever security features are modified.*
