import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Alert, TouchableOpacity, Modal, ActivityIndicator, Image, BackHandler } from 'react-native';
import { Colors } from '../../theme/colors';
import { adminAPI } from '../../api/client';
import AppFooter from '../../components/AppFooter';
import backScrollEmitter from '../../utils/backScrollEmitter';

const AdminDashboard = ({ user, onLogout }) => {
  const [activeTab, _setActiveTab] = useState('home'); // 'home', 'contractors', 'workers', 'history'
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
  // Real database states
  const [contractors, setContractors] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workerHistory, setWorkerHistory] = useState(null);
  const [reports, setReports] = useState({
    totalWorkers: 0,
    totalContractors: 0,
    activeContracts: 0,
    completedJobs: 0,
    pendingContracts: 0,
    acceptanceRate: 0
  });
  const [allContracts, setAllContracts] = useState([]);

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadAdminData = async () => {
    try {
      setRefreshing(true);
      const cRes = await adminAPI.getContractors();
      setContractors(Array.isArray(cRes) ? cRes : []);

      const wRes = await adminAPI.getWorkers();
      setWorkers(Array.isArray(wRes) ? wRes : []);

      const rRes = await adminAPI.getReports();
      if (rRes) {
        setReports({
          totalWorkers: rRes.totalWorkers || wRes.length || 0,
          totalContractors: rRes.totalContractors || 0,
          activeContracts: rRes.activeContracts || 0,
          completedJobs: rRes.completedJobs || 0,
          pendingContracts: rRes.pendingContracts || 0,
          acceptanceRate: rRes.workerPerformance?.acceptanceRate || 0
        });
      }

      const contractsRes = await adminAPI.getContracts();
      if (contractsRes?.contracts) setAllContracts(contractsRes.contracts);

      setRefreshing(false);
    } catch (e) {
      setRefreshing(false);
      console.error('Error fetching admin data:', e.message);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [activeTab]);

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

  // View specific worker history
  const handleViewWorkerHistory = async (worker) => {
    setSelectedWorker(worker);
    setLoading(true);
    try {
      const res = await adminAPI.getWorkerHistory(worker.workerId);
      setWorkerHistory(res);
    } catch (e) {
      console.error('Error loading worker history:', e.message);
      Alert.alert('Error', 'Could not retrieve history for this worker.');
    } finally {
      setLoading(false);
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
            <Text style={styles.portalTitle}>Admin Station</Text>
            <Text style={styles.portalSubtitle}>Corporate Administrator Dashboard</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Logout ➔</Text>
        </TouchableOpacity>
      </View>



      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadAdminData} tintColor={Colors.primary} />
        }
      >
        {activeTab === 'home' && (
          <View>
            {/* Indigo Profile Banner */}
            <View style={styles.profileBanner}>
              <View style={styles.profileDetails}>
                <Text style={styles.welcomeGreeting}>Welcome, {user.name} 👋</Text>
                <Text style={styles.profileRole}>Role: Corporate Administrator</Text>
                <Text style={styles.profileMeta}>Secure Session: Active</Text>
                <Text style={styles.profileMeta}>Database Connection: Online</Text>
              </View>
              <View style={styles.bannerIconContainer}>
                <Text style={styles.bannerIcon}>🛡️</Text>
              </View>
            </View>

            {/* 4-Tile Statistics Row */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Workers</Text>
                <Text style={styles.statVal}>{reports.totalWorkers}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Contractors</Text>
                <Text style={styles.statVal}>{reports.totalContractors}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Active Contracts</Text>
                <Text style={styles.statVal}>{reports.activeContracts}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Completed</Text>
                <Text style={styles.statVal}>{reports.completedJobs}</Text>
              </View>
            </View>

            <View style={styles.reportCard}>
              <Text style={styles.sectionTitle}>Management Reports</Text>
              <Text style={styles.detailLabel}>Pending contracts: {reports.pendingContracts}</Text>
              <Text style={styles.detailLabel}>Worker acceptance rate: {reports.acceptanceRate}%</Text>
              <Text style={styles.tipText}>Live GPS tracking is contractor-only. Admin view is reports and management.</Text>
            </View>
          </View>
        )}

        {activeTab === 'contractors' && (
          <View>
            <Text style={styles.sectionTitle}>Registered Contractor Partners</Text>
            {contractors.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No registered contractors found.</Text>
              </View>
            ) : (
              contractors.map((c) => (
                <View key={c.contractorId} style={styles.contractorCard}>
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>{c.name}</Text>
                      <Text style={styles.cardSubtitle}>🏢 {c.companyName || 'Independent Contractor'}</Text>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>ACTIVE</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <Text style={styles.detailLabel}>Email: <Text style={{fontWeight: '700'}}>{c.email}</Text></Text>
                  <Text style={styles.detailLabel}>Phone: <Text style={{fontWeight: '700'}}>{c.phoneNumber || '—'}</Text></Text>
                  <Text style={styles.detailLabel}>Active Projects: <Text style={{fontWeight: '750', color: Colors.primary}}>{c.activeContracts || 0}</Text></Text>
                  <Text style={styles.detailLabel}>Partnership Date: <Text style={{fontWeight: '700'}}>{new Date(c.registrationDate).toLocaleDateString()}</Text></Text>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'workers' && (
          <View>
            <Text style={styles.sectionTitle}>Crew Registry</Text>
            <Text style={styles.tipText}>💡 Tip: Click on a worker to inspect their Historical Cleaning logs and Decision sheets.</Text>
            {workers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No cleaners registered yet.</Text>
              </View>
            ) : (
              workers.map((w) => (
                <TouchableOpacity 
                  key={w.workerId} 
                  style={styles.workerCard}
                  onPress={() => handleViewWorkerHistory(w)}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={styles.cardTitle}>👤 {w.name}</Text>
                      <Text style={styles.cardSubtitle}>ID: {w.workerCode} • ✉️ {w.email}</Text>
                    </View>
                    <View style={[
                      styles.statusDot, 
                      w.status === 'offline' ? styles.statusOffline : styles.statusActiveDot
                    ]}>
                      <Text style={styles.statusDotText}>
                        {w.status === 'cleaning' ? 'WORKING 🧼' : w.status === 'active_shift' ? 'SHIFT' : 'OFFLINE'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <Text style={styles.detailLabel}>Contracts Participated: <Text style={{fontWeight: '750'}}>{w.assignedContracts || 0}</Text></Text>
                  <Text style={styles.detailLabel}>Completed Jobs: <Text style={{fontWeight: '750', color: Colors.success}}>{w.completedJobs || 0}</Text></Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

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
          <Text style={[styles.tabBarIcon, activeTab === 'home' && styles.tabBarIconActive]}>🏠</Text>
          <Text style={[styles.tabBarLabel, activeTab === 'home' && styles.tabBarLabelActive]}>Home</Text>
          {activeTab === 'home' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBarItem}
          activeOpacity={0.8}
          hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
          onPress={() => setActiveTab('contractors')}
        >
          <Text style={[styles.tabBarIcon, activeTab === 'contractors' && styles.tabBarIconActive]}>🏢</Text>
          <Text style={[styles.tabBarLabel, activeTab === 'contractors' && styles.tabBarLabelActive]}>Contractors</Text>
          {activeTab === 'contractors' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tabBarItem}
          activeOpacity={0.8}
          hitSlop={{ top: 15, bottom: 15, left: 10, right: 10 }}
          onPress={() => setActiveTab('workers')}
        >
          <Text style={[styles.tabBarIcon, activeTab === 'workers' && styles.tabBarIconActive]}>👤</Text>
          <Text style={[styles.tabBarLabel, activeTab === 'workers' && styles.tabBarLabelActive]}>Cleaners</Text>
          {activeTab === 'workers' && <View style={styles.tabActiveIndicator} />}
        </TouchableOpacity>
      </View>

      {/* Worker History Modal (Displays detailed history to Admin) */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={selectedWorker !== null}
        onRequestClose={() => {
          setSelectedWorker(null);
          setWorkerHistory(null);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              setSelectedWorker(null);
              setWorkerHistory(null);
            }}>
              <Text style={styles.closeBtnText}>◀ Return to Roster</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Crew Member Dossier</Text>
            <View style={{ width: 60 }} />
          </View>

          {selectedWorker && (
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.modalProfileCard}>
                <Text style={styles.modalProfileName}>👤 {selectedWorker.name}</Text>
                <Text style={styles.modalProfileEmail}>Email: {selectedWorker.email}</Text>
                <Text style={styles.modalProfilePhone}>Status: {selectedWorker.status.toUpperCase()}</Text>
              </View>

              {loading ? (
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
              ) : workerHistory ? (
                <View>
                  <Text style={styles.modalSectionTitle}>Contract Decisions</Text>
                  {workerHistory.decisions && (
                    <View style={styles.historyCard}>
                      <Text style={styles.historyStatus}>Accepted: {workerHistory.decisions.accepted}</Text>
                      <Text style={styles.historyStatus}>Rejected: {workerHistory.decisions.rejected}</Text>
                      <Text style={styles.historyStatus}>Expired: {workerHistory.decisions.expired}</Text>
                      <Text style={styles.historyStatus}>Waitlisted: {workerHistory.decisions.waitlisted}</Text>
                    </View>
                  )}

                  <Text style={styles.modalSectionTitle}>Contract Assignments</Text>
                  {!workerHistory.assignments?.length ? (
                    <Text style={styles.noHistoryText}>No contract history for this worker.</Text>
                  ) : (
                    workerHistory.assignments.map((item, idx) => (
                      <View key={idx} style={styles.historyCard}>
                        <Text style={styles.historyClient}>🏢 {item.contract?.clientName || 'Contract'}</Text>
                        <Text style={styles.historyAddress}>📍 {item.contract?.location?.address}</Text>
                        <Text style={styles.historyStatus}>Response: <Text style={{fontWeight: '750'}}>{item.response?.toUpperCase()}</Text></Text>
                      </View>
                    ))
                  )}

                  <Text style={styles.modalSectionTitle}>Attendance History</Text>
                  {!workerHistory.attendance?.length ? (
                    <Text style={styles.noHistoryText}>No attendance records.</Text>
                  ) : (
                    workerHistory.attendance.map((att, idx) => (
                      <View key={idx} style={styles.attRow}>
                        <Text style={styles.attDate}>📅 {new Date(att.clockIn).toLocaleString()}</Text>
                        <Text style={styles.attSessions}>Clock out: {att.clockOut ? new Date(att.clockOut).toLocaleString() : 'Active'}</Text>
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </ScrollView>
          )}
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
    color: '#FCA5A5', // Light red for visibility on dark blue
    fontSize: 11,
    fontWeight: '800'
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1.2,
    borderBottomColor: Colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'space-between'
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryMuted,
    borderWidth: 1.2,
    borderColor: 'rgba(4, 120, 87, 0.25)'
  },
  tabBtnText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700'
  },
  tabBtnTextActive: {
    color: Colors.primary,
    fontWeight: '900'
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 110 // Add bottom spacer for floating tab navigation!
  },
  profileBanner: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.secondary, // Professional SaaS Blue
    marginBottom: 16,
    shadowColor: Colors.secondary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4
  },
  profileDetails: {
    flex: 1
  },
  welcomeGreeting: {
    fontSize: 20,
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  statBox: {
    backgroundColor: Colors.primary, // solid green KPI card
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 18,
    width: '23.5%',
    padding: 12,
    alignItems: 'flex-start',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3
  },
  statLabel: {
    fontSize: 8.5,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '850',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.2
  },
  reportCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder
  },
  statVal: {
    fontSize: 18,
    fontWeight: '950',
    color: '#FFFFFF'
  },
  approvalSection: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1.2,
    borderColor: '#FFEDD5',
    borderRadius: 22,
    padding: 18,
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 16,
    letterSpacing: 0.2
  },
  approvalCard: {
    backgroundColor: Colors.card,
    borderWidth: 1.2,
    borderColor: Colors.cardBorder,
    borderRadius: 18,
    padding: 16,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 5
  },
  approvalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  contractorNameText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A'
  },
  contractorMetaText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2
  },
  approvalBtnRow: {
    flexDirection: 'row'
  },
  approveBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6
  },
  approveBtnText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '850'
  },
  rejectBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  rejectBtnText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '850'
  },
  codeRow: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9'
  },
  codeLabel: {
    fontSize: 10.5,
    color: Colors.textMuted,
    fontWeight: '700'
  },
  contractorCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.2,
    borderColor: Colors.cardBorder,
    marginBottom: 14
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A'
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: Colors.textMuted,
    fontWeight: '600',
    marginTop: 2
  },
  statusBadge: {
    backgroundColor: '#D1FAE5',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#059669'
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10
  },
  detailLabel: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
    fontWeight: '600'
  },
  tipText: {
    fontSize: 11.5,
    color: '#0EA5E9',
    fontWeight: '750',
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E0F2FE'
  },
  workerCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.2,
    borderColor: Colors.cardBorder,
    marginBottom: 12
  },
  statusDot: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#F1F5F9'
  },
  statusDotText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#64748B'
  },
  statusActiveDot: {
    backgroundColor: '#E0F2FE'
  },
  statusOffline: {
    backgroundColor: '#FEE2E2'
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: Colors.cardBorder
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '650'
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 55,
    paddingBottom: 16,
    borderBottomWidth: 1.2,
    borderBottomColor: Colors.cardBorder,
    backgroundColor: Colors.card
  },
  closeBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700'
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A'
  },
  modalScroll: {
    padding: 20
  },
  modalProfileCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.2,
    borderColor: Colors.cardBorder,
    marginBottom: 20
  },
  modalProfileName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6
  },
  modalProfileEmail: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600'
  },
  modalProfilePhone: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '750',
    marginTop: 4
  },
  modalSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
    marginBottom: 12
  },
  noHistoryText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 16
  },
  historyCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 10
  },
  historyClient: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B'
  },
  historyAddress: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2
  },
  historyStatus: {
    fontSize: 11.5,
    color: Colors.success,
    fontWeight: '750',
    marginTop: 4
  },
  attRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0'
  },
  attDate: {
    fontSize: 13,
    fontWeight: '750',
    color: '#334155'
  },
  attSessions: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600'
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
  }
});

export default AdminDashboard;
