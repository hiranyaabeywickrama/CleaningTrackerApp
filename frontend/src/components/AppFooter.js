import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  Image
} from 'react-native';
import { Colors } from '../theme/colors';

const AppFooter = ({ navigation }) => {
  const handleLink = (url) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Unable to open link', url)
    );
  };

  const goToLogin = (role) => {
    if (navigation) {
      navigation.navigate('Login', { role });
    }
  };

  return (
    <View style={styles.footer}>
      {/* Sleek Green Accent Line */}
      <View style={styles.topGlowLine} />

      <View style={styles.grid}>
        {/* Brand Information Column */}
        <View style={styles.brandCol}>
          <Text style={styles.brandName}>CleanTrack</Text>
          <Text style={styles.brandDesc}>
            Premium workforce management. Track GPS shifts, dispatch cleaning jobs, and streamline contractor ops.
          </Text>
          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialBtn} onPress={() => handleLink('https://facebook.com')}>
              <Text style={styles.socialIcon}>f</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn} onPress={() => handleLink('mailto:support@cleantrack.com')}>
              <Text style={styles.socialIcon}>✉</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn} onPress={() => handleLink('https://wa.me/94775955996')}>
              <Text style={styles.socialIcon}>w</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Links Column 1: Navigation */}
        <View style={styles.col}>
          <Text style={styles.colTitle}>Sign In</Text>
          <TouchableOpacity onPress={() => goToLogin('admin')} activeOpacity={0.7}>
            <Text style={styles.link}>Admin Station</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => goToLogin('worker')} activeOpacity={0.7}>
            <Text style={styles.link}>Worker Portal</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => goToLogin('contractor')} activeOpacity={0.7}>
            <Text style={styles.link}>Contractor Portal</Text>
          </TouchableOpacity>
        </View>

        {/* Links Column 2: Platform Features */}
        <View style={styles.col}>
          <Text style={styles.colTitle}>Features</Text>
          <Text style={styles.passiveLink}>Real-time GPS</Text>
          <Text style={styles.passiveLink}>Smart Dispatch</Text>
          <Text style={styles.passiveLink}>Shift Reports</Text>
          <Text style={styles.passiveLink}>Geofencing</Text>
        </View>

        {/* Links Column 3: Support */}
        <View style={styles.col}>
          <Text style={styles.colTitle}>Support</Text>
          <Text style={styles.passiveLink}>Ops Help Center</Text>
          <Text style={styles.passiveLink}>24/7 Dedicated</Text>
          <TouchableOpacity onPress={() => handleLink('mailto:support@cleantrack.com')} activeOpacity={0.7}>
            <Text style={styles.supportEmailLink}>support@cleantrack.com</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />

      <Text style={styles.copyright}>
        © 2026 CleanTrack (CrewLynk) Platform. All rights reserved.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    backgroundColor: '#0F172A', // Slate 900
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 20,
    marginTop: 'auto',
    position: 'relative',
    borderTopWidth: 1,
    borderTopColor: 'rgba(16, 185, 129, 0.08)' // Green border
  },
  topGlowLine: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: Colors.primary, // SaaS Green Line
    opacity: 0.4
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12
  },
  brandCol: {
    width: '100%',
    marginBottom: 6,
    ...Platform.select({
      web: {
        width: '32%',
        marginBottom: 0
      }
    })
  },
  col: {
    width: '46%',
    marginBottom: 4,
    ...Platform.select({
      web: {
        width: '18%',
        marginBottom: 0
      }
    })
  },
  brandName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 6
  },
  brandDesc: {
    color: '#64748B',
    fontSize: 9.5,
    lineHeight: 13,
    marginBottom: 6,
    maxWidth: 260
  },
  socialRow: {
    flexDirection: 'row',
    gap: 6
  },
  socialBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: 'rgba(4, 120, 87, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(4, 120, 87, 0.25)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  socialIcon: {
    color: Colors.primary, // Green
    fontSize: 9,
    fontWeight: '700'
  },
  colTitle: {
    color: Colors.primary, // Green titles as accent elements
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  link: {
    color: '#94A3B8',
    fontSize: 10,
    marginBottom: 3,
    fontWeight: '600'
  },
  passiveLink: {
    color: '#64748B',
    fontSize: 10,
    marginBottom: 3,
    fontWeight: '550'
  },
  supportEmailLink: {
    color: Colors.primary, // Green support link
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textDecorationLine: 'underline'
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    marginTop: 10,
    marginBottom: 6
  },
  copyright: {
    color: '#64748B',
    fontSize: 9,
    textAlign: 'center',
    fontWeight: '600'
  }
});

export default AppFooter;
