import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Home, Shield, ClipboardList, Eye, EyeOff } from 'lucide-react-native';
import { useAuth, RoleMismatchError } from '../lib/auth';
import type { UserProfile } from '../lib/api';

type Role = UserProfile['role'];

// Full class names are listed (not built from strings) so NativeWind can pick them up
const ROLES: Record<Role, {
  label: string;
  hint: string;
  demoEmail: string;
  hex: string;
  bg: string;
  bgDim: string;
  border: string;
  text: string;
  Icon: typeof Home;
}> = {
  RESIDENT: {
    label: 'Resident',
    hint: 'Approve visitors, book amenities and vote in polls.',
    demoEmail: 'resident@portl.dev',
    hex: '#C97D5C',
    bg: 'bg-resident',
    bgDim: 'bg-resident/70',
    border: 'border-resident',
    text: 'text-resident',
    Icon: Home,
  },
  GUARD: {
    label: 'Guard',
    hint: 'Log visitors at your gate and mark exits.',
    demoEmail: 'guard@portl.dev',
    hex: '#C99A3C',
    bg: 'bg-guard',
    bgDim: 'bg-guard/70',
    border: 'border-guard',
    text: 'text-guard',
    Icon: Shield,
  },
  ADMIN: {
    label: 'Admin',
    hint: 'Manage notices, polls, complaints and staff.',
    demoEmail: 'admin@portl.dev',
    hex: '#3A4048',
    bg: 'bg-admin',
    bgDim: 'bg-admin/70',
    border: 'border-admin',
    text: 'text-admin',
    Icon: ClipboardList,
  },
};

const ROLE_ORDER: Role[] = ['RESIDENT', 'GUARD', 'ADMIN'];
const DEMO_PASSWORD = 'password123';

export function LoginScreen() {
  const { login } = useAuth();

  const [role, setRole] = useState<Role>('RESIDENT');
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the account belongs to a different role, so we can offer a one-tap switch
  const [mismatchRole, setMismatchRole] = useState<Role | null>(null);

  // Local loading state so button shows spinner during API call
  const [isSubmitting, setIsSubmitting] = useState(false);

  const current = ROLES[role];

  const selectRole = (next: Role) => {
    setRole(next);
    setError(null);
    setMismatchRole(null);
  };

  const submit = async (cred: string, pass: string, asRole: Role) => {
    // Reset errors
    setError(null);
    setMismatchRole(null);

    // Basic client-side validation
    if (!cred.trim() || !pass.trim()) {
      setError('Email/Phone and password are required.');
      return;
    }

    if (cred.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cred.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(cred.trim(), pass, asRole);
    } catch (err: any) {
      if (err instanceof RoleMismatchError) {
        setMismatchRole(err.actualRole);
      }
      setError(err.message || 'Invalid credentials');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = () => submit(credential, password, role);

  const handleDemoLogin = () => {
    setCredential(current.demoEmail);
    setPassword(DEMO_PASSWORD);
    submit(current.demoEmail, DEMO_PASSWORD, role);
  };

  const handleSwitchRole = () => {
    if (!mismatchRole) return;
    setRole(mismatchRole);
    submit(credential, password, mismatchRole);
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 py-8 justify-center">

            {/* Header */}
            <View className="mb-8 items-center">
              <View className={`w-16 h-16 ${current.bg} rounded-2xl items-center justify-center mb-4`}>
                <Text className="text-white text-3xl font-extrabold">P</Text>
              </View>
              <Text className="text-3xl font-extrabold text-text mb-2">Welcome to Portl</Text>
              <Text className="text-muted text-center text-base">
                Sign in to manage your society.
              </Text>
            </View>

            {/* Role selector */}
            <View className="mb-6">
              <Text className="text-xs font-bold text-text mb-2 uppercase tracking-wider">I am a</Text>
              <View className="flex-row gap-x-2">
                {ROLE_ORDER.map((r) => {
                  const cfg = ROLES[r];
                  const selected = r === role;
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => selectRole(r)}
                      disabled={isSubmitting}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`flex-1 items-center py-3 rounded-xl border-2 bg-surface ${
                        selected ? cfg.border : 'border-border'
                      }`}
                    >
                      <cfg.Icon color={selected ? cfg.hex : '#666666'} size={22} />
                      <Text className={`mt-1 text-sm font-semibold ${selected ? cfg.text : 'text-muted'}`}>
                        {cfg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text className="text-muted text-xs mt-2">{current.hint}</Text>
            </View>

            {/* Error Message */}
            {error && (
              <View className="bg-red-50 border border-status-rejected rounded-control p-3 mb-6">
                <Text className="text-status-rejected text-center font-medium">{error}</Text>
                {mismatchRole && (
                  <TouchableOpacity onPress={handleSwitchRole} disabled={isSubmitting} className="mt-2 self-center">
                    <Text className="text-status-rejected font-bold underline">
                      Switch to {ROLES[mismatchRole].label}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Form */}
            <View className="gap-y-4">
              <View>
                <Text className="text-sm font-semibold text-text mb-2">Email or Phone Number</Text>
                <TextInput
                  value={credential}
                  onChangeText={setCredential}
                  placeholder={`e.g. ${current.demoEmail}`}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="bg-surface border border-border rounded-control px-4 py-3 text-text text-base"
                  editable={!isSubmitting}
                />
              </View>

              <View>
                <Text className="text-sm font-semibold text-text mb-2">Password</Text>
                <View className="justify-center">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    className="bg-surface border border-border rounded-control pl-4 pr-12 py-3 text-text text-base"
                    editable={!isSubmitting}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 p-1"
                  >
                    {showPassword ? <EyeOff color="#666666" size={20} /> : <Eye color="#666666" size={20} />}
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleLogin}
                disabled={isSubmitting}
                className={`mt-4 py-4 rounded-control items-center justify-center ${
                  isSubmitting ? current.bgDim : current.bg
                }`}
              >
                {isSubmitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-lg">Sign in as {current.label}</Text>
                )}
              </TouchableOpacity>

              {/* Demo login */}
              <View className="flex-row items-center my-1">
                <View className="flex-1 h-px bg-border" />
                <Text className="text-muted text-xs mx-3">or</Text>
                <View className="flex-1 h-px bg-border" />
              </View>

              <TouchableOpacity
                onPress={handleDemoLogin}
                disabled={isSubmitting}
                className={`py-3 rounded-control items-center justify-center border-2 border-dashed ${current.border}`}
              >
                <Text className={`font-bold text-sm ${current.text}`}>
                  Try the demo {current.label} account
                </Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
