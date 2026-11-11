import React from 'react';
import { Text, View } from 'react-native';
import { progress } from '@/domain/nutrition';
import { useTheme } from '@/theme';

export function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const t = useTheme();
  const p = progress(value, goal);
  return (
    <View
      style={{ flex: 1, gap: 6 }}
      accessible
      accessibilityLabel={`${label}: ${value} of ${goal} grams`}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: goal, now: Math.min(value, goal) }}
    >
      <Text style={{ color: t.textMuted, fontSize: 13 }}>{label}</Text>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.ringTrack, overflow: 'hidden' }}>
        <View style={{ width: `${p * 100}%`, height: 8, backgroundColor: color }} />
      </View>
      <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{value} / {goal} g</Text>
    </View>
  );
}
