import axios from 'axios';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRODUCTION_URL = 'https://cleaningtrackerapp-production-1896.up.railway.app';

export const isStandaloneApp = () =>
  Constants.executionEnvironment === 'standalone' ||
  Constants.executionEnvironment === 'bare';

const isLocalOrPrivateUrl = (url) => {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('10.0.2.2') ||
    /https?:\/\/192\.168\./.test(lower) ||
    /https?:\/\/10\.\d+\.\d+\.\d+/.test(lower) ||
    lower.startsWith('http://')
  );
};

export const getConfiguredProductionUrl = () => {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl;
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  return (fromExtra || fromEnv || PRODUCTION_URL).replace(/\/$/, '');
};

const resolveDevHost = () => {
  const hostUri =
    Constants?.expoConfig?.hostUri ||
    Constants?.manifest2?.extra?.expoGoLaunchMetadata?.debuggerHost ||
    Constants?.manifest?.debuggerHost;

  if (hostUri) {
    return hostUri.split(':')[0];
  }

  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (scriptURL) {
    const match = scriptURL.match(/^[a-z]+:\/\/([^:/]+)(:\d+)?/i);
    if (match) return match[1];
  }

  return '';
};

const getBackendUrl = () => {
  const productionUrl = getConfiguredProductionUrl();

  // Web: use local backend while developing, cloud URL for production web builds
  if (Platform.OS === 'web') {
    return __DEV__ ? 'http://localhost:5000' : productionUrl;
  }

  // Standalone APK/IPA (EAS build) — always use the public cloud server
  if (isStandaloneApp()) {
    return productionUrl;
  }

  // Expo Go / dev client on a physical device or emulator
  if (__DEV__) {
    const host = resolveDevHost();
    if (host && !host.includes('ngrok') && !host.includes('expo.dev')) {
      console.log(`[CrewLynk API] Dev host: ${host} -> http://${host}:5000`);
      return `http://${host}:5000`;
    }

    const fallback = Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
    console.log(`[CrewLynk API] Dev fallback: ${fallback}`);
    return fallback;
  }

  return productionUrl;
};

export const getBaseUrl = () => CURRENT_BASE_URL;

/** @deprecated Use getBaseUrl() — kept for older imports */
export const BASE_URL = getBackendUrl();

export let CURRENT_BASE_URL = BASE_URL;

export const setDynamicBaseUrl = (url) => {
  if (!url) return;
  const clean = url.trim().replace(/\/$/, '');
  CURRENT_BASE_URL = clean;
  apiClient.defaults.baseURL = `${clean}/api`;
};

export const checkServerHealth = async (baseUrl = CURRENT_BASE_URL) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

// Load saved backend URL override on startup (dev / Expo Go only)
export const initializeBaseUrl = async () => {
  const defaultUrl = getBackendUrl();
  CURRENT_BASE_URL = defaultUrl;
  apiClient.defaults.baseURL = `${defaultUrl}/api`;

  // Never let a stale local URL break a production APK
  if (isStandaloneApp()) {
    try {
      const savedUrl = await AsyncStorage.getItem('custom_backend_url');
      if (savedUrl && isLocalOrPrivateUrl(savedUrl)) {
        await AsyncStorage.removeItem('custom_backend_url');
        console.log('[API Client] Removed stale local backend URL from storage');
      }
    } catch (e) {
      console.error('Failed to clear stale backend URL:', e);
    }
    console.log(`[API Client] Standalone app -> ${CURRENT_BASE_URL}`);
    return CURRENT_BASE_URL;
  }

  try {
    const savedUrl = await AsyncStorage.getItem('custom_backend_url');
    if (savedUrl && !isLocalOrPrivateUrl(savedUrl)) {
      setDynamicBaseUrl(savedUrl);
      console.log(`[API Client] Custom URL: ${savedUrl}`);
      return savedUrl;
    }
  } catch (e) {
    console.error('Failed to load custom backend URL:', e);
  }

  console.log(`[API Client] Default URL: ${CURRENT_BASE_URL}`);
  return CURRENT_BASE_URL;
};

const apiClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Dynamic session token vault (persists to localStorage if on Web for full reload persistence!)
let userToken = '';
let currentUser = null;

// Cross-platform session load helper
export const loadPersistentSession = async () => {
  try {
    const savedToken = await AsyncStorage.getItem('sparkleflow_token');
    const savedUser = await AsyncStorage.getItem('sparkleflow_user');

    if (savedToken && savedUser) {
      userToken = savedToken;
      currentUser = JSON.parse(savedUser);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
      return { token: savedToken, user: currentUser };
    }
  } catch (e) {
    console.error('Failed to load persistent session:', e.message);
  }
  return null;
};

export const setAuthToken = async (token) => {
  userToken = token;
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    try {
      await AsyncStorage.setItem('sparkleflow_token', token);
    } catch (e) {
      console.error('Failed to cache token:', e.message);
    }
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
    try {
      await AsyncStorage.removeItem('sparkleflow_token');
      await AsyncStorage.removeItem('sparkleflow_user');
    } catch (e) {
      console.error('Failed to clear token cache:', e.message);
    }
  }
};

