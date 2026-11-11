import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { progress, remaining } from '@/domain/nutrition';
import { useTheme } from '@/theme';

export function Ring({ consumed, goal, size = 200, stroke = 16 }: { consumed: number; goal: number; size?: number; stroke?: number }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = progress(consumed, goal);
  const left = remaining(goal, consumed);
  const over = left < 0;
  const color = over ? t.danger : t.primary;
  const label = over ? `${Math.abs(left)} kcal over` : `${left} kcal left`;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Calories: ${consumed} of ${goal} kcal consumed, ${label}`}
      accessibilityValue={{ min: 0, max: goal, now: Math.min(consumed, goal) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.ringTrack} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)} rotation={-90} originX={size / 2} originY={size / 2}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
        <Text style={{ color: t.text, fontSize: 38, fontWeight: '700' }}>{consumed}</Text>
        <Text style={{ color: t.textMuted, fontSize: 14 }}>of {goal} kcal</Text>
        <Text style={{ color: over ? t.danger : t.textMuted, fontSize: 14, fontWeight: '600', marginTop: 2 }}>{label}</Text>
      </View>
    </View>
  );
}
