import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ResidentIncomingRequestsScreen } from '../screens/ResidentIncomingRequestsScreen';
import { NoticesScreen } from '../screens/NoticesScreen';
import { PollsScreen } from '../screens/PollsScreen';
import { ComplaintsScreen } from '../screens/ComplaintsScreen';
import { AmenitiesScreen } from '../screens/AmenitiesScreen';
import { Users, Bell, BarChart2, MessageSquare, Coffee, Settings } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../lib/auth';
import { getVisitorRequests, getNotices, getPolls, getComplaints } from '../lib/api';

const Tab = createBottomTabNavigator();

export function ResidentNavigator() {
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  
  const [visitorCount, setVisitorCount] = useState(0);
  const [noticeCount, setNoticeCount] = useState(0);
  const [pollCount, setPollCount] = useState(0);
  const [complaintCount, setComplaintCount] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      if (token) {
        Promise.all([
          getVisitorRequests(token).catch(() => []),
          getNotices(token).catch(() => []),
          getPolls(token).catch(() => []),
          getComplaints(token).catch(() => [])
        ]).then(([visitors, notices, polls, complaints]) => {
          if (isActive) {
            setVisitorCount(visitors.filter((v: any) => v.status === 'PENDING').length);
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            setNoticeCount(notices.filter((n: any) => new Date(n.createdAt).getTime() > sevenDaysAgo).length);
            setPollCount(polls.length);
            setComplaintCount(complaints.filter((c: any) => c.status !== 'RESOLVED').length);
          }
        });
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
          tabBarBadge: visitorCount > 0 ? visitorCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
        }}
      />
      <Tab.Screen
        name="Notices"
        component={NoticesScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
          tabBarBadge: noticeCount > 0 ? noticeCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
        }}
      />
      <Tab.Screen
        name="Polls"
        component={PollsScreen}
        options={{
          tabBarIcon: ({ color, size }) => <BarChart2 color={color} size={size} />,
          tabBarBadge: pollCount > 0 ? pollCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#ef4444' },
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
