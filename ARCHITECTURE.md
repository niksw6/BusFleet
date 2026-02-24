# 🏗️ Application Restructuring Guide

## Overview
This document describes the new feature-based architecture implemented in the Fleet Management App, following industry best practices for scalable React Native applications.

## 🎯 Architecture Goals

1. **Feature-Based Organization**: Group related code by feature/domain
2. **Separation of Concerns**: Clear boundaries between API, business logic, and UI
3. **Reusability**: Shared components and utilities accessible across features
4. **Scalability**: Easy to add new features without affecting existing code
5. **Maintainability**: Intuitive structure for developers to navigate

---

## 📁 New Folder Structure

```
src/
├── api/                              # API Layer
│   ├── client.js                     # Axios instance & interceptors
│   ├── index.js                      # Main API exports
│   └── services/                     # Feature-based API services
│       ├── auth.service.js           # Authentication APIs
│       ├── master.service.js         # Master data APIs
│       ├── complaint.service.js      # Complaints & breakdowns
│       ├── jobCard.service.js        # Job card management
│       ├── maintenance.service.js    # Fuel logs & preventive maintenance
│       ├── dashboard.service.js      # Analytics & reporting
│       └── index.js                  # Service exports
│
├── features/                         # Feature Modules
│   ├── auth/                         # Authentication feature
│   │   ├── screens/
│   │   │   ├── LoginScreen.js
│   │   │   └── ProfileScreen.js
│   │   ├── components/               # Auth-specific components
│   │   └── index.js
│   │
│   ├── complaints/                   # Complaints & Breakdowns feature
│   │   ├── screens/
│   │   │   ├── ComplaintsScreen.js
│   │   │   ├── CreateComplaintScreen.js
│   │   │   └── CreateBreakdownScreen.js
│   │   ├── components/               # Complaint-specific components
│   │   └── index.js
│   │
│   ├── jobCards/                     # Job Card feature
│   │   ├── screens/
│   │   │   ├── JobCardsScreen.js
│   │   │   └── CreateJobCardScreen.js
│   │   ├── components/               # Job card-specific components
│   │   └── index.js
│   │
│   ├── maintenance/                  # Fuel & Preventive Maintenance
│   │   ├── screens/
│   │   │   ├── CreateFuelLogScreen.js
│   │   │   └── CreateScheduleScreen.js
│   │   ├── components/               # Maintenance-specific components
│   │   └── index.js
│   │
│   └── dashboard/                    # Dashboard & Analytics
│       ├── screens/
│       │   ├── DashboardScreen.js
│       │   └── NotificationsScreen.js
│       ├── components/               # Dashboard-specific components
│       └── index.js
│
├── shared/                           # Shared Resources
│   ├── components/                   # Reusable UI components
│   │   ├── Badge.js
│   │   ├── ConfirmationModal.js
│   │   ├── DashboardCard.js
│   │   ├── FAB.js
│   │   ├── Loader.js
│   │   ├── ModalSelector.js
│   │   ├── OfflineBanner.js
│   │   ├── SkeletonLoader.js
│   │   └── index.js
│   ├── hooks/                        # Custom React hooks
│   │   ├── useConfirmation.js
│   │   ├── useTheme.js
│   │   └── index.js
│   └── index.js
│
├── store/                            # Redux State Management
│   ├── slices/
│   │   ├── authSlice.js
│   │   ├── dataSlice.js
│   │   ├── notificationSlice.js
│   │   └── themeSlice.js
│   └── index.js
│
├── navigation/                       # Navigation Configuration
│   ├── AppNavigator.js
│   └── BottomTabNavigator.js
│
├── constants/                        # App Constants
│   ├── config.js                     # API endpoints, enums, config
│   └── theme.js                      # SAP Fiori theme colors
│
└── utils/                            # Utility Functions
    ├── helpers.js
    ├── storage.js
    └── validations.js
```

---

## 🔄 Migration Guide

### Import Path Changes

#### **API Services**
**OLD:**
```javascript
import { complaintService, breakdownService } from '../services/api';
```

**NEW:**
```javascript
import { complaintService, masterService, jobCardService } from '../../../api/services';
// or from root:
import { complaintService } from '@/api/services';
```

#### **Shared Components**
**OLD:**
```javascript
import Loader from '../components/Loader';
import { StatusBadge } from '../components/Badge';
```

**NEW:**
```javascript
import { Loader, StatusBadge } from '../../../shared/components';
// or from root:
import { Loader, StatusBadge } from '@/shared/components';
```

#### **Feature Screens**
**OLD:**
```javascript
import LoginScreen from '../screens/LoginScreen';
import ComplaintsScreen from '../screens/ComplaintsScreen';
```

**NEW:**
```javascript
import { LoginScreen, ProfileScreen } from '../features/auth';
import { ComplaintsScreen } from '../features/complaints';
```

---

## 📦 API Service Organization

### **authService** (`auth.service.js`)
- `getCompanyLists()` - Get available companies
- `login(credentials)` - Authenticate user
- `logout()` - End user session

### **masterService** (`master.service.js`)
- `getActiveBuses(companyDB)` - Vehicle list
- `getDrivers(companyDB)` - Driver list
- `getMechanics(companyDB)` - Mechanic list
- `getSupervisors(companyDB)` - Supervisor list
- `getJobTypes(companyDB)` - Job type masters
- `getFaultDetails(companyDB)` - Fault masters
- `getRoutes(companyDB)` - Route masters
- `getStopsByRoute(companyDB, routeNo)` - Stop masters
- `getSpareParts(companyDB)` - Spare parts list

