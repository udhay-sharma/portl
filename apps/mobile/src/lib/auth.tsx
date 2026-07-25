import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getMe, setOnUnauthorized, type UserProfile, login as apiLogin } from './api';

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
    setIsLoading(true);
    try {
      const res = await apiLogin(credential, password);
      await SecureStore.setItemAsync('accessToken', res.accessToken);
      setToken(res.accessToken);
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' }}>
        <ActivityIndicator size="large" color="#C99A3C" />
        <Text style={{ marginTop: 16, color: '#6C757D', fontWeight: '600' }}>Starting Portl...</Text>
      </View>
    );
  }

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
