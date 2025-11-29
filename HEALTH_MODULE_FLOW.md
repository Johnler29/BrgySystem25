# Health & Social Services Module - Complete Flow Documentation

## 📋 Overview
The Health & Social Services module is a comprehensive health records management system with 11 different tabs, each managing different types of health data.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (admin-health.js)                │
│  - Tab Management                                            │
│  - Form Generation                                           │
│  - Data Display                                              │
│  - User Interactions                                         │
└──────────────────────┬──────────────────────────────────────┘
                      │
                      │ HTTP Requests (GET/POST)
                      │
┌──────────────────────▼──────────────────────────────────────┐
│              BACKEND API (routes/health.js)                  │
│  - Authentication & Authorization                            │
│  - Data Validation                                           │
│  - Database Operations                                       │
│  - Summary Statistics                                        │
└──────────────────────┬──────────────────────────────────────┘
                      │
                      │ MongoDB Queries
                      │
┌──────────────────────▼──────────────────────────────────────┐
│              DATABASE (MongoDB Collections)                 │
│  - health_patient_data                                      │
│  - health_patient_records                                   │
│  - health_family_planning                                    │
│  - health_post_partum                                        │
│  - health_child_immunization                                 │
│  - health_individual_treatment                              │
│  - health_pregnancy_tracking                                 │
│  - health_prenatal_visits                                    │
│  - health_medicines                                          │
│  - health_midwives                                           │
│  - health_schedules                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Complete Flow Breakdown

### 1️⃣ **Page Initialization Flow**

```
Page Load
    │
    ├─→ Load admin-health.html
    │   └─→ Load CSS styles
    │   └─→ Load base.js, base-header.js
    │   └─→ Load admin-health.js
    │
    └─→ JavaScript Initialization (admin-health.js)
        │
        ├─→ initUser()
        │   └─→ GET /api/me
        │   └─→ Set user object
        │   └─→ Determine isAdmin status
        │
        ├─→ switchTab('patient-data')
        │   └─→ Set currentTab
        │   └─→ Update tab UI (active state)
        │   └─→ Update table headers
        │   └─→ load() → Fetch data
        │   └─→ updateFormContent() → Generate form HTML
        │
        ├─→ refreshSummary()
        │   └─→ GET /api/health/summary
        │   └─→ Update summary cards (Total, Active, Scheduled, etc.)
        │
        └─→ refreshCalendar()
            └─→ GET /api/health/calendar
            └─→ Render calendar grid
```

### 2️⃣ **Tab Switching Flow**

```
User Clicks Tab
    │
    └─→ switchTab(tabName)
        │
        ├─→ Set currentTab = tabName
        ├─→ Update UI: Remove 'active' from all tabs
        ├─→ Add 'active' to clicked tab
        ├─→ Update table headers from tabConfigs[tabName].headers
        ├─→ Reset pagination (state.page = 1)
        │
        ├─→ load()
        │   └─→ Build query params (page, limit, status, q, from, to, sort)
        │   └─→ GET /api/health/{tab-endpoint}?params
        │   └─→ renderRows(data.rows)
        │   └─→ renderPager(page, totalPages, total)
        │
        └─→ updateFormContent()
            └─→ getFormHTML(tabName)
            └─→ Generate form fields based on tab
            └─→ Special logic (e.g., post-partum gender check)
```

### 3️⃣ **Data Loading Flow (GET Request)**

