import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, Alert } from 'react-native';
import { Colors } from '../theme/colors';
import AppFooter from '../components/AppFooter';
import CustomButton from '../components/CustomButton';
import { CURRENT_BASE_URL, setDynamicBaseUrl } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WelcomeScreen = ({ navigation }) => {
  const [showConfig, setShowConfig] = useState(false);
  const [inputUrl, setInputUrl] = useState(CURRENT_BASE_URL);

  const handleSaveConfig = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('Error', 'Backend URL cannot be empty.');
      return;
    }
    try {
      const formattedUrl = inputUrl.trim().replace(/\/$/, ''); // Remove trailing slash
      await AsyncStorage.setItem('custom_backend_url', formattedUrl);
      setDynamicBaseUrl(formattedUrl);
      setShowConfig(false);
      Alert.alert('Configuration Saved 🚀', `Backend connection URL has been updated to:\n\n${formattedUrl}`);
    } catch (e) {
      Alert.alert('Save Failed', e.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Developer Server Configuration Modal */}
      <Modal
        visible={showConfig}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowConfig(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔧 Developer Server Config</Text>
            <Text style={styles.modalSubtitle}>Configure the local or production backend URL for testing shifts.</Text>
            
            <TextInput
              style={styles.modalInput}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="http://10.130.45.181:5000"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setShowConfig(false)}>
                <Text style={styles.modalBtnTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveConfig}>
                <Text style={styles.modalBtnTextSave}>Save & Connect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Decorative green & blue gradient blobs for visual interest */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.brandingBox}>
        {/* Compact, Balanced Brand Logo */}
        <Image
          source={require('../assets/logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.subtext}>Workforce dispatch, live GPS tracking, and payout operations.</Text>
      </View>

      {/* Modern Card Layout */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Workforce Operations Simplified</Text>
        <Text style={styles.cardSubtitle}>
          Connect contractors, manage shift rotas, and verify GPS clock-ins on a unified SaaS platform.
        </Text>
        
        <View style={styles.buttonCol}>
          <CustomButton
            title="Create Free Account"
            type="primary" // Green SaaS
            onPress={() => navigation.navigate('Register')}
            style={styles.actionBtn}
          />

          <CustomButton
            title="Sign In to Portal"
            type="outline" // Blue Outline SaaS
            onPress={() => navigation.navigate('Login')}
            style={styles.actionBtn}
          />
        </View>

        <Text style={styles.actionFooter}>Enterprise-grade security and automated GPS geofencing built-in.</Text>
      </View>

      <TouchableOpacity activeOpacity={0.7} onLongPress={() => setShowConfig(true)}>
        <Text style={styles.debugText}>Server Backend Connection: {CURRENT_BASE_URL} (Long press to config)</Text>
      </TouchableOpacity>

      <AppFooter navigation={navigation} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F8FAFC', // Slate 50 background
    padding: 20,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden'
  },
  glowTop: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(37, 99, 235, 0.05)', // SaaS Blue soft glow
    zIndex: -1
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(16, 185, 129, 0.04)', // SaaS Green soft glow
    zIndex: -1
  },
  brandingBox: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 20
  },
  logoImage: {
    width: 280,
    height: 120,
    marginBottom: 16
  },
  subtext: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 15
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 20
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center'
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '550',
    marginBottom: 22,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8
  },
  buttonCol: {
    width: '100%',
    gap: 12,
    marginBottom: 16
  },
  actionBtn: {
    height: 46
  },
  actionFooter: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '600',
    letterSpacing: 0.1,
    textAlign: 'center'
  },
  debugText: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
    fontWeight: '700'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)', // Muted glassmorphism overlay
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 16,
    marginBottom: 16
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: 'rgba(30, 58, 138, 0.25)',
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: '#1E293B',
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 18
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end'
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBtnCancel: {
    backgroundColor: '#F1F5F9'
  },
  modalBtnSave: {
    backgroundColor: Colors.primary // Green
  },
  modalBtnTextCancel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700'
  },
  modalBtnTextSave: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800'
  }
});

export default WelcomeScreen;
