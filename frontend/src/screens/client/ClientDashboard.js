import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
  Modal,
  BackHandler
} from 'react-native';
import { Colors } from '../../theme/colors';
import { clientAPI, authAPI, getBaseUrl } from '../../api/client';
import io from 'socket.io-client';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import AppFooter from '../../components/AppFooter';
import TimeInput from '../../components/TimeInput';
import backScrollEmitter from '../../utils/backScrollEmitter';
import { State, Country, City } from 'country-state-city';
import * as Location from 'expo-location';
import EmbeddedGoogleMap from '../../components/EmbeddedGoogleMap';

// Pre-map countries for fast lookup
const countryMap = {};
Country.getAllCountries().forEach(c => {
  countryMap[c.isoCode] = { name: c.name, flag: c.flag };
});

// Pre-map states for fast lookup
const stateMap = {};
State.getAllStates().forEach(s => {
  stateMap[`${s.countryCode}-${s.isoCode}`] = s.name;
});

// Load raw cities list
const GLOBAL_CITIES = City.getAllCities();

const CATEGORIES = [
  { id: 'Electrical',   label: 'Electrical',   icon: '🔌' },
  { id: 'Plumbing',     label: 'Plumbing',     icon: '🔧' },
  { id: 'Cleaning',     label: 'Cleaning',     icon: '🧹' },
  { id: 'Carpentry',    label: 'Carpentry',    icon: '🪚' },
  { id: 'Gardening',    label: 'Gardening',    icon: '🌿' },
  { id: 'Construction', label: 'Construction', icon: '🏗️' },
  { id: 'HVAC',         label: 'HVAC',         icon: '❄️' },
  { id: 'Moving',       label: 'Moving',       icon: '🚚' },
  { id: 'Other',        label: 'Others',icon: '➕' }
];

