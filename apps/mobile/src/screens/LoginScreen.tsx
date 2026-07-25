import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../lib/auth';

export function LoginScreen() {
  const { login, isLoading } = useAuth();
  
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Local loading state so button shows spinner during API call
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    // Reset errors
    setError(null);
    
    // Basic client-side validation
    if (!credential.trim() || !password.trim()) {
      setError('Email/Phone and password are required.');
      return;
    }
    
    if (credential.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credential)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(credential.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 justify-center">
            
            {/* Header */}
            <View className="mb-10 items-center">
              <View className="w-16 h-16 bg-guard rounded-2xl items-center justify-center mb-4">
                <Text className="text-white text-3xl font-extrabold">P</Text>
              </View>
              <Text className="text-3xl font-extrabold text-text mb-2">Welcome to Portl</Text>
              <Text className="text-muted text-center text-base">
                Sign in to manage your society, visitors, and amenities.
              </Text>
            </View>

            {/* Error Message */}
            {error && (
              <View className="bg-red-50 border border-status-rejected rounded-control p-3 mb-6">
                <Text className="text-status-rejected text-center font-medium">{error}</Text>
              </View>
            )}

            {/* Form */}
            <View className="gap-y-4">
              <View>
                <Text className="text-sm font-semibold text-text mb-2">Email or Phone Number</Text>
                <TextInput
                  value={credential}
                  onChangeText={setCredential}
                  placeholder="e.g. resident@portl.dev"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="bg-surface border border-border rounded-control px-4 py-3 text-text text-base"
                  editable={!isSubmitting}
                />
              </View>

              <View>
                <Text className="text-sm font-semibold text-text mb-2">Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoCapitalize="none"
                  className="bg-surface border border-border rounded-control px-4 py-3 text-text text-base"
                  editable={!isSubmitting}
                />
              </View>

              <TouchableOpacity
                onPress={handleLogin}
                disabled={isSubmitting}
                className={`mt-4 py-4 rounded-control items-center justify-center ${
                  isSubmitting ? 'bg-guard/70' : 'bg-guard'
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-lg">Sign In</Text>
                )}
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
