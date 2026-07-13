import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, TextInput, Alert, useWindowDimensions } from 'react-native';
import backScrollEmitter from '../utils/backScrollEmitter';
import { User, HardHat, Briefcase } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import AppFooter from '../components/AppFooter';
import { CURRENT_BASE_URL, setDynamicBaseUrl, getConfiguredProductionUrl, isStandaloneApp } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WelcomeScreen = ({ navigation }) => {
  const [showConfig, setShowConfig] = useState(false);
  const [inputUrl, setInputUrl] = useState(CURRENT_BASE_URL);
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;
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

  const handleResetConfig = async () => {
    try {
      await AsyncStorage.removeItem('custom_backend_url');
      const defaultUrl = getConfiguredProductionUrl();
      setDynamicBaseUrl(defaultUrl);
      setInputUrl(defaultUrl);
      setShowConfig(false);
      Alert.alert('Configuration Reset', 'Backend URL reset to the live cloud server.');
    } catch (e) {
      Alert.alert('Reset Failed', e.message);
    }
  };

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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
              placeholder="https://cleaningtrackerapp-production-1896.up.railway.app"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={handleResetConfig}>
                <Text style={styles.modalBtnTextCancel}>Reset Default</Text>
              </TouchableOpacity>
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

      {/* Brand Logo */}
      <Image
        source={require('../assets/logo.png')}
        style={styles.logoImage}
        resizeMode="contain"
      />

      {/* Main Header Area */}
      <View style={styles.headerContainer}>
        <Text style={styles.preTitle}>THREE PORTALS</Text>
        <Text style={styles.mainTitle}>Pick Your Role</Text>
        <Text style={styles.subtext}>
          Each role gets a tailored dashboard with the exact tools they need — nothing more, nothing less.
        </Text>
      </View>

      {/* Cards Container */}
      <View style={[styles.cardsWrapper, isDesktop ? styles.rowLayout : styles.columnLayout]}>
        
        {/* Card 1: Client */}
        <View style={[styles.card, styles.clientBorder]}>
          <View style={styles.cardContent}>
            <View style={[styles.iconContainer, styles.clientIconBg]}>
              <View style={styles.glossyOverlaySmall} />
              <User color="#FFFFFF" size={24} />
            </View>
            <Text style={styles.roleTitle}>Client</Text>
            <TouchableOpacity
              style={[styles.joinButton, styles.clientButton]}
              onPress={() => navigation.navigate('Register', { role: 'client' })}
              activeOpacity={0.8}
            >
              <View style={styles.glossyOverlay} />
              <Text style={styles.joinButtonText}>Join as Client  ›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 2: Crew Member */}
        <View style={[styles.card, styles.workerBorder]}>
          <View style={styles.cardContent}>
            <View style={[styles.iconContainer, styles.workerIconBg]}>
              <View style={styles.glossyOverlaySmall} />
              <HardHat color="#FFFFFF" size={24} />
            </View>
            <Text style={styles.roleTitle}>Crew Member</Text>
            <TouchableOpacity
              style={[styles.joinButton, styles.workerButton]}
              onPress={() => navigation.navigate('Register', { role: 'worker' })}
              activeOpacity={0.8}
            >
              <View style={styles.glossyOverlay} />
              <Text style={styles.joinButtonText}>Join as Crew Member  ›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card 3: Contractor */}
        <View style={[styles.card, styles.contractorBorder]}>
          <View style={styles.cardContent}>
            <View style={[styles.iconContainer, styles.contractorIconBg]}>
              <View style={styles.glossyOverlaySmall} />
              <Briefcase color="#FFFFFF" size={24} />
            </View>
            <Text style={styles.roleTitle}>Contractor</Text>
            <TouchableOpacity
              style={[styles.joinButton, styles.contractorButton]}
              onPress={() => navigation.navigate('Register', { role: 'contractor' })}
              activeOpacity={0.8}
            >
              <View style={styles.glossyOverlay} />
              <Text style={styles.joinButtonText}>Join as Contractor  ›</Text>
            </TouchableOpacity>
          </View>
        </View>

      </View>

      {/* Developer Config Trigger */}
      <TouchableOpacity
        activeOpacity={0.7}
        onLongPress={() => {
          if (!isStandaloneApp()) setShowConfig(true);
        }}
        style={{ marginTop: 40, marginBottom: 20 }}
      >
        <Text style={styles.debugText}>
          Server: {CURRENT_BASE_URL}
          {isStandaloneApp() ? ' (cloud)' : ' (long press to change)'}
        </Text>
      </TouchableOpacity>

      <AppFooter navigation={navigation} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF', // Clean White background
    paddingVertical: 50,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoImage: {
    width: 180,
    height: 60,
    marginBottom: 20,
    alignSelf: 'center'
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
    maxWidth: 600,
    textAlign: 'center'
  },
  preTitle: {
    fontSize: 11,
    fontWeight: '950',
    color: '#0D9488', // Green/Teal accent
    letterSpacing: 1.5,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  mainTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0F172A', // Slate 900
    marginBottom: 12,
    letterSpacing: -0.5
  },
  subtext: {
    fontSize: 13.5,
    color: '#64748B', // Slate 500
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20
  },
  
  // Cards Layout
  cardsWrapper: {
    width: '100%',
    maxWidth: 960,
    gap: 20,
    justifyContent: 'center'
  },
  rowLayout: {
    flexDirection: 'row'
  },
  columnLayout: {
    flexDirection: 'column',
    alignItems: 'center'
  },
  
  // Card base styles
  card: {
    flex: 1,
    width: '100%',
    maxWidth: 300,
    backgroundColor: '#FFFFFF', // White card background!
    borderRadius: 20, // Rounded corners matching screenshot
    overflow: 'hidden',
    shadowColor: '#2563EB', // Glowing shiny blue shadow
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12, // Vibrant shadow
    shadowRadius: 20,
    elevation: 5,
    position: 'relative'
  },
  cardContent: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 220 // Explicit height so they remain identical
  },
  
  // Borders
  clientBorder: {
    borderColor: '#2563EB', // Brand Blue
    borderWidth: 1.5
  },
  workerBorder: {
    borderColor: '#2563EB', // Brand Blue
    borderWidth: 1.5
  },
  contractorBorder: {
    borderColor: '#2563EB', // Brand Blue
    borderWidth: 1.5
  },
  
  // Icon containers
  iconContainer: {
    width: 54,
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  clientIconBg: {
    backgroundColor: '#2563EB'
  },
  workerIconBg: {
    backgroundColor: '#2563EB'
  },
  contractorIconBg: {
    backgroundColor: '#2563EB'
  },
  
  // Title
  roleTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A', // Slate 900
    marginBottom: 16
  },
  
  // Buttons
  joinButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800'
  },
  clientButton: {
    backgroundColor: '#047857'
  },
  workerButton: {
    backgroundColor: '#047857'
  },
  contractorButton: {
    backgroundColor: '#047857'
  },
  glossyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10
  },
  glossyOverlaySmall: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12
  },
  
  // Config Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
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
    backgroundColor: Colors.primary
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
  },
  debugText: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    fontWeight: '700'
  }
});

export default WelcomeScreen;
