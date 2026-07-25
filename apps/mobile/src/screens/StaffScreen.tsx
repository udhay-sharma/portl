import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, TextInput, Linking } from 'react-native';
import { useAuth } from '../lib/auth';
import { getStaff, createStaff, updateStaff, deleteStaff, type ServiceProvider } from '../lib/api';
import { Card } from '../components/ui/Card';
import { Phone, PhoneCall, Trash2, Edit3, Plus } from 'lucide-react-native';

export function StaffScreen() {
  const { token, user } = useAuth();
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ServiceProvider | null>(null);
  const [formData, setFormData] = useState({ name: '', category: '', phone: '', notes: '' });
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchStaff = async () => {
    if (!token) return;
    try {
      const data = await getStaff(token);
      setProviders(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch staff');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [token]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStaff();
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Error', 'Unable to open dialer');
    });
  };

  const openCreateModal = () => {
    setEditingProvider(null);
    setFormData({ name: '', category: '', phone: '', notes: '' });
    setModalVisible(true);
  };

  const openEditModal = (provider: ServiceProvider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      category: provider.category,
      phone: provider.phone,
      notes: provider.notes || '',
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (!formData.name || !formData.category || !formData.phone) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    setSubmitLoading(true);
    try {
      if (editingProvider) {
        await updateStaff(token, editingProvider.id, formData);
      } else {
        await createStaff(token, formData);
      }
      setModalVisible(false);
      fetchStaff();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!token) return;
    Alert.alert('Delete Staff', 'Are you sure you want to remove this staff member?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStaff(token, id);
            fetchStaff();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete');
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="p-md">
          {error && (
            <Text className="text-status-rejected font-bold mb-4">{error}</Text>
          )}

          {providers.length === 0 && !loading && (
            <View className="items-center justify-center p-8 mt-10">
              <Text className="text-muted">No staff or service providers found.</Text>
            </View>
          )}

          {providers.map((provider) => (
            <Card key={provider.id} className="mb-4 p-4">
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1">
                  <Text className="text-white font-bold text-lg">{provider.name}</Text>
                  <Text className="text-muted font-semibold text-xs mb-1 uppercase tracking-wider">
                    {provider.category}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleCall(provider.phone)}
                  className="bg-surface p-3 rounded-full border border-border"
                >
                  <PhoneCall color="#3b82f6" size={20} />
                </TouchableOpacity>
              </View>

              {provider.notes && (
                <Text className="text-muted text-sm mb-3 italic">"{provider.notes}"</Text>
              )}

              <View className="flex-row items-center mt-2 border-t border-border pt-3">
                <Phone color="#94a3b8" size={16} className="mr-2" />
                <Text className="text-text font-semibold">{provider.phone}</Text>
              </View>

              {/* Admin Actions */}
              {user?.role === 'ADMIN' && (
                <View className="flex-row justify-end items-center mt-4 border-t border-border pt-3">
                  <TouchableOpacity
                    onPress={() => openEditModal(provider)}
                    className="flex-row items-center mr-4"
                  >
                    <Edit3 color="#C99A3C" size={16} className="mr-1" />
                    <Text className="text-admin font-bold text-xs">EDIT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(provider.id)}
                    className="flex-row items-center"
                  >
                    <Trash2 color="#ef4444" size={16} className="mr-1" />
                    <Text className="text-status-rejected font-bold text-xs">DELETE</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Card>
          ))}
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
        <View className="flex-1 justify-end bg-black/60">
          <View className="bg-surface rounded-t-3xl p-6 min-h-[50%]">
            <Text className="text-white font-bold text-xl mb-6">
              {editingProvider ? 'Edit Staff' : 'Add Staff Member'}
            </Text>

            <View className="mb-4">
              <Text className="text-muted text-xs mb-1 ml-1">Name *</Text>
              <TextInput
                className="bg-bg text-white px-4 py-3 rounded-control border border-border"
                placeholder="e.g. John Smith"
                placeholderTextColor="#64748b"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />
            </View>

            <View className="mb-4">
              <Text className="text-muted text-xs mb-1 ml-1">Category / Role *</Text>
              <TextInput
                className="bg-bg text-white px-4 py-3 rounded-control border border-border"
                placeholder="e.g. Plumber, Electrician"
                placeholderTextColor="#64748b"
                value={formData.category}
                onChangeText={(text) => setFormData({ ...formData, category: text })}
              />
            </View>

            <View className="mb-4">
              <Text className="text-muted text-xs mb-1 ml-1">Phone Number *</Text>
              <TextInput
                className="bg-bg text-white px-4 py-3 rounded-control border border-border"
                placeholder="e.g. 555-0199"
                placeholderTextColor="#64748b"
                keyboardType="phone-pad"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
              />
            </View>

            <View className="mb-6">
              <Text className="text-muted text-xs mb-1 ml-1">Notes (Optional)</Text>
              <TextInput
                className="bg-bg text-white px-4 py-3 rounded-control border border-border"
                placeholder="e.g. Available on weekends"
                placeholderTextColor="#64748b"
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
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
        </View>
      </Modal>
    </View>
  );
}
