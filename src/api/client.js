import { API_BASE_URL } from '../constants/config';
import { getDBName, getSessionCookie, storeSessionCookie } from '../utils/storage';

// Navigation ref for programmatic navigation from API errors
let navigationRef = null;

export const setNavigationRef = (ref) => {
  navigationRef = ref;
};

const normalizeApiResult = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const hasSuccess = typeof payload.Success === 'boolean';
  const hasStatus = typeof payload.Status === 'boolean';

  if (!hasSuccess && hasStatus) {
    return { ...payload, Success: payload.Status };
  }
  if (hasSuccess && !hasStatus) {
    return { ...payload, Status: payload.Success };
  }
  return payload;
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

    // Explicitly attach session cookie to every request.
    // 'credentials: include' is unreliable on Android release builds;
    // sending the Cookie header directly is the only reliable approach.
    const sessionCookie = await getSessionCookie();
    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }
    
    const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
    const method = options.method || 'GET';
    
    // Log all requests with full URL and method
    console.log(`\n📡 API ${method} REQUEST`);
    console.log(`   🔗 URL: ${fullUrl}`);
    if (method !== 'GET' && options.body) {
      try {
        const bodyObj = JSON.parse(options.body);
        console.log(`   📦 Payload:`, JSON.stringify(bodyObj));
      } catch (e) {
        console.log(`   📦 Payload: ${options.body}`);
      }
    } else if (method === 'GET') {
      console.log(`   📦 Query: GET request (no body)`);
    }
    console.log(`   🔐 Headers:`, { DBName: headers.DBName, ContentType: headers['Content-Type'], HasCookie: !!headers.Cookie });
    
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
      data = normalizeApiResult(await response.json());
    } else {
      data = await response.text();
    }
    
    if (!response.ok) {
      if (!options.suppressErrorLog) {
        console.error(`\n❌ API ${method} RESPONSE ERROR`);
        console.error(`   🔗 URL: ${fullUrl}`);
        console.error(`   ⚠️  Status: ${response.status}`);
        console.error(`   📄 Response:`, data);
      }
      throw new Error(data.Message || data.message || 'Request failed');
    }
    
    console.log(`\n✅ API ${method} RESPONSE SUCCESS`);
    console.log(`   🔗 URL: ${fullUrl}`);
    console.log(`   📊 Status: ${response.status}`);
    console.log(`   📄 Response:`, JSON.stringify(data));
    
    return { data, status: response.status, ok: response.ok };
  } catch (error) {
    if (!options.suppressErrorLog) {
      console.error(`\n❌ API REQUEST FAILED`);
      console.error(`   🔗 URL: ${url}`);
      console.error(`   💥 Error: ${error.message}`);
      if (error.name === 'AbortError') {
        console.error(`   ⏱️  Reason: Request timeout (60s exceeded)`);
      }
    }
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
