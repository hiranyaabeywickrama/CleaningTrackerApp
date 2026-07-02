import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
  Animated,
  Image,
  RefreshControl
} from 'react-native';
import { Colors } from '../theme/colors';
import { authAPI, CURRENT_BASE_URL } from '../api/client';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import AppFooter from '../components/AppFooter';
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

// Build the global list of states
const GLOBAL_STATE_OPTIONS = State.getAllStates().map(s => {
  const country = countryMap[s.countryCode];
  return {
    name: s.name,
    code: `${s.countryCode}-${s.isoCode}`,
    countryName: country ? country.name : s.countryCode,
    countryFlag: country ? country.flag : '',
    displayName: `${s.name}, ${country ? country.name : s.countryCode}`
  };
});

// Filter US states for the default empty-search list
const DEFAULT_US_STATES = GLOBAL_STATE_OPTIONS.filter(st => st.countryCode === 'US');

// Load raw cities list
const GLOBAL_CITIES = City.getAllCities();

const POPULAR_GLOBAL_CITIES = [
  { name: 'New York City', countryCode: 'US', stateCode: 'NY' },
  { name: 'Los Angeles', countryCode: 'US', stateCode: 'CA' },
  { name: 'Chicago', countryCode: 'US', stateCode: 'IL' },
  { name: 'Houston', countryCode: 'US', stateCode: 'TX' },
  { name: 'London', countryCode: 'GB', stateCode: 'ENG' },
  { name: 'Paris', countryCode: 'FR', stateCode: 'IDF' },
  { name: 'Tokyo', countryCode: 'JP', stateCode: '13' },
  { name: 'Sydney', countryCode: 'AU', stateCode: 'NSW' },
  { name: 'Toronto', countryCode: 'CA', stateCode: 'ON' },
  { name: 'Berlin', countryCode: 'DE', stateCode: 'BE' },
  { name: 'Singapore', countryCode: 'SG', stateCode: '01' }
];

const DEFAULT_CITY_SUGGESTIONS = POPULAR_GLOBAL_CITIES.map(c => {
  const country = countryMap[c.countryCode];
  const stateName = stateMap[`${c.countryCode}-${c.stateCode}`] || c.stateCode;
  return {
    name: c.name,
    displayName: `${c.name}, ${stateName}, ${country ? country.name : c.countryCode}`,
    flag: country ? country.flag : ''
  };
});


// ── Role options for registration (no Admin public registration) ────────────────
const ROLES = [
  { id: 'worker',     label: 'Crew Member',       icon: '🧹',  desc: 'Clock in shifts & execute jobs' },
  { id: 'contractor', label: 'Contractor',        icon: '🏢',  desc: 'Manage sites & dispatch crews' },
  { id: 'client',     label: 'Client Partner',    icon: '👤',  desc: 'Request services & select bids' }
];

// ── Category options for multi-select dropdown ───────────────────────────
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