```
User Action (Tab Switch / Filter / Pagination)
    │
    └─→ load() function
        │
        ├─→ Check isLoading flag (prevent duplicate requests)
        ├─→ Show "Loading..." in table
        ├─→ Build query parameters:
        │   ├─→ page, limit, status, q (search), from, to, sort
        │   └─→ userId (if non-admin)
        │
        ├─→ GET /api/health/{endpoint}?params
        │   │
        │   └─→ Backend (routes/health.js)
        │       │
        │       ├─→ requireAuth middleware
        │       │   └─→ Check session.user
        │       │
        │       ├─→ listCollection() or custom handler
        │       │   │
        │       │   ├─→ Parse query parameters
        │       │   ├─→ Build MongoDB query:
        │       │   │   ├─→ Status filter
        │       │   │   ├─→ Date range filter
        │       │   │   ├─→ Search query (regex on searchable fields)
        │       │   │   └─→ User filter (if non-admin)
        │       │   │
        │       │   ├─→ Execute query:
        │       │   │   ├─→ countDocuments() → total count
        │       │   │   ├─→ find().sort().skip().limit() → paginated results
        │       │   │
        │       │   └─→ Return JSON:
        │       │       {
        │       │         ok: true,
        │       │         rows: [...],
        │       │         total: 100,
        │       │         page: 1,
        │       │         totalPages: 10
        │       │       }
        │
        └─→ Frontend receives response
            │
            ├─→ renderRows(rows)
            │   └─→ Loop through rows
            │   └─→ Generate table cells based on currentTab
            │   └─→ Add action buttons (View, Edit, Delete)
            │   └─→ Append to tableBody
            │
            └─→ renderPager(page, totalPages, total)
                └─→ Create pagination buttons
                └─→ Update "Total: X" display
```

### 4️⃣ **Add New Record Flow (POST Request)**

```
User Clicks "+ Add New Record"
    │
    └─→ btnAdd.onclick
        │
        ├─→ Reset form (frm.reset())
        ├─→ Clear message (msg.textContent = '')
        ├─→ Update modal title
        ├─→ updateFormContent()
        │   └─→ getFormHTML(currentTab)
        │   └─→ Generate form fields dynamically
        │   └─→ Special wiring (e.g., post-partum gender logic)
        │
        └─→ Show modal (modal.classList.add('open'))

User Fills Form & Clicks "Save Record"
    │
    └─→ btnSave.onclick
        │
        ├─→ Check user authentication
        ├─→ Collect form data (FormData)
        ├─→ Validate required fields
        │   └─→ Highlight errors in red
        │   └─→ Show error message if invalid
        │
        ├─→ Build request body:
        │   ├─→ All form fields
        │   ├─→ createdBy: user._id
        │   └─→ addedBy: user.name
        │
        ├─→ POST /api/health/{endpoint}
        │   │
        │   └─→ Backend (routes/health.js)
        │       │
        │       ├─→ requireAuth middleware
        │       ├─→ requireAdmin middleware (for most endpoints)
        │       │
        │       ├─→ Validate required fields
        │       ├─→ Validate data types (dates, numbers)
        │       │
        │       ├─→ Build document:
        │       │   ├─→ Form fields
        │       │   ├─→ createdBy: { username, name }
        │       │   ├─→ createdAt: new Date()
        │       │   └─→ status: default or from form
        │       │
        │       ├─→ withHealth(async (db) => {
        │       │       await db.collection('{collection}').insertOne(doc)
        │       │   })
        │       │
        │       └─→ Return JSON:
        │           { ok: true, row: doc }
        │
        └─→ Frontend receives response
            │
            ├─→ If success:
            │   ├─→ Close modal (modal.classList.remove('open'))
            │   ├─→ Reload data (load())
            │   ├─→ Refresh summary (refreshSummary())
            │   └─→ Clear form message
            │
            └─→ If error:
                └─→ Show error message in modal
```

### 5️⃣ **Summary Statistics Flow**

```
Page Load / After Data Changes
    │
    └─→ refreshSummary()
        │
        ├─→ GET /api/health/summary
        │   │
        │   └─→ Backend (routes/health.js)
        │       │
        │       ├─→ Check user role (admin vs regular)
        │       ├─→ Determine filter (all records vs user's records)
        │       │
        │       ├─→ Count from multiple collections:
        │       │   ├─→ health_patient_records → Total
        │       │   ├─→ health_patient_data → Status counts
        │       │   ├─→ health_schedules → Scheduled/Completed
        │       │   ├─→ health_family_planning → Active
        │       │   ├─→ health_child_immunization → Active
        │       │   └─→ health_individual_treatment → Active
        │       │
        │       └─→ Return JSON:
        │           {
        │             ok: true,
        │             summary: {
        │               Total: 50,
        │               Active: 12,
        │               Scheduled: 8,
        │               Completed: 25,
        │               Pending: 5,
        │               Overdue: 2
        │             }
        │           }
        │
        └─→ Frontend receives response
            │
            └─→ setSummary(summary)
                ├─→ Update #sTotal
                ├─→ Update #sActive
                ├─→ Update #sScheduled
                ├─→ Update #sCompleted
                └─→ Update #sOverdue
```

