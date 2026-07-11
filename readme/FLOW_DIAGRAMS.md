# QR Attendance System - Flow Diagrams

## How to View These Diagrams:
1. Copy the code blocks below
2. Go to https://mermaid.live/
3. Paste the code
4. View/Export the diagram

---

## 1. Student Attendance Flow

```mermaid
graph TD
    A[Student Opens App] --> B[Login with Google]
    B --> C{Email Valid?}
    C -->|No| D[Pending Approval]
    C -->|Yes| E[Student Dashboard]
    E --> F[Click Scan QR]
    F --> G[Camera Opens]
    G --> H[Scan QR Code]
    H --> I{QR Valid?}
    I -->|No| J[Error: Invalid QR]
    I -->|Yes| K[Extract Session ID]
    K --> L[Get Location]
    L --> M{Location Permission?}
    M -->|No| N[Error: Need Location]
    M -->|Yes| O[Send to Backend]
    O --> P{Validation Chain}
    P --> Q{Session Active?}
    Q -->|No| R[Error: Session Ended]
    Q -->|Yes| S{Student Enrolled?}
    S -->|No| T[Error: Not Enrolled]
    S -->|Yes| U{Device Registered?}
    U -->|No| V[Register Device]
    U -->|Yes| W{Within Geofence?}
    V --> W
    W -->|No| X[Failed Attempt]
    W -->|Yes| Y{Already Marked?}
    Y -->|Yes| Z[Error: Already Marked]
    Y -->|No| AA[Mark Attendance]
    AA --> AB[Success Screen]
    X --> AC[Professor Can Review]
    
    style AA fill:#90EE90
    style AB fill:#90EE90
    style X fill:#FFB6C1
    style J fill:#FFB6C1
    style R fill:#FFB6C1
    style T fill:#FFB6C1
    style Z fill:#FFB6C1
```

---

## 2. Professor Session Management Flow

```mermaid
graph TD
    A[Professor Login] --> B[Dashboard]
    B --> C[View Claimed Courses]
    C --> D[Select Course]
    D --> E[Start Session]
    E --> F{Location Permission?}
    F -->|No| G[Error: Need Location]
    F -->|Yes| H[Create Session]
    H --> I[Generate QR Code]
    I --> J[Display QR + Timer]
    J --> K[Monitor Attendance]
    K --> L{Students Marking}
    L --> M[Real-time Updates]
    M --> N{Failed Attempts?}
    N -->|Yes| O[Review Failed List]
    O --> P{Accept/Reject?}
    P -->|Accept| Q[Mark as Present]
    P -->|Reject| R[Flag Student]
    N -->|No| S[Continue Monitoring]
    S --> T{Session Time Up?}
    T -->|No| K
    T -->|Yes| U[Stop Session]
    U --> V[View Final Stats]
    V --> W[Export CSV]
    
    style H fill:#90EE90
    style Q fill:#90EE90
    style W fill:#90EE90
    style R fill:#FFB6C1
```

---

## 3. Admin Approval Workflow

```mermaid
graph TD
    A[Admin Login] --> B[Dashboard]
    B --> C{Pending Items?}
    C -->|No| D[View Analytics]
    C -->|Yes| E[Approvals Tab]
    E --> F{Select Type}
    F -->|Professors| G[Review Professor]
    F -->|Claims| H[Review Claim]
    F -->|Electives| I[Review Elective]
    F -->|Users| J[Review User]
    
    G --> K{Approve/Reject?}
    H --> K
    I --> K
    J --> K
    
    K -->|Approve| L[Update Status]
    K -->|Reject| M[Delete/Reject]
    
    L --> N[Send Notification]
    M --> O[Log Action]
    
    N --> P[Refresh Dashboard]
    O --> P
    
    style L fill:#90EE90
    style M fill:#FFB6C1
```

---

## 4. Security Validation Chain

