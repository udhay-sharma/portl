import React from 'react';
import { View, Text } from 'react-native';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-status-pending',
  APPROVED: 'bg-status-approved',
  CHECKED_IN: 'bg-status-checkedin',
  CHECKED_OUT: 'bg-status-checkedout',
  REJECTED: 'bg-status-rejected',
  EXPIRED: 'bg-status-expired',
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const bgClass = STATUS_STYLES[status] || 'bg-muted';
  return (
    <View className={`rounded-pill px-2 py-1 self-start ${bgClass}`}>
      <Text className="text-white text-xs font-semibold">{status}</Text>
    </View>
  );
}
