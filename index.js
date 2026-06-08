require('@react-native/js-polyfills/error-guard');

if (typeof globalThis.console === 'undefined') {
	const noop = function () {};
	globalThis.console = {
		log: noop,
		info: noop,
		warn: noop,
		error: noop,
		debug: noop,
		trace: noop,
	};
}

const { AppRegistry } = require('react-native');
const AppModule = require('./App');
const App = AppModule.default || AppModule;

AppRegistry.registerComponent('main', () => App);
