import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NoticesScreen } from '../screens/NoticesScreen';
import { PollsScreen } from '../screens/PollsScreen';
import { ComplaintsScreen } from '../screens/ComplaintsScreen';
import { AmenitiesScreen } from '../screens/AmenitiesScreen';
import { Bell, MessageSquare, Coffee, Settings, BarChart2 } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../lib/auth';
import { getComplaintCount } from '../lib/api';

const Tab = createBottomTabNavigator();

export function AdminNavigator() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const [complaintCount, setComplaintCount] = React.useState<number>(0);

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      if (token) {
        getComplaintCount(token).then((count) => {
          if (isActive) setComplaintCount(count);
        }).catch(console.error);
      }
      return () => { isActive = false; };
    }, [token])
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ marginRight: 16 }}>
            <Settings color="#fff" size={24} />
          </TouchableOpacity>
        ),
        headerShown: false,
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
          tabBarBadge: complaintCount > 0 ? complaintCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
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
