import React from 'react';
import { View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <View
      className={`rounded-card border border-border bg-surface p-sm mb-3 shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </View>
  );
}
