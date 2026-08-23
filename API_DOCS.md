# API Endpoints Documentation

## Base URL
```
http://116.202.223.120:6069/BMSSystem/
```

---

## Authentication

### Get Company Lists
**Endpoint:** `MGetCompanyLists`  
**Method:** `GET`  
**Description:** Fetch list of available companies

**Response:**
```json
[
  {
    "CompanyDatabaseName": "MUTSPL"
  },
  {
    "CompanyDatabaseName": "MUTSPL_TEST"
  }
]
```

---

### Login
**Endpoint:** `MCheckLogin`  
**Method:** `POST`  
**Description:** Authenticate user

**Request Body:**
```json
{
  "DBName": "MUTSPL",
  "User": "username",
  "Password": "password"
}
```

**Success Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "name": "John Doe",
    "username": "john",
    "email": "john@example.com",
    "role": "Driver"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

## Driver Complaints

### Create Complaint
**Endpoint:** `CreateDriverComplaint`  
**Method:** `POST`  
**Headers:** `Content-Type: application/json`, `Cookie: ASP.NET_SessionId`

**Request Body:**
```json
{
  "CompanyDB": "MUTSPL_TEST",
  "JobType": "Mechanical",
  "Supervisr": "SUP001",
  "SprvsrNm": "John Mathew",
  "Depot": "Central Depot",
  "RegNo": "KL-07-AB-1234",
  "DrvCode": "DRV1001",
  "DrvName": "Rajesh Kumar",
  "Odometr": "125600",
  "RegDate": "2026-02-11",
  "RegTime": "2026-02-11T09:30:00",
  "Dscrpton": "Engine overheating issue observed.",
  "Status": "O",
  "Priority": "High",
  "Faults": [
    {
      "Fault": "Radiator Leakage",
      "Dscption": "Coolant dripping from bottom section"
    },
    {
      "Fault": "Fan Not Working",
      "Dscption": "Cooling fan not rotating"
    }
  ]
}
```

**Field Descriptions:**
- `CompanyDB`: Database name (from login)
- `JobType`: Type of job (e.g., "Mechanical")
- `Supervisr`: Supervisor code
- `SprvsrNm`: Supervisor name
- `Depot`: Depot name
- `RegNo`: Vehicle registration number (no spaces)
- `DrvCode`: Driver code
- `DrvName`: Driver name
- `Odometr`: Odometer reading (string)
- `RegDate`: Registration date (YYYY-MM-DD)
- `RegTime`: Registration time (YYYY-MM-DDTHH:mm:ss)
- `Dscrpton`: Description
- `Status`: Status code ("O" = Open)
- `Priority`: Priority level (Low, Medium, High, Critical)
- `Faults`: Array of fault objects with `Fault` and `Dscption`

**Response:**
```json
{
  "Success": true,
  "Message": "Complaint created successfully",
  "Data": 123
}
```

---

