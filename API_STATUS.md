# 🔌 API Status & Requirements

## ✅ Currently Available APIs (29 Endpoints)

### **Authentication (2 APIs)**
- ✅ `MGetCompanyLists` - Get list of available companies
- ✅ `MCheckLogin` - User authentication

### **Master Data (8 APIs)**
- ✅ `GetActiveBusMasters` - Get all active vehicles
- ✅ `GetJobTypes` - Get job type masters
- ✅ `GetSupervisors` - Get supervisor list
- ✅ `GetDrivers` - Get driver list
- ✅ `GetMechanics` - Get mechanic list
- ✅ `GetFaultDetails` - Get fault details with descriptions
- ✅ `GetRoutes` - Get route masters
- ✅ `GetStopsByRoute` - Get stops for a specific route

### **Driver Complaints (3 APIs)**
- ✅ `CreateDriverComplaint` - Submit new driver complaint
- ✅ `GetDriverComplaints` - Get list of all complaints
- ✅ `GetDriverComplaintDetail` - Get detailed complaint info

### **Line Breakdowns (3 APIs)**
- ✅ `CreateLineBreakdown` - Report line breakdown
- ✅ `GetLineBreakdowns` - Get list of all breakdowns
- ✅ `GetLineBreakdownDetail` - Get detailed breakdown info

### **Job Cards (4 APIs)**
- ✅ `CreateJobCard` - Create job card from complaint
- ✅ `GetJobCards` - Get list of job cards
- ✅ `GetJobCardDetail` - Get detailed job card info
- ✅ `GetSpareParts` - Get spare parts catalog

### **Fuel Management (2 APIs)**
- ✅ `CreateFuelLog` - Log fuel entry
- ✅ `GetFuelLogs` - Get fuel history

### **Preventive Maintenance (2 APIs)**
- ✅ `CreateSchedule` - Schedule preventive maintenance
- ✅ `GetScheduledServices` - Get scheduled services

### **Dashboard & Analytics (5 APIs)**
- ✅ `GetDashboardStatus` - Get dashboard statistics (complaints, breakdowns counts)
- ✅ `GetDashboardStats` - Additional dashboard statistics
- ✅ `GetInspections` - Get inspection data
- ✅ `GetWorkOrders` - Get work orders
- ✅ `GetNotifications` - Get user notifications

---

## 📋 Recommended Additional APIs

These APIs would greatly enhance the workflow and user experience:

### **🔴 High Priority - Workflow Critical**

#### **1. Job Card Workflow**
```
PUT UpdateJobCardStatus
- CompanyDB: string
- DocEntry: string
- Status: 'O' | 'I' | 'CM'
- UpdatedBy: string
- Timestamp: datetime
```
**Purpose**: Update job card status as mechanic progresses work

```
POST AssignMechanic
- CompanyDB: string
- JobCardDocEntry: string
- MechanicCode: string
- MechanicName: string
- AssignedBy: string
- Timestamp: datetime
```
**Purpose**: Assign mechanic to job card (supervisor function)

```
POST AddJobCardProgress
- CompanyDB: string
- JobCardDocEntry: string
- Notes: string
- MechanicCode: string
- Timestamp: datetime
- PartsUsed: array (optional)
```
**Purpose**: Mechanic adds work progress notes

```
POST CompleteJobCard
- CompanyDB: string
- JobCardDocEntry: string
- CompletionNotes: string
- LaborHours: number
- TotalCost: number
- PartsUsed: array
- CompletedBy: string
- Timestamp: datetime
```
**Purpose**: Mark job card as complete with final details

#### **2. Complaint Status Management**
```
PUT UpdateComplaintStatus
- CompanyDB: string
- DocEntry: string
- Status: 'O' | 'I' | 'CM' | 'D'
- Reason: string (for declined)
- UpdatedBy: string
```
**Purpose**: Supervisor can update complaint status

```
POST DeclineComplaint
- CompanyDB: string
- DocEntry: string
- Reason: string
- DeclinedBy: string
```
**Purpose**: Supervisor can decline invalid complaints

#### **3. Notifications**
```
POST MarkNotificationAsRead
- NotificationId: string
- UserId: string
```
**Purpose**: Mark notification as read

