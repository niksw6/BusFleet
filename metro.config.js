const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const customConfig = {
	resolver: {
		assetRegistryPath: 'react-native/Libraries/Image/AssetRegistry',
		extraNodeModules: {
			'missing-asset-registry-path': path.resolve(__dirname, 'shims/missing-asset-registry-path'),
			'react-native-web': path.resolve(__dirname, 'shims/react-native-web'),
			// Shim expo-font to avoid ExpoFontLoader native module crash
			// expo/build/Expo.fx.js imports expo-font at startup but native side is not registered
			'expo-font': path.resolve(__dirname, 'shims/expo-font'),
		},
		resolveRequest: (context, moduleName, platform) => {
			// Redirect expo-asset and expo-file-system to no-op shims.
			// expo/build/Expo.fx.js imports expo-asset which pulls in expo-file-system,
			// but neither native side is linked in this bare workflow.
			if (moduleName === 'expo-asset' || moduleName === 'expo-asset/build/Asset') {
				return { filePath: path.resolve(__dirname, 'shims/expo-asset/index.js'), type: 'sourceFile' };
			}
			// delegate everything else to the default resolver
			return context.resolveRequest(context, moduleName, platform);
		},
	},
};

module.exports = mergeConfig(defaultConfig, customConfig);
