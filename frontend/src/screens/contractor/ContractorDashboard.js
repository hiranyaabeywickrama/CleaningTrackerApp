import React, { useState, useEffect, useRef } from 'react';
import backScrollEmitter from '../../utils/backScrollEmitter';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Alert,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Platform,
  Image,
  BackHandler,
  Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../theme/colors';
import { contractorAPI, getBaseUrl, gpsAPI, authAPI } from '../../api/client';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import TimeInput from '../../components/TimeInput';
import AppFooter from '../../components/AppFooter';
import io from 'socket.io-client';
import MapViewContainer from '../../components/MapViewContainer';
import EmbeddedGoogleMap from '../../components/EmbeddedGoogleMap';
import * as Location from 'expo-location';

// ── New York Default Coordinates (Seeder alignment) ──────────────────────────
const NY_LAT = 40.7128;
const NY_LNG = -73.9786;

const CATEGORY_OPTIONS = [
  { id: 'Cleaning', label: 'Cleaning', icon: '🧹' },
  { id: 'Plumbing', label: 'Plumbing', icon: '🔧' },
  { id: 'Electrical', label: 'Electrical', icon: '⚡' },
  { id: 'Carpentry', label: 'Carpentry', icon: '🪚' },
  { id: 'Gardening', label: 'Gardening', icon: '🌱' },
  { id: 'Construction', label: 'Construction', icon: '🏗️' },
  { id: 'HVAC', label: 'HVAC', icon: '❄️' },
  { id: 'Moving', label: 'Moving', icon: '📦' },
  { id: 'Others', label: 'Others', icon: '➕' }
];

const getDaysInMonth = (date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = firstDay.getDay(); 
  
  const days = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }
  return days;
};

