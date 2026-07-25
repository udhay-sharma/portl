import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GuardCreateVisitorScreen } from '../screens/GuardCreateVisitorScreen';
import { Users, Settings } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const Tab = createBottomTabNavigator();

export function GuardNavigator() {
  const navigation = useNavigation<any>();

  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => (
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ marginRight: 16 }}>
            <Settings color="#fff" size={24} />
          </TouchableOpacity>
        ),
        headerShown: false,
        tabBarActiveTintColor: '#22c55e', // Guard theme color
        tabBarInactiveTintColor: 'gray',
        headerStyle: { backgroundColor: '#1e293b' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155' },
      }}
    >
      <Tab.Screen
        name="Log Visitor"
        component={GuardCreateVisitorScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}
