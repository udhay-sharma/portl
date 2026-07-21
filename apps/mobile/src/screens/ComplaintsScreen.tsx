import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { getComplaints, createComplaint, updateComplaintStatus, type Complaint } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { StatusBadge } from '../components/ui/StatusBadge';
import { EmptyState } from '../components/ui/EmptyState';

interface ComplaintsScreenProps {
  token: string;
  role: 'RESIDENT' | 'ADMIN';
}

const NEXT_STATUS: Record<string, string> = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'RESOLVED',
};

export function ComplaintsScreen({ token, role }: ComplaintsScreenProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Resident create form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchComplaints = useCallback(async () => {
    try {
      const data = await getComplaints(token);
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setComplaints(data);
    } catch (err) {
      console.error('Failed to fetch complaints:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchComplaints();
  };

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Validation', 'Both title and description are required.');
      return;
    }
    setCreating(true);
    try {
      const created = await createComplaint(token, {
        title: title.trim(),
        description: description.trim(),
      });
      setComplaints((prev) => [created, ...prev]);
      setTitle('');
      setDescription('');
      Alert.alert('Success', 'Complaint submitted successfully!');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create complaint');
    } finally {
      setCreating(false);
    }
  };

  const handleTransition = async (id: string, nextStatus: string) => {
    setActionLoadingId(id);
    try {
      const updated = await updateComplaintStatus(token, id, nextStatus);
      setComplaints((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch (err) {
      Alert.alert('Transition Failed', err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setActionLoadingId(null);
    }
  };

  const roleColor = role === 'ADMIN' ? 'admin' : 'resident';
  const headerBg = role === 'ADMIN' ? 'bg-admin' : 'bg-resident';

  return (
    <ScrollView
      className="flex-1 bg-bg"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View className={`${headerBg} p-md pb-4`}>
        <Text className="text-white font-bold text-xl">Complaints</Text>
        <Text className="text-white text-xs opacity-90 mt-1">
          {role === 'ADMIN'
            ? 'Review and manage resident complaints.'
            : 'Submit and track your complaints.'}
        </Text>
      </View>

      <View className="p-md">
        {role === 'RESIDENT' && (
          <Card className="mb-6">
            <Text className="text-text font-bold text-lg mb-3">New Complaint</Text>
            <Input
              label="Title *"
              placeholder="e.g. Broken elevator"
              value={title}
              onChangeText={setTitle}
            />
            <Input
              label="Description *"
              placeholder="Describe the issue in detail..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              className="min-h-[80px] text-top"
            />
            <Button
              title="Submit Complaint"
              roleColor="resident"
              onPress={handleCreate}
              loading={creating}
            />
          </Card>
        )}

        <Text className="text-text font-bold text-lg mb-3">
          {role === 'ADMIN' ? 'All Complaints' : 'Your Complaints'}
        </Text>
        {loading ? (
          <Text className="text-muted text-sm italic py-4">Loading complaints...</Text>
        ) : complaints.length === 0 ? (
          <EmptyState
            title="No complaints yet"
            subtitle={
              role === 'ADMIN'
                ? 'Resident complaints will appear here.'
                : 'Submit a complaint using the form above.'
            }
          />
        ) : (
          complaints.map((complaint) => {
            const nextStatus = NEXT_STATUS[complaint.status];

            return (
              <Card key={complaint.id} className="mb-3">
                <View className="flex-row justify-between items-start mb-1">
                  <Text className="text-text font-bold text-base flex-1 mr-2">
                    {complaint.title}
                  </Text>
                  <StatusBadge status={complaint.status} />
                </View>
                <Text className="text-text text-sm mt-1">{complaint.description}</Text>

                {role === 'ADMIN' && complaint.flat && (
                  <Text className="text-muted text-xs mt-1">
                    Flat {complaint.flat.number}
                    {complaint.flat.tower ? ` · ${complaint.flat.tower.name}` : ''}
                    {complaint.createdBy ? ` · ${complaint.createdBy.name}` : ''}
                  </Text>
                )}

                <Text className="text-muted text-xs mt-1">
                  {new Date(complaint.createdAt).toLocaleDateString()}
                </Text>

                {role === 'ADMIN' && nextStatus && (
                  <View className="mt-3">
                    <Button
                      title={`Move to ${nextStatus.replace('_', ' ')}`}
                      roleColor="admin"
                      onPress={() => handleTransition(complaint.id, nextStatus)}
                      loading={actionLoadingId === complaint.id}
                      disabled={actionLoadingId !== null}
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
