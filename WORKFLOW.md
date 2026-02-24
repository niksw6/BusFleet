# 🔄 FLEET MANAGEMENT WORKFLOW

## Complete Workflow Implementation (HeavyVehicleInspection Style)

This document outlines the complete workflow implemented in the FleetDataApp, following industry best practices from HeavyVehicleInspection.com.

---

## 📊 WORKFLOW OVERVIEW

```
Driver → Supervisor → Technician → Close
```

---

## 1️⃣ DRIVER SIDE WORKFLOW

### Step 1: Driver Logs In
- **Role:** DRIVER
- **Screen:** LoginScreen
- **Action:** Driver enters credentials and logs into the system

### Step 2: Driver Submits Report
- **Screen:** CreateIssueScreen (or DashboardScreen → Quick Actions)
- **Report Types:**
  - 🔧 **Complaint** - General vehicle complaints
  - 🚨 **Breakdown** - Emergency breakdowns requiring immediate attention
  - 🔍 **Preventive Maintenance** - Scheduled maintenance checks

**Driver Fills:**
- Vehicle Number (Bus #)
- Issue Type / Fault Category
- Description
- Photo (optional)
- Priority (Low, Medium, High, Critical)
- Location (for breakdowns)
- Route Number (for breakdowns)
- Odometer Reading

**On Submit:**
- ✅ Report Status = `OPEN`
- 🔔 Notification sent to Supervisor
- 📝 Logged in system with timestamp
- 🆔 Generates unique Complaint/Breakdown Number

---

## 2️⃣ SUPERVISOR WORKFLOW

### Step 3: Supervisor Dashboard
**Screen:** ComplaintsScreen / WorkOrdersDashboardScreen

**Supervisor Sees:**
- **KPI Cards:**
  - Total Work Orders
  - Medium Priority Work Orders
  - High Priority Work Orders
  - Critical Work Orders
  - Overdue Work Orders
  - Total Cost
  
- **Filters:**
  - By Vehicle
  - By Priority (Low, Medium, High, Critical)
  - By Type (Complaint, Breakdown, PM)
  - By Status (Open, In Progress, Completed, Archive)
  
- **Status Badges:** Visual indicators for each report status

**Table Columns:**
- Action (View/Edit button)
- WO Number
- Created Date
- Vehicle
- Due Date / Completed Date
- Status
- Priority
- Assigned Technician
- Memo

**Actions:**
- [View] - View detailed report
- [Create Job Card] - Convert report to work order

### Step 4: Supervisor Opens Report
**Screen:** ComplaintDetailScreen

**Supervisor Reviews:**
- Full description
- Photos/attachments
- Driver information
- Vehicle history
- Current status

**Options:**
1. **Ignore / Close** - If report is false or duplicate
2. **Create Job Card** - Assign work to technician

### Step 5: Create Job Card (Work Order)
**Screen:** CreateJobCardScreen

**Supervisor Fills:**
- **Assign To:** Select technician from list
- **Work Description:** Detailed instructions
- **Estimated Time:** Expected hours to complete
- **Parts Required:** (optional) Pre-select parts needed
- **Priority:** Low, Medium, High, Critical
- **Due Date:** When work should be completed
- **Estimated Cost:** Budget for the work

**On Save:**
- ✅ Job Card Created
- 📊 Report Status → `JOB_CREATED`
- 🎫 Job Status → `PENDING`
- 🔔 Assigned technician notified
- 🔗 Job Card linked to original complaint

---

## 3️⃣ TECHNICIAN WORKFLOW

### Step 6: Technician Dashboard
**Screen:** JobCardsScreen

**Technician Sees:**
- **Assigned Jobs:**
  - Job Card Number
  - Vehicle
  - Complaint Type
  - Priority
  - Status
  - Due Date
  
- **Status Filters:**
  - Pending
  - In Progress
  - Completed
  - On Hold
  - Need Parts

### Step 7: Technician Starts Work
**Screen:** WorkOrderDetailScreen (with tabs)

**Tabs Available:**
1. **WO Details** - Work order information
2. **Task Details** - Individual tasks checklist
3. **Parts Details** - Parts used
4. **Labor Details** - Time tracking
5. **Remark & Attachments** - Notes and photos
6. **Cost** - Cost breakdown

**Actions:**
- Click **Start Job**
- Job Status → `IN_PROGRESS`
- Record start time automatically

**Optional During Work:**
- Add remark/notes
- Upload photos
- Add parts used (scan or manual entry)
- Log labor hours
- Add tasks completed

### Step 8: Technician Completes Job
**Screen:** WorkOrderScreen or WorkOrderDetailScreen

**Actions:**
- Click **Mark as Completed**
- Job Status → `COMPLETED`

**System Automatically:**
- Report Status → `CLOSED`
- Completion time saved
- Final cost calculated
- Supervisor notified

---

## 4️⃣ PREVENTIVE MAINTENANCE WORKFLOW

### Option A – Manual PM
- Driver OR Supervisor creates PM report manually
- Follow standard workflow (Steps 1-3)

### Option B – Automatic PM (Recommended)
**System Auto-Check:**
```javascript
// Daily system check
if (vehicle.next_service_date <= today) {
  → Auto create report:
    Type = PREVENTIVE_MAINTENANCE
    Status = OPEN
    Priority = Based on PM type
  → Notify Supervisor
}
```

**Supervisor handles** same as normal complaint (Steps 3-5)

---

## 5️⃣ STATUS FLOW

### Report Status Flow
```
OPEN
  ↓
JOB_CREATED (when supervisor creates job card)
  ↓
CLOSED (when technician completes job)
```

### Job Card Status Flow
```
PENDING (newly assigned)
  ↓
IN_PROGRESS (technician started work)
  ↓
COMPLETED (work finished)
```

### Optional Status States
- `CANCELLED` - Job cancelled by supervisor
- `ON_HOLD` - Waiting for parts/approval
- `NEED_PARTS` - Parts not available

---

## 6️⃣ NOTIFICATION FLOW

| Action | Notify |
|--------|--------|
| Driver submits report | → Supervisor |
| Supervisor creates job | → Assigned Technician |
| Job status changed | → Supervisor |
| Technician completes job | → Supervisor & Driver |
| Job on hold | → Supervisor |
| Job overdue | → Supervisor & Technician |

---

## 7️⃣ REAL WORLD LOGIC

### Professional System Features ✓
- [x] Every action is logged with timestamp
- [x] Status history maintained
- [x] Cannot edit completed jobs without permission
- [x] Role-based access control (Driver, Supervisor, Technician)
- [x] Dashboard counts (Open Reports, Active Jobs, Overdue)
- [x] Vehicle-wise history tracking
- [x] KPI dashboards for management
- [x] Cost tracking (estimated vs actual)
- [x] Parts inventory tracking
- [x] Labor time tracking
- [x] Attachments/photos support

---

## 8️⃣ CLEAN UI STRUCTURE

### Sidebar/Tab Menu

**Driver:**
- 🏠 Dashboard
- ➕ Create Report
- 📋 My Reports
- 📊 Notifications
- 👤 Profile

**Supervisor:**
- 🏠 Dashboard
- 📊 Work Orders Dashboard (NEW - HVI style)
- 📋 Reports (All complaints/breakdowns)
- 🎫 Job Cards (All work orders)
- 🚌 Vehicles
- 👥 Users
- 📈 Analytics

**Technician:**
- 🏠 Dashboard
- 🔧 My Jobs (Assigned work orders)
- ✅ Completed Jobs
- 📊 My Performance
- 👤 Profile

---

## 9️⃣ PROFESSIONAL ADD-ONS (Optional - Future)

### Advanced Features
- [ ] **Escalation Rules** - Escalate if job not started in X hours
- [ ] **SLA Tracking** - Service Level Agreement monitoring
- [ ] **Job Rejection** - Technician can reject with reason
- [ ] **Parts Inventory Deduction** - Auto-deduct parts used
- [ ] **Vehicle Downtime Calculation** - Track vehicle availability
- [ ] **Cost Variance Analysis** - Estimated vs Actual cost tracking
- [ ] **Technician Performance Metrics** - Completion rate, time efficiency
- [ ] **Preventive Maintenance Calendar** - Auto scheduling based on mileage/date
- [ ] **Multi-approval Workflow** - Manager approval for high-cost jobs
- [ ] **Mobile Signature Capture** - Sign-off on completed work

---

## 🔥 FINAL SUMMARY WORKFLOW

```
1. Driver submits issue (Complaint/Breakdown/PM)
          ↓
2. Supervisor reviews on dashboard
          ↓
3. Supervisor creates job card + assigns technician
          ↓
4. Technician receives notification
          ↓
5. Technician starts work (status: IN PROGRESS)
          ↓
6. Technician logs work (parts, labor, notes, photos)
          ↓
7. Technician completes (status: COMPLETED)
          ↓
8. System closes report (status: CLOSED)
          ↓
9. All stakeholders notified
```

---

## 📱 NEW SCREENS ADDED

### 1. WorkOrdersDashboardScreen
- **Path:** `src/features/jobCards/screens/WorkOrdersDashboardScreen.js`
- **Purpose:** HVI-style work orders dashboard with KPI cards
- **Features:**
  - 6 KPI cards (Total, Medium Priority, High Priority, Critical, Overdue, Total Cost)
  - Tabs (Open, Completed, Archive)
  - Search and filter
  - Table view with sortable columns
  - Export functionality

### 2. WorkOrderDetailScreen
- **Path:** `src/features/jobCards/screens/WorkOrderDetailScreen.js`
- **Purpose:** Comprehensive work order detail view with tabs
- **Tabs:**
  1. **WO Details** - Basic work order information
  2. **Task Details** - Task checklist management
  3. **Parts Details** - Parts and materials used
  4. **Labor Details** - Labor hours tracking
  5. **Remark & Attachments** - Notes and photos
  6. **Cost** - Cost breakdown and analysis

### 3. KPICard Component
- **Path:** `src/shared/components/KPICard.js`
- **Purpose:** Reusable KPI card component for dashboards
- **Features:**
  - Icon with custom color
  - Title, value, and subtitle
  - Optional onPress action
  - Shadow and elevation
  - Dark mode support

---

## 🚀 NAVIGATION ROUTES

```javascript
// Work Orders Dashboard (NEW)
navigation.navigate('WorkOrdersDashboard')

// Work Order Detail (NEW)
navigation.navigate('WorkOrderDetail', {
  jobCardNo: 'JC001',
  complaintNo: 'C001',
  dbName: 'MUTSPL_TEST'
})

// Existing Routes
navigation.navigate('CreateIssue', { type: 'complaint' })
navigation.navigate('ComplaintDetail', { complaintNo: 'C001' })
navigation.navigate('CreateJobCard', { complaintNo: 'C001', busNo: '101' })
navigation.navigate('JobCards')
navigation.navigate('WorkOrder', { jobCardNo: 'JC001' })
```

---

## 🎨 UI/UX IMPROVEMENTS

### HVI-Style Dashboard
- Professional KPI cards with icons
- Color-coded priority levels
- Status badges for quick identification
- Table view with sortable columns
- Tab-based filtering (Open, Completed, Archive)
- Search functionality
- Export options

### Work Order Detail
- Tab-based navigation for different sections
- Form-based data entry
- Table views for tasks and parts
- Cost calculation and breakdown
- Attachment support
- Read-only mode for completed orders

### Color Scheme (SAP Fiori)
- Primary Blue: `#0070F2`
- Success Green: `#2B7D2B`
- Warning Orange: `#FF9500`
- Danger Red: `#BB0000`
- Critical Pink: `#E91E63`
- Info Cyan: `#17A2B8`

---

## 📊 API ENDPOINTS USED

### Dashboard APIs
- `GET /api/job-cards` - Get all work orders
- `GET /api/dashboard/status` - Get dashboard statistics

### Job Card APIs
- `GET /api/job-card/detail/:id` - Get work order details
- `POST /api/job-card/create` - Create new job card
- `PUT /api/job-card/update` - Update job card status
- `POST /api/job-card/complete` - Mark job as completed

### Complaint APIs
- `GET /api/complaints` - Get all complaints
- `GET /api/breakdowns` - Get all breakdowns
- `POST /api/complaint/create` - Create new complaint
- `PUT /api/complaint/update-status` - Update complaint status

---

## 🧪 TESTING CHECKLIST

### Driver Workflow
- [ ] Driver can login
- [ ] Driver can create complaint
- [ ] Driver can create breakdown report
- [ ] Driver can create PM report
- [ ] Driver can view their reports
- [ ] Driver receives notification when job is completed

### Supervisor Workflow
- [ ] Supervisor sees all reports on dashboard
- [ ] Supervisor can filter by status, priority, vehicle
- [ ] Supervisor can view report details
- [ ] Supervisor can create job card from report
- [ ] Supervisor can assign technician
- [ ] Supervisor can set priority and due date
- [ ] Supervisor receives notifications

### Technician Workflow
- [ ] Technician sees assigned jobs
- [ ] Technician can filter by status
- [ ] Technician can view work order details
- [ ] Technician can start job (status → IN PROGRESS)
- [ ] Technician can add parts used
- [ ] Technician can log labor hours
- [ ] Technician can add notes/photos
- [ ] Technician can complete job (status → COMPLETED)
- [ ] Report auto-closes when job completed

### Status Flow
- [ ] Report status: OPEN → JOB_CREATED → CLOSED
- [ ] Job status: PENDING → IN_PROGRESS → COMPLETED
- [ ] Status history is maintained
- [ ] Cannot edit completed jobs without permission

### Notifications
- [ ] Driver submit → Supervisor notified
- [ ] Job created → Technician notified
- [ ] Job completed → Supervisor & Driver notified
- [ ] Status changes trigger appropriate notifications

---

## 📚 ADDITIONAL RESOURCES

- **API_STATUS.md** - Complete API documentation
- **ARCHITECTURE.md** - System architecture guide
- **README.md** - Project setup and installation
- **PROJECT_SUMMARY.md** - Project overview

---

**Last Updated:** February 22, 2026
**Version:** 2.0.0 (HVI-Style Implementation)
