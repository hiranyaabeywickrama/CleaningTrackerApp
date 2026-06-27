import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';

/**
 * Interactive map component loading Google Maps tiles inside a Leaflet frame.
 * Supports clicking anywhere on the map, dragging the pin, live location, and smooth panning.
 */
const EmbeddedGoogleMap = ({ latitude, longitude, height = 250, style, onLocationSelect }) => {
  const lat = parseFloat(latitude) || 40.7527;
  const lng = parseFloat(longitude) || -73.9772;
  const webViewRef = useRef(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // React to parent Web message events (Web/iframe fallback)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleWebMessage = (event) => {
        if (event.data && event.data.type === 'LOCATION_SELECT') {
          const { lat: newLat, lng: newLng } = event.data.data;
          if (onLocationSelect) {
            onLocationSelect(newLat, newLng);
          }
        }
      };
      window.addEventListener('message', handleWebMessage);
      return () => window.removeEventListener('message', handleWebMessage);
    }
  }, [onLocationSelect]);

  // Smoothly pan and move marker when props change (without reloading WebView)
  useEffect(() => {
    if (webViewRef.current && Platform.OS !== 'web') {
      const script = `
        if (typeof map !== 'undefined' && typeof marker !== 'undefined') {
          var newLatLng = [${lat}, ${lng}];
          map.setView(newLatLng, 15, { animate: true });
          marker.setLatLng(newLatLng);
        }
        true;
      `;
      webViewRef.current.injectJavaScript(script);
    } else if (Platform.OS === 'web') {
      // For web iframe, we could use postMessage, but iframe key change is simplest for now
      // or we can just send a message to the iframe window
      const iframe = document.getElementById('map-iframe');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'UPDATE_LOCATION', lat, lng }, '*');
      }
    }
  }, [lat, lng]);

  const handleLiveLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access location was denied');
        setLoadingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (onLocationSelect) {
        onLocationSelect(location.coords.latitude, location.coords.longitude);
      }
    } catch (error) {
      alert('Location unavailable. Please enable device location services.');
    } finally {
      setLoadingLocation(false);
    }
  };

  // Leaflet HTML template
  const leafletHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
      <style>
        html, body, #map {
          height: 100%;
          margin: 0;
          padding: 0;
          background: #f1f5f9;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
      <script>
        var map = L.map('map', {
          zoomControl: true,
          attributionControl: false
        }).setView([${lat}, ${lng}], 15);

        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        }).addTo(map);

        var customIcon = L.divIcon({
          className: 'custom-div-icon',
          html: "<div style='background-color:#ef4444; width:30px; height:30px; border-radius:50% 50% 50% 0; position:absolute; transform:rotate(-45deg); left:50%; top:50%; margin:-15px 0 0 -15px; border:2px solid #fff; box-shadow:0px 0px 5px rgba(0,0,0,0.4);'><div style='width:10px; height:10px; background:#1e293b; border-radius:50%; margin:8px 0 0 8px;'></div></div>",
          iconSize: [30, 30],
          iconAnchor: [15, 30]
        });

        var marker = L.marker([${lat}, ${lng}], {
          draggable: true,
          icon: customIcon
        }).addTo(map);

        function sendCoordinates(newLat, newLng) {
          var data = { lat: newLat, lng: newLng };
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify(data));
          } else {
            window.parent.postMessage({ type: 'LOCATION_SELECT', data: data }, '*');
          }
        }

        marker.on('dragend', function(e) {
          var position = marker.getLatLng();
          sendCoordinates(position.lat, position.lng);
        });

        map.on('click', function(e) {
          marker.setLatLng(e.latlng);
          sendCoordinates(e.latlng.lat, e.latlng.lng);
          map.panTo(e.latlng);
        });

        window.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'UPDATE_LOCATION') {
            var newLatLng = [event.data.lat, event.data.lng];
            map.setView(newLatLng, 15, { animate: true });
            marker.setLatLng(newLatLng);
          }
        });
      </script>
    </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    return (
      <View style={[{ height, width: '100%', overflow: 'hidden', borderRadius: 16, position: 'relative' }, style]}>
        <iframe
          id="map-iframe"
          title="Map"
          srcDoc={leafletHtml}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
        />
        <TouchableOpacity style={styles.liveLocationBtn} onPress={handleLiveLocation}>
          {loadingLocation ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <View style={styles.liveLocationIconInner}><Text style={styles.iconText}>📍</Text></View>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.lat && data.lng && onLocationSelect) {
        onLocationSelect(data.lat, data.lng);
      }
    } catch (err) {
      console.warn('Error parsing WebView message:', err);
    }
  };

  return (
    <View style={[{ height, width: '100%', overflow: 'hidden', borderRadius: 16, position: 'relative' }, style]}>
      <WebView
        ref={webViewRef}
        source={{ html: leafletHtml }}
        style={StyleSheet.absoluteFillObject}
        scrollEnabled={false}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
      />
      <TouchableOpacity style={styles.liveLocationBtn} onPress={handleLiveLocation}>
        {loadingLocation ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View style={styles.liveLocationIconInner}><Text style={styles.iconText}>📍</Text></View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  liveLocationBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 44,
    height: 44,
    backgroundColor: '#3b82f6',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  liveLocationIconInner: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
  }
});

export default EmbeddedGoogleMap;

