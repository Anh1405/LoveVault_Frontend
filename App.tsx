// App.tsx
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuthStore } from './src/store/useAuthStore';
import { LoginScreen } from './src/screens/LoginScreen';
import { RegisterScreen } from './src/screens/RegisterScreen';
import { ForgotPasswordScreen } from './src/screens/ForgotPasswordScreen';
import { PairingScreen } from './src/screens/PairingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ScreenErrorBoundary } from './src/components/ScreenErrorBoundary';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: { defaultEmail?: string } | undefined;
  Pairing: undefined;
  Home: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

// Bọc HomeScreen để lỗi runtime hiện thông báo thay vì màn hình trắng
const HomeScreenSafe = () => (
    <ScreenErrorBoundary>
      <HomeScreen />
    </ScreenErrorBoundary>
);

export default function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  const coupleId = useAuthStore((state) => state.coupleId);
  const isLoading = useAuthStore((state) => state.isLoading);
  const initAuth = useAuthStore((state) => state.initAuth);

  useEffect(() => {
    if (typeof initAuth === 'function') {
      void initAuth();
    }
  }, [initAuth]);

  // Hiển thị Splash Indicator trong lúc nạp Token từ bộ nhớ đĩa
  if (isLoading) {
    return (
        <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#FFF5F5',
            }}
        >
          <ActivityIndicator size="large" color="#E53E3E" />
        </View>
    );
  }

  const isPaired = Boolean(coupleId || user?.coupleId || user?.couple_id);

  return (
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              {!isAuthenticated ? (
                  <>
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Register" component={RegisterScreen} />
                    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                  </>
              ) : !isPaired ? (
                  <Stack.Screen name="Pairing" component={PairingScreen} />
              ) : (
                  <Stack.Screen name="Home" component={HomeScreenSafe} />
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </QueryClientProvider>
  );
}