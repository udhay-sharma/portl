import React from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...rest }: InputProps) {
  return (
    <View className="mb-3">
      {label && <Text className="text-text font-semibold mb-1 text-sm">{label}</Text>}
      <TextInput
        className={`rounded-control border border-border bg-surface px-3 py-2 text-text text-base ${
          error ? 'border-status-rejected' : 'focus:border-guard'
        } ${className}`}
        placeholderTextColor="#9CA3AF"
        {...rest}
      />
      {error && <Text className="text-status-rejected text-xs mt-1">{error}</Text>}
    </View>
  );
}
