import React from 'react';
import { Text, View } from 'react-native';
import { CLARIFY_THRESHOLD } from '@/domain/clarify';
import { radius, useTheme } from '@/theme';

export function confidenceLabel(c: number): 'High' | 'Medium' | 'Low' {
  return c >= 0.8 ? 'High' : c >= CLARIFY_THRESHOLD ? 'Medium' : 'Low';
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const t = useTheme();
  const label = confidenceLabel(confidence);
  const color = label === 'High' ? t.ok : label === 'Medium' ? t.warn : t.danger;
  return (
    <View
      accessible
      accessibilityLabel={`Confidence ${label}, ${Math.round(confidence * 100)} percent`}
      style={{ borderColor: color, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label} {Math.round(confidence * 100)}%</Text>
    </View>
  );
}
