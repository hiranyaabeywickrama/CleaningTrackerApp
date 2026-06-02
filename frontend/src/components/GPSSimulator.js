import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Slider } from 'react-native';
import { Colors } from '../theme/colors';

const GPSSimulator = ({
  clientCoords = [-73.9772, 40.7527], // [lng, lat] (Default: Grand Central)
  onCoordsChange, // Callback function receiving [newLng, newLat]
  geofenceRadius = 200
}) => {
  const [workerLng, setWorkerLng] = useState(clientCoords[0]);
  const [workerLat, setWorkerLat] = useState(clientCoords[1]);
  const [driftOffset, setDriftOffset] = useState(0); // Offset tracker

  const updateCoordinates = (lng, lat) => {
    setWorkerLng(lng);
    setWorkerLat(lat);
    if (onCoordsChange) {
      onCoordsChange(lng, lat);
    }
  };

  const handleSimulateInside = () => {
    setDriftOffset(0);
    // Reset worker exactly to customer coordinate
    updateCoordinates(clientCoords[0], clientCoords[1]);
  };

  const handleSimulateBreach = () => {
    // 0.003 coordinate offset is roughly ~330 meters, exceeding standard 200m geofence!
    const breachLng = clientCoords[0] + 0.0035;
    const breachLat = clientCoords[1] + 0.0035;
    setDriftOffset(100); // Visual indicator
    updateCoordinates(breachLng, breachLat);
  };

  const handleNudge = (direction) => {
    let deltaLng = 0;
    let deltaLat = 0;
    
    // Nudge step of 0.0005 coordinates is roughly ~50 meters
    const NUDGE_STEP = 0.0007;

    switch (direction) {
      case 'north':
        deltaLat = NUDGE_STEP;
        break;
      case 'south':
        deltaLat = -NUDGE_STEP;
        break;
      case 'east':
        deltaLng = NUDGE_STEP;
        break;
      case 'west':
        deltaLng = -NUDGE_STEP;
        break;
      default:
        break;
    }

    const nextLng = workerLng + deltaLng;
    const nextLat = workerLat + deltaLat;
    
    updateCoordinates(nextLng, nextLat);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🛠️ Developer GPS Geofence Simulator</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.coordBox}>
          <Text style={styles.coordLabel}>Worker Lat</Text>
          <Text style={styles.coordVal}>{workerLat.toFixed(6)}</Text>
        </View>
        <View style={styles.coordBox}>
          <Text style={styles.coordLabel}>Worker Lng</Text>
          <Text style={styles.coordVal}>{workerLng.toFixed(6)}</Text>
        </View>
      </View>

      {/* Preset Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.simButton, { backgroundColor: Colors.success }]}
          onPress={handleSimulateInside}
        >
          <Text style={styles.btnText}>📍 Simulate Inside</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.simButton, { backgroundColor: Colors.danger }]}
          onPress={handleSimulateBreach}
        >
          <Text style={styles.btnText}>🚨 Trigger Breach</Text>
        </TouchableOpacity>
      </View>

      {/* Grid directional nudge buttons */}
      <Text style={styles.nudgeTitle}>Nudge Coordinate Position (Step ~75m):</Text>
      <View style={styles.nudgeGrid}>
        <View style={styles.nudgeRow}>
          <TouchableOpacity style={styles.nudgeButton} onPress={() => handleNudge('north')}>
            <Text style={styles.nudgeText}>▲ N</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.nudgeRow}>
          <TouchableOpacity style={styles.nudgeButton} onPress={() => handleNudge('west')}>
            <Text style={styles.nudgeText}>◀ W</Text>
          </TouchableOpacity>
          <View style={styles.nudgeCenter}>
            <Text style={styles.nudgeCenterText}>GPS</Text>
          </View>
          <TouchableOpacity style={styles.nudgeButton} onPress={() => handleNudge('east')}>
            <Text style={styles.nudgeText}>E ▶</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.nudgeRow}>
          <TouchableOpacity style={styles.nudgeButton} onPress={() => handleNudge('south')}>
            <Text style={styles.nudgeText}>▼ S</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#334155',
    marginVertical: 15,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5
  },
  header: {
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 6
  },
  title: {
    color: '#818CF8', // Light Indigo for high contrast
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  coordBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
    width: '48%',
    borderWidth: 1,
    borderColor: '#334155'
  },
  coordLabel: {
    color: '#94A3B8', // Light slate
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2
  },
  coordVal: {
    color: '#F8FAFC', // Pure white-blue for legibility
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'monospace'
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  simButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  btnText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800'
  },
  nudgeTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center'
  },
  nudgeGrid: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2
  },
  nudgeButton: {
    backgroundColor: '#334155',
    borderRadius: 8,
    width: 60,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#475569'
  },
  nudgeText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800'
  },
  nudgeCenter: {
    width: 60,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4
  },
  nudgeCenterText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800'
  }
});

export default GPSSimulator;
