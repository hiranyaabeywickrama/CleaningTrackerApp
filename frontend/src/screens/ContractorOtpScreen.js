import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, Image, BackHandler, RefreshControl } from 'react-native';
import { Colors } from '../theme/colors';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import { authAPI } from '../api/client';
import AppFooter from '../components/AppFooter';

const ContractorOtpScreen = ({ onLoginSuccess, navigation }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState('+94');
  const [companyName, setCompanyName] = useState('');
  const [isRegister, setIsRegister] = useState(false); // Toggle between Sign In & Register

  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState(1); // 1: Enter details/Email, 2: Enter OTP
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timer, setTimer] = useState(300); // 10 minutes countdown
  const [resendCooldown, setResendCooldown] = useState(0);
  const [errors, setErrors] = useState({});

  const handleRefresh = () => {
    setRefreshing(true);
    setEmail('');
    setName('');
    setPhoneNumber('');
    setCountryCode('+94');
    setCompanyName('');
    setOtpCode('');
    setStep(1);
    setErrors({});
    setTimer(300);
    setResendCooldown(0);
    setRefreshing(false);
  };

  // Countdown timer effect
  useEffect(() => {
    let interval = null;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  // Resend cooldown timer effect
  useEffect(() => {
    let interval = null;
    if (resendCooldown > 0) {
      interval = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Handle hardware back press (Android)
  useEffect(() => {
    const backAction = () => {
      if (step === 2) {
        setStep(1);
        setOtpCode('');
        return true; // prevent default behavior
      }
      return false; // run default behavior
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [step]);

  const validateStep1 = () => {
    let valid = true;
    let newErrors = {};

    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!email) {
      newErrors.email = 'Email address is required';
      valid = false;
    } else if (!emailRegex.test(email)) {
      newErrors.email = 'Please enter a valid email format';
      valid = false;
    }

    if (isRegister) {
      if (!name.trim()) {
        newErrors.name = 'Full Name is required';
        valid = false;
      }
      if (!companyName.trim()) {
        newErrors.companyName = 'Company Name is required';
        valid = false;
      }

      const fullPhoneNumber = `${countryCode}${phoneNumber.trim().replace(/^0/, '')}`;
      const cleanPhone = fullPhoneNumber.replace(/[\s\-().+]/g, '');
      if (!phoneNumber) {
        newErrors.phoneNumber = 'Phone Number is required';
        valid = false;
      } else if (cleanPhone.length < 9 || cleanPhone.length > 15) {
        newErrors.phoneNumber = 'Enter a valid phone number (9–15 digits)';
        valid = false;
      }
    }

    setErrors(newErrors);
    return valid;
  };

  const handleRequestOtp = async () => {
    if (!validateStep1()) return;

    setLoading(true);
    const fullPhoneNumber = `${countryCode}${phoneNumber.trim().replace(/^0/, '')}`;
    try {
      const res = await authAPI.contractorRequestOtp(
        email,
        isRegister ? name : '',
        isRegister ? fullPhoneNumber : '',
        isRegister ? companyName : ''
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
          Alert.alert('Verification Sent ✉️', res.message || 'Please check your email for the 6-digit OTP code.');
        }

        setStep(2);
        setTimer(300); // Reset countdown to 10 mins
        setResendCooldown(60); // 1-minute resend cooldown
        if (res.devOtpCode) {
          setOtpCode(res.devOtpCode);
        } else {
          setOtpCode('');
        }
      } else {
        Alert.alert('Request Failed', res.message || 'Something went wrong');
      }
    } catch (error) {
      setLoading(false);
      Alert.alert('Error', error.response?.data?.message || 'Network error occurred');
    }
  };

  const handleVerifyOtp = async () => {
    if (timer === 0) {
      Alert.alert('Timeout ⚠️', 'Verification code has expired. Please request a new one.');
      return;
    }
    if (!otpCode || otpCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    const fullPhoneNumber = `${countryCode}${phoneNumber.trim().replace(/^0/, '')}`;
    try {
      const res = await authAPI.contractorVerifyOtp(
        email,
        otpCode,
        isRegister ? name : '',
        isRegister ? fullPhoneNumber : '',
        isRegister ? companyName : ''
      );
      setLoading(false);

      if (res.success) {
        if (Platform.OS === 'web') {
          alert('Verification Successful ⚡\n\nWelcome back to the CrewLynk Ops Station!');
          onLoginSuccess(res.user, res.token);
        } else {
          Alert.alert('Verification Successful ⚡', 'Welcome back to the CrewLynk Ops Station!', [
            {
              text: 'Access Dashboard',
              onPress: () => {
                onLoginSuccess(res.user, res.token);
              }
            }
          ]);
        }
      } else {
        Alert.alert('Verification Failed', res.message || 'Invalid code');
      }
    } catch (error) {
      setLoading(false);
      Alert.alert('Error', error.response?.data?.message || 'Verification error occurred');
    }
  };

  const formatTimer = () => {
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
      }>
        <TouchableOpacity
          style={styles.backLink}
          onPress={() => {
            if (step === 2) {
              setStep(1);
              setOtpCode('');
            } else {
              navigation.goBack();
            }
          }}
        >
          <Text style={styles.backLinkText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          {/* Direct Balanced Logo Image */}
          <Image
            source={require('../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.cardTitle}>Contractor Access</Text>
          <Text style={styles.cardSubtitle}>
            {step === 1 
              ? 'Receive a secure verification code to access your dashboard'
              : `Enter the 6-digit code dispatched to ${email}`}
          </Text>

          {step === 1 ? (
            <>
              {/* Custom Toggle Bar between Sign In and Register */}
              <View style={styles.toggleBar}>
                <TouchableOpacity
                  style={[styles.toggleBtn, !isRegister && styles.toggleBtnActive]}
                  onPress={() => {
                    setIsRegister(false);
                    setErrors({});
                  }}
                >
                  <Text style={[styles.toggleBtnText, !isRegister && styles.toggleBtnTextActive]}>Sign In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, isRegister && styles.toggleBtnActive]}
                  onPress={() => {
                    setIsRegister(true);
                    setErrors({});
                  }}
                >
                  <Text style={[styles.toggleBtnText, isRegister && styles.toggleBtnTextActive]}>Register</Text>
                </TouchableOpacity>
              </View>

              {isRegister && (
                <>
                  <CustomInput
                    label="Full Name"
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter your full name"
                    icon="👤"
                    error={errors.name}
                    required
                  />

                  <CustomInput
                    label="Company Name"
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="Enter contractor company name"
                    icon="🏢"
                    error={errors.companyName}
                    required
                  />

                  <CustomInput
                    label="Phone Number"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="77 123 4567"
                    isPhoneInput={true}
                    countryCode={countryCode}
                    onCountryCodeChange={setCountryCode}
                    keyboardType="phone-pad"
                    error={errors.phoneNumber}
                    required
                  />
                </>
              )}

              <CustomInput
                label="Email Address"
                value={email}
                onChangeText={setEmail}
                placeholder="contractor.email@example.com"
                keyboardType="email-address"
                icon="✉️"
                error={errors.email}
                required
              />

              <CustomButton
                title={loading ? 'Sending Request...' : '✉️ Send Verification Code'}
                type="primary" // Green SaaS
                onPress={handleRequestOtp}
                disabled={loading}
                style={styles.actionBtn}
              />
            </>
          ) : (
            <>
              <CustomInput
                label="6-Digit Verification Code"
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                icon="🔐"
                editable={timer > 0}
                required
              />

              {timer > 0 ? (
                <Text style={styles.timerText}>
                  Code expires in: <Text style={{ color: Colors.danger, fontWeight: '750' }}>{formatTimer()}</Text>
                </Text>
              ) : (
                <Text style={styles.expiryText}>Code has expired. Please request a new one.</Text>
              )}

              <CustomButton
                title={loading ? 'Verifying...' : '✅ Verify & Access Account'}
                type="primary" // Green SaaS
                onPress={handleVerifyOtp}
                disabled={loading || timer === 0}
                style={styles.actionBtn}
              />

              <View style={styles.resendRow}>
                <TouchableOpacity
                  disabled={resendCooldown > 0 || loading}
                  onPress={handleRequestOtp}
                >
                  <Text style={[styles.resendLink, resendCooldown > 0 && styles.resendLinkDisabled]}>
                    {resendCooldown > 0 ? `Resend Code (${resendCooldown}s)` : '✉️ Resend Verification Code'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.resetStepBtn}
                onPress={() => setStep(1)}
              >
                <Text style={styles.resetStepBtnText}>← Change email / details</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <AppFooter navigation={navigation} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC' // Clean Slate Background
  },
  scrollContainer: {
    paddingBottom: 120,
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20
  },
  backLink: {
    paddingVertical: 10,
    marginBottom: 10,
    alignSelf: 'flex-start'
  },
  backLinkText: {
    color: Colors.secondary, // Blue SaaS
    fontWeight: '700',
    fontSize: 13
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
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
    fontSize: 22,
    fontWeight: '850',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: 0.2
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10
  },
  toggleBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    marginBottom: 18,
    width: '100%'
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6
  },
  toggleBtnActive: {
    backgroundColor: Colors.white,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '750',
    color: '#64748B'
  },
  toggleBtnTextActive: {
    color: Colors.secondary
  },
  actionBtn: {
    height: 46,
    marginTop: 10,
    marginBottom: 14
  },
  timerText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '650',
    alignSelf: 'flex-start',
    marginTop: -4,
    marginBottom: 12
  },
  expiryText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '750',
    alignSelf: 'flex-start',
    marginTop: -4,
    marginBottom: 12
  },
  resendRow: {
    marginTop: 14,
    alignItems: 'center'
  },
  resendLink: {
    color: Colors.secondary,
    fontSize: 13,
    fontWeight: '800'
  },
  resendLinkDisabled: {
    color: '#94A3B8'
  },
  resetStepBtn: {
    marginTop: 10,
    paddingVertical: 8
  },
  resetStepBtnText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700'
  }
});

export default ContractorOtpScreen;

