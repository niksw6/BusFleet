import { API_BASE_URL } from '../constants/config';
import { getDBName, getSessionCookie, storeSessionCookie } from '../utils/storage';

// Navigation ref for programmatic navigation from API errors
let navigationRef = null;

export const setNavigationRef = (ref) => {
  navigationRef = ref;
};

// Fetch-based API client (native to React Native)
const request = async (url, options = {}) => {
  try {
    const dbName = await getDBName();
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };
    
    if (dbName) {
      headers['DBName'] = dbName;
    }
    
    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
    
    // Log requests
    if (options.method && options.method !== 'GET') {
      console.log(`🌐 API Request: ${options.method} ${fullUrl}`);
      console.log(`🌐 Request Headers:`, headers);
      if (options.body) {
        console.log(`🌐 Request Body Length:`, options.body.length, 'characters');
      }
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || 60000);
    
    const response = await fetch(fullUrl, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'include',
    });
    
    clearTimeout(timeoutId);
    
    // Handle session cookies
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const sessionMatch = setCookie.match(/ASP\.NET_SessionId=([^;]+)/);
      if (sessionMatch) {
        const sessionCookie = `ASP.NET_SessionId=${sessionMatch[1]}`;
        await storeSessionCookie(sessionCookie);
      }
    }
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    if (!response.ok) {
      console.error(`❌ API Response Error: ${response.status}`, data);
      throw new Error(data.Message || data.message || 'Request failed');
    }
    
    if (options.method && options.method !== 'GET') {
      console.log(`✅ API Response: ${fullUrl}`, response.status);
    }
    
    return { data, status: response.status, ok: response.ok };
  } catch (error) {
    console.error(`❌ API Request Failed for ${url}:`, error.message);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
};

// HTTP methods
export const get = (url, config = {}) => {
  return request(url, { method: 'GET', ...config });
};

export const post = (url, data, config = {}) => {
  return request(url, {
    method: 'POST',
    body: JSON.stringify(data),
    ...config,
  });
};

export const put = (url, data, config = {}) => {
  return request(url, {
    method: 'PUT',
    body: JSON.stringify(data),
    ...config,
  });
};

export const del = (url, config = {}) => {
  return request(url, { method: 'DELETE', ...config });
};

// Error handler
export const handleApiError = (error) => {
  if (error.message?.includes('timeout')) {
    return 'Request timeout. Please check your connection and try again.';
  }
  if (error.message?.includes('Network request failed')) {
    return 'No response from server. Please check your internet connection.';
  }
  return error.message || 'An unexpected error occurred';
};

// Default export for compatibility
export default { get, post, put, del };
