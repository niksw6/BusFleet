# Expected API Response Formats

This document describes the exact data structures that the app expects from each API endpoint for the modal selectors to work properly.

## General Response Format
All APIs should return:
```json
{
  "Success": true,
  "Data": [...],
  "Message": "Success message"
}
```

---

## 1. GetActiveBusMasters (Vehicles)
**Endpoint:** `GetActiveBusMasters?CompanyDB=MUTSPL_TEST`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "BusCode": "7613",
      "VehicleNo": "7613",
      "RegNo": "MH01DR7613"
    }
  ],
  "Message": "Data fetched successfully."
}
```

**Required Fields:**
- `BusCode` - Primary field for vehicle identification
- `RegNo` - Registration number (optional, for display)
- `VehicleNo` - Alternative vehicle number (fallback)

---

## 2. GetJobTypes
**Endpoint:** `GetJobTypes?CompanyDB=MUTSPL_TEST`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "CodeName": "Breakdown"
    },
    {
      "CodeName": "Preventive Maintenance"
    }
  ],
  "Message": "Data fetched successfully."
}
```

**Required Fields:**
- `CodeName` - Job type name

---

## 3. GetSupervisors
**Endpoint:** `GetSupervisors?CompanyDB=MUTSPL_TEST`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "SupervisorCode": "SUP001",
      "SupervisorName": "Rajesh Kumar",
      "Code": "SUP001",
      "Name": "Rajesh Kumar"
    }
  ],
  "Message": "Data fetched successfully."
}
```

**Required Fields:**
- `SupervisorCode` or `Code` - Supervisor identification code
- `SupervisorName` or `Name` - Supervisor's name

---

## 4. GetDrivers
**Endpoint:** `GetDrivers?CompanyDB=MUTSPL_TEST`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "DriverCode": "DRV001",
      "DriverName": "Suresh Patil",
      "Code": "DRV001",
      "Name": "Suresh Patil"
    }
  ],
  "Message": "Data fetched successfully."
}
```

**Required Fields:**
- `DriverCode` or `Code` - Driver identification code
- `DriverName` or `Name` - Driver's name

---

## 5. GetFaultDetails
**Endpoint:** `GetFaultDetails?CompanyDB=MUTSPL_TEST`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "FaultCode": "ENG001",
      "Fault": "Engine Issue",
      "FaultDescription": "Engine overheating or performance issues"
    }
  ],
  "Message": "Data fetched successfully."
}
```

**Required Fields:**
- `FaultCode` or `Fault` - Fault type code/name
- `FaultDescription` - Description (optional, for display)

---

## 6. GetRoutes
**Endpoint:** `GetRoutes?CompanyDB=MUTSPL_TEST`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "RouteNo": "9",
      "Route": "9",
      "RouteName": "Central to Airport"
    }
  ],
  "Message": "Routes fetched successfully."
}
```

**Required Fields:**
- `RouteNo` or `Route` - Route number
- `RouteName` - Route description (optional, for display)

---

## 7. GetStopsByRoute
**Endpoint:** `GetStopsByRoute?CompanyDB=MUTSPL_TEST&RouteNo=9`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "StopName": "Bus Station 5",
      "Stop": "Bus Station 5",
      "StopCode": "STP005"
    }
  ],
  "Message": "Stops fetched successfully."
}
```

**Required Fields:**
- `StopName` or `Stop` - Stop/place name
- `StopCode` - Stop code (optional, for display)

---

## 8. GetMechanics (for Job Cards)
**Endpoint:** `GetMechanics?CompanyDB=MUTSPL_TEST`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "MechanicCode": "MECH001",
      "MechanicName": "Rajesh Kumar",
      "Specialization": "Engine"
    }
  ],
  "Message": "Data fetched successfully."
}
```

**Required Fields:**
- `MechanicCode` - Mechanic identification code
- `MechanicName` - Mechanic's name
- `Specialization` - Area of expertise (optional, for display)

---

## 9. GetNotifications (Optional)
**Endpoint:** `GetNotifications`

**Expected Response:**
```json
{
  "Success": true,
  "Data": [
    {
      "id": "1",
      "type": "complaint",
      "title": "New Complaint Assigned",
      "message": "Complaint #123 has been assigned to you",
      "timestamp": "2026-02-19T10:30:00",
      "read": false
    }
  ],
  "Message": "Notifications fetched successfully."
}
```

**Note:** If this endpoint doesn't exist, the app will handle it gracefully without errors.

---

## Important Notes:

1. **Field Name Fallbacks:** The app uses fallback logic for field names. For example:
   - `BusCode` → `VehicleNo` → String(item)
   - `DriverCode` → `Code` → String(item)
   - This allows flexibility in API response structures

2. **Case Sensitivity:** Field names are case-sensitive. Use PascalCase as shown above.

3. **Empty Data:** If no data is available, return:
   ```json
   {
     "Success": true,
     "Data": [],
     "Message": "No data found."
   }
   ```

4. **Error Handling:** If an API fails, return:
   ```json
   {
     "Success": false,
     "Data": null,
     "Message": "Error description here"
   }
   ```

5. **Complaint/Breakdown Submission:** Already implemented with correct payload structures as per your API documentation.

---

## Testing Checklist

To verify all selectors work:
1. ✓ Vehicle selector shows buses from GetActiveBusMasters
2. ✓ Driver selector shows drivers from GetDrivers  
3. ✓ Job Type selector shows "Breakdown" and "Preventive Maintenance"
4. ✓ Supervisor selector shows supervisors from GetSupervisors
5. ✓ Fault Type selector shows fault codes from GetFaultDetails
6. ✓ Route selector shows routes (for breakdown only)
7. ✓ Breakdown Place selector shows stops after route selection

If any selector is empty, check:
- API response format matches expected structure
- Field names are exactly as specified
- `Success: true` in response
- `Data` array contains items
