import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_KEY = '@fleetdata_diagnostic_log';
const MAX_CHARS = 30000;
let handlersInstalled = false;

const timestamp = () => new Date().toISOString();

const trimLog = (text) => {
  if (!text) return '';
  if (text.length <= MAX_CHARS) return text;
  return text.slice(text.length - MAX_CHARS);
};

export const appendDiagnostic = async (level, message) => {
  try {
    const existing = (await AsyncStorage.getItem(LOG_KEY)) || '';
    const next = `${existing}\n[${timestamp()}] [${level}] ${message}`;
    await AsyncStorage.setItem(LOG_KEY, trimLog(next));
  } catch (error) {
    console.log('Diagnostic append failed:', error?.message);
  }
};

export const getDiagnostics = async () => {
  try {
    return (await AsyncStorage.getItem(LOG_KEY)) || '';
  } catch {
    return '';
  }
};

export const clearDiagnostics = async () => {
  try {
    await AsyncStorage.removeItem(LOG_KEY);
  } catch (error) {
    console.log('Diagnostic clear failed:', error?.message);
  }
};

export const installDiagnosticHandlers = () => {
  if (handlersInstalled) return;
  handlersInstalled = true;

  appendDiagnostic('INFO', 'Diagnostic handlers installed');
};
