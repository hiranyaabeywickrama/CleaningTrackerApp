import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { Colors } from '../theme/colors';

// Conditional native modules loader for absolute cross-platform compile safety
let MapView, Marker, Circle, Polyline;
if (Platform.OS !== 'web') {
  try {
    const mapsModuleName = 'react-native-maps';
    const Maps = require(mapsModuleName);
    MapView = Maps.default;
    Marker = Maps.Marker;
    Circle = Maps.Circle;
    Polyline = Maps.Polyline;
  } catch (e) {
    console.warn("Native react-native-maps module failed to load. Falling back to radar mock.", e);
  }
}

const MapViewContainer = ({
  clientCoords = [-73.9772, 40.7527], // [lng, lat]
  workerCoords = [-73.9772, 40.7527], // [lng, lat]
  clientName = 'Client House',
  workerName = 'Worker',
  geofenceRadius = 200,
  geofenceStatus = 'inside',
  height = 250,
  routeHistory = [] // Array of coordinate logs [ [lng, lat], ... ] to track historical path
}) => {
  // Animation value for radar pulse
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 2500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false
      })
    ).start();
  }, [pulseAnim]);

  // Coordinates formatting
  const clientLng = clientCoords[0] || -73.9772;
  const clientLat = clientCoords[1] || 40.7527;
  const workerLng = workerCoords[0] || -73.9772;
  const workerLat = workerCoords[1] || 40.7527;

  const isBreached = geofenceStatus === 'outside_breach';

  // ----------------------------------------------------
  // NATIVE MOBILE GOOGLE MAPS RENDERING
  // ----------------------------------------------------
  if (Platform.OS !== 'web' && MapView && Marker) {
    // Determine bounds & coordinates
    const clientLatLng = { latitude: clientLat, longitude: clientLng };
    const workerLatLng = { latitude: workerLat, longitude: workerLng };
    
    // Polyline route coordinates (worker to customer, plus any breadcrumbs)
    const polylineCoords = [workerLatLng, ...routeHistory.map(pt => ({ latitude: pt[1], longitude: pt[0] })), clientLatLng];

    return (
      <View style={[styles.nativeContainer, { height }]}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          provider="google" // Forces Google Maps on both iOS and Android!
          initialRegion={{
            latitude: (clientLat + workerLat) / 2,
            longitude: (clientLng + workerLng) / 2,
            latitudeDelta: Math.max(0.008, Math.abs(clientLat - workerLat) * 1.8),
            longitudeDelta: Math.max(0.008, Math.abs(clientLng - workerLng) * 1.8)
          }}
        >
          {/* Customer Location Marker */}
          <Marker
            coordinate={clientLatLng}
            title={clientName}
            description="Cleaning Destination"
            pinColor={Colors.primary}
          />

          {/* Worker Location Marker */}
          <Marker
            coordinate={workerLatLng}
            title={workerName}
            description="Live Cleaner Position"
            pinColor={isBreached ? Colors.danger : Colors.success}
          />

          {/* Customer Geofence Boundary Circle */}
          {Circle && (
            <Circle
              center={clientLatLng}
              radius={geofenceRadius}
              strokeColor={isBreached ? Colors.danger : Colors.success}
              fillColor={isBreached ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.08)'}
              strokeWidth={1.5}
            />
          )}

          {/* Dynamic route polyline connecting worker to client */}
          {Polyline && (
            <Polyline
              coordinates={polylineCoords}
              strokeColor={isBreached ? Colors.danger : Colors.primary}
              strokeWidth={3}
              lineDashPattern={[5, 5]} // Dotted route representation
            />
          )}
        </MapView>

        {/* Floating geofence warning card */}
        <View style={[
          styles.nativeAlertBanner,
          { backgroundColor: isBreached ? Colors.danger : Colors.success }
        ]}>
          <Text style={styles.alertText}>
            {isBreached ? '⚠️ GEOFENCE VIOLATION OUTSIDE AREA' : '🛡️ GEOFENCE STATUS SECURED'}
          </Text>
        </View>
      </View>
    );
  }

  // ----------------------------------------------------
  // HIGH-FIDELITY RADAR FALLBACK FOR WEB PREVIEWS
  // ----------------------------------------------------
  const dLat = workerLat - clientLat;
  const dLng = workerLng - clientLng;

  // Scale minor movements visibly on the mock dashboard
  const scaleFactor = 15000;
  const offsetX = Math.max(-100, Math.min(100, dLng * scaleFactor));
  const offsetY = Math.max(-100, Math.min(100, -dLat * scaleFactor));

  // Pulse size scaling
  const pulseSize = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [60, 180]
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0]
  });

  return (
    <View style={[styles.container, { height }]}>
      {/* Space grid lines */}
      <View style={styles.gridContainer}>
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`h-${i}`} style={[styles.gridLineH, { top: `${(i + 1) * 12.5}%` }]} />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={`v-${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 12.5}%` }]} />
        ))}
      </View>

      {/* Geofence circle boundary centered around client */}
      <View style={[
        styles.geofenceCircle,
        {
          borderColor: isBreached ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)',
          backgroundColor: isBreached ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.03)'
        }
      ]} />

      {/* Live radar pulse */}
      <Animated.View style={[
        styles.pulseCircle,
        {
          width: pulseSize,
          height: pulseSize,
          borderRadius: 100,
          opacity: pulseOpacity,
          borderColor: isBreached ? Colors.danger : Colors.success
        }
      ]} />

      {/* Connection route vector line */}
      {(offsetX !== 0 || offsetY !== 0) && (
        <View style={[
          styles.vectorLine,
          {
            width: Math.max(2, Math.abs(offsetX)),
            height: Math.max(2, Math.abs(offsetY)),
            left: offsetX > 0 ? '50%' : `calc(50% + ${offsetX}px)`,
            top: offsetY > 0 ? '50%' : `calc(50% + ${offsetY}px)`,
            borderColor: isBreached ? Colors.danger : Colors.primary,
            borderStyle: 'dashed',
            borderWidth: 1.5
          }
        ]} />
      )}

      {/* Customer Pin */}
      <View style={styles.clientPin}>
        <View style={styles.clientCore} />
        <View style={styles.clientLabelContainer}>
          <Text style={styles.pinLabel} numberOfLines={1}>{clientName}</Text>
          <Text style={styles.pinCoords}>{clientLat.toFixed(5)}, {clientLng.toFixed(5)}</Text>
        </View>
      </View>

      {/* Worker Location Marker */}
      <View style={[
        styles.workerPin,
        {
          transform: [
            { translateX: offsetX },
            { translateY: offsetY }
          ]
        }
      ]}>
        <View style={[
          styles.workerCore,
          { backgroundColor: isBreached ? Colors.danger : Colors.success }
        ]} />
        <View style={styles.workerLabelContainer}>
          <Text style={styles.workerLabel}>{workerName}</Text>
          <Text style={styles.workerSpeed}>LIVE GPS</Text>
        </View>
      </View>

      {/* Geofence Status Banner */}
      <View style={[
        styles.statusBanner,
        { backgroundColor: isBreached ? Colors.danger : Colors.success }
      ]}>
        <Text style={styles.statusText}>
          {isBreached ? '⚠️ GEOFENCE BREACH: Worker Outside Area' : '🛡️ SECURED: Worker Inside Geofence'}
        </Text>
      </View>

      {/* Coordinate Scale Info Footer */}
      <View style={styles.scaleFooter}>
        <Text style={styles.scaleText}>🛰️ Google Maps Web Preview (Scale: {geofenceRadius}m Radius)</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  nativeContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    position: 'relative'
  },
  nativeAlertBanner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4
  },
  alertText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  container: {
    backgroundColor: '#090D16',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.15
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.textMuted
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: Colors.textMuted
  },
  geofenceCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    position: 'absolute'
  },
  pulseCircle: {
    borderWidth: 1.5,
    position: 'absolute'
  },
  clientPin: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    position: 'absolute'
  },
  clientCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    borderWidth: 2.5,
    borderColor: Colors.white
  },
  clientLabelContainer: {
    position: 'absolute',
    bottom: 18,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: 130
  },
  pinLabel: {
    color: Colors.text,
    fontSize: 10,
    fontWeight: '800'
  },
  pinCoords: {
    color: Colors.textMuted,
    fontSize: 8,
    marginTop: 1
  },
  workerPin: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 12,
    position: 'absolute'
  },
  workerCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4
  },
  workerLabelContainer: {
    position: 'absolute',
    top: 18,
    backgroundColor: 'rgba(9, 13, 22, 0.9)',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: 100
  },
  workerLabel: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: '700'
  },
  workerSpeed: {
    color: Colors.textMuted,
    fontSize: 7,
    fontWeight: '600'
  },
  vectorLine: {
    position: 'absolute',
    zIndex: 5
  },
  statusBanner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3
  },
  scaleFooter: {
    position: 'absolute',
    bottom: 10,
    zIndex: 20
  },
  scaleText: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4
  }
});

export default MapViewContainer;
