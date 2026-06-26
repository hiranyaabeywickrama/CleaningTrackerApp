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
  Modal
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
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'post', 'inbox'
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Home states
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [searchLocation, setSearchLocation] = useState('');

  // Post states
  const [postCategory, setPostCategory] = useState('Cleaning');
  const [postDesc, setPostDesc] = useState('');
  const [postLocation, setPostLocation] = useState('');
  const [postDate, setPostDate] = useState('');
  const [postTime, setPostTime] = useState('');
  const [postDuration, setPostDuration] = useState('120');
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

  const loadData = async () => {
    try {
      setRefreshing(true);
      if (activeTab === 'home' && selectedCategory) {
        await fetchContractors(selectedCategory.id);
      } else if (activeTab === 'inbox') {
        const res = await clientAPI.getRequests();
        if (res.success) setRequests(res.requests);
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

          <CustomInput
            label="State / Region"
            value={profileState}
            onChangeText={setProfileState}
            placeholder="New York"
            icon="📍"
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
        display_name: `${c.name}, ${stateName}, ${country ? country.name : c.countryCode}`
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
                setPostDuration('120');
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
          <RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={Colors.primary} />
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

            <View style={{ zIndex: 10, position: 'relative' }}>
              <CustomInput
                label="Location / Address"
                value={postLocation}
                onChangeText={handlePlaceSearch}
                placeholder="Enter city, state, country, or full address"
                icon="📍"
                required
              />
              {searchSuggestions.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {searchSuggestions.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionItem}
                      onPress={() => {
                        setPostLocation(item.display_name);
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

        {/* TAB 4: PROFILE */}
        {activeTab === 'profile' && renderProfileTab()}
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
