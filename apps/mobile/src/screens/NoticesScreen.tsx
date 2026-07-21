import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert } from 'react-native';
import { getNotices, createNotice, type Notice } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';

interface NoticesScreenProps {
  token: string;
  role: 'RESIDENT' | 'ADMIN';
}

export function NoticesScreen({ token, role }: NoticesScreenProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Admin create form
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchNotices = useCallback(async () => {
    try {
      const data = await getNotices(token);
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotices(data);
    } catch (err) {
      console.error('Failed to fetch notices:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotices();
  };

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Validation', 'Both title and content are required.');
      return;
    }
    setCreating(true);
    try {
      const created = await createNotice(token, {
        title: title.trim(),
        content: content.trim(),
      });
      setNotices((prev) => [created, ...prev]);
      setTitle('');
      setContent('');
      Alert.alert('Success', 'Notice published successfully!');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create notice');
    } finally {
      setCreating(false);
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
        <Text className="text-white font-bold text-xl">Notices</Text>
        <Text className="text-white text-xs opacity-90 mt-1">
          {role === 'ADMIN' ? 'Create and manage society notices.' : 'Stay updated with society announcements.'}
        </Text>
      </View>

      <View className="p-md">
        {role === 'ADMIN' && (
          <Card className="mb-6">
            <Text className="text-text font-bold text-lg mb-3">Create Notice</Text>
            <Input
              label="Title *"
              placeholder="e.g. Water supply disruption"
              value={title}
              onChangeText={setTitle}
            />
            <Input
              label="Content *"
              placeholder="Notice details..."
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={3}
              className="min-h-[80px] text-top"
            />
            <Button
              title="Publish Notice"
              roleColor="admin"
              onPress={handleCreate}
              loading={creating}
            />
          </Card>
        )}

        <Text className="text-text font-bold text-lg mb-3">All Notices</Text>
        {loading ? (
          <Text className="text-muted text-sm italic py-4">Loading notices...</Text>
        ) : notices.length === 0 ? (
          <EmptyState
            title="No notices yet"
            subtitle="Society notices will appear here when published."
          />
        ) : (
          notices.map((notice) => (
            <Card key={notice.id} className="mb-3">
              <Text className="text-text font-bold text-base">{notice.title}</Text>
              <Text className="text-text text-sm mt-1">{notice.content}</Text>
              <Text className="text-muted text-xs mt-2">
                {notice.createdBy?.name ? `By ${notice.createdBy.name} · ` : ''}
                {new Date(notice.createdAt).toLocaleDateString()}
              </Text>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}