const getTodayString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getCurrentTime24 = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const ContractorDashboard = ({ user, onLogout }) => {
  const [profileUser, setProfileUser] = useState(user);

  // Profile editing states
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phoneNumber || '');
  const [profileCompanyName, setProfileCompanyName] = useState(user?.companyName || '');
  const [profileLocations, setProfileLocations] = useState(user?.locations?.join(', ') || '');
  const [profileTags, setProfileTags] = useState(user?.tags?.join(', ') || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // --- Notifications States ---
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [activeTab, setActiveTab] = useState('projects'); // 'projects', 'newContract', 'gps'

  // ── Onboarding Flow States ──
  const [onboardingStep, setOnboardingStep] = useState(1); // 1 = Select Plan, 2 = Select Crew, null = Completed/Dashboard
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  // ── Payment Modal Wizard States ──
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentStep, setPaymentStep] = useState('SELECT_METHOD'); // 'SELECT_METHOD', 'PAYPAL_LOGIN', 'PAYPAL_CONFIRM', 'PAYPAL_SUCCESS', 'CREDIT_CARD', 'CARD_SUCCESS'
  const [paypalEmail, setPaypalEmail] = useState('');
  const [paypalPassword, setPaypalPassword] = useState('');
  const [cardholderName, setCardholderName] = useState('John Smith');
  const [cardNumber, setCardNumber] = useState('1234 5678 9012 3456');
  const [expiryDate, setExpiryDate] = useState('MM/YY');
  const [cvv, setCvv] = useState('123');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // ── Packages & Contracts State ──────────────────────────────────────────────
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null); // null = Package selection screen
  const [contracts, setContracts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bidsSubTab, setBidsSubTab] = useState('open'); // 'open' or 'accepted'
  const [selectedWorkersForContract, setSelectedWorkersForContract] = useState({}); // { [contractId]: [workerId1, workerId2] }
  const [expandedAcceptedBidId, setExpandedAcceptedBidId] = useState(null);

  // ── Contract Form State ─────────────────────────────────────────────────────
  const [clientName, setClientName] = useState(user?.companyName || user?.name || '');
  const [clientPhone, setClientPhone] = useState(user?.phoneNumber || '');
  const [clientCountryCode, setClientCountryCode] = useState('+94');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(NY_LAT.toString());
  const [longitude, setLongitude] = useState(NY_LNG.toString());
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(getTodayString());
  const [startTime, setStartTime] = useState(getCurrentTime24());
  const [durationMinutes, setDurationMinutes] = useState('120');
  const [pricePerHour, setPricePerHour] = useState('25');
  
  // Premium contract custom state
  const [requiredWorkersCount, setRequiredWorkersCount] = useState(1);
  const [isUrgent, setIsUrgent] = useState(false);

  // ── Search Place Autocomplete States ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchingPlace, setSearchingPlace] = useState(false);

  // ── Worker Search & Crew Selection ──────────────────────────────────────────
  const [workerQuery, setWorkerQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [searching, setSearching] = useState(false);

  // ── Tracking Page State ─────────────────────────────────────────────────────
  const [selectedContractForMap, setSelectedContractForMap] = useState(null);
  const [liveWorkers, setLiveWorkers] = useState({}); // { workerId: { lat, lng, status, distanceToClient, totalViolations, timeSpentOutsideMinutes, workedMinutes, checkInTime } }
  const [socket, setSocket] = useState(null);
  const [geofenceAlerts, setGeofenceAlerts] = useState([]);

  // ── Map Simulation Settings ─────────────────────────────────────────────────
  const [mockProgress, setMockProgress] = useState(0); // 0 to 100% path progress

  // Animations
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [tabHistory, setTabHistory] = useState(['projects']);
  const scrollRef = useRef(null);

  // --- Crew Roster Tab States ---
  const [rosterWorkers, setRosterWorkers] = useState([]);
  const [searchWorkerEmail, setSearchWorkerEmail] = useState('');
  const [foundWorkerList, setFoundWorkerList] = useState([]);
  const [selectedRosterWorker, setSelectedRosterWorker] = useState(null);
  const [workerProfileStats, setWorkerProfileStats] = useState(null);
  const [workerProfilePeriod, setWorkerProfilePeriod] = useState('week'); // 'week', 'month', '3months'
  const [workerProfileJobs, setWorkerProfileJobs] = useState([]);
  const [loadingWorkerProfile, setLoadingWorkerProfile] = useState(false);
  const [handoverContractId, setHandoverContractId] = useState('');
  const [showHandoverDropdown, setShowHandoverDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [assigningWorker, setAssigningWorker] = useState(false);

  useEffect(() => {
    const listener = (markHandled) => {
      try {
        if (scrollRef.current && scrollRef.current.scrollTo) {
          scrollRef.current.scrollTo({ y: 0, animated: true });
          markHandled();
        }
      } catch (e) {
        // ignore
      }
    };
    const unsub = backScrollEmitter.subscribe(listener);
    return () => unsub();
  }, []);

  const fadeTransition = (cb) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false
    }).start(() => {
      cb();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false
      }).start();
    });
  };

  const navigateToTab = (nextTab) => {
    if (!nextTab || nextTab === activeTab) return;
    if (showCalendarModal) {
      setShowCalendarModal(false);
    }
    if (nextTab !== 'roster' && nextTab !== 'newContract' && selectedRosterWorker) {
      setSelectedRosterWorker(null);
    }
    setTabHistory((prev) => {
      if (prev[prev.length - 1] === nextTab) return prev;
      return [...prev, nextTab];
    });
    setActiveTab(nextTab);
  };

  const goBack = () => {
    if (activeTab === 'roster' && selectedRosterWorker) {
      setSelectedRosterWorker(null);
      setActiveTab('projects');
      return true;
    }

    if (activeTab === 'newContract' && selectedRosterWorker) {
      setSelectedPackage(null);
      setActiveTab('roster');
      return true;
    }

    if (activeTab === 'newContract' && selectedPackage !== null) {
      fadeTransition(() => {
        setSelectedPackage(null);
        setActiveTab('projects');
        setTabHistory((prev) => {
          const history = [...prev];
          if (history[history.length - 1] !== 'projects') history.push('projects');
          return history;
        });
      });
      return true;
    }

    if (activeTab !== 'projects' && tabHistory.length > 1) {
      setTabHistory((prev) => {
        const history = [...prev];
        history.pop();
        const previousTab = history[history.length - 1] || 'projects';
        setActiveTab(previousTab);
        return history;
      });
      return true;
    }

    return false;
  };

  // ── Reverse Geocode Handler (coordinates -> English address) ──
  const handleReverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=en`
      );
      const data = await response.json();
      if (data && data.features && data.features.length > 0) {
        const props = data.features[0].properties || {};
        const parts = [];
        if (props.name) parts.push(props.name);
        if (props.housenumber) parts.push(props.housenumber);
        if (props.street) parts.push(props.street);
        if (props.district) parts.push(props.district);
        if (props.city) parts.push(props.city);
        if (props.state) parts.push(props.state);
        if (props.postcode) parts.push(props.postcode);
        if (props.country) parts.push(props.country);
        
        let displayName = parts.filter(Boolean).join(', ');
        
        // Clean up Sinhala/Tamil characters for Sri Lanka
        displayName = displayName
          .replace(/ශ්‍රී ලංකාව/g, 'Sri Lanka')
          .replace(/இலங்கை/g, 'Sri Lanka');
          
        setAddress(displayName);
      }
    } catch (e) {
      console.warn('Reverse geocoding error:', e.message);
    }
  };

  // ── Fetch Packages & Contracts ──────────────────────────────────────────────
  const fetchGpsHistory = async (contractId, currentContract = selectedContractForMap) => {
    if (!contractId) return;
    try {
      const res = await gpsAPI.getContractHistory(contractId);
      if (res.success) {
        const updatedLiveWorkers = {};
        
        res.assignments.forEach(assign => {
          const workerId = assign.workerId?._id || assign.workerId;
          if (!workerId) return;

          // Find latest log for this worker in the logs history
          const latestLog = res.logs.find(log => {
            const logWorkerId = log.workerId?._id || log.workerId;
            return logWorkerId && logWorkerId.toString() === workerId.toString();
          });

          // Calculate workedMinutes (like in socket handler)
          let workedMins = assign.actualWorkedMinutes || 0;
          if (assign.checkInTime && !assign.checkOutTime) {
            const diffMs = new Date() - new Date(assign.checkInTime);
            let totalMins = diffMs / 1000 / 60;
            if (assign.outsideStartTime) {
              const extraOutside = (new Date() - new Date(assign.outsideStartTime)) / 1000 / 60;
              workedMins = totalMins - (assign.timeSpentOutsideMinutes || 0) - extraOutside;
            } else {
              workedMins = totalMins - (assign.timeSpentOutsideMinutes || 0);
            }
            workedMins = Math.max(0, Math.floor(workedMins));
          }

          // Calculate distance to client
          let distanceToClient = 0;
          let lat = currentContract?.location?.coordinates?.lat || NY_LAT;
          let lng = currentContract?.location?.coordinates?.lng || NY_LNG;

          if (latestLog) {
            lat = latestLog.lat;
            lng = latestLog.lng;
            
            // Haversine formula to client coords
            const clientLat = currentContract?.location?.coordinates?.lat;
            const clientLng = currentContract?.location?.coordinates?.lng;
            if (clientLat !== undefined && clientLng !== undefined) {
              const R = 6371000;
              const phi1 = (clientLat * Math.PI) / 180;
              const phi2 = (lat * Math.PI) / 180;
              const deltaPhi = ((lat - clientLat) * Math.PI) / 180;
              const deltaLambda = ((lng - clientLng) * Math.PI) / 180;
              const a =
                Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              distanceToClient = Math.round(R * c);
            }
          }

          updatedLiveWorkers[workerId.toString()] = {
            lat,
            lng,
            timestamp: latestLog ? new Date(latestLog.timestamp) : null,
            status: assign.workerStatus || 'Traveling',
            distanceToClient,
            totalViolations: assign.totalViolations || 0,
            timeSpentOutsideMinutes: assign.timeSpentOutsideMinutes || 0,
            workedMinutes: workedMins,
            checkInTime: assign.checkInTime
          };
        });

        setLiveWorkers(updatedLiveWorkers);
      }
    } catch (err) {
      console.warn('Error fetching contract GPS history:', err.message);
    }
  };

  useEffect(() => {
    setProfileUser(user);
  }, [user]);

  useEffect(() => {
    if (profileUser) {
      setProfileName(profileUser.name || '');
      setProfilePhone(profileUser.phoneNumber || '');
      setProfileCompanyName(profileUser.companyName || '');
      setProfileLocations(profileUser.locations?.join(', ') || '');
      setProfileTags(profileUser.tags?.join(', ') || '');
    }
  }, [profileUser]);

  const formatPlanRenewalText = (pkgName, price) => {
    if (subscription && subscription.packageName === pkgName && subscription.renewsOn) {
      const renewDate = new Date(subscription.renewsOn).toLocaleDateString();
      if (subscription.planAutoRenew) {
        return `Auto-renews on ${renewDate} • $${price}/month`;
      }
      return `Expires on ${renewDate} • auto-renew off`;
    }
    return `Billed monthly • $${price}/month • renews after 30 days`;
  };

  const loadInitialData = async () => {
    try {
      setRefreshing(true);
      const subRes = await contractorAPI.getSubscription();
      if (subRes.success) {
        setSubscription(subRes.subscription);
        if (subRes.user) setProfileUser(subRes.user);
      }

      const pkgRes = await contractorAPI.getPackages();
      if (pkgRes.success) setPackages(pkgRes.packages);

      const contractRes = await contractorAPI.getContracts();
      if (contractRes.success) {
        setContracts(contractRes.contracts);
        
        // Auto-select first active or pending contract for GPS tracking
        const active = contractRes.contracts.find(c => c.status === 'active' || c.status === 'pending');
        if (active && !selectedContractForMap) {
          setSelectedContractForMap(active);
          fetchGpsHistory(active._id, active);
        } else if (selectedContractForMap) {
          // Refresh coordinates/status for the already selected contract
          const updatedSelected = contractRes.contracts.find(c => c._id === selectedContractForMap._id);
          if (updatedSelected) {
            setSelectedContractForMap(updatedSelected);
            fetchGpsHistory(updatedSelected._id, updatedSelected);
          } else {
            fetchGpsHistory(selectedContractForMap._id);
          }
        }
      }
      await fetchRoster();
      await fetchNotifications();
      setRefreshing(false);
    } catch (e) {
      setRefreshing(false);
      console.error('Error loading contractor data:', e.message);
    }
  };

  const onboardingStorageKey = user ? `contractorOnboarded:${user._id || user.id}` : 'contractorOnboarded';

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const loadOnboardingStatus = async () => {
      if (!user) return;
      try {
        const value = await AsyncStorage.getItem(onboardingStorageKey);
        setHasOnboarded(value === 'true');
      } catch (e) {
        console.warn('Failed to load onboarding status:', e.message);
      }
    };
    loadOnboardingStatus();
  }, [user, onboardingStorageKey]);

  useEffect(() => {
    if (packages.length > 0 && user) {
      const userPkgId = user.packageId?._id || user.packageId;
      const userHasPlan = !!userPkgId;
      const currentPkg = packages.find(p => p._id === userPkgId);
      if (currentPkg) {
        setSelectedPackage(currentPkg);
      }

      // If user already has a plan, go directly to dashboard (skip onboarding)
      if (userHasPlan) {
        setOnboardingStep(null);
      } else if (hasOnboarded) {
        // User has completed onboarding but no plan - go to dashboard
        setOnboardingStep(null);
      } else {
        // First time login - show package selection
        setOnboardingStep(1);
      }
    }
  }, [packages, user, hasOnboarded, onboardingStorageKey]);

  useEffect(() => {
    if (selectedContractForMap) {
      fetchGpsHistory(selectedContractForMap._id);
    }
  }, [selectedContractForMap]);

  // ── Auto-resolve Contractor's Current Location ──
  useEffect(() => {
    const fetchCurrentLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const { latitude: currentLat, longitude: currentLng } = location.coords;
          
          if (activeTab === 'newContract') {
            setLatitude(currentLat.toString());
            setLongitude(currentLng.toString());
            // Auto reverse-geocode device coordinates
            handleReverseGeocode(currentLat, currentLng);
          } else if (activeTab === 'freelance') {
            setFreelanceLatitude(currentLat.toString());
            setFreelanceLongitude(currentLng.toString());
            // Auto reverse-geocode device coordinates
            handleFreelanceReverseGeocode(currentLat, currentLng);
          }
        }
      } catch (err) {
        console.warn('Error fetching device location for Contractor Dashboard:', err.message);
      }
    };

    if (activeTab === 'newContract' || activeTab === 'freelance') {
      fetchCurrentLocation();
    }
  }, [activeTab]);

  useEffect(() => {
    if (showCalendarModal) {
      setShowCalendarModal(false);
    }
  }, [activeTab]);

  // Handle hardware back press (Android)
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => goBack()
    );

    return () => backHandler.remove();
  }, [activeTab, selectedPackage, selectedRosterWorker, tabHistory]);

  // ── Socket.IO Real-time Listener ────────────────────────────────────────────
  useEffect(() => {
    const newSocket = io(getBaseUrl(), {
      auth: { role: 'contractor', userId: user.id }
    });
    setSocket(newSocket);

    newSocket.on('worker_location', ({ 
      userId, lat, lng, timestamp, workerStatus, 
      distanceToClient, totalViolations, timeSpentOutsideMinutes, 
      workedMinutes, checkInTime 
    }) => {
      setLiveWorkers((prev) => ({
        ...prev,
        [userId]: {
          lat,
          lng,
          timestamp: new Date(timestamp),
          status: workerStatus || 'active',
          distanceToClient,
          totalViolations,
          timeSpentOutsideMinutes,
          workedMinutes,
          checkInTime
        }
      }));
    });

    newSocket.on('geofence_alert', ({ type, workerId, workerName, message, distance, timestamp }) => {
      const isBreach = type === 'breach';
      setGeofenceAlerts((prev) => [
        {
          id: Math.random().toString(),
          type,
          workerName,
          message,
          timestamp: new Date(timestamp)
        },
        ...prev
      ].slice(0, 10));

      Alert.alert(
        isBreach ? '🚨 GEOFENCE BREACH ALERT!' : '🛡️ GEOFENCE SECURED',
        `${workerName} has ${isBreach ? 'left' : 'returned to'} the customer work area!\n\n${message}`
      );
    });

    newSocket.on(`contractor_notification:${user.id}`, ({ message, response }) => {
      Alert.alert(
        response === 'accepted' ? 'Contract Accepted! 🧼' : 'Request Declined ❌',
        message
      );
      loadInitialData();
      fetchNotifications();
    });

    return () => newSocket.disconnect();
  }, []);

  // Join contract socket room
  useEffect(() => {
    if (socket && selectedContractForMap) {
      socket.emit('joinContractRoom', selectedContractForMap._id);
    }
  }, [socket, selectedContractForMap]);

  // ── Simulated GPS Worker Movement & Duration Count-Up (Every 10s) ───────────
  useEffect(() => {
    const interval = setInterval(() => {
      // 1. Simulate worker route movement
      setMockProgress((p) => {
        if (p >= 100) return 100;
        return p + 5; // progress 5% closer to site every 10s
      });

      // 2. Refresh active contracts in the background (10s polling auto refresh)
      if (activeTab === 'gps') {
        loadInitialData();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab]);

  // ── Search Place Autocomplete Handlers ──
  const handlePlaceSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim().length < 3) {
      setSearchSuggestions([]);
      return;
    }

    try {
      setSearchingPlace(true);
      // Query Photon (Komoot) autocomplete service with English language output
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`
      );
      const data = await response.json();
      
      if (data && data.features) {
        const mapped = data.features.map((feature) => {
          const props = feature.properties || {};
          const coords = feature.geometry?.coordinates || [0, 0];
          
          // Construct readable display name from OSM feature properties
          const parts = [];
          if (props.name) parts.push(props.name);
          if (props.housenumber) parts.push(props.housenumber);
          if (props.street) parts.push(props.street);
          if (props.district) parts.push(props.district);
          if (props.city) parts.push(props.city);
          if (props.state) parts.push(props.state);
          if (props.postcode) parts.push(props.postcode);
          if (props.country) parts.push(props.country);
          
          let displayName = parts.filter(Boolean).join(', ');
          
          // Clean up Sinhala/Tamil characters for Sri Lanka
          displayName = displayName
            .replace(/ශ්‍රී ලංකාව/g, 'Sri Lanka')
            .replace(/இலங்கை/g, 'Sri Lanka');
          
          return {
            lat: coords[1], // Latitude is index 1
            lon: coords[0], // Longitude is index 0
            display_name: displayName || 'Unknown Place'
          };
        });
        setSearchSuggestions(mapped);
      } else {
        setSearchSuggestions([]);
      }
    } catch (e) {
      console.warn('Place search autocomplete error:', e.message);
    } finally {
      setSearchingPlace(false);
    }
  };

  const handleSelectSuggestion = (item) => {
    const lat = item.lat;
    const lon = item.lon;
    const displayName = item.display_name;

    setLatitude(parseFloat(lat).toString());
    setLongitude(parseFloat(lon).toString());
    setAddress(displayName);
    
    // Clear search box and suggestions
    setSearchQuery('');
    setSearchSuggestions([]);
  };

  // ── Freelance Reverse Geocode Handler (coordinates -> English address) ──
  const handleFreelanceReverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(
        `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=en`
      );
      const data = await response.json();
      if (data && data.features && data.features.length > 0) {
        const props = data.features[0].properties || {};
        const parts = [];
        if (props.name) parts.push(props.name);
        if (props.housenumber) parts.push(props.housenumber);
        if (props.street) parts.push(props.street);
        if (props.district) parts.push(props.district);
        if (props.city) parts.push(props.city);
        if (props.state) parts.push(props.state);
        if (props.postcode) parts.push(props.postcode);
        if (props.country) parts.push(props.country);
        
        let displayName = parts.filter(Boolean).join(', ');
        
        displayName = displayName
          .replace(/ශ්‍රී ලංකාව/g, 'Sri Lanka')
          .replace(/இலங்கை/g, 'Sri Lanka');
          
        setFreelanceLoc(displayName);
      }
    } catch (e) {
      console.warn('Reverse geocoding error for freelance:', e.message);
    }
  };

  // ── Freelance Search Place Autocomplete Handlers ──
  const handleFreelancePlaceSearch = async (query) => {
    setFreelanceSearchQuery(query);
    if (query.trim().length < 3) {
      setFreelanceSearchSuggestions([]);
      return;
    }

    try {
      setFreelanceSearchingPlace(true);
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`
      );
      const data = await response.json();
      
      if (data && data.features) {
        const mapped = data.features.map((feature) => {
          const props = feature.properties || {};
          const coords = feature.geometry?.coordinates || [0, 0];
          
          const parts = [];
          if (props.name) parts.push(props.name);
          if (props.housenumber) parts.push(props.housenumber);
          if (props.street) parts.push(props.street);
          if (props.district) parts.push(props.district);
          if (props.city) parts.push(props.city);
          if (props.state) parts.push(props.state);
          if (props.postcode) parts.push(props.postcode);
          if (props.country) parts.push(props.country);
          
          let displayName = parts.filter(Boolean).join(', ');
          
          displayName = displayName
            .replace(/ශ්‍රී ලංකාව/g, 'Sri Lanka')
            .replace(/இலங்கை/g, 'Sri Lanka');
          
          return {
            lat: coords[1],
            lon: coords[0],
            display_name: displayName || 'Unknown Place'
          };
        });
        setFreelanceSearchSuggestions(mapped);
      } else {
        setFreelanceSearchSuggestions([]);
      }
    } catch (e) {
      console.warn('Freelance place search autocomplete error:', e.message);
    } finally {
      setFreelanceSearchingPlace(false);
    }
  };

  const handleFreelanceSelectSuggestion = (item) => {
    const lat = item.lat;
    const lon = item.lon;
    const displayName = item.display_name;

    setFreelanceLatitude(parseFloat(lat).toString());
    setFreelanceLongitude(parseFloat(lon).toString());
    setFreelanceLoc(displayName);
    
    setFreelanceSearchQuery('');
    setFreelanceSearchSuggestions([]);
  };


  const handleStartTimeBlur = () => {
    let cleanTime = startTime.trim();
    if (!cleanTime) {
      setStartTime(getCurrentTime24());
      return;
    }
    
    // Auto-insert leading zero if format is H:MM
    const singleHourRegex = /^([0-9]):([0-5][0-9])$/;
    if (singleHourRegex.test(cleanTime)) {
      cleanTime = '0' + cleanTime;
    }
    
    // If it's just a single or double digit hour (e.g., "9" or "14"), auto-format to HH:00
    const hourOnlyRegex = /^([0-9]|0[0-9]|1[0-9]|2[0-3])$/;
    if (hourOnlyRegex.test(cleanTime)) {
      let hr = cleanTime;
      if (hr.length === 1) hr = '0' + hr;
      cleanTime = hr + ':00';
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(cleanTime)) {
      const defaultTime = getCurrentTime24();
      Alert.alert(
        'Invalid Time Format',
        `Time must be in 24-hour HH:MM format (e.g., 09:00 or 17:30). Reverting to default (${defaultTime}).`
      );
      setStartTime(defaultTime);
    } else {
      setStartTime(cleanTime);
    }
  };

  const handleFreelanceTimeBlur = () => {
    let cleanTime = freelanceTime.trim();
    if (!cleanTime) {
      setFreelanceTime(getCurrentTime24());
      return;
    }
    
    // Auto-insert leading zero if format is H:MM
    const singleHourRegex = /^([0-9]):([0-5][0-9])$/;
    if (singleHourRegex.test(cleanTime)) {
      cleanTime = '0' + cleanTime;
    }
    
    // If it's just a single or double digit hour (e.g., "9" or "14"), auto-format to HH:00
    const hourOnlyRegex = /^([0-9]|0[0-9]|1[0-9]|2[0-3])$/;
    if (hourOnlyRegex.test(cleanTime)) {
      let hr = cleanTime;
      if (hr.length === 1) hr = '0' + hr;
      cleanTime = hr + ':00';
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(cleanTime)) {
      const defaultTime = getCurrentTime24();
      Alert.alert(
        'Invalid Time Format',
        `Time must be in 24-hour HH:MM format (e.g., 09:00 or 17:30). Reverting to default (${defaultTime}).`
      );
      setFreelanceTime(defaultTime);
    } else {
      setFreelanceTime(cleanTime);
    }
  };

  // ── Worker Search ───────────────────────────────────────────────────────────
  const handleSearchWorkers = async (text) => {
    setWorkerQuery(text);
    if (text.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await contractorAPI.searchWorkers(text);
      if (res.success) {
        setSearchResults(res.workers);
      }
    } catch (e) {
      console.error('Search workers error:', e.message);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelectWorker = (worker) => {
    const isSelected = selectedWorkers.some(w => w._id === worker._id);

    if (isSelected) {
      setSelectedWorkers(selectedWorkers.filter(w => w._id !== worker._id));
    } else {
      // 1. Restrict to available/online workers only
      if (worker.status !== 'available' && worker.status !== 'active_shift') {
        Alert.alert(
          'Cleaner Unavailable',
          `👤 ${worker.name} is currently ${worker.status.toUpperCase().replace('_', ' ')}. You can only select Available/Online cleaners for contracts.`
        );
        return;
      }

      // 2. Basic package limit verification (max 5 crew members)
      if (selectedPackage?.name === 'Basic' && selectedWorkers.length >= 5) {
        Alert.alert(
          'Basic Package Limit',
          '⚠️ The Basic Package permits a maximum of 5 crew members. Please upgrade to the Premium Package to select larger crew sizes.'
        );
        return;
      }

      setSelectedWorkers([...selectedWorkers, worker]);
    }
  };

  // ── Dynamic Pricing Calculation ─────────────────────────────────────────────
  const calculatePrice = () => {
    if (!selectedPackage) return 0;
    if (selectedPackage.name === 'Basic') return 299; // Fixed price

    // Premium Package: $199 base + $25 per worker slot
    const crewSize = Math.max(1, selectedWorkers.length);
    return 199 + (crewSize - 1) * 25;
  };

  // ── Submit Contract Dispatch ────────────────────────────────────────────────
  const handleCreateContract = async () => {
    if (!clientName.trim() || !clientPhone.trim() || !address.trim()) {
      Alert.alert('Required Fields', 'Please complete Contractor Name, Phone, and Address.');
      return;
    }

    const fullPhoneNumber = `${clientCountryCode}${clientPhone.trim().replace(/^0/, '')}`;
    const cleanPhone = fullPhoneNumber.replace(/[\s\-().+]/g, '');
    if (cleanPhone.length < 9 || cleanPhone.length > 15) {
      Alert.alert('Invalid Phone Number', 'Enter a valid contractor phone number (9–15 digits)');
      return;
    }

    if (selectedWorkers.length < 1) {
      Alert.alert(
        'No Crew Selected',
        'Please select at least 1 available crew member to fulfill the requirements of this contract.'
      );
      return;
    }

    // Validate Duration (Min)
    const durationNum = parseInt(durationMinutes);
    if (isNaN(durationNum) || durationNum <= 0) {
      Alert.alert('Invalid Duration', 'Duration must be a positive number of minutes.');
      return;
    }

    // Validate Date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      Alert.alert('Invalid Date', 'Date must be in YYYY-MM-DD format.');
      return;
    }

    const selectedDateObj = new Date(date);
    if (isNaN(selectedDateObj.getTime())) {
      Alert.alert('Invalid Date', 'Please select a valid date.');
      return;
    }

    // Validate Start Time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(startTime)) {
      Alert.alert('Invalid Time', 'Start Time must be in 24-hour HH:MM format (e.g. 09:00 or 17:30).');
      return;
    }

    setLoading(true);
    try {
      const contractData = {
        clientName: clientName.trim(),
        clientPhone: fullPhoneNumber,
        address: address.trim(),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        packageId: selectedPackage._id,
        workers: selectedWorkers.map(w => w._id),
        requiredWorkersCount: selectedWorkers.length,
        isUrgent: selectedPackage.name === 'Premium' ? isUrgent : false,
        date,
        startTime,
        durationMinutes: parseInt(durationMinutes),
        notes: notes.trim(),
        pricePerHour: parseFloat(pricePerHour) || 25
      };

      const res = await contractorAPI.createContract(contractData);
      setLoading(false);

      if (res.success) {
        Alert.alert(
          'Contract Dispatched! 🚀',
          `Cleaning requests have been successfully sent to ${selectedWorkers.length} workers with a response countdown.`,
          [
            {
              text: 'Access Projects',
              onPress: () => {
                // Reset form fields
                setClientName(user?.companyName || user?.name || '');
                setClientPhone(user?.phoneNumber || '');
                setAddress('');
                setLatitude(NY_LAT.toString());
                setLongitude(NY_LNG.toString());
                setNotes('');
                setDate(getTodayString());
                setStartTime(getCurrentTime24());
                setPricePerHour('25');
                setSelectedWorkers([]);
                setSelectedPackage(null);
                setMockProgress(0);
                setActiveTab('projects');
                loadInitialData();
              }
            }
          ]
        );
      } else {
        Alert.alert('Contract Dispatch Failed', res.message || 'Verification error');
      }
    } catch (e) {
      setLoading(false);
      Alert.alert('Error', e.response?.data?.message || 'Server error occurred during dispatch');
    }
  };

  const handleFormRefresh = async () => {
    setRefreshing(true);
    setClientName(user?.companyName || user?.name || '');
    setClientPhone(user?.phoneNumber || '');
    setAddress('');
    setLatitude(NY_LAT.toString());
    setLongitude(NY_LNG.toString());
    setNotes('');
    setDate(getTodayString());
    setStartTime(getCurrentTime24());
    setPricePerHour('25');
    setDurationMinutes('120');
    setRequiredWorkersCount(1);
    setIsUrgent(false);
    setSearchQuery('');
    setSearchSuggestions([]);
    setSelectedWorkers([]);
    await loadInitialData();
    setRefreshing(false);
  };

  // Helper remaining response timer
  const renderRemainingTime = (deadline) => {
    const remainingMs = new Date(deadline) - new Date();
    if (remainingMs <= 0) return 'Expired';
    const minutes = Math.floor(remainingMs / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  // --- Bidding Tab States ---
  const [clientRequests, setClientRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [bidPrices, setBidPrices] = useState({});

  // --- Freelance Tab States ---
  const [freelanceCategory, setFreelanceCategory] = useState('Cleaning');
  const [freelanceLoc, setFreelanceLoc] = useState('');
  const [freelanceHours, setFreelanceHours] = useState('4');
  const [freelancePrice, setFreelancePrice] = useState('25');
  const [freelanceDate, setFreelanceDate] = useState(getTodayString());
  const [freelanceTime, setFreelanceTime] = useState(getCurrentTime24());
  const [freelanceDesc, setFreelanceDesc] = useState('');
  const [freelanceJobs, setFreelanceJobs] = useState([]);
  const [loadingFreelance, setLoadingFreelance] = useState(false);
  const [expandedFreelanceId, setExpandedFreelanceId] = useState(null);

  const [showFreelanceCategoryDropdown, setShowFreelanceCategoryDropdown] = useState(false);
  const [freelanceLatitude, setFreelanceLatitude] = useState(NY_LAT.toString());
  const [freelanceLongitude, setFreelanceLongitude] = useState(NY_LNG.toString());
  const [freelanceSearchQuery, setFreelanceSearchQuery] = useState('');
  const [freelanceSearchSuggestions, setFreelanceSearchSuggestions] = useState([]);
  const [freelanceSearchingPlace, setFreelanceSearchingPlace] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());
  const [calendarTarget, setCalendarTarget] = useState('freelance'); // 'freelance', 'newContract', or 'rosterAssign'
  const [rosterAssignDate, setRosterAssignDate] = useState('');
  // --- Public Freelance Tab States ---


  // --- API Fetch Handlers ---
  const fetchRoster = async () => {
    try {
      const res = await contractorAPI.getWorkers();
      if (res.success) setRosterWorkers(res.workers);
    } catch (e) {
      console.warn('Failed to fetch roster:', e.message);
    }
  };

  const handleGlobalSearchWorkers = async (q) => {
    setSearchWorkerEmail(q);
    if (q.trim().length < 3) {
      setFoundWorkerList([]);
      return;
    }
    try {
      const res = await contractorAPI.searchWorkers(q);
      if (res.success) setFoundWorkerList(res.workers);
    } catch (e) {
      console.warn('Failed to search workers:', e.message);
    }
  };

  const handleAddWorkerToRoster = async (workerId) => {
    try {
      const res = await contractorAPI.addWorker(workerId);
      if (res.success) {
        Alert.alert('Worker Added! 👤', res.message);
        setSearchWorkerEmail('');
        setFoundWorkerList([]);
        fetchRoster();
      } else {
        Alert.alert('Failed to Add', res.message || 'Verification error');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Package limit or server error');
    }
  };

  const handleSelectPlan = async (pkg) => {
    setSelectedPackage(pkg);
    setPaypalEmail('');
    setPaypalPassword('');
    setCardholderName('John Smith');
    setCardNumber('1234 5678 9012 3456');
    setExpiryDate('MM/YY');
    setCvv('123');
    setPaymentStep('SELECT_METHOD');
    setPaymentModalVisible(true);
  };

  const handleFinalizePayment = async () => {
    if (!selectedPackage) return;
    try {
      setIsProcessingPayment(true);
      const res = await contractorAPI.selectPackage(selectedPackage._id);
      setIsProcessingPayment(false);
      setPaymentModalVisible(false);
      if (res.success) {
        Alert.alert('Plan Selected', `Your ${selectedPackage.name} plan is now active!`);
        setOnboardingStep(2); // Move to select crew members
      } else {
        Alert.alert('Error', res.message || 'Could not select plan');
      }
    } catch (e) {
      setIsProcessingPayment(false);
      setPaymentModalVisible(false);
      console.warn('Finalize select plan error:', e.message);
      setOnboardingStep(2);
    }
  };

  const fetchWorkerProfileData = async (workerId, period = workerProfilePeriod) => {
    setLoadingWorkerProfile(true);
    try {
      let startDate = '';
      let endDate = '';
      const now = new Date();
      if (period === 'week') {
        const pastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        startDate = pastWeek.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
      } else if (period === 'month') {
        const pastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        startDate = pastMonth.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
      } else if (period === '3months') {
        const past3M = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        startDate = past3M.toISOString().split('T')[0];
        endDate = now.toISOString().split('T')[0];
      }
      
      const res = await contractorAPI.getWorkerProfile(workerId, startDate, endDate);
      if (res.success) {
        setWorkerProfileStats(res.stats);
        setWorkerProfileJobs(res.jobs || []);
        
        // Load GPS history if worker has an ongoing contract
        const ongoingContract = contracts.find(c => {
          const isOngoing = c.status === 'active' || c.status === 'pending';
          if (!isOngoing) return false;
          return c.assignments?.some(assign => {
            const wId = assign.workerId?._id || assign.workerId;
            return wId && wId.toString() === workerId.toString();
          });
        });
        if (ongoingContract) {
          fetchGpsHistory(ongoingContract._id, ongoingContract);
        }
      }
      setLoadingWorkerProfile(false);
    } catch (e) {
      setLoadingWorkerProfile(false);
      Alert.alert('Error', 'Failed to fetch crew member profile payouts');
    }
  };

  const handleHandoverProject = async (workerId) => {
    if (!handoverContractId) {
      Alert.alert('Required', 'Please select a project to handover');
      return;
    }
    setAssigningWorker(true);
    try {
      const res = await contractorAPI.assignWorker(workerId, handoverContractId);
      setAssigningWorker(false);
      if (res.success) {
        Alert.alert('Project Handed Over! 🧼', `Crew assignment request successfully dispatched to the worker.`);
        setHandoverContractId('');
        fetchWorkerProfileData(workerId);
        loadInitialData();
      } else {
        Alert.alert('Handover Failed', res.message || 'Error occurred');
      }
    } catch (e) {
      setAssigningWorker(false);
      Alert.alert('Error', e.response?.data?.message || 'Server error handing over contract');
    }
  };

  const handleUpgradeSubscription = async () => {
    try {
      const res = await contractorAPI.upgradePackage();
      if (res.success) {
        Alert.alert('Upgraded! 🚀', 'Successfully upgraded to Premium Package. You can now add unlimited crew members.');
        loadInitialData();
      } else {
        Alert.alert('Upgrade Failed', res.message);
      }
    } catch (e) {
      Alert.alert('Error', 'Server error upgrading package');
    }
  };

  const handleToggleAutoRenew = async (currentStatus) => {
    const targetStatus = !currentStatus;
    if (targetStatus === false) {
      const renewDate = subscription?.renewsOn
        ? new Date(subscription.renewsOn).toLocaleDateString()
        : 'the end of your billing period';
      Alert.alert(
        'Cancel Auto-Renew?',
        `Your plan stays active until ${renewDate}. After that, no further monthly charge will be made unless you renew manually.`,
        [
          { text: 'Keep Auto-Renew', style: 'cancel' },
          {
            text: 'Turn Off Auto-Renew',
            onPress: async () => {
              try {
                const res = await contractorAPI.setRenewOption(false);
                if (res.success) {
                  Alert.alert('Auto-Renew Off', res.message);
                  loadInitialData();
                }
              } catch (e) {
                Alert.alert('Error', e.response?.data?.message || 'Failed to update renew option');
              }
            }
          }
        ]
      );
    } else {
      try {
        const res = await contractorAPI.setRenewOption(true);
        if (res.success) {
          Alert.alert('Auto-Renew Enabled', res.message);
          loadInitialData(); // Refresh user state
        }
      } catch (e) {
        Alert.alert('Error', e.response?.data?.message || 'Failed to update renew option');
      }
    }
  };

  const handleRenewSubscriptionNow = async () => {
    try {
      const res = await contractorAPI.renewPackage();
      if (res.success) {
        Alert.alert('Subscription Renewed! 🚀', 'Successfully renewed subscription plan for another 30 days.');
        loadInitialData(); // Refresh user state
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to renew subscription');
    }
  };

  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await authAPI.getNotifications();
      if (res.success) {
        setNotifications(res.notifications || []);
        const unread = (res.notifications || []).filter(n => !n.read).length;
        setUnreadNotificationsCount(unread);
      }
    } catch (e) {
      console.warn('Failed to load contractor notifications:', e.message);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleNotificationClick = async (notif) => {
    try {
      await authAPI.markNotificationRead(notif._id);
      setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, read: true } : n));
      setUnreadNotificationsCount(prev => Math.max(0, prev - 1));
      setShowNotificationsModal(false);
      if (notif.type === 'offer_accepted' || (notif.data && notif.data.contractId)) {
        setBidsSubTab('accepted');
        navigateToTab('clientRequests');
      } else if (notif.type === 'contract_accepted') {
        navigateToTab('projects');
      }
    } catch (e) {
      console.warn('Failed to handle notification click:', e.message);
    }
  };

  const handleUpdateProfile = async () => {
    if (!profileName.trim()) {
      Alert.alert('Error ⚠️', 'Name is required');
      return;
    }
    if (!profilePhone.trim()) {
      Alert.alert('Error ⚠️', 'Phone number is required');
      return;
    }
    
    try {
      setUpdatingProfile(true);
      const res = await authAPI.updateProfile({
        name: profileName,
        phoneNumber: profilePhone,
        companyName: profileCompanyName,
        locations: profileLocations,
        tags: profileTags
      });
      if (res.success) {
        Alert.alert('Success 🎉', 'Profile updated successfully');
        if (res.user) {
          setProfileUser(res.user);
        }
      } else {
        Alert.alert('Error ⚠️', res.message || 'Failed to update profile');
      }
    } catch (error) {
      Alert.alert('Error ⚠️', error.message || 'Failed to update profile');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const renderProfileTab = () => {
    return (
      <View style={{ paddingBottom: 30 }}>
        <Text style={styles.sectionTitle}>My Profile 👤</Text>
        <Text style={styles.sectionSubtitle}>Manage and update your contractor account details.</Text>
        
        <View style={[styles.formCard, { marginTop: 15 }]}>
          <CustomInput
            label="Full Name"
            value={profileName}
            onChangeText={setProfileName}
            placeholder="John Doe"
            icon="👤"
            required
          />

          <CustomInput
            label="Phone Number"
            value={profilePhone}
            onChangeText={setProfilePhone}
            placeholder="77 123 4567"
            icon="📞"
            keyboardType="phone-pad"
            required
          />

          <CustomInput
            label="Company Name"
            value={profileCompanyName}
            onChangeText={setProfileCompanyName}
            placeholder="Elite Cleaning Co."
            icon="🏢"
          />

          <CustomInput
            label="Work Locations (comma-separated)"
            value={profileLocations}
            onChangeText={setProfileLocations}
            placeholder="New York, Brooklyn, Queens"
            icon="📍"
          />

          <CustomInput
            label="Tags / Specialties (comma-separated)"
            value={profileTags}
            onChangeText={setProfileTags}
            placeholder="Deep Clean, Commercial, Carpet"
            icon="🏷️"
          />

          <View style={{ marginTop: 15 }}>
            <CustomButton
              title={updatingProfile ? "Saving Changes..." : "Save Changes"}
              type="primary"
              onPress={handleUpdateProfile}
              disabled={updatingProfile}
            />
          </View>

          <View style={{ marginTop: 15 }}>
            <TouchableOpacity 
              style={{
                backgroundColor: '#FCA5A5',
                paddingVertical: 12,
                borderRadius: 12,
                justifyContent: 'center',
                alignItems: 'center',
                borderWidth: 1.2,
                borderColor: '#EF4444'
              }} 
              onPress={onLogout} 
              activeOpacity={0.7}
            >
              <Text style={{ color: '#7F1D1D', fontWeight: '800', fontSize: 14 }}>Logout ➔</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const fetchClientRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await contractorAPI.getClientRequests();
      if (res.success) setClientRequests(res.requests);
      setLoadingRequests(false);
    } catch (e) {
      setLoadingRequests(false);
      console.warn('Failed to load client requests:', e.message);
    }
  };

  const handleSubmitBid = async (requestId) => {
    const price = bidPrices[requestId];
    if (!price || isNaN(price)) {
      Alert.alert('Required', 'Please enter a valid price bid');
      return;
    }
    try {
      const res = await contractorAPI.submitOffer(requestId, price);
      if (res.success) {
        Alert.alert('Bid Submitted! 💸', 'Your price offer has been successfully dispatched to the client.');
        setBidPrices(prev => ({ ...prev, [requestId]: '' }));
        fetchClientRequests();
      } else {
        Alert.alert('Bid Failed', res.message);
      }
    } catch (e) {
      Alert.alert('Error', 'Server error submitting price offer');
    }
  };

  const fetchFreelanceJobs = async () => {
    setLoadingFreelance(true);
    try {
      const res = await contractorAPI.getFreelanceJobs();
      if (res.success) setFreelanceJobs(res.freelanceJobs);
      setLoadingFreelance(false);
    } catch (e) {
      setLoadingFreelance(false);
      console.warn('Failed to load freelance jobs:', e.message);
    }
  };

  const handlePostFreelanceJob = async () => {
    if (!freelanceLoc.trim() || !freelanceHours.trim() || !freelanceDate.trim() || !freelanceTime.trim() || !freelanceDesc.trim()) {
      Alert.alert('Required Fields', 'Please fill out all freelance details.');
      return;
    }

    const hoursNum = parseFloat(freelanceHours);
    if (isNaN(hoursNum) || hoursNum <= 0) {
      Alert.alert('Invalid Duration', 'Duration must be a positive number of hours.');
      return;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(freelanceDate)) {
      Alert.alert('Invalid Date', 'Date must be in YYYY-MM-DD format.');
      return;
    }

    const selectedDateObj = new Date(freelanceDate);
    if (isNaN(selectedDateObj.getTime())) {
      Alert.alert('Invalid Date', 'Please select a valid date.');
      return;
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(freelanceTime)) {
      Alert.alert('Invalid Time', 'Time must be in 24-hour HH:MM format (e.g. 09:00 or 17:30).');
      return;
    }

    try {
      const res = await contractorAPI.postFreelanceJob({
        category: freelanceCategory,
        location: freelanceLoc.trim(),
        hours: hoursNum,
        pricePerHour: parseFloat(freelancePrice) || 25,
        date: freelanceDate,
        time: freelanceTime,
        description: freelanceDesc.trim(),
        targetType: 'crew'
      });
      if (res.success) {
        Alert.alert('Job Posted! 🚀', 'Freelance job opening successfully posted to the Crew Member freelance board.');
        setFreelanceLoc('');
        setFreelanceDesc('');
        setFreelanceSearchQuery('');
        setFreelanceSearchSuggestions([]);
        fetchFreelanceJobs();
      } else {
        Alert.alert('Post Failed', res.message);
      }
    } catch (e) {
      Alert.alert('Error', 'Server error posting freelance job');
    }
  };



  const handleApproveFreelancer = async (jobId, workerId) => {
    try {
      const res = await contractorAPI.approveFreelancer(jobId, workerId);
      if (res.success) {
        Alert.alert('Worker Approved! 🧼', 'Applicant approved. Project created and scheduled.');
        fetchFreelanceJobs();
        fetchRoster();
        loadInitialData();
      } else {
        Alert.alert('Approval Failed', res.message);
      }
    } catch (e) {
      Alert.alert('Error', 'Server error approving worker');
    }
  };

  // Switch tab loader hook
  useEffect(() => {
    fetchNotifications();
    if (activeTab === 'roster') {
      fetchRoster();
    } else if (activeTab === 'clientRequests') {
      fetchClientRequests();
    } else if (activeTab === 'freelance') {
      fetchFreelanceJobs();
    }
  }, [activeTab]);

  // Tab 4: Roster rendering helper
  const renderRosterTab = () => {
    const currentPkgName = packages.find(p => p._id === (profileUser?.packageId?._id || profileUser?.packageId))?.name || subscription?.packageName || 'Basic';
    const limit = currentPkgName === 'Premium' ? 'Unlimited' : 5;

    if (selectedRosterWorker) {
      const stats = workerProfileStats || { totalJobsCount: 0, completedJobsCount: 0, totalHours: 0, totalPayout: 0, hourlyRate: 25 };
      const completedJobs = workerProfileJobs.filter(j => j.status === 'completed');
      
      // Filter ongoing projects (pending/active status) assigned to this worker
      const workerOngoingProjects = contracts.filter(c => {
        const isOngoing = c.status === 'active' || c.status === 'pending';
        if (!isOngoing) return false;
        return c.assignments?.some(assign => {
          const workerId = assign.workerId?._id || assign.workerId;
          return workerId && workerId.toString() === selectedRosterWorker._id.toString() &&
                 (assign.response === 'pending' || assign.response === 'accepted');
        });
      });

      // Filter eligible contracts (pending/active status) not yet assigned to this worker
      const eligibleContracts = contracts.filter(c => {
        const isOngoing = c.status === 'active' || c.status === 'pending';
        if (!isOngoing) return false;
        const alreadyAssigned = c.assignments?.some(assign => {
          const workerId = assign.workerId?._id || assign.workerId;
          return workerId && workerId.toString() === selectedRosterWorker._id.toString() &&
                 (assign.response === 'pending' || assign.response === 'accepted');
        });
        return !alreadyAssigned;
      });

      return (
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <Text style={styles.profileName}>{selectedRosterWorker.name}</Text>
            {selectedRosterWorker.workerIdNumber && (
              <Text style={styles.profileIdBadge}>ID: {selectedRosterWorker.workerIdNumber}</Text>
            )}
            <Text style={styles.profileContact}>✉️ Email: {selectedRosterWorker.email}</Text>
            <Text style={styles.profileContact}>📞 Phone: {selectedRosterWorker.phoneNumber}</Text>
            <Text style={styles.profileContact}>🛠️ Capabilities: {selectedRosterWorker.tags?.join(', ') || 'N/A'}</Text>
            <Text style={styles.profileContact}>📍 State: {selectedRosterWorker.state || 'N/A'}</Text>
          </View>

          {/* Assign Job button */}
          <TouchableOpacity
            style={styles.assignJobBtn}
            activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            pointerEvents="auto"
            onPress={() => {
              setSelectedWorkers([selectedRosterWorker]);
              const currentPkg = packages.find(p => p._id === (user?.packageId?._id || user?.packageId)) || packages[0] || null;
              setSelectedPackage(currentPkg);
              if (currentPkg && currentPkg.name === 'Premium') {
                setRequiredWorkersCount(1);
              }
              fadeTransition(() => navigateToTab('newContract'));
            }}
          >
            <Text style={styles.assignJobBtnText}>➕ Assign Job to Crew Member</Text>
          </TouchableOpacity>

          {/* Ongoing Projects Section */}
          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Ongoing projects:</Text>
            {workerOngoingProjects.length === 0 ? (
              <Text style={styles.emptySectionText}>No ongoing projects assigned.</Text>
            ) : (
              workerOngoingProjects.map(c => (
                <View key={c._id} style={styles.miniProjectCard}>
                  <Text style={styles.miniProjectTitle}>🧹 {c.clientName}</Text>
                  <Text style={styles.miniProjectSub}>📍 Location: {c.location?.address}</Text>
                  <Text style={styles.miniProjectSub}>📅 Date: {new Date(c.schedule?.date).toLocaleDateString()}</Text>
                </View>
              ))
            )}
          </View>

          {/* Hand Over a Project Section */}
          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Hand over a project:</Text>
            {eligibleContracts.length === 0 ? (
              <Text style={styles.emptySectionText}>No eligible projects available to hand over.</Text>
            ) : (
              <View style={{ position: 'relative', zIndex: 30 }}>
                <TouchableOpacity
                  style={styles.handoverSelectBox}
                  onPress={() => setShowHandoverDropdown(!showHandoverDropdown)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.handoverSelectText}>
                    {handoverContractId ? 
                      contracts.find(c => c._id === handoverContractId)?.clientName || 'Selected Project' : 
                      'Select a project to assign'
                    }
                  </Text>
                  <Text style={styles.dropdownArrowIcon}>{showHandoverDropdown ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {showHandoverDropdown && (
                  <View style={styles.handoverDropdownMenu}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
                      {eligibleContracts.map((c) => (
                        <TouchableOpacity
                          key={c._id}
                          style={styles.handoverDropdownItem}
                          onPress={() => {
                            setHandoverContractId(c._id);
                            setShowHandoverDropdown(false);
                          }}
                        >
                          <Text style={styles.handoverDropdownItemText} numberOfLines={1}>
                            {c.clientName} ({new Date(c.schedule?.date).toLocaleDateString()})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {handoverContractId ? (
                  <TouchableOpacity
                    style={styles.handoverSubmitBtn}
                    onPress={() => handleHandoverProject(selectedRosterWorker._id)}
                    disabled={assigningWorker}
                  >
                    <Text style={styles.handoverSubmitBtnText}>
                      {assigningWorker ? "Assigning..." : "Assign Crew Member ➔"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>

          {/* Real-time GPS Track details inside profile */}
          <View style={styles.profileSection}>
            <Text style={styles.profileSectionTitle}>Real-time GPS Tracking details:</Text>
            {(() => {
              const activeContract = contracts.find(c => {
                const isOngoing = c.status === 'active' || c.status === 'pending';
                if (!isOngoing) return false;
                return c.assignments?.some(assign => {
                  const wId = assign.workerId?._id || assign.workerId;
                  return wId && wId.toString() === selectedRosterWorker._id.toString();
                });
              });

              if (!activeContract) {
                return (
                  <Text style={styles.emptySectionText}>
                    No active contract in progress. Assign a project to start GPS tracking.
                  </Text>
                );
              }

              const liveInfo = liveWorkers[selectedRosterWorker._id] || {};
              const lat = liveInfo.lat || activeContract.location?.coordinates?.lat || NY_LAT;
              const lng = liveInfo.lng || activeContract.location?.coordinates?.lng || NY_LNG;

              return (
                <View>
                  <View style={styles.profileGpsCard}>
                    <Text style={styles.profileGpsTitle}>🛰️ Live Telemetry ({activeContract.clientName})</Text>
                    <View style={styles.profileGpsGrid}>
                      <View style={styles.profileGpsCol}>
                        <Text style={styles.profileGpsLabel}>Status</Text>
                        <Text style={styles.profileGpsVal}>{liveInfo.status || 'Offline'}</Text>
                      </View>
                      <View style={styles.profileGpsCol}>
                        <Text style={styles.profileGpsLabel}>Distance to Site</Text>
                        <Text style={styles.profileGpsVal}>
                          {liveInfo.distanceToClient !== undefined ? `${liveInfo.distanceToClient} meters` : 'N/A'}
                        </Text>
                      </View>
                      <View style={styles.profileGpsCol}>
                        <Text style={styles.profileGpsLabel}>Geofence Violations</Text>
                        <Text style={[styles.profileGpsVal, { color: liveInfo.totalViolations > 0 ? '#EF4444' : '#10B981' }]}>
                          {liveInfo.totalViolations || 0}
                        </Text>
                      </View>
                      <View style={styles.profileGpsCol}>
                        <Text style={styles.profileGpsLabel}>Time Outside Geofence</Text>
                        <Text style={styles.profileGpsVal}>
                          {liveInfo.timeSpentOutsideMinutes || 0} mins
                        </Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.radarLabel}>🛰️ Dispatch Tracking Radar: {selectedRosterWorker.name}</Text>
                  <MapViewContainer
                    clientCoords={[activeContract.location?.coordinates?.lng || NY_LNG, activeContract.location?.coordinates?.lat || NY_LAT]}
                    workerCoords={[lng, lat]}
                    clientName={activeContract.clientName}
                    workerName={selectedRosterWorker.name}
                    geofenceRadius={50}
                    geofenceStatus={liveInfo.status === 'Left Work Area' ? 'outside_breach' : 'inside'}
                    height={200}
                  />
                </View>
              );
            })()}
          </View>

          {/* Projects Covered Section */}
          <View style={[styles.profileSection, { zIndex: 10 }]}>
            <Text style={styles.profileSectionTitle}>Automated Paysheet (App Calculated):</Text>
            <Text style={styles.automatedLabel}>⚠️ Payouts are computed automatically based on verified clock-in durations and GPS logs. Overrides or manual calculations by the contractor are disabled.</Text>
            
            {/* Period Selection Dropdown */}
            <View style={{ marginBottom: 14, position: 'relative', zIndex: 20 }}>
              <TouchableOpacity
                style={styles.periodSelectBox}
                onPress={() => setShowPeriodDropdown(!showPeriodDropdown)}
                activeOpacity={0.8}
              >
                <Text style={styles.periodSelectText}>
                  Period: {workerProfilePeriod === 'week' ? 'Week' : workerProfilePeriod === 'month' ? 'Month' : '3 Months'}
                </Text>
                <Text style={styles.dropdownArrowIcon}>{showPeriodDropdown ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {showPeriodDropdown && (
                <View style={styles.periodDropdownMenu}>
                  {[
                    { id: 'week', label: 'Week' },
                    { id: 'month', label: 'Month' },
                    { id: '3months', label: '3 Months' }
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={styles.periodDropdownItem}
                      onPress={() => {
                        setWorkerProfilePeriod(option.id);
                        fetchWorkerProfileData(selectedRosterWorker._id, option.id);
                        setShowPeriodDropdown(false);
                      }}
                    >
                      <Text style={styles.periodDropdownItemText}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {loadingWorkerProfile ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 14 }} />
            ) : (
              <View>
                {/* Completed Jobs Table Header */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCell, { width: '25%' }]}>Client</Text>
                  <Text style={[styles.tableHeaderCell, { width: '25%' }]}>Location</Text>
                  <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Date</Text>
                  <Text style={[styles.tableHeaderCell, { width: '15%', textAlign: 'center' }]}>Hours</Text>
                  <Text style={[styles.tableHeaderCell, { width: '15%', textAlign: 'right' }]}>Payout</Text>
                </View>

                {completedJobs.length === 0 ? (
                  <Text style={styles.emptyTableText}>No completed projects covered in this period.</Text>
                ) : (
                  completedJobs.map(job => {
                    const hours = job.totalHoursWorked || 0;
                    const payout = parseFloat((hours * stats.hourlyRate).toFixed(2));
                    return (
                      <View key={job._id} style={styles.tableBodyRow}>
                        <Text style={[styles.tableBodyCell, { width: '25%' }]} numberOfLines={1}>{job.customerName}</Text>
                        <Text style={[styles.tableBodyCell, { width: '25%' }]} numberOfLines={1}>{job.address}</Text>
                        <Text style={[styles.tableBodyCell, { width: '20%' }]} numberOfLines={1}>
                          {new Date(job.startTime).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}
                        </Text>
                        <Text style={[styles.tableBodyCell, { width: '15%', textAlign: 'center' }]}>{hours}h</Text>
                        <Text style={[styles.tableBodyCell, { width: '15%', textAlign: 'right', fontWeight: '800', color: '#059669' }]}>
                          ${payout}
                        </Text>
                      </View>
                    );
                  })
                )}

                {/* Total Payout display card underneath */}
                <View style={styles.totalSummaryBox}>
                  <Text style={styles.totalSummaryLabel}>Total Amount Earned:</Text>
                  <Text style={styles.totalSummaryValue}>${stats.totalPayout}</Text>
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => fadeTransition(() => {
              setSelectedRosterWorker(null);
              setActiveTab('projects');
            })}
          >
            <Text style={styles.backBtnText}>← Back to Home</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.rosterTitle}>Crew Members Roster ({rosterWorkers.length} / {limit})</Text>

        {/* Package Card */}
        <View style={styles.packageCard}>
          <View style={styles.packageHeader}>
            <Text style={styles.packageName}>Subscription Tier: {currentPkgName.toUpperCase()}</Text>
            {currentPkgName === 'Basic' && (
              <TouchableOpacity style={styles.packageUpgradeBtn} onPress={handleUpgradeSubscription}>
                <Text style={styles.packageUpgradeText}>Upgrade Premium</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.packageLimitText}>Crew limit: {rosterWorkers.length} of {limit} crew members associated</Text>
          
          <View style={styles.priceDivider} />
          
          {subscription && subscription.renewsOn && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>
                Plan Status: <Text style={{ color: subscription.planAutoRenew ? '#10B981' : '#F59E0B', fontWeight: '800' }}>
                  {subscription.planAutoRenew ? 'Active (Auto-Renews Monthly)' : 'Active Until Expiry'}
                </Text>
              </Text>
              <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', marginTop: 4 }}>
                {subscription.planAutoRenew ? 'Next Renewal' : 'Expires On'}:{' '}
                <Text style={{ color: '#0F172A', fontWeight: '800' }}>
                  {new Date(subscription.renewsOn).toLocaleDateString()}
                </Text>
              </Text>
              <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', marginTop: 4 }}>
                Next Charge: <Text style={{ color: '#0F172A', fontWeight: '800' }}>${subscription.nextChargeAmount}/month</Text>
              </Text>
            </View>
          )}

          <View style={styles.packageRenewRow}>
            <View style={styles.autoRenewToggle}>
              <Text style={styles.autoRenewLabel}>Auto-Renew:</Text>
              <TouchableOpacity
                onPress={() => handleToggleAutoRenew(subscription?.planAutoRenew !== false)}
              >
                <Text style={subscription?.planAutoRenew !== false ? styles.autoRenewBadgeActive : styles.autoRenewBadgeInactive}>
                  {subscription?.planAutoRenew !== false ? '● ON' : '○ OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.renewBtn} 
              onPress={handleRenewSubscriptionNow}
            >
              <Text style={styles.renewBtnText}>Renew Now ➔</Text>
            </TouchableOpacity>
          </View>

          {profileUser && profileUser.planTotalBilled > 0 ? (
            <Text style={styles.earlySelectChargeText}>
              Total Billed: ${profileUser.planTotalBilled}
            </Text>
          ) : null}
        </View>

        {/* Add Crew search */}
        <View style={styles.addCrewSection}>
          <Text style={styles.addCrewTitle}>Hire/Add Crew Member (by email/name)</Text>
          <View style={styles.addCrewRow}>
            <TextInput
              style={styles.addCrewInput}
              value={searchWorkerEmail}
              onChangeText={handleGlobalSearchWorkers}
              placeholder="Enter worker's name or email"
              placeholderTextColor="#94A3B8"
            />
          </View>

          {foundWorkerList.map(w => (
            <View key={w._id} style={styles.searchResultCard}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{w.name}</Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>{w.email}</Text>
              </View>
              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => handleAddWorkerToRoster(w._id)}
              >
                <Text style={styles.approveBtnText}>Add Crew</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Worker Roster list */}
        <View style={styles.rosterGrid}>
          {rosterWorkers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Roster is empty. Search and add crew members above!</Text>
            </View>
          ) : (
            rosterWorkers.map(w => (
              <TouchableOpacity
                key={w._id}
                style={styles.rosterCard}
                onPress={() => {
                  setSelectedRosterWorker(w);
                  fetchWorkerProfileData(w._id);
                }}
              >
                <Text style={styles.workerIdText}>CREW ID: {w.workerIdNumber || w._id.toString().slice(-8).toUpperCase()}</Text>
                <Text style={styles.workerNameText}>{w.name}</Text>
                <Text style={styles.workerPhoneText}>✉️ {w.email}  |  📞 {w.phoneNumber}</Text>
                <Text style={[
                  styles.workerStatusText,
                  { color: ['available', 'active_shift'].includes(w.status) ? '#10B981' : '#F59E0B' }
                ]}>
                  Roster status: {w.status === 'offline' ? 'OFFLINE' : w.status.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    );
  };

  // Tab 5: Client requests bidding portal rendering helper
  const renderClientRequestsTab = () => {
    const acceptedBids = contracts.filter(c => 
      (c.status === 'active' || c.status === 'pending') && 
      c.notes && c.notes.startsWith('Accepted Client Request')
    );

    const toggleWorkerForContract = (contractId, workerId) => {
      setSelectedWorkersForContract(prev => {
        const current = prev[contractId] || [];
        if (current.includes(workerId)) {
          return { ...prev, [contractId]: current.filter(id => id !== workerId) };
        } else {
          return { ...prev, [contractId]: [...current, workerId] };
        }
      });
    };

    const handleAssignCrewForContract = async (contract) => {
      const selectedIds = selectedWorkersForContract[contract._id] || [];
      if (selectedIds.length === 0) {
        Alert.alert('Selection Required ⚠️', 'Please select at least one crew member.');
        return;
      }

      setLoading(true);
      try {
        let assignedCount = 0;
        for (const workerId of selectedIds) {
          const alreadyIn = contract.workers?.some(w => (w._id || w).toString() === workerId.toString());
          if (!alreadyIn) {
            await contractorAPI.assignWorker(workerId, contract._id);
            assignedCount++;
          }
        }
        Alert.alert('Success 🎉', `Successfully assigned ${assignedCount} crew member(s) to this contract.`);
        setSelectedWorkersForContract(prev => ({ ...prev, [contract._id]: [] }));
        setExpandedAcceptedBidId(null);
        loadInitialData(); // Refresh contracts list
      } catch (e) {
        Alert.alert('Error ⚠️', 'Failed to assign some crew members.');
      } finally {
        setLoading(false);
      }
    };

    return (
      <View style={{ paddingBottom: 40 }}>
        {/* Sub-Tab Navigation Bar */}
        <View style={styles.subTabHeaderRow}>
          <TouchableOpacity
            style={[styles.subTabButton, bidsSubTab === 'open' && styles.subTabButtonActive]}
            onPress={() => setBidsSubTab('open')}
            activeOpacity={0.7}
          >
            <Text style={[styles.subTabButtonText, bidsSubTab === 'open' && styles.subTabButtonTextActive]}>
              Open Requests
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTabButton, bidsSubTab === 'accepted' && styles.subTabButtonActive]}
            onPress={() => setBidsSubTab('accepted')}
            activeOpacity={0.7}
          >
            <Text style={[styles.subTabButtonText, bidsSubTab === 'accepted' && styles.subTabButtonTextActive]}>
              Accepted Bids ({acceptedBids.length})
            </Text>
          </TouchableOpacity>
        </View>

        {bidsSubTab === 'open' ? (
          <View>
            <Text style={styles.rosterTitle}>Client Service Requests Portal</Text>
            <Text style={styles.sectionSubtitle}>Place bid offers on local client job postings matching your category</Text>

            {loadingRequests ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />
            ) : clientRequests.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No open client requests matching your business categories and location base.</Text>
              </View>
            ) : (
              clientRequests.map(r => (
                <View key={r._id} style={styles.clientReqCard}>
                  <View style={styles.clientReqHeader}>
                    <Text style={styles.clientReqCategory}>🧹 {r.category} Request</Text>
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceBadgeText}>BIDS: {r.offers?.length || 0}</Text>
                    </View>
                  </View>
                  <Text style={styles.clientReqDate}>📅 Scheduled: {new Date(r.date).toLocaleDateString()} at {r.time}{r.duration ? ` (${r.duration} mins)` : ''}</Text>
                  <Text style={styles.clientReqLoc}>📍 Address: {r.location}</Text>
                  <View style={styles.divider} />
                  <Text style={styles.clientReqDesc}>Description: {r.description}</Text>
                  <View style={styles.divider} />

                  <View style={styles.bidInputRow}>
                    <TextInput
                      style={styles.bidInput}
                      value={bidPrices[r._id] || ''}
                      onChangeText={(v) => setBidPrices(prev => ({ ...prev, [r._id]: v }))}
                      placeholder="Enter bid price ($)"
                      keyboardType="numeric"
                      placeholderTextColor="#94A3B8"
                    />
                    <TouchableOpacity
                      style={styles.bidBtn}
                      onPress={() => handleSubmitBid(r._id)}
                    >
                      <Text style={styles.bidBtnText}>Submit Bid</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View>
            <Text style={styles.rosterTitle}>Accepted Bid Contracts 🤝</Text>
            <Text style={styles.sectionSubtitle}>Select and assign crew members to carry out accepted client bids</Text>

            {acceptedBids.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No accepted bids yet. Keep bidding to win contracts!</Text>
              </View>
            ) : (
              acceptedBids.map(c => {
                const isExpanded = expandedAcceptedBidId === c._id;
                const assignedCount = c.workers?.length || 0;

                return (
                  <View key={c._id} style={styles.acceptedBidCard}>
                    <TouchableOpacity
                      style={styles.acceptedBidHeader}
                      onPress={() => setExpandedAcceptedBidId(isExpanded ? null : c._id)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.acceptedBidTitle}>👤 Client: {c.clientName}</Text>
                        <Text style={styles.acceptedBidSub}>📅 Date: {new Date(c.schedule?.date).toLocaleDateString()} at {c.schedule?.startTime} ({c.schedule?.durationMinutes} mins)</Text>
                        <Text style={styles.acceptedBidLoc}>📍 Site: {c.location?.address}</Text>
                      </View>
                      <View style={[styles.assignCountBadge, assignedCount > 0 ? styles.assignCountActive : styles.assignCountPending]}>
                        <Text style={styles.assignCountText}>
                          {assignedCount > 0 ? `Assigned: ${assignedCount}` : 'No Crew Yet'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.acceptedBidDetails}>
                        <Text style={styles.acceptedBidDesc}>{c.notes}</Text>
                        <View style={styles.divider} />
                        
                        {/* Assigned Crew List */}
                        {assignedCount > 0 && (
                          <View style={{ marginBottom: 12 }}>
                            <Text style={styles.assignedCrewTitle}>Current Assigned Crew:</Text>
                            <View style={styles.assignedCrewList}>
                              {c.workers.map(w => {
                                const workerObj = rosterWorkers.find(rw => rw._id === (w._id || w));
                                return (
                                  <View key={w._id || w} style={styles.assignedCrewItem}>
                                    <Text style={styles.assignedCrewText}>👤 {workerObj ? workerObj.name : 'Unknown Crew'}</Text>
                                  </View>
                                );
                              })}
                            </View>
                            <View style={styles.divider} />
                          </View>
                        )}

                        {/* Crew Selector Checklist */}
                        <Text style={styles.selectCrewHeader}>Select crew member(s) to assign:</Text>
                        {rosterWorkers.length === 0 ? (
                          <Text style={styles.noWorkersText}>No crew members found on your roster. Please add workers first.</Text>
                        ) : (
                          <View style={styles.crewChecklist}>
                            {rosterWorkers.map(worker => {
                              const isAssigned = c.workers?.some(w => (w._id || w).toString() === worker._id.toString());
                              const isChecked = (selectedWorkersForContract[c._id] || []).includes(worker._id);

                              return (
                                <TouchableOpacity
                                  key={worker._id}
                                  style={[
                                    styles.checklistRow,
                                    isAssigned && styles.checklistRowDisabled
                                  ]}
                                  disabled={isAssigned}
                                  onPress={() => toggleWorkerForContract(c._id, worker._id)}
                                  activeOpacity={0.7}
                                >
                                  <View style={styles.checkboxContainer}>
                                    <Text style={styles.checkboxIcon}>
                                      {isAssigned ? '✓' : isChecked ? '☑️' : '⬜'}
                                    </Text>
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[styles.checklistWorkerName, isAssigned && styles.checklistTextDisabled]}>
                                      {worker.name} {isAssigned && '(Already Assigned)'}
                                    </Text>
                                    <Text style={styles.checklistWorkerStatus}>
                                      Status: {worker.status || 'available'}
                                    </Text>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                            
                            <TouchableOpacity
                              style={styles.confirmAssignBtn}
                              onPress={() => handleAssignCrewForContract(c)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.confirmAssignBtnText}>Assign Selected Crew</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>
    );
  };

  // Tab 6: Crew-targeted Freelance board tab rendering helper
  const renderFreelanceTab = () => {
    const currentPkgName = packages.find(p => p._id === (profileUser?.packageId?._id || profileUser?.packageId))?.name || subscription?.packageName || 'Basic';
    if (currentPkgName === 'Basic') {
      return (
        <View style={styles.lockedContainer}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={styles.lockedTitle}>Freelance Workforce Locked</Text>
          <Text style={styles.lockedSubtitle}>
            Connecting and hiring freelance crew members is a premium feature. Please upgrade to the Premium Package to access the freelance workforce board.
          </Text>
          <TouchableOpacity 
            style={styles.lockedUpgradeBtn}
            onPress={handleUpgradeSubscription}
          >
            <Text style={styles.lockedUpgradeBtnText}>Upgrade to Premium Tier</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View>
        <Text style={styles.rosterTitle}>Crew Workforce Shifts (Targeted to Crew Roster)</Text>

        {/* Post Form */}
        <View style={styles.freelanceForm}>
          <Text style={styles.freelanceFormTitle}>Post Targeted Shift to Crew Roster</Text>
          
          {/* Service Category Dropdown */}
          <View style={styles.dropdownContainer}>
            <Text style={styles.fieldLabel}>Service Category <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={styles.dropdownSelectBox}
              onPress={() => {
                setShowFreelanceCategoryDropdown(!showFreelanceCategoryDropdown);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.dropdownSelectIcon}>
                {CATEGORY_OPTIONS.find(c => c.id === freelanceCategory)?.icon || '🛠️'}
              </Text>
              <Text style={styles.dropdownSelectText}>
                {freelanceCategory || 'Select Service Category'}
              </Text>
              <Text style={styles.dropdownArrowIcon}>
                {showFreelanceCategoryDropdown ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {showFreelanceCategoryDropdown && (
              <View style={styles.dropdownMenu}>
                {CATEGORY_OPTIONS.map((option) => {
                  const isSelected = freelanceCategory === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                      onPress={() => {
                        setFreelanceCategory(option.id);
                        setShowFreelanceCategoryDropdown(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.dropdownMenuItemText}>
                        {option.icon}  {option.label}
                      </Text>
                      {isSelected && (
                        <Text style={styles.selectedCheckmark}>✓</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Search Address (Easiest Method) */}
          <View style={styles.searchPlaceContainer}>
            <Text style={styles.fieldGroupLabel}>Search Address/Place (Easiest Method) 🔍</Text>
            <TextInput
              style={styles.searchPlaceInput}
              placeholder="Enter city, state, country, or full address"
              value={freelanceSearchQuery}
              onChangeText={handleFreelancePlaceSearch}
              placeholderTextColor="#94A3B8"
            />
            {freelanceSearchingPlace && (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />
            )}
            {freelanceSearchSuggestions.length > 0 && (
              <View style={styles.suggestionsBox}>
                {freelanceSearchSuggestions.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionItem}
                    onPress={() => handleFreelanceSelectSuggestion(item)}
                  >
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      📍 {item.display_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Google Maps Coordinates Picker */}
          <Text style={styles.fieldGroupLabel}>Google Maps Location Picker <Text style={{ color: Colors.danger }}>*</Text></Text>
          <EmbeddedGoogleMap
            latitude={parseFloat(freelanceLatitude) || NY_LAT}
            longitude={parseFloat(freelanceLongitude) || NY_LNG}
            height={220}
            style={{ borderRadius: 16, marginBottom: 14 }}
            onLocationSelect={(lat, lng) => {
              setFreelanceLatitude(lat.toString());
              setFreelanceLongitude(lng.toString());
              handleFreelanceReverseGeocode(lat, lng);
            }}
          />

          {freelanceLoc ? (
            <View style={styles.selectedAddressContainer}>
              <Text style={styles.selectedAddressLabel}>Selected Address: 📍</Text>
              <Text style={styles.selectedAddressText}>{freelanceLoc}</Text>
            </View>
          ) : null}

          {/* Duration (Hours) */}
          <CustomInput
            label="Duration (Hours)"
            value={freelanceHours}
            onChangeText={setFreelanceHours}
            placeholder="4"
            keyboardType="numeric"
            icon="🕒"
            required
          />

          {/* Price Per Hour ($) */}
          <CustomInput
            label="Price Per Hour ($)"
            value={freelancePrice}
            onChangeText={setFreelancePrice}
            placeholder="25"
            keyboardType="numeric"
            icon="💵"
            required
          />

          {/* Date and Time row */}
          <View style={styles.rowFields}>
            <View style={{ flex: 1 }}>
              <CustomInput
                label="Date"
                value={freelanceDate}
                placeholder="Select your preferred service date"
                icon="📅"
                required
                onPress={() => {
                  setCalendarTarget('freelance');
                  setCurrentCalendarMonth(freelanceDate ? new Date(freelanceDate) : new Date());
                  setShowCalendarModal(true);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TimeInput
                label="Time"
                value={freelanceTime}
                onChangeText={setFreelanceTime}
                placeholder="Example: 9:00 AM or 2:30 PM"
                icon="🕒"
                required
              />
            </View>
          </View>

          <CustomInput
            label="Job Description"
            value={freelanceDesc}
            onChangeText={setFreelanceDesc}
            placeholder="Dust reception area, mop floors, clean conference tables."
            icon="📝"
            multiline
            numberOfLines={3}
            required
          />

          <CustomButton
            title="Post Targeted Crew Shift"
            type="primary"
            onPress={handlePostFreelanceJob}
          />
        </View>

        {/* Custom Calendar Picker Modal removed from here */}

        {/* Postings List */}
        <Text style={styles.sectionTitle}>Your Posted Roster Openings ({freelanceJobs.filter(j => j.targetType === 'crew').length})</Text>
        {loadingFreelance ? (
          <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />
        ) : freelanceJobs.filter(j => j.targetType === 'crew').length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No crew shifts posted yet.</Text>
          </View>
        ) : (
          freelanceJobs.filter(j => j.targetType === 'crew').map(job => (
            <View key={job._id} style={styles.freelanceCard}>
              <TouchableOpacity
                style={styles.freelanceHeader}
                onPress={() => setExpandedFreelanceId(expandedFreelanceId === job._id ? null : job._id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.freelanceCategoryText}>🛠️ {job.category} ({job.hours} hrs @ ${job.pricePerHour}/hr)</Text>
                  <Text style={styles.freelanceDateText}>📅 Date: {new Date(job.date).toLocaleDateString()} at {job.time}</Text>
                  <Text style={styles.freelanceDateText}>📍 Location: {job.location}</Text>
                </View>
                <View style={[
                  styles.statusBadge,
                  job.status === 'open' ? styles.statusPending : styles.statusActive
                ]}>
                  <Text style={styles.statusText}>{job.status.toUpperCase()}</Text>
                </View>
              </TouchableOpacity>

              {expandedFreelanceId === job._id && (
                <View style={styles.freelanceDetailsBox}>
                  <Text style={styles.freelanceDescText}>Description: {job.description}</Text>
                  <View style={styles.divider} />
                  
                  {job.status !== 'open' ? (
                    <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary }}>
                      Accepted Cleaner: {job.approvedWorker?.name} (Shift assigned)
                    </Text>
                  ) : (
                    <Text style={styles.noOffersText}>Waiting for crew members to accept.</Text>
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </View>
    );
  };


  const renderOnboardingStep1 = () => {
    if (packages.length === 0) {
      return (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ marginTop: 12, color: '#64748B', fontWeight: '600' }}>Loading plans...</Text>
        </View>
      );
    }

    return (
      <View style={styles.onboardingCard}>
        <Text style={styles.onboardingTitle}>Select Your Dispatch Plan</Text>
        <Text style={styles.onboardingSubtitle}>
          Choose the tier that fits your operational needs to continue.
        </Text>

        <View style={styles.premiumCardsContainer}>
          {packages.map((pkg) => {
            const isPremium = pkg.name === 'Premium';
            const userPkgId = user.packageId?._id || user.packageId;
            const isSelected = userPkgId === pkg._id;
            return (
              <TouchableOpacity
                key={pkg._id}
                activeOpacity={0.9}
                style={[
                  styles.customPkgCard,
                  isPremium ? styles.customPkgCardPremium : styles.customPkgCardBasic,
                  isSelected && styles.pkgCardSelected
                ]}
                onPress={() => handleSelectPlan(pkg)}
              >
                <View style={isPremium ? styles.pkgBadgePremium : styles.pkgBadgeBasic}>
                  <Text style={isPremium ? styles.pkgBadgePremiumText : styles.pkgBadgeBasicText}>
                    {isPremium ? 'ENTERPRISE' : 'STANDARD'}
                  </Text>
                </View>
                <Text style={[styles.pkgNameText, isPremium && { color: '#8B5CF6' }]}>
                  {pkg.name} Team
                </Text>
                <Text style={styles.pkgPriceText}>
                  ${pkg.price}
                  <Text style={styles.pkgPriceUnit}>
                    {isPremium ? ' + $25 / cleaner' : ' / fixed'}
                  </Text>
                </Text>
                <Text style={styles.pkgWorkersText}>
                  {isPremium ? '✨ Unlimited crew members • connect with freelance workers' : '🔒 Maximum 5 crew members only'}
                </Text>
                <View style={styles.pkgFeatures}>
                  {isPremium ? (
                    <>
                      <Text style={styles.pkgFeatureItem}>
                        <Text style={styles.checkmark}>✓</Text> Unlimited crew members
                      </Text>
                      <Text style={styles.pkgFeatureItem}>
                        <Text style={styles.checkmark}>✓</Text> Connect with freelance workers
                      </Text>
                      <Text style={styles.pkgFeatureItem}>
                        <Text style={styles.checkmark}>✓</Text> Dynamic pricing calculations
                      </Text>
                      <Text style={styles.pkgFeatureItem}>
                        <Text style={styles.checkmark}>✓</Text> Real-time active GPS tracking
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.pkgFeatureItem}>
                        <Text style={styles.checkmark}>✓</Text> Maximum 5 crew members only
                      </Text>
                      <Text style={styles.pkgFeatureItem}>
                        <Text style={styles.checkmark}>✗</Text> No freelance workers access
                      </Text>
                      <Text style={styles.pkgFeatureItem}>
                        <Text style={styles.checkmark}>✓</Text> Simple contract form
                      </Text>
                      <Text style={styles.pkgFeatureItem}>
                        <Text style={styles.checkmark}>✓</Text> Fixed pricing structure
                      </Text>
                    </>
                  )}
                </View>
                <View style={[styles.pkgSelectBtn, isPremium && styles.pkgSelectBtnPremium]}>
                  <Text style={[styles.pkgSelectText, isPremium && styles.pkgSelectTextPremium]}>
                    Select {pkg.name} Plan ➔
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderOnboardingStep2 = () => {
    const currentPkgName = selectedPackage?.name || 'Basic';
    const limit = currentPkgName === 'Premium' ? 'Unlimited' : 5;

    return (
      <View style={styles.onboardingCard}>
        <Text style={styles.onboardingTitle}>Select Crew Members</Text>
        <Text style={styles.onboardingSubtitle}>
          Search and build your crew roster for the {currentPkgName} subscription.
        </Text>

        <View style={styles.onboardingRosterWrapper}>
          {/* Subscription Info Banner */}
          <View style={styles.onboardingPackageCard}>
            <Text style={styles.onboardingPackageName}>
              Subscription: {currentPkgName.toUpperCase()}
            </Text>
            <Text style={styles.onboardingPackageLimit}>
              Roster Size: {rosterWorkers.length} of {limit} crew members added
            </Text>
          </View>

          {/* Add Crew search */}
          <View style={styles.addCrewSection}>
            <Text style={styles.addCrewTitle}>Hire/Add Crew Member (by email/name)</Text>
            <View style={styles.addCrewRow}>
              <TextInput
                style={styles.addCrewInput}
                value={searchWorkerEmail}
                onChangeText={handleGlobalSearchWorkers}
                placeholder="Enter worker's name or email"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {foundWorkerList.map(w => (
              <View key={w._id} style={styles.searchResultCard}>
                <View>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{w.name}</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>{w.email}</Text>
                </View>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => handleAddWorkerToRoster(w._id)}
                >
                  <Text style={styles.approveBtnText}>Add Crew</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Worker Roster list */}
          <Text style={styles.rosterSectionTitle}>Your Roster ({rosterWorkers.length})</Text>
          <View style={styles.rosterGrid}>
            {rosterWorkers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No crew members added yet. Add workers using the search above.</Text>
              </View>
            ) : (
              rosterWorkers.map(w => (
                <View key={w._id} style={styles.rosterCardCompact}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workerNameText}>{w.name}</Text>
                    <Text style={styles.workerPhoneText}>✉️ {w.email}</Text>
                  </View>
                  <Text style={styles.workerIdBadgeOnboarding}>
                    ID: {w.workerIdNumber || w._id.toString().slice(-8).toUpperCase()}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Next/Finish Button */}
          <TouchableOpacity
            style={styles.onboardingFinishBtn}
            onPress={() => {
              const finishOnboarding = async () => {
                try {
                  await AsyncStorage.setItem(onboardingStorageKey, 'true');
                  setHasOnboarded(true);
                } catch (e) {
                  console.warn('Failed to save onboarding status:', e.message);
                }
                setOnboardingStep(null);
              };

              if (rosterWorkers.length === 0) {
                Alert.alert(
                  'No Crew Members',
                  'You have not added any crew members to your roster. You can add them later via the Roster tab. Do you want to proceed?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Proceed', onPress: finishOnboarding }
                  ]
                );
              } else {
                finishOnboarding();
              }
            }}
          >
            <Text style={styles.onboardingFinishBtnText}>Finish Setup & Enter Dashboard ➔</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.onboardingBackBtn}
            onPress={() => setOnboardingStep(null)}
          >
            <Text style={styles.onboardingBackBtnText}>◀ Back to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPaymentModal = () => {
    if (!paymentModalVisible) return null;

    const handleClose = () => {
      setPaymentModalVisible(false);
    };

    const price = selectedPackage?.price || 299;
    const priceText = `$${price.toFixed(2)}`;
    const planName = `${selectedPackage?.name || 'Basic'} Team`;

    return (
      <Modal
        visible={paymentModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Close button (X) */}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={handleClose}>
              <Text style={styles.modalCloseBtnText}>✕</Text>
            </TouchableOpacity>

            {/* Header info */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderPaymentTag}>PAYMENT</Text>
              <Text style={styles.modalHeaderPlanTitle}>{planName}</Text>
            </View>

            {/* Step Content */}
            {paymentStep === 'SELECT_METHOD' && (
              <View style={{ width: '100%' }}>
                <Text style={styles.modalBodyTitle}>Choose your payment method</Text>
                
                <View style={styles.modalPriceContainer}>
                  <Text style={styles.modalPriceLabel}>Total due today</Text>
                  <Text style={styles.modalPriceValue}>{priceText}</Text>
                </View>

                {/* PayPal Button */}
                <TouchableOpacity
                  style={styles.paypalBtn}
                  activeOpacity={0.8}
                  onPress={() => setPaymentStep('PAYPAL_LOGIN')}
                >
                  <Text style={styles.paypalIcon}>P </Text>
                  <Text style={styles.paypalIconText}>PayPal</Text>
                  <Text style={styles.paypalBtnText}>Pay with PayPal</Text>
                </TouchableOpacity>

                <View style={styles.secureFooter}>
                  <Text style={{ fontSize: 11 }}>🔒 </Text>
                  <Text style={styles.secureFooterText}>Secured • 256-bit SSL encryption</Text>
                </View>
              </View>
            )}

            {paymentStep === 'PAYPAL_LOGIN' && (
              <View style={{ width: '100%' }}>
                {/* PayPal Header Box */}
                <View style={styles.paypalHeaderLogoBox}>
                  <Text style={styles.paypalHeaderLogoText}>PayPal</Text>
                </View>

                <Text style={styles.modalBodyTitle}>Log in to your PayPal account</Text>

                <TextInput
                  style={styles.paypalInput}
                  placeholder="Email or mobile number"
                  placeholderTextColor="#94A3B8"
                  value={paypalEmail}
                  onChangeText={setPaypalEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <TextInput
                  style={styles.paypalInput}
                  placeholder="Password"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={true}
                  value={paypalPassword}
                  onChangeText={setPaypalPassword}
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={styles.paypalLoginBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (!paypalEmail) {
                      Alert.alert('Required', 'Please enter your PayPal email or phone number.');
                      return;
                    }
                    setPaymentStep('PAYPAL_CONFIRM');
                  }}
                >
                  <Text style={styles.paypalLoginBtnText}>Log In</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backLinkContainer}
                  onPress={() => setPaymentStep('SELECT_METHOD')}
                >
                  <Text style={styles.backLinkText}>← Back</Text>
                </TouchableOpacity>
              </View>
            )}

            {paymentStep === 'PAYPAL_CONFIRM' && (
              <View style={{ width: '100%' }}>
                {/* PayPal Header Box */}
                <View style={styles.paypalHeaderLogoBox}>
                  <Text style={styles.paypalHeaderLogoText}>PayPal</Text>
                </View>

                <Text style={styles.modalBodyTitle}>Confirm your payment</Text>

                <View style={styles.confirmBox}>
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Plan</Text>
                    <Text style={styles.confirmValue}>{planName}</Text>
                  </View>
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>Amount</Text>
                    <Text style={[styles.confirmValue, { fontWeight: '800' }]}>{priceText} USD</Text>
                  </View>
                  <View style={[styles.confirmRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.confirmLabel}>PayPal account</Text>
                    <Text style={styles.confirmValue} numberOfLines={1}>
                      {paypalEmail || 'nethmihiranya22@gmail.com'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.paypalPayBtn}
                  activeOpacity={0.85}
                  onPress={() => setPaymentStep('PAYPAL_SUCCESS')}
                >
                  <Text style={styles.paypalPayBtnText}>Pay {priceText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backLinkContainer}
                  onPress={() => setPaymentStep('PAYPAL_LOGIN')}
                >
                  <Text style={styles.backLinkText}>← Back</Text>
                </TouchableOpacity>
              </View>
            )}

            {paymentStep === 'PAYPAL_SUCCESS' && (
              <View style={{ width: '100%', alignItems: 'center' }}>
                <View style={styles.successCircle}>
                  <Text style={styles.successCircleText}>✓</Text>
                </View>

                <Text style={styles.successTitle}>Payment Successful!</Text>
                <Text style={styles.successDescription}>
                  Your {planName} plan is now active. A confirmation has been sent to your PayPal email.
                </Text>

                <TouchableOpacity
                  style={styles.successActionBtn}
                  activeOpacity={0.85}
                  onPress={handleFinalizePayment}
                >
                  {isProcessingPayment ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.successActionBtnText}>Continue to Dashboard</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  // Filter for active contracts
  const activeContracts = contracts.filter(c => c.status === 'active' || c.status === 'pending');

  return (
    <View style={styles.container}>
      {/* ── Corporate Premium Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <View style={styles.logoBadge}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logoImageMini}
              resizeMode="contain"
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.portalTitle}>Contractor Hub</Text>
            <Text style={styles.portalSubtitle}>{user.companyName || 'Corporate Partner'}</Text>
          </View>
        </View>
        {onboardingStep === null && (
          <TouchableOpacity 
            style={{ position: 'relative', padding: 6 }} 
            activeOpacity={0.7}
            onPress={() => setShowNotificationsModal(true)}
          >
            <Text style={{ fontSize: 20 }}>🔔</Text>
            {unreadNotificationsCount > 0 && (
              <View style={{
                position: 'absolute',
                top: -2,
                right: -2,
                backgroundColor: '#EF4444',
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: 3
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                  {unreadNotificationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={activeTab === 'newContract' ? handleFormRefresh : loadInitialData} tintColor={Colors.primary} />
        }
      >
      {/* subscribe to global back-scroll emitter */}
        <Animated.View style={{ opacity: fadeAnim }}>
          {onboardingStep !== null ? (
            onboardingStep === 1 ? (
              renderOnboardingStep1()
            ) : (
              renderOnboardingStep2()
            )
          ) : (
            <>
              {/* ──────────────────────────────────────────────────────────────────
                  TAB 1: PROJECTS (Current Contracts list)
                  ────────────────────────────────────────────────────────────────── */}
              {activeTab === 'projects' && (
            <View>
              {(() => {
                const currentPkgName = packages.find(p => p._id === (profileUser?.packageId?._id || profileUser?.packageId))?.name || subscription?.packageName || 'Basic';
                const limit = currentPkgName === 'Premium' ? 'Unlimited' : 5;
                return (
                  <View>
                    <Text style={styles.rosterTitle}>Crew Members Roster ({rosterWorkers.length} / {limit})</Text>

                    {/* Subscription Details Card */}
                    <View style={styles.packageCard}>
                      <View style={styles.packageHeader}>
                        <Text style={styles.packageName}>Subscription Tier: {currentPkgName.toUpperCase()}</Text>
                        {currentPkgName === 'Basic' && (
                          <TouchableOpacity style={styles.packageUpgradeBtn} onPress={handleUpgradeSubscription}>
                            <Text style={styles.packageUpgradeText}>Upgrade Premium</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={styles.packageLimitText}>Crew limit: {rosterWorkers.length} of {limit} crew members associated</Text>
                      
                      <View style={styles.priceDivider} />
                      
                      {subscription && subscription.renewsOn && (
                        <View style={{ marginTop: 8 }}>
                          <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>
                            Plan Status: <Text style={{ color: subscription.planAutoRenew ? '#10B981' : '#F59E0B', fontWeight: '800' }}>
                              {subscription.planAutoRenew ? 'Active (Auto-Renews Monthly)' : 'Active Until Expiry'}
                            </Text>
                          </Text>
                          <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', marginTop: 4 }}>
                            {subscription.planAutoRenew ? 'Next Renewal' : 'Expires On'}:{' '}
                            <Text style={{ color: '#0F172A', fontWeight: '800' }}>
                              {new Date(subscription.renewsOn).toLocaleDateString()}
                            </Text>
                          </Text>
                          <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600', marginTop: 4 }}>
                            Next Charge: <Text style={{ color: '#0F172A', fontWeight: '800' }}>${subscription.nextChargeAmount}/month</Text>
                          </Text>
                        </View>
                      )}

                      <View style={styles.packageRenewRow}>
                        <View style={styles.autoRenewToggle}>
                          <Text style={styles.autoRenewLabel}>Auto-Renew:</Text>
                          <TouchableOpacity
                            onPress={() => handleToggleAutoRenew(subscription?.planAutoRenew !== false)}
                          >
                            <Text style={subscription?.planAutoRenew !== false ? styles.autoRenewBadgeActive : styles.autoRenewBadgeInactive}>
                              {subscription?.planAutoRenew !== false ? '● ON' : '○ OFF'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity 
                          style={styles.renewBtn} 
                          onPress={handleRenewSubscriptionNow}
                        >
                          <Text style={styles.renewBtnText}>Renew Now ➔</Text>
                        </TouchableOpacity>
                      </View>

                      {profileUser && profileUser.planTotalBilled > 0 ? (
                        <Text style={styles.earlySelectChargeText}>
                          Total Billed: ${profileUser.planTotalBilled}
                        </Text>
                      ) : null}
                    </View>

                    {/* Add Crew search */}
                    <View style={styles.addCrewSection}>
                      <Text style={styles.addCrewTitle}>Hire/Add Crew Member (by email/name)</Text>
                      <View style={styles.addCrewRow}>
                        <TextInput
                          style={styles.addCrewInput}
                          value={searchWorkerEmail}
                          onChangeText={handleGlobalSearchWorkers}
                          placeholder="Enter worker's name or email"
                          placeholderTextColor="#94A3B8"
                        />
                      </View>

                      {foundWorkerList.map(w => (
                        <View key={w._id} style={styles.searchResultCard}>
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{w.name}</Text>
                            <Text style={{ fontSize: 11, color: '#64748B' }}>{w.email}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.approveBtn}
                            onPress={() => handleAddWorkerToRoster(w._id)}
                          >
                            <Text style={styles.approveBtnText}>Add Crew</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}

              {/* Your Crew members Section */}
              <Text style={styles.sectionTitle}>Your Crew Members</Text>
              {rosterWorkers.length === 0 ? (
                <View style={[styles.emptyCard, { marginBottom: 20 }]}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyText}>No crew members added yet.</Text>
                  <TouchableOpacity
                    style={styles.emptyLinkBtn}
                    onPress={() => fadeTransition(() => navigateToTab('roster'))}
                  >
                    <Text style={styles.emptyLinkText}>Build Your Crew Roster Now ➔</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.crewGridContainer}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 10 }}>
                    {rosterWorkers.map((worker) => (
                      <TouchableOpacity
                        key={worker._id}
                        style={styles.homeCrewCard}
                        onPress={() => {
                          setSelectedRosterWorker(worker);
                          fetchWorkerProfileData(worker._id);
                          fadeTransition(() => navigateToTab('roster'));
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.homeCrewAvatarContainer}>
                          <Text style={styles.homeCrewAvatarIcon}>👤</Text>
                          <View style={[
                            styles.homeCrewStatusDot,
                            {
                              backgroundColor: ['available', 'active_shift'].includes(worker.status)
                                ? '#10B981' // Green
                                : ['busy', 'cleaning', 'on_job'].includes(worker.status)
                                ? '#F59E0B' // Amber
                                : '#64748B' // Grey
                            }
                          ]} />
                        </View>
                        <Text style={styles.homeCrewName} numberOfLines={1}>{worker.name}</Text>
                        <Text style={styles.homeCrewId} numberOfLines={1}>
                          {worker.workerIdNumber || `ID: ${worker._id.slice(-6)}`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              TAB 2: NEW CONTRACT (Package selection OR Page Forms)
              ────────────────────────────────────────────────────────────────── */}
          {activeTab === 'newContract' && (
            <View>
              {/* Back to Dashboard Button */}
              <TouchableOpacity
                style={styles.backToDashboardBtn}
                onPress={() => {
                  if (selectedRosterWorker) {
                    setSelectedPackage(null);
                    navigateToTab('roster');
                  } else {
                    navigateToTab('projects');
                  }
                }}
              >
                <Text style={styles.backToDashboardBtnText}>
                  {selectedRosterWorker ? '← Back to Profile' : '← Back to Dashboard'}
                </Text>
              </TouchableOpacity>

              {/* ── State A: Package Selection screen ── */}
              {selectedPackage === null ? (
                <View>
                  <Text style={styles.sectionTitle}>Select Dispatch Package</Text>
                  <Text style={styles.sectionSubtitle}>Choose a tier to draft your cleaning project</Text>

                  <View style={styles.premiumCardsContainer}>
                    {/* Basic Card */}
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.customPkgCard, styles.customPkgCardBasic]}
                      onPress={() => fadeTransition(() => {
                        const basicPkg = packages.find(p => p.name === 'Basic') || { _id: 'mock_basic', name: 'Basic', price: 299 };
                        setSelectedPackage(basicPkg);
                        setSelectedWorkers([]);
                      })}
                    >
                      <View style={styles.pkgBadgeBasic}>
                        <Text style={styles.pkgBadgeBasicText}>STANDARD</Text>
                      </View>
                      <Text style={styles.pkgNameText}>Basic Team</Text>
                      <Text style={styles.pkgPriceText}>$299<Text style={styles.pkgPriceUnit}> / month</Text></Text>
                      <Text style={styles.pkgRenewText}>{formatPlanRenewalText('Basic', 299)}</Text>
                      <Text style={styles.pkgWorkersText}>🔒 Maximum 5 crew members only</Text>
                      <View style={styles.pkgFeatures}>
                        <Text style={styles.pkgFeatureItem}>
                          <Text style={styles.checkmark}>✓</Text> Maximum 5 crew members only
                        </Text>
                        <Text style={styles.pkgFeatureItem}>
                          <Text style={styles.checkmark}>✗</Text> No freelance workers access
                        </Text>
                        <Text style={styles.pkgFeatureItem}>
                          <Text style={styles.checkmark}>✓</Text> Simple contract form
                        </Text>
                        <Text style={styles.pkgFeatureItem}>
                          <Text style={styles.checkmark}>✓</Text> Fixed pricing structure
                        </Text>
                      </View>
                      <View style={styles.pkgSelectBtn}>
                        <Text style={styles.pkgSelectText}>Select Basic Form ➔</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Premium Card */}
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[styles.customPkgCard, styles.customPkgCardPremium]}
                      onPress={() => fadeTransition(() => {
                        const premPkg = packages.find(p => p.name === 'Premium') || { _id: 'mock_premium', name: 'Premium', price: 199 };
                        setSelectedPackage(premPkg);
                        setRequiredWorkersCount(1);
                        setSelectedWorkers([]);
                      })}
                    >
                      <View style={styles.pkgBadgePremium}>
                        <Text style={styles.pkgBadgePremiumText}>ENTERPRISE</Text>
                      </View>
                      <Text style={[styles.pkgNameText, { color: '#8B5CF6' }]}>Premium Team</Text>
                      <Text style={styles.pkgPriceText}>$199<Text style={styles.pkgPriceUnit}> / month</Text></Text>
                      <Text style={styles.pkgRenewText}>{formatPlanRenewalText('Premium', 199)}</Text>
                      <Text style={styles.pkgWorkersText}>✨ Unlimited crew members • connect with freelance workers</Text>
                      <View style={styles.pkgFeatures}>
                        <Text style={styles.pkgFeatureItem}>
                          <Text style={styles.checkmark}>✓</Text> Unlimited crew members
                        </Text>
                        <Text style={styles.pkgFeatureItem}>
                          <Text style={styles.checkmark}>✓</Text> Connect with freelance workers
                        </Text>
                        <Text style={styles.pkgFeatureItem}>
                          <Text style={styles.checkmark}>✓</Text> Dynamic pricing calculations
                        </Text>
                        <Text style={styles.pkgFeatureItem}>
                          <Text style={styles.checkmark}>✓</Text> Real-time active GPS tracking
                        </Text>
                      </View>
                      <View style={[styles.pkgSelectBtn, styles.pkgSelectBtnPremium]}>
                        <Text style={styles.pkgSelectTextPremium}>Select Premium Plan ➔</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.formCard}>
                  <View style={styles.formCardHeader}>
                    <View style={[
                      styles.tierBadge,
                      selectedPackage.name === 'Premium' ? styles.tierBadgePremium : styles.tierBadgeBasic
                    ]}>
                      <Text style={styles.tierBadgeText}>{selectedPackage.name.toUpperCase()} FORM</Text>
                    </View>
                  </View>

                  <Text style={styles.formMainTitle}>
                    {selectedPackage.name === 'Premium' ? 'Premium Dispatch Specifications' : 'Basic Dispatch Specifications'}
                  </Text>
                  


                  {/* ── Form Fields ── */}
                  <CustomInput
                    label="Contractor Name"
                    value={clientName}
                    onChangeText={setClientName}
                    placeholder="Grand Central Office Complex"
                    icon="🏢"
                    required
                    editable={true}
                  />

                  <CustomInput
                    label="Contractor Phone Number"
                    value={clientPhone}
                    onChangeText={setClientPhone}
                    placeholder="77 123 4567"
                    isPhoneInput={true}
                    countryCode={clientCountryCode}
                    onCountryCodeChange={setClientCountryCode}
                    keyboardType="phone-pad"
                    required
                  />

                  {/* Premium Places Autocomplete Search Bar (Easiest Method) */}
                  <View style={styles.searchPlaceContainer}>
                    <Text style={styles.fieldGroupLabel}>Search Address/Place (Easiest Method) 🔍</Text>
                    <TextInput
                      style={styles.searchPlaceInput}
                      placeholder="Enter city, state, country, or full address"
                      value={searchQuery}
                      onChangeText={handlePlaceSearch}
                      placeholderTextColor="#94A3B8"
                    />
                    
                    {searchingPlace && (
                      <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />
                    )}

                    {searchSuggestions.length > 0 && (
                      <View style={styles.suggestionsBox}>
                        {searchSuggestions.map((item, index) => (
                          <TouchableOpacity
                            key={index}
                            style={styles.suggestionItem}
                            onPress={() => handleSelectSuggestion(item)}
                          >
                            <Text style={styles.suggestionText} numberOfLines={1}>
                              📍 {item.display_name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Google Maps Coordinates Picker */}
                  <Text style={styles.fieldGroupLabel}>Google Maps Location Picker <Text style={{ color: Colors.danger }}>*</Text></Text>
                  <EmbeddedGoogleMap
                    latitude={parseFloat(latitude) || NY_LAT}
                    longitude={parseFloat(longitude) || NY_LNG}
                    height={220}
                    style={{ borderRadius: 16, marginBottom: 14 }}
                    onLocationSelect={(lat, lng) => {
                      setLatitude(lat.toString());
                      setLongitude(lng.toString());
                      handleReverseGeocode(lat, lng);
                    }}
                  />

                  {address ? (
                    <View style={styles.selectedAddressContainer}>
                      <Text style={styles.selectedAddressLabel}>Selected Address: 📍</Text>
                      <Text style={styles.selectedAddressText}>{address}</Text>
                    </View>
                  ) : null}



                  {/* Date and Time row */}
                  <View style={styles.rowFields}>
                    <View style={{ flex: 1 }}>
                      <CustomInput
                        label="Date"
                        value={date}
                        placeholder="Select your preferred service date"
                        icon="📅"
                        required
                        onPress={() => {
                          setCalendarTarget('newContract');
                          setCurrentCalendarMonth(date ? new Date(date) : new Date());
                          setShowCalendarModal(true);
                        }}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TimeInput
                        label="Start Time"
                        value={startTime}
                        onChangeText={setStartTime}
                        placeholder="Example: 9:00 AM or 2:30 PM"
                        icon="🕒"
                        required
                      />
                    </View>
                  </View>

                  <CustomInput
                    label="Duration (Min)"
                    value={durationMinutes}
                    onChangeText={setDurationMinutes}
                    placeholder="120"
                    keyboardType="numeric"
                  />

                  <CustomInput
                    label="Price Per Hour ($)"
                    value={pricePerHour}
                    onChangeText={setPricePerHour}
                    placeholder="25"
                    keyboardType="numeric"
                    icon="💵"
                    required
                  />

                  <CustomInput
                    label="Special Notes/Instructions"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Special instructions or entry gates code..."
                    icon="📝"
                  />

                  {/* Crew size stepper removed */}





                  <TouchableOpacity
                    style={[styles.dispatchBtn, loading && styles.dispatchBtnDisabled]}
                    onPress={handleCreateContract}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.dispatchBtnText}>
                      {loading ? '⏳ Dispatching Project...' : '🚀 Dispatch Cleaning Project'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              TAB 3: REAL-TIME GPS (Live tracking monitor)
              ────────────────────────────────────────────────────────────────── */}
          {activeTab === 'gps' && (
            <View>
              <Text style={styles.sectionTitle}>Real-time GPS Dispatch Tracking</Text>
              
              {activeContracts.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>📡</Text>
                  <Text style={styles.emptyText}>No active contracts found. Create a contract first.</Text>
                  <TouchableOpacity
                    style={styles.emptyLinkBtn}
                    onPress={() => fadeTransition(() => { setSelectedPackage(null); navigateToTab('newContract'); })}
                  >
                    <Text style={styles.emptyLinkText}>Draft New Dispatch Now ➔</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  {/* Active contracts selector */}
                  <View style={styles.activeContractsSelectorBox}>
                    <Text style={styles.stepperLabel}>Select Active Tracking Contract:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                      {activeContracts.map((c) => (
                        <TouchableOpacity
                          key={c._id}
                          style={[
                            styles.activeContractTab,
                            selectedContractForMap?._id === c._id && styles.activeContractTabSelected
                          ]}
                          onPress={() => {
                            setSelectedContractForMap(c);
                            setMockProgress(0); // Restart route tracking
                          }}
                        >
                          <Text style={[
                            styles.activeContractTabText,
                            selectedContractForMap?._id === c._id && styles.activeContractTabTextSelected
                          ]}>
                            🏢 {c.clientName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {selectedContractForMap && (
                    <View style={styles.mapCard}>
                      <View style={styles.mapContractHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mapClient}>{selectedContractForMap.clientName}</Text>
                          <Text style={styles.mapAddress}>📍 Site: {selectedContractForMap.location?.address}</Text>
                        </View>
                        <View style={styles.liveIndicatorBadge}>
                          <Text style={styles.liveIndicatorText}>● LIVE SIGNAL</Text>
                        </View>
                      </View>

                      {/* SLA Warning banner */}
                      {selectedContractForMap.isUrgent && (
                        <View style={styles.slaBanner}>
                          <Text style={styles.slaBannerText}>
                            🚨 Urgent dispatch contract: 5-minute cleaner response window.
                          </Text>
                        </View>
                      )}

                      {/* Real-time Google Map styled radar fallback */}
                      {selectedContractForMap.workers?.map((w) => {
                        const isAccepted = selectedContractForMap.assignments?.some(
                          a => a.workerId?._id === w._id && a.response === 'accepted'
                        );
                        if (!isAccepted) return null;

                        const liveInfo = liveWorkers[w._id] || {};
                        const lat = liveInfo.lat || selectedContractForMap.location?.coordinates?.lat || NY_LAT;
                        const lng = liveInfo.lng || selectedContractForMap.location?.coordinates?.lng || NY_LNG;
                        const geofence = liveInfo.status === 'Left Work Area' ? 'outside_breach' : 'inside';

                        return (
                          <View key={w._id} style={{ marginBottom: 16 }}>
                            <Text style={styles.radarLabel}>🛰️ Dispatch Tracking Radar: {w.name}</Text>
                            <MapViewContainer
                              clientCoords={[selectedContractForMap.location?.coordinates?.lng || NY_LNG, selectedContractForMap.location?.coordinates?.lat || NY_LAT]}
                              workerCoords={[lng, lat]}
                              clientName={selectedContractForMap.clientName}
                              workerName={w.name}
                              geofenceRadius={50}
                              geofenceStatus={geofence}
                              height={230}
                            />
                          </View>
                        );
                      })}

                      {/* Geofence Alerts warnings list */}
                      {geofenceAlerts.length > 0 && (
                        <View style={styles.alertsCard}>
                          <Text style={styles.alertsTitle}>🚨 Recent Geofence Breach Events</Text>
                          {geofenceAlerts.map((alert) => (
                            <View key={alert.id} style={[
                              styles.alertRow, 
                              alert.type === 'breach' ? styles.alertRowBreach : styles.alertRowReturn
                            ]}>
                              <Text style={styles.alertRowText}>{alert.message}</Text>
                              <Text style={styles.alertRowTime}>{new Date(alert.timestamp).toLocaleTimeString()}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Worker Live Tracking Stats Log Panel */}
                      <View style={styles.trackingPanel}>
                        <Text style={styles.trackingPanelTitle}>Active Crew Status & Attendance Verification Board:</Text>
                        
                        {selectedContractForMap.workers?.length === 0 ? (
                          <Text style={styles.noWorkersText}>No workers associated with this contract.</Text>
                        ) : (
                          selectedContractForMap.workers?.map((w) => {
                            const isAccepted = selectedContractForMap.assignments?.some(
                              a => a.workerId?._id === w._id && a.response === 'accepted'
                            );

                            const liveInfo = liveWorkers[w._id] || {};
                            
                            const workedMins = liveInfo.workedMinutes || 0;
                            const spentMins = Math.floor(workedMins);
                            const spentHrs = Math.floor(spentMins / 60);
                            const spentRemainingMins = spentMins % 60;

                            const contractDuration = selectedContractForMap.schedule?.durationMinutes || 120;
                            const remainingMins = Math.max(0, contractDuration - spentMins);
                            const remainingHrs = Math.floor(remainingMins / 60);
                            const remainingRemainingMins = remainingMins % 60;

                            const completionPercentage = Math.min(100, Math.round((spentMins / contractDuration) * 100));

                            const violationsCount = liveInfo.totalViolations || 0;
                            const timeSpentOutside = Math.round(liveInfo.timeSpentOutsideMinutes || 0);

                            // Attendance grade summary
                            let grade = 'PENDING';
                            if (liveInfo.checkInTime) {
                              if (violationsCount === 0) grade = 'GOOD';
                              else if (violationsCount <= 2) grade = 'MINOR ISSUES';
                              else grade = 'ATTENDANCE WARNING';
                            }
                            if (liveInfo.status === 'Completed') {
                              grade = 'COMPLETED';
                            }

                            if (!isAccepted) return null;

                            return (
                              <View key={w._id} style={styles.trackingWorkerCard}>
                                <View style={styles.trackingWorkerHeader}>
                                  <View>
                                    <Text style={styles.trackingPanelName}>👤 {w.name}</Text>
                                    <Text style={styles.trackingPanelMeta}>ID: {w.email}</Text>
                                  </View>
                                  <View style={[
                                    styles.arrivalBadge,
                                    liveInfo.status === 'Completed' ? styles.arrivalBadgeGreen : styles.arrivalBadgeBlue
                                  ]}>
                                    <Text style={styles.arrivalBadgeText}>
                                      {(liveInfo.status || 'Traveling').toUpperCase()}
                                    </Text>
                                  </View>
                                </View>

                                {/* Work Duration System representation */}
                                {liveInfo.checkInTime ? (
                                  <View style={styles.durationAnalyticsBox}>
                                    <View style={styles.durationRow}>
                                      <Text style={styles.durationLabel}>Worked Duration:</Text>
                                      <Text style={styles.durationValue}>{spentHrs}h {spentRemainingMins}m</Text>
                                    </View>
                                    <View style={styles.durationRow}>
                                      <Text style={styles.durationLabel}>Remaining Duration:</Text>
                                      <Text style={styles.durationValue}>{remainingHrs}h {remainingRemainingMins}m</Text>
                                    </View>
                                    
                                    {/* Progress completion bar */}
                                    <View style={styles.progressContainer}>
                                      <View style={[styles.progressBar, { width: `${completionPercentage}%` }]} />
                                      <Text style={styles.progressText}>{completionPercentage}% Completed</Text>
                                    </View>
                                  </View>
                                ) : (
                                  <View style={styles.notStartedBox}>
                                    <Text style={styles.notStartedText}>⏳ Shift Check-In Pending (Worker traveling)</Text>
                                  </View>
                                )}

                                {/* Attendance Verification System details */}
                                <View style={styles.verificationSummaryGrid}>
                                  <Text style={styles.verificationHeading}>Attendance Verification Score Card</Text>
                                  <View style={styles.verificationRow}>
                                    <Text style={styles.verificationLabel}>Total Geofence Violations:</Text>
                                    <Text style={[
                                      styles.verificationValue, 
                                      violationsCount > 0 && { color: Colors.danger, fontWeight: '900' }
                                    ]}>
                                      {violationsCount} breaches
                                    </Text>
                                  </View>
                                  <View style={styles.verificationRow}>
                                    <Text style={styles.verificationLabel}>Time Spent Outside Work Area:</Text>
                                    <Text style={styles.verificationValue}>{timeSpentOutside} mins</Text>
                                  </View>
                                  <View style={styles.verificationRow}>
                                    <Text style={styles.verificationLabel}>GPS Attendance Summary:</Text>
                                    <Text style={[
                                      styles.verificationValue,
                                      { fontWeight: '950' },
                                      grade === 'GOOD' || grade === 'COMPLETED' ? { color: Colors.success } : { color: Colors.warning }
                                    ]}>
                                      {grade}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

              {activeTab === 'roster' && renderRosterTab()}
              {activeTab === 'clientRequests' && renderClientRequestsTab()}
              {activeTab === 'freelance' && renderFreelanceTab()}
              {activeTab === 'profile' && renderProfileTab()}
            </>
          )}
        </Animated.View>

        <AppFooter />
      </ScrollView>

      {/* ── Floating bottom navigation bar ── */}
      {onboardingStep === null && (
        <View style={styles.tabBarContainer}>
          <TouchableOpacity
            style={styles.tabBarItem}
            activeOpacity={0.8}
            onPress={() => {
              if (activeTab !== 'projects') {
                fadeTransition(() => navigateToTab('projects'));
              }
            }}
          >
            <Text style={[styles.tabBarIcon, activeTab === 'projects' && styles.tabBarIconActive]}>📁</Text>
            <Text style={[styles.tabBarLabel, activeTab === 'projects' && styles.tabBarLabelActive]}>Projects</Text>
            {activeTab === 'projects' && <View style={styles.tabActiveIndicator} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabBarItem}
            activeOpacity={0.8}
            onPress={() => {
              if (activeTab !== 'clientRequests') {
                fadeTransition(() => navigateToTab('clientRequests'));
              }
            }}
          >
            <Text style={[styles.tabBarIcon, activeTab === 'clientRequests' && styles.tabBarIconActive]}>📥</Text>
            <Text style={[styles.tabBarLabel, activeTab === 'clientRequests' && styles.tabBarLabelActive]}>Bids</Text>
            {activeTab === 'clientRequests' && <View style={styles.tabActiveIndicator} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabBarItem}
            activeOpacity={0.8}
            onPress={() => {
              if (activeTab !== 'freelance') {
                fadeTransition(() => navigateToTab('freelance'));
              }
            }}
          >
            <Text style={[styles.tabBarIcon, activeTab === 'freelance' && styles.tabBarIconActive]}>💼</Text>
            <Text style={[styles.tabBarLabel, activeTab === 'freelance' && styles.tabBarLabelActive]}>Crew Free</Text>
            {activeTab === 'freelance' && <View style={styles.tabActiveIndicator} />}
          </TouchableOpacity>


          <TouchableOpacity
            style={styles.tabBarItem}
            activeOpacity={0.8}
            onPress={() => {
              if (activeTab !== 'profile') {
                fadeTransition(() => navigateToTab('profile'));
              }
            }}
          >
            <Text style={[styles.tabBarIcon, activeTab === 'profile' && styles.tabBarIconActive]}>👤</Text>
            <Text style={[styles.tabBarLabel, activeTab === 'profile' && styles.tabBarLabelActive]}>Profile</Text>
            {activeTab === 'profile' && <View style={styles.tabActiveIndicator} />}
          </TouchableOpacity>
        </View>
      )}
      {renderPaymentModal()}

      {/* Custom Calendar Picker Modal */}
      <Modal
        visible={showCalendarModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity 
                onPress={() => {
                  const prevMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1, 1);
                  setCurrentCalendarMonth(prevMonth);
                }}
                style={styles.calendarNavBtn}
              >
                <Text style={styles.calendarNavBtnText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>
                {currentCalendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity 
                onPress={() => {
                  const nextMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1, 1);
                  setCurrentCalendarMonth(nextMonth);
                }}
                style={styles.calendarNavBtn}
              >
                <Text style={styles.calendarNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekdaysRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d, index) => (
                <Text key={index} style={styles.weekdayText}>{d}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {getDaysInMonth(currentCalendarMonth).map((day, index) => {
                if (!day) {
                  return <View key={`empty-${index}`} style={styles.dayCellEmpty} />;
                }
                
                const yyyy = day.getFullYear();
                const mm = String(day.getMonth() + 1).padStart(2, '0');
                const dd = String(day.getDate()).padStart(2, '0');
                const dateStr = `${yyyy}-${mm}-${dd}`;
                
                const isSelected = calendarTarget === 'newContract'
                  ? date === dateStr
                  : calendarTarget === 'rosterAssign'
                  ? rosterAssignDate === dateStr
                  : freelanceDate === dateStr;
                const isToday = new Date().toDateString() === day.toDateString();
                const isPast = day.getTime() < new Date().setHours(0, 0, 0, 0);

                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={styles.dayCell}
                    disabled={isPast}
                    onPress={() => {
                      if (calendarTarget === 'newContract') {
                        setDate(dateStr);
                      } else if (calendarTarget === 'rosterAssign') {
                        setRosterAssignDate(dateStr);
                      } else {
                        setFreelanceDate(dateStr);
                      }
                      setShowCalendarModal(false);
                    }}
                  >
                    <View style={[
                      styles.dayInnerCircle,
                      !isPast && isSelected && styles.dayInnerCircleSelected,
                      !isPast && isToday && !isSelected && styles.dayInnerCircleToday
                    ]}>
                      <Text style={[
                        styles.dayText,
                        isPast && { color: '#CBD5E1' },
                        !isPast && isSelected && styles.dayTextSelected,
                        !isPast && isToday && !isSelected && styles.dayTextToday
                      ]}>
                        {day.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity 
              style={styles.calendarCloseBtn}
              onPress={() => setShowCalendarModal(false)}
            >
              <Text style={styles.calendarCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Contractor Notifications Modal */}
      <Modal
        visible={showNotificationsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarMonthTitle}>🔔 Notifications</Text>
              <TouchableOpacity 
                onPress={() => setShowNotificationsModal(false)}
                style={styles.calendarNavBtn}
              >
                <Text style={styles.calendarNavBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={{ maxHeight: 350, marginVertical: 10 }}
              showsVerticalScrollIndicator={false}
            >
              {loadingNotifications ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
              ) : notifications.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#64748B', fontSize: 13, marginVertical: 20 }}>
                  No notifications yet.
                </Text>
              ) : (
                notifications.map(notif => (
                  <TouchableOpacity
                    key={notif._id}
                    style={{
                      padding: 12,
                      backgroundColor: notif.read ? '#FFFFFF' : 'rgba(16, 185, 129, 0.05)',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: notif.read ? '#E2E8F0' : 'rgba(16, 185, 129, 0.2)',
                      marginBottom: 8
                    }}
                    onPress={() => handleNotificationClick(notif)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontWeight: '800', color: Colors.secondary, fontSize: 13 }}>
                        {notif.title}
                      </Text>
                      {!notif.read && (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
                      )}
                    </View>
                    <Text style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>
                      {notif.message}
                    </Text>
                    <Text style={{ fontSize: 9.5, color: '#94A3B8', alignSelf: 'flex-end' }}>
                      {new Date(notif.createdAt).toLocaleString()}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <TouchableOpacity 
              style={styles.calendarCloseBtn}
              onPress={() => setShowNotificationsModal(false)}
            >
              <Text style={styles.calendarCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 16,
    borderBottomWidth: 1.2,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: Colors.secondary, // Dark Blue Header
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 2
  },
  logoImageMini: {
    width: '100%',
    height: '100%'
  },
  titleCol: {
    justifyContent: 'center'
  },
  portalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF'
  },
  portalSubtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    marginTop: 1
  },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  logoutText: {
    color: '#FCA5A5', // Light red for contrast
    fontSize: 11.5,
    fontWeight: '800'
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 110 // Bottom spacer for floating tab navigation bar
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: 0.2
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 20
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 32,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: 10
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 14
  },
  emptyLinkBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12
  },
  emptyLinkText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13
  },

  // ── Projects Card Styles ──
  contractCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2
  },
  contractHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  contractClient: {
    fontSize: 16,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 4
  },
  contractAddress: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '650',
    lineHeight: 16
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9'
  },
  statusText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#64748B'
  },
  statusActive: {
    backgroundColor: '#EFF6FF'
  },
  statusCompleted: {
    backgroundColor: '#ECFDF5'
  },
  statusPending: {
    backgroundColor: '#FFFBEB'
  },
  divider: {
    height: 1.2,
    backgroundColor: '#F1F5F9',
    marginVertical: 14
  },
  metaInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  metaCol: {
    flex: 1
  },
  metaLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 2
  },
  metaValue: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '750'
  },
  notesText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 8,
    fontWeight: '600',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  workersTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
    marginTop: 4
  },
  noWorkersText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    fontStyle: 'italic'
  },
  workerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  workerCol: {
    flex: 1
  },
  workerName: {
    fontSize: 13,
    fontWeight: '750',
    color: '#1E293B'
  },
  workerPhone: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2
  },
  workerStatusLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 3
  },
  assignBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9'
  },
  assignText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#64748B'
  },
  assignAccepted: {
    backgroundColor: '#D1FAE5'
  },
  assignRejected: {
    backgroundColor: '#FEE2E2'
  },
  assignPending: {
    backgroundColor: '#FEF3C7'
  },
  assignExpired: {
    backgroundColor: '#E2E8F0'
  },
  countdownText: {
    fontSize: 9.5,
    color: '#B45309',
    fontWeight: '850',
    marginTop: 4
  },
  mapLinkBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.2,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14
  },
  mapLinkBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '900'
  },

  // ── Package Card Selection Styles ──
  premiumCardsContainer: {
    flexDirection: 'column',
    gap: 16,
    marginTop: 10
  },
  customPkgCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4
  },
  customPkgCardBasic: {
    borderColor: '#3B82F6',
    borderWidth: 2
  },
  customPkgCardPremium: {
    borderColor: '#E9D5FF',
    borderWidth: 1.5
  },
  pkgBadgeBasic: {
    backgroundColor: '#E6F4EA',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 10
  },
  pkgBadgeBasicText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#137333',
    letterSpacing: 0.5
  },
  pkgBadgePremium: {
    backgroundColor: '#E8F0FE',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 10
  },
  pkgBadgePremiumText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1A73E8',
    letterSpacing: 0.5
  },
  pkgBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 0.5
  },
  pkgNameText: {
    fontSize: 18,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 6
  },
  pkgPriceText: {
    fontSize: 32,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 2
  },
  pkgPriceUnit: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B'
  },
  pkgRenewText: {
    fontSize: 11.5,
    color: '#1E40AF',
    fontWeight: '700',
    marginBottom: 8
  },
  pkgWorkersText: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '750',
    marginBottom: 14
  },
  pkgFeatures: {
    marginVertical: 10,
    gap: 6
  },
  pkgFeatureItem: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600'
  },
  checkmark: {
    color: '#10B981',
    fontWeight: '900',
    marginRight: 6
  },
  pkgSelectBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14
  },
  pkgSelectBtnPremium: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0'
  },
  pkgSelectText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E293B'
  },
  pkgSelectTextPremium: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E293B'
  },

  // ── Form Card Styles ──
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 3
  },
  formCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  backToPackagesBtn: {
    paddingVertical: 4
  },
  backToPackagesText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 13
  },
  tierBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  tierBadgeBasic: {
    backgroundColor: '#E0F2FE'
  },
  tierBadgePremium: {
    backgroundColor: '#F5F3FF'
  },
  tierBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: Colors.primary
  },
  formMainTitle: {
    fontSize: 20,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 16
  },
  pricingSummaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20
  },
  priceDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3
  },
  priceLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700'
  },
  priceVal: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '800'
  },
  priceDivider: {
    height: 1,
    backgroundColor: '#CBD5E1',
    marginVertical: 8
  },
  priceLabelTotal: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '900'
  },
  priceValTotal: {
    fontSize: 18,
    color: '#10B981',
    fontWeight: '950'
  },
  fieldGroupLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
    marginBottom: 6
  },

  // ── Interactive Location Picker ──
  simulatedMapPicker: {
    height: 180,
    backgroundColor: '#CBD5E1',
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#94A3B8',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14
  },
  mapPickerCrosshair: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 12
  },
  mapPickerSiteEmoji: {
    fontSize: 24,
    zIndex: 1,
    marginBottom: 16
  },
  mapPickerBadge: {
    position: 'absolute',
    bottom: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  mapPickerBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '800'
  },
  mapQuickSelectRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4
  },
  quickSelectBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  quickSelectText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#334155'
  },
  rowFields: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%'
  },

  // Premium Custom Inputs
  crewStepperBox: {
    marginVertical: 14
  },
  stepperLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '750',
    marginBottom: 8
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center'
  },
  stepBtnDisabled: {
    opacity: 0.4
  },
  stepBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#334155'
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: '950',
    color: '#0F172A'
  },

  // Priority Selector
  premiumPriorityContainer: {
    marginVertical: 10
  },
  prioritySelectorRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%'
  },
  priorityCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center'
  },
  priorityCardActive: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF2FF'
  },
  priorityCardActiveRed: {
    borderColor: '#EF4444',
    backgroundColor: '#FFF5F5'
  },
  priorityCardIcon: {
    fontSize: 18,
    marginBottom: 4
  },
  priorityCardLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B'
  },
  priorityCardLabelActive: {
    color: Colors.primary
  },
  priorityCardLabelActiveRed: {
    color: '#EF4444'
  },
  priorityCardDesc: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2
  },

  // Crew Search & Selection Cards
  workerSelectHeading: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10
  },
  searchBarInput: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 13,
    fontWeight: '650',
    color: '#0F172A',
    marginBottom: 12
  },
  workerResultsContainer: {
    gap: 8,
    maxHeight: 210,
    overflow: 'scroll',
    marginBottom: 16
  },
  workerSearchCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12
  },
  workerSearchCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#EEF2FF'
  },
  workerCardInfo: {
    flex: 1
  },
  workerCardName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A'
  },
  workerCardId: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2
  },
  workerCardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  workerCardStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569'
  },
  workerCardSelectBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderWidth: 1.2,
    borderColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 12
  },
  workerCardSelectBtnRemove: {
    backgroundColor: '#FFF5F5',
    borderColor: '#EF4444'
  },
  workerCardSelectBtnDisabled: {
    opacity: 0.4,
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9'
  },
  workerCardSelectBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.primary
  },
  workerCardSelectBtnTextRemove: {
    color: '#EF4444'
  },
  crewReviewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 16
  },
  crewReviewTitle: {
    fontSize: 12.5,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 6
  },
  crewReviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6'
  },
  crewReviewName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155'
  },
  crewReviewRemoveText: {
    color: '#EF4444',
    fontWeight: '850',
    fontSize: 12
  },
  dispatchBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
    marginTop: 10
  },
  dispatchBtnDisabled: {
    backgroundColor: '#A5B4FC',
    shadowOpacity: 0.1
  },
  dispatchBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2
  },

  // ── Tab 3: GPS Tracking Styles ──
  activeContractsSelectorBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 14
  },
  activeContractTab: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1'
  },
  activeContractTabSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    borderColor: Colors.primary
  },
  activeContractTabText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B'
  },
  activeContractTabTextSelected: {
    color: Colors.primary
  },
  mapContractHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  liveIndicatorBadge: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6
  },
  liveIndicatorText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#EF4444'
  },
  slaBanner: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14
  },
  slaBannerText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '750',
    lineHeight: 15
  },
  simulatedMap: {
    height: 200,
    backgroundColor: '#1E293B', // Sat-Slate Premium Map base
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.2,
    borderColor: '#475569'
  },
  mapGridLines: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#38BDF8',
    opacity: 0.04
  },
  contractorMarker: {
    position: 'absolute',
    top: 40,
    left: 45,
    alignItems: 'center'
  },
  contractorIcon: {
    fontSize: 22
  },
  markerMiniLabel: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '800',
    backgroundColor: 'rgba(79, 70, 229, 0.85)',
    paddingVertical: 1,
    paddingHorizontal: 3,
    borderRadius: 3,
    marginTop: 1
  },
  destMarker: {
    position: 'absolute',
    top: 100,
    left: 150,
    alignItems: 'center'
  },
  sitePulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    transform: [{ scale: 1.3 }]
  },
  destMarkerEmoji: {
    fontSize: 28,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3
  },
  destLabel: {
    fontSize: 9.5,
    color: '#FFFFFF',
    fontWeight: '900',
    backgroundColor: 'rgba(239, 68, 68, 0.85)',
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 4,
    marginTop: 2
  },
  workerMarker: {
    position: 'absolute',
    alignItems: 'center',
    width: 60,
    height: 60
  },
  markerPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(56, 189, 248, 0.3)',
    transform: [{ scale: 1.4 }]
  },
  markerEmoji: {
    fontSize: 17,
    color: Colors.white,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    padding: 1.5,
    borderWidth: 1,
    borderColor: Colors.white
  },
  markerNameBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 4,
    marginTop: 1,
    borderWidth: 1,
    borderColor: '#475569'
  },
  markerNameText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF'
  },
  trackingPanel: {
    marginTop: 16
  },
  trackingPanelTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10
  },
  trackingPanelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  trackingPanelName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 1
  },
  trackingPanelMeta: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2
  },
  arrivalBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8
  },
  arrivalBadgeBlue: {
    backgroundColor: '#EFF6FF'
  },
  arrivalBadgeGreen: {
    backgroundColor: '#ECFDF5'
  },
  arrivalBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: Colors.primary
  },
  geofenceTag: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginTop: 5
  },
  geofenceTagInside: {
    backgroundColor: '#D1FAE5'
  },
  geofenceTagOutside: {
    backgroundColor: '#FFFBEB'
  },
  geofenceTagText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#0F172A'
  },

  // ── GPS Real-Time Dashboard Styled Widgets ──
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 3
  },
  mapClient: {
    fontSize: 16,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 4
  },
  mapAddress: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '650',
    lineHeight: 16
  },
  radarLabel: {
    fontSize: 12.5,
    fontWeight: '850',
    color: '#334155',
    marginTop: 14,
    marginBottom: 8
  },
  alertsCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#FCA5A5',
    padding: 14,
    marginTop: 16,
    marginBottom: 8
  },
  alertsTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#EF4444',
    marginBottom: 8
  },
  alertRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.1)'
  },
  alertRowBreach: {
    backgroundColor: 'rgba(239, 68, 68, 0.03)'
  },
  alertRowReturn: {
    backgroundColor: 'rgba(16, 185, 129, 0.03)',
    borderBottomColor: 'rgba(16, 185, 129, 0.1)'
  },
  alertRowText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '650',
    color: '#334155'
  },
  alertRowTime: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
    marginLeft: 10
  },
  trackingWorkerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1
  },
  trackingWorkerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  durationAnalyticsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    marginBottom: 14
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  durationLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B'
  },
  durationValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B'
  },
  progressContainer: {
    marginTop: 10,
    height: 16,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#10B981',
    borderRadius: 8
  },
  progressText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#334155',
    zIndex: 1
  },
  notStartedBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  notStartedText: {
    fontSize: 12,
    fontWeight: '750',
    color: '#B45309'
  },
  verificationSummaryGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12
  },
  verificationHeading: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 6
  },
  verificationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4
  },
  verificationLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569'
  },
  verificationValue: {
    fontSize: 11.5,
    fontWeight: '850',
    color: '#1F2937'
  },

  // ── Floating Bottom Navigation Bar Styles ──
  tabBarContainer: {
    position: 'absolute',
    bottom: 25,
    left: 16,
    right: 16,
    height: 64,
    backgroundColor: Colors.secondary, // Dark Blue navigation
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10
  },
  tabBarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    paddingTop: 4
  },
  tabBarIcon: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.65)',
    marginBottom: 2
  },
  tabBarIconActive: {
    color: '#10B981' // Green highlights
  },
  tabBarLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.65)'
  },
  tabBarLabelActive: {
    color: '#10B981', // Green highlights
    fontWeight: '900'
  },
  tabActiveIndicator: {
    width: 14,
    height: 3,
    backgroundColor: '#10B981', // Green highlights
    borderRadius: 1.5,
    marginTop: 4
  },
  searchPlaceContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    marginBottom: 14
  },
  searchPlaceInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    height: 44,
    paddingHorizontal: 12,
    fontSize: 12.5,
    fontWeight: '650',
    color: '#0F172A'
  },
  suggestionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginTop: 8,
    overflow: 'hidden'
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6'
  },
  suggestionText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '700'
  },
  selectedAddressContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    borderWidth: 1.2,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    width: '100%'
  },
  selectedAddressLabel: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  selectedAddressText: {
    fontSize: 12.5,
    color: '#1F2937',
    fontWeight: '700',
    lineHeight: 18
  },

  // ── New Crewlynk System Styles ──
  rosterTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    marginTop: 10
  },
  packageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  packageName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B'
  },
  packageUpgradeBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8
  },
  packageUpgradeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800'
  },
  packageLimitText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600'
  },
  addCrewSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 20
  },
  addCrewTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8
  },
  addCrewRow: {
    flexDirection: 'row',
    marginBottom: 10
  },
  addCrewInput: {
    flex: 1,
    height: 42,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC'
  },
  searchResultCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6
  },
  approveBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800'
  },
  rosterGrid: {
    gap: 12,
    marginBottom: 20
  },
  rosterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  workerIdText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 4
  },
  workerNameText: {
    fontSize: 14.5,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 4
  },
  workerPhoneText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 6
  },
  workerStatusText: {
    fontSize: 11,
    fontWeight: '800'
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2
  },
  profileHeader: {
    marginBottom: 16
  },
  profileName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8
  },
  profileContact: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 4
  },
  profilePeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  periodLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B'
  },
  periodButtons: {
    flexDirection: 'row',
    gap: 6
  },
  periodBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8
  },
  periodBtnActive: {
    backgroundColor: Colors.primary
  },
  periodBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800'
  },
  periodBtnTextActive: {
    color: '#FFFFFF'
  },
  payoutCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    borderWidth: 1.2,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20
  },
  payoutTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  payoutValue: {
    fontSize: 24,
    fontWeight: '950',
    color: '#059669',
    marginBottom: 4
  },
  payoutHours: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700'
  },
  handoverSection: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16
  },
  handoverTitle: {
    fontSize: 13,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 8
  },
  handoverInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  handoverBtn: {
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center'
  },
  handoverBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800'
  },
  backBtn: {
    backgroundColor: '#E2E8F0',
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 12
  },
  backBtnText: {
    color: '#475569',
    fontSize: 12.5,
    fontWeight: '800'
  },

  // Client requests bids styles
  clientReqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  clientReqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  clientReqCategory: {
    fontSize: 14,
    fontWeight: '850',
    color: '#0F172A'
  },
  clientReqDate: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 2
  },
  clientReqLoc: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '550',
    marginBottom: 6
  },
  clientReqDesc: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    lineHeight: 18
  },
  priceBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  priceBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800'
  },
  bidInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 4
  },
  bidInput: {
    flex: 1,
    height: 40,
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC'
  },
  bidBtn: {
    height: 40,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  bidBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800'
  },

  // Freelance Form & cards styles
  freelanceForm: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 20
  },
  freelanceFormTitle: {
    fontSize: 14,
    fontWeight: '850',
    color: '#1E293B',
    marginBottom: 12
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12
  },
  freelanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden'
  },
  freelanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16
  },
  freelanceCategoryText: {
    fontSize: 13.5,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 4
  },
  freelanceDateText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2
  },
  freelanceDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1.2,
    borderTopColor: '#F1F5F9',
    padding: 16
  },
  freelanceDescText: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 8
  },
  applicantsTitle: {
    fontSize: 12.5,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 10
  },
  applicantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8
  },
  applicantName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A'
  },
  applicantPhone: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '650',
    marginTop: 2
  },
  noOffersText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
    fontStyle: 'italic'
  },
  
  // Custom Dropdowns Styles
  dropdownContainer: {
    width: '100%',
    marginBottom: 14
  },
  fieldLabel: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
    fontWeight: '700',
    letterSpacing: 0.1
  },
  required: {
    color: Colors.danger
  },
  dropdownSelectBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: 'rgba(30, 58, 138, 0.25)',
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  dropdownSelectIcon: {
    fontSize: 16,
    marginRight: 10,
    color: '#64748B'
  },
  dropdownSelectText: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '600',
    flex: 1
  },
  dropdownPlaceholder: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600'
  },
  dropdownArrowIcon: {
    fontSize: 10,
    color: '#64748B',
    marginLeft: 10
  },
  dropdownErrorBorder: {
    borderColor: Colors.danger
  },
  dropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
    padding: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    width: '100%',
    zIndex: 10
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2
  },
  dropdownMenuItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)'
  },
  dropdownMenuItemText: {
    fontSize: 13.5,
    color: '#334155',
    fontWeight: '600'
  },
  selectedCheckmark: {
    color: Colors.primary,
    fontWeight: '900',
    fontSize: 13
  },

  // Calendar Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '90%',
    maxWidth: 340,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  calendarNavBtnText: {
    fontSize: 12,
    color: '#334155'
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A'
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B'
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  dayCell: {
    width: '14.28%',
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 44,
    marginVertical: 2
  },
  dayInnerCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center'
  },
  dayInnerCircleSelected: {
    backgroundColor: '#10B981'
  },
  dayInnerCircleToday: {
    borderWidth: 1.5,
    borderColor: '#1E3A8A'
  },
  dayCellPast: {
    opacity: 0.35
  },
  dayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800'
  },
  dayTextToday: {
    color: '#1E3A8A',
    fontWeight: '800'
  },
  dayTextPast: {
    color: '#94A3B8'
  },
  calendarCloseBtn: {
    marginTop: 20,
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center'
  },
  calendarCloseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155'
  },

  // Roster Tab Worker Profile View Styles
  profileIdBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E3A8A',
    backgroundColor: '#EFF6FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
    marginBottom: 8
  },
  profileSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16
  },
  profileSectionTitle: {
    fontSize: 13.5,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 12
  },
  emptySectionText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    fontWeight: '600'
  },
  miniProjectCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8
  },
  miniProjectTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4
  },
  miniProjectSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2
  },
  handoverSelectBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  handoverSelectText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155'
  },
  handoverDropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
    padding: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    width: '100%'
  },
  handoverDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  handoverDropdownItemText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600'
  },
  handoverSubmitBtn: {
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 10
  },
  handoverSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800'
  },
  periodSelectBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  periodSelectText: {
    fontSize: 12.5,
    fontWeight: '750',
    color: '#334155'
  },
  periodDropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
    padding: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    width: '100%'
  },
  periodDropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  periodDropdownItemText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
    paddingBottom: 8,
    marginBottom: 8
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569'
  },
  emptyTableText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    fontWeight: '600',
    marginVertical: 10,
    textAlign: 'center'
  },
  tableBodyRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 10,
    alignItems: 'center'
  },
  tableBodyCell: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600'
  },
  totalSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    borderWidth: 1.2,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    padding: 14,
    marginTop: 16
  },
  totalSummaryLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#047857'
  },
  totalSummaryValue: {
    fontSize: 18,
    fontWeight: '950',
    color: '#047857'
  },
  onboardingCard: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    margin: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8
  },
  onboardingSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20
  },
  onboardingRosterWrapper: {
    width: '100%'
  },
  onboardingPackageCard: {
    backgroundColor: '#EEF2F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  onboardingPackageName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4
  },
  onboardingPackageLimit: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600'
  },
  rosterSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 20,
    marginBottom: 10
  },
  rosterCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 12,
    marginBottom: 8
  },
  workerIdBadgeOnboarding: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3B82F6',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden'
  },
  onboardingFinishBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3
  },
  onboardingFinishBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800'
  },
  onboardingBackBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 10
  },
  onboardingBackBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700'
  },
  pkgCardSelected: {
    borderColor: '#3B82F6',
    borderWidth: 2,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.1,
    backgroundColor: '#F0F7FF'
  },
  crewGridContainer: {
    marginBottom: 20,
    marginTop: 10
  },
  homeCrewCard: {
    width: 105,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
    marginRight: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  homeCrewAvatarContainer: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  homeCrewAvatarIcon: {
    fontSize: 20
  },
  homeCrewStatusDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF'
  },
  homeCrewName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
    width: '100%',
    marginBottom: 2
  },
  homeCrewId: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500'
  },
  assignJobBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10
  },
  assignJobBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800'
  },
  selectedDateDisplay: {
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3B82F6'
  },
  selectedDateLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4
  },
  selectedDateText: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '700',
    marginBottom: 8
  },
  proceedToContractBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center'
  },
  proceedToContractBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800'
  },
  backToDashboardBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
    alignSelf: 'flex-start'
  },
  backToDashboardBtnText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700'
  },
  profileGpsCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#1E293B'
  },
  profileGpsTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10
  },
  profileGpsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  profileGpsCol: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8
  },
  profileGpsLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2
  },
  profileGpsVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700'
  },
  automatedLabel: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    marginTop: 6,
    textAlign: 'center'
  },
  packageRenewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10
  },
  renewBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  renewBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800'
  },
  autoRenewToggle: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  autoRenewLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
    marginRight: 6
  },
  autoRenewBadgeActive: {
    color: '#10B981',
    fontWeight: '800',
    fontSize: 12
  },
  autoRenewBadgeInactive: {
    color: '#F59E0B',
    fontWeight: '800',
    fontSize: 12
  },
  earlySelectChargeText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '700',
    marginTop: 6
  },
  // ── Payment Modal Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
    position: 'relative'
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 6,
    zIndex: 10
  },
  modalCloseBtnText: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '700'
  },
  modalHeader: {
    alignSelf: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    width: '100%',
    paddingBottom: 10,
    marginBottom: 16
  },
  modalHeaderPaymentTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1,
    marginBottom: 2
  },
  modalHeaderPlanTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B'
  },
  modalBodyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16
  },
  modalPriceContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 20,
    width: '100%'
  },
  modalPriceLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  modalPriceValue: {
    fontSize: 32,
    color: '#0F172A',
    fontWeight: '900'
  },
  paypalBtn: {
    backgroundColor: '#FFC439',
    borderRadius: 10,
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    gap: 6
  },
  paypalIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0079C1',
    fontStyle: 'italic'
  },
  paypalIconText: {
    color: '#003087',
    fontSize: 16,
    fontWeight: '900',
    fontStyle: 'italic',
    marginRight: 4
  },
  paypalBtnText: {
    color: '#003087',
    fontSize: 14,
    fontWeight: '800'
  },
  modalDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    width: '100%'
  },
  modalDividerLine: {
    flex: 1,
    height: 1.2,
    backgroundColor: '#E2E8F0'
  },
  modalDividerText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '800',
    paddingHorizontal: 10
  },
  cardBtn: {
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 48,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    gap: 8
  },
  cardBtnText: {
    color: '#334155',
    fontSize: 13.5,
    fontWeight: '800'
  },
  cardLogos: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 10
  },
  cardLogoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  },
  cardLogoText: {
    fontSize: 9,
    fontWeight: '900'
  },
  secureFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 8
  },
  secureFooterText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600'
  },
  paypalHeaderLogoBox: {
    backgroundColor: '#003087',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 22,
    alignSelf: 'center',
    marginBottom: 16
  },
  paypalHeaderLogoText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic'
  },
  paypalInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
    width: '100%'
  },
  paypalLoginBtn: {
    backgroundColor: '#003087',
    borderRadius: 10,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 6,
    marginBottom: 14
  },
  paypalLoginBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  },
  backLinkContainer: {
    alignSelf: 'center',
    paddingVertical: 8
  },
  backLinkText: {
    color: '#475569',
    fontSize: 12.5,
    fontWeight: '800'
  },
  confirmBox: {
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    marginBottom: 16
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 8
  },
  confirmLabel: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600'
  },
  confirmValue: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '750',
    flex: 1,
    textAlign: 'right'
  },
  paypalPayBtn: {
    backgroundColor: '#FFC439',
    borderRadius: 10,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginBottom: 14
  },
  paypalPayBtnText: {
    color: '#003087',
    fontSize: 14,
    fontWeight: '800'
  },
  successCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14
  },
  successCircleText: {
    color: '#22C55E',
    fontSize: 24,
    fontWeight: '900'
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center'
  },
  successDescription: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8
  },
  successActionBtn: {
    backgroundColor: '#10B981',
    borderRadius: 10,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%'
  },
  successActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 14
  },
  cardHeaderTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1E293B'
  },
  cardAmountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 14
  },
  cardAmountLabel: {
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '700'
  },
  cardAmountVal: {
    fontSize: 13.5,
    color: '#2563EB',
    fontWeight: '900'
  },
  cardFieldLabel: {
    fontSize: 11.5,
    fontWeight: '750',
    color: '#475569',
    alignSelf: 'flex-start',
    marginBottom: 4
  },
  cardInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 40,
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 10,
    width: '100%'
  },
  cardPayBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
    marginBottom: 10
  },
  cardPayBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  },
  secureCardFooter: {
    alignSelf: 'center',
    marginBottom: 14
  },
  secureCardFooterText: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '600'
  },
  lockedContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginHorizontal: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  lockedIcon: {
    fontSize: 52,
    marginBottom: 16
  },
  lockedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center'
  },
  lockedSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 12
  },
  lockedUpgradeBtn: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3
  },
  lockedUpgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800'
  },
  subTabHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    gap: 4
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  subTabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1
  },
  subTabButtonText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700'
  },
  subTabButtonTextActive: {
    color: Colors.primary
  },
  acceptedBidCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  acceptedBidHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  acceptedBidTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4
  },
  acceptedBidSub: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
    fontWeight: '600'
  },
  acceptedBidLoc: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600'
  },
  assignCountBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  assignCountActive: {
    backgroundColor: '#DEF7EC'
  },
  assignCountPending: {
    backgroundColor: '#FEF3C7'
  },
  assignCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#03543F'
  },
  acceptedBidDetails: {
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6'
  },
  acceptedBidDesc: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
    fontWeight: '600'
  },
  assignedCrewTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8
  },
  assignedCrewList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  assignedCrewItem: {
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8
  },
  assignedCrewText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569'
  },
  selectCrewHeader: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10
  },
  noWorkersText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    fontStyle: 'italic',
    marginVertical: 10
  },
  crewChecklist: {
    gap: 8
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    gap: 10
  },
  checklistRowDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.8
  },
  checkboxContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkboxIcon: {
    fontSize: 16
  },
  checklistWorkerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A'
  },
  checklistTextDisabled: {
    color: '#94A3B8'
  },
  checklistWorkerStatus: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600'
  },
  confirmAssignBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  confirmAssignBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800'
  }
});

export default ContractorDashboard;
