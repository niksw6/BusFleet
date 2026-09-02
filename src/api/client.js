import { API_BASE_URL } from '../constants/config';
import { getDBName, getSessionCookie, getUserData, storeSessionCookie } from '../utils/storage';
import { logApi } from '../utils/logger';

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

const getActionName = (url) => {
  const path = String(url || '').split('?')[0];
  return path.split('/').filter(Boolean).pop() || 'UnknownAction';
};

const getLoggedInUser = async () => {
  const user = await getUserData();
  return String(user?.User || user?.username || user?.UserCode || user?.Code || user?.name || 'Unknown').trim();
};

const formatApiLog = ({ method, result, user, action, status, url, payload, responseBody, message }) => [
  `${String(method).toUpperCase()} | ${result} | User: ${user} | Action: ${action}${status ? ` | Status: ${status}` : ''}`,
  `URL: ${url || 'Unavailable'}`,
  payload ? `Payload: ${payload}` : '',
  responseBody ? `Response: ${responseBody}` : message ? `Message: ${message}` : '',
].filter(Boolean).join('\n');

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
    const action = getActionName(fullUrl);
    const user = await getLoggedInUser();
    
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
      const message = data?.Message || data?.message || `Request failed (${response.status})`;
      logApi('ERROR', formatApiLog({
        method,
        result: 'Error',
        user,
        action,
        status: response.status,
        url: fullUrl,
        payload: method === 'GET' ? '' : options.body || '',
        message,
      }), method);
      const apiError = new Error(message);
      apiError.apiLogged = true;
      throw apiError;
    }

    const message = typeof data === 'object' ? (data?.Message || '') : '';
    const isEmptyResult = /no data found|no records found|no data available|no completed work entr(?:y|ies) found/i.test(String(message));
    const result = !isEmptyResult && (data?.Success === false || data?.Status === false) ? 'ERROR' : 'SUCCESS';
    logApi(result, formatApiLog({
      method,
      result: result === 'SUCCESS' ? 'Success' : 'Error',
      user,
      action,
      status: response.status,
      url: fullUrl,
      payload: method === 'GET' ? '' : options.body || '',
      responseBody: method === 'POST' ? JSON.stringify(data) : '',
      message,
    }), method);
    
    return { data, status: response.status, ok: response.ok };
  } catch (error) {
    if (error.name === 'AbortError') {
      logApi('ERROR', 'Error | Action: Request | Message: Request timeout');
      const timeoutError = new Error('Request timeout');
      timeoutError.apiLogged = true;
      throw timeoutError;
    }
    if (!error?.apiLogged) {
      logApi('ERROR', `Error | Action: Request | Message: ${error?.message || 'Unexpected request error'}`);
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
