# Fleet Data Management App - Setup Instructions

## Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Android Studio with Android Emulator
- Expo CLI

## Installation Steps

### 1. Install Dependencies
```bash
cd FleetDataApp
npm install
```

### 2. Start Expo Development Server
```bash
npm start
```

### 3. Run on Android Emulator
```bash
npm run android
```

Or press 'a' in the Expo terminal after running `npm start`

## Android Emulator Setup

1. Install Android Studio
2. Open Android Studio > More Actions > Virtual Device Manager
3. Create a new device (Pixel 5 recommended)
4. Start the emulator
5. Run `npm run android`

## Environment Variables
Backend Base URL is configured in: `src/constants/config.js`

## Default Test Credentials
Contact your administrator for test credentials.

## Features
- Modern UI with Dark Mode
- Offline Support
- Real-time Notifications
- Driver Complaints
- Line Breakdowns
- Fuel Logs
- Scheduling
- Pull to Refresh
- Toast Notifications

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
