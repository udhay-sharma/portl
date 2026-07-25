import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { getMe, setOnUnauthorized, type UserProfile, login as apiLogin, updatePushToken } from './api';

interface AuthContextType {
  token: string | null;
  user: UserProfile | null;
  isLoading: boolean;
  login: (credential: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync('accessToken');
    } catch (e) {
      // Ignore secure store errors on logout
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Hook up global 401 interception
    setOnUnauthorized(logout);
  }, [logout]);

  useEffect(() => {
    async function loadToken() {
      setIsLoading(true);
      try {
        const storedToken = await SecureStore.getItemAsync('accessToken');
        if (storedToken) {
          // Verify token and fetch user details
          // Since getMe only returns a partial user currently, we cast or assume for now,
          // but let's actually just fetch it to verify the token is valid.
          const partialUser = await getMe(storedToken);
          setToken(storedToken);
          // In a full implementation, GET /me should return the full UserProfile.
          // For now, we populate what we have to satisfy the type or just leave it null until LoginScreen is built.
          setUser({
            id: partialUser.id,
            role: partialUser.role as any,
            societyId: partialUser.societyId,
            name: 'Stored User', // Placeholder since getMe might not return it yet
            email: null,
            phone: null,
            flatId: null,
            gateId: null,
          });
        }
      } catch (err) {
        // If getMe fails (e.g. 401 Expired), we clear the token.
        console.warn('Failed to restore session:', err);
        await SecureStore.deleteItemAsync('accessToken').catch(() => {});
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadToken();
  }, []);

  const login = async (credential: string, password?: string) => {
    let accessToken = '';
    
    // Perform login API call
    const res = await apiLogin(credential, password);
    await SecureStore.setItemAsync('accessToken', res.accessToken);
    accessToken = res.accessToken;
    setToken(res.accessToken);
    setUser(res.user);

    // New Push Token Logic - Run in background so it doesn't block UI if it hangs
    if (accessToken) {
      (async () => {
        try {
          const { status: existingStatus } = await Notifications.getPermissionsAsync();
          let finalStatus = existingStatus;
          if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
          }
          if (finalStatus === 'granted') {
            const pushToken = (await Notifications.getExpoPushTokenAsync()).data;
            await updatePushToken(accessToken, pushToken);
            console.log('Successfully registered push token:', pushToken);
          }
        } catch (pushErr) {
          console.warn('Failed to register push token:', pushErr);
        }
      })();
    }
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
