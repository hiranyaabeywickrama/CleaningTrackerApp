import React, { useState, useEffect, useRef } from 'react';
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
import AppFooter from '../components/AppFooter';
import CustomButton from '../components/CustomButton';
import CustomInput from '../components/CustomInput';

// ── OTP input component (6 individual boxes) ──────────────────────────────────
const OtpBoxes = ({ value, onChange }) => {
  const inputRef = useRef(null);
  const digits = value.split('');

  return (
    <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()} style={styles.otpWrapper}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.otpBox,
            digits[i] ? styles.otpBoxFilled : null,
            value.length === i ? styles.otpBoxActive : null
          ]}
        >
          <Text style={styles.otpDigit}>{digits[i] || ''}</Text>
        </View>
      ))}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        style={styles.otpHiddenInput}
        caretHidden
      />
    </TouchableOpacity>
  );
};

// ── Main LoginScreen ───────────────────────────────────────────────────────────
const LoginScreen = ({ onLoginSuccess, navigation, route }) => {
  const [selectedRole, setSelectedRole] = useState('worker');

  // Admin fields
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP flow fields (Worker / Contractor)
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState(1); // 1 = enter email, 2 = enter OTP
  const [timer, setTimer] = useState(300);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const params = route?.params;

  // Listen to navigation parameters to auto-trigger step 2 for registration flow!
  useEffect(() => {
    if (params && params.registerFlow) {
      setSelectedRole(params.role);
      setOtpEmail(params.email);
      setOtpStep(2);
      setTimer(300);
      setResendCooldown(60);
      setOtpCode('');
    }
  }, [params]);

  // Fade animation for step transitions
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

  // OTP countdown
  useEffect(() => {
    let interval = null;
    if (otpStep === 2 && timer > 0) {
      interval = setInterval(() => setTimer((t) => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [otpStep, timer]);

  // Resend cooldown
  useEffect(() => {
    let interval = null;
    if (resendCooldown > 0) {
      interval = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const formatTimer = () => {
    const m = Math.floor(timer / 60);
    const s = timer % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ── Admin login ────────────────────────────────────────────────────────────
  const handleAdminLogin = async () => {
    const newErrors = {};
    if (!adminEmail) newErrors.adminEmail = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(adminEmail)) newErrors.adminEmail = 'Enter a valid email';
    if (!adminPassword) newErrors.adminPassword = 'Password is required';
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setLoading(true);
    try {
      const res = await authAPI.login(adminEmail, adminPassword);
      setLoading(false);
      if (res.success) {
        onLoginSuccess(res.user, res.token);
      } else {
        Alert.alert('Login Failed', res.message || 'Invalid credentials');
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.response?.data?.message || 'Network error');
    }
  };

  // ── OTP: step 1 — request code ─────────────────────────────────────────────
  const handleRequestOtp = async () => {
    const newErrors = {};
    if (!otpEmail) newErrors.otpEmail = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(otpEmail)) newErrors.otpEmail = 'Enter a valid email';
    setErrors(newErrors);
    if (Object.keys(newErrors).length) return;

    setLoading(true);
    try {
      const res = await authAPI.requestOtp(
        otpEmail.toLowerCase().trim(),
        selectedRole,
        // If we are in register flow, pass the registration details for resending!
        params && params.registerFlow ? params.name : '',
        params && params.registerFlow ? params.phoneNumber : '',
        params && params.registerFlow ? params.companyName : ''
      );
      setLoading(false);
      if (res.success) {
        if (res.devOtpCode) {
          if (Platform.OS === 'web') {
            alert(`Development Mode 🔑\n\nEmail sandbox/delivery bypassed. We generated a verification code for testing:\n\n👉  ${res.devOtpCode}  👈\n\n(It has also been printed in your server terminal!)`);
            setOtpCode(res.devOtpCode);
          } else {
            Alert.alert(
              'Development Mode 🔑',
              `Email sandbox/delivery bypassed. We generated a verification code for testing:\n\n👉  ${res.devOtpCode}  👈\n\n(It has also been printed in your server terminal!)`,
              [{ text: 'Use Code', onPress: () => setOtpCode(res.devOtpCode) }]
            );
          }
        } else {
          Alert.alert('Check Your Email', res.message || `We sent a 6-digit code to ${otpEmail}.`);
        }

        fadeTransition(() => {
          setOtpStep(2);
          setTimer(300);
          setResendCooldown(60);
          if (res.devOtpCode) {
            setOtpCode(res.devOtpCode);
          } else {
            setOtpCode('');
          }
        });
      } else {
        Alert.alert('Request Failed', res.message || 'Something went wrong');
      }
    } catch (err) {
      setLoading(false);
      console.warn('OTP request error:', err.response?.data || err.message);
      const msg = err.response?.data?.message || 'Could not reach the server. Is the backend running?';
      
      if (err.response?.status === 404) {
        setErrors({ otpEmail: msg });
      } else {
        let title = 'Error';
        if (err.response?.status === 503) {
          title = msg && /resend test mode/i.test(msg) ? 'Cannot Send to This Email' : 'Email Not Configured';
        }
        Alert.alert(title, msg);
      }
    }
  };

  // ── OTP: step 2 — verify code ──────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    try {
      const res = await authAPI.verifyOtp(
        otpEmail.toLowerCase().trim(),
        otpCode,
        selectedRole,
        // If we came from the register flow, pass the registration details!
        params && params.registerFlow ? params.name : '',
        params && params.registerFlow ? params.phoneNumber : '',
        params && params.registerFlow ? params.companyName : ''
      );
      setLoading(false);
      if (res.success) {
        onLoginSuccess(res.user, res.token);
      } else {
        Alert.alert('Verification Failed', res.message || 'Invalid code');
      }
    } catch (err) {
      setLoading(false);
      Alert.alert('Error', err.response?.data?.message || 'Verification error');
    }
  };

  const isOtpRole = selectedRole === 'worker' || selectedRole === 'contractor';

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
          {/* Direct Compact Brand Logo Image */}
          <Image
            source={require('../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.cardTitle}>Sign In</Text>
          <Text style={styles.cardSubtitle}>Access your CrewLynk account station</Text>

          <Animated.View style={[styles.formArea, { opacity: fadeAnim }]}>

            {/* ── ADMIN FORM ──────────────────────────────────────────── */}
            {selectedRole === 'admin' && (
              <>
                <View style={styles.infoBanner}>
                  <Text style={styles.infoText}>🛡️ Admin Secure Access — password required.</Text>
                </View>

                <CustomInput
                  label="Email Address"
                  value={adminEmail}
                  onChangeText={(v) => {
                    setAdminEmail(v);
                    setErrors((e) => ({ ...e, adminEmail: '' }));
                    const val = v.toLowerCase().trim();
                    if (val !== 'admincrewlynk@gmail.com') {
                      setSelectedRole('worker');
                      setOtpEmail(v);
                      fadeTransition(() => {});
                    }
                  }}
                  placeholder="admincrewlynk@gmail.com"
                  icon="✉️"
                  error={errors.adminEmail}
                  required
                />

                <CustomInput
                  label="Password"
                  value={adminPassword}
                  onChangeText={(v) => { setAdminPassword(v); setErrors((e) => ({ ...e, adminPassword: '' })); }}
                  placeholder="Enter admin password"
                  icon="🔒"
                  secureTextEntry
                  error={errors.adminPassword}
                  required
                />

                <TouchableOpacity
                  style={styles.forgotLinkContainer}
                  onPress={() => navigation.navigate('ForgotPassword')}
                >
                  <Text style={styles.forgotLink}>Forgot Password?</Text>
                </TouchableOpacity>

                <CustomButton
                  title={loading ? "⏳ Authenticating..." : "🛡️ Admin Sign In"}
                  type="secondary" // Blue SaaS
                  onPress={handleAdminLogin}
                  disabled={loading}
                  style={styles.actionBtn}
                />
              </>
            )}

            {/* ── OTP FLOW (Worker / Contractor) ──────────────────────── */}
            {isOtpRole && otpStep === 1 && (
              <>
                <View style={styles.infoBanner}>
                  <Text style={styles.infoText}>
                    ✉️ Enter your email — we'll dispatch a 6-digit verification code.
                  </Text>
                </View>

                <CustomInput
                  label="Email Address"
                  value={otpEmail}
                  onChangeText={(v) => {
                    const val = v.toLowerCase().trim();
                    if (val === 'admincrewlynk@gmail.com') {
                      setSelectedRole('admin');
                      setAdminEmail('admincrewlynk@gmail.com');
                      setErrors({});
                      setOtpEmail('');
                      fadeTransition(() => {});
                    } else {
                      setOtpEmail(v);
                      setErrors((e) => ({ ...e, otpEmail: '' }));
                    }
                  }}
                  placeholder="your.email@example.com"
                  icon="✉️"
                  error={errors.otpEmail}
                  required
                />

                <CustomButton
                  title={loading ? "⏳ Dispatching Code..." : "✉️ Send Verification Code"}
                  type="primary" // Green SaaS
                  onPress={handleRequestOtp}
                  disabled={loading}
                  style={styles.actionBtn}
                />
              </>
            )}

            {isOtpRole && otpStep === 2 && (
              <>
                {/* Sent-to banner */}
                <View style={styles.sentBanner}>
                  <Text style={styles.sentBannerText}>
                    📬 Code dispatched to <Text style={styles.sentBannerEmail}>{otpEmail}</Text>
                  </Text>
                </View>

                {/* 6-box OTP input */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Verification Code <Text style={styles.required}>*</Text></Text>
                  <OtpBoxes value={otpCode} onChange={setOtpCode} />
                </View>

                {/* Timer */}
                {timer > 0 ? (
                  <Text style={styles.timerText}>
                    Code expires in: <Text style={styles.timerCountdown}>{formatTimer()}</Text>
                  </Text>
                ) : (
                  <Text style={styles.expiryText}>⚠ Code expired. Please request a new one.</Text>
                )}

                <CustomButton
                  title={
                    loading
                      ? '⏳ Verifying...'
                      : params && params.registerFlow
                      ? selectedRole === 'contractor'
                        ? '✅ Verify & Register Contractor'
                        : '✅ Verify & Register Worker'
                      : '✅ Verify & Sign In'
                  }
                  type="primary" // Green SaaS
                  onPress={handleVerifyOtp}
                  disabled={loading || timer === 0}
                  style={styles.actionBtn}
                />

                {/* Resend + change email */}
                <View style={styles.resendRow}>
                  <TouchableOpacity
                    disabled={resendCooldown > 0 || loading}
                    onPress={() => {
                      setResendCooldown(0);
                      handleRequestOtp();
                    }}
                  >
                    <Text style={[styles.resendLink, resendCooldown > 0 && styles.resendLinkDisabled]}>
                      {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : '🔄 Resend Code'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.changeEmailBtn}
                  onPress={() => {
                    if (params && params.registerFlow) {
                      navigation.navigate('Register');
                    } else {
                      fadeTransition(() => { setOtpStep(1); setOtpCode(''); });
                    }
                  }}
                >
                  <Text style={styles.changeEmailText}>
                    {params && params.registerFlow ? '← Edit registration details' : '← Change email address'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>

          {/* Footer links */}
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>Create Account</Text>
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

  // ── Info banners ─────────────────────────────────────────────────────────────
  infoBanner: {
    backgroundColor: 'rgba(37, 99, 235, 0.04)', borderWidth: 1, borderColor: 'rgba(37, 99, 235, 0.12)',
    borderRadius: 10, padding: 10, marginBottom: 16, width: '100%'
  },
  infoText: { fontSize: 11.5, color: Colors.secondary, fontWeight: '600', lineHeight: 16 },

  sentBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.04)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 10, padding: 10, marginBottom: 16, width: '100%', alignItems: 'center'
  },
  sentBannerText: { fontSize: 11.5, color: '#059669', fontWeight: '600' },
  sentBannerEmail: { fontWeight: '800', color: '#047857' },

  // ── Form fields ──────────────────────────────────────────────────────────────
  fieldGroup: { width: '100%', marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6 },
  required: { color: Colors.danger },
  forgotLinkContainer: { alignSelf: 'flex-end', marginBottom: 18, marginTop: -4 },
  forgotLink: { color: Colors.secondary, fontSize: 12.5, fontWeight: '750' },

  // ── 6-box OTP input ──────────────────────────────────────────────────────────
  otpWrapper: {
    flexDirection: 'row', gap: 8, justifyContent: 'center',
    marginBottom: 4, position: 'relative'
  },
  otpBox: {
    width: 44, height: 50, borderRadius: 10,
    borderWidth: 1.2, borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    justifyContent: 'center', alignItems: 'center'
  },
  otpBoxFilled: {
    borderColor: Colors.primary, backgroundColor: 'rgba(16, 185, 129, 0.03)'
  },
  otpBoxActive: {
    borderColor: Colors.primary, borderWidth: 1.5,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15, shadowRadius: 3
  },
  otpDigit: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  otpHiddenInput: {
    position: 'absolute', opacity: 0, width: 1, height: 1
  },

  // ── Timer ─────────────────────────────────────────────────────────────────────
  timerText: {
    fontSize: 12, color: '#475569', fontWeight: '600',
    textAlign: 'center', marginBottom: 14
  },
  timerCountdown: { color: Colors.danger, fontWeight: '800' },
  expiryText: {
    fontSize: 12, color: Colors.danger, fontWeight: '700',
    textAlign: 'center', marginBottom: 14
  },

  actionBtn: {
    height: 46,
    marginBottom: 14
  },

  // ── Resend / change email ─────────────────────────────────────────────────────
  resendRow: { alignItems: 'center', marginBottom: 8 },
  resendLink: { color: Colors.secondary, fontWeight: '750', fontSize: 12.5 },
  resendLinkDisabled: { color: '#94A3B8' },
  changeEmailBtn: { paddingVertical: 8, alignItems: 'center', marginBottom: 4 },
  changeEmailText: { color: '#64748B', fontWeight: '700', fontSize: 12 },

  // ── Footer ────────────────────────────────────────────────────────────────────
  footerRow: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 6
  },
  footerLabel: { color: '#64748B', fontSize: 12.5, fontWeight: '600' },
  registerLink: { color: Colors.primary, fontSize: 12.5, fontWeight: '800' }
});

export default LoginScreen;
