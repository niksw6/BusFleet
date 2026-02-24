# Deployment Guide - Fleet Data Management App

## Building for Production

### Method 1: Expo Build Service (Recommended)

#### Setup EAS Build
```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo account
eas login

# Configure EAS Build
eas build:configure
```

#### Build APK (Development)
```bash
eas build --platform android --profile development
```

#### Build AAB (Production - Google Play)
```bash
eas build --platform android --profile production
```

#### Build for Internal Testing
```bash
eas build --platform android --profile preview
```

---

### Method 2: Local Build with Expo

#### Create APK
```bash
npx expo build:android -t apk
```

#### Create App Bundle
```bash
npx expo build:android -t app-bundle
```

---

## Pre-Build Checklist

### 1. Update Version
Edit `app.json`:
```json
{
  "expo": {
    "version": "1.0.0",
    "android": {
      "versionCode": 1
    }
  }
}
```

### 2. Verify Assets
- ✅ icon.png (1024x1024)
- ✅ splash.png (1284x2778)
- ✅ adaptive-icon.png (1024x1024)
- ✅ favicon.png (48x48)

### 3. Update App Configuration
Edit `app.json`:
```json
{
  "expo": {
    "name": "Fleet Data Management",
    "slug": "fleetdataapp",
    "android": {
      "package": "com.yourcompany.fleetdata",
      "versionCode": 1
    }
  }
}
```

### 4. Test All Features
- ✅ Login flow
- ✅ Dashboard loading
- ✅ Create complaint
- ✅ Create breakdown
- ✅ Fuel log
- ✅ Schedule creation
- ✅ Dark mode
- ✅ Notifications
- ✅ Logout

### 5. Optimize Build Size
```bash
# Remove console logs (for production)
# Add to babel.config.js
module.exports = function(api) {
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['transform-remove-console', { 'exclude': ['error', 'warn'] }]
    ]
  };
};
```

---

## EAS Build Configuration

Create `eas.json`:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

---

## Android Signing

### Generate Keystore (First Time)
```bash
keytool -genkey -v -keystore my-release-key.keystore \
  -alias my-key-alias \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

### Configure in app.json
```json
{
  "expo": {
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_API_KEY"
        }
      }
    }
  }
}
```

---

## Build Steps

### Step 1: Clean Build
```bash
rm -rf node_modules
rm package-lock.json
npm install
npx expo start --clear
```

### Step 2: Test Locally
```bash
npm run android
# Test all features
```

### Step 3: Create Production Build
```bash
eas build --platform android --profile production
```

### Step 4: Download APK/AAB
- Check your email for build completion
- Download from Expo dashboard
- Or use EAS CLI: `eas build:list`

### Step 5: Test Production Build
- Install APK on test device
- Test all features
- Verify backend connectivity
- Check error handling

---

## Google Play Store Deployment

### Preparation

1. **Create App Listing**
   - Go to Google Play Console
   - Create new application
   - Fill in app details

2. **Required Assets**
   - App icon (512x512)
   - Feature graphic (1024x500)
   - Screenshots (at least 2)
   - Privacy policy URL

3. **App Information**
   - Title: Fleet Data Management
   - Short description (80 chars)
   - Full description (4000 chars)
   - Category: Business

### Upload Build

1. **Create Release**
   - Go to Production track
   - Create new release
   - Upload AAB file

2. **Fill Release Notes**
   ```
   Version 1.0.0
   - Initial release
   - Driver complaints module
   - Line breakdown reporting
   - Fuel logging system
   - Service scheduling
   - Dark mode support
   ```

3. **Review and Rollout**
   - Review release
   - Start rollout
   - Monitor for issues

---

## Internal Testing

### TestFlight/Internal Testing

1. **Create Testing Track**
   - Internal testing
   - Closed testing
   - Open testing

2. **Add Testers**
   - Email addresses
   - Google groups

3. **Upload Build**
   ```bash
   eas build --platform android --profile preview
   ```

4. **Share Link**
   - Testers receive email
   - Install and test
   - Provide feedback

---

## Continuous Integration (Optional)

### GitHub Actions

Create `.github/workflows/build.yml`:
```yaml
name: Build Android

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npx expo build:android
```

---

## Over-the-Air (OTA) Updates

### Publish Update
```bash
# Publish to default channel
eas update --auto

