import axios from 'axios';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const getBackendUrl = () => {
  if (Platform.OS === 'web') {
    return 'http://localhost:5000';
  }

  // If in development mode, automatically connect to the local development machine
  if (__DEV__) {
    // 1. Try to extract host from expo-constants (highly reliable in Expo Go)
    const hostUri = Constants?.expoConfig?.hostUri || 
                    Constants?.manifest2?.extra?.expoGoLaunchMetadata?.debuggerHost || 
                    Constants?.manifest?.debuggerHost;
    
    let host = '';
    if (hostUri) {
      host = hostUri.split(':')[0];
    } else {
      // 2. Fallback to parsing NativeModules.SourceCode.scriptURL
      const scriptURL = NativeModules.SourceCode?.scriptURL;
      if (scriptURL) {
        const match = scriptURL.match(/^[a-z]+:\/\/([^:/]+)(:\d+)?/i);
        if (match) {
          host = match[1];
        }
      }
    }

    if (host) {
      // Route to local IP address so that physical devices can still work!
      if (host.includes('ngrok') || host.includes('expo.dev')) {
        console.log(`[SparkleFlow API] Tunnel connection detected (${host}). Routing to local IP backend.`);
        return 'http://10.130.45.181:5000';
      }

      console.log(`[SparkleFlow API] Dev server host resolved: ${host} -> pointing to local IP: http://${host}:5000`);
      return `http://${host}:5000`;
    }
    
    // Default fallback for Android Emulator if host is not resolved
    const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
    console.log(`[SparkleFlow API] Development mode fallback: using ${fallback}`);
    return fallback;
  }

  // Point to the local machine IP address for physical APK testing!
  return 'http://10.130.45.181:5000';
};

export const BASE_URL = getBackendUrl();
export let CURRENT_BASE_URL = BASE_URL;

export const setDynamicBaseUrl = (url) => {
  if (!url) return;
  CURRENT_BASE_URL = url;
  apiClient.defaults.baseURL = `${url}/api`;
};

// Load saved backend URL override on startup
export const initializeBaseUrl = async () => {
  try {
    const savedUrl = await AsyncStorage.getItem('custom_backend_url');
    if (savedUrl) {
      setDynamicBaseUrl(savedUrl);
      console.log(`[API Client] Initialized with custom saved URL: ${savedUrl}`);
      return savedUrl;
    }
  } catch (e) {
    console.error('Failed to load custom backend URL:', e);
  }
  console.log(`[API Client] Initialized with default URL: ${CURRENT_BASE_URL}`);
  return CURRENT_BASE_URL;
};

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Dynamic session token vault (persists to localStorage if on Web for full reload persistence!)
let userToken = '';
let currentUser = null;

// Cross-platform session load helper
export const loadPersistentSession = () => {
  try {
    if (Platform.OS === 'web') {
      const savedToken = localStorage.getItem('sparkleflow_token');
      const savedUser = localStorage.getItem('sparkleflow_user');
      
      if (savedToken && savedUser) {
        userToken = savedToken;
        currentUser = JSON.parse(savedUser);
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
        return { token: savedToken, user: currentUser };
      }
    }
  } catch (e) {
    console.error('Failed to load persistent session:', e.message);
  }
  return null;
};

export const setAuthToken = (token) => {
  userToken = token;
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('sparkleflow_token', token);
      }
    } catch (e) {
      console.error('Failed to cache token:', e.message);
    }
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem('sparkleflow_token');
        localStorage.removeItem('sparkleflow_user');
      }
    } catch (e) {
      console.error('Failed to clear token cache:', e.message);
    }
  }
};

export const setCurrentUserStore = (user) => {
  currentUser = user;
  try {
    if (Platform.OS === 'web' && user) {
      localStorage.setItem('sparkleflow_user', JSON.stringify(user));
    }
  } catch (e) {
    console.error('Failed to cache user profile:', e.message);
  }
};

export const getCurrentUserStore = () => currentUser;
export const getAuthTokenStore = () => userToken;

// Response interceptor to handle global session expiry (401 Unauthorized)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Stale session detected — clear active session state immediately
      setAuthToken('');
      setCurrentUserStore(null);
      
      // Auto-reload on Web to reset React Navigation stack container straight to the Sign In state!
      if (Platform.OS === 'web') {
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

// API functions
export const authAPI = {
  // Admin password login
  login: async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password });
    if (res.data.success) {
      setAuthToken(res.data.token);
      setCurrentUserStore(res.data.user);
    }
    return res.data;
  },

  // ── Unified OTP methods (Worker & Contractor) ──────────────────────────────
  // Request OTP — for both login (existing user) and registration (new user)
  requestOtp: async (email, role, name = '', phoneNumber = '', companyName = '') => {
    const res = await apiClient.post('/auth/otp/request', {
      email,
      role,
      name,
      phoneNumber,
      companyName
    });
    return res.data;
  },

  // Verify OTP — authenticates and returns JWT; creates account for new users
  verifyOtp: async (email, code, role, name = '', phoneNumber = '', companyName = '') => {
    const res = await apiClient.post('/auth/otp/verify', {
      email,
      code,
      role,
      name,
      phoneNumber,
      companyName
    });
    if (res.data.success) {
      setAuthToken(res.data.token);
      setCurrentUserStore(res.data.user);
    }
    return res.data;
  },

  // ── Legacy aliases (used by ContractorOtpScreen — kept for compatibility) ──
  contractorRequestOtp: async (email, name = '', phoneNumber = '', companyName = '') => {
    const res = await apiClient.post('/auth/otp/request', {
      email,
      role: 'contractor',
      name,
      phoneNumber,
      companyName
    });
    return res.data;
  },
  contractorVerifyOtp: async (email, code, name = '', phoneNumber = '', companyName = '') => {
    const res = await apiClient.post('/auth/otp/verify', {
      email,
      code,
      role: 'contractor',
      name,
      phoneNumber,
      companyName
    });
    if (res.data.success) {
      setAuthToken(res.data.token);
      setCurrentUserStore(res.data.user);
    }
    return res.data;
  },

  getProfile: async () => {
    const res = await apiClient.get('/auth/profile');
    return res.data;
  },
  getWorkers: async () => {
    const res = await apiClient.get('/auth/workers');
    return res.data;
  }
};