### 6️⃣ **Calendar Flow**

```
Page Load / Month Navigation
    │
    └─→ refreshCalendar()
        │
        ├─→ GET /api/health/calendar?year=2025&month=11
        │   │
        │   └─→ Backend (routes/health.js)
        │       │
        │       ├─→ Parse year & month
        │       ├─→ Calculate date range (start of month to end of month)
        │       ├─→ Query health_schedules:
        │       │   └─→ preferredDate within range
        │       │
        │       └─→ Return JSON:
        │           {
        │             ok: true,
        │             items: [
        │               { type: 'prenatal', preferredDate: '...', ... },
        │               { type: 'infant', preferredDate: '...', ... }
        │             ]
        │           }
        │
        └─→ Frontend receives response
            │
            ├─→ Group items by day
            ├─→ Render calendar grid
            ├─→ Add event indicators (dots with counts)
            └─→ Highlight today
```

---

## 📊 Database Collections Structure

### Collection: `health_patient_records`
**Purpose:** Master patient list (used for "Total Patients" count)
- Fields: surname, givenName, age, gender, barangay, contactNumber, status, cvdStatus, ncdStatus, chronicConditions
- Endpoint: `/api/health/patient-records`

### Collection: `health_patient_data`
**Purpose:** Program-level health events
- Fields: coordinator, program, type, location, dateTime, status
- Endpoint: `/api/health/patient-data`

### Collection: `health_schedules`
**Purpose:** Health appointment schedules
- Fields: type, preferredDate, preferredTime, residentUsername, residentName, status, notes
- Endpoint: `/api/health/schedules`
- Special: Has calendar endpoint `/api/health/calendar`

### Collection: `health_family_planning`
**Purpose:** Family planning records
- Fields: lastName, givenName, age, address, clientType, fpMethod
- Endpoint: `/api/health/family-planning`

### Collection: `health_post_partum`
**Purpose:** Post-partum tracking
- Fields: motherName, address, deliveryDateTime, gender, weight, tetanusStatus, details30Min
- Special Logic: Hidden for male patients
- Endpoint: `/api/health/post-partum`

### Collection: `health_child_immunization`
**Purpose:** Child vaccination records
- Fields: childName, birthday, age, bcgDate, hepBBirthDate, pentavalent1Date, opv1Date, mmr1Date
- Endpoint: `/api/health/child-immunization`

### Collection: `health_individual_treatment`
**Purpose:** Individual treatment/consultation records
- Fields: patientName, consultationDate, age, address, historyOfIllness, assessment, treatmentPlan, status
- Endpoint: `/api/health/individual-treatment`

### Collection: `health_pregnancy_tracking`
**Purpose:** Pregnancy master listing
- Fields: name, age, completeAddress, lmp, edd, prenatalConsultation, healthFacility
- Endpoint: `/api/health/pregnancy-tracking`

### Collection: `health_prenatal_visits`
**Purpose:** Pre-natal visit records
- Fields: patientName, age, address, visitDate, trimester, midwifeName, bloodPressure
- Endpoint: `/api/health/prenatal`

### Collection: `health_medicines`
**Purpose:** Medicine inventory
- Fields: name, category, stock, minStock, maxStock, unit
- Endpoint: `/api/health/medicines`

### Collection: `health_midwives`
**Purpose:** Midwife/kumadrona directory
- Fields: name, contactNumber, details
- Endpoint: `/api/health/midwives`

---

## 🔐 Security & Authorization

### Authentication Flow
```
Every API Request
    │
    └─→ requireAuth middleware
        │
        ├─→ Check req.session.user
        │   ├─→ If missing → 401 Unauthorized (JSON for API, redirect for pages)
        │   └─→ If present → Continue
        │
        └─→ For admin-only endpoints:
            └─→ requireAdmin middleware
                ├─→ Check user.role === 'admin'
                └─→ If not admin → 403 Forbidden
```

