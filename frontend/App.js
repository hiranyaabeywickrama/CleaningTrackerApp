import React, { useState, useEffect, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';
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
import ClientDashboard from './src/screens/client/ClientDashboard';

import { setAuthToken, setCurrentUserStore, loadPersistentSession, authAPI, initializeBaseUrl } from './src/api/client';

const Stack = createStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [loadingSession, setLoadingSession] = useState(true);
  const navigationRef = useRef(null);

  // Auto-login session restore effect on boot — validates token against server
  useEffect(() => {
    const validateAndRestoreSession = async () => {
      await initializeBaseUrl(); // Load custom saved backend URL override first!
      const session = await loadPersistentSession();
      if (session && session.token) {
        try {
          // Validate the token by hitting the profile endpoint
          // This catches stale tokens from re-seeded databases
          const profileRes = await authAPI.getProfile();
          if (profileRes.success && profileRes.user) {
            // Token is valid — restore session with fresh user data from server
            setToken(session.token);
            setUser(profileRes.user);
            await setCurrentUserStore(profileRes.user);
          } else {
            // Invalid response — clear stale session
            await setAuthToken('');
            setUser(null);
          }
        } catch (err) {
          // Only clear the session if the token was explicitly rejected (401/403)
          console.log('Session validation error:', err.response?.status, err.message);
          const status = err.response?.status;
          if (status === 401 || status === 403) {
            await setAuthToken('');
            setUser(null);
          } else {
            // Network error, timeout or server crash — restore session from offline storage!
            console.log('Offline / server network issue. Restoring session from cache.');
            setToken(session.token);
            setUser(session.user);
          }
        }
      }
      setLoadingSession(false);
    };

    validateAndRestoreSession();
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('session_expired', () => {
      handleLogout();
    });
    return () => {
      subscription.remove();
    };
  }, []);



  const handleLoginSuccess = async (loggedInUser, userToken) => {
    setToken(userToken);
    await setAuthToken(userToken);
    await setCurrentUserStore(loggedInUser); // Cache user profile
    setUser(loggedInUser);

    if (navigationRef.current) {
      const targetRoute = loggedInUser.role === 'admin'
        ? 'AdminCore'
        : loggedInUser.role === 'contractor'
          ? 'ContractorCore'
          : loggedInUser.role === 'client'
            ? 'ClientCore'
            : 'WorkerHome';

      setTimeout(() => {
        try {
          if (navigationRef.current) {
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: targetRoute }]
            });
          }
        } catch (err) {
          console.log('Navigation reset bypassed:', err.message);
        }
      }, 0);
    }

    // For React Native Web: force a clean browser reload to clear active navigation state
    if (Platform.OS === 'web') {
      window.location.reload();
    }
  };

  const handleLogout = async () => {
    setToken('');
    await setAuthToken(''); // Clears dynamic storage cache
    setUser(null);

    if (navigationRef.current) {
      setTimeout(() => {
        try {
          if (navigationRef.current) {
            navigationRef.current.reset({
              index: 0,
              routes: [{ name: 'Welcome' }]
            });
          }
        } catch (err) {
          console.log('Logout navigation reset bypassed:', err.message);
        }
      }, 0);
    }

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
      <NavigationContainer ref={navigationRef}>
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
          ) : user.role === 'client' ? (
            // Client Core Flow
            <Stack.Screen name="ClientCore">
              {(props) => <ClientDashboard {...props} user={user} onLogout={handleLogout} />}
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
