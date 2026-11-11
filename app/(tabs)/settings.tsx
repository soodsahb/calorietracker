import React from 'react';
import { Alert, ScrollView, Share, Switch, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportAll, deleteAllData } from '@/services/data';
import { Button, Card, NumberField } from '@/components/ui';
import { useSettingsStore } from '@/state/settingsStore';
import { useTodayStore } from '@/state/todayStore';
import { MIN_TOUCH, space, useTheme } from '@/theme';

export const PRIVACY_TEXT =
  'No account and no tracking. When you analyze a meal, a downscaled copy of the photo (location data removed) and your optional note ' +
  'are sent to our server, which forwards them to Google Gemini to estimate the food. Our server does not store photos, notes or results. ' +
  'Your meals stay in this app on your device. Your install is identified by a random anonymous token.';
export const DISCLAIMER = 'Calorie and nutrient values are AI estimates and may be inaccurate. This app is not medical advice.';

export default function Settings() {
  const t = useTheme();
  const { settings, update, reset } = useSettingsStore();

  const onExport = async () => {
    try {
      const json = await exportAll();
      const file = new File(Paths.cache, 'calorietracker-export.json');
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export data' });
      else await Share.share({ message: json });
    } catch {
      Alert.alert('Export failed', 'Could not export your data.');
    }
  };
  const onDelete = () =>
    Alert.alert('Delete all data?', 'This removes every meal, photo, setting and your install token from this device. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete everything', style: 'destructive', onPress: async () => { await deleteAllData(); reset(); useTodayStore.getState().reset(); } },
    ]);

  const goal = (label: string, key: 'kcalGoal' | 'proteinGoal' | 'carbsGoal' | 'fatGoal', max: number) => (
    <NumberField label={label} value={settings[key]} min={0} max={max} decimals={0} onCommit={(n) => update({ [key]: Math.round(n) })} />
  );
  const row = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TOUCH }}>
      <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: t.primary }} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: space.md }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Daily goals</Text>
        {goal('Calories (kcal)', 'kcalGoal', 10000)}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {goal('Protein (g)', 'proteinGoal', 1000)}
          {goal('Carbs (g)', 'carbsGoal', 1500)}
          {goal('Fat (g)', 'fatGoal', 600)}
        </View>
      </Card>
      <Card style={{ gap: space.md }}>
        {row('Show weights in ounces', settings.units === 'oz', (v) => update({ units: v ? 'oz' : 'g' }))}
        {row('Store photos on this device', settings.storePhotos, (v) => update({ storePhotos: v }))}
      </Card>
      <Card style={{ gap: space.md }}>
        <Button title="Export data (JSON)" variant="secondary" onPress={onExport} />
        <Button title="Delete all data" variant="danger" onPress={onDelete} />
      </Card>
      <Card style={{ gap: space.sm }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Privacy</Text>
        <Text style={{ color: t.textMuted, lineHeight: 21 }}>{PRIVACY_TEXT}</Text>
        <Text style={{ color: t.textMuted, lineHeight: 21, fontWeight: '600' }}>{DISCLAIMER}</Text>
      </Card>
    </ScrollView>
  );
}
