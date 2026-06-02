import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/colors';
import MapViewContainer from '../../components/MapViewContainer';
import { locationAPI, BASE_URL } from '../../api/client';
import io from 'socket.io-client';

const LiveTrackingScreen = () => {
  const [activeWorkers, setActiveWorkers] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  
  // Real-time Alerts Stack
  const [alerts, setAlerts] = useState([]);

  // Socket reference
  const socketRef = React.useRef(null);

  const fetchActiveLocations = async () => {
    try {
      const res = await locationAPI.getActiveLocations();
      if (res.success) {
        setActiveWorkers(res.locations);
        
        // Auto-select first worker if none selected
        if (res.locations.length > 0 && !selectedWorker) {
          setSelectedWorker(res.locations[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching active locations:', error.message);
    }
  };

  useEffect(() => {
    fetchActiveLocations();

    // Setup Socket.io real-time connection
    socketRef.current = io(BASE_URL);

    // Identify as admin monitor
    socketRef.current.emit('join', { role: 'admin', userId: 'global_admin' });

    // Listen for live location updates
    socketRef.current.on('location_update', (logData) => {
      console.log('Admin socket received location_update:', logData);
      
      setActiveWorkers(prev => {
        // Find if worker already in list, if so, update their data
        const index = prev.findIndex(item => item.worker.id === logData.worker.id);
        
        const updatedItem = {
          worker: logData.worker,
          location: {
            type: 'Point',
            coordinates: logData.coordinates
          },
          speed: logData.speed,
          geofenceStatus: logData.geofenceStatus,
          timestamp: logData.timestamp,
          job: logData.job
        };

        if (index > -1) {
          const newList = [...prev];
          newList[index] = updatedItem;
          
          // If this is the currently selected worker, sync details
          if (selectedWorker && selectedWorker.worker.id === logData.worker.id) {
            setSelectedWorker(updatedItem);
          }
          return newList;
        } else {
          return [updatedItem, ...prev];
        }
      });
    });

    // Listen for geofence breaches
    socketRef.current.on('geofence_breach', (breachAlert) => {
      console.log('GEOFENCE BREACH ALERT:', breachAlert);
      
      setAlerts(prev => [
        {
          id: Date.now().toString(),
          ...breachAlert
        },
        ...prev
      ]);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchActiveLocations();
    setRefreshing(false);
  };

  const getGeofenceBadge = (status) => {
    switch (status) {
      case 'outside_breach':
        return (
          <View style={[styles.badge, { backgroundColor: Colors.dangerMuted }]}>
            <Text style={[styles.badgeText, { color: Colors.danger }]}>🚨 Breach</Text>
          </View>
        );
      case 'inside':
        return (
          <View style={[styles.badge, { backgroundColor: Colors.successMuted }]}>
            <Text style={[styles.badgeText, { color: Colors.success }]}>🛡️ Secured</Text>
          </View>
        );
      case 'not_applicable':
      default:
        return (
          <View style={[styles.badge, { backgroundColor: '#F1F5F9' }]}>
            <Text style={[styles.badgeText, { color: Colors.textMuted }]}>Offline</Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {/* Real-time alarm banner slider */}
      {alerts.length > 0 && (
        <View style={styles.alertBannerStack}>
          {alerts.slice(0, 2).map((alert) => (
            <View key={alert.id} style={styles.alertToast}>
              <Text style={styles.alertToastTitle}>🚨 GEOFENCE BREACH ALERT</Text>
              <Text style={styles.alertToastMsg}>
                Worker <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{alert.workerName}</Text> moved outside the cleaning radius of client <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{alert.customerName || alert.clientName}</Text>! (Distance: {alert.distance}m, Limit: {alert.geofenceRadius}m)
              </Text>
            </View>
          ))}
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Main Map Viewer tracking the selected worker */}
        <View style={styles.mapSection}>
          {selectedWorker && selectedWorker.job ? (
            <MapViewContainer
              clientCoords={selectedWorker.job.location?.coordinates || [0, 0]}
              workerCoords={selectedWorker.location.coordinates}
              clientName={selectedWorker.job.customerName || selectedWorker.job.clientName || 'Client House'}
              workerName={selectedWorker.worker.name}
              geofenceRadius={selectedWorker.job.geofenceRadius || 200}
              geofenceStatus={selectedWorker.geofenceStatus}
              height={300}
            />
          ) : (
            <View style={styles.mapPlaceholder}>
              <Text style={styles.placeholderIcon}>🛰️</Text>
              <Text style={styles.placeholderText}>Select an active cleaning worker below to start tracking their live GPS coordinates</Text>
            </View>
          )}
        </View>

        {/* Workers directory list */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>Workers Tracking Console</Text>
          
          {activeWorkers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No workers logged in currently.</Text>
              <Text style={styles.emptySub}>Ask workers to clock in on their shifts to begin monitoring.</Text>
            </View>
          ) : (
            activeWorkers.map((item) => {
              const isSelected = selectedWorker && selectedWorker.worker.id === item.worker.id;
              return (
                <TouchableOpacity
                  key={item.worker.id}
                  activeOpacity={0.8}
                  style={[
                    styles.workerRow,
                    isSelected && styles.workerRowActive
                  ]}
                  onPress={() => setSelectedWorker(item)}
                >
                  <View style={styles.rowInfo}>
                    <Text style={styles.workerName}>👤 {item.worker.name}</Text>
                    <Text style={styles.workerJob}>
                      💼 {item.job ? (item.job.customerName || item.job.clientName) : 'No active job'}
                    </Text>
                  </View>
                  
                  <View style={styles.rowStatus}>
                    {getGeofenceBadge(item.geofenceStatus)}
                    <Text style={styles.timestamp}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC'
  },
  alertBannerStack: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    zIndex: 999
  },
  alertToast: {
    backgroundColor: Colors.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4
  },
  alertToastTitle: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2
  },
  alertToastMsg: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600'
  },
  mapSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    backgroundColor: Colors.card
  },
  mapPlaceholder: {
    height: 300,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#E2E8F0',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  placeholderIcon: {
    fontSize: 44,
    marginBottom: 12
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18
  },
  listSection: {
    padding: 16
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12
  },
  workerRow: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 2
  },
  workerRowActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryMuted
  },
  rowInfo: {
    flex: 1,
    marginRight: 10
  },
  workerName: {
    color: '#1E293B',
    fontSize: 14.5,
    fontWeight: '800',
    marginBottom: 4
  },
  workerJob: {
    color: Colors.textMuted,
    fontSize: 11.5,
    fontWeight: '600'
  },
  rowStatus: {
    alignItems: 'flex-end'
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '800'
  },
  timestamp: {
    color: Colors.textMuted,
    fontSize: 9.5,
    fontWeight: '500'
  },
  emptyContainer: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#E2E8F0',
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
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4
  },
  scrollContainer: {
    flexGrow: 1
  }
});

export default LiveTrackingScreen;
