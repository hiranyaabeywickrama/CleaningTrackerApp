import React, { useState, useEffect, useRef } from 'react';
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
  BackHandler
} from 'react-native';
import { Colors } from '../../theme/colors';
import { contractorAPI, getBaseUrl } from '../../api/client';
import CustomInput from '../../components/CustomInput';
import AppFooter from '../../components/AppFooter';
import io from 'socket.io-client';
import MapViewContainer from '../../components/MapViewContainer';
import EmbeddedGoogleMap from '../../components/EmbeddedGoogleMap';
import * as Location from 'expo-location';

// ── New York Default Coordinates (Seeder alignment) ──────────────────────────
const NY_LAT = 40.7128;
const NY_LNG = -73.9786;

const ContractorDashboard = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState('projects'); // 'projects', 'newContract', 'gps'

  // ── Packages & Contracts State ──────────────────────────────────────────────
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null); // null = Package selection screen
  const [contracts, setContracts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Contract Form State ─────────────────────────────────────────────────────
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientCountryCode, setClientCountryCode] = useState('+94');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(NY_LAT.toString());
  const [longitude, setLongitude] = useState(NY_LNG.toString());
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('2026-05-30');
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState('120');
  
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

  // ── Fetch Packages & Contracts ──────────────────────────────────────────────
  const loadInitialData = async () => {
    try {
      setRefreshing(true);
      const pkgRes = await contractorAPI.getPackages();
      if (pkgRes.success) setPackages(pkgRes.packages);

      const contractRes = await contractorAPI.getContracts();
      if (contractRes.success) {
        setContracts(contractRes.contracts);
        
        // Auto-select first active or pending contract for GPS tracking
        const active = contractRes.contracts.find(c => c.status === 'active' || c.status === 'pending');
        if (active && !selectedContractForMap) {
          setSelectedContractForMap(active);
        }
      }
      setRefreshing(false);
    } catch (e) {
      setRefreshing(false);
      console.error('Error loading contractor data:', e.message);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // ── Auto-resolve Contractor's Current Location ──
  useEffect(() => {
    const fetchCurrentLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const { latitude: currentLat, longitude: currentLng } = location.coords;
          
          setLatitude(currentLat.toString());
          setLongitude(currentLng.toString());
        }
      } catch (err) {
        console.warn('Error fetching device location for Contractor Dashboard:', err.message);
      }
    };

    if (activeTab === 'newContract') {
      fetchCurrentLocation();
    }
  }, [activeTab]);

  // Handle hardware back press (Android)
  useEffect(() => {
    const backAction = () => {
      if (activeTab === 'newContract' && selectedPackage !== null) {
        fadeTransition(() => setSelectedPackage(null));
        return true; // prevent default behavior
      }
      return false; // run default behavior
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [activeTab, selectedPackage]);

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
      // Query Photon (Komoot) autocomplete service which is designed for search-as-you-type and does not block client IPs
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`
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
          
          const displayName = parts.filter(Boolean).join(', ');
          
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
      // 1. Restrict to available workers only
      if (worker.status !== 'available') {
        Alert.alert(
          'Cleaner Unavailable',
          `👤 ${worker.name} is currently ${worker.status.toUpperCase().replace('_', ' ')}. You can only select Available cleaners for contracts.`
        );
        return;
      }

      // 2. Basic package limit verification (max 5 workers)
      if (selectedPackage?.name === 'Basic' && selectedWorkers.length >= 5) {
        Alert.alert(
          'Basic Package Limit',
          '⚠️ The Basic Package permits a maximum of 5 workers. Please upgrade to the Premium Package to select larger crew sizes.'
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
    const crewSize = Math.max(1, requiredWorkersCount);
    return 199 + (crewSize - 1) * 25;
  };

  // ── Submit Contract Dispatch ────────────────────────────────────────────────
  const handleCreateContract = async () => {
    if (!clientName.trim() || !clientPhone.trim() || !address.trim()) {
      Alert.alert('Required Fields', 'Please complete Client Name, Phone, and Address.');
      return;
    }

    const fullPhoneNumber = `${clientCountryCode}${clientPhone.trim().replace(/^0/, '')}`;
    const cleanPhone = fullPhoneNumber.replace(/[\s\-().+]/g, '');
    if (cleanPhone.length < 9 || cleanPhone.length > 15) {
      Alert.alert('Invalid Phone Number', 'Enter a valid client phone number (9–15 digits)');
      return;
    }

    const minCrew = selectedPackage.name === 'Premium' ? requiredWorkersCount : 1;
    if (selectedWorkers.length < minCrew) {
      Alert.alert(
        'Insufficient Crew Selected',
        `Please select at least ${minCrew} available worker(s) to fulfill the requirements of this contract.`
      );
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
        requiredWorkersCount: selectedPackage.name === 'Premium' ? requiredWorkersCount : selectedWorkers.length,
        isUrgent: selectedPackage.name === 'Premium' ? isUrgent : false,
        date,
        startTime,
        durationMinutes: parseInt(durationMinutes),
        notes: notes.trim()
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
                setClientName('');
                setClientPhone('');
                setAddress('');
                setLatitude(NY_LAT.toString());
                setLongitude(NY_LNG.toString());
                setNotes('');
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
    setClientName('');
    setClientPhone('');
    setAddress('');
    setLatitude(NY_LAT.toString());
    setLongitude(NY_LNG.toString());
    setNotes('');
    setDate('2026-05-30');
    setStartTime('09:00');
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
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Logout ➔</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={activeTab === 'newContract' ? handleFormRefresh : loadInitialData} tintColor={Colors.primary} />
        }
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* ──────────────────────────────────────────────────────────────────
              TAB 1: PROJECTS (Current Contracts list)
              ────────────────────────────────────────────────────────────────── */}
          {activeTab === 'projects' && (
            <View>
              <Text style={styles.sectionTitle}>Drafted Cleaning Projects</Text>
              {contracts.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyIcon}>📂</Text>
                  <Text style={styles.emptyText}>No contracts drafted yet.</Text>
                  <TouchableOpacity
                    style={styles.emptyLinkBtn}
                    onPress={() => setActiveTab('newContract')}
                  >
                    <Text style={styles.emptyLinkText}>Draft Your First Project ➔</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                contracts.map((contract) => (
                  <View key={contract._id} style={styles.contractCard}>
                    <View style={styles.contractHeader}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.contractClient}>{contract.clientName}</Text>
                        <Text style={styles.contractAddress}>📍 {contract.location?.address}</Text>
                      </View>
                      <View style={[
                        styles.statusBadge,
                        contract.status === 'active' && styles.statusActive,
                        contract.status === 'completed' && styles.statusCompleted,
                        contract.status === 'pending' && styles.statusPending
                      ]}>
                        <Text style={styles.statusText}>{contract.status.toUpperCase()}</Text>
                      </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metaInfoRow}>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Package Tier</Text>
                        <Text style={styles.metaValue}>{contract.packageId?.name || 'Basic'}</Text>
                      </View>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Scheduled Date</Text>
                        <Text style={styles.metaValue}>
                          {new Date(contract.schedule.date).toLocaleDateString()}
                        </Text>
                      </View>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Required Crew</Text>
                        <Text style={styles.metaValue}>{contract.requiredWorkersCount} Cleaners</Text>
                      </View>
                    </View>

                    {contract.notes ? (
                      <Text style={styles.notesText}>📝 Note: {contract.notes}</Text>
                    ) : null}

                    <View style={styles.divider} />

                    <Text style={styles.workersTitle}>Cleaner Response Logs ({contract.assignments?.length || 0})</Text>
                    {contract.assignments?.length === 0 ? (
                      <Text style={styles.noWorkersText}>No workers requested.</Text>
                    ) : (
                      contract.assignments?.map((assign) => (
                        <View key={assign._id} style={styles.workerRow}>
                          <View style={styles.workerCol}>
                            <Text style={styles.workerName}>👤 {assign.workerId?.name || 'Cleaner'}</Text>
                            <Text style={styles.workerPhone}>📞 {assign.workerId?.phoneNumber || 'No Phone'}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <View style={[
                              styles.assignBadge,
                              assign.response === 'accepted' && styles.assignAccepted,
                              assign.response === 'rejected' && styles.assignRejected,
                              assign.response === 'pending' && styles.assignPending,
                              assign.response === 'expired' && styles.assignExpired
                            ]}>
                              <Text style={styles.assignText}>{assign.response.toUpperCase()}</Text>
                            </View>
                            {assign.response === 'pending' && (
                              <Text style={styles.countdownText}>🕒 {renderRemainingTime(assign.responseDeadline)}</Text>
                            )}
                          </View>
                        </View>
                      ))
                    )}

                    {(contract.status === 'active' || contract.status === 'pending') && (
                      <TouchableOpacity
                        style={styles.mapLinkBtn}
                        onPress={() => {
                          setSelectedContractForMap(contract);
                          setMockProgress(0);
                          fadeTransition(() => setActiveTab('gps'));
                        }}
                      >
                        <Text style={styles.mapLinkBtnText}>📡 Open Live GPS Monitor</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              TAB 2: NEW CONTRACT (Package selection OR Page Forms)
              ────────────────────────────────────────────────────────────────── */}
          {activeTab === 'newContract' && (
            <View>
              {/* ── State A: Package Selection screen ── */}
              {selectedPackage === null ? (
                <View>
                  <Text style={styles.sectionTitle}>Select Dispatch Package</Text>
                  <Text style={styles.sectionSubtitle}>Choose a tier to draft your cleaning project</Text>

                  <View style={styles.premiumCardsContainer}>
                    {/* Basic Card */}
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.customPkgCard}
                      onPress={() => fadeTransition(() => {
                        const basicPkg = packages.find(p => p.name === 'Basic') || { _id: 'mock_basic', name: 'Basic', price: 299 };
                        setSelectedPackage(basicPkg);
                        setSelectedWorkers([]);
                      })}
                    >
                      <View style={styles.pkgBadgeBasic}>
                        <Text style={styles.pkgBadgeText}>STANDARD</Text>
                      </View>
                      <Text style={styles.pkgNameText}>Basic Team</Text>
                      <Text style={styles.pkgPriceText}>$299<Text style={styles.pkgPriceUnit}> / fixed</Text></Text>
                      <Text style={styles.pkgWorkersText}>🔒 Maximum 5 cleaners only</Text>
                      <View style={styles.pkgFeatures}>
                        <Text style={styles.pkgFeatureItem}>✓ Simple contract form</Text>
                        <Text style={styles.pkgFeatureItem}>✓ Fixed pricing structure</Text>
                        <Text style={styles.pkgFeatureItem}>✓ Reliable workforce booking</Text>
                        <Text style={styles.pkgFeatureItem}>✓ Standard response times (15m)</Text>
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
                        <Text style={styles.pkgBadgeText}>ENTERPRISE</Text>
                      </View>
                      <Text style={[styles.pkgNameText, { color: '#8B5CF6' }]}>Premium Dynamic</Text>
                      <Text style={styles.pkgPriceText}>$199<Text style={styles.pkgPriceUnit}> + $25 / cleaner</Text></Text>
                      <Text style={styles.pkgWorkersText}>✨ Dynamic crew sizing (up to 50)</Text>
                      <View style={styles.pkgFeatures}>
                        <Text style={styles.pkgFeatureItem}>✓ Dynamic pricing calculations</Text>
                        <Text style={styles.pkgFeatureItem}>✓ Real-time active GPS tracking</Text>
                        <Text style={styles.pkgFeatureItem}>✓ Priority worker dispatching</Text>
                        <Text style={styles.pkgFeatureItem}>✓ 🚨 Urgent support dispatch (5m)</Text>
                      </View>
                      <View style={[styles.pkgSelectBtn, styles.pkgSelectBtnPremium]}>
                        <Text style={styles.pkgSelectTextPremium}>Select Premium Form ➔</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* ── State B: Contract Creation Form screen ── */
                <View style={styles.formCard}>
                  <View style={styles.formCardHeader}>
                    <TouchableOpacity
                      style={styles.backToPackagesBtn}
                      onPress={() => fadeTransition(() => setSelectedPackage(null))}
                    >
                      <Text style={styles.backToPackagesText}>← Back to Packages</Text>
                    </TouchableOpacity>
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
                  
                  {/* Dynamic Pricing breakdown card */}
                  <View style={styles.pricingSummaryCard}>
                    <View style={styles.priceDetailRow}>
                      <Text style={styles.priceLabel}>Package Type:</Text>
                      <Text style={styles.priceVal}>{selectedPackage.name} Tier</Text>
                    </View>
                    <View style={styles.priceDetailRow}>
                      <Text style={styles.priceLabel}>Base Rate:</Text>
                      <Text style={styles.priceVal}>${selectedPackage.name === 'Premium' ? '199' : '299'}</Text>
                    </View>
                    {selectedPackage.name === 'Premium' && requiredWorkersCount > 1 && (
                      <View style={styles.priceDetailRow}>
                        <Text style={styles.priceLabel}>Additional Crew ({requiredWorkersCount - 1} slots):</Text>
                        <Text style={styles.priceVal}>+${(requiredWorkersCount - 1) * 25}</Text>
                      </View>
                    )}
                    <View style={styles.priceDivider} />
                    <View style={styles.priceDetailRow}>
                      <Text style={styles.priceLabelTotal}>Total Dispatched Price:</Text>
                      <Text style={styles.priceValTotal}>${calculatePrice()}</Text>
                    </View>
                  </View>

                  {/* ── Form Fields ── */}
                  <CustomInput
                    label="Client Name"
                    value={clientName}
                    onChangeText={setClientName}
                    placeholder="Grand Central Office Complex"
                    icon="🏢"
                    required
                  />

                  <CustomInput
                    label="Client Phone Number"
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
                      placeholder="Type place name (e.g. Times Square, Central Park)"
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
                  />

                  {address ? (
                    <View style={styles.selectedAddressContainer}>
                      <Text style={styles.selectedAddressLabel}>Selected Address: 📍</Text>
                      <Text style={styles.selectedAddressText}>{address}</Text>
                    </View>
                  ) : null}



                  {/* Date, Time, Duration */}
                  <View style={styles.rowFields}>
                    <View style={{ width: '31%' }}>
                      <CustomInput
                        label="Date"
                        value={date}
                        onChangeText={setDate}
                        placeholder="2026-05-30"
                      />
                    </View>
                    <View style={{ width: '31%' }}>
                      <CustomInput
                        label="Start Time"
                        value={startTime}
                        onChangeText={setStartTime}
                        placeholder="09:00"
                      />
                    </View>
                    <View style={{ width: '31%' }}>
                      <CustomInput
                        label="Duration (Min)"
                        value={durationMinutes}
                        onChangeText={setDurationMinutes}
                        placeholder="120"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <CustomInput
                    label="Special Notes/Instructions"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Special instructions or entry gates code..."
                    icon="📝"
                  />

                  {/* Crew size stepper (Premium only) */}
                  {selectedPackage.name === 'Premium' && (
                    <View style={styles.crewStepperBox}>
                      <Text style={styles.stepperLabel}>Premium Crew Size Required:</Text>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity
                          style={[styles.stepBtn, requiredWorkersCount <= 1 && styles.stepBtnDisabled]}
                          disabled={requiredWorkersCount <= 1}
                          onPress={() => setRequiredWorkersCount(c => Math.max(1, c - 1))}
                        >
                          <Text style={styles.stepBtnText}>−</Text>
                        </TouchableOpacity>
                        <Text style={styles.stepperValue}>{requiredWorkersCount}</Text>
                        <TouchableOpacity
                          style={[styles.stepBtn, requiredWorkersCount >= 50 && styles.stepBtnDisabled]}
                          disabled={requiredWorkersCount >= 50}
                          onPress={() => setRequiredWorkersCount(c => Math.min(50, c + 1))}
                        >
                          <Text style={styles.stepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Priority / Urgency (Premium only) */}
                  {selectedPackage.name === 'Premium' && (
                    <View style={styles.premiumPriorityContainer}>
                      <Text style={styles.stepperLabel}>Priority Level Dispatch:</Text>
                      <View style={styles.prioritySelectorRow}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={[styles.priorityCard, !isUrgent && styles.priorityCardActive]}
                          onPress={() => setIsUrgent(false)}
                        >
                          <Text style={styles.priorityCardIcon}>⏱️</Text>
                          <Text style={[styles.priorityCardLabel, !isUrgent && styles.priorityCardLabelActive]}>
                            Standard
                          </Text>
                          <Text style={styles.priorityCardDesc}>15 min deadline</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={[styles.priorityCard, isUrgent && styles.priorityCardActiveRed]}
                          onPress={() => setIsUrgent(true)}
                        >
                          <Text style={styles.priorityCardIcon}>🚨</Text>
                          <Text style={[styles.priorityCardLabel, isUrgent && styles.priorityCardLabelActiveRed]}>
                            Urgent
                          </Text>
                          <Text style={styles.priorityCardDesc}>5 min deadline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* ── Worker Search and Selection ── */}
                  <View style={styles.divider} />
                  <Text style={styles.workerSelectHeading}>
                    Search & Select Crew
                    {selectedPackage.name === 'Basic' ? ' (Max 5)' : ` (Min ${requiredWorkersCount})`}
                  </Text>
                  <TextInput
                    style={styles.searchBarInput}
                    placeholder="🔍 Search cleaners by ID (email) or Name"
                    value={workerQuery}
                    onChangeText={handleSearchWorkers}
                  />

                  {searching && <ActivityIndicator color={Colors.primary} style={{ margin: 12 }} />}

                  {searchResults.length > 0 && (
                    <ScrollView style={styles.workerResultsContainer} nestedScrollEnabled={true}>
                      {searchResults.map((worker) => {
                        const isSelected = selectedWorkers.some(w => w._id === worker._id);
                        
                        // Status styling helper
                        const getStatusDot = (st) => {
                          if (st === 'available') return '#10B981';
                          if (st === 'busy') return '#F59E0B';
                          if (st === 'offline') return '#94A3B8';
                          return '#3B82F6'; // on_job
                        };

                        return (
                          <View
                            key={worker._id}
                            style={[
                              styles.workerSearchCard,
                              isSelected && styles.workerSearchCardSelected
                            ]}
                          >
                            <View style={styles.workerCardInfo}>
                              <Text style={styles.workerCardName}>👤 {worker.name}</Text>
                              <Text style={styles.workerCardId}>ID: {worker.email}</Text>
                              <View style={styles.workerCardStatusRow}>
                                <View style={[styles.statusDot, { backgroundColor: getStatusDot(worker.status) }]} />
                                <Text style={styles.workerCardStatusText}>
                                  {worker.status.toUpperCase().replace('_', ' ')}
                                </Text>
                              </View>
                            </View>

                            <TouchableOpacity
                              style={[
                                styles.workerCardSelectBtn,
                                isSelected && styles.workerCardSelectBtnRemove,
                                worker.status !== 'available' && !isSelected && styles.workerCardSelectBtnDisabled
                              ]}
                              onPress={() => toggleSelectWorker(worker)}
                            >
                              <Text style={[
                                styles.workerCardSelectBtnText,
                                isSelected && styles.workerCardSelectBtnTextRemove
                              ]}>
                                {isSelected ? 'Remove' : worker.status !== 'available' ? 'Locked' : 'Select'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}

                  {selectedWorkers.length > 0 && (
                    <View style={styles.crewReviewBox}>
                      <Text style={styles.crewReviewTitle}>Dispatched Crew List ({selectedWorkers.length}):</Text>
                      {selectedWorkers.map((worker) => (
                        <View key={worker._id} style={styles.crewReviewItem}>
                          <Text style={styles.crewReviewName}>👤 {worker.name}</Text>
                          <TouchableOpacity onPress={() => toggleSelectWorker(worker)}>
                            <Text style={styles.crewReviewRemoveText}>Remove</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

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
                    onPress={() => fadeTransition(() => { setSelectedPackage(null); setActiveTab('newContract'); })}
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
        </Animated.View>

        <AppFooter />
      </ScrollView>

      {/* ── Floating bottom navigation bar ── */}
      <View style={styles.tabBarContainer}>
        <TouchableOpacity
          style={styles.tabBarItem}
          activeOpacity={0.8}
          onPress={() => {
            if (activeTab !== 'projects') {
              fadeTransition(() => setActiveTab('projects'));
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
            if (activeTab !== 'newContract') {
              fadeTransition(() => {
                setSelectedPackage(null); // Default to package selection screen
                setActiveTab('newContract');
              });
            }
          }}
        >
          <Text style={[styles.tabBarIcon, activeTab === 'newContract' && styles.tabBarIconActive]}>➕</Text>
          <Text style={[styles.tabBarLabel, activeTab === 'newContract' && styles.tabBarLabelActive]}>New Contract</Text>
          {activeTab === 'newContract' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBarItem}
          activeOpacity={0.8}
          onPress={() => {
            if (activeTab !== 'gps') {
              fadeTransition(() => {
                setMockProgress(0); // Restart route tracking
                setActiveTab('gps');
              });
            }
          }}
        >
          <Text style={[styles.tabBarIcon, activeTab === 'gps' && styles.tabBarIconActive]}>📡</Text>
          <Text style={[styles.tabBarLabel, activeTab === 'gps' && styles.tabBarLabelActive]}>Real-time GPS</Text>
          {activeTab === 'gps' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>
      </View>
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
  customPkgCardPremium: {
    borderColor: 'rgba(124, 58, 237, 0.3)',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.08
  },
  pkgBadgeBasic: {
    backgroundColor: '#EFF6FF',
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 10
  },
  pkgBadgePremium: {
    backgroundColor: '#F5F3FF',
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 10
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
    color: '#64748B',
    fontWeight: '600'
  },
  pkgSelectBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14
  },
  pkgSelectBtnPremium: {
    backgroundColor: '#EEF2FF',
    borderColor: '#7C3AED'
  },
  pkgSelectText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#475569'
  },
  pkgSelectTextPremium: {
    fontSize: 13,
    fontWeight: '900',
    color: '#7C3AED'
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
  }
});

export default ContractorDashboard;