const ClientDashboard = ({ user, onLogout }) => {
  const [activeTab, _setActiveTab] = useState('home'); // 'home', 'post', 'inbox'
  const [tabHistory, setTabHistory] = useState(['home']);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const setActiveTab = (tab) => {
    setTabHistory(prev => {
      if (prev[prev.length - 1] === tab) return prev;
      return [...prev, tab];
    });
    _setActiveTab(tab);
  };

  const goBack = () => {
    if (tabHistory.length > 1) {
      setTabHistory(prev => {
        const history = [...prev];
        history.pop();
        const previousTab = history[history.length - 1] || 'home';
        _setActiveTab(previousTab);
        return history;
      });
      return true;
    }
    return false;
  };

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => goBack()
    );
    return () => backHandler.remove();
  }, [tabHistory]);

  // Home states
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [associatedContractors, setAssociatedContractors] = useState([]);
  const [loadingAssociated, setLoadingAssociated] = useState(false);
  const [searchLocation, setSearchLocation] = useState('');
  const [profileStateSuggestions, setProfileStateSuggestions] = useState([]);

  // Rating states
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [selectedContractorToRate, setSelectedContractorToRate] = useState(null);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingReview, setRatingReview] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  // Post states
  const [postCategory, setPostCategory] = useState('Cleaning');
  const [postDesc, setPostDesc] = useState('');
  const [postLocation, setPostLocation] = useState('');
  const [postDate, setPostDate] = useState('');
  const [postTime, setPostTime] = useState('');
  const [postDuration, setPostDuration] = useState('');
  const [mapLat, setMapLat] = useState(40.7527);
  const [mapLng, setMapLng] = useState(-73.9772);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchLocationSuggestions, setSearchLocationSuggestions] = useState([]);

  // Inbox states
  const [requests, setRequests] = useState([]);
  const [expandedRequestId, setExpandedRequestId] = useState(null);

  // Profile states
  const [profileUser, setProfileUser] = useState(user);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phoneNumber || '');
  const [profileState, setProfileState] = useState(user?.state || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  useEffect(() => {
    setProfileUser(user);
  }, [user]);

  useEffect(() => {
    if (profileUser) {
      setProfileName(profileUser.name || '');
      setProfilePhone(profileUser.phoneNumber || '');
      setProfileState(profileUser.state || '');
    }
  }, [profileUser]);

  // --- Notifications States ---
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [socket, setSocket] = useState(null);

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
      console.warn('Failed to load client notifications:', e.message);
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
      setActiveTab('inbox');
    } catch (e) {
      console.warn('Failed to handle notification click:', e.message);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (!user || !user.id) return;

    const newSocket = io(getBaseUrl(), {
      transports: ['websocket']
    });
    setSocket(newSocket);

    newSocket.on(`client_notification:${user.id}`, ({ message }) => {
      Alert.alert(
        'Notification 🔔',
        message
      );
      fetchNotifications();
    });

    return () => newSocket.disconnect();
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'postJob') {
      (async () => {
        try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setMapLat(loc.coords.latitude);
          setMapLng(loc.coords.longitude);
          
          const response = await fetch(`https://photon.komoot.io/reverse?lon=${loc.coords.longitude}&lat=${loc.coords.latitude}&lang=en`);
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
            if (displayName) {
              setPostLocation(prev => prev || displayName);
            }
          }
        } catch (e) {
          console.log('Error getting location:', e);
        }
      })();
    }
  }, [activeTab]);

  // Calendar states
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startDay; i += 1) days.push(null);
    for (let i = 1; i <= daysInMonth; i += 1) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const loadData = async (isManualRefresh = false) => {
    try {
      setRefreshing(true);
      
      if (isManualRefresh === true) {
        // Clear form inputs and selections on refresh
        setSearchLocation('');
        setSelectedCategory(null);
        setPostDesc('');
        setPostLocation('');
        setPostDate('');
        setPostTime('');
        setPostDuration('');
        setContractors([]);
      }
      if (activeTab === 'home' && selectedCategory) {
        await fetchContractors(selectedCategory.id);
      } else if (activeTab === 'inbox') {
        const res = await clientAPI.getRequests();
        if (res.success) setRequests(res.requests);
      } else if (activeTab === 'contractors') {
        await loadAssociatedContractors();
      } else if (activeTab === 'profile') {
        const res = await authAPI.getProfile();
        if (res.success && res.user) setProfileUser(res.user);
      }
      setRefreshing(false);
    } catch (e) {
      setRefreshing(false);
      console.error('Error loading data:', e.message);
      // Don't show alert for 404 errors - might be backend not running
      if (e.response && e.response.status !== 404) {
        Alert.alert('Error', 'Failed to load data. Please check your connection.');
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

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
        state: profileState
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

  const renderContractorsTab = () => {
    return (
      <View style={{ paddingBottom: 30 }}>
        <Text style={styles.sectionTitle}>🤝 Associated Contractors</Text>
        <Text style={styles.sectionSubtitle}>Contractors you have worked with. Click a contractor to rate them.</Text>
        
        {loadingAssociated ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
        ) : associatedContractors.length === 0 ? (
          <View style={[styles.emptyStateContainer, { marginTop: 20 }]}>
            <Text style={styles.emptyStateIcon}>😕</Text>
            <Text style={styles.emptyStateTitle}>No Associated Contractors</Text>
            <Text style={styles.emptyStateSub}>You haven't worked with any contractors yet.</Text>
          </View>
        ) : (
          <View style={{ marginTop: 15 }}>
            {associatedContractors.map(c => (
              <TouchableOpacity
                key={c._id}
                style={[styles.jobCard, { flexDirection: 'row', alignItems: 'center' }]}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedContractorToRate(c);
                  setRatingValue(5);
                  setRatingReview('');
                  setRatingModalVisible(true);
                }}
              >
                <View style={[styles.avatarPlaceholder, { width: 50, height: 50, borderRadius: 25, marginRight: 15 }]}>
                  <Text style={{ fontSize: 24 }}>🏢</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.jobTitle, { fontSize: 16 }]}>{c.companyName || c.name}</Text>
                  <Text style={styles.jobDetailText}>📞 {c.phoneNumber}</Text>
                  <Text style={styles.jobDetailText}>⭐ {c.averageRating ? c.averageRating.toFixed(1) : 'No Ratings'}</Text>
                </View>
                <Text style={{ color: Colors.primary, fontWeight: 'bold' }}>Rate ➔</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const handleProfileStateSearch = (query) => {
    setProfileState(query);
    if (!query.trim()) {
      setProfileStateSuggestions([]);
      return;
    }

    const filtered = [];
    const lowerQuery = query.toLowerCase().trim();
    for (let i = 0; i < GLOBAL_CITIES.length; i++) {
      if (GLOBAL_CITIES[i].name.toLowerCase().includes(lowerQuery)) {
        filtered.push(GLOBAL_CITIES[i]);
        if (filtered.length >= 10) break;
      }
    }

    const mapped = filtered.map(c => {
      const country = countryMap[c.countryCode];
      const stateName = stateMap[`${c.countryCode}-${c.stateCode}`] || c.stateCode;
      return {
        display_name: `${c.name}, ${stateName}, ${country ? country.name : c.countryCode}`
      };
    });
    setProfileStateSuggestions(mapped);
  };

  const renderProfileTab = () => {
    return (
      <View style={{ paddingBottom: 30 }}>
        <Text style={styles.sectionTitle}>My Profile 👤</Text>
        <Text style={styles.sectionSubtitle}>Manage and update your client account details.</Text>
        
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

          <View style={{ zIndex: 5 }}>
            <CustomInput
              label="State / Region / Location"
              value={profileState}
              onChangeText={handleProfileStateSearch}
              placeholder="Search city or location..."
              icon="📍"
            />
            {profileStateSuggestions.length > 0 && (
              <View style={[styles.suggestionsBox, { top: -10, position: 'relative' }]}>
                {profileStateSuggestions.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionItem}
                    onPress={() => {
                      setProfileState(item.display_name);
                      setProfileStateSuggestions([]);
                    }}
                  >
                    <Text style={styles.suggestionText} numberOfLines={1}>
                      📍 {item.display_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

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


  const scrollRef = useRef(null);
  useEffect(() => {
    const listener = (markHandled) => {
      try {
        if (scrollRef.current && scrollRef.current.scrollTo) {
          scrollRef.current.scrollTo({ y: 0, animated: true });
          markHandled();
        }
      } catch (e) {}
    };
    const unsub = backScrollEmitter.subscribe(listener);
    return () => unsub();
  }, []);

  const loadAssociatedContractors = async () => {
    try {
      setLoadingAssociated(true);
      const res = await clientAPI.getAssociatedContractors();
      if (res.success) {
        setAssociatedContractors(res.contractors || []);
      }
    } catch (e) {
      console.warn('Failed to load associated contractors:', e.message);
    } finally {
      setLoadingAssociated(false);
    }
  };

  const handleRateContractor = async () => {
    if (!selectedContractorToRate) return;
    try {
      setSubmittingRating(true);
      const res = await clientAPI.rateContractor(selectedContractorToRate._id, ratingValue, ratingReview);
      if (res.success) {
        Alert.alert('Success 🎉', 'Rating submitted successfully');
        setRatingModalVisible(false);
        setRatingValue(5);
        setRatingReview('');
        loadAssociatedContractors(); // Refresh to get updated rating
      } else {
        Alert.alert('Error ⚠️', res.message || 'Failed to submit rating');
      }
    } catch (e) {
      Alert.alert('Error ⚠️', 'Failed to submit rating');
    } finally {
      setSubmittingRating(false);
    }
  };

  const fetchContractors = async (catId) => {
    setLoading(true);
    try {
      const res = await clientAPI.getContractors(catId, searchLocation);
      if (res.success) setContractors(res.contractors);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      Alert.alert('Error', 'Failed to fetch contractors');
    }
  };

  const handleSelectCategory = (cat) => {
    setSelectedCategory(cat);
    fetchContractors(cat.id);
  };

  const handlePlaceSearch = (query) => {
    setPostLocation(query);
    if (!query.trim()) {
      setSearchSuggestions([]);
      return;
    }

    const filtered = [];
    const lowerQuery = query.toLowerCase().trim();
    for (let i = 0; i < GLOBAL_CITIES.length; i++) {
      if (GLOBAL_CITIES[i].name.toLowerCase().includes(lowerQuery)) {
        filtered.push(GLOBAL_CITIES[i]);
        if (filtered.length >= 10) break;
      }
    }

    const mapped = filtered.map(c => {
      const country = countryMap[c.countryCode];
      const stateName = stateMap[`${c.countryCode}-${c.stateCode}`] || c.stateCode;
      return {
        display_name: `${c.name}, ${stateName}, ${country ? country.name : c.countryCode}`,
        lat: c.latitude,
        lng: c.longitude
      };
    });
    setSearchSuggestions(mapped);
  };

  const handleSearchLocationChange = (query) => {
    setSearchLocation(query);
    if (!query.trim()) {
      setSearchLocationSuggestions([]);
      return;
    }

    const filtered = [];
    const lowerQuery = query.toLowerCase().trim();
    for (let i = 0; i < GLOBAL_CITIES.length; i++) {
      if (GLOBAL_CITIES[i].name.toLowerCase().includes(lowerQuery)) {
        filtered.push(GLOBAL_CITIES[i]);
        if (filtered.length >= 10) break;
      }
    }

    const mapped = filtered.map(c => {
      const country = countryMap[c.countryCode];
      const stateName = stateMap[`${c.countryCode}-${c.stateCode}`] || c.stateCode;
      return {
        display_name: `${c.name}, ${stateName}, ${country ? country.name : c.countryCode}`
      };
    });
    setSearchLocationSuggestions(mapped);
  };

  const handlePostTimeBlur = () => {
    let cleanTime = postTime.trim();
    if (!cleanTime) return;

    cleanTime = cleanTime.replace(/[^0-9:]/g, '');
    if (!cleanTime.includes(':')) {
      if (cleanTime.length === 1 || cleanTime.length === 2) {
        let hr = parseInt(cleanTime);
        if (hr >= 0 && hr <= 23) {
          cleanTime = `${String(hr).padStart(2, '0')}:00`;
        }
      } else if (cleanTime.length === 3) {
        let hr = parseInt(cleanTime.slice(0, 1));
        let min = parseInt(cleanTime.slice(1));
        if (hr >= 0 && hr <= 9 && min >= 0 && min <= 59) {
          cleanTime = `0${hr}:${String(min).padStart(2, '0')}`;
        }
      } else if (cleanTime.length === 4) {
        let hr = parseInt(cleanTime.slice(0, 2));
        let min = parseInt(cleanTime.slice(2));
        if (hr >= 0 && hr <= 23 && min >= 0 && min <= 59) {
          cleanTime = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        }
      }
    } else {
      const parts = cleanTime.split(':');
      let hr = parseInt(parts[0]);
      let min = parseInt(parts[1] || '0');
      if (hr >= 0 && hr <= 23 && min >= 0 && min <= 59) {
        cleanTime = `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      }
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(cleanTime)) {
      Alert.alert(
        'Invalid Time Format',
        'Time must be in 24-hour HH:MM format (e.g., 09:00 or 17:30). Reverting to default (09:00).'
      );
      setPostTime('09:00');
    } else {
      setPostTime(cleanTime);
    }
  };

  const handlePostRequest = async () => {
    if (!postDesc.trim() || !postLocation.trim() || !postDate.trim() || !postTime.trim() || !postDuration.trim()) {
      Alert.alert('Required Fields', 'Please fill out all request details.');
      return;
    }

    const durationNum = parseInt(postDuration.trim(), 10);
    if (isNaN(durationNum) || durationNum <= 0) {
      Alert.alert('Invalid Duration', 'Please enter a valid duration in minutes.');
      return;
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(postTime)) {
      Alert.alert('Invalid Time', 'Start Time must be in 24-hour HH:MM format (e.g. 09:00 or 17:30).');
      return;
    }

    setLoading(true);
    try {
      const res = await clientAPI.createRequest({
        category: postCategory,
        description: postDesc.trim(),
        location: postLocation.trim(),
        date: postDate,
        time: postTime,
        duration: durationNum
      });
      setLoading(false);

      if (res.success) {
        Alert.alert(
          'Request Posted! 🚀',
          `Your request for ${postCategory} has been successfully dispatched to local contractors. Check your Inbox for incoming offer bids!`,
          [
            {
              text: 'Go to Inbox',
              onPress: () => {
                setPostDesc('');
                setPostLocation('');
                setPostDate('');
                setPostTime('');
                setPostDuration('');
                setActiveTab('inbox');
              }
            }
          ]
        );
      } else {
        Alert.alert('Post Failed', res.message || 'Verification error');
      }
    } catch (e) {
      setLoading(false);
      Alert.alert('Error', 'Server error posting request');
    }
  };

  const handleAcceptOffer = async (requestId, offerId) => {
    setLoading(true);
    try {
      const res = await clientAPI.acceptOffer(requestId, offerId);
      setLoading(false);
      if (res.success) {
        Alert.alert('Offer Accepted! 🧼', 'Roster assignment scheduled successfully. The contractor will dispatch the crew.');
        loadData();
      } else {
        Alert.alert('Failed to accept', res.message || 'Error occurred');
      }
    } catch (e) {
      setLoading(false);
      Alert.alert('Error', 'Server error accepting offer');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
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
            <Text style={styles.portalTitle}>Client Hub</Text>
            <Text style={styles.portalSubtitle}>{user.name || 'Partner Account'}</Text>
          </View>
        </View>
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
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={Colors.primary} />
        }
      >
        {/* TAB 1: HOME */}
        {activeTab === 'home' && (
          <View>
            <Text style={styles.welcomeTitle}>What service are you looking for?</Text>
            <Text style={styles.welcomeSubtitle}>Connect with trusted contractors and skilled crew members in your area.</Text>

            {/* Location Filter */}
            <View style={{ zIndex: 10, position: 'relative', width: '100%' }}>
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  value={searchLocation}
                  onChangeText={handleSearchLocationChange}
                  placeholder="Enter state or city (e.g. New York)"
                  placeholderTextColor="#94A3B8"
                />
                <TouchableOpacity
                  style={styles.searchBtn}
                  onPress={() => selectedCategory && fetchContractors(selectedCategory.id)}
                >
                  <Text style={styles.searchBtnText}>🔍 Find</Text>
                </TouchableOpacity>
              </View>
              {searchLocationSuggestions.length > 0 && (
                <View style={styles.suggestionsBoxAbsolute}>
                  {searchLocationSuggestions.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionItem}
                      onPress={() => {
                        setSearchLocation(item.display_name);
                        setSearchLocationSuggestions([]);
                        if (selectedCategory) {
                          fetchContractors(selectedCategory.id, item.display_name);
                        }
                      }}
                    >
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        📍 {item.display_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Category Grid */}
            <View style={styles.grid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.catCard,
                    selectedCategory?.id === cat.id && styles.catCardActive
                  ]}
                  onPress={() => handleSelectCategory(cat)}
                >
                  <Text style={styles.catIcon}>{cat.icon}</Text>
                  <Text style={[styles.catLabel, selectedCategory?.id === cat.id && styles.catLabelActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedCategory && (
              <View style={styles.resultsSection}>
                <Text style={styles.sectionTitle}>
                  Available Contractors for {selectedCategory.label} ({contractors.length})
                </Text>
                
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />
                ) : contractors.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No matching contractors found in {searchLocation || 'your region'}.</Text>
                  </View>
                ) : (
                  contractors.map((c) => (
                    <View key={c._id} style={styles.contractorCard}>
                      <View style={styles.contractorHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.contractorCompany}>{c.companyName || 'Freelance Contractor'}</Text>
                          <Text style={styles.contractorName}>👤 Contact: {c.name}</Text>
                          <Text style={styles.contractorLocations}>📍 Locations: {c.locations.join(', ') || 'N/A'}</Text>
                          <Text style={styles.contractorLocations}>⭐ {c.averageRating ? c.averageRating.toFixed(1) : 'No Ratings'}</Text>
                        </View>
                        <View style={styles.priceBadge}>
                          <Text style={styles.priceBadgeText}>
                            {c.packageId?.name === 'Basic' ? '$299 / fixed' : '$199+ / dynamic'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tagRow}>
                        {c.tags.map((t, idx) => (
                          <View key={idx} style={styles.tagBadge}>
                            <Text style={styles.tagBadgeText}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {/* TAB 2: POST */}
        {activeTab === 'post' && (
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Post a Job Requirement</Text>
            <Text style={styles.sectionSubtitle}>Get custom bids from contractors based on your schedule</Text>

            {/* Category Select */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Service Category</Text>
              <View style={styles.selectorRow}>
                {CATEGORIES.filter(c => c.id !== 'Other').map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.selectorItem,
                      postCategory === cat.id && styles.selectorItemActive
                    ]}
                    onPress={() => setPostCategory(cat.id)}
                  >
                    <Text style={styles.selectorIcon}>{cat.icon}</Text>
                    <Text style={[styles.selectorLabel, postCategory === cat.id && styles.selectorLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <CustomInput
              label="Job Description"
              value={postDesc}
              onChangeText={setPostDesc}
              placeholder="Explain cleaning/plumbing requirements, rooms count, etc."
              icon="📝"
              multiline
              numberOfLines={4}
              required
            />

            {/* Search Address (Easiest Method) */}
            <View style={styles.searchPlaceContainer}>
              <Text style={styles.fieldGroupLabel}>Search Address/Place (Easiest Method) 🔍</Text>
              <TextInput
                style={styles.searchPlaceInput}
                placeholder="Enter city, state, country, or full address"
                value={postLocation}
                onChangeText={handlePlaceSearch}
                placeholderTextColor="#94A3B8"
              />
              {searchSuggestions.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {searchSuggestions.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionItem}
                      onPress={() => {
                        setPostLocation(item.display_name);
                        if (item.lat && item.lng) {
                          setMapLat(parseFloat(item.lat));
                          setMapLng(parseFloat(item.lng));
                        }
                        setSearchSuggestions([]);
                      }}
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
                latitude={mapLat} 
                longitude={mapLng} 
                height={200}
                onLocationSelect={async (lat, lng) => {
                  setMapLat(lat);
                  setMapLng(lng);
                  try {
                    const response = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=en`);
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
                      if (displayName) {
                        setPostLocation(displayName);
                      }
                    }
                  } catch (e) {
                    console.warn("Reverse geocode error:", e);
                  }
                }}
              />

            {postLocation ? (
              <View style={styles.selectedAddressContainer}>
                <Text style={styles.selectedAddressLabel}>Selected Address: 📍</Text>
                <Text style={styles.selectedAddressText}>{postLocation}</Text>
              </View>
            ) : null}
            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <CustomInput
                  label="Target Date"
                  value={postDate}
                  placeholder="Select your preferred service date"
                  icon="📅"
                  required
                  onPress={() => {
                    setCurrentCalendarMonth(postDate ? new Date(postDate) : new Date());
                    setShowCalendarModal(true);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TimeInput
                  label="Start Time"
                  value={postTime}
                  onChangeText={setPostTime}
                  placeholder="Example: 9:00 AM or 2:30 PM"
                  icon="🕒"
                  required
                />
              </View>
            </View>

            <View style={styles.rowFields}>
              <View style={{ flex: 1 }}>
                <CustomInput
                  label="Duration (Min)"
                  value={postDuration}
                  onChangeText={setPostDuration}
                  placeholder="e.g. 120"
                  icon="⏱️"
                  keyboardType="numeric"
                  required
                />
              </View>
              <View style={{ flex: 1 }} />
            </View>

            <CustomButton
              title={loading ? "Posting..." : "🚀 Post Requirement"}
              type="primary"
              onPress={handlePostRequest}
              disabled={loading}
              style={{ marginTop: 10 }}
            />
          </View>
        )}

        {/* TAB 3: INBOX */}
        {activeTab === 'inbox' && (
          <View>
            <Text style={styles.sectionTitle}>Your Posted Requirements</Text>
            {requests.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>📂</Text>
                <Text style={styles.emptyText}>No requirements posted yet.</Text>
              </View>
            ) : (
              requests.map((r) => (
                <View key={r._id} style={styles.requestCard}>
                  <TouchableOpacity
                    style={styles.requestHeader}
                    onPress={() => setExpandedRequestId(expandedRequestId === r._id ? null : r._id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestCategory}>
                        {r.category === 'Electrical' ? '🔌' : r.category === 'Plumbing' ? '🔧' : r.category === 'Cleaning' ? '🧹' : '🛠️'} {r.category} Request
                      </Text>
                      <Text style={styles.requestDate}>📅 {new Date(r.date).toLocaleDateString()} at {r.time}{r.duration ? ` (${r.duration} mins)` : ''}</Text>
                      <Text style={styles.requestLoc}>📍 Location: {r.location}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      r.status === 'active' && styles.statusActive,
                      r.status === 'completed' && styles.statusCompleted,
                      r.status === 'pending' && styles.statusPending
                    ]}>
                      <Text style={styles.statusText}>{r.status.toUpperCase()}</Text>
                    </View>
                  </TouchableOpacity>

                  {expandedRequestId === r._id && (
                    <View style={styles.requestDetails}>
                      <Text style={styles.requestDesc}>Description: {r.description}</Text>
                      <View style={styles.divider} />
                      <Text style={styles.offersTitle}>Contractor Bids ({r.offers.length})</Text>

                      {r.offers.length === 0 ? (
                        <Text style={styles.noOffersText}>No contractor offers submitted yet.</Text>
                      ) : (
                        [...r.offers].sort((a, b) => a.price - b.price).map((offer) => (
                          <View key={offer._id} style={styles.offerRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.offerCompany}>{offer.contractor?.companyName || 'Freelance Contractor'}</Text>
                              <Text style={styles.offerName}>Contact: {offer.contractor?.name}</Text>
                              <Text style={styles.offerPrice}>Bid Price: <Text style={styles.priceHighlight}>${offer.price}</Text></Text>
                            </View>
                            {r.status === 'pending' ? (
                              <TouchableOpacity
                                style={styles.acceptBtn}
                                  onPress={() => handleAcceptOffer(r._id, offer._id)}
                              >
                                <Text style={styles.acceptBtnText}>Accept</Text>
                              </TouchableOpacity>
                            ) : (
                              <View style={[
                                styles.offerStatusBadge,
                                offer.status === 'accepted' && styles.assignAccepted,
                                offer.status === 'rejected' && styles.assignRejected
                              ]}>
                                <Text style={styles.offerStatusText}>{offer.status.toUpperCase()}</Text>
                              </View>
                            )}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 4: CONTRACTORS */}
        {activeTab === 'contractors' && renderContractorsTab()}

        {/* TAB 5: PROFILE */}
        {activeTab === 'profile' && renderProfileTab()}
      <AppFooter />
        </ScrollView>

      {/* Tabs Footer Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'home' && styles.tabItemActive]}
          onPress={() => setActiveTab('home')}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          pointerEvents="auto"
        >
          <Text style={[styles.tabIcon, activeTab === 'home' && styles.tabIconActive]}>🏠</Text>
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabLabelActive]}>Browse</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'post' && styles.tabItemActive]}
          onPress={() => setActiveTab('post')}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          pointerEvents="auto"
        >
          <Text style={[styles.tabIcon, activeTab === 'post' && styles.tabIconActive]}>📝</Text>
          <Text style={[styles.tabLabel, activeTab === 'post' && styles.tabLabelActive]}>Post Job</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'inbox' && styles.tabItemActive]}
          onPress={() => setActiveTab('inbox')}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          pointerEvents="auto"
        >
          <Text style={[styles.tabIcon, activeTab === 'inbox' && styles.tabIconActive]}>📥</Text>
          <Text style={[styles.tabLabel, activeTab === 'inbox' && styles.tabLabelActive]}>Inbox</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'contractors' && styles.tabItemActive]}
          onPress={() => setActiveTab('contractors')}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          pointerEvents="auto"
        >
          <Text style={[styles.tabIcon, activeTab === 'contractors' && styles.tabIconActive]}>??</Text>
          <Text style={[styles.tabLabel, activeTab === 'contractors' && styles.tabLabelActive]}>Contractors</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'profile' && styles.tabItemActive]}
          onPress={() => setActiveTab('profile')}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          pointerEvents="auto"
        >
          <Text style={[styles.tabIcon, activeTab === 'profile' && styles.tabIconActive]}>👤</Text>
          <Text style={[styles.tabLabel, activeTab === 'profile' && styles.tabLabelActive]}>Profile</Text>
        </TouchableOpacity>
      </View>

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
                
                const isSelected = postDate === dateStr;
                const isToday = new Date().toDateString() === day.toDateString();
                const isPast = day.getTime() < new Date().setHours(0, 0, 0, 0);

                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={styles.dayCell}
                    disabled={isPast}
                    onPress={() => {
                      setPostDate(dateStr);
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

      {/* Custom Notifications Modal */}
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
              style={{ maxHeight: 350, marginVertical: 10, width: '100%' }}
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
            <AppFooter />
        </ScrollView>

            <TouchableOpacity 
              style={styles.calendarCloseBtn}
              onPress={() => setShowNotificationsModal(false)}
            >
              <Text style={styles.calendarCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      {/* Rate Contractor Modal */}
      <Modal
        visible={ratingModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.calendarContainer, { padding: 20 }]}>
            <Text style={[styles.sectionTitle, { marginBottom: 5 }]}>Rate Contractor</Text>
            <Text style={{ color: '#64748B', marginBottom: 20, fontSize: 13 }}>
              {selectedContractorToRate?.companyName || selectedContractorToRate?.name}
            </Text>

            <Text style={{ fontWeight: 'bold', color: Colors.secondary, marginBottom: 10 }}>Select Rating (1-5)</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRatingValue(star)}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: ratingValue >= star ? Colors.primary : '#F1F5F9',
                    width: 45,
                    alignItems: 'center'
                  }}
                >
                  <Text style={{ fontSize: 18, color: ratingValue >= star ? '#FFF' : '#94A3B8' }}>?</Text>
                </TouchableOpacity>
              ))}
            </View>

            <CustomInput
              label="Review (Optional)"
              value={ratingReview}
              onChangeText={setRatingReview}
              placeholder="Write a brief review..."
              icon="??"
            />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <TouchableOpacity 
                  style={[styles.calendarCloseBtn, { backgroundColor: '#F1F5F9' }]}
                  onPress={() => setRatingModalVisible(false)}
                >
                  <Text style={[styles.calendarCloseBtnText, { color: '#64748B' }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity 
                  style={[styles.calendarCloseBtn, { backgroundColor: Colors.primary }]}
                  onPress={handleRateContractor}
                  disabled={submittingRating}
                >
                  <Text style={styles.calendarCloseBtnText}>{submittingRating ? 'Submitting...' : 'Submit'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: Colors.secondary,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center'
  },
  logoImageMini: {
    width: 40,
    height: 40
  },
  titleCol: {
    justifyContent: 'center'
  },
  portalTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  },
  portalSubtitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600'
  },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#334155'
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700'
  },
  scrollContainer: {
    paddingBottom: 120,
    flexGrow: 1,
    padding: 20,
    paddingBottom: 100
  },

  welcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6
  },
  welcomeSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '550',
    marginBottom: 20,
    lineHeight: 18
  },

  // Location Search
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20
  },
  searchInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 13,
    color: '#0F172A'
  },
  searchBtn: {
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center'
  },
  searchBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13
  },

  // Category Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24
  },
  catCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  catCardActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.03)'
  },
  catIcon: {
    fontSize: 22,
    marginBottom: 6
  },
  catLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center'
  },
  catLabelActive: {
    color: Colors.primary
  },

  resultsSection: {
    marginTop: 10
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6
  },
  sectionSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 16
  },

  // Contractor Card
  contractorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  contractorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  contractorCompany: {
    fontSize: 14,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 4
  },
  contractorName: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 2
  },
  contractorLocations: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '550'
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
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12
  },
  tagBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 6
  },
  tagBadgeText: {
    color: '#475569',
    fontSize: 9.5,
    fontWeight: '700'
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center'
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 10
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center'
  },

  // Form Card
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 2
  },
  fieldGroup: {
    marginBottom: 16
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  selectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#F8FAFC'
  },
  selectorItemActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.04)'
  },
  selectorIcon: {
    fontSize: 13
  },
  selectorLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B'
  },
  selectorLabelActive: {
    color: Colors.primary
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12
  },

  // Request & Offer Cards
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    overflow: 'hidden'
  },
  requestHeader: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF'
  },
  requestCategory: {
    fontSize: 14,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 4
  },
  requestDate: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 2
  },
  requestLoc: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '550'
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  statusPending: {
    backgroundColor: '#FEF3C7'
  },
  statusActive: {
    backgroundColor: '#D1FAE5'
  },
  statusCompleted: {
    backgroundColor: '#DBEAFE'
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1E293B'
  },
  requestDetails: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    padding: 16
  },
  requestDesc: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '550',
    lineHeight: 18,
    marginBottom: 10
  },
  offersTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    marginTop: 4
  },
  noOffersText: {
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '600',
    fontStyle: 'italic'
  },
  offerRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  offerCompany: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2
  },
  offerName: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '550'
  },
  offerPrice: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
    marginTop: 2
  },
  priceHighlight: {
    fontWeight: '850',
    color: '#10B981'
  },
  acceptBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800'
  },
  offerStatusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  assignAccepted: {
    backgroundColor: '#D1FAE5'
  },
  assignRejected: {
    backgroundColor: '#FEE2E2'
  },
  offerStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1E293B'
  },

  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12
  },

  // Tabs Bar
  tabBar: {
    position: 'absolute',
    bottom: 25,
    left: 16,
    right: 16,
    height: 64,
    backgroundColor: Colors.secondary,
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
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    paddingTop: 4
  },
  tabItemActive: {},
  tabIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 2
  },
  tabIconActive: {
    color: '#FFFFFF'
  },
  tabLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '900'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  calendarContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center'
  },
  calendarNavBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A'
  },
  calendarMonthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A'
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B'
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 44,
    marginBottom: 8
  },
  dayCell: {
    width: '14.28%',
    height: 44,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  dayInnerCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center'
  },
  dayInnerCircleSelected: {
    backgroundColor: Colors.primary
  },
  dayInnerCircleToday: {
    borderWidth: 1.5,
    borderColor: Colors.secondary
  },
  dayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A'
  },
  dayTextSelected: {
    color: '#fff'
  },
  dayTextToday: {
    color: Colors.secondary,
    fontWeight: '800'
  },
  calendarCloseBtn: {
    marginTop: 16,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center'
  },
  calendarCloseBtnText: {
    color: '#0F172A',
    fontWeight: '800'
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
  selectedAddressContainer: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    borderWidth: 1.2,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    marginTop: 10,
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
  suggestionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginTop: 8,
    overflow: 'hidden'
  },
  suggestionsBoxAbsolute: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    zIndex: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
  }
});

export default ClientDashboard;