# Publish to specific channel
eas update --branch production --message "Bug fixes"
```

### Configure Updates
Edit `app.json`:
```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/YOUR_PROJECT_ID"
    }
  }
}
```

---

## Environment Variables (Production)

### Create .env.production
```bash
EXPO_PUBLIC_API_URL=https://api.production.com/
EXPO_PUBLIC_ENV=production
EXPO_PUBLIC_DEBUG=false
```

### Configure in EAS
```bash
eas secret:create
```

---

## Monitoring and Analytics

### Setup Sentry (Error Tracking)
```bash
npm install @sentry/react-native
```

### Initialize Sentry
```javascript
// App.js
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: 'production',
});
```

---

## Post-Deployment

### 1. Monitor Crashes
- Check Sentry dashboard
- Review user feedback
- Fix critical bugs

### 2. Collect Feedback
- User reviews
- In-app feedback
- Support tickets

### 3. Plan Updates
- Bug fixes
- Feature requests
- Performance improvements

### 4. Regular Updates
- Security patches
- Dependency updates
- OS compatibility

---

## Rollback Strategy

### If Issues Occur

1. **Stop Rollout**
   - Google Play Console
   - Halt release

2. **Publish Hotfix**
   ```bash
   # Fix the issue
   eas build --platform android --profile production
   ```

3. **OTA Update (if possible)**
   ```bash
   eas update --branch production --message "Hotfix"
   ```

---

## Build Optimization

### Reduce Bundle Size

1. **Enable Hermes**
   Edit `app.json`:
   ```json
   {
     "expo": {
       "android": {
         "jsEngine": "hermes"
       }
     }
   }
   ```

2. **Remove Unused Dependencies**
   ```bash
   npm prune
   ```

3. **Optimize Images**
   - Compress PNG/JPG
   - Use WebP format
   - Lazy load images

4. **Code Splitting**
   - Dynamic imports
   - Lazy load screens
   - Remove dead code

---

## Performance Testing

### Before Release

1. **Test on Low-End Devices**
   - Test older Android versions
   - Check performance
   - Monitor memory usage

2. **Network Conditions**
   - Test on slow networks
   - Offline functionality
   - API timeouts

3. **Battery Usage**
   - Monitor battery drain
   - Optimize background tasks
   - Reduce wake locks

---

## Release Checklist

- [ ] Version number updated
- [ ] Changelog prepared
- [ ] All tests passing
- [ ] Assets optimized
- [ ] Privacy policy updated
- [ ] Terms of service updated
- [ ] Backend API ready
- [ ] Staging environment tested
- [ ] Production build tested
- [ ] Screenshots updated
- [ ] Store listing ready
- [ ] Release notes written
- [ ] Team notified
- [ ] Support team briefed
- [ ] Monitoring setup
- [ ] Rollback plan ready

---

## Quick Commands

```bash
# Build for testing
eas build --platform android --profile preview

# Build for production
eas build --platform android --profile production

# Publish OTA update
eas update --auto

# Check build status
eas build:list

# Submit to Play Store
eas submit --platform android
```

---

## Support After Deployment

### User Support
- In-app support
- Email support
- FAQ section
- Video tutorials

### Technical Support
- Crash monitoring
- Performance tracking
- User analytics
- Feedback collection

---

## Version Management

### Semantic Versioning
- **1.0.0** - Major.Minor.Patch
- **1.0.1** - Bug fixes
- **1.1.0** - New features
- **2.0.0** - Breaking changes

### Update app.json for each release
```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

---

## Troubleshooting Builds

### Build Fails
```bash
# Check logs
eas build:list
eas build:view BUILD_ID

# Clear cache
eas build --platform android --clear-cache
```

### Upload Fails
```bash
# Check bundle size (< 100MB for Play Store)
# Optimize assets
# Remove unused dependencies
```

---

**Always test production builds on physical devices before release!**

**Keep your signing keys secure and backed up!**

**Monitor your app after deployment for the first 24-48 hours!**
