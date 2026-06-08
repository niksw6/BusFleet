// Shim for expo-font — no-op stub to avoid ExpoFontLoader native module error
// when expo/build/Expo.fx.js imports expo-font but the native module is not registered.

export const loadAsync = async () => {};
export const isLoaded = () => true;
export const isLoading = () => false;
export const unloadAsync = async () => {};
export const processFontFamily = (name) => name;

export default {
  loadAsync,
  isLoaded,
  isLoading,
  unloadAsync,
  processFontFamily,
};
