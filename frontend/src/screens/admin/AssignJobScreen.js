import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Modal } from 'react-native';
import backScrollEmitter from '../../utils/backScrollEmitter';
import { Colors } from '../../theme/colors';
import CustomInput from '../../components/CustomInput';
import CustomButton from '../../components/CustomButton';
import TimeInput from '../../components/TimeInput';
import { authAPI, jobsAPI } from '../../api/client';

const AssignJobScreen = ({ onJobCreated }) => {
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState(40.7527);
  const [longitude, setLongitude] = useState(-73.9772);
  const [radius, setRadius] = useState('200');
  const [expectedHours, setExpectedHours] = useState('2.5');
  const [assignedWorker, setAssignedWorker] = useState('');
  const [notes, setNotes] = useState('');
  const [jobDate, setJobDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobTime, setJobTime] = useState('09:00');
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());
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
  
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingWorkers, setLoadingWorkers] = useState(false);

  useEffect(() => {
    const fetchWorkers = async () => {
      setLoadingWorkers(true);
      try {
        const res = await authAPI.getWorkers();
        if (res.success) {
          setWorkers(res.workers);
          if (res.workers.length > 0) {
            setAssignedWorker(res.workers[0]._id);
          }
        }
      } catch (error) {
        console.error('Error fetching workers:', error.message);
      } finally {
        setLoadingWorkers(false);
      }
    };
    fetchWorkers();
  }, []);

  const handleJobTimeBlur = () => {
    let cleanTime = jobTime.trim();
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
      setJobTime('09:00');
    } else {
      setJobTime(cleanTime);
    }
  };

  const handleCreateJob = async () => {
    if (!customerName || !address || latitude === undefined || longitude === undefined || !assignedWorker || !jobDate || !jobTime) {
      Alert.alert('Missing Fields', 'Please complete all required fields and select a worker.');
      return;
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(jobTime)) {
      Alert.alert('Invalid Time', 'Start Time must be in 24-hour HH:MM format (e.g. 09:00 or 17:30).');
      return;
    }

    setLoading(true);
    try {
      const jobData = {
        customerName,
        address,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        geofenceRadius: parseInt(radius) || 200,
        expectedHours: parseFloat(expectedHours) || 2,
        assignedWorker,
        startTime: new Date(`${jobDate}T${jobTime}:00`).toISOString(),
        notes
      };

      const res = await jobsAPI.create(jobData);
      setLoading(false);

      if (res.success) {
        Alert.alert('Success', 'Cleaning Job has been created and assigned successfully!');
        // Reset form
        setCustomerName('');
        setAddress('');
        setNotes('');
        
        if (onJobCreated) {
          onJobCreated();
        }
      }
    } catch (error) {
      setLoading(false);
      Alert.alert('Error', error.response?.data?.message || 'Failed to create job');
    }
  };

  // Helper presets for coordinates
  const handleApplyPreset = (preset) => {
    switch (preset) {
      case 'broadway':
        setCustomerName('Broadway Theatre Office');
        setAddress('1681 Broadway, New York, NY 10019');
        setLatitude(40.7628);
        setLongitude(-73.9836);
        setRadius('150');
        setExpectedHours('4.0');
        break;
      case 'chelsea':
        setCustomerName('Chelsea Gallery Complex');
        setAddress('529 W 20th St, New York, NY 10011');
        setLatitude(40.7456);
        setLongitude(-74.0071);
        setRadius('100');
        setExpectedHours('3.0');
        break;
      case 'soho':
      default:
        setCustomerName('Soho Loft Apartment');
        setAddress('120 Prince St, New York, NY 10012');
        setLatitude(40.7247);
        setLongitude(-73.9996);
        setRadius('250');
        setExpectedHours('2.0');
        break;
    }
  };

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

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Create & Assign Job</Text>

        {/* Dynamic coordinate presets */}
        <Text style={styles.presetTitle}>Location Coordinates Presets:</Text>
        <View style={styles.presetRow}>
          <TouchableOpacity style={styles.presetBtn} onPress={() => handleApplyPreset('broadway')}>
            <Text style={styles.presetText}>🎭 Broadway</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetBtn} onPress={() => handleApplyPreset('chelsea')}>
            <Text style={styles.presetText}>🖼️ Chelsea</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.presetBtn} onPress={() => handleApplyPreset('soho')}>
            <Text style={styles.presetText}>🛋️ Soho Loft</Text>
          </TouchableOpacity>
        </View>

        <CustomInput
          label="Customer / Business Name"
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="e.g. Acme Corp HQ"
          required
        />

        <CustomInput
          label="Street Address"
          value={address}
          onChangeText={setAddress}
          placeholder="Enter city, state, country, or full address"
          required
        />

        <View style={styles.doubleRow}>
          <View style={styles.halfWidth}>
            <CustomInput
              label="Latitude"
              value={latitude.toString()}
              onChangeText={setLatitude}
              placeholder="e.g. 40.7128"
              keyboardType="numeric"
              required
            />
          </View>
          <View style={styles.halfWidth}>
            <CustomInput
              label="Longitude"
              value={longitude.toString()}
              onChangeText={setLongitude}
              placeholder="e.g. -74.0060"
              keyboardType="numeric"
              required
            />
          </View>
        </View>

        <View style={styles.doubleRow}>
          <View style={styles.halfWidth}>
            <CustomInput
              label="Expected Duration (Hours)"
              value={expectedHours}
              onChangeText={setExpectedHours}
              placeholder="e.g. 3.5"
              keyboardType="numeric"
              required
            />
          </View>
          <View style={styles.halfWidth}>
            <CustomInput
              label="Geofence Radius (meters)"
              value={radius}
              onChangeText={setRadius}
              placeholder="e.g. 200"
              keyboardType="numeric"
              required
            />
          </View>
        </View>

        <View style={styles.doubleRow}>
          <View style={styles.halfWidth}>
            <CustomInput
              label="Scheduled Date"
              value={jobDate}
              placeholder="Select your preferred service date"
              icon="📅"
              required
              onPress={() => {
                setCurrentCalendarMonth(jobDate ? new Date(jobDate) : new Date());
                setShowCalendarModal(true);
              }}
            />
          </View>
          <View style={styles.halfWidth}>
            <TimeInput
              label="Start Time"
              value={jobTime}
              onChangeText={setJobTime}
              placeholder="Example: 9:00 AM or 2:30 PM"
              icon="🕒"
              required
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.dropdownLabel}>Assign Crew *</Text>
          <View style={styles.pickerContainer}>
            {loadingWorkers ? (
              <Text style={styles.pickerPlaceholder}>Loading crew list...</Text>
            ) : workers.length === 0 ? (
              <Text style={styles.pickerPlaceholder}>No crew members available</Text>
            ) : (
              <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
                {workers.map((worker) => (
                  <TouchableOpacity
                    key={worker._id}
                    style={[
                      styles.pickerItem,
                      assignedWorker === worker._id && styles.pickerItemActive
                    ]}
                    onPress={() => setAssignedWorker(worker._id)}
                  >
                    <Text style={[
                      styles.pickerItemText,
                      assignedWorker === worker._id && styles.pickerItemTextActive
                    ]}>
                      👤 {worker.name} ({worker.status})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>

        <CustomInput
          label="Scope of Work / Instructions"
          value={notes}
          onChangeText={setNotes}
          placeholder="Vacuum carpets, disinfect desks, empty bins, etc."
          multiline
          numberOfLines={3}
          style={{ height: 75, textAlignVertical: 'top' }}
        />

        <CustomButton
          title="Create and Send Assignment ➔"
          type="primary" // Green SaaS
          onPress={handleCreateJob}
          loading={loading}
          style={{ marginTop: 8 }}
        />
      </View>

      <Modal
        visible={showCalendarModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => setCurrentCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                <Text style={styles.calendarNavText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.calendarHeaderTitle}>
                {currentCalendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => setCurrentCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                <Text style={styles.calendarNavText}>▶</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.weekRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((label) => (
                <Text key={label} style={styles.weekDayText}>{label}</Text>
              ))}
            </View>
            <View style={styles.daysGrid}>
              {getDaysInMonth(currentCalendarMonth).map((day, index) => {
                if (!day) return <View key={`empty-${index}`} style={styles.dayCellEmpty} />;
                const yyyy = day.getFullYear();
                const mm = String(day.getMonth() + 1).padStart(2, '0');
                const dd = String(day.getDate()).padStart(2, '0');
                const dateString = `${yyyy}-${mm}-${dd}`;
                const selected = dateString === jobDate;
                const isToday = day.toDateString() === new Date().toDateString();
                const isPast = day.getTime() < new Date().setHours(0, 0, 0, 0);

                return (
                  <TouchableOpacity
                    key={dateString}
                    style={styles.dayCell}
                    disabled={isPast}
                    onPress={() => {
                      setJobDate(dateString);
                      setShowCalendarModal(false);
                    }}
                  >
                    <View style={[
                      styles.dayInnerCircle,
                      !isPast && selected && styles.dayInnerCircleSelected,
                      !isPast && isToday && !selected && styles.dayInnerCircleToday
                    ]}>
                      <Text style={[
                        styles.dayText,
                        isPast && { color: '#CBD5E1' },
                        !isPast && selected && styles.dayTextSelected,
                        !isPast && isToday && !selected && styles.dayTextToday
                      ]}>
                        {day.getDate()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.calendarCloseBtn} onPress={() => setShowCalendarModal(false)}>
              <Text style={styles.calendarCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 4
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16
  },
  presetTitle: {
    color: Colors.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  presetBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    width: '31%',
    alignItems: 'center'
  },
  presetText: {
    color: Colors.secondary, // Blue text
    fontSize: 11,
    fontWeight: '700'
  },
  doubleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2
  },
  halfWidth: {
    width: '48%'
  },
  fieldGroup: {
    width: '100%',
    marginBottom: 14
  },
  dropdownLabel: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
    fontWeight: '700'
  },
  pickerContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 100, 
    overflow: 'hidden'
  },
  pickerPlaceholder: {
    color: Colors.textMuted,
    fontSize: 11.5,
    padding: 10,
    textAlign: 'center',
    marginTop: 20
  },
  pickerScroll: {
    flex: 1
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E2E8F0'
  },
  pickerItemActive: {
    backgroundColor: Colors.primaryMuted // Light Green SaaSbg
  },
  pickerItemText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600'
  },
  pickerItemTextActive: {
    color: Colors.primary, // Green text
    fontWeight: '800'
  }
  ,
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
  calendarNavText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A'
  },
  calendarHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A'
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  weekDayText: {
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
    marginVertical: 2
  },
  dayCell: {
    width: '14.28%',
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
  calendarCloseText: {
    color: '#0F172A',
    fontWeight: '800'
  }
});

export default AssignJobScreen;
