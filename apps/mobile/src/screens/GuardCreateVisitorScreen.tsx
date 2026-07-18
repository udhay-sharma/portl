import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { VisitorRequestSchema, type VisitorRequestInput } from '@portl/shared';
import { createVisitorRequest, type VisitorRequest } from '../lib/api';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';

const VISITOR_TYPES = ['Delivery', 'Cab', 'Guest', 'Staff'];
const SEEDED_FLAT_ID = 'c0000000-0000-0000-0000-000000000001'; // Flat 101 from Step 1.6 seed

interface GuardCreateVisitorScreenProps {
  token: string;
  recentRequests: VisitorRequest[];
  onVisitorCreated: (req: VisitorRequest) => void;
}

export function GuardCreateVisitorScreen({
  token,
  recentRequests,
  onVisitorCreated,
}: GuardCreateVisitorScreenProps) {
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [visitorType, setVisitorType] = useState('Delivery');
  const [flatId, setFlatId] = useState(SEEDED_FLAT_ID);
  const [photoUrl, setPhotoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    setErrors({});
    const input: VisitorRequestInput = {
      name: name.trim(),
      purpose: purpose.trim(),
      visitorType,
      flatId: flatId.trim(),
    };
    if (photoUrl.trim()) {
      input.photoUrl = photoUrl.trim();
    }

    // Step 1.3 / 2.2: 3 places habit — validate Zod schema on client form submission
    const parsed = VisitorRequestSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
        if (msgs && msgs.length > 0) {
          fieldErrors[field] = msgs[0];
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const created = await createVisitorRequest(token, parsed.data);
      onVisitorCreated(created);
      setName('');
      setPurpose('');
      setPhotoUrl('');
      Alert.alert('Success', `Visitor ${created.name} registered and sent to flat for approval!`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create visitor request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-bg">
      <View className="bg-guard p-md pb-4">
        <Text className="text-white font-bold text-xl">Guard Check-in (Gate 1)</Text>
        <Text className="text-white text-xs opacity-90 mt-1">
          Register visitor entry. Requests are sent instantly to Resident.
        </Text>
      </View>

      <View className="p-md">
        <Card className="mb-6">
          <Text className="text-text font-bold text-lg mb-3">New Visitor Request</Text>

          <Input
            label="Visitor Name *"
            placeholder="e.g. Rahul Kumar"
            value={name}
            onChangeText={setName}
            error={errors.name}
          />

          <Input
            label="Purpose *"
            placeholder="e.g. Amazon Package Delivery"
            value={purpose}
            onChangeText={setPurpose}
            error={errors.purpose}
          />

          <Text className="text-text font-semibold mb-2 text-sm">Visitor Type *</Text>
          <View className="flex-row flex-wrap mb-4">
            {VISITOR_TYPES.map((type) => {
              const selected = visitorType === type;
              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => setVisitorType(type)}
                  className={`px-3 py-1.5 rounded-pill border mr-2 mb-2 ${
                    selected
                      ? 'bg-guard border-guard'
                      : 'bg-surface border-border'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-text'}`}>
                    {type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {errors.visitorType && (
            <Text className="text-status-rejected text-xs mb-3">{errors.visitorType}</Text>
          )}

          <Input
            label="Target Flat ID *"
            placeholder="Flat UUID"
            value={flatId}
            onChangeText={setFlatId}
            error={errors.flatId}
          />

          <Input
            label="Photo URL (Optional)"
            placeholder="https://..."
            value={photoUrl}
            onChangeText={setPhotoUrl}
            error={errors.photoUrl}
          />

          <Button
            title="Register & Send Request"
            roleColor="guard"
            onPress={handleSubmit}
            loading={loading}
          />
        </Card>

        <Text className="text-text font-bold text-lg mb-3">Recent Gate Requests (Live)</Text>
        {recentRequests.length === 0 ? (
          <Text className="text-muted text-sm italic">No recent requests created from this gate yet.</Text>
        ) : (
          recentRequests.map((req) => (
            <Card key={req.id} className="flex-row justify-between items-center mb-3">
              <View className="flex-1 mr-2">
                <Text className="text-text font-bold text-base">{req.name}</Text>
                <Text className="text-muted text-xs mt-0.5">
                  {req.visitorType} • {req.purpose}
                </Text>
                <Text className="text-muted text-[10px] mt-1">
                  Flat ID: {req.flatId.slice(0, 8)}...
                </Text>
              </View>
              <StatusBadge status={req.status} />
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}
