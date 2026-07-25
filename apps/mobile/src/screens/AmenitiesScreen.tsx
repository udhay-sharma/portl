import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { getAmenities, bookAmenity, getMe, type Amenity } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../lib/auth';

export function AmenitiesScreen() {
  const { token: authToken } = useAuth();
  const token = authToken as string; // Screen is only mounted when authenticated
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
    <ScrollView
      className="flex-1 bg-bg"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View className="bg-resident p-md pb-4">
        <Text className="text-white font-bold text-xl">Amenities</Text>
        <Text className="text-white text-xs opacity-90 mt-1">
          Browse and book society amenities.
        </Text>
      </View>

      <View className="p-md">
        <Text className="text-text font-bold text-lg mb-3">Available Amenities (Today)</Text>
        {fetchError ? (
          <Card className="py-6 items-center">
            <Text className="text-status-rejected font-bold mb-2">Network Error</Text>
            <Text className="text-muted text-center text-sm mb-4">{fetchError}</Text>
            <Button title="Retry" onPress={handleRefresh} roleColor="resident" />
          </Card>
        ) : loading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="large" color="#C99A3C" />
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
              <Card key={amenity.id} className={`mb-3 ${isSelected ? 'border-resident' : ''}`}>
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
                    roleColor="resident"
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
                          bgClass = "bg-resident border-resident";
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
              </Card>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
