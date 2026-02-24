# Complete Command List - Fleet Data Management App

## Initial Setup (One Time Only)

### 1. Navigate to Project Directory
```bash
cd c:\Users\niksw\OneDrive\Documents\Projects\BusFleet\FleetDataApp
```

### 2. Install All Dependencies
```bash
npm install
```

**Expected output:** 
- Installing packages...
- This may take 3-5 minutes
- Should complete without errors

---

## Running the App (Every Time)

### Option 1: Quick Start (Recommended)
```bash
npm start
```
Then press **'a'** to launch on Android

### Option 2: Direct Android Launch
```bash
npm run android
```

### Option 3: iOS (Mac only)
```bash
npm run ios
```

### Option 4: Web Browser
```bash
npm run web
```

---

## Development Commands

### Clear Cache and Restart
```bash
npx expo start --clear
```

### Clear Cache and Run on Android
```bash
npx expo start --clear --android
```

### Run on Specific Port
```bash
npx expo start --port 8082
```

### Fix Dependencies
```bash
npx expo install --fix
```

### Check for Updates
```bash
npx expo-doctor
```

---

## Troubleshooting Commands

### Clear Everything and Reinstall
```bash
rm -rf node_modules
rm package-lock.json
npm install
```

### Windows PowerShell version:
```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

### Check Android Devices
```bash
adb devices
```

### Restart ADB Server
```bash
adb kill-server
adb start-server
```

### View Android Logs
```bash
adb logcat
```

### View Metro Bundler Logs (during npm start)
Logs appear in the terminal automatically

---

## Build Commands (Production)

### Create Development Build
```bash
npx expo build:android
```

### Install EAS Build (First Time)
```bash
npm install -g eas-cli
eas login
eas build:configure
```

### Build with EAS
```bash
eas build --platform android --profile preview
```

---

## Code Quality Commands

### Format Code (if prettier is installed)
```bash
npx prettier --write "src/**/*.js"
```

### Lint Code (if eslint is installed)
```bash
npx eslint "src/**/*.js"
```

---

## Quick Commands Reference

| Command | Purpose |
|---------|---------|
| `npm start` | Start development server |
| `npm run android` | Run on Android |
| `npx expo start --clear` | Clear cache and start |
| `adb devices` | Check connected devices |
| `npx expo install --fix` | Fix dependencies |
| `npm install` | Install dependencies |

---

## Testing Workflow

### 1. Start Development Server
```bash
npm start
```

### 2. Launch on Android
Press **'a'** in the terminal or run:
```bash
npm run android
```

### 3. Make Code Changes
- Files auto-reload (Fast Refresh)
- Save and see changes instantly

### 4. Debug
- Shake device or press **Ctrl+M** (Windows) / **Cmd+D** (Mac)
- Select "Debug" from menu
- Open Chrome DevTools at: chrome://inspect

---

## Asset Commands

### Optimize Assets (requires imagemagick)
```bash
# Resize icon
magick convert icon.png -resize 1024x1024 icon-optimized.png

# Compress PNG
pngquant --quality=65-80 assets/icon.png
```

---

## Git Commands (Version Control)

### Initialize Git (if not already)
```bash
git init
```

### Add and Commit
```bash
git add .
git commit -m "Initial commit - Fleet Data Management App"
```

### Create .gitignore (already included)
The project already has a `.gitignore` file

---

## Update Commands

### Update Expo SDK
```bash
npx expo upgrade
```

### Update Specific Package
```bash
npm update react-native-paper
```

### Update All Packages (carefully!)
```bash
npm update
```

---

## Environment Setup

### Set Environment Variable (optional)
```bash
# Windows
set EXPO_PUBLIC_API_URL=http://88.99.68.90:85/BMSSystem/

# Linux/Mac
export EXPO_PUBLIC_API_URL=http://88.99.68.90:85/BMSSystem/
```

---

## Debugging Commands

### View Expo Config
```bash
npx expo config
```

### Check Dependencies
```bash
npm list --depth=0
```

### Verify Expo Installation
```bash
npx expo --version
```

### Check Node Version
```bash
node --version
```

### Check npm Version
```bash
npm --version
```

---

## Android Emulator Commands

### List Available Emulators
```bash
emulator -list-avds
```

### Start Specific Emulator
```bash
emulator -avd Pixel_5_API_33
```

### Start with Cold Boot
```bash
emulator -avd Pixel_5_API_33 -no-snapshot-load
```

---

## Performance Commands

### Measure Bundle Size
```bash
npx expo export
```

### Production Bundle
```bash
npx expo export --platform android
```

---

## Common Issues & Solutions

### Issue: Port 8081 in use
```bash
npx expo start --port 8082
```

### Issue: Metro bundler frozen
```bash
# Press Ctrl+C to stop, then:
npx expo start --clear
```

### Issue: Android build fails
```bash
cd android
./gradlew clean
cd ..
npm run android
```

### Windows version:
```bash
cd android
gradlew clean
cd ..
npm run android
```

---

## Full Reset (Nuclear Option)

If nothing else works:

```bash
# 1. Stop all processes
# Press Ctrl+C in terminal

# 2. Clear everything
rm -rf node_modules
rm package-lock.json
rm -rf .expo
rm -rf android/app/build

# 3. Reinstall
npm install

# 4. Clear cache and start
npx expo start --clear
```

---

## Useful Environment Info Commands

### Check Complete Environment
```bash
npx expo-env-info
```

### Check React Native Environment
```bash
npx react-native doctor
```

---

## Daily Development Workflow

```bash
# Morning: Start fresh
cd FleetDataApp
npm start

# Make changes, test, repeat

# End of day: Commit changes
git add .
git commit -m "Add feature X"

# Optional: Push to remote
git push origin main
```

---

## Quick Start Terminal Session

```bash
# Session 1: Metro Bundler
cd c:\Users\niksw\OneDrive\Documents\Projects\BusFleet\FleetDataApp
npm start

# Session 2 (optional): Logs
adb logcat | grep -i "expo\|react"
```

---

**Save this file for quick reference!**

**Most common command: `npm start` then press 'a'**
