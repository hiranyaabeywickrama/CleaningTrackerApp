import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { Colors } from '../../theme/colors';
import MapViewContainer from '../../components/MapViewContainer';
import CustomButton from '../../components/CustomButton';
import { jobsAPI, locationAPI, workerAPI, BASE_URL, getAuthTokenStore } from '../../api/client';
import io from 'socket.io-client';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKGROUND_LOCATION_TASK_NAME = 'background-location-task';

// Top-level definition for Expo Task Manager background GPS tracking
TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const location = locations[0];
      const { latitude, longitude } = location.coords;
      console.log('Background location received:', latitude, longitude);
      
      try {
        const contractId = await AsyncStorage.getItem('active_contract_id');
        const token = await AsyncStorage.getItem('auth_token');
        const apiUrl = await AsyncStorage.getItem('api_url');
        const clientLatStr = await AsyncStorage.getItem('client_lat');
        const clientLngStr = await AsyncStorage.getItem('client_lng');
        
        if (contractId && token && apiUrl) {
          let workerStatus = 'Working';
          
          if (clientLatStr && clientLngStr) {
            const clientLat = parseFloat(clientLatStr);
            const clientLng = parseFloat(clientLngStr);
            
            // Haversine formula to check geofence breach (50 meters)
            const R = 6371000; // in meters
            const phi1 = (clientLat * Math.PI) / 180;
            const phi2 = (latitude * Math.PI) / 180;
            const deltaPhi = ((latitude - clientLat) * Math.PI) / 180;
            const deltaLambda = ((longitude - clientLng) * Math.PI) / 180;
            
            const a =
              Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;
            
            if (distance > 50) {
              workerStatus = 'Left Work Area';
            }
          }
          
          // Send coordinates to the backend via POST API
          const response = await fetch(`${apiUrl}/api/gps/log`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              contractId,
              lat: latitude,
              lng: longitude,
              workerStatus
            })
          });
          const resJson = await response.json();
          console.log('Background GPS logged successfully:', resJson);
        }
      } catch (err) {
        console.error('Error logging background GPS location:', err.message);
      }
    }
  }
});

