import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/config';

export const storeData = async (key, value) => {
  try {
    const jsonValue = JSON.stringify(value);
    await AsyncStorage.setItem(key, jsonValue);
    return true;
  } catch (e) {
    console.error('Error storing data:', e);
    return false;
  }
};

export const getData = async (key) => {
  try {
    const jsonValue = await AsyncStorage.getItem(key);
    return jsonValue != null ? JSON.parse(jsonValue) : null;
  } catch (e) {
    console.error('Error retrieving data:', e);
    return null;
  }
};

export const removeData = async (key) => {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (e) {
    console.error('Error removing data:', e);
    return false;
  }
};

export const clearAll = async () => {
  try {
    await AsyncStorage.clear();
    return true;
  } catch (e) {
    console.error('Error clearing storage:', e);
    return false;
  }
};

export const storeDBName = (dbName) => storeData(STORAGE_KEYS.DB_NAME, dbName);
export const getDBName = () => getData(STORAGE_KEYS.DB_NAME);

export const storeUserData = (userData) => storeData(STORAGE_KEYS.USER_DATA, userData);
export const getUserData = () => getData(STORAGE_KEYS.USER_DATA);

export const storeAuthToken = (token) => storeData(STORAGE_KEYS.AUTH_TOKEN, token);
export const getAuthToken = () => getData(STORAGE_KEYS.AUTH_TOKEN);

export const storeSessionCookie = (cookie) => storeData(STORAGE_KEYS.SESSION_COOKIE, cookie);
export const getSessionCookie = () => getData(STORAGE_KEYS.SESSION_COOKIE);

export const storeLastCompany = (company) => storeData(STORAGE_KEYS.LAST_COMPANY, company);
export const getLastCompany = () => getData(STORAGE_KEYS.LAST_COMPANY);

export const clearAuthData = async () => {
  await removeData(STORAGE_KEYS.DB_NAME);
  await removeData(STORAGE_KEYS.USER_DATA);
  await removeData(STORAGE_KEYS.AUTH_TOKEN);
};