### Get Complaints
**Endpoint:** `GetDriverComplaints`  
**Method:** `GET`  
**Headers:** `DBName`, `Authorization`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "vehicleNumber": "MH12AB1234",
      "complaintNumber": "COMP-2026-123",
      "priority": "Medium",
      "status": "Pending",
      "description": "Engine issue",
      "complaintDate": "2026-02-13",
      "createdAt": "2026-02-13T10:30:00Z"
    }
  ]
}
```

---

## Line Breakdowns

This section documents the mobile Line Breakdown flow and related endpoints used by drivers, supervisors and breakdown teams.

1) Create Incident (Line Breakdown)

### Create Incident
**Endpoint:** `CreateIncidents`  
**Method:** `POST`  
**Headers:** `DBName`, `ASP.NET_SessionId` (cookie stored/returned by first requests)

**Description:** Driver or Supervisor creates the Line Breakdown incident. The payload follows the same shape as other incidents (see CreateDriverComplaint) but should include location/route and breakdown-specific fields.

**Example Request Body:**
```json
{
  "CompanyDB": "YOUR_DB",
  "JobType": "Breakdown",
  "RegNo": "KL-07-AB-1234",
  "DrvCode": "DRV1001",
  "RegDate": "2026-08-17",
  "RegTime": "14:30",
  "Dscrpton": "Vehicle stopped on route, engine stalls",
  "Priority": "High",
  "BreakdownLocation": "Near Main Station",
  "RouteNumber": "101",
  "Faults": [ { "Fault": "Engine", "Dscption": "Stalls intermittently" } ]
}
```

**Response:**
```json
{
  "Success": true,
  "Message": "Incident created successfully",
  "Data": { "DocEntry": 25, "BreakdownNumber": "BRK-2026-025" }
}
```

---

2) Get Breakdown Details

### Get Line Breakdown Detail
**Endpoint:** `GetLineBreakdownDetail`  
**Method:** `GET`  
**Query:** `?CompanyDB={CompanyDB}&DocEntry={DocEntry}`

**Description:** Returns breakdown header and associated faults for the provided DocEntry (incident id).

**Response (example):**
```json
{
  "Success": true,
  "Data": {
    "DocEntry": 25,
    "RegNo": "KL-07-AB-1234",
    "BreakdownLocation": "Near Main Station",
    "Faults": [ { "FaultLine": 1, "Fault": "Engine", "Dscption": "Stalls" } ]
  }
}
```

---

3) Get Available Breakdown Teams

### Get Breakdown Teams
**Endpoint:** `GetBreakdownTeams`  
**Method:** `GET`  
**Query:** `?CompanyDB={CompanyDB}&DocEntry={DocEntry}`

**Description:** Supervisor retrieves available breakdown teams (QBS_BRKTEAM) with fields: Code, Name, Phone, Location, Active, Availability.

**Response (example):**
```json
{
  "Success": true,
  "Data": [ { "Code":"TEAM01","Name":"Team A","Phone":"+91...","Location":"North" } ]
}
```

---

4) Create Line Breakdown Work Entry (Start Work / Assign Team)

### Create Line Breakdown Work Entry
**Endpoint:** `CreateLineBreakdownWorkEntry`  
**Method:** `POST`

**Description:** Called by the team/mechanic to record repairs performed at the breakdown location. `RepairType` = `P` (Permanent) or `T` (Temporary).

**Example Request:**
```json
{
  "CompanyDB": "YOUR_DB",
  "JobCardDocEntry": 25,
  "FaultLine": 1,
  "UserCode": "100",
  "RepairType": "P",
  "FinalRemarks": "",
  "Details": [
    { "WorkCode": "REP001", "WorkDone": "Brake repaired", "OtherDescription": "", "Remarks": "" }
  ]
}
```

**Response:**
```json
{ "Success": true, "Data": { "WorkEntryDocEntry": 15 } }
```

---

5) Complete Line Breakdown Work Entry

### Complete Line Breakdown Work Entry
**Endpoint:** `CompleteLineBreakdownWorkEntry`  
**Method:** `POST`

**Request (example):**
```json
{
  "CompanyDB": "YOUR_DB",
  "WorkEntryDocEntry": 15,
  "FinalRemarks": "Repair completed."
}
```

**Behavior:** The API checks `RepairType` on the work entry:
- If `P` (Permanent): Work entry is completed → Supervisor + Team Leader notified → triggers inspection flow.
- If `T` (Temporary): Work entry is completed → Supervisor notified → bus routed to depot for permanent repair.

**Response:**
```json
{ "Success": true, "Message": "Work entry completed" }
```

---

6) Upload Work Entry Images

### Upload Image
**Endpoint:** `UploadImage`  
**Method:** `POST`

**Then:** `SaveWorkEntryImage` to attach the uploaded image to the work entry (same flow as other work-entry images in the app).

---

7) Verify Line Breakdown Work Entry

### Verify Line Breakdown Work Entry
**Endpoint:** `VerifyLineBreakdownWorkEntry`  
**Method:** `POST`

**Approve Example:**
```json
{
  "CompanyDB": "YOUR_DB",
  "WorkEntryDocEntry": 15,
  "UserCode": "SUPERVISOR01",
  "Status": "SV",
  "Remarks": "Repair verified."
}
```

**Rework Example:**
```json
{
  "CompanyDB": "YOUR_DB",
  "WorkEntryDocEntry": 15,
  "UserCode": "SUPERVISOR01",
  "Status": "RW",
  "Remarks": "Issue still exists."
}
```

**Response:**
```json
{ "Success": true, "Message": "Verification recorded" }
```

---

### Get Breakdowns
**Endpoint:** `GetLineBreakdowns`  
**Method:** `GET`  
**Headers:** `DBName`, `Authorization`

---

## Fuel Logs

### Create Fuel Log
**Endpoint:** `CreateFuelLog`  
**Method:** `POST`  
**Headers:** `DBName`, `Authorization`

**Request Body:**
```json
{
  "vehicleNumber": "MH12AB1234",
  "odometer": 45500,
  "fuelQuantity": 50.5,
  "fuelType": "Diesel",
  "fuelDate": "13/02/2026",
  "fuelTime": "08:00",
  "fuelStation": "Shell Petrol Pump - Kothrud",
  "cost": 4040.0
}
```

**Response:**
```json
{
  "success": true,
  "message": "Fuel log created successfully",
  "data": {
    "id": 789,
    "logNumber": "FUEL-2026-789",
    "averageConsumption": 6.5,
    "previousOdometer": 45000
  }
}
```

---

### Get Fuel Logs
**Endpoint:** `GetFuelLogs`  
**Method:** `GET`  
**Headers:** `DBName`, `Authorization`

**Query Parameters:**
- `vehicleNumber` (optional)
- `fromDate` (optional)
- `toDate` (optional)

---

## Scheduling

### Create Schedule
**Endpoint:** `CreateSchedule`  
**Method:** `POST`  
**Headers:** `DBName`, `Authorization`

**Request Body:**
```json
{
  "vehicleNumber": "MH12AB1234",
  "serviceType": "Battery Check",
  "scheduleType": "KM",
  "intervalKM": 5000,
  "intervalDays": null,
  "nextServiceDate": "20/03/2026",
  "notes": "Regular battery maintenance check"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Schedule created successfully",
  "data": {
    "id": 321,
    "scheduleNumber": "SCH-2026-321",
    "nextServiceKM": 50000,
    "reminderDays": 7
  }
}
```

---

### Get Schedules
**Endpoint:** `GetScheduledServices`  
**Method:** `GET`  
**Headers:** `DBName`, `Authorization`

---

## Dashboard

### Get Dashboard Stats
**Endpoint:** `GetDashboardStats`  
**Method:** `GET`  
**Headers:** `DBName`, `Authorization`

**Response:**
```json
{
  "success": true,
  "data": {
    "inspections": 45,
    "workOrders": 12,
    "complaints": 8,
    "breakdowns": 3,
    "fuelLogs": 156,
    "schedules": 23,
    "totalVehicles": 50,
    "activeVehicles": 47
  }
}
```

---

### Get Inspections
**Endpoint:** `GetInspections`  
**Method:** `GET`  
**Headers:** `DBName`, `Authorization`

---

### Get Work Orders
**Endpoint:** `GetWorkOrders`  
**Method:** `GET`  
**Headers:** `DBName`, `Authorization`

---

## Notifications

### Get Notifications
**Endpoint:** `GetNotifications`  
**Method:** `GET`  
**Headers:** `DBName`, `Authorization`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "complaint",
      "title": "New Complaint Assigned",
      "message": "Vehicle MH12AB1234 reported engine issue",
      "timestamp": "2026-02-13T10:30:00Z",
      "read": false
    },
    {
      "id": 2,
      "type": "breakdown",
      "title": "Breakdown Alert",
      "message": "Vehicle stopped on Route 101",
      "timestamp": "2026-02-13T14:30:00Z",
      "read": false
    }
  ]
}
```