### **complaintService** (`complaint.service.js`)
- `createComplaint(data)` - Submit driver complaint
- `getComplaints(companyDB, status)` - List complaints
- `getComplaintDetail(companyDB, docEntry)` - Complaint details
- `createBreakdown(data)` - Report line breakdown
- `getBreakdowns(companyDB, status)` - List breakdowns
- `getBreakdownDetail(companyDB, docEntry)` - Breakdown details
- `updateComplaintStatus(companyDB, docEntry, status)` - Update status

### **jobCardService** (`jobCard.service.js`)
- `createJobCard(data)` - Create job card from complaint
- `getJobCards(companyDB, status)` - List job cards
- `getJobCardDetail(companyDB, docEntry)` - Job card details
- `assignMechanic(companyDB, docEntry, mechanicCode)` - Assign mechanic
- `updateJobCardStatus(companyDB, docEntry, status)` - Update status
- `addWorkProgress(companyDB, docEntry, notes)` - Add progress notes
- `completeJobCard(companyDB, docEntry, completionData)` - Complete job

### **maintenanceService** (`maintenance.service.js`)
- `createFuelLog(data)` - Log fuel entry
- `getFuelLogs(companyDB, vehicleNumber)` - Fuel history
- `createSchedule(data)` - Schedule preventive maintenance
- `getSchedules(companyDB, vehicleNumber)` - Scheduled services
- `getUpcomingMaintenance(companyDB)` - Upcoming due dates
- `completeScheduledService(companyDB, scheduleId, data)` - Mark complete
- `getFuelAnalytics(companyDB, vehicleNo, from, to)` - Fuel analytics

### **dashboardService** (`dashboard.service.js`)
- `getDashboardStatus(companyDB)` - Dashboard statistics
- `getDashboardStats(companyDB)` - Additional stats
- `getNotifications(companyDB, userId)` - User notifications
- `markNotificationAsRead(notificationId)` - Mark as read
- `getFleetPerformance(companyDB, fromDate, toDate)` - Performance metrics
- `getCostAnalysis(companyDB, period)` - Cost analysis

---

## 🎨 Feature Module Pattern

Each feature follows this pattern:

```
feature/
├── screens/          # Feature screens
├── components/       # Feature-specific components
├── hooks/            # Feature-specific custom hooks
└── index.js          # Feature exports
```

**Example: complaints/index.js**
```javascript
export { default as ComplaintsScreen } from './screens/ComplaintsScreen';
export { default as CreateComplaintScreen } from './screens/CreateComplaintScreen';
export { default as CreateBreakdownScreen } from './screens/CreateBreakdownScreen';
```

**Usage:**
```javascript
import { ComplaintsScreen, CreateComplaintScreen } from '@/features/complaints';
```

---

## 🚀 Benefits

### 1. **Clear Separation**
- API logic isolated in `api/services/`
- Business logic in feature folders
- UI components in `shared/components/`

### 2. **Easy Navigation**
- Find code by feature, not by type
- Related code lives together
- Intuitive for new developers

### 3. **Scalability**
- Add new features without touching existing code
- Feature flags easy to implement
- Parallel development by feature teams

### 4. **Testability**
- Services can be mocked easily
- Feature-isolated unit tests
- Clear dependencies

### 5. **Maintenance**
- Changes localized to feature folders
- Shared code reused via `shared/`
- Constants centralized in `constants/`

---

## 📝 Coding Standards

### Import Order
```javascript
// 1. React & React Native
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// 2. Third-party libraries
import { useSelector, useDispatch } from 'react-redux';
import Toast from 'react-native-toast-message';

// 3. API services
import { complaintService, masterService } from '../../../api/services';

// 4. Shared components & hooks
import { Loader, StatusBadge } from '../../../shared/components';
import { useConfirmation } from '../../../shared/hooks';

// 5. Constants & utils
import { COLORS, DARK_COLORS } from '../../../constants/theme';
import { formatDate } from '../../../utils/helpers';
```

### File Naming
- Components: `PascalCase.js` (e.g., `StatusBadge.js`)
- Services: `camelCase.service.js` (e.g., `complaint.service.js`)
- Hooks: `useCamelCase.js` (e.g., `useConfirmation.js`)
- Utilities: `camelCase.js` (e.g., `helpers.js`)

---

## 🔧 Next Steps

1. **Update remaining screen imports** to use new paths
2. **Create feature-specific components** (move from shared when needed)
3. **Add more API service methods** as backend grows
4. **Implement role-based routing** in navigation
5. **Add offline support** using Redux Persist
6. **Create automated tests** for each service

---

## 📚 Resources

- **React Navigation**: https://reactnavigation.org/
- **Redux Toolkit**: https://redux-toolkit.js.org/
- **Feature-Sliced Design**: https://feature-sliced.design/
- **SAP Fiori Design**: https://experience.sap.com/fiori-design/

---

## 🤝 Contributing

When adding new features:
1. Create new feature folder in `src/features/`
2. Add corresponding API service if backend APIs exist
3. Use shared components when possible
4. Export feature screens/components via `index.js`
5. Update navigation if new routes needed
6. Document API methods and expected responses

---

**Version**: 2.0  
**Last Updated**: February 22, 2026  
**Architecture**: Feature-Based Modular Design