const ActiveJobScreen = ({ route, navigation }) => {
  const { job: initialJob } = route.params;
  const [job, setJob] = useState(initialJob);
  const [status, setStatus] = useState(initialJob.status); // pending, started, completed
  
  // Timer States
  const [timeElapsed, setTimeElapsed] = useState(0);
  const timerRef = useRef(null);

  // GPS Sensor Coordinate States
  const clientLng = job.location.coordinates[0];
  const clientLat = job.location.coordinates[1];
  const [workerLng, setWorkerLng] = useState(clientLng);
  const [workerLat, setWorkerLat] = useState(clientLat);
  const [geofenceStatus, setGeofenceStatus] = useState('inside');
  const [distanceVal, setDistanceVal] = useState(0);

  // Assignment details & Session summary
  const [assignment, setAssignment] = useState(null);
  const [attendanceSummary, setAttendanceSummary] = useState(null);

  const socketRef = useRef(null);
  const foregroundSubscription = useRef(null);
  const webWatchId = useRef(null);

  // ── 1. Fetch Accepted Assignment Details ──
  useEffect(() => {
    const fetchAssignment = async () => {
      try {
        const res = await workerAPI.getAssignments();
        if (res.success) {
          const match = res.assignments.find(a => 
            a.response === 'accepted' && 
            a.contractId && 
            a.contractId.location.address === job.address
          );
          if (match) {
            setAssignment(match);
            
            // Sync check-in state from database
            if (match.checkInTime && status === 'pending') {
              setStatus('started');
              setJob(prev => ({ ...prev, actualStartTime: match.checkInTime }));
              
              // Persist session if not cached
              if (Platform.OS === 'web') {
                localStorage.setItem(`active_job_session_${job._id}`, JSON.stringify({
                  status: 'started',
                  startTime: match.checkInTime
                }));
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching assignment details:', err.message);
      }
    };
    fetchAssignment();
  }, [job]);

  // ── 2. Timer recovery & running ──
  useEffect(() => {
    // Attempt local storage auto-resume on Web
    if (Platform.OS === 'web') {
      const savedSession = localStorage.getItem(`active_job_session_${job._id}`);
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed.status === 'started' && status === 'pending') {
          setStatus('started');
          setJob(prev => ({ ...prev, actualStartTime: parsed.startTime }));
        }
      }
    }

    if (status === 'started') {
      const startTimeVal = job.actualStartTime || job.startTime;
      const start = new Date(startTimeVal).getTime();
      
      const updateTimer = () => {
        const now = Date.now();
        const diffSecs = Math.floor((now - start) / 1000);
        setTimeElapsed(diffSecs > 0 ? diffSecs : 0);
      };

      updateTimer(); // run once immediately
      timerRef.current = setInterval(updateTimer, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [status, job.actualStartTime, job.startTime]);

  // ── 3. Real Geolocation Watch & Background Auto-Resume ──
  useEffect(() => {
    if (status === 'started') {
      if (Platform.OS !== 'web') {
        startForegroundTracking();
        startBackgroundTracking();
      } else {
        startWebTracking();
      }
    }

    return () => {
      stopForegroundTracking();
      // Note: background tracking runs persistently so it is not stopped on unmount
      if (Platform.OS === 'web') {
        stopWebTracking();
      }
    };
  }, [status]);

  // ── 4. Socket.IO Real-time Connection & Coordinates Broadcast ──
  useEffect(() => {
    if (status === 'started' && assignment && assignment.contractId) {
      const socket = io(BASE_URL, {
        auth: { 
          role: 'worker', 
          userId: assignment.workerId._id || assignment.workerId,
          workerName: assignment.workerId.name || 'Cleaner'
        }
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Real-time tracking socket linked for worker');
      });

      // Emit first update immediately
      socket.emit('location_update', {
        contractId: assignment.contractId._id,
        lat: workerLat,
        lng: workerLng
      });

      // Emit position every 10 seconds (auto-reconnecting background tracking)
      const interval = setInterval(() => {
        if (socket.connected) {
          socket.emit('location_update', {
            contractId: assignment.contractId._id,
            lat: workerLat,
            lng: workerLng
          });
        }
      }, 10000);

      return () => {
        clearInterval(interval);
        socket.disconnect();
      };
    }
  }, [status, assignment, workerLat, workerLng]);

  // Request Location Permissions Helper
  const requestLocationPermissions = async () => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert('Permission Denied', 'Foreground location permission is required for real-time tracking.');
        return false;
      }

      if (Platform.OS !== 'web') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          Alert.alert(
            'Background Tracking Disabled',
            'Without background location access ("Always Allow"), GPS tracking will stop when the app is minimized or screen locked.'
          );
        }
      }
      return true;
    } catch (e) {
      console.error('Error requesting location permissions:', e.message);
      return false;
    }
  };

  // Start foreground watch positioning
  const startForegroundTracking = async () => {
    try {
      if (foregroundSubscription.current) {
        foregroundSubscription.current.remove();
      }

      foregroundSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // 5 seconds foreground interval
          distanceInterval: 2,
        },
        (location) => {
          const { latitude, longitude } = location.coords;
          handleCoordinatesChange(longitude, latitude);
        }
      );
    } catch (err) {
      console.error('Error starting foreground watch:', err.message);
    }
  };

  // Stop foreground watch
  const stopForegroundTracking = () => {
    if (foregroundSubscription.current) {
      foregroundSubscription.current.remove();
      foregroundSubscription.current = null;
    }
  };

  // Start background location updates task
  const startBackgroundTracking = async () => {
    try {
      if (Platform.OS === 'web') return;
      
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK_NAME);
      if (!isRegistered) {
        console.warn('Background location task not registered in TaskManager');
      }

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000, // every 10 seconds
        distanceInterval: 5,
        foregroundService: {
          notificationTitle: '🛰️ GPS TRACKING ACTIVE',
          notificationBody: 'Your location is secured in real-time.',
          notificationColor: '#10B981',
        },
        pausesUpdatesAutomatically: false,
      });
      console.log('Background location service started');
    } catch (err) {
      console.error('Error starting background updates:', err.message);
    }
  };

  // Stop background location updates
  const stopBackgroundTracking = async () => {
    try {
      if (Platform.OS === 'web') return;

      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
        console.log('Background location service stopped');
      }
    } catch (err) {
      console.error('Error stopping background updates:', err.message);
    }
  };

  // Web fallback geowatch
  const startWebTracking = () => {
    if (Platform.OS === 'web' && navigator.geolocation) {
      if (webWatchId.current) {
        navigator.geolocation.clearWatch(webWatchId.current);
      }
      webWatchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          handleCoordinatesChange(longitude, latitude);
        },
        (err) => console.warn('Web Geolocation error:', err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  // Stop web watch
  const stopWebTracking = () => {
    if (Platform.OS === 'web' && navigator.geolocation && webWatchId.current) {
      navigator.geolocation.clearWatch(webWatchId.current);
      webWatchId.current = null;
    }
  };

  const handleStartCleaning = async () => {
    try {
      // 1. Request GPS Permissions
      const hasPermission = await requestLocationPermissions();
      if (!hasPermission) return;

      const res = await jobsAPI.updateStatus(job._id, 'started');
      if (res.success) {
        setJob(res.job);
        setStatus('started');

        let checkInTimeVal = new Date();
        let activeAssignment = assignment;
        if (assignment) {
          const resStart = await workerAPI.startAssignment(assignment._id);
          if (resStart.success) {
            checkInTimeVal = resStart.assignment.checkInTime || new Date();
            setAssignment(resStart.assignment);
            activeAssignment = resStart.assignment;
          }
        }

        const contractId = activeAssignment?.contractId?._id || activeAssignment?.contractId;
        const currentToken = getAuthTokenStore();

        // 2. Cache credentials to AsyncStorage for background service
        if (contractId) {
          try {
            await AsyncStorage.setItem('active_contract_id', String(contractId));
            if (currentToken) {
              await AsyncStorage.setItem('auth_token', String(currentToken));
            }
            await AsyncStorage.setItem('api_url', String(BASE_URL));
            await AsyncStorage.setItem('active_job_id', String(job._id));
            await AsyncStorage.setItem('client_lat', String(clientLat));
            await AsyncStorage.setItem('client_lng', String(clientLng));
            console.log('AsyncStorage credentials cached for background tracking');
          } catch (e) {
            console.error('AsyncStorage cache failed:', e.message);
          }
        }

        // Cache session locally for auto-resume robustness
        if (Platform.OS === 'web') {
          localStorage.setItem(`active_job_session_${job._id}`, JSON.stringify({
            status: 'started',
            startTime: checkInTimeVal
          }));
        }

        // 3. Turn on real device GPS tracking
        if (Platform.OS !== 'web') {
          try {
            const currentPos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const { latitude, longitude } = currentPos.coords;
            handleCoordinatesChange(longitude, latitude);
          } catch (e) {
            console.warn('Could not get initial position:', e.message);
          }

          await startForegroundTracking();
          await startBackgroundTracking();
        } else {
          startWebTracking();
        }

        Alert.alert('Cleaning Started', 'The timer is running and real GPS tracking is active.');
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to start job');
    }
  };

  const handleEndCleaning = async () => {
    try {
      if (assignment) {
        const resEnd = await workerAPI.endAssignment(assignment._id);
        if (resEnd.success) {
          setAttendanceSummary(resEnd.summary);
          setAssignment(resEnd.assignment);
        }
      }

      const res = await jobsAPI.updateStatus(job._id, 'completed');
      if (res.success) {
        setJob(res.job);
        setStatus('completed');
        clearInterval(timerRef.current);
        
        // 1. Stop all tracking
        stopForegroundTracking();
        await stopBackgroundTracking();
        stopWebTracking();

        // 2. Clear credentials from AsyncStorage
        try {
          await AsyncStorage.removeItem('active_contract_id');
          await AsyncStorage.removeItem('auth_token');
          await AsyncStorage.removeItem('api_url');
          await AsyncStorage.removeItem('active_job_id');
          await AsyncStorage.removeItem('client_lat');
          await AsyncStorage.removeItem('client_lng');
          console.log('AsyncStorage credentials cleared after completing job');
        } catch (e) {
          console.error('AsyncStorage clear failed:', e.message);
        }

        // Clear active session
        if (Platform.OS === 'web') {
          localStorage.removeItem(`active_job_session_${job._id}`);
        }

        Alert.alert('Cleaning Completed', `Job ended successfully! Actual duration logged on server.`);
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to end job');
    }
  };

  // Log GPS coordinates helper
  const logCurrentGPS = async (lng, lat) => {
    try {
      const res = await locationAPI.log(lat, lng, 0, job._id);
      if (res.success) {
        setGeofenceStatus(res.log.geofenceStatus);
        setDistanceVal(res.log.distanceToClient);
      }
    } catch (error) {
      console.error('Error logging GPS coordinates:', error.message);
    }
  };

  const handleCoordinatesChange = (lng, lat) => {
    setWorkerLng(lng);
    setWorkerLat(lat);
    
    if (status === 'started') {
      logCurrentGPS(lng, lat);
      
      // Also emit instantly to socket room
      if (socketRef.current && socketRef.current.connected && assignment && assignment.contractId) {
        socketRef.current.emit('location_update', {
          contractId: assignment.contractId._id || assignment.contractId,
          lat,
          lng
        });
      }
    } else {
      // Local distance math preview
      const R = 6371e3;
      const phi1 = (lat * Math.PI) / 180;
      const phi2 = (clientLat * Math.PI) / 180;
      const deltaPhi = ((clientLat - lat) * Math.PI) / 180;
      const deltaLambda = ((clientLng - lng) * Math.PI) / 180;
      const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = R * c;
      setDistanceVal(dist);
      setGeofenceStatus(dist > 50 ? 'outside_breach' : 'inside');
    }
  };

  // Convert seconds to readable stopwatch string
  const formatStopwatch = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Sleek Sub-header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backText}>◀ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Tracker</Text>
        <View style={styles.headerRight}>
          {status === 'started' && (
            <View style={styles.gpsBadge}>
              <Text style={styles.gpsBadgeText}>🛰️ GPS ACTIVE</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Customer details card */}
        <View style={styles.clientDetailCard}>
          <Text style={styles.clientTitle}>{job.customerName || job.clientName}</Text>
          <Text style={styles.clientAddress}>📍 {job.address}</Text>
          {job.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Job Notes:</Text>
              <Text style={styles.notesText}>{job.notes}</Text>
            </View>
          )}
        </View>

        {/* Stopwatch & Action widget */}
        {status !== 'completed' && (
          <View style={styles.timerCard}>
            <Text style={styles.timerLabel}>ELAPSED WORK TIME</Text>
            <Text style={[styles.stopwatch, status === 'started' && { color: Colors.success }]}>
              {formatStopwatch(timeElapsed)}
            </Text>
            
            {status === 'pending' ? (
              <CustomButton
                title="Start Cleaning 🧼"
                type="success"
                onPress={handleStartCleaning}
                style={styles.actionBtn}
              />
            ) : (
              <CustomButton
                title="End Cleaning & Clock Out 🛑"
                type="danger"
                onPress={handleEndCleaning}
                style={styles.actionBtn}
              />
            )}
          </View>
        )}

        {/* Completed job summary report card */}
        {status === 'completed' && (
          <View style={styles.completedCard}>
            <Text style={styles.completedEmoji}>✅</Text>
            <Text style={styles.completedTitle}>Job Finished!</Text>
            
            {attendanceSummary ? (
              <View style={styles.summaryContainer}>
                <Text style={styles.summaryHeading}>Attendance Verification Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Actual Worked Duration:</Text>
                  <Text style={styles.summaryVal}>{Math.round(attendanceSummary.actualWorkedMinutes)} mins</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Geofence Violations Count:</Text>
                  <Text style={[styles.summaryVal, attendanceSummary.totalViolations > 0 && { color: Colors.danger }]}>
                    {attendanceSummary.totalViolations} logs
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Time spent outside Geofence:</Text>
                  <Text style={styles.summaryVal}>{Math.round(attendanceSummary.timeSpentOutsideMinutes)} mins</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Verification Grade:</Text>
                  <Text style={[
                    styles.summaryVal, 
                    { fontWeight: '950' },
                    attendanceSummary.gpsAttendanceSummary === 'Good' ? { color: Colors.success } : { color: Colors.warning }
                  ]}>
                    {attendanceSummary.gpsAttendanceSummary.toUpperCase()}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.completedSub}>Total Worked Hours calculated on server:</Text>
                <Text style={styles.completedHours}>{job.totalHoursWorked || 0} hrs</Text>
              </View>
            )}
            
            <CustomButton
              title="Return to Dashboard"
              type="outline"
              onPress={() => navigation.goBack()}
              style={{ marginTop: 18, width: '100%' }}
            />
          </View>
        )}

        {/* Map View radar overlay */}
        <Text style={styles.sectionTitle}>Live Tracking Radar</Text>
        <MapViewContainer
          clientCoords={job.location.coordinates}
          workerCoords={[workerLng, workerLat]}
          clientName={job.customerName || job.clientName}
          workerName="You (Worker)"
          geofenceRadius={job.geofenceRadius}
          geofenceStatus={geofenceStatus}
        />

        {/* Live Distance Info Box */}
        <View style={styles.distanceBadgeRow}>
          <View style={styles.distanceBadge}>
            <Text style={styles.distLabel}>Distance to Client</Text>
            <Text style={styles.distVal}>{Math.round(distanceVal)} meters</Text>
          </View>
          <View style={[styles.distanceBadge, { borderColor: geofenceStatus === 'outside_breach' ? Colors.danger : Colors.success }]}>
            <Text style={styles.distLabel}>Status Code</Text>
            <Text style={[styles.distVal, { color: geofenceStatus === 'outside_breach' ? Colors.danger : Colors.success }]}>
              {geofenceStatus === 'outside_breach' ? 'BREACHED' : 'SECURED'}
            </Text>
          </View>
        </View>
        
        {status === 'pending' && (
          <View style={styles.alertCard}>
            <Text style={styles.alertText}>
              🛰️ Real-time background GPS tracking will automatically turn on once you click "Start Cleaning".
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: Colors.secondary, // Dark Blue Header
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)'
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6
  },
  backText: {
    color: '#FFFFFF', // White text on dark blue background
    fontSize: 14,
    fontWeight: '700'
  },
  headerTitle: {
    color: '#FFFFFF', // White text on dark blue background
    fontSize: 18,
    fontWeight: '800'
  },
  headerRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 90
  },
  gpsBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  gpsBadgeText: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20
  },
  clientDetailCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 20
  },
  clientTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 6
  },
  clientAddress: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600'
  },
  notesBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0'
  },
  notesLabel: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4
  },
  notesText: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500'
  },
  timerCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 8
  },
  timerLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1
  },
  stopwatch: {
    fontSize: 44,
    fontWeight: '900',
    color: Colors.text,
    fontFamily: 'monospace',
    marginVertical: 12
  },
  actionBtn: {
    width: '100%',
    marginTop: 6
  },
  completedCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    marginBottom: 20
  },
  completedEmoji: {
    fontSize: 44,
    marginBottom: 10
  },
  completedTitle: {
    color: Colors.success,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4
  },
  completedSub: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600'
  },
  completedHours: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.text,
    marginVertical: 10
  },
  summaryContainer: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginTop: 12
  },
  summaryHeading: {
    fontSize: 13,
    fontWeight: '950',
    color: '#0F172A',
    marginBottom: 10,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6'
  },
  summaryLabel: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '700'
  },
  summaryVal: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
    marginTop: 10
  },
  distanceBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12
  },
  distanceBadge: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 10,
    width: '48%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder
  },
  distLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2
  },
  distVal: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800'
  },
  alertCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    padding: 12,
    marginTop: 10
  },
  alertText: {
    color: Colors.info,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16
  }
});

export default ActiveJobScreen;
