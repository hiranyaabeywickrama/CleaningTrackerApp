import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Lightweight map embed — no native Google Maps SDK, no ARCore requirement.
 * Works on any Android device with a browser engine (any Wi‑Fi / 4G).
 */
const EmbeddedGoogleMap = ({ latitude, longitude, height = 250, style }) => {
  const lat = parseFloat(latitude) || 40.7527;
  const lng = parseFloat(longitude) || -73.9772;
  const uri = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;

  if (Platform.OS === 'web') {
    return (
      <iframe
        title="Map"
        src={uri}
        style={{
          width: '100%',
          height,
          border: 'none',
          borderRadius: 16,
          ...(style || {})
        }}
      />
    );
  }

  return (
    <View style={[{ height, width: '100%', overflow: 'hidden', borderRadius: 16 }, style]}>
      <WebView
        source={{ uri }}
        style={StyleSheet.absoluteFillObject}
        scrollEnabled={false}
        originWhitelist={['*']}
      />
    </View>
  );
};

export default EmbeddedGoogleMap;
