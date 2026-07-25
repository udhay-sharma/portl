import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';
import { Card } from '../components/ui/Card';
import { User, Mail, Home, Shield, LogOut, Users } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation<any>();

  if (!user) return null;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView className="flex-1 bg-bg">
      <View className="p-md">
        <Text className="text-text font-bold text-2xl mb-6">Settings</Text>

        <Card className="mb-6 p-4">
          <Text className="text-text font-bold text-lg mb-4 border-b border-border pb-2">
            Profile Information
          </Text>

          <View className="flex-row items-center mb-4">
            <View className="bg-surface p-2 rounded-full mr-3">
              <User color="#C99A3C" size={20} />
            </View>
            <View>
              <Text className="text-muted text-xs">Name</Text>
              <Text className="text-text font-semibold">{user.name || 'Not provided'}</Text>
            </View>
          </View>

          <View className="flex-row items-center mb-4">
            <View className="bg-surface p-2 rounded-full mr-3">
              <Mail color="#3b82f6" size={20} />
            </View>
            <View>
              <Text className="text-muted text-xs">Email</Text>
              <Text className="text-text font-semibold">{user.email}</Text>
            </View>
          </View>

          <View className="flex-row items-center mb-4">
            <View className="bg-surface p-2 rounded-full mr-3">
              <Shield color="#22c55e" size={20} />
            </View>
            <View>
              <Text className="text-muted text-xs">Role</Text>
              <Text className="text-text font-semibold capitalize">{user.role.toLowerCase()}</Text>
            </View>
          </View>

          {user.role === 'RESIDENT' && (
            <View className="flex-row items-center">
              <View className="bg-surface p-2 rounded-full mr-3">
                <Home color="#a855f7" size={20} />
              </View>
              <View>
                <Text className="text-muted text-xs">Flat ID</Text>
                <Text className="text-text font-semibold">
                  {user.flatId || 'Not assigned'}
                </Text>
              </View>
            </View>
          )}
        </Card>

        <Card className="mb-6 p-2">
          <TouchableOpacity
            onPress={() => navigation.navigate('Staff')}
            className="flex-row items-center p-3"
          >
            <View className="bg-surface p-2 rounded-full mr-4 border border-border">
              <Users color="#fff" size={20} />
            </View>
            <View className="flex-1">
              <Text className="text-text font-bold text-base">Staff Directory</Text>
              <Text className="text-muted text-xs">View society staff & service providers</Text>
            </View>
          </TouchableOpacity>
        </Card>

        <TouchableOpacity
          onPress={logout}
          className="bg-surface border border-status-rejected/30 p-4 rounded-control flex-row justify-center items-center"
        >
          <LogOut color="#ef4444" size={20} className="mr-2" />
          <Text className="text-status-rejected font-bold text-lg">Log Out</Text>
        </TouchableOpacity>
        <Text className="text-muted text-center mt-4 text-xs">
          Logging out will clear your session securely.
        </Text>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}
