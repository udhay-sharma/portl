import './global.css';
import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { login, type UserProfile, type VisitorRequest } from './src/lib/api';
import { GuardCreateVisitorScreen } from './src/screens/GuardCreateVisitorScreen';
import { ResidentIncomingRequestsScreen } from './src/screens/ResidentIncomingRequestsScreen';
import { NoticesScreen } from './src/screens/NoticesScreen';
import { PollsScreen } from './src/screens/PollsScreen';
import { ComplaintsScreen } from './src/screens/ComplaintsScreen';
import { AmenitiesScreen } from './src/screens/AmenitiesScreen';

const SEEDED_FLAT_ID = 'c0000000-0000-0000-0000-000000000001'; // Flat 101

type ActiveRole = 'guard' | 'resident' | 'admin';
type ResidentTab = 'visitors' | 'notices' | 'polls' | 'complaints' | 'amenities';
type AdminTab = 'notices' | 'complaints';

export default function App() {
  const [activeRole, setActiveRole] = useState<ActiveRole>('guard');
  const [guardToken, setGuardToken] = useState<string | null>(null);
  const [guardUser, setGuardUser] = useState<UserProfile | null>(null);
  const [residentToken, setResidentToken] = useState<string | null>(null);
  const [residentUser, setResidentUser] = useState<UserProfile | null>(null);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [recentGuardRequests, setRecentGuardRequests] = useState<VisitorRequest[]>([]);

  // Tab state per role
  const [residentTab, setResidentTab] = useState<ResidentTab>('visitors');
  const [adminTab, setAdminTab] = useState<AdminTab>('notices');

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

      const adminRes = await login('admin@portl.dev', 'password123');
      setAdminToken(adminRes.accessToken);
      setAdminUser(adminRes.user);
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

  const renderRoleButton = (role: ActiveRole, label: string, colorClass: string) => (
    <TouchableOpacity
      onPress={() => setActiveRole(role)}
      className={`flex-1 py-2 rounded-control items-center border ${
        activeRole === role
          ? `${colorClass} border-${role === 'guard' ? 'guard' : role === 'resident' ? 'resident' : 'admin'}`
          : 'bg-surface border-border'
      }`}
    >
      <Text
        className={`font-bold text-xs ${
          activeRole === role ? 'text-white' : 'text-text'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderTabBar = (
    tabs: { key: string; label: string }[],
    activeTab: string,
    onSelect: (tab: any) => void,
    accentColor: string
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="bg-surface border-b border-border"
      contentContainerStyle={{ paddingHorizontal: 12 }}
    >
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          className={`px-3 py-2.5 mr-1 border-b-2 ${
            activeTab === tab.key ? `border-${accentColor}` : 'border-transparent'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              activeTab === tab.key ? `text-${accentColor}` : 'text-muted'
            }`}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const residentTabs = [
    { key: 'visitors', label: 'Visitors' },
    { key: 'notices', label: 'Notices' },
    { key: 'polls', label: 'Polls' },
    { key: 'complaints', label: 'Complaints' },
    { key: 'amenities', label: 'Amenities' },
  ];

  const adminTabs = [
    { key: 'notices', label: 'Notices' },
    { key: 'complaints', label: 'Complaints' },
  ];

  const renderResidentContent = () => {
    if (!residentToken) return null;
    switch (residentTab) {
      case 'visitors':
        return (
          <ResidentIncomingRequestsScreen
            token={residentToken}
            flatId={residentUser?.flatId || SEEDED_FLAT_ID}
            onDecisionMade={handleDecisionMade}
          />
        );
      case 'notices':
        return <NoticesScreen token={residentToken} role="RESIDENT" />;
      case 'polls':
        return <PollsScreen token={residentToken} />;
      case 'complaints':
        return <ComplaintsScreen token={residentToken} role="RESIDENT" />;
      case 'amenities':
        return <AmenitiesScreen token={residentToken} />;
      default:
        return null;
    }
  };

  const renderAdminContent = () => {
    if (!adminToken) return null;
    switch (adminTab) {
      case 'notices':
        return <NoticesScreen token={adminToken} role="ADMIN" />;
      case 'complaints':
        return <ComplaintsScreen token={adminToken} role="ADMIN" />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <StatusBar style="light" />

      {/* Role Switcher Header Bar */}
      <View className="bg-surface border-b border-border px-4 py-3 shadow-sm">
        <Text className="text-text font-bold text-xs uppercase tracking-wider mb-2 text-center">
          Demo Role Switcher
        </Text>
        <View className="flex-row gap-2">
          {renderRoleButton('guard', 'Guard', 'bg-guard')}
          {renderRoleButton('resident', 'Resident', 'bg-resident')}
          {renderRoleButton('admin', 'Admin', 'bg-admin')}
        </View>
      </View>

      {/* Screen Content Area */}
      <View className="flex-1">
        {authLoading ? (
          <View className="flex-1 justify-center items-center p-6">
            <ActivityIndicator size="large" color="#C99A3C" />
            <Text className="text-muted font-semibold mt-4 text-center">
              Authenticating demo accounts...
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
          <View className="flex-1">
            {renderTabBar(residentTabs, residentTab, setResidentTab, 'resident')}
            {renderResidentContent()}
          </View>
        ) : activeRole === 'admin' && adminToken ? (
          <View className="flex-1">
            {renderTabBar(adminTabs, adminTab, setAdminTab, 'admin')}
            {renderAdminContent()}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
