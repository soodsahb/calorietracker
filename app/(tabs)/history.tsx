import React from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { mealsRepo } from '@/db/mealsRepo';
import { groupByDay, type Day } from '@/domain/history';
import { mealTotals } from '@/domain/nutrition';
import type { Meal } from '@/domain/types';
import { deletePhoto } from '@/image/photos';
import { useSettingsStore } from '@/state/settingsStore';
import { MIN_TOUCH, radius, space, useTheme } from '@/theme';

export default function History() {
  const t = useTheme();
  const goal = useSettingsStore((s) => s.settings.kcalGoal);
  const [days, setDays] = React.useState<Day[]>([]);
  const refresh = React.useCallback(async () => {
    setDays(groupByDay(await mealsRepo.listAll()));
  }, []);
  useFocusEffect(React.useCallback(() => { refresh().catch(() => {}); }, [refresh]));

  const confirmDelete = (m: Meal) =>
    Alert.alert('Delete meal?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await mealsRepo.remove(m.id);
          deletePhoto(m.photoUri);
          await refresh();
        } catch {
          Alert.alert('Could not delete', 'Something went wrong deleting this meal. Please try again.');
        }
      } },
    ]);

  return (
    <FlatList
      data={days}
      keyExtractor={(d) => d.key}
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
      ListEmptyComponent={<Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 40 }}>Nothing logged yet.</Text>}
      renderItem={({ item: d }) => (
        <View style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: space.lg, gap: space.sm, borderColor: t.border, borderWidth: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessible accessibilityRole="header" accessibilityLabel={`${d.key}, ${d.kcal} of ${goal} kilocalories`}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{d.key}</Text>
            <Text style={{ color: d.kcal > goal ? t.danger : t.textMuted, fontWeight: '600' }}>{d.kcal} / {goal} kcal</Text>
          </View>
          {d.meals.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button" accessibilityLabel={`${m.items.map((i) => i.name).join(', ') || 'Meal'}. Edit`}
                onPress={() => router.push({ pathname: '/meal/[id]', params: { id: m.id } })}
                style={{ flex: 1, minHeight: MIN_TOUCH, justifyContent: 'center' }}
              >
                <Text numberOfLines={1} style={{ color: t.text }}>{m.items.map((i) => i.name).join(', ') || 'Meal'}</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>{m.mealType} · {mealTotals(m.items).kcal} kcal</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Delete meal" onPress={() => confirmDelete(m)} style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: t.danger, fontWeight: '600' }}>Delete</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    />
  );
}
