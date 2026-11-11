import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDb } from '@/db/database';
import { useSettingsStore } from '@/state/settingsStore';
import { useTheme } from '@/theme';

export default function RootLayout() {
  const t = useTheme();
  const [ready, setReady] = React.useState(false);
  const loadSettings = useSettingsStore((s) => s.load);
  React.useEffect(() => {
    (async () => {
      await getDb();
      await loadSettings();
      setReady(true);
    })().catch(() => setReady(true));
  }, [loadSettings]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Loading" color={t.primary} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="capture" options={{ presentation: 'modal', title: 'Add meal' }} />
        <Stack.Screen name="meal/[id]" options={{ title: 'Meal' }} />
      </Stack>
    </>
  );
}