```mermaid
graph TD
    A[Attendance Request] --> B{Session Valid?}
    B -->|No| C[REJECT: Invalid Session]
    B -->|Yes| D{Session Active?}
    D -->|No| E[REJECT: Session Ended]
    D -->|Yes| F{Student Enrolled?}
    F -->|No| G[REJECT: Not Enrolled]
    F -->|Yes| H{QR Token Valid?}
    H -->|No| I[REJECT: Invalid Token]
    H -->|Yes| J{Within Time Window?}
    J -->|No| K[REJECT: Too Late]
    J -->|Yes| L{Device Check}
    L --> M{Device Registered?}
    M -->|No| N[Register New Device]
    M -->|Yes| O{Same Device?}
    O -->|No| P[FLAG: Device Mismatch]
    N --> Q{Location Check}
    O -->|Yes| Q
    P --> Q
    Q --> R{Location Valid?}
    R -->|No| S[FLAG: Location Issue]
    R -->|Yes| T{Calculate Distance}
    T --> U{Within Range?}
    U -->|No| V[FAILED ATTEMPT]
    U -->|Yes| W{Already Marked?}
    W -->|Yes| X[REJECT: Duplicate]
    W -->|No| Y[SUCCESS: Mark Present]
    
    V --> Z[Store for Review]
    S --> Z
    P --> Z
    
    style Y fill:#90EE90
    style C fill:#FFB6C1
    style E fill:#FFB6C1
    style G fill:#FFB6C1
    style I fill:#FFB6C1
    style K fill:#FFB6C1
    style X fill:#FFB6C1
    style V fill:#FFA500
    style S fill:#FFA500
    style P fill:#FFA500
```

---

## 5. Database Schema Relationships

```mermaid
erDiagram
    USER ||--o{ ATTENDANCE : marks
    USER ||--o{ SESSION : creates
    USER ||--o{ CLAIM_REQUEST : submits
    USER ||--o{ AUDIT_LOG : generates
    USER ||--o{ DEVICE_REGISTRY : registers
    
    COURSE ||--o{ SESSION : has
    COURSE ||--o{ ATTENDANCE : tracks
    COURSE ||--o{ CLAIM_REQUEST : for
    COURSE ||--o{ ELECTIVE_REQUEST : for
    
    SESSION ||--o{ ATTENDANCE : records
    SESSION ||--o{ FAILED_ATTEMPT : stores
    
    ATTENDANCE ||--o{ AUDIT_LOG : logs
    
    USER {
        string _id
        string name
        string email
        string role
        string branch
        int year
        boolean approved
    }
    
    COURSE {
        string _id
        string courseCode
        string courseName
        string branch
        int year
        int semester
        objectId claimedBy
    }
    
    SESSION {
        string _id
        objectId course
        objectId professor
        datetime startTime
        datetime endTime
        boolean isActive
        object location
        string qrToken
    }
    
    ATTENDANCE {
        string _id
        objectId student
        objectId session
        string status
        object location
        object metadata
        object securityFlags
    }
```

---

## 6. API Request Flow

```mermaid
sequenceDiagram
    participant S as Student App
    participant API as Backend API
    participant DB as MongoDB
    participant R as Redis Cache
    
    S->>API: POST /attendance/mark
    API->>API: Verify JWT Token
    API->>R: Check if already marked
    R-->>API: Not found in cache
    API->>DB: Find Session
    DB-->>API: Session data
    API->>API: Validate session active
    API->>DB: Check enrollment
    DB-->>API: Student enrolled
    API->>API: Validate location
    API->>API: Validate device
    API->>API: Check time window
    API->>DB: Create attendance record
    DB-->>API: Record created
    API->>R: Cache attendance mark
    R-->>API: Cached
    API->>DB: Log audit event
    DB-->>API: Logged
    API-->>S: Success response
    S->>S: Show success screen
```

---

## 7. System Architecture

