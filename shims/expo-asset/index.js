// No-op shim for expo-asset.
// expo/build/Expo.fx.js imports expo-asset which pulls in expo-file-system.
// Since expo-file-system native module is not linked in this bare workflow,
// we redirect it here to avoid "not available on android" warnings.

export class Asset {
  static fromURI() { return new Asset(); }
  static fromModule() { return new Asset(); }
  static loadAsync() { return Promise.resolve(); }
  async downloadAsync() { return this; }
  localUri = null;
  uri = null;
  name = '';
  type = '';
  width = 0;
  height = 0;
  downloaded = false;
}

export const useAssets = () => [[], null];
export default Asset;
