import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ResidentIncomingRequestsScreen } from '../screens/ResidentIncomingRequestsScreen';
import { NoticesScreen } from '../screens/NoticesScreen';
import { PollsScreen } from '../screens/PollsScreen';
import { ComplaintsScreen } from '../screens/ComplaintsScreen';
import { AmenitiesScreen } from '../screens/AmenitiesScreen';
import { Users, Bell, BarChart2, MessageSquare, Coffee, LogOut } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useAuth } from '../lib/auth';

const Tab = createBottomTabNavigator();

export function ResidentNavigator() {
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
        tabBarActiveTintColor: '#3b82f6', // Resident theme color
        tabBarInactiveTintColor: 'gray',
        headerStyle: { backgroundColor: '#1e293b' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
      }}
    >
      <Tab.Screen
        name="Visitors"
        component={ResidentIncomingRequestsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Notices"
        component={NoticesScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Polls"
        component={PollsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <BarChart2 color={color} size={size} />,
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
