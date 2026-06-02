import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextInput,
  Animated,
  Image
} from 'react-native';
import { Colors } from '../theme/colors';
import { authAPI } from '../api/client';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import AppFooter from '../components/AppFooter';

// ── Role options for registration (no Admin public registration) ────────────────
const ROLES = [
  { id: 'worker',     label: 'Cleaning Crew',     icon: '🧹',  desc: 'Clock in shifts & execute jobs' },
  { id: 'contractor', label: 'Contractor', icon: '🏢',  desc: 'Manage sites & dispatch crews' }
];

const RegisterScreen = ({ navigation }) => {
  const [selectedRole, setSelectedRole] = useState('worker');

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [companyName, setCompanyName] = useState('');

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Fade animation for role switching transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const fadeTransition = (cb) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false
    }).start(() => {
      cb();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false
      }).start();
    });
  };

  // Validate form details
  const validateForm = () => {
    let valid = true;
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Full Name is required';
      valid = false;
    }

    if (!email) {
      newErrors.email = 'Email address is required';
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
      valid = false;
    }

    const cleanPhone = String(phoneNumber).replace(/[\s\-().]/g, '');
    if (!phoneNumber) {
      newErrors.phoneNumber = 'Phone Number is required';
      valid = false;
    } else if (cleanPhone.length < 9 || cleanPhone.length > 15) {
      newErrors.phoneNumber = 'Enter a valid phone number (9–15 digits)';
      valid = false;
    }

    if (selectedRole === 'contractor' && !companyName.trim()) {
      newErrors.companyName = 'Company Name is required for contractors';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  // ── Submit Details & Request OTP ──────────────────────────────────────────
  const handleRequestOtp = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const trimmedEmail = email.toLowerCase().trim();
      const res = await authAPI.requestOtp(
        trimmedEmail,
        selectedRole,
        name.trim(),
        phoneNumber.trim(),
        selectedRole === 'contractor' ? companyName.trim() : ''
      );
      setLoading(false);

      if (res.success) {
        if (Platform.OS === 'web') {
          alert(`Verification Dispatched ✉️\n\n${res.message || `We sent a 6-digit verification code to ${trimmedEmail}.`}`);
          navigation.navigate('Login', {
            registerFlow: true,
            email: trimmedEmail,
            role: selectedRole,
            name: name.trim(),
            phoneNumber: phoneNumber.trim(),
            companyName: selectedRole === 'contractor' ? companyName.trim() : ''
          });
        } else {
          Alert.alert(
            'Verification Dispatched ✉️',
            res.message || `We sent a 6-digit verification code to ${trimmedEmail}.`,
            [
              {
                text: 'Enter Verification Code',
                onPress: () => {
                  navigation.navigate('Login', {
                    registerFlow: true,
                    email: trimmedEmail,
                    role: selectedRole,
                    name: name.trim(),
                    phoneNumber: phoneNumber.trim(),
                    companyName: selectedRole === 'contractor' ? companyName.trim() : ''
                  });
                }
              }
            ]
          );
        }
      } else {
        Alert.alert('Request Failed', res.message || 'Something went wrong');
      }
    } catch (err) {
      setLoading(false);
      const msg = err.response?.data?.message;
      let title = 'Error';
      if (err.response?.status === 503) {
        title = msg && /resend test mode/i.test(msg) ? 'Cannot Send to This Email' : 'Email Not Configured';
      }
      Alert.alert(title, msg || 'Could not reach the server. Is the backend running?');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Decorative blobs */}
      <View style={styles.blobTopRight} />
      <View style={styles.blobBottomLeft} />

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.navigate('Welcome')}>
          <Text style={styles.backLinkText}>← Back to Welcome</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          {/* Direct Balanced Logo Image */}
          <Image
            source={require('../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.cardTitle}>Create Account</Text>
          <Text style={styles.cardSubtitle}>Get started with a free worker or contractor account</Text>

          <Animated.View style={[styles.formArea, { opacity: fadeAnim }]}>
            {/* Role Card Selectors */}
            <View style={styles.roleLabelContainer}>
              <Text style={styles.fieldLabel}>
                Registration Role <Text style={styles.required}>*</Text>
              </Text>
            </View>
            <View style={styles.roleRow}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.roleCard, selectedRole === r.id && styles.roleCardActive]}
                  onPress={() => fadeTransition(() => { setSelectedRole(r.id); setErrors({}); })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.roleIcon}>{r.icon}</Text>
                  <Text style={[styles.roleLabel, selectedRole === r.id && styles.roleLabelActive]}>
                    {r.label}
                  </Text>
                  <Text style={[styles.roleDesc, selectedRole === r.id && styles.roleDescActive]}>
                    {r.desc}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.divider} />

            {/* General warning details */}
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                ⚡ **Passwordless OTP Security**: No password needed. We will dispatch a 6-digit code to secure your login shifts.
              </Text>
            </View>

            {/* Full Name */}
            <CustomInput
              label="Full Name"
              value={name}
              onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: '' })); }}
              placeholder="John Doe"
              icon="👤"
              error={errors.name}
              required
            />

            {/* Email Address */}
            <CustomInput
              label="Email Address"
              value={email}
              onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: '' })); }}
              placeholder="your.email@example.com"
              icon="✉️"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
              required
            />

            {/* Phone Number */}
            <CustomInput
              label="Phone Number"
              value={phoneNumber}
              onChangeText={(v) => { setPhoneNumber(v); setErrors((e) => ({ ...e, phoneNumber: '' })); }}
              placeholder="+94 77 123 4567"
              icon="📞"
              keyboardType="phone-pad"
              error={errors.phoneNumber}
              required
            />

            {/* Company Name (only if Contractor) */}
            {selectedRole === 'contractor' && (
              <CustomInput
                label="Company Name"
                value={companyName}
                onChangeText={(v) => { setCompanyName(v); setErrors((e) => ({ ...e, companyName: '' })); }}
                placeholder="Cleaners Ltd."
                icon="🏢"
                error={errors.companyName}
                required
              />
            )}

            {/* Request OTP Button */}
            <CustomButton
              title={loading ? "⏳ Setting Up Portal..." : "✉️ Request Verification OTP"}
              type="primary" // Green SaaS
              onPress={handleRequestOtp}
              disabled={loading}
              style={styles.actionBtn}
            />
          </Animated.View>

          {/* Footer Navigation */}
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>

        <AppFooter navigation={navigation} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC' // Clean SaaS Slate Background
  },
  blobTopRight: {
    position: 'absolute', top: -80, right: -80,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(37, 99, 235, 0.03)', zIndex: 0 // Blue soft glow
  },
  blobBottomLeft: {
    position: 'absolute', bottom: 100, left: -100,
    width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(16, 185, 129, 0.03)', zIndex: 0 // Green soft glow
  },
  scrollContainer: {
    flexGrow: 1, justifyContent: 'center', padding: 20, zIndex: 1
  },
  backLink: {
    paddingVertical: 10, marginBottom: 12, alignSelf: 'flex-start'
  },
  backLinkText: {
    color: Colors.secondary, fontWeight: '750', fontSize: 13
  },

  // ── Card ────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 4,
    alignItems: 'center',
    marginBottom: 16
  },
  logoImage: {
    width: 220,
    height: 90,
    marginBottom: 16
  },
  cardTitle: {
    fontSize: 22, fontWeight: '800', color: '#0F172A',
    marginBottom: 4, letterSpacing: 0.2
  },
  cardSubtitle: {
    fontSize: 12, color: '#64748B', fontWeight: '550',
    marginBottom: 20, textAlign: 'center'
  },
  formArea: { width: '100%' },

  // ── Role selector ────────────────────────────────────────────────────────────
  roleLabelContainer: { width: '100%', marginBottom: 6 },
  roleRow: {
    flexDirection: 'row', gap: 10, width: '100%', marginBottom: 6
  },
  roleCard: {
    flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: 10, borderWidth: 1.2, borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC'
  },
  roleCardActive: {
    borderColor: Colors.primary, // Active SaaS Green
    backgroundColor: 'rgba(16, 185, 129, 0.02)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1
  },
  roleIcon: { fontSize: 20, marginBottom: 4 },
  roleLabel: {
    fontSize: 12, fontWeight: '800', color: '#64748B', marginBottom: 2
  },
  roleLabelActive: { color: Colors.primary },
  roleDesc: { fontSize: 9, color: '#94A3B8', fontWeight: '600', textAlign: 'center', lineHeight: 12 },
  roleDescActive: { color: '#059669' },

  divider: {
    height: 1, width: '100%',
    backgroundColor: '#F1F5F9', marginVertical: 16
  },

  // ── Warnings / Banners ──────────────────────────────────────────────────────
  warningBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 10, padding: 10, marginBottom: 16, width: '100%'
  },
  warningText: { fontSize: 11, color: '#059669', fontWeight: '600', lineHeight: 15 },

  // ── Action button ─────────────────────────────────────────────────────────────
  actionBtn: {
    height: 46,
    marginTop: 10,
    marginBottom: 14
  },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footerRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 6
  },
  footerLabel: { color: '#64748B', fontSize: 12.5, fontWeight: '600' },
  loginLink: { color: Colors.primary, fontSize: 12.5, fontWeight: '800' }
});

export default RegisterScreen;