---

### Mark Notification as Read
**Endpoint:** `MarkNotificationAsRead`  
**Method:** `POST`  
**Headers:** `DBName`, `Authorization`

**Request Body:**
```json
{
  "notificationId": 1
}
```

---

## Common Headers

All authenticated endpoints require:

```
Content-Type: application/json
DBName: MUTSPL
Authorization: Bearer {token}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "vehicleNumber": "Vehicle number is required"
  }
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized. Please login again."
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error. Please try again later."
}
```

---

## Date Format

- **Request:** DD/MM/YYYY (e.g., "13/02/2026")
- **Response:** ISO 8601 (e.g., "2026-02-13T10:30:00Z")

---

## Time Format

- **Format:** HH:MM (24-hour)
- **Example:** "14:30"

---

## Status Values

### Complaint Status
- Pending
- In Progress
- Completed
- Cancelled

### Priority Levels
- Low
- Medium
- High
- Critical

---

## Testing Endpoints

Use tools like:
- **Postman:** Import endpoints and test
- **cURL:** Command line testing
- **Insomnia:** REST client

**Example cURL:**
```bash
curl -X POST http://116.202.223.120:6069/BMSSystem/MCheckLogin \
  -H "Content-Type: application/json" \
  -d '{"DBName":"MUTSPL","User":"test","Password":"test123"}'
```

---

**Note:** Replace placeholder values with actual data when testing.
