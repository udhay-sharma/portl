import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, type TouchableOpacityProps } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  roleColor?: 'guard' | 'resident' | 'admin';
  loading?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  roleColor = 'guard',
  loading = false,
  disabled,
  className = '',
  ...rest
}: ButtonProps) {
  let bgClass = 'bg-guard';
  let textClass = 'text-white';

  if (variant === 'danger') {
    bgClass = 'bg-status-rejected';
    textClass = 'text-white';
  } else if (variant === 'secondary') {
    bgClass = 'bg-transparent border border-border';
    textClass = 'text-text';
  } else {
    // primary variant using role
    if (roleColor === 'resident') {
      bgClass = 'bg-resident';
    } else if (roleColor === 'admin') {
      bgClass = 'bg-admin';
    } else {
      bgClass = 'bg-guard';
    }
  }

  return (
    <TouchableOpacity
      className={`rounded-control px-4 py-3 flex-row items-center justify-center ${bgClass} ${
        disabled || loading ? 'opacity-60' : ''
      } ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text className={`font-semibold text-center ${textClass}`}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