export const contractorAPI = {
  getPackages: async () => {
    const res = await apiClient.get('/contractor/packages');
    return res.data;
  },
  searchWorkers: async (query = '') => {
    const res = await apiClient.get(`/contractor/workers/search?query=${query}`);
    return res.data;
  },
  createContract: async (contractData) => {
    const res = await apiClient.post('/contractor/contracts', contractData);
    return res.data;
  },
  getContracts: async () => {
    const res = await apiClient.get('/contractor/contracts');
    return res.data;
  }
};

export const workerAPI = {
  getAssignments: async () => {
    const res = await apiClient.get('/worker/assignments');
    return res.data;
  },
  respondToAssignment: async (assignmentId, response) => {
    const res = await apiClient.post(`/worker/assignments/${assignmentId}/respond`, { response });
    return res.data;
  },
  getNotifications: async () => {
    const res = await apiClient.get('/worker/notifications');
    return res.data;
  },
  markNotificationRead: async (id) => {
    const res = await apiClient.put(`/worker/notifications/${id}/read`);
    return res.data;
  },
  logGps: async (contractId, lat, lng, workerStatus = 'active') => {
    const res = await apiClient.post('/gps/log', { contractId, lat, lng, workerStatus });
    return res.data;
  },
  startAssignment: async (id) => {
    const res = await apiClient.post(`/worker/assignments/${id}/start`);
    return res.data;
  },
  endAssignment: async (id) => {
    const res = await apiClient.post(`/worker/assignments/${id}/end`);
    return res.data;
  }
};

export const jobsAPI = {
  create: async (jobData) => {
    const res = await apiClient.post('/jobs/create', jobData);
    return res.data;
  },
  getWorkerJobs: async () => {
    const res = await apiClient.get('/jobs/worker');
    return res.data;
  },
  getAllJobs: async () => {
    const res = await apiClient.get('/jobs/all');
    return res.data;
  },
  updateStatus: async (jobId, status) => {
    const res = await apiClient.put(`/jobs/${jobId}/status`, { status });
    return res.data;
  }
};

export const locationAPI = {
  log: async (latitude, longitude, speed, jobId) => {
    const res = await apiClient.post('/location/log', { latitude, longitude, speed, jobId });
    return res.data;
  },
  getActiveLocations: async () => {
    const res = await apiClient.get('/location/active');
    return res.data;
  },
  getHistory: async (jobId) => {
    const res = await apiClient.get(`/location/history/${jobId}`);
    return res.data;
  }
};

export const attendanceAPI = {
  clockIn: async () => {
    const res = await apiClient.post('/attendance/clock-in');
    return res.data;
  },
  clockOut: async () => {
    const res = await apiClient.post('/attendance/clock-out');
    return res.data;
  },
  getReport: async (workerId = '') => {
    const url = workerId ? `/attendance/report?workerId=${workerId}` : '/attendance/report';
    const res = await apiClient.get(url);
    return res.data;
  }
};

export const adminAPI = {
  getContractors: async () => {
    const res = await apiClient.get('/admin/contractors');
    return res.data.contractors || res.data;
  },
  getWorkers: async () => {
    const res = await apiClient.get('/admin/workers');
    return res.data.workers || res.data;
  },
  getWorkerHistory: async (workerId) => {
    const res = await apiClient.get(`/admin/workers/${workerId}/history`);
    return res.data.history || res.data;
  },
  getContracts: async () => {
    const res = await apiClient.get('/admin/contracts');
    return res.data;
  },
  getReports: async () => {
    const res = await apiClient.get('/admin/reports');
    return res.data;
  },
  getPackages: async () => {
    const res = await apiClient.get('/admin/packages');
    return res.data;
  },
  updatePackage: async (id, data) => {
    const res = await apiClient.put(`/admin/packages/${id}`, data);
    return res.data;
  }
};

export const gpsAPI = {
  log: async (contractId, lat, lng, workerStatus) => {
    const res = await apiClient.post('/gps/log', { contractId, lat, lng, workerStatus });
    return res.data;
  },
  getContractHistory: async (contractId) => {
    const res = await apiClient.get(`/gps/contract/${contractId}`);
    return res.data;
  }
};

export default apiClient;