export const setCurrentUserStore = async (user) => {
  currentUser = user;
  try {
    if (user) {
      await AsyncStorage.setItem('sparkleflow_user', JSON.stringify(user));
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
  async (error) => {
    if (error.response && error.response.status === 401) {
      await setAuthToken('');
      await setCurrentUserStore(null);

      if (Platform.OS === 'web') {
        window.location.reload();
      }
    }
    return Promise.reject(error);
  }
);

// API functions
export const authAPI = {
  login: async (email, password) => {
    const res = await apiClient.post('/auth/login', { email, password });
    if (res.data.success) {
      await setAuthToken(res.data.token);
      await setCurrentUserStore(res.data.user);
    }
    return res.data;
  },

  requestOtp: async (email, role, name = '', phoneNumber = '', companyName = '', tags = '', locations = '', state = '', hourlyRate = '') => {
    const res = await apiClient.post('/auth/otp/request', {
      email,
      role,
      name,
      phoneNumber,
      companyName,
      tags,
      locations,
      state,
      hourlyRate
    });
    return res.data;
  },

  verifyOtp: async (email, code, role, name = '', phoneNumber = '', companyName = '', tags = '', locations = '', state = '', hourlyRate = '') => {
    const res = await apiClient.post('/auth/otp/verify', {
      email,
      code,
      role,
      name,
      phoneNumber,
      companyName,
      tags,
      locations,
      state,
      hourlyRate
    });
    if (res.data.success) {
      await setAuthToken(res.data.token);
      await setCurrentUserStore(res.data.user);
    }
    return res.data;
  },

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
      await setAuthToken(res.data.token);
      await setCurrentUserStore(res.data.user);
    }
    return res.data;
  },

  getProfile: async () => {
    const res = await apiClient.get('/auth/profile');
    return res.data;
  },
  updateProfile: async (profileData) => {
    const res = await apiClient.put('/auth/profile', profileData);
    if (res.data.success && res.data.user) {
      await setCurrentUserStore(res.data.user);
    }
    return res.data;
  },
  getNotifications: async () => {
    const res = await apiClient.get('/auth/notifications');
    return res.data;
  },
  markNotificationRead: async (id) => {
    const res = await apiClient.put(`/auth/notifications/${id}/read`);
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
  reassignWorker: async (assignmentId, workerId) => {
    const res = await apiClient.post(`/contractor/reassign-worker/${assignmentId}`, { workerId });
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
  },
  getClientRequests: async () => {
    const res = await apiClient.get('/contractor/client-requests');
    return res.data;
  },
  submitOffer: async (requestId, price) => {
    const res = await apiClient.post(`/contractor/client-requests/${requestId}/offer`, { price });
    return res.data;
  },
  getWorkers: async (date = '', startTime = '', durationMinutes = '') => {
    let url = '/contractor/workers';
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (startTime) params.append('startTime', startTime);
    if (durationMinutes) params.append('durationMinutes', durationMinutes);
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    const res = await apiClient.get(url);
    return res.data;
  },
  addWorker: async (workerId) => {
    const res = await apiClient.post('/contractor/workers/add', { workerId });
    return res.data;
  },
  getWorkerProfile: async (workerId, startDate = '', endDate = '') => {
    let url = `/contractor/workers/${workerId}/profile`;
    if (startDate && endDate) url += `?startDate=${startDate}&endDate=${endDate}`;
    const res = await apiClient.get(url);
    return res.data;
  },
  assignWorker: async (workerId, contractId) => {
    const res = await apiClient.post(`/contractor/workers/${workerId}/assign`, { contractId });
    return res.data;
  },
  postFreelanceJob: async (jobData) => {
    const res = await apiClient.post('/contractor/freelance', jobData);
    return res.data;
  },
  getFreelanceJobs: async () => {
    const res = await apiClient.get('/contractor/freelance');
    return res.data;
  },
  approveFreelancer: async (jobId, workerId) => {
    const res = await apiClient.post(`/contractor/freelance/${jobId}/approve/${workerId}`);
    return res.data;
  },
  upgradePackage: async () => {
    const res = await apiClient.post('/contractor/package/upgrade');
    return res.data;
  },
  selectPackage: async (packageId) => {
    const res = await apiClient.post('/contractor/package/select', { packageId });
    return res.data;
  },
  setRenewOption: async (autoRenew) => {
    const res = await apiClient.post('/contractor/package/renew-option', { autoRenew });
    return res.data;
  },
  renewPackage: async () => {
    const res = await apiClient.post('/contractor/package/renew');
    return res.data;
  },
  getSubscription: async () => {
    const res = await apiClient.get('/contractor/package/subscription');
    return res.data;
  },
  handoverProject: async (contractId) => {
    const res = await apiClient.put(`/contractor/contracts/${contractId}/handover`);
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
  },
  getFreelanceJobs: async () => {
    const res = await apiClient.get('/worker/freelance');
    return res.data;
  },
  applyFreelanceJob: async (jobId) => {
    const res = await apiClient.post(`/worker/freelance/${jobId}/apply`);
    return res.data;
  },
  getContractors: async () => {
    const res = await apiClient.get('/worker/contractors');
    return res.data;
  },
  getContractorProjects: async (contractorId) => {
    const res = await apiClient.get(`/worker/contractors/${contractorId}/projects`);
    return res.data;
  }
};

export const clientAPI = {
  createRequest: async (requestData) => {
    const res = await apiClient.post('/client/requests', requestData);
    return res.data;
  },
  getRequests: async () => {
    const res = await apiClient.get('/client/requests');
    return res.data;
  },
  getOffers: async (requestId) => {
    const res = await apiClient.get(`/client/requests/${requestId}/offers`);
    return res.data;
  },
  acceptOffer: async (requestId, offerId) => {
    const res = await apiClient.post(`/client/requests/${requestId}/offers/${offerId}/accept`);
    return res.data;
  },
  getContractors: async (category = '', location = '') => {
    const res = await apiClient.get(`/client/contractors?category=${category}&location=${location}`);
    return res.data;
  },
  getAssociatedContractors: async () => {
    const res = await apiClient.get('/client/associated-contractors');
    return res.data;
  },
  rateContractor: async (contractorId, rating, review, contractId) => {
    const res = await apiClient.post(`/client/contractors/${contractorId}/rate`, { rating, review, contractId });
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
