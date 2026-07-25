import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NoticesScreen } from '../screens/NoticesScreen';
import { ComplaintsScreen } from '../screens/ComplaintsScreen';
import { AmenitiesScreen } from '../screens/AmenitiesScreen';
import { Bell, MessageSquare, Coffee, LogOut } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useAuth } from '../lib/auth';

const Tab = createBottomTabNavigator();

export function AdminNavigator() {
  const { logout } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <LogOut color="#ef4444" size={24} />
          </TouchableOpacity>
        ),
        headerShown: true,
        tabBarActiveTintColor: '#C99A3C', // Admin theme color
        tabBarInactiveTintColor: 'gray',
        headerStyle: { backgroundColor: '#1e293b' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
      }}
    >
      <Tab.Screen
        name="Notices"
        component={NoticesScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Complaints"
        component={ComplaintsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Amenities"
        component={AmenitiesScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Coffee color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
