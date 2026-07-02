import React, { useState, useEffect } from 'react';
import AppFooter from '../../components/AppFooter';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import AppFooter from '../../components/AppFooter';
import { Colors } from '../../theme/colors';
import AppFooter from '../../components/AppFooter';
import { attendanceAPI, authAPI } from '../../api/client';

const AttendanceReportsScreen = () => {
  const [workers, setWorkers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [records, setRecords] = useState([]);
  const [totalHours, setTotalHours] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchWorkers = async () => {
    try {
      const res = await authAPI.getWorkers();
      if (res.success) {
        setWorkers(res.workers);
      }
    } catch (error) {
      console.error('Error fetching workers:', error.message);
    }
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const res = await attendanceAPI.getReport(selectedWorkerId);
      if (res.success) {
        setRecords(res.records);
        setTotalHours(res.totalHours);
      }
    } catch (error) {
      console.error('Error fetching attendance report:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [selectedWorkerId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchWorkers(), fetchAttendance()]);
    setRefreshing(false);
  };

  const formattedDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formattedTime = (dateStr) => {
    if (!dateStr) return '--:--';
    return new Date(dateStr).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Attendance & Shifts Analytics</Text>

          {/* Quick filter by Worker horizontal scroll */}
          <Text style={styles.filterTitle}>Filter by Worker:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.workersFilterRow}>
            <TouchableOpacity
              style={[
                styles.workerFilterChip,
                selectedWorkerId === '' && styles.workerFilterChipActive
              ]}
              onPress={() => setSelectedWorkerId('')}
            >
              <Text style={[
                styles.filterChipText,
                selectedWorkerId === '' && styles.filterChipTextActive
              ]}>
                🌍 All Workers
              </Text>
            </TouchableOpacity>

            {workers.map((worker) => (
              <TouchableOpacity
                key={worker._id}
                style={[
                  styles.workerFilterChip,
                  selectedWorkerId === worker._id && styles.workerFilterChipActive
                ]}
                onPress={() => setSelectedWorkerId(worker._id)}
              >
                <Text style={[
                  styles.filterChipText,
                  selectedWorkerId === worker._id && styles.filterChipTextActive
                ]}>
                  👤 {worker.name}
                </Text>
              </TouchableOpacity>
            ))}
          <AppFooter />
        </ScrollView>
        </View>

        {/* Analytics Summary Banner */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryVal}>{records.length}</Text>
            <Text style={styles.summaryLabel}>Total Shifts</Text>
          </View>
          <View style={[styles.summaryBox, { borderLeftWidth: 1, borderLeftColor: '#E2E8F0' }]}>
            <Text style={[styles.summaryVal, { color: Colors.success }]}>{totalHours} hrs</Text>
            <Text style={styles.summaryLabel}>Worked Hours</Text>
          </View>
        </View>

        {/* Shift log items list */}
        <Text style={styles.sectionTitle}>Shift Logs Database</Text>
        
        {records.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No attendance records found.</Text>
            <Text style={styles.emptySub}>When workers start shifts, logs will record here.</Text>
          </View>
        ) : (
          records.map((record) => (
            <View key={record._id} style={styles.recordRow}>
              <View style={styles.recordHeader}>
                <Text style={styles.recordWorkerName}>👤 {record.worker?.name || 'Unknown'}</Text>
                <Text style={styles.recordDate}>📅 {formattedDate(record.clockIn)}</Text>
              </View>

              <View style={styles.recordDetails}>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Clock In</Text>
                  <Text style={styles.detailTime}>{formattedTime(record.clockIn)}</Text>
                </View>
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Clock Out</Text>
                  <Text style={styles.detailTime}>{formattedTime(record.clockOut)}</Text>
                </View>
                <View style={[styles.detailCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.detailLabel}>Duration</Text>
                  <Text style={[
                    styles.detailHours,
                    record.status === 'active' ? { color: Colors.secondary } : { color: Colors.success }
                  ]}>
                    {record.status === 'active' ? 'ACTIVE ⏱️' : `${record.totalHours} hrs`}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      <AppFooter />
        </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },
  scrollContainer: {
    paddingBottom: 120,
    flexGrow: 1,
    padding: 16
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 16
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14
  },
  filterTitle: {
    color: Colors.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  workersFilterRow: {
    flexDirection: 'row',
    marginTop: 4
  },
  workerFilterChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginRight: 8,
    height: 34,
    justifyContent: 'center'
  },
  workerFilterChipActive: {
    backgroundColor: Colors.primaryMuted, // Green active light background
    borderColor: Colors.primary
  },
  filterChipText: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600'
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontWeight: '800'
  },
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 20
  },
  summaryBox: {
    width: '50%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  summaryVal: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A'
  },
  summaryLabel: {
    fontSize: 10.5,
    color: Colors.textMuted,
    fontWeight: '700',
    marginTop: 4
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12
  },
  recordRow: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 2
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10
  },
  recordWorkerName: {
    color: '#1E293B',
    fontSize: 13.5,
    fontWeight: '800'
  },
  recordDate: {
    color: Colors.textMuted,
    fontSize: 11.5,
    fontWeight: '600'
  },
  recordDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  detailCol: {
    width: '30%'
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: 9.5,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  detailTime: {
    color: '#334155',
    fontSize: 12.5,
    fontWeight: '600'
  },
  detailHours: {
    fontSize: 12.5,
    fontWeight: '800'
  },
  emptyContainer: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#E2E8F0',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10
  },
  emptyText: {
    color: '#0F172A',
    fontSize: 13.5,
    fontWeight: '800'
  },
  emptySub: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '650',
    marginTop: 4
  }
});

export default AttendanceReportsScreen;


