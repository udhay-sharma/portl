import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/LoginScreen';
import { ResidentNavigator } from './ResidentNavigator';
import { AdminNavigator } from './AdminNavigator';
import { GuardNavigator } from './GuardNavigator';
import { useAuth } from '../lib/auth';
import { View, ActivityIndicator } from 'react-native';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { token, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#C99A3C" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!token ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : user?.role === 'RESIDENT' ? (
        <Stack.Screen name="ResidentApp" component={ResidentNavigator} />
      ) : user?.role === 'ADMIN' ? (
        <Stack.Screen name="AdminApp" component={AdminNavigator} />
      ) : user?.role === 'GUARD' ? (
        <Stack.Screen name="GuardApp" component={GuardNavigator} />
      ) : (
        <Stack.Screen name="LoginFallback" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