```
POST MarkAllNotificationsAsRead
- UserId: string
- CompanyDB: string
```
**Purpose**: Mark all notifications as read

---

### **🟠 Medium Priority - Enhanced Functionality**

#### **4. Supervisor Approval Workflow**
```
POST ApproveComplaint
- CompanyDB: string
- ComplaintDocEntry: string
- ApprovedBy: string
- Priority: 'Low' | 'Medium' | 'High' | 'Critical'
```
**Purpose**: Supervisor reviews and approves complaints before job card creation

```
GET GetPendingApprovals
- CompanyDB: string
- SupervisorCode: string
```
**Purpose**: Get complaints pending supervisor approval

#### **5. Mechanic Work Management**
```
GET GetMechanicWorkload
- CompanyDB: string
- MechanicCode: string
```
**Purpose**: Get current workload for mechanic (for assignment balancing)

```
GET GetMyJobCards
- CompanyDB: string
- MechanicCode: string
- Status: 'O' | 'I' | 'CM' (optional)
```
**Purpose**: Mechanic sees only their assigned job cards

#### **6. Enhanced Analytics**
```
GET GetFleetPerformance
- CompanyDB: string
- FromDate: date
- ToDate: date
```
**Response**: 
```json
{
  "TotalVehicles": 150,
  "ActiveVehicles": 145,
  "UnderMaintenance": 5,
  "AvgUptime": 95.5,
  "AvgRepairTime": 4.2
}
```

```
GET GetCostAnalysis
- CompanyDB: string
- Period: 'monthly' | 'quarterly' | 'yearly'
```
**Response**:
```json
{
  "FuelCost": 450000,
  "MaintenanceCost": 280000,
  "SparepartsCost": 120000,
  "TotalCost": 850000
}
```

```
GET GetFuelAnalytics
- CompanyDB: string
- VehicleNumber: string
- FromDate: date
- ToDate: date
```
**Response**:
```json
{
  "AverageConsumption": 6.5,
  "TotalFuelUsed": 1250,
  "TotalCost": 100000,
  "TrendAnalysis": "Increasing"
}
```

#### **7. Preventive Maintenance**
```
GET GetUpcomingMaintenance
- CompanyDB: string
- DaysAhead: number (default 30)
```
**Purpose**: Get vehicles due for preventive maintenance

```
POST CompleteScheduledService
- CompanyDB: string
- ScheduleId: string
- CompletedBy: string
- Notes: string
- NextServiceDate: date
```
**Purpose**: Mark scheduled service as completed

---

### **🟢 Low Priority - Nice to Have**

#### **8. Photo Attachments**
```
POST UploadComplaintPhoto
- CompanyDB: string
- ComplaintDocEntry: string
- Photo: base64 or multipart file
- Description: string
```
**Purpose**: Driver attaches photos of issue

```
GET GetComplaintPhotos
- CompanyDB: string
- ComplaintDocEntry: string
```
**Purpose**: Retrieve photos for a complaint

#### **9. User Management**
```
POST ChangePassword
- UserId: string
- OldPassword: string
- NewPassword: string
```

```
POST ResetPassword
- Email: string
```

```
GET GetUserProfile
- UserId: string
- CompanyDB: string
```

#### **10. Reports**
```
GET GenerateComplaintReport
- CompanyDB: string
- FromDate: date
- ToDate: date
- Status: string (optional)
- Format: 'PDF' | 'EXCEL'
```

```
GET GenerateJobCardReport
- CompanyDB: string
- FromDate: date
- ToDate: date
- MechanicCode: string (optional)
- Format: 'PDF' | 'EXCEL'
```

---

## 🔧 Current Workarounds (Using Dummy Data)

These features are currently implemented with fallback/dummy data:

### **1. Mechanic List** (`GetMechanics`)
- ✅ API exists but using fallback if it fails
- Fallback data: 4 dummy mechanics

### **2. Status Updates**
- ⚠️ No API - Updates stored locally only
- **Needed**: `UpdateComplaintStatus`, `UpdateJobCardStatus`

### **3. Mechanic Assignment**
- ⚠️ No API - Stored in job card creation only
- **Needed**: `AssignMechanic` endpoint

### **4. Work Progress Tracking**
- ⚠️ No API - Not yet implemented
- **Needed**: `AddJobCardProgress`, `GetJobCardProgress`

### **5. Notifications**
- ⚠️ `GetNotifications` exists but `MarkAsRead` missing
- **Needed**: `MarkNotificationAsRead`

---

## 📊 API Priority Matrix

### **Immediate (Sprint 1)**
1. ✅ `UpdateJobCardStatus` - Critical for workflow
2. ✅ `AssignMechanic` - Required for supervisor role
3. ✅ `UpdateComplaintStatus` - Status management
4. ✅ `MarkNotificationAsRead` - User experience

### **Short Term (Sprint 2)**
5. ✅ `AddJobCardProgress` - Work tracking
6. ✅ `CompleteJobCard` - Completion workflow
7. ✅ `GetMechanicWorkload` - Smart assignment
8. ✅ `GetMyJobCards` - Mechanic view

### **Medium Term (Sprint 3)**
9. ✅ `ApproveComplaint` - Approval workflow
10. ✅ `GetPendingApprovals` - Supervisor dashboard
11. ✅ `GetFleetPerformance` - Analytics
12. ✅ `GetUpcomingMaintenance` - Preventive care

### **Future**
- Photo attachments
- PDF reports
- Advanced analytics
- User management

---

## 💡 Backend Developer Request Template

You can copy this to your backend developer:

```
Hi [Backend Developer],

For the Fleet Management mobile app, we need the following API endpoints to complete the workflow:

HIGH PRIORITY:
1. UpdateJobCardStatus - Update job card status (O/I/CM)
   - Input: CompanyDB, DocEntry, Status, UpdatedBy
   - Output: Success/Error

2. AssignMechanic - Assign mechanic to job card
   - Input: CompanyDB, JobCardDocEntry, MechanicCode, AssignedBy
   - Output: Success/Error

3. MarkNotificationAsRead - Mark notification as read
   - Input: NotificationId, UserId
   - Output: Success/Error

4. UpdateComplaintStatus - Update complaint status
   - Input: CompanyDB, DocEntry, Status, UpdatedBy
   - Output: Success/Error

MEDIUM PRIORITY:
5. AddJobCardProgress - Add work progress notes
   - Input: CompanyDB, JobCardDocEntry, Notes, MechanicCode, Timestamp
   - Output: Success/Error

6. GetMechanicWorkload - Get mechanic's current workload
   - Input: CompanyDB, MechanicCode
   - Output: { OpenJobCards: 3, InProgressJobCards: 2, EstimatedHours: 12 }

Can you provide these APIs in the same format as existing endpoints?
Let me know expected delivery timeline.

Thanks!
```

---

## 📱 Current App Status

### **Fully Functional (With Existing APIs)**
- ✅ User authentication & company selection
- ✅ Dashboard with real-time statistics
- ✅ Create driver complaints
- ✅ Create line breakdowns
- ✅ Create job cards from complaints
- ✅ View complaints list with filters
- ✅ View job cards list
- ✅ Fuel log entry
- ✅ Preventive maintenance scheduling
- ✅ SAP Fiori professional UI
- ✅ Dark/light theme
- ✅ Master data caching

### **Partially Functional (Needs APIs)**
- ⚠️ Job card status updates (local only)
- ⚠️ Mechanic assignment (creation only)
- ⚠️ Complaint status updates (local only)
- ⚠️ Notifications (read-only)

### **Not Yet Implemented (Needs APIs + UI)**
- ❌ Job card detail screen with progress
- ❌ Complaint detail screen with full info
- ❌ Mechanic work progress tracking
- ❌ Supervisor approval workflow
- ❌ Analytics dashboards
- ❌ Photo attachments

---

## 🎯 Next Steps

1. **Share this document** with your backend developer
2. **Prioritize APIs** based on your business needs
3. **Test new APIs** as they become available (I've added fallback handling)
4. **Build remaining screens** once workflow APIs are ready

The app architecture is now ready to seamlessly integrate new APIs as they become available. All services have proper error handling and fallback mechanisms.

---

**Document Version**: 1.0  
**Date**: February 22, 2026  
**Status**: Production-Ready Architecture, Awaiting Additional APIs