### Data Filtering
- **Admins:** See all records (no filter applied)
- **Regular Users:** See only their own records
  - Filter: `{ 'createdBy.username': user.username.toLowerCase() }`
  - Exception: Schedules use `{ residentUsername: user.username.toLowerCase() }`

---

## 🎨 UI Components Flow

### Tab System
- **11 Tabs** defined in `tabConfigs` object
- Each tab has: title, headers, apiEndpoint
- Active tab highlighted with green border
- Tab click → `switchTab()` → `load()` → `updateFormContent()`

### Modal System
- Uses `.open` class (not `flex`/`hidden`)
- Form content generated dynamically per tab
- Special logic per tab (e.g., post-partum gender check)

### Table System
- Headers: Defined in `tabConfigs[tabName].headers`
- Rows: Rendered by `renderRows()` with tab-specific cell generation
- Actions: View, Edit, Delete buttons (permission-based)

### Summary Cards
- 5 cards: Total, Active, Scheduled, Completed, Overdue
- Updated via `refreshSummary()` after data changes

### Calendar
- Shows schedules grouped by day
- Color-coded dots for different schedule types
- Navigate months with Prev/Next buttons

---

## 🔄 State Management

### Frontend State (`state` object)
```javascript
{
  page: 1,        // Current page number
  limit: 10,      // Records per page
  status: '',     // Status filter
  q: '',          // Search query
  from: '',       // Date range start
  to: '',         // Date range end
  sort: 'desc'    // Sort order
}
```

### Global Variables
- `user`: Current logged-in user object
- `currentTab`: Active tab name
- `isAdmin`: Boolean for admin status
- `isLoading`: Flag to prevent duplicate requests
- `summaryLoading`: Flag to prevent duplicate summary requests

---

## 📝 Key Functions Reference

### Frontend Functions
- `initUser()`: Authenticate and load user data
- `switchTab(tabName)`: Switch between tabs
- `load()`: Fetch and display data for current tab
- `renderRows(rows)`: Generate table rows
- `renderPager()`: Generate pagination controls
- `updateFormContent()`: Generate form HTML
- `refreshSummary()`: Update summary statistics
- `refreshCalendar()`: Update calendar view

### Backend Functions
- `ensureHealthCollections()`: Create collections and indexes
- `listCollection()`: Generic handler for listing records
- `parsePaging()`: Parse pagination parameters
- `buildDateRangeQuery()`: Build date filter
- `buildSearchQuery()`: Build search filter
- `withHealth()`: Database operation wrapper

---

## 🚀 Common User Flows

### Flow 1: Viewing Records
1. User opens Health & Social Services page
2. Default tab "Patient Data" loads automatically
3. Data fetched from `/api/health/patient-data`
4. Table displays records with pagination
5. User can switch tabs to see different record types

### Flow 2: Adding a New Record
1. User clicks "+ Add New Record"
2. Modal opens with form for current tab
3. User fills required fields
4. User clicks "Save Record"
5. Data sent to POST endpoint
6. Modal closes, table refreshes, summary updates

### Flow 3: Filtering Records
1. User enters search term, selects dates, or chooses status
2. User clicks "Apply Filter"
3. `load()` called with new filter parameters
4. Table updates with filtered results

### Flow 4: Viewing Calendar
1. Calendar loads on page initialization
2. Shows schedules for current month
3. User clicks Prev/Next to navigate months
4. Calendar updates with new month's schedules

---

## 🐛 Debugging Tips

### Check Browser Console
- Look for `[tab-name] Loaded X rows` messages
- Check for `Summary updated:` logs
- Watch for JavaScript errors

### Check Server Console
- Look for `[health] summary` debug logs
- Check for database query errors
- Verify authentication status

### Check Network Tab
- Verify API requests are being made
- Check response status codes
- Inspect response data

---

## 📌 Important Notes

1. **Total Patients** counts from `health_patient_records` collection only
2. **Schedules** have a special calendar endpoint
3. **Post-partum** form is hidden for male patients
4. **Non-admins** can only see/edit their own records
5. **All collections** are auto-created on first use
6. **Indexes** are created automatically for performance

