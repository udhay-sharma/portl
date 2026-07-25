import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAmenities, bookAmenity, createAmenity, updateAmenity, deleteAmenity, getMe, type Amenity } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Settings } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../lib/auth';
import { Trash2, Edit3, Plus } from 'lucide-react-native';
import { Modal, TextInput } from 'react-native';

export function AmenitiesScreen() {
  const { token: authToken, user } = useAuth();
  const navigation = useNavigation<any>();
  const token = authToken as string; // Screen is only mounted when authenticated
  const role = user?.role as 'RESIDENT' | 'ADMIN';
  const roleColor = role === 'ADMIN' ? 'admin' : 'resident';
  const headerBg = role === 'ADMIN' ? 'bg-admin' : 'bg-resident';
  const borderClass = role === 'ADMIN' ? 'border-admin' : 'border-resident';
  const bgClassActive = role === 'ADMIN' ? 'bg-admin border-admin' : 'bg-resident border-resident';
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Admin Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAmenity, setEditingAmenity] = useState<Amenity | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', slotDurationMinutes: '60' });
  const [submitLoading, setSubmitLoading] = useState(false);

  // Booking state
  const [selectedAmenityId, setSelectedAmenityId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  
  // Hardcode today for hackathon, usually would have a date picker
  const todayStr = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    setFetchError(null);
    try {
      const [me, data] = await Promise.all([
        getMe(token),
        getAmenities(token)
      ]);
      setCurrentUserId(me.id);
      setAmenities(data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch amenities');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleBookSlot = async (amenityId: string, startISO: string, endISO: string) => {
    setBooking(true);
    try {
      await bookAmenity(token, amenityId, {
        date: `${todayStr}T00:00:00.000Z`,
        startTime: startISO,
        endTime: endISO,
      });
      Alert.alert('Success', 'Amenity booked successfully!');
      // Refresh to get the new booking status
      fetchData();
    } catch (err) {
      Alert.alert('Booking Failed', err instanceof Error ? err.message : 'Failed to book amenity');
    } finally {
      setBooking(false);
    }
  };

  const openCreateModal = () => {
    setEditingAmenity(null);
    setFormData({ name: '', description: '', slotDurationMinutes: '60' });
    setModalVisible(true);
  };

  const openEditModal = (amenity: Amenity) => {
    setEditingAmenity(amenity);
    setFormData({
      name: amenity.name,
      description: amenity.description || '',
      slotDurationMinutes: String(amenity.slotDurationMinutes || 60),
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (!formData.name || !formData.slotDurationMinutes) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    const duration = parseInt(formData.slotDurationMinutes, 10);
    if (isNaN(duration) || duration <= 0) {
      Alert.alert('Error', 'Slot duration must be a positive number');
      return;
    }

    setSubmitLoading(true);
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        slotDurationMinutes: duration,
      };

      if (editingAmenity) {
        await updateAmenity(token, editingAmenity.id, payload);
      } else {
        await createAmenity(token, payload);
      }
      setModalVisible(false);
      fetchData();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!token) return;
    Alert.alert('Delete Amenity', 'Are you sure you want to remove this amenity?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAmenity(token, id);
            fetchData();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete');
          }
        },
      },
    ]);
  };

  // Helper to generate slots
  const getSlotsForAmenity = (durationMins: number) => {
    const slots = [];
    const startHour = 8; // 8 AM local
    const endHour = 22; // 10 PM local
    
    let current = new Date();
    current.setHours(startHour, 0, 0, 0);
    const end = new Date();
    end.setHours(endHour, 0, 0, 0);
    
    while (current < end) {
      const slotStart = new Date(current);
      const slotEnd = new Date(current.getTime() + durationMins * 60000);
      
      if (slotEnd > end) break;
      
      slots.push({ start: slotStart, end: slotEnd });
      current = slotEnd;
    }
    return slots;
  };

  const getSlotState = (slotStart: Date, slotEnd: Date, bookings: Amenity['bookings']) => {
    if (!bookings || !currentUserId) return 'available';
    
    const overlappingBooking = bookings.find((b) => {
      const bStart = new Date(b.startTime);
      const bEnd = new Date(b.endTime);
      return slotStart < bEnd && slotEnd > bStart;
    });

    if (!overlappingBooking) return 'available';
    if (overlappingBooking.bookedByUserId === currentUserId) return 'booked-by-me';
    return 'booked-by-someone-else';
  };

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className={`${headerBg} p-md pb-4 flex-row justify-between items-start`}>
          <View className="flex-1 mr-4">
            <Text className="text-white font-bold text-xl">Amenities</Text>
            <Text className="text-white text-xs opacity-90 mt-1">
              Browse and book society amenities.
            </Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} className="bg-white/20 p-2 rounded-full">
            <Settings color="#ffffff" size={20} />
          </TouchableOpacity>
        </View>

      <View className="p-md">
        <Text className="text-text font-bold text-lg mb-3">Available Amenities (Today)</Text>
        {fetchError ? (
          <Card className="py-6 items-center">
            <Text className="text-status-rejected font-bold mb-2">Network Error</Text>
            <Text className="text-muted text-center text-sm mb-4">{fetchError}</Text>
            <Button title="Retry" onPress={handleRefresh} roleColor={roleColor} />
          </Card>
        ) : loading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="large" color={role === 'ADMIN' ? '#4F46E5' : '#C99A3C'} />
            <Text className="text-muted text-sm mt-3">Loading amenities...</Text>
          </View>
        ) : amenities.length === 0 ? (
          <EmptyState
            title="No amenities available"
            subtitle="Society amenities will appear here when added."
          />
        ) : (
          amenities.map((amenity) => {
            const isSelected = selectedAmenityId === amenity.id;
            const slots = getSlotsForAmenity(amenity.slotDurationMinutes || 60);

            return (
              <Card key={amenity.id} className={`mb-3 ${isSelected ? borderClass : ''}`}>
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1 mr-2">
                    <Text className="text-text font-bold text-base">{amenity.name}</Text>
                    {amenity.description && (
                      <Text className="text-muted text-sm mt-1">{amenity.description}</Text>
                    )}
                  </View>
                  <Button
                    title={isSelected ? 'Close' : 'View Slots'}
                    variant={isSelected ? 'secondary' : 'primary'}
                    roleColor={roleColor}
                    onPress={() => setSelectedAmenityId(isSelected ? null : amenity.id)}
                    className="px-4 py-1.5"
                  />
                </View>

                {isSelected && (
                  <View className="mt-3 pt-3 border-t border-border">
                    <Text className="text-text font-semibold text-sm mb-3">Select a slot for {todayStr}</Text>
                    
                    <View className="flex-row flex-wrap">
                      {slots.map((slot, index) => {
                        const state = getSlotState(slot.start, slot.end, amenity.bookings);
                        const label = `${formatTime(slot.start)}`;
                        
                        let bgClass = "bg-white border border-border";
                        let textClass = "text-text";
                        let disabled = false;
                        
                        if (state === 'booked-by-me') {
                          bgClass = bgClassActive;
                          textClass = "text-white font-bold";
                          disabled = true;
                        } else if (state === 'booked-by-someone-else') {
                          bgClass = "bg-gray-200 border-gray-300 opacity-60";
                          textClass = "text-muted";
                          disabled = true;
                        }

                        return (
                          <TouchableOpacity
                            key={index}
                            disabled={disabled || booking}
                            onPress={() => handleBookSlot(amenity.id, slot.start.toISOString(), slot.end.toISOString())}
                            className={`mr-2 mb-2 px-3 py-2 rounded-lg ${bgClass} ${booking ? 'opacity-50' : ''}`}
                          >
                            <Text className={`text-xs ${textClass}`}>{label}</Text>
                            {state === 'booked-by-me' && <Text className="text-white text-[10px] mt-0.5 font-bold">Booked</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Admin Actions */}
                {user?.role === 'ADMIN' && (
                  <View className="flex-row justify-end items-center mt-4 border-t border-border pt-3">
                    <TouchableOpacity
                      onPress={() => openEditModal(amenity)}
                      className="flex-row items-center mr-4"
                    >
                      <Edit3 color="#C99A3C" size={16} className="mr-1" />
                      <Text className="text-admin font-bold text-xs">EDIT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(amenity.id)}
                      className="flex-row items-center"
                    >
                      <Trash2 color="#ef4444" size={16} className="mr-1" />
                      <Text className="text-status-rejected font-bold text-xs">DELETE</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>

      {/* Admin FAB */}
      {user?.role === 'ADMIN' && (
        <TouchableOpacity
          onPress={openCreateModal}
          className="absolute bottom-6 right-6 bg-admin w-14 h-14 rounded-full items-center justify-center shadow-lg"
        >
          <Plus color="#ffffff" size={28} />
        </TouchableOpacity>
      )}

      {/* Admin Form Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 justify-end bg-black/60">
          <View className="bg-surface rounded-t-3xl p-6 min-h-[50%]">
            <Text className="text-text font-bold text-xl mb-6">
              {editingAmenity ? 'Edit Amenity' : 'Add Amenity'}
            </Text>

            <View className="mb-4">
              <Text className="text-muted text-xs mb-1 ml-1">Name *</Text>
              <TextInput
                className="bg-bg text-text px-4 py-3 rounded-control border border-border"
                placeholder="e.g. Swimming Pool"
                placeholderTextColor="#64748b"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />
            </View>

            <View className="mb-4">
              <Text className="text-muted text-xs mb-1 ml-1">Slot Duration (Minutes) *</Text>
              <TextInput
                className="bg-bg text-text px-4 py-3 rounded-control border border-border"
                placeholder="e.g. 60"
                placeholderTextColor="#64748b"
                keyboardType="numeric"
                value={formData.slotDurationMinutes}
                onChangeText={(text) => setFormData({ ...formData, slotDurationMinutes: text })}
              />
            </View>

            <View className="mb-6">
              <Text className="text-muted text-xs mb-1 ml-1">Description (Optional)</Text>
              <TextInput
                className="bg-bg text-text px-4 py-3 rounded-control border border-border"
                placeholder="e.g. Located near Tower A"
                placeholderTextColor="#64748b"
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
              />
            </View>

            <View className="flex-row justify-end space-x-3">
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="px-6 py-3 rounded-control"
              >
                <Text className="text-muted font-bold">CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={submitLoading}
                className="bg-admin px-6 py-3 rounded-control"
              >
                <Text className="text-bg font-bold">{submitLoading ? 'SAVING...' : 'SAVE'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
