# Assets Information

This folder should contain the following image assets for the Expo app:

## Required Assets

### 1. icon.png
- **Size:** 1024x1024 pixels
- **Format:** PNG with transparency
- **Purpose:** App icon (iOS and Android)
- **Recommendations:** 
  - Use a simple, recognizable design
  - Fleet/truck icon recommended
  - Use brand colors (#0066CC primary)

### 2. splash.png
- **Size:** 1284x2778 pixels (iPhone 13 Pro Max)
- **Format:** PNG
- **Background Color:** #0066CC (matches app.json)
- **Purpose:** Splash screen shown on app launch
- **Recommendations:**
  - Center your logo/icon
  - Keep it simple and fast-loading
  - Use solid background color

### 3. adaptive-icon.png
- **Size:** 1024x1024 pixels
- **Format:** PNG with transparency
- **Purpose:** Android adaptive icon (foreground)
- **Recommendations:**
  - Icon should fit within safe zone (66% of canvas)
  - Transparent background
  - Will be masked into different shapes

### 4. favicon.png
- **Size:** 48x48 pixels (or 512x512 for better quality)
- **Format:** PNG
- **Purpose:** Web version favicon
- **Recommendations:**
  - Simple, recognizable at small size
  - Can be same as app icon, scaled down

## How to Generate Assets

### Option 1: Use Online Tools
- **Icon Generator:** https://www.appicon.co/
- **Splash Generator:** https://www.appicon.co/
- Upload your base design and download all required sizes

### Option 2: Design Tools
- **Figma:** Use Expo Asset Templates
- **Adobe XD:** Export at different resolutions
- **Sketch:** Use export presets

### Option 3: Placeholder Assets (For Development)

If you don't have custom assets yet, create simple placeholders:

1. **Use the Expo default assets** (already included if you used `npx create-expo-app`)
2. Or create simple colored squares with text:
   - Blue square (#0066CC) with white truck icon
   - Add text "Fleet App"

## Updating Assets

After adding/updating assets:

```bash
# Clear cache and restart
npx expo start --clear
```

## Asset Structure

```
assets/
├── icon.png              # 1024x1024 - App icon
├── splash.png            # 1284x2778 - Splash screen
├── adaptive-icon.png     # 1024x1024 - Android adaptive icon
└── favicon.png           # 48x48 - Web favicon
```

## Quick Asset Generation Script

You can use ImageMagick to generate placeholder assets:

```bash
# Install ImageMagick first
# On Ubuntu/Debian: sudo apt-get install imagemagick
# On macOS: brew install imagemagick

# Create blue square icon
convert -size 1024x1024 xc:#0066CC -pointsize 200 -fill white -gravity center -annotate +0+0 "🚚" icon.png

# Create splash screen
convert -size 1284x2778 xc:#0066CC -pointsize 400 -fill white -gravity center -annotate +0+0 "Fleet\nData" splash.png

# Create adaptive icon (same as icon)
cp icon.png adaptive-icon.png

# Create favicon
convert icon.png -resize 48x48 favicon.png
```

## Testing Assets

1. Update assets in the `assets/` folder
2. Restart Expo: `npx expo start --clear`
3. Rebuild app: `npm run android`
4. Check:
   - App icon in launcher
   - Splash screen on launch
   - Adaptive icon shapes (long-press app icon)

## Notes

- Assets are bundled at build time
- Changes require app rebuild for production
- In development, changes may require cache clear
- Keep original high-resolution files
- Optimize PNG files for smaller app size
- Test on both light and dark backgrounds

## Asset Optimization

Before final build, optimize images:

```bash
# Using pngquant
pngquant --quality=65-80 icon.png
pngquant --quality=65-80 splash.png

# Or using online tools
# https://tinypng.com/
# https://squoosh.app/
```

---

**For now, Expo will use default placeholder assets if these files don't exist.**

**The app will work perfectly fine with placeholder assets during development.**
