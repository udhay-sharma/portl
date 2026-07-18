import './global.css';
import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { login, type UserProfile, type VisitorRequest } from './src/lib/api';
import { GuardCreateVisitorScreen } from './src/screens/GuardCreateVisitorScreen';
import { ResidentIncomingRequestsScreen } from './src/screens/ResidentIncomingRequestsScreen';

const SEEDED_FLAT_ID = 'c0000000-0000-0000-0000-000000000001'; // Flat 101

export default function App() {
  const [activeRole, setActiveRole] = useState<'guard' | 'resident'>('guard');
  const [guardToken, setGuardToken] = useState<string | null>(null);
  const [guardUser, setGuardUser] = useState<UserProfile | null>(null);
  const [residentToken, setResidentToken] = useState<string | null>(null);
  const [residentUser, setResidentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recentGuardRequests, setRecentGuardRequests] = useState<VisitorRequest[]>([]);

  const authenticateSeededUsers = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const guardRes = await login('guard@portl.dev', 'password123');
      setGuardToken(guardRes.accessToken);
      setGuardUser(guardRes.user);

      const residentRes = await login('resident@portl.dev', 'password123');
      setResidentToken(residentRes.accessToken);
      setResidentUser(residentRes.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to authenticate seeded demo users');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    authenticateSeededUsers();
  }, [authenticateSeededUsers]);

  const handleVisitorCreated = (created: VisitorRequest) => {
    setRecentGuardRequests((prev) => [created, ...prev]);
  };

  const handleDecisionMade = (decided: VisitorRequest) => {
    setRecentGuardRequests((prev) =>
      prev.map((r) => (r.id === decided.id ? decided : r))
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="light" />

      {/* Option A Role Switcher Header Bar */}
      <View className="bg-surface border-b border-border px-4 py-3 shadow-sm">
        <Text className="text-text font-bold text-xs uppercase tracking-wider mb-2 text-center">
          Demo Role Switcher (Option A)
        </Text>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => setActiveRole('guard')}
            className={`flex-1 py-2 rounded-control items-center border ${
              activeRole === 'guard'
                ? 'bg-guard border-guard'
                : 'bg-surface border-border'
            }`}
          >
            <Text
              className={`font-bold text-xs ${
                activeRole === 'guard' ? 'text-white' : 'text-text'
              }`}
            >
              Guard View (Gate 1)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveRole('resident')}
            className={`flex-1 py-2 rounded-control items-center border ${
              activeRole === 'resident'
                ? 'bg-resident border-resident'
                : 'bg-surface border-border'
            }`}
          >
            <Text
              className={`font-bold text-xs ${
                activeRole === 'resident' ? 'text-white' : 'text-text'
              }`}
            >
              Resident View (Flat 101)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Screen Content Area */}
      <View className="flex-1">
        {authLoading ? (
          <View className="flex-1 justify-center items-center p-6">
            <ActivityIndicator size="large" color="#C99A3C" />
            <Text className="text-muted font-semibold mt-4 text-center">
              Authenticating demo accounts (guard@portl.dev & resident@portl.dev)...
            </Text>
          </View>
        ) : authError ? (
          <View className="flex-1 justify-center items-center p-6">
            <Text className="text-status-rejected font-bold text-lg mb-2 text-center">
              Authentication Error
            </Text>
            <Text className="text-muted text-center mb-6">{authError}</Text>
            <TouchableOpacity
              onPress={authenticateSeededUsers}
              className="bg-guard px-6 py-3 rounded-control"
            >
              <Text className="text-white font-bold">Retry Login</Text>
            </TouchableOpacity>
          </View>
        ) : activeRole === 'guard' && guardToken ? (
          <GuardCreateVisitorScreen
            token={guardToken}
            recentRequests={recentGuardRequests}
            onVisitorCreated={handleVisitorCreated}
          />
        ) : activeRole === 'resident' && residentToken ? (
          <ResidentIncomingRequestsScreen
            token={residentToken}
            flatId={residentUser?.flatId || SEEDED_FLAT_ID}
            onDecisionMade={handleDecisionMade}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
