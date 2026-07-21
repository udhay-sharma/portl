import React from 'react';
import { View, Text } from 'react-native';
import { Card } from './Card';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <Card className="py-8 items-center">
      <Text className="text-muted font-semibold text-base">{title}</Text>
      {subtitle && (
        <Text className="text-muted text-xs mt-1 text-center">{subtitle}</Text>
      )}
    </Card>
  );
}