```mermaid
graph TB
    subgraph "Frontend - React"
        A[Student App]
        B[Professor App]
        C[Admin Dashboard]
    end
    
    subgraph "Backend - Node.js/Express"
        D[API Routes]
        E[Controllers]
        F[Middleware]
        G[Utils]
    end
    
    subgraph "Database Layer"
        H[(MongoDB)]
        I[(Redis Cache)]
    end
    
    subgraph "External Services"
        J[Google OAuth]
        K[Geolocation API]
    end
    
    A --> D
    B --> D
    C --> D
    
    D --> F
    F --> E
    E --> G
    
    E --> H
    E --> I
    
    F --> J
    E --> K
    
    style A fill:#E3F2FD
    style B fill:#E8F5E9
    style C fill:#FFF3E0
    style H fill:#FCE4EC
    style I fill:#F3E5F5
```

---

## 8. Failed Attempt Review Flow

```mermaid
graph TD
    A[Student Marks Attendance] --> B{Validation}
    B -->|Pass| C[Mark Present]
    B -->|Fail| D[Create Failed Attempt]
    D --> E[Store in Database]
    E --> F[Show in Professor Dashboard]
    F --> G[Professor Reviews]
    G --> H{Decision}
    H -->|Accept| I[Convert to Present]
    H -->|Reject| J[Flag Student]
    H -->|Accept All| K[Bulk Convert]
    H -->|Reject All| L[Bulk Reject]
    
    I --> M[Update Attendance]
    J --> N[Add to Audit Log]
    K --> M
    L --> N
    
    M --> O[Notify Student]
    N --> O
    
    style C fill:#90EE90
    style I fill:#90EE90
    style K fill:#90EE90
    style J fill:#FFB6C1
    style L fill:#FFB6C1
```

---

## 9. Redis Caching Strategy

```mermaid
graph TD
    A[Attendance Request] --> B{Check Redis}
    B -->|Hit| C[Return Cached Result]
    B -->|Miss| D[Query MongoDB]
    D --> E[Process Data]
    E --> F{Should Cache?}
    F -->|Yes| G[Store in Redis]
    F -->|No| H[Return Result]
    G --> I[Set TTL: 24 hours]
    I --> H
    C --> J[Fast Response]
    H --> K[Normal Response]
    
    L[Session Ends] --> M[Clear Session Cache]
    N[Admin Flush] --> O[Clear All Cache]
    
    style C fill:#90EE90
    style J fill:#90EE90
```

---

## 10. Complete User Journey Map

```mermaid
journey
    title Student Attendance Journey
    section Registration
      Visit App: 5: Student
      Google Login: 4: Student
      Email Parsing: 5: System
      Auto Approval: 5: System
    section Daily Use
      Open Dashboard: 5: Student
      Check Active Class: 5: Student
      Scan QR Code: 3: Student
      Location Check: 2: Student
      Attendance Marked: 5: Student
    section Review
      View History: 4: Student
      Check Percentage: 5: Student
      See Failed Attempts: 2: Student
```

---

## How to Use These Diagrams:

### Method 1: Mermaid Live Editor
1. Go to https://mermaid.live/
2. Copy any diagram code above
3. Paste in the editor
4. Download as PNG/SVG

### Method 2: VS Code Extension
1. Install "Markdown Preview Mermaid Support"
2. Open this file in VS Code
3. Preview with Ctrl+Shift+V

### Method 3: GitHub
- GitHub automatically renders Mermaid diagrams in markdown files

---

## Additional Tools:

### For Code Analysis:
- **Madge**: Generate dependency graphs
  ```bash
  npm install -g madge
  madge --image graph.png client/src
  ```

### For Architecture:
- **Draw.io**: https://app.diagrams.net/
- **Lucidchart**: https://www.lucidchart.com/

### For API Documentation:
- **Swagger**: Auto-generate API docs
- **Postman**: Generate flow diagrams from collections

---

**Created:** January 9, 2026
**Format:** Mermaid Diagrams
**Compatible with:** GitHub, VS Code, Mermaid Live Editor
