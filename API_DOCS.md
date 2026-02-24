# API Endpoints Documentation

## Base URL
```
http://88.99.68.90:85/BMSSystem/
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

### Create Breakdown
**Endpoint:** `CreateLineBreakdown`  
**Method:** `POST`  
**Headers:** `DBName`, `Authorization`

**Request Body:**
```json
{
  "vehicleNumber": "MH12AB1234",
  "routeNumber": "101",
  "breakdownLocation": "Pune Station Road",
  "breakdownDate": "13/02/2026",
  "breakdownTime": "14:30",
  "priority": "High",
  "description": "Vehicle stopped suddenly on route",
  "faults": [
    {
      "faultType": "Electrical",
      "faultDescription": "Complete electrical failure"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Breakdown reported successfully",
  "data": {
    "id": 456,
    "breakdownNumber": "BRK-2026-456",
    "status": "In Progress",
    "estimatedRepairTime": 120
  }
}
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
curl -X POST http://88.99.68.90:85/BMSSystem/MCheckLogin \
  -H "Content-Type: application/json" \
  -d '{"DBName":"MUTSPL","User":"test","Password":"test123"}'
```

---

**Note:** Replace placeholder values with actual data when testing.
