# Quick Installation Guide

## Step 1: Navigate to Project Directory
```bash
cd FleetDataApp
```

## Step 2: Install All Dependencies
```bash
npm install
```

This will install all required packages:
- expo (~50.0.0)
- react-native (0.73.2)
- @react-navigation/native
- @react-navigation/bottom-tabs
- @react-navigation/native-stack
- @reduxjs/toolkit
- react-redux
- react-native-paper
- axios
- formik
- yup
- @react-native-async-storage/async-storage
- @react-native-community/netinfo
- @react-native-community/datetimepicker
- @react-native-picker/picker
- react-native-gesture-handler
- react-native-toast-message
- expo-secure-store
- expo-splash-screen
- expo-status-bar
- All other dependencies

## Step 3: Start Expo Development Server
```bash
npm start
```

## Step 4: Run on Android Emulator

### Option A: Automatic
```bash
npm run android
```

### Option B: Manual
1. Start Android emulator first
2. Run: `npm start`
3. Press 'a' in the terminal

## Android Emulator Setup (First Time Only)

### 1. Install Android Studio
Download from: https://developer.android.com/studio

### 2. Set up Android Emulator
```
1. Open Android Studio
2. Click "More Actions" → "Virtual Device Manager"
3. Click "Create Device"
4. Select "Pixel 5" (Recommended)
5. Download System Image: Android 13 (API 33)
6. Click "Next" → "Finish"
7. Click the Play button to start emulator
```

### 3. Verify Emulator is Running
Open a terminal and run:
```bash
adb devices
```
You should see your emulator listed.

### 4. Run the App
```bash
npm run android
```

## Expected Result

The app should:
1. ✅ Build successfully
2. ✅ Install on the emulator
3. ✅ Launch automatically
4. ✅ Show the login screen

## Login Screen

The app will:
1. Load company list from backend
2. Show dropdown with companies
3. Allow user to enter credentials
4. Authenticate and navigate to dashboard

## Test Credentials

Contact your system administrator for test credentials.

Backend URL: http://88.99.68.90:85/BMSSystem/

## Common Issues and Solutions

### Issue: "Metro bundler not starting"
```bash
npx expo start --clear
```

### Issue: "Android emulator not detected"
```bash
# Check if adb is running
adb devices

# Restart adb if needed
adb kill-server
adb start-server
```

### Issue: "Dependencies installation failed"
```bash
# Clear cache and reinstall
rm -rf node_modules
rm package-lock.json
npm cache clean --force
npm install
```

### Issue: "Expo version mismatch"
```bash
npx expo install --fix
```

### Issue: "Port 8081 already in use"
```bash
npx expo start --port 8082
```

### Issue: "React Native Paper theming error"
Just ignore warnings - the app will work fine.

## Verify Installation

After running the app, you should see:

✅ Splash screen with app logo  
✅ Login screen with company dropdown  
✅ Username and password fields  
✅ "Sign In" button  

If you see all of these, installation is successful! 🎉

## Next Steps

1. Get test credentials from administrator
2. Login to the app
3. Explore the dashboard
4. Try creating a complaint, breakdown, or fuel log
5. Test dark mode in Profile screen
6. Check notifications

## Development Mode

When running in development mode:
- Hot reload is enabled
- Developer menu: Shake the device or press Ctrl+M (Cmd+D on Mac)
- Reload app: Double-tap 'R'
- Debug: Open developer menu and select "Debug"

## File Watcher Limit (Linux/Mac)

If you get a file watcher error:
```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## Need Help?

1. Check README.md for detailed documentation
2. Review troubleshooting section
3. Check Expo documentation: https://docs.expo.dev
4. Contact your development team

---

**Installation Time:** 5-10 minutes  
**App Build Time:** 2-3 minutes (first time)  
**Total Time:** ~15 minutes

Happy coding! 🚀
