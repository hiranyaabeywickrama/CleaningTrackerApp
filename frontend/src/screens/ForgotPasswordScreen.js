import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, TouchableOpacity, Image } from 'react-native';
import { Colors } from '../theme/colors';
import CustomInput from '../components/CustomInput';
import CustomButton from '../components/CustomButton';
import AppFooter from '../components/AppFooter';

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRecover = () => {
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    if (!email) {
      setError('Email Address is required');
      return;
    } else if (!emailRegex.test(email)) {
      setError('Please enter a valid email format');
      return;
    }

    setError('');
    setLoading(true);

    // Simulate recovery email submission
    setTimeout(() => {
      setLoading(false);
      if (Platform.OS === 'web') {
        alert('Recovery Email Dispatched ✉️\n\nIf an account exists with that email address, you will receive password recovery instructions shortly.');
        navigation.navigate('Login');
      } else {
        Alert.alert(
          'Recovery Email Dispatched ✉️',
          'If an account exists with that email address, you will receive password recovery instructions shortly.',
          [
            { text: 'Back to Login', onPress: () => navigation.navigate('Login') }
          ]
        );
      }
    }, 1500);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          {/* Direct Balanced Logo Image */}
          <Image
            source={require('../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          
          <Text style={styles.cardTitle}>Forgot Password?</Text>
          <Text style={styles.cardSubtitle}>
            Enter your email and we will send password recovery instructions.
          </Text>

          <CustomInput
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="your.email@example.com"
            keyboardType="email-address"
            icon="✉️"
            error={error}
            required
          />

          <CustomButton
            title={loading ? 'Sending...' : '🔑 Send Reset Instructions'}
            type="primary" // Green SaaS
            onPress={handleRecover}
            disabled={loading}
            style={styles.recoverBtn}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Remember your password? </Text>
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
    color: Colors.secondary, // SaaS Blue
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
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: 0.2
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '550',
    marginBottom: 20,
    paddingHorizontal: 10
  },
  recoverBtn: {
    height: 46,
    marginTop: 10,
    marginBottom: 14
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12
  },
  footerLabel: {
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '600'
  },
  loginLink: {
    color: Colors.primary, // Green SaaS
    fontSize: 12.5,
    fontWeight: '800'
  }
});

export default ForgotPasswordScreen;

