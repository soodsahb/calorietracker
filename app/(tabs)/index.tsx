import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Card } from '@/components/ui';
import { Ring } from '@/components/Ring';
import { MacroBar } from '@/components/MacroBar';
import { dayTotals, mealTotals } from '@/domain/nutrition';
import { MEAL_TYPES, type MealType } from '@/domain/types';
import { useSettingsStore } from '@/state/settingsStore';
import { useTodayStore } from '@/state/todayStore';
import { MIN_TOUCH, radius, space, useTheme } from '@/theme';

const TITLES: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

export default function Today() {
  const t = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const { meals, load } = useTodayStore();
  useFocusEffect(React.useCallback(() => { load().catch(() => {}); }, [load]));

  const totals = dayTotals(meals.map((m) => m.items));
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 120 }}>
        <Card style={{ gap: space.lg }}>
          <Ring consumed={totals.kcal} goal={settings.kcalGoal} />
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <MacroBar label="Protein" value={totals.protein} goal={settings.proteinGoal} color={t.protein} />
            <MacroBar label="Carbs" value={totals.carbs} goal={settings.carbsGoal} color={t.carbs} />
            <MacroBar label="Fat" value={totals.fat} goal={settings.fatGoal} color={t.fat} />
          </View>
        </Card>
        {meals.length === 0 ? (
          <Card><Text style={{ color: t.textMuted, textAlign: 'center' }}>No meals logged today. Tap + to snap your first meal.</Text></Card>
        ) : null}
        {MEAL_TYPES.map((type) => {
          const list = meals.filter((m) => m.mealType === type);
          if (!list.length) return null;
          return (
            <View key={type} style={{ gap: space.sm }}>
              <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{TITLES[type]}</Text>
              {list.map((m) => {
                const mt = mealTotals(m.items);
                const names = m.items.map((i) => i.name).join(', ') || 'Meal';
                return (
                  <Pressable
                    key={m.id} accessibilityRole="button" accessibilityLabel={`${names}, ${mt.kcal} kilocalories. Edit`}
                    onPress={() => router.push({ pathname: '/meal/[id]', params: { id: m.id } })}
                    style={{ minHeight: MIN_TOUCH + 20, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.surface, borderRadius: radius.md, padding: space.md, borderColor: t.border, borderWidth: 1 }}
                  >
                    {m.photoUri ? <Image source={{ uri: m.photoUri }} style={{ width: 52, height: 52, borderRadius: radius.sm }} accessibilityIgnoresInvertColors /> : null}
                    <Text numberOfLines={2} style={{ flex: 1, color: t.text, fontSize: 15 }}>{names}</Text>
                    <Text style={{ color: t.text, fontWeight: '700', fontSize: 16 }}>{mt.kcal} kcal</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        accessibilityRole="button" accessibilityLabel="Add meal" accessibilityHint="Opens the camera to photograph a meal"
        onPress={() => router.push('/capture')}
        style={{ position: 'absolute', right: space.xl, bottom: space.xl, width: 64, height: 64, borderRadius: 32, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}
      >
        <Text style={{ color: t.onPrimary, fontSize: 34, lineHeight: 38 }}>+</Text>
      </Pressable>
    </View>
  );
}
