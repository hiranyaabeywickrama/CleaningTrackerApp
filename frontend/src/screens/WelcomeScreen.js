import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Colors } from '../theme/colors';
import AppFooter from '../components/AppFooter';
import CustomButton from '../components/CustomButton';

const WelcomeScreen = ({ navigation }) => {
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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
  }
});

export default WelcomeScreen;
