import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { getAmenities, bookAmenity, type Amenity } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';

interface AmenitiesScreenProps {
  token: string;
}

export function AmenitiesScreen({ token }: AmenitiesScreenProps) {
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Booking form state
  const [selectedAmenityId, setSelectedAmenityId] = useState<string | null>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [booking, setBooking] = useState(false);

  const fetchAmenities = useCallback(async () => {
    try {
      const data = await getAmenities(token);
      setAmenities(data);
    } catch (err) {
      console.error('Failed to fetch amenities:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAmenities();
  }, [fetchAmenities]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAmenities();
  };

  const handleBook = async () => {
    if (!selectedAmenityId || !bookingDate || !startTime || !endTime) {
      Alert.alert('Validation', 'Please fill in all booking fields.');
      return;
    }

    // Helper to normalize "9.45" or "9:45" into "09:45"
    const normalizeTime = (t: string) => {
      let cleaned = t.replace('.', ':');
      if (cleaned.length === 4 && cleaned.includes(':')) {
        cleaned = `0${cleaned}`; // e.g. "9:45" -> "09:45"
      }
      return cleaned;
    };

    // Build ISO datetime strings from user input
    const dateStr = bookingDate; // expects YYYY-MM-DD
    const startISO = `${dateStr}T${normalizeTime(startTime)}:00.000Z`;
    const endISO = `${dateStr}T${normalizeTime(endTime)}:00.000Z`;

    if (new Date(endISO) <= new Date(startISO)) {
      Alert.alert('Validation', 'End time must be after start time.');
      return;
    }

    setBooking(true);
    try {
      await bookAmenity(token, selectedAmenityId, {
        date: `${dateStr}T00:00:00.000Z`,
        startTime: startISO,
        endTime: endISO,
      });
      Alert.alert('Success', 'Amenity booked successfully!');
      setSelectedAmenityId(null);
      setBookingDate('');
      setStartTime('');
      setEndTime('');
    } catch (err) {
      Alert.alert('Booking Failed', err instanceof Error ? err.message : 'Failed to book amenity');
    } finally {
      setBooking(false);
    }
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
        <Text className="text-text font-bold text-lg mb-3">Available Amenities</Text>
        {loading ? (
          <Text className="text-muted text-sm italic py-4">Loading amenities...</Text>
        ) : amenities.length === 0 ? (
          <EmptyState
            title="No amenities available"
            subtitle="Society amenities will appear here when added."
          />
        ) : (
          amenities.map((amenity) => {
            const isSelected = selectedAmenityId === amenity.id;

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
                    title={isSelected ? 'Cancel' : 'Book'}
                    variant={isSelected ? 'secondary' : 'primary'}
                    roleColor="resident"
                    onPress={() => setSelectedAmenityId(isSelected ? null : amenity.id)}
                    className="px-4 py-1.5"
                  />
                </View>

                {isSelected && (
                  <View className="mt-3 pt-3 border-t border-border">
                    <Text className="text-text font-semibold text-sm mb-2">Book this amenity</Text>
                    <Input
                      label="Date (YYYY-MM-DD)"
                      placeholder="e.g. 2026-10-01"
                      value={bookingDate}
                      onChangeText={setBookingDate}
                    />
                    <Input
                      label="Start Time (HH:MM, 24h UTC)"
                      placeholder="e.g. 09:00"
                      value={startTime}
                      onChangeText={setStartTime}
                    />
                    <Input
                      label="End Time (HH:MM, 24h UTC)"
                      placeholder="e.g. 10:00"
                      value={endTime}
                      onChangeText={setEndTime}
                    />
                    <Button
                      title="Confirm Booking"
                      roleColor="resident"
                      onPress={handleBook}
                      loading={booking}
                    />
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
