import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { Colors } from './src/theme/colors';
import WelcomeScreen from './src/screens/WelcomeScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import LoginScreen from './src/screens/LoginScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ContractorOtpScreen from './src/screens/ContractorOtpScreen';

import WorkerDashboard from './src/screens/worker/WorkerDashboard';
import ActiveJobScreen from './src/screens/worker/ActiveJobScreen';
import AdminDashboard from './src/screens/admin/AdminDashboard';
import ContractorDashboard from './src/screens/contractor/ContractorDashboard';

import { setAuthToken, setCurrentUserStore, loadPersistentSession, authAPI } from './src/api/client';

const Stack = createStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);

  // Auto-login session restore effect on boot — validates token against server
  useEffect(() => {
    const validateAndRestoreSession = async () => {
      const session = loadPersistentSession();
      if (session && session.token) {
        try {
          // Validate the token by hitting the profile endpoint
          // This catches stale tokens from re-seeded databases
          const profileRes = await authAPI.getProfile();
          if (profileRes.success && profileRes.user) {
            // Token is valid — restore session with fresh user data from server
            setToken(session.token);
            setUser(profileRes.user);
          } else {
            // Invalid response — clear stale session
            setAuthToken('');
            setUser(null);
          }
        } catch (err) {
          // Token rejected by server (401/403) — stale session, clear it
          console.log('Stale session cleared:', err.response?.status, err.message);
          setAuthToken(''); // Clears localStorage too
          setUser(null);
        }
      }
      setLoadingSession(false);
    };

    validateAndRestoreSession();
  }, []);

  const handleLoginSuccess = (loggedInUser, userToken) => {
    setToken(userToken);
    setAuthToken(userToken);
    setCurrentUserStore(loggedInUser); // Cache user profile
    setUser(loggedInUser);
    
    // For React Native Web: force a clean browser reload to clear active navigation state
    // and instantly boot straight into the Contractor/Worker dashboard automatically!
    if (Platform.OS === 'web') {
      window.location.reload();
    }
  };

  const handleLogout = () => {
    setToken('');
    setAuthToken(''); // Clears dynamic localStorage cache
    setUser(null);
    
    if (Platform.OS === 'web') {
      window.location.reload();
    }
  };

  if (loadingSession) {
    return null; // Graceful loader while validating session
  }

  return (
    <SafeAreaProvider style={{ backgroundColor: Colors.background }}>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: Colors.background }
          }}
        >
          {user === null ? (
            // Complete Auth Flow
            <>
              <Stack.Screen name="Welcome" component={WelcomeScreen} />
              <Stack.Screen name="Login">
                {(props) => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
              </Stack.Screen>
              <Stack.Screen name="Register">
                {(props) => <RegisterScreen {...props} onLoginSuccess={handleLoginSuccess} />}
              </Stack.Screen>
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
              <Stack.Screen name="ContractorOtp">
                {(props) => <ContractorOtpScreen {...props} onLoginSuccess={handleLoginSuccess} />}
              </Stack.Screen>
            </>
          ) : user.role === 'admin' ? (
            // Admin Core Flow
            <Stack.Screen name="AdminCore">
              {(props) => <AdminDashboard {...props} user={user} onLogout={handleLogout} />}
            </Stack.Screen>
          ) : user.role === 'contractor' ? (
            // Contractor Core Flow
            <Stack.Screen name="ContractorCore">
              {(props) => <ContractorDashboard {...props} user={user} onLogout={handleLogout} />}
            </Stack.Screen>
          ) : (
            // Worker Flow (Stack container)
            <>
              <Stack.Screen name="WorkerHome">
                {(props) => (
                  <WorkerDashboard
                    {...props}
                    user={user}
                    onLogout={handleLogout}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="ActiveJob" component={ActiveJobScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
