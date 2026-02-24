# Fleet Data Management App

## Complete Production-Ready Mobile Application

**Built with:** Expo SDK 50 | React Native | JavaScript

---

## Features

✅ **Modern UI/UX**
- React Native Paper design system
- Dark mode support
- Smooth animations
- Large touch-friendly buttons
- Skeleton loaders
- Pull to refresh

✅ **Authentication**
- Company-based login system
- Auto-logout on 401
- Session persistence
- Secure storage

✅ **Dashboard**
- Real-time stats
- Quick actions
- Role-based access
- Search functionality

✅ **Driver Complaints**
- Dynamic fault management
- Priority levels
- Date/time pickers
- Form validation
- Confirmation dialogs

✅ **Line Breakdowns**
- Location tracking
- Route information
- High priority flagging
- Real-time reporting

✅ **Fuel Logs**
- Odometer validation
- Electric vehicle support
- Fuel type selection
- Cost tracking

✅ **Scheduling**
- KM-based intervals
- Time-based intervals
- Service reminders
- Maintenance tracking

✅ **Offline Support**
- Network status indicator
- Offline banner
- Draft saving (placeholder)

✅ **Notifications**
- Real-time updates
- Unread count badges
- Mark as read functionality

---

## Quick Start

### 1. Install Dependencies
```bash
cd FleetDataApp
npm install
```

### 2. Start Development Server
```bash
npm start
```

### 3. Run on Android
```bash
npm run android
```

Or press **'a'** in the Expo CLI terminal

---

## Prerequisites

### Required Software
- **Node.js** v16 or higher
- **npm** or **yarn**
- **Android Studio** with Android Emulator
- **Expo CLI** (auto-installed)

### Android Emulator Setup

1. Download and install **Android Studio**
2. Open Android Studio
3. Click **More Actions** > **Virtual Device Manager**
4. Click **Create Device**
5. Select **Pixel 5** (recommended)
6. Select System Image: **Android 13 (Tiramisu)**
7. Click **Finish**
8. Start the emulator
9. Run `npm run android`

---

## Project Structure

```
FleetDataApp/
├── App.js                          # Root component
├── app.json                        # Expo configuration
├── package.json                    # Dependencies
├── babel.config.js                 # Babel configuration
│
├── assets/                         # Images and icons
│   ├── icon.png
│   ├── splash.png
│   ├── adaptive-icon.png
│   └── favicon.png
│
└── src/
    ├── components/                 # Reusable components
    │   ├── Badge.js
    │   ├── ConfirmationModal.js
    │   ├── DashboardCard.js
    │   ├── FAB.js
    │   ├── Loader.js
    │   ├── OfflineBanner.js
    │   └── SkeletonLoader.js
    │
    ├── constants/                  # Configuration constants
    │   ├── config.js
    │   └── theme.js
    │
    ├── navigation/                 # Navigation setup
    │   ├── AppNavigator.js
    │   └── BottomTabNavigator.js
    │
    ├── screens/                    # Application screens
    │   ├── LoginScreen.js
    │   ├── DashboardScreen.js
    │   ├── ComplaintsScreen.js
    │   ├── CreateComplaintScreen.js
    │   ├── CreateBreakdownScreen.js
    │   ├── CreateFuelLogScreen.js
    │   ├── CreateScheduleScreen.js
    │   ├── NotificationsScreen.js
    │   └── ProfileScreen.js
    │
    ├── services/                   # API services
    │   ├── api.js
    │   └── apiClient.js
    │
    ├── store/                      # Redux state management
    │   ├── index.js
    │   └── slices/
    │       ├── authSlice.js
    │       ├── dataSlice.js
    │       ├── notificationSlice.js
    │       └── themeSlice.js
    │
    └── utils/                      # Helper functions
        ├── helpers.js
        ├── storage.js
        └── validations.js
```

---

## Backend Integration

**Base URL:** `http://88.99.68.90:85/BMSSystem/`

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `MGetCompanyLists` | GET | Fetch company list |
| `MCheckLogin` | POST | User authentication |
| `CreateDriverComplaint` | POST | Submit driver complaint |
| `CreateLineBreakdown` | POST | Report line breakdown |
| `CreateFuelLog` | POST | Log fuel entry |
| `CreateSchedule` | POST | Create service schedule |
| `GetDashboardStats` | GET | Fetch dashboard statistics |
| `GetNotifications` | GET | Fetch notifications |

### Request Headers
```javascript
{
  "Content-Type": "application/json",
  "DBName": "MUTSPL",
  "Authorization": "Bearer <token>"
}
```

---

## State Management

**Redux Toolkit** with 4 slices:

1. **authSlice** - Authentication state
2. **themeSlice** - Dark/Light mode
3. **dataSlice** - Application data
4. **notificationSlice** - Notifications

---

## Key Technologies

| Technology | Purpose |
|------------|---------|
| **Expo** | Framework |
| **React Navigation** | Navigation |
| **Redux Toolkit** | State management |
| **React Native Paper** | UI components |
| **Formik + Yup** | Form handling & validation |
| **Axios** | HTTP client |
| **AsyncStorage** | Local storage |
| **NetInfo** | Network status |
| **Toast Message** | Notifications |

---

## Customization

### Change Backend URL
Edit: `src/constants/config.js`
```javascript
export const API_BASE_URL = 'YOUR_BACKEND_URL';
```

### Modify Theme Colors
Edit: `src/constants/theme.js`
```javascript
export const COLORS = {
  primary: '#0066CC',
  secondary: '#FF6B35',
  // ...
};
```

### Add New Screen
1. Create screen in `src/screens/`
2. Import in `src/navigation/AppNavigator.js`
3. Add to Stack.Navigator

---

## Troubleshooting

### Metro Bundle Error
```bash
npx expo start --clear
```

### Android Build Issues
```bash
cd android
./gradlew clean
cd ..
npm run android
```

### Port Already in Use
```bash
npx expo start --port 8082
```

### Dependencies Installation Error
```bash
rm -rf node_modules
rm package-lock.json
npm install
```

### Expo Version Mismatch
```bash
npx expo install --fix
```

---

## Building for Production

### Android APK (Development Build)
```bash
npx expo build:android
```

### Generate Android Bundle (AAB)
```bash
eas build --platform android
```

**Note:** For production builds, setup **EAS Build** by running:
```bash
npm install -g eas-cli
eas build:configure
```

---

## Performance Optimization

✅ **FlatList** for large lists  
✅ **Skeleton loaders** for better UX  
✅ **Memoization** where needed  
✅ **Image optimization**  
✅ **Lazy loading**  
✅ **Redux selectors** for derived state  

---

## Security Features

🔒 Secure storage with `expo-secure-store`  
🔒 API interceptors for auth  
🔒 Auto-logout on 401  
🔒 Environment-based configuration  
🔒 Input validation with Yup  

---

## Testing

### Run on Physical Device

1. Install **Expo Go** app from Play Store
2. Run `npm start`
3. Scan QR code with Expo Go app

---

## Support

For issues or questions:
- Check the troubleshooting section
- Review console logs
- Contact your system administrator

---

## License

Proprietary - Fleet Data Management System

---

## Version History

**v1.0.0** - Initial Release
- Complete authentication flow
- Dashboard with statistics
- Driver complaints module
- Line breakdown reporting
- Fuel logging system
- Service scheduling
- Dark mode support
- Offline detection

---

**Built with ❤️ using Expo and React Native**