const RegisterScreen = ({ navigation, route }) => {
  const [selectedRole, setSelectedRole] = useState(route?.params?.role || 'worker');

  useEffect(() => {
    if (route?.params?.role) {
      setSelectedRole(route.params.role);
    }
  }, [route?.params?.role]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+94');
  const [companyName, setCompanyName] = useState('');
  
  // Custom states for dropdowns and autocomplete suggestions
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [locationInput, setLocationInput] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [stateSearchInput, setStateSearchInput] = useState('');

  // Dropdown / suggestion display helpers
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showStateDropdown, setShowStateDropdown] = useState(false);
  const [filteredLocations, setFilteredLocations] = useState([]);
  const [filteredStates, setFilteredStates] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  // Search query tracking refs to prevent race conditions during async fetches
  const latestStateQuery = useRef('');
  const latestLocationQuery = useRef('');

  const [isAutoDetectingLocation, setIsAutoDetectingLocation] = useState(false);

  useEffect(() => {
    if (selectedRole === 'worker') {
      setIsAutoDetectingLocation(true);
      fetch('https://ipapi.co/json/')
        .then(res => res.json())
        .then(data => {
          if (data.city && data.country_name) {
            const locStr = `${data.city}, ${data.country_name}`;
            setStateSearchInput(locStr);
            setSelectedState(locStr);
          }
        })
        .catch(err => console.log('Location detection failed', err))
        .finally(() => setIsAutoDetectingLocation(false));
    }
  }, [selectedRole]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState({});

  const handleRefresh = () => {
    setRefreshing(true);
    setName('');
    setEmail('');
    setPhoneNumber('');
    setCountryCode('+94');
    setCompanyName('');
    setSelectedTags([]);
    setSelectedLocations([]);
    setLocationInput('');
    setSelectedState('');
    setStateSearchInput('');
    setFilteredStates([]);
    setFilteredLocations([]);
    setShowCategoryDropdown(false);
    setShowStateDropdown(false);
    setShowLocationSuggestions(false);
    latestStateQuery.current = '';
    latestLocationQuery.current = '';
    setErrors({});
    setRefreshing(false);
  };

  // Fade animation for role switching transitions
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

  // Validate form details
  const validateForm = () => {
    let valid = true;
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Full Name is required';
      valid = false;
    }

    if (!email) {
      newErrors.email = 'Email address is required';
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
      valid = false;
    }

    const fullPhoneNumber = `${countryCode}${phoneNumber.trim().replace(/^0/, '')}`;
    const cleanPhone = fullPhoneNumber.replace(/[\s\-().+]/g, '');
    if (!phoneNumber) {
      newErrors.phoneNumber = 'Phone Number is required';
      valid = false;
    } else if (cleanPhone.length < 9 || cleanPhone.length > 15) {
      newErrors.phoneNumber = 'Enter a valid phone number (9–15 digits)';
      valid = false;
    }

    if (selectedRole === 'contractor' && !companyName.trim()) {
      newErrors.companyName = 'Company Name is required for contractors';
      valid = false;
    }

    if ((selectedRole === 'contractor' || selectedRole === 'worker') && selectedTags.length === 0) {
      newErrors.tags = selectedRole === 'contractor' ? 'Please select at least one service category' : 'Please select at least one capability';
      valid = false;
    }

    if (selectedRole === 'contractor' && selectedLocations.length === 0) {
      newErrors.locations = 'Please add at least one base location';
      valid = false;
    }

    if ((selectedRole === 'worker' || selectedRole === 'client') && !selectedState) {
      newErrors.state = 'State is required';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  // ── Submit Details & Request OTP ──────────────────────────────────────────
  const handleRequestOtp = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const trimmedEmail = email.toLowerCase().trim();
      const fullPhoneNumber = `${countryCode}${phoneNumber.trim().replace(/^0/, '')}`;
      const res = await authAPI.requestOtp(
        trimmedEmail,
        selectedRole,
        name.trim(),
        fullPhoneNumber,
        selectedRole === 'contractor' ? companyName.trim() : '',
        (selectedRole === 'contractor' || selectedRole === 'worker') ? selectedTags.join(', ') : '',
        selectedRole === 'contractor' ? selectedLocations.join(', ') : '',
        (selectedRole === 'worker' || selectedRole === 'client') ? selectedState : ''
      );
      setLoading(false);

      if (res.success) {
        const routeParams = {
          registerFlow: true,
          email: trimmedEmail,
          role: selectedRole,
          name: name.trim(),
          phoneNumber: fullPhoneNumber,
          companyName: selectedRole === 'contractor' ? companyName.trim() : '',
          tags: (selectedRole === 'contractor' || selectedRole === 'worker') ? selectedTags.join(', ') : '',
          locations: selectedRole === 'contractor' ? selectedLocations.join(', ') : '',
          state: (selectedRole === 'worker' || selectedRole === 'client') ? selectedState : ''
        };

        if (Platform.OS === 'web') {
          alert(`Verification Dispatched ✉️\n\n${res.message || `We sent a 6-digit verification code to ${trimmedEmail}.`}`);
          navigation.navigate('Login', routeParams);
        } else {
          Alert.alert(
            'Verification Dispatched ✉️',
            res.message || `We sent a 6-digit verification code to ${trimmedEmail}.`,
            [
              {
                text: 'Enter Verification Code',
                onPress: () => {
                  navigation.navigate('Login', routeParams);
                }
              }
            ]
          );
        }
      } else {
        Alert.alert('Request Failed', res.message || 'Something went wrong');
      }
    } catch (err) {
      setLoading(false);
      const msg = err.response?.data?.message;
      let title = 'Error';
      if (err.response?.status === 503) {
        title = msg && /resend test mode/i.test(msg) ? 'Cannot Send to This Email' : 'Email Not Configured';
      }
      Alert.alert(title, msg || `Could not reach the server at ${CURRENT_BASE_URL}. Is the backend running?`);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Decorative blobs */}
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
      >
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          {/* Direct Balanced Logo Image */}
          <Image
            source={require('../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.cardTitle}>
            {selectedRole === 'contractor' ? 'Create Contractor Account' :
             selectedRole === 'worker' ? 'Create Crew Member Account' :
             selectedRole === 'client' ? 'Create Client Partner Account' : 'Create Account'}
          </Text>
          <Text style={styles.cardSubtitle}>
            {selectedRole === 'contractor' ? 'Register your contracting business to manage crews and bids' :
             selectedRole === 'worker' ? 'Join the crew network, track shifts, and log hours' :
             selectedRole === 'client' ? 'Post service requirements and receive contractor bids' :
             'Get started with a free account'}
          </Text>

          <Animated.View style={[styles.formArea, { opacity: fadeAnim }]}>
            {/* Role Card Selectors - Hide if role came directly from Welcome Screen */}
            {!route?.params?.role && (
              <>
                <View style={styles.roleLabelContainer}>
                  <Text style={styles.fieldLabel}>
                    Registration Role <Text style={styles.required}>*</Text>
                  </Text>
                </View>
                <View style={styles.roleRow}>
                  {ROLES.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.roleCard, selectedRole === r.id && styles.roleCardActive]}
                      onPress={() => fadeTransition(() => { setSelectedRole(r.id); setErrors({}); })}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.roleIcon}>{r.icon}</Text>
                      <Text style={[styles.roleLabel, selectedRole === r.id && styles.roleLabelActive]}>
                        {r.label}
                      </Text>
                      <Text style={[styles.roleDesc, selectedRole === r.id && styles.roleDescActive]}>
                        {r.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.divider} />
              </>
            )}

            {/* General warning details */}
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                ⚡ **Passwordless OTP Security**: No password needed. We will dispatch a 6-digit code to secure your login shifts.
              </Text>
            </View>

            {/* Full Name */}
            <CustomInput
              label="Full Name"
              value={name}
              onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: '' })); }}
              placeholder="John Doe"
              icon="👤"
              error={errors.name}
              required
            />

            {/* Email Address */}
            <CustomInput
              label="Email Address"
              value={email}
              onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: '' })); }}
              placeholder="your.email@example.com"
              icon="✉️"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              required
            />

            {/* Phone Number */}
            <CustomInput
              label="Phone Number"
              value={phoneNumber}
              onChangeText={(v) => { setPhoneNumber(v); setErrors((e) => ({ ...e, phoneNumber: '' })); }}
              placeholder="77 123 4567"
              isPhoneInput={true}
              countryCode={countryCode}
              onCountryCodeChange={setCountryCode}
              keyboardType="phone-pad"
              error={errors.phoneNumber}
              required
            />

            {/* Company Name (only if Contractor) */}
            {selectedRole === 'contractor' && (
              <CustomInput
                label="Company Name"
                value={companyName}
                onChangeText={(v) => { setCompanyName(v); setErrors((e) => ({ ...e, companyName: '' })); }}
                placeholder="Cleaners Ltd."
                icon="🏢"
                error={errors.companyName}
                required
              />
            )}

            {/* Tags / Capabilities / Service Categories */}
            {(selectedRole === 'contractor' || selectedRole === 'worker') && (
              <View style={styles.dropdownContainer}>
                <Text style={styles.fieldLabel}>
                  {selectedRole === 'contractor' ? "Service Categories" : "Your Capabilities"} <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.dropdownSelectBox, errors.tags && styles.dropdownErrorBorder]}
                  onPress={() => {
                    setShowCategoryDropdown(!showCategoryDropdown);
                    setShowStateDropdown(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dropdownSelectIcon}>🛠️</Text>
                  <View style={styles.dropdownSelectedContainer}>
                    {selectedTags.length === 0 ? (
                      <Text style={styles.dropdownPlaceholder}>
                        {selectedRole === 'contractor' ? "Select Service Categories" : "Select Your Capabilities"}
                      </Text>
                    ) : (
                      <View style={styles.tagsPillContainer}>
                        {selectedTags.map((tag) => (
                          <View key={tag} style={styles.tagPill}>
                            <Text style={styles.tagPillText}>
                              {CATEGORY_OPTIONS.find(c => c.id === tag)?.icon || '🛠️'} {tag}
                            </Text>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                setSelectedTags(selectedTags.filter(t => t !== tag));
                              }}
                              style={styles.tagPillClose}
                            >
                              <Text style={styles.tagPillCloseText}>×</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <Text style={styles.dropdownArrowIcon}>{showCategoryDropdown ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {showCategoryDropdown && (
                  <View style={styles.dropdownMenu}>
                    {CATEGORY_OPTIONS.map((option) => {
                      const isSelected = selectedTags.includes(option.id);
                      return (
                        <TouchableOpacity
                          key={option.id}
                          style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                          onPress={() => {
                            let updated;
                            if (isSelected) {
                              updated = selectedTags.filter(t => t !== option.id);
                            } else {
                              updated = [...selectedTags, option.id];
                            }
                            setSelectedTags(updated);
                            setErrors(e => ({ ...e, tags: '' }));
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.dropdownMenuItemText}>
                            {option.icon}  {option.label}
                          </Text>
                          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                            {isSelected && <Text style={styles.checkboxCheckmark}>✓</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {errors.tags ? <Text style={styles.errorText}>{errors.tags}</Text> : null}
              </View>
            )}
 
            {/* Base Locations / Cities Autocomplete with dynamic + Add Location button */}
            {selectedRole === 'contractor' && (
              <View style={styles.autocompleteContainer}>
                <Text style={styles.fieldLabel}>
                  Base Locations / Cities <Text style={styles.required}>*</Text>
                </Text>
 
                {selectedLocations.length > 0 && (
                  <View style={styles.selectedLocationsWrapper}>
                    {selectedLocations.map((loc, idx) => (
                      <View key={idx} style={styles.locationBadge}>
                        <Text style={styles.locationBadgeText}>📍 {loc}</Text>
                        <TouchableOpacity
                          onPress={() => setSelectedLocations(selectedLocations.filter((_, i) => i !== idx))}
                          style={styles.locationBadgeClose}
                        >
                          <Text style={styles.locationBadgeCloseText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
 
                <View style={{ position: 'relative', zIndex: 20 }}>
                  <View style={styles.locationInputRow}>
                    <View style={[styles.locationInputWrapper, errors.locations && styles.dropdownErrorBorder]}>
                      <Text style={styles.prefixIcon}>
                        {DEFAULT_CITY_SUGGESTIONS.find(c => c.displayName === locationInput)?.flag || 
                         filteredLocations.find(c => c.displayName === locationInput)?.flag || 
                         '📍'}
                      </Text>
                      <TextInput
                        style={styles.locationInput}
                        value={locationInput}
                        placeholder="Type a city (e.g. New York, Brooklyn)"
                        placeholderTextColor="#94A3B8"
                        onChangeText={(val) => {
                          setLocationInput(val);
                          setErrors((e) => ({ ...e, locations: '' }));
                          
                          if (val.trim().length > 0) {
                            setShowLocationSuggestions(true);
                            const query = val.toLowerCase().trim();
                            const filtered = GLOBAL_CITIES.filter(
                              c => c.name.toLowerCase().includes(query)
                            ).slice(0, 100);
                            const mapped = filtered.map(c => {
                              const country = countryMap[c.countryCode];
                              const stateName = stateMap[`${c.countryCode}-${c.stateCode}`] || c.stateCode;
                              return {
                                name: c.name,
                                displayName: `${c.name}, ${stateName}, ${country ? country.name : c.countryCode}`,
                                flag: country ? country.flag : ''
                              };
                            });
                            setFilteredLocations(mapped);
                          } else {
                            setFilteredLocations([]);
                            setShowLocationSuggestions(true);
                          }
                        }}
                        onFocus={() => {
                          setShowLocationSuggestions(true);
                          setShowCategoryDropdown(false);
                          setShowStateDropdown(false);
                        }}
                        onBlur={() => {
                          setLocationInput('');
                          setTimeout(() => {
                            setShowLocationSuggestions(false);
                          }, 200);
                        }}
                        autoComplete="off"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          setShowLocationSuggestions(!showLocationSuggestions);
                          setShowCategoryDropdown(false);
                          setShowStateDropdown(false);
                        }}
                        style={{ padding: 4 }}
                      >
                        <Text style={styles.dropdownArrowIcon}>{showLocationSuggestions ? '▲' : '▼'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
 
                  {showLocationSuggestions && (
                    <View style={styles.suggestionsDropdown}>
                      <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                        {locationInput.trim().length === 0 ? (
                          // Render default major cities list when input is empty
                          DEFAULT_CITY_SUGGESTIONS.filter(c => !selectedLocations.includes(c.displayName)).map((c) => (
                            <TouchableOpacity
                              key={c.displayName}
                              style={styles.suggestionItem}
                              onPress={() => {
                                if (!selectedLocations.includes(c.displayName)) {
                                  setSelectedLocations([...selectedLocations, c.displayName]);
                                }
                                setLocationInput('');
                                setShowLocationSuggestions(false);
                              }}
                            >
                              <Text style={styles.suggestionText}>{c.flag}  {c.displayName}</Text>
                            </TouchableOpacity>
                          ))
                        ) : (
                          // Render filtered global locations matching search
                          filteredLocations.filter(c => !selectedLocations.includes(c.displayName)).map((c) => (
                            <TouchableOpacity
                              key={c.displayName}
                              style={styles.suggestionItem}
                              onPress={() => {
                                if (!selectedLocations.includes(c.displayName)) {
                                  setSelectedLocations([...selectedLocations, c.displayName]);
                                }
                                setLocationInput('');
                                setShowLocationSuggestions(false);
                              }}
                            >
                              <Text style={styles.suggestionText}>{c.flag}  {c.displayName}</Text>
                            </TouchableOpacity>
                          ))
                        )}
                        {locationInput.trim().length > 0 && filteredLocations.length === 0 && (
                          <View style={{ padding: 12, alignItems: 'center' }}>
                            <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>
                              No matching locations found.
                            </Text>
                          </View>
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
                {errors.locations ? <Text style={styles.errorText}>{errors.locations}</Text> : null}
              </View>
            )}

            {/* State (only Worker or Client) */}
            {(selectedRole === 'worker' || selectedRole === 'client') && (
              <View style={styles.dropdownContainer}>
                <Text style={styles.fieldLabel}>
                  State you live in <Text style={styles.required}>*</Text>
                </Text>
                
                <View style={[styles.locationInputWrapper, errors.state && styles.dropdownErrorBorder]}>
                  <Text style={styles.prefixIcon}>
                    {GLOBAL_STATE_OPTIONS.find(st => st.displayName === selectedState)?.countryFlag || '🌍'}
                  </Text>
                  <TextInput
                    style={[styles.locationInput, selectedRole === 'worker' && { backgroundColor: '#F8FAFC', color: '#64748B', fontWeight: '800' }]}
                    value={isAutoDetectingLocation ? 'Auto-detecting your location...' : stateSearchInput}
                    editable={selectedRole !== 'worker'}
                    placeholder={selectedRole === 'worker' ? "Auto-detecting..." : "Select or type your state"}
                    placeholderTextColor="#94A3B8"
                    onChangeText={(val) => {
                      if (selectedRole === 'worker') return;
                      setStateSearchInput(val);
                      setSelectedState(''); // clear selected until they select a valid option
                      setErrors((e) => ({ ...e, state: '' }));
                      
                      if (val.trim().length > 0) {
                        setShowStateDropdown(true);
                        const query = val.toLowerCase().trim();
                        const filtered = GLOBAL_STATE_OPTIONS.filter(
                          st => st.name.toLowerCase().includes(query) || st.countryName.toLowerCase().includes(query)
                        );
                        setFilteredStates(filtered.slice(0, 100));
                      } else {
                        setFilteredStates([]);
                        setShowStateDropdown(true);
                      }
                    }}
                    onFocus={() => {
                      if (selectedRole === 'worker') return;
                      setShowStateDropdown(true);
                      setShowCategoryDropdown(false);
                      setShowLocationSuggestions(false);
                    }}
                    onBlur={() => {
                      if (!selectedState) {
                        setStateSearchInput('');
                      } else {
                        setStateSearchInput(selectedState);
                      }
                      setTimeout(() => {
                        setShowStateDropdown(false);
                      }, 200);
                    }}
                    autoComplete="off"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setShowStateDropdown(!showStateDropdown);
                      setShowCategoryDropdown(false);
                      setShowLocationSuggestions(false);
                    }}
                    style={{ padding: 4 }}
                  >
                    <Text style={styles.dropdownArrowIcon}>{showStateDropdown ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                </View>

                {showStateDropdown && (
                  <View style={styles.dropdownMenuScrollable}>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                      {stateSearchInput.trim().length === 0 ? (
                        // Render default 50 US States when input is empty
                        DEFAULT_US_STATES.map((st) => {
                          const isSelected = selectedState === st.displayName;
                          return (
                            <TouchableOpacity
                              key={st.code}
                              style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                              onPress={() => {
                                setSelectedState(st.displayName);
                                setStateSearchInput(st.displayName);
                                setErrors((e) => ({ ...e, state: '' }));
                                setShowStateDropdown(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.dropdownMenuItemText}>{st.countryFlag}  {st.displayName}</Text>
                              {isSelected && <Text style={styles.selectedCheckmark}>✓</Text>}
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        // Render filtered global states matching search
                        filteredStates.map((st) => {
                          const isSelected = selectedState === st.displayName;
                          return (
                            <TouchableOpacity
                              key={st.code}
                              style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                              onPress={() => {
                                setSelectedState(st.displayName);
                                setStateSearchInput(st.displayName);
                                setErrors((e) => ({ ...e, state: '' }));
                                setShowStateDropdown(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.dropdownMenuItemText}>{st.countryFlag}  {st.displayName}</Text>
                              {isSelected && <Text style={styles.selectedCheckmark}>✓</Text>}
                            </TouchableOpacity>
                          );
                        })
                      )}
                      {stateSearchInput.trim().length > 0 && filteredStates.length === 0 && (
                        <View style={{ padding: 12, alignItems: 'center' }}>
                          <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '600' }}>No states match your search</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                )}
                {errors.state ? <Text style={styles.errorText}>{errors.state}</Text> : null}
              </View>
            )}

            {/* Request OTP Button */}
            <CustomButton
              title={loading ? "⏳ Setting Up Portal..." : "✉️ Request Verification OTP"}
              type="primary" // Green SaaS
              onPress={handleRequestOtp}
              disabled={loading}
              style={styles.actionBtn}
            />
          </Animated.View>

          {/* Footer Navigation */}
          {(!showLocationSuggestions && !showStateDropdown) && (
            <View style={styles.footerRow}>
              <Text style={styles.footerLabel}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login', { role: selectedRole })}>
                <Text style={styles.loginLink}>Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {(!showLocationSuggestions && !showStateDropdown) && (
          <AppFooter navigation={navigation} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC' // Clean SaaS Slate Background
  },
  blobTopRight: {
    position: 'absolute', top: -80, right: -80,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(37, 99, 235, 0.03)', zIndex: 0 // Blue soft glow
  },
  blobBottomLeft: {
    position: 'absolute', bottom: 100, left: -100,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(16, 185, 129, 0.03)', zIndex: 0 // Green soft glow
  },
  scrollContainer: {
    paddingBottom: 120,
    flexGrow: 1, justifyContent: 'center', padding: 20, zIndex: 1
  },
  backLink: {
    paddingVertical: 10, marginBottom: 12, alignSelf: 'flex-start'
  },
  backLinkText: {
    color: Colors.secondary, fontWeight: '750', fontSize: 13
  },

  // ── Card ────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 4,
    alignItems: 'center',
    marginBottom: 16
  },
  logoImage: {
    width: 220,
    height: 90,
    marginBottom: 16
  },
  cardTitle: {
    fontSize: 22, fontWeight: '800', color: '#0F172A',
    marginBottom: 4, letterSpacing: 0.2
  },
  cardSubtitle: {
    fontSize: 12, color: '#64748B', fontWeight: '550',
    marginBottom: 20, textAlign: 'center'
  },
  formArea: { width: '100%' },

  // ── Role selector ────────────────────────────────────────────────────────────
  roleLabelContainer: { width: '100%', marginBottom: 6 },
  roleRow: {
    flexDirection: 'row', gap: 10, width: '100%', marginBottom: 6
  },
  roleCard: {
    flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 10, borderWidth: 1.2, borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC'
  },
  roleCardActive: {
    borderColor: Colors.primary, // Active SaaS Green
    backgroundColor: 'rgba(16, 185, 129, 0.02)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1
  },
  roleIcon: { fontSize: 20, marginBottom: 4 },
  roleLabel: {
    fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 2
  },
  roleLabelActive: { color: Colors.primary },
  roleDesc: { fontSize: 9, color: '#94A3B8', fontWeight: '600', textAlign: 'center', lineHeight: 12 },
  roleDescActive: { color: '#059669' },

  divider: {
    height: 1, width: '100%',
    backgroundColor: '#F1F5F9', marginVertical: 16
  },

  // ── Warnings / Banners ──────────────────────────────────────────────────────
  warningBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 10, padding: 10, marginBottom: 16, width: '100%'
  },
  warningText: { fontSize: 11, color: '#059669', fontWeight: '600', lineHeight: 15 },

  // ── Action button ─────────────────────────────────────────────────────────────
  actionBtn: {
    height: 46,
    marginTop: 10,
    marginBottom: 14
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footerRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 6
  },
  footerLabel: { color: '#64748B', fontSize: 12.5, fontWeight: '600' },
  loginLink: { color: Colors.primary, fontSize: 12.5, fontWeight: '800' },

  // ── Custom Dropdowns & Autocomplete Styles ──────────────────────────────────
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
  dropdownMenuScrollable: {
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
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center'
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary
  },
  checkboxCheckmark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900'
  },
  selectedCheckmark: {
    color: Colors.primary,
    fontWeight: '900',
    fontSize: 13
  },
  tagsPillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  tagPillText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700'
  },
  tagPillClose: {
    marginLeft: 6,
    paddingHorizontal: 2
  },
  tagPillCloseText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '800'
  },
  dropdownSelectedContainer: {
    flex: 1
  },

  // Autocomplete Location Styling
  autocompleteContainer: {
    width: '100%',
    marginBottom: 14,
    position: 'relative'
  },
  selectedLocationsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.15)'
  },
  locationBadgeText: {
    fontSize: 12.5,
    color: '#1D4ED8',
    fontWeight: '700'
  },
  locationBadgeClose: {
    marginLeft: 8,
    paddingHorizontal: 2
  },
  locationBadgeCloseText: {
    fontSize: 14,
    color: '#60A5FA',
    fontWeight: '800'
  },
  locationInputRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%'
  },
  locationInputWrapper: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: 'rgba(30, 58, 138, 0.25)',
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  locationInput: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    height: '100%',
    padding: 0
  },
  prefixIcon: {
    fontSize: 16,
    marginRight: 10,
    color: '#64748B'
  },
  addLocationBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  addLocationBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700'
  },
  suggestionsDropdown: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 20
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2
  },
  suggestionText: {
    fontSize: 13.5,
    color: '#334155',
    fontWeight: '600'
  },
  errorText: {
    color: Colors.danger,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600'
  }
});

export default RegisterScreen;


