import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import * as Crypto from 'expo-crypto';
import { getVisitorRequests, updateVisitorStatus, type VisitorRequest } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useAuth } from '../lib/auth';

export function ResidentIncomingRequestsScreen() {
  const { token: authToken, user } = useAuth();
  const token = authToken as string;
  const flatId = user?.flatId as string;
  const [requests, setRequests] = useState<VisitorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setFetchError(null);
    try {
      const data = await getVisitorRequests(token);
      // Sort newest first
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(data);
    } catch (err) {
      console.error('Failed to fetch visitor requests:', err);
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch visitor requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRequests();

    // Step 2.5: Wire real-time Socket.IO updates for live sync without page refresh
    const disconnect = connectSocket(
      flatId,
      (newReq) => {
        setRequests((prev) => {
          if (prev.some((r) => r.id === newReq.id)) {
            return prev;
          }
          return [newReq, ...prev];
        });
      },
      (decidedReq) => {
        setRequests((prev) =>
          prev.map((r) => (r.id === decidedReq.id ? decidedReq : r))
        );
      }
    );

    return () => {
      disconnect();
    };
  }, [flatId, fetchRequests]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleDecision = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setActionLoadingId(`${id}-${status}`);
    try {
      // Rule 4 Flag: Idempotency key generated per button press on the mobile side
      // using expo-crypto to protect against network drop retries per Step 2.6
      const idempotencyKey = Crypto.randomUUID();

      const updated = await updateVisitorStatus(token, id, status, idempotencyKey);
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : `Failed to ${status.toLowerCase()} request`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === 'PENDING');
  const pastRequests = requests.filter((r) => r.status !== 'PENDING');

  return (
    <ScrollView
      className="flex-1 bg-bg"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
    >
      <View className="bg-resident p-md pb-4">
        <Text className="text-white font-bold text-xl">Resident Portal (Flat 101)</Text>
        <Text className="text-white text-xs opacity-90 mt-1">
          Approve or reject entry requests waiting at the gate.
        </Text>
      </View>

      <View className="p-md">
        <View className="bg-resident-bg border border-resident rounded-card p-sm mb-6 flex-row items-center justify-between">
          <View>
            <Text className="text-resident font-semibold text-base">New visitor waiting</Text>
            <Text className="text-muted text-xs">
              {pendingRequests.length} pending approval{pendingRequests.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="bg-resident rounded-pill px-3 py-1">
            <Text className="text-white font-bold text-xs">{pendingRequests.length}</Text>
          </View>
        </View>

        <Text className="text-text font-bold text-lg mb-3">Pending Approvals</Text>
        {fetchError ? (
          <Card className="py-6 items-center">
            <Text className="text-status-rejected font-bold mb-2">Network Error</Text>
            <Text className="text-muted text-center text-sm mb-4">{fetchError}</Text>
            <Button title="Retry" onPress={handleRefresh} roleColor="resident" />
          </Card>
        ) : loading ? (
          <View className="py-8 items-center">
            <ActivityIndicator size="large" color="#C99A3C" />
            <Text className="text-muted text-sm mt-3">Loading requests...</Text>
          </View>
        ) : pendingRequests.length === 0 ? (
          <EmptyState
            title="No pending visitors"
            subtitle="Live alerts will appear here instantly when someone is at the gate."
          />
        ) : (
          pendingRequests.map((req) => (
            <Card key={req.id} className="border border-resident mb-4">
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 mr-2">
                  <Text className="text-text font-bold text-lg">{req.name}</Text>
                  <Text className="text-resident font-semibold text-sm mt-0.5">
                    Type: {req.visitorType}
                  </Text>
                </View>
                <StatusBadge status={req.status} />
              </View>

              <Text className="text-text text-sm mb-3">
                <Text className="font-semibold">Purpose:</Text> {req.purpose}
              </Text>

              {req.photoUrl ? (
                <Text className="text-muted text-xs italic mb-3">Photo attached: {req.photoUrl}</Text>
              ) : null}

              <View className="flex-row justify-end space-x-3 gap-2">
                <Button
                  title="Reject"
                  variant="danger"
                  className="flex-1 py-2"
                  onPress={() => handleDecision(req.id, 'REJECTED')}
                  loading={actionLoadingId === `${req.id}-REJECTED`}
                  disabled={actionLoadingId !== null}
                />
                <Button
                  title="Approve"
                  roleColor="resident"
                  className="flex-1 py-2"
                  onPress={() => handleDecision(req.id, 'APPROVED')}
                  loading={actionLoadingId === `${req.id}-APPROVED`}
                  disabled={actionLoadingId !== null}
                />
              </View>
            </Card>
          ))
        )}

        <Text className="text-text font-bold text-lg mt-4 mb-3">Recent Decisions & History</Text>
        {pastRequests.length === 0 ? (
          <Text className="text-muted text-sm italic">No past visitor logs.</Text>
        ) : (
          pastRequests.map((req) => (
            <Card key={req.id} className="flex-row justify-between items-center mb-3 opacity-90">
              <View className="flex-1 mr-2">
                <Text className="text-text font-bold text-base">{req.name}</Text>
                <Text className="text-muted text-xs mt-0.5">
                  {req.visitorType} • {req.purpose}
                </Text>
                <Text className="text-muted text-[10px] mt-1">
                  Decided at: {new Date(req.updatedAt).toLocaleTimeString()}
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
