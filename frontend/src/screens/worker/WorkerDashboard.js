import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Alert, TouchableOpacity, Image, ActivityIndicator, Modal, BackHandler } from 'react-native';
import { Colors } from '../../theme/colors';
import { jobsAPI, attendanceAPI, workerAPI, getBaseUrl, authAPI } from '../../api/client';
import AppFooter from '../../components/AppFooter';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import io from 'socket.io-client';
import backScrollEmitter from '../../utils/backScrollEmitter';

const WorkerDashboard = ({ user, onLogout, navigation }) => {
  const [activeTab, _setActiveTab] = useState('home'); // 'home', 'freelance', 'profile'
  const [tabHistory, setTabHistory] = useState(['home']);

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

  const [paysheetPeriod, setPaysheetPeriod] = useState('month'); // default to 'month'
  const [showPaysheetPeriodDropdown, setShowPaysheetPeriodDropdown] = useState(false);
  
  const filterJobsByPeriod = (jobsList, period) => {
    const now = new Date();
    let limitDate = new Date(0);
    if (period === 'week') {
      limitDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      limitDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === '3months') {
      limitDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    }
    return jobsList.filter(j => new Date(j.startTime) >= limitDate);
  };

  const [jobs, setJobs] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [attendanceRecords, setAttendanceRecords] = useState([]); // All shift records
  const [assignments, setAssignments] = useState([]); // Contract requests
  
  const [refreshing, setRefreshing] = useState(false);
  const [loadingShift, setLoadingShift] = useState(false);
  const [ticker, setTicker] = useState(0); // Periodic state to trigger timer re-renders

  // Freelance & Contractors states
  const [freelanceJobs, setFreelanceJobs] = useState([]);
  const [loadingFreelance, setLoadingFreelance] = useState(false);
  const [contractors, setContractors] = useState([]);
  const [loadingContractors, setLoadingContractors] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState(null);
  const [contractorProjects, setContractorProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Profile states
  const [profileUser, setProfileUser] = useState(user);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phoneNumber || '');
  const [profileHourlyRate, setProfileHourlyRate] = useState(user?.hourlyRate !== undefined ? String(user.hourlyRate) : '');
  const [profileState, setProfileState] = useState(user?.state || '');
  const [profileStateSuggestions, setProfileStateSuggestions] = useState([]);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // --- Notifications States ---
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  useEffect(() => {
    setProfileUser(user);
  }, [user]);

  useEffect(() => {
    if (profileUser) {
      setProfileName(profileUser.name || '');
      setProfilePhone(profileUser.phoneNumber || '');
      setProfileHourlyRate(profileUser.hourlyRate !== undefined ? String(profileUser.hourlyRate) : '');
    }
  }, [profileUser]);

  const loadData = async () => {
    try {
      // 1. Fetch assigned jobs
      const jobsRes = await jobsAPI.getWorkerJobs();
      if (jobsRes.success) {
        setJobs(jobsRes.jobs);
      }

      // 2. Fetch contract assignments (requests)
      const assignRes = await workerAPI.getAssignments();
      if (assignRes.success) {
        // Only keep pending assignments for the requests section
        setAssignments(assignRes.assignments.filter(a => a.response === 'pending'));
      }

      // 3. Fetch attendance clock-in state & full history
      const attRes = await attendanceAPI.getReport();
      if (attRes.success) {
        setAttendanceRecords(attRes.records || []);
        const latestRecord = attRes.records[0];
        if (latestRecord && latestRecord.status === 'active') {
          setAttendance(latestRecord);
        } else {
          setAttendance(null);
        }
      } else {
        setAttendance(null);
      }

      // 4. Fetch associated contractors
      const contractorsRes = await workerAPI.getContractors();
      if (contractorsRes.success) {
        setContractors(contractorsRes.contractors);
      }

      await fetchNotifications();
    } catch (error) {
      console.error('Error loading worker dashboard:', error.message);
    }
  };

  useEffect(() => {
    loadData();

    // 1-second interval to force timer redraws and dynamic expiration check
    const timerInterval = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 1000);

    // Socket.io real-time connection for dispatch alerts
    const socket = io(getBaseUrl(), {
      auth: { role: 'worker', userId: user.id }
    });

    socket.on(`worker_assignment:${user.id}`, (data) => {
      const mins = data.isUrgent ? 5 : 15;
      Alert.alert(
        'New Cleaning Offer! 🧼',
        `Contract request from ${data.clientName} at ${data.address}. Respond within ${mins} minutes.`,
        [
          { text: 'View Requests', onPress: () => {
            setActiveTab('home');
            loadData();
          }}
        ]
      );
      loadData();
    });

    socket.on(`worker_notification:${user.id}`, (data) => {
      Alert.alert(
        data.title || 'Notification 🔔',
        data.message
      );
      loadData();
    });

    return () => {
      clearInterval(timerInterval);
      socket.disconnect();
    };
  }, []);

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
      console.warn('Failed to load worker notifications:', e.message);
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
      if (notif.type === 'contract_request') {
        const assignmentId = notif.data?.assignmentId;
        if (assignmentId) {
          const assign = assignments.find(a => a._id === assignmentId);
          if (assign && assign.contractId && assign.contractId.contractorId) {
            const contractorId = assign.contractId.contractorId._id || assign.contractId.contractorId;
            const contractorObj = contractors.find(c => c._id.toString() === contractorId.toString());
            if (contractorObj) {
              setSelectedContractor(contractorObj);
            }
          }
        }
        setActiveTab('home');
      } else if (notif.type === 'freelance_contract') {
        navigateToTab('freelance');
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
    if (!profileHourlyRate.trim()) {
      Alert.alert('Error ⚠️', 'Hourly rate is required');
      return;
    }
    const parsedRate = parseFloat(profileHourlyRate);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      Alert.alert('Error ⚠️', 'Please enter a valid positive hourly rate');
      return;
    }
    
    try {
      setUpdatingProfile(true);
      const res = await authAPI.updateProfile({
        name: profileName,
        phoneNumber: profilePhone,
        hourlyRate: parsedRate,
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
        <Text style={styles.sectionSubtitle}>Manage and update your crew member details.</Text>
        
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
            label="Hourly Rate ($/hr)"
            value={profileHourlyRate}
            onChangeText={setProfileHourlyRate}
            placeholder="25.00"
            icon="💵"
            keyboardType="numeric"
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

          {profileUser?.workerIdNumber ? (
            <CustomInput
              label="Worker ID (Read-only)"
              value={profileUser.workerIdNumber}
              editable={false}
              icon="🆔"
            />
          ) : null}

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

  const handleRefresh = async () => {
    setRefreshing(true);
    
    // Clear selections and filters on manual refresh
    setSelectedJob(null);
    setSelectedCompletedJob(null);
    setSelectedEarning(null);
    
    await loadData();
    if (activeTab === 'freelance') {
      await fetchFreelanceJobs();
    } else if (activeTab === 'home') {
      if (selectedContractor) {
        await fetchContractorProjects(selectedContractor._id);
      } else {
        await fetchContractors();
      }
    } else if (activeTab === 'profile') {
      const res = await authAPI.getProfile();
      if (res.success && res.user) setProfileUser(res.user);
    }
    setRefreshing(false);
  };

  const handleClockInOut = async () => {
    const runningJob = jobs.find(j => j.status === 'started');
    if (runningJob) {
      Alert.alert('Cannot Clock Out', 'Please end your active cleaning job first before closing your shift.');
      return;
    }

    setLoadingShift(true);
    try {
      if (attendance) {
        const res = await attendanceAPI.clockOut();
        if (res.success) {
          Alert.alert('Shift Ended', `You clocked out successfully! Worked ${res.attendance.totalHours} hrs.`);
          setAttendance(null);
        }
      } else {
        const res = await attendanceAPI.clockIn();
        if (res.success) {
          Alert.alert('Shift Started', 'You clocked in successfully! Ready for jobs.');
          setAttendance(res.attendance);
        }
      }
      loadData();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Shift action failed');
    } finally {
      setLoadingShift(false);
    }
  };

  const handleRespondAssignment = async (assignId, response) => {
    try {
      const res = await workerAPI.respondToAssignment(assignId, response);
      if (res.success) {
        Alert.alert(
          response === 'accepted' ? 'Contract Accepted! 🎉' : 'Contract Rejected ❌',
          res.message
        );
        loadData(); // Reload both jobs and requests
      } else {
        Alert.alert('Error', res.message || 'Action failed');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Server error occurred');
    }
  };

  const fetchFreelanceJobs = async () => {
    setLoadingFreelance(true);
    try {
      const res = await workerAPI.getFreelanceJobs();
      if (res.success) {
        setFreelanceJobs(res.freelanceJobs);
      }
    } catch (e) {
      console.error('Error fetching freelance jobs:', e);
      Alert.alert('Error', 'Failed to fetch freelance jobs');
    } finally {
      setLoadingFreelance(false);
    }
  };

  const handleApplyFreelance = async (jobId) => {
    try {
      const res = await workerAPI.applyFreelanceJob(jobId);
      if (res.success) {
        Alert.alert('Applied! 🎉', 'You have successfully applied for this freelance job opening.');
        fetchFreelanceJobs();
      } else {
        Alert.alert('Application Failed', res.message || 'Error applying');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Server error applying');
    }
  };

  const fetchContractors = async () => {
    setLoadingContractors(true);
    try {
      const res = await workerAPI.getContractors();
      if (res.success) {
        setContractors(res.contractors);
      }
    } catch (e) {
      console.error('Error fetching associated contractors:', e);
      Alert.alert('Error', 'Failed to fetch associated contractors');
    } finally {
      setLoadingContractors(false);
    }
  };

  const fetchContractorProjects = async (contractorId) => {
    setLoadingProjects(true);
    try {
      const res = await workerAPI.getContractorProjects(contractorId);
      if (res.success) {
        setContractorProjects(res.jobs);
      }
    } catch (e) {
      console.error('Error fetching contractor projects:', e);
      Alert.alert('Error', 'Failed to fetch contractor projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'freelance') {
      fetchFreelanceJobs();
    } else if (activeTab === 'home') {
      fetchContractors();
      setSelectedContractor(null);
    }
  }, [activeTab]);

  // Helper to compute remaining time for timer
  const getRemainingTimeText = (deadline) => {
    const remainingMs = new Date(deadline) - new Date();
    if (remainingMs <= 0) return 'Expired';
    const minutes = Math.floor(remainingMs / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'completed':
        return { label: 'Completed', color: '#10B981', bgColor: '#D1FAE5' };
      case 'started':
        return { label: 'In Progress', color: '#3B82F6', bgColor: '#DBEAFE' };
      case 'pending':
      default:
        return { label: 'Pending', color: '#64748B', bgColor: '#F1F5F9' };
    }
  };

  const formatJobTimeRange = (startTime, expectedHours = 2) => {
    if (!startTime) return '9:00 AM - 11:00 AM';
    
    const start = new Date(startTime);
    const end = new Date(start.getTime() + expectedHours * 3600 * 1000);
    
    const formatTime = (date) => {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  const pendingCount = assignments.length;

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
            <Text style={styles.portalTitle}>CrewLynk Station</Text>
            <Text style={styles.portalSubtitle}>Crew Roster: {user.name}</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Profile Banner */}
        <View style={styles.profileBanner}>
          <View style={styles.profileDetails}>
            <Text style={styles.welcomeGreeting}>Hello, {user.name.split(' ')[0]}! 👋</Text>
            <Text style={styles.profileRole}>Role: Professional Crew</Text>
            <Text style={styles.profileMeta}>Registered Email: {user.email}</Text>
            <Text style={styles.profileMeta}>Crew ID: {user.workerIdNumber || user._id || 'No ID'}</Text>
          </View>
          <View style={styles.bannerIconContainer}>
            <Text style={styles.bannerIcon}>✨</Text>
          </View>
        </View>

        {activeTab === 'home' && (
          <View>
            {selectedContractor ? (
              <View style={styles.scheduleCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>🏢 {selectedContractor.companyName || selectedContractor.name}</Text>
                    <Text style={styles.sectionSubtitle}>👤 Contact: {selectedContractor.name}</Text>
                    <Text style={styles.sectionSubtitle}>✉️ {selectedContractor.email}  |  📞 {selectedContractor.phoneNumber}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => {
                      setSelectedContractor(null);
                    }}
                  >
                    <Text style={styles.backBtnText}>← Back</Text>
                  </TouchableOpacity>
                </View>

                {/* 1. Projects requests to approve */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={[styles.sectionTitle, { fontSize: 14, marginBottom: 8 }]}>📥 Project Requests to Approve ({
                    assignments.filter(a => a.response === 'pending' && a.contractId && a.contractId.contractorId && (a.contractId.contractorId._id || a.contractId.contractorId).toString() === selectedContractor._id.toString()).length
                  })</Text>
                  {(() => {
                    const pendingRequests = assignments.filter(a => a.response === 'pending' && a.contractId && a.contractId.contractorId && (a.contractId.contractorId._id || a.contractId.contractorId).toString() === selectedContractor._id.toString());
                    if (pendingRequests.length === 0) {
                      return <Text style={{ color: '#64748B', fontSize: 12, paddingLeft: 8 }}>No pending requests from this contractor.</Text>;
                    }
                    return pendingRequests.map(assign => {
                      const contract = assign.contractId;
                      const remaining = getRemainingTimeText(assign.responseDeadline);
                      const isExpired = remaining === 'Expired';
                      if (isExpired) return null;
                      return (
                        <View key={assign._id} style={[styles.requestItem, { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 12, borderRadius: 12, marginBottom: 8 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <Text style={{ fontWeight: '800', color: Colors.secondary, fontSize: 13 }}>
                              {contract?.contractorId?.companyName || contract?.contractorId?.name || contract?.clientName || 'Private Customer'}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '700' }}>🕒 {remaining}</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#475569' }}>📍 {contract?.location?.address}</Text>
                          <Text style={{ fontSize: 12, color: '#475569' }}>📅 {contract?.schedule?.date ? new Date(contract.schedule.date).toLocaleDateString() : ''} at {contract?.schedule?.startTime} ({contract?.schedule?.durationMinutes} mins)</Text>
                          {contract?.notes ? (
                            <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic', marginTop: 4 }}>Notes: {contract.notes}</Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                            <TouchableOpacity
                              style={{ backgroundColor: '#10B981', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, flex: 1, alignItems: 'center' }}
                              onPress={() => handleRespondAssignment(assign._id, 'accepted')}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Accept ✓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ backgroundColor: '#EF4444', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, flex: 1, alignItems: 'center' }}
                              onPress={() => handleRespondAssignment(assign._id, 'rejected')}
                            >
                              <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Reject ✕</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    });
                  })()}
                </View>

                <View style={styles.divider} />

                {/* 2. Ongoing projects */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={[styles.sectionTitle, { fontSize: 14, marginBottom: 8 }]}>⏰ Ongoing Projects ({
                    jobs.filter(j => j.contractor && (j.contractor._id || j.contractor).toString() === selectedContractor._id.toString() && j.status !== 'completed').length
                  })</Text>
                  {(() => {
                    const ongoingJobs = jobs.filter(j => j.contractor && (j.contractor._id || j.contractor).toString() === selectedContractor._id.toString() && j.status !== 'completed');
                    if (ongoingJobs.length === 0) {
                      return <Text style={{ color: '#64748B', fontSize: 12, paddingLeft: 8 }}>No ongoing projects today.</Text>;
                    }
                    return ongoingJobs.map(job => {
                      const status = getStatusConfig(job.status);
                      return (
                        <View key={job._id} style={styles.jobItemRow}>
                          <View style={styles.jobItemHeader}>
                            <View style={styles.addressCol}>
                              <Text style={{ fontWeight: '800', color: Colors.secondary, fontSize: 13, marginBottom: 2 }} numberOfLines={1}>
                                {job.contractor?.companyName || job.contractor?.name || job.clientName || 'Private Customer'}
                              </Text>
                              <Text style={styles.addressText} numberOfLines={1}>📍 {job.address}</Text>
                              <Text style={styles.timeRangeText}>
                                📅 {new Date(job.startTime).toLocaleDateString()}  ⏰ {formatJobTimeRange(job.startTime, job.expectedHours)}
                              </Text>
                            </View>
                            <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                              <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                            </View>
                          </View>
                          {job.status === 'pending' && (() => {
                            const allowed = Date.now() >= (new Date(job.startTime).getTime() - 30 * 60 * 1000);
                            return (
                              <TouchableOpacity
                                style={[styles.startBtn, !allowed && { backgroundColor: '#94A3B8', shadowColor: '#94A3B8' }]}
                                activeOpacity={0.8}
                                onPress={() => {
                                  if (!attendance) {
                                    Alert.alert('Clock In Required', 'Please Clock In to start your cleaning shift.');
                                    return;
                                  }
                                  if (!allowed) {
                                    const jobTimeStr = new Date(job.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    const jobDateStr = new Date(job.startTime).toLocaleDateString();
                                    Alert.alert(
                                      'Too Early 🕒',
                                      `This job is scheduled to start at ${jobTimeStr} on ${jobDateStr}. You can only start it up to 30 minutes prior to the scheduled start time.`
                                    );
                                    return;
                                  }
                                  navigation.navigate('ActiveJob', { job });
                                }}
                              >
                                <Text style={styles.startBtnText}>{allowed ? 'Start Job' : '🔒 Too Early'}</Text>
                              </TouchableOpacity>
                            );
                          })()}
                          {job.status === 'started' && (
                            <TouchableOpacity
                              style={styles.completeBtn}
                              activeOpacity={0.85}
                              onPress={() => navigation.navigate('ActiveJob', { job })}
                            >
                              <Text style={styles.completeBtnText}>Complete Job</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    });
                  })()}
                </View>

                <View style={styles.divider} />

                {/* 3. Projects covered & Automated Paysheet */}
                <View style={{ zIndex: 10, marginTop: 15 }}>
                  <Text style={[styles.sectionTitle, { fontSize: 18, fontWeight: '800', marginBottom: 6, color: Colors.primary }]}>📊 Covered Projects & Automated Paysheet</Text>
                  <Text style={styles.automatedLabel}>⚠️ Payouts are computed automatically based on verified clock-in durations and GPS logs.</Text>
                  
                  {/* Period Dropdown */}
                  <View style={{ marginBottom: 14, position: 'relative', zIndex: 20 }}>
                    <TouchableOpacity
                      style={styles.periodSelectBox}
                      onPress={() => setShowPaysheetPeriodDropdown(!showPaysheetPeriodDropdown)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.periodSelectText}>
                        Period: {paysheetPeriod === 'week' ? 'Week' : paysheetPeriod === 'month' ? 'Month' : '3 Months'}
                      </Text>
                      <Text style={styles.dropdownArrowIcon}>{showPaysheetPeriodDropdown ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    {showPaysheetPeriodDropdown && (
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
                              setPaysheetPeriod(option.id);
                              setShowPaysheetPeriodDropdown(false);
                            }}
                          >
                            <Text style={styles.periodDropdownItemText}>{option.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {loadingProjects ? (
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

                      {(() => {
                        const completedJobs = contractorProjects.filter(j => j.status === 'completed');
                        const filteredCompletedJobs = filterJobsByPeriod(completedJobs, paysheetPeriod);
                        const rate = parseFloat(profileHourlyRate || user.hourlyRate || '25');

                        if (filteredCompletedJobs.length === 0) {
                          return <Text style={styles.emptyTableText}>No completed projects covered in this period.</Text>;
                        }

                        const totalPayout = filteredCompletedJobs.reduce((sum, j) => {
                          const hours = j.totalHoursWorked || 0;
                          return sum + parseFloat((hours * rate).toFixed(2));
                        }, 0);

                        return (
                          <View>
                            {filteredCompletedJobs.map(job => {
                              const hours = job.totalHoursWorked || 0;
                              const payout = parseFloat((hours * rate).toFixed(2));
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
                            })}

                            {/* Total Payout display card */}
                            <View style={styles.totalSummaryBox}>
                              <Text style={styles.totalSummaryLabel}>Total Amount Earned:</Text>
                              <Text style={styles.totalSummaryValue}>${totalPayout.toFixed(2)}</Text>
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  )}
                </View>
              </View>
            ) : (
              // Main Home View
              <View>

                {/* Associated Contractors List */}
                <View style={styles.scheduleCard}>
                  <Text style={styles.sectionTitle}>👥 Associated Contractors</Text>
                  <Text style={styles.sectionSubtitle}>View companies and contractors you are rostered with or have worked with.</Text>
                  {loadingContractors ? (
                    <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
                  ) : contractors.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyEmoji}>👥</Text>
                      <Text style={styles.emptyText}>No associated contractors</Text>
                      <Text style={styles.emptySub}>Apply for freelance jobs or join their crew roster.</Text>
                    </View>
                  ) : (
                    contractors.map((c) => (
                      <TouchableOpacity
                        key={c._id}
                        style={styles.contractorCard}
                        onPress={() => {
                          setSelectedContractor(c);
                          fetchContractorProjects(c._id);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.contractorHeader}>
                          <Text style={styles.contractorCompany}>{c.companyName || 'Freelance Contractor'}</Text>
                          <Text style={styles.contractorName}>👤 {c.name}</Text>
                        </View>
                        <Text style={styles.contractorContact}>✉️ {c.email}  |  📞 {c.phoneNumber}</Text>
                        <View style={styles.viewProjectsBtn}>
                          <Text style={styles.viewProjectsBtnText}>View Shift History & Projects →</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'freelance' && (
          <View style={styles.scheduleCard}>
            <Text style={styles.sectionTitle}>💼 Open Freelance Openings</Text>
            <Text style={styles.sectionSubtitle}>View and apply to freelance jobs matching your capabilities and state.</Text>
            {loadingFreelance ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
            ) : freelanceJobs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>💼</Text>
                <Text style={styles.emptyText}>No freelance openings found</Text>
                <Text style={styles.emptySub}>Matching jobs in your state with your capabilities will show up here.</Text>
              </View>
            ) : (
              freelanceJobs.map((job) => {
                const isApprovedWorker = job.approvedWorker && (job.approvedWorker === user.id || job.approvedWorker._id === user.id);
                const hasApplied = job.applicants?.includes(user.id) || isApprovedWorker;
                const isCrewShift = job.targetType === 'crew';
                return (
                  <View key={job._id} style={styles.freelanceCard}>
                    <View style={styles.freelanceHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.freelanceCategoryText}>🧹 {job.category} {isCrewShift && <Text style={{ fontSize: 9, color: '#3B82F6', fontWeight: '800' }}>[ROSTER TARGETED]</Text>}</Text>
                        <Text style={styles.freelanceCompanyText}>🏢 {job.contractor?.companyName || 'Freelance Contractor'}</Text>
                      </View>
                      <View style={styles.priceBadge}>
                        <Text style={styles.priceBadgeText}>${job.pricePerHour}/hr</Text>
                      </View>
                    </View>
                    <Text style={styles.freelanceDateText}>📅 Date: {new Date(job.date).toLocaleDateString()} at {job.time}</Text>
                    <Text style={styles.freelanceDateText}>⏱️ Duration: {job.hours} hours (Est. Payout: ${job.hours * job.pricePerHour})</Text>
                    <Text style={styles.freelanceDateText}>📍 Location: {job.location}</Text>
                    <View style={styles.divider} />
                    <Text style={styles.freelanceDescText}>Description: {job.description}</Text>
                    
                    <TouchableOpacity
                      style={[
                        styles.applyBtn, 
                        hasApplied && styles.applyBtnDisabled,
                        !hasApplied && isCrewShift && { backgroundColor: '#10B981', shadowColor: '#10B981' }
                      ]}
                      onPress={() => !hasApplied && handleApplyFreelance(job._id)}
                      disabled={hasApplied}
                    >
                      <Text style={styles.applyBtnText}>
                        {hasApplied 
                          ? (isApprovedWorker ? 'Accepted ✓' : 'Applied ✓') 
                          : isCrewShift 
                          ? 'Accept Crew Shift ➔' 
                          : 'Apply for Opening'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'profile' && renderProfileTab()}

        <AppFooter />
      </ScrollView>

      {/* Smart & Attractive Floating Bottom Tab Bar */}
      <View style={styles.tabBarContainer}>
        <TouchableOpacity
          style={styles.tabBarItem}
          activeOpacity={0.8}
          hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
          onPress={() => setActiveTab('home')}
        >
          <View style={styles.iconBadgeWrapper}>
            <Text style={[styles.tabBarIcon, activeTab === 'home' && styles.tabBarIconActive]}>🏠</Text>
            {pendingCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.tabBarLabel, activeTab === 'home' && styles.tabBarLabelActive]}>Home</Text>
          {activeTab === 'home' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBarItem}
          activeOpacity={0.8}
          hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
          onPress={() => setActiveTab('freelance')}
        >
          <Text style={[styles.tabBarIcon, activeTab === 'freelance' && styles.tabBarIconActive]}>💼</Text>
          <Text style={[styles.tabBarLabel, activeTab === 'freelance' && styles.tabBarLabelActive]}>Freelance</Text>
          {activeTab === 'freelance' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBarItem}
          activeOpacity={0.8}
          hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
          onPress={() => setActiveTab('profile')}
        >
          <Text style={[styles.tabBarIcon, activeTab === 'profile' && styles.tabBarIconActive]}>👤</Text>
          <Text style={[styles.tabBarLabel, activeTab === 'profile' && styles.tabBarLabelActive]}>Profile</Text>
          {activeTab === 'profile' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>
      </View>

      {/* Crew Member Notifications Modal */}
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
    backgroundColor: Colors.secondary // SaaS Dark Blue Header
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
    fontSize: 17,
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
    color: '#FCA5A5', // Light red for contrast on dark blue
    fontSize: 11,
    fontWeight: '800'
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 110 // Add bottom spacer for floating tab navigation!
  },
  profileBanner: {
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16A34A', // Solid Brand Leaf Green
    marginBottom: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5
  },
  profileDetails: {
    flex: 1
  },
  welcomeGreeting: {
    fontSize: 22,
    fontWeight: '950',
    color: Colors.white,
    marginBottom: 6
  },
  profileRole: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '800',
    marginBottom: 4
  },
  profileMeta: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '650',
    marginTop: 2
  },
  bannerIconContainer: {
    width: 65,
    height: 65,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  bannerIcon: {
    fontSize: 32,
    color: Colors.white
  },
  shiftCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.2,
    marginBottom: 16
  },
  shiftText: {
    flex: 1,
    marginRight: 10
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2
  },
  beaconDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  shiftLabel: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '800'
  },
  shiftSub: {
    fontSize: 10.5,
    color: Colors.textMuted,
    fontWeight: '600'
  },
  shiftBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  requestsCard: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.2,
    borderColor: '#BAE6FD', // Glowing blue border for notification emphasis
    marginBottom: 16,
    shadowColor: '#0EA5E9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 8
  },
  requestItem: {
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0F2FE'
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  requestClient: {
    fontSize: 14.5,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 2
  },
  requestAddress: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '650'
  },
  timerBadge: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  timerBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#D97706'
  },
  urgentBadge: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginLeft: 8,
    alignSelf: 'center'
  },
  urgentBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#EF4444'
  },
  requestDetail: {
    fontSize: 11.5,
    color: '#475569',
    marginBottom: 4,
    fontWeight: '600'
  },
  requestNotes: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  requestActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  },
  actionButton: {
    width: '48.5%',
    borderRadius: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  acceptButton: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4
  },
  rejectButton: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 12.5,
    fontWeight: '900'
  },
  scheduleCard: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.2,
    borderColor: Colors.cardBorder,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 8
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 14,
    letterSpacing: 0.2
  },
  jobItemRow: {
    marginBottom: 14,
    borderBottomWidth: 1.2,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14
  },
  jobItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  addressCol: {
    flex: 1,
    marginRight: 8
  },
  addressText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E293B',
    marginBottom: 3
  },
  timeRangeText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.2
  },
  startBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2
  },
  startBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '850'
  },
  completeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2
  },
  completeBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '850'
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20
  },
  emptyEmoji: {
    fontSize: 34,
    marginBottom: 10
  },
  emptyText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800'
  },
  emptySub: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4
  },
  // Floating Tab Bar Styles
  tabBarContainer: {
    position: 'absolute',
    bottom: 25,
    left: 16,
    right: 16,
    height: 64,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10
  },
  tabBarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    paddingTop: 4,
    paddingVertical: 8
  },
  tabBarIcon: {
    fontSize: 20,
    color: '#64748B',
    marginBottom: 2
  },
  tabBarIconActive: {
    color: Colors.primary
  },
  tabBarLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B'
  },
  tabBarLabelActive: {
    color: Colors.primary,
    fontWeight: '900'
  },
  tabActiveIndicator: {
    width: 14,
    height: 3,
    backgroundColor: Colors.primary,
    borderRadius: 1.5,
    marginTop: 4
  },
  iconBadgeWrapper: {
    position: 'relative'
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: Colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900'
  },
  // My Shifts and History Styles
  historySection: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.2,
    borderColor: Colors.cardBorder,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 8
  },
  statsSummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18
  },
  statsSummaryCol: {
    alignItems: 'center'
  },
  statsSummaryVal: {
    fontSize: 22,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 4
  },
  statsSummaryLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.2
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#F1F5F9',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 3
  },
  historyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  historyCardDate: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E293B'
  },
  historyDivider: {
    height: 1,
    backgroundColor: '#F8FAFC',
    marginVertical: 10
  },
  historyTimeLabel: {
    fontSize: 11.5,
    color: '#475569',
    marginBottom: 4,
    fontWeight: '600'
  },
  historyHoursLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6
  },
  
  // ── New Crewlynk System Styles ──
  sectionSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 16
  },
  freelanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1
  },
  freelanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  freelanceCategoryText: {
    fontSize: 14,
    fontWeight: '850',
    color: '#0F172A'
  },
  freelanceCompanyText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginTop: 2
  },
  freelanceDateText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4
  },
  freelanceDescText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 12
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
  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2
  },
  applyBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0
  },
  applyBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '850'
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12
  },
  contractorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.2,
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
    alignItems: 'center',
    marginBottom: 8
  },
  contractorCompany: {
    fontSize: 14,
    fontWeight: '850',
    color: '#0F172A'
  },
  contractorName: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600'
  },
  contractorContact: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 12
  },
  viewProjectsBtn: {
    borderWidth: 1.2,
    borderColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  viewProjectsBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800'
  },
  projectCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10
  },
  projectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  projectTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6
  },
  projectTime: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 2
  },
  backBtn: {
    backgroundColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start'
  },
  backBtnText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '800'
  },
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
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase'
  },
  tableBodyRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center'
  },
  tableBodyCell: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600'
  },
  totalSummaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 14,
    marginTop: 12
  },
  totalSummaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46'
  },
  totalSummaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#047857'
  },
  emptyTableText: {
    textAlign: 'center',
    color: '#64748B',
    fontSize: 13,
    paddingVertical: 20
  },
  periodSelectBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF'
  },
  periodSelectText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155'
  },
  dropdownArrowIcon: {
    fontSize: 12,
    color: '#64748B'
  },
  periodDropdownMenu: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 50
  },
  periodDropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9'
  },
  periodDropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  }
});

export default WorkerDashboard;
