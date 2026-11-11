import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Image } from 'expo-image';
import Slider from '@react-native-community/slider';
import * as Crypto from 'expo-crypto';
import { ApiError } from '@/api';
import { Button, Card } from '@/components/ui';
import { ItemRow } from '@/components/ItemRow';
import { ClarifySheet } from '@/components/ClarifySheet';
import { buildClarifyPrompt, shouldClarify } from '@/domain/clarify';
import { mealTotals, SLIDER_MAX, SLIDER_MIN } from '@/domain/nutrition';
import { MEAL_TYPES, type Meal } from '@/domain/types';
import { mealsRepo } from '@/db/mealsRepo';
import { persistPhoto, deletePhoto } from '@/image/photos';
import { analyzeWithCache } from '@/services/analyze';
import { useDraftMealStore } from '@/state/draftMealStore';
import { useSettingsStore } from '@/state/settingsStore';
import { useTodayStore } from '@/state/todayStore';
import { MIN_TOUCH, radius, space, useTheme } from '@/theme';

export default function MealScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const units = useSettingsStore((s) => s.settings.units);
  const storePhotos = useSettingsStore((s) => s.settings.storePhotos);
  const store = useDraftMealStore();
  const { draft } = store;
  const [loading, setLoading] = React.useState(id !== 'new');
  const [sheet, setSheet] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [sheetError, setSheetError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const askedRef = React.useRef(false);

  // load existing meal into the draft
  React.useEffect(() => {
    if (id === 'new') return;
    let live = true;
    mealsRepo.get(id).then(
      (m) => {
        if (!live) return;
        if (m) store.startFromMeal(m);
        setLoading(false);
      },
      () => {
        // DB error: fall through to "Meal not found" instead of spinning forever
        if (live) setLoading(false);
      },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // clear draft when leaving
  React.useEffect(() => () => useDraftMealStore.getState().clear(), []);

  // open ClarifySheet once for a fresh AI analysis that needs it
  React.useEffect(() => {
    if (id !== 'new' || !draft?.analysis || askedRef.current) return;
    askedRef.current = true;
    if (!draft.analysis.notFood && shouldClarify({ items: draft.items, needsClarification: draft.analysis.needsClarification })) setSheet(true);
  }, [id, draft]);

  if (loading || !draft) {
    return <View style={{ flex: 1, backgroundColor: t.bg }}><Text style={{ color: t.textMuted, padding: space.xl }}>{loading ? 'Loading…' : 'Meal not found.'}</Text></View>;
  }

  const totals = mealTotals(draft.items);
  const canReanalyze = draft.source === 'ai' && !!draft.photoUri && !!draft.imageHash;
  const prompt = buildClarifyPrompt({
    items: draft.items, needsClarification: !!draft.analysis?.needsClarification,
    clarifyingQuestion: draft.analysis?.clarifyingQuestion ?? 'Add details to improve the estimate',
    suggestedAnswers: draft.analysis?.suggestedAnswers ?? [],
  });

  const reanalyze = async (note: string) => {
    if (!draft.photoUri) return;
    setBusy(true);
    setSheetError(null);
    try {
      const prev = draft.items.map(({ name, grams, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, confidence }) => ({
        name, grams, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, confidence,
      }));
      const analysis = await analyzeWithCache({ imageUri: draft.photoUri, imageHash: draft.imageHash, note, previousItems: prev });
      store.applyReanalysis(note, analysis);
      setSheet(false);
    } catch (e) {
      setSheetError(e instanceof ApiError ? e.message : 'Could not re-analyze. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (draft.items.length === 0) { Alert.alert('Add at least one item', 'A meal needs at least one food item.'); return; }
    setSaving(true);
    try {
      const mealId = draft.mealId ?? Crypto.randomUUID();
      const now = new Date().toISOString();
      let photoUri = draft.photoUri;
      if (!storePhotos) {
        if (photoUri) deletePhoto(photoUri);
        photoUri = undefined;
      } else if (photoUri && !photoUri.includes('/photos/')) {
        photoUri = persistPhoto(photoUri, mealId);
      }
      const meal: Meal = {
        id: mealId, loggedAt: draft.loggedAt, mealType: draft.mealType, photoUri, imageHash: draft.imageHash,
        note: draft.note || undefined, source: draft.source, createdAt: draft.createdAt ?? now, updatedAt: now,
        items: draft.items.map((i) => ({ ...i, mealId })),
      };
      await mealsRepo.save(meal);
      await useTodayStore.getState().load();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this meal. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: draft.mealId ? 'Edit meal' : 'Review meal' }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {draft.photoUri ? <Image source={{ uri: draft.photoUri }} style={{ height: 180, borderRadius: radius.md }} contentFit="cover" accessibilityLabel="Meal photo" /> : null}
        {draft.analysis?.notFood ? <Card><Text style={{ color: t.warn }}>This does not look like food. You can add items manually.</Text></Card> : null}

        <Card style={{ gap: space.sm }}>
          <Text accessibilityLabel={`Total ${totals.kcal} kilocalories`} style={{ color: t.text, fontSize: 34, fontWeight: '800' }}>{totals.kcal} kcal</Text>
          <Text style={{ color: t.textMuted }}>Protein {totals.protein} g · Carbs {totals.carbs} g · Fat {totals.fat} g</Text>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>Estimates only; not medical advice.</Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          {MEAL_TYPES.map((mt) => {
            const on = draft.mealType === mt;
            return (
              <Pressable key={mt} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => store.setMealType(mt)}
                style={{ minHeight: MIN_TOUCH, paddingHorizontal: space.lg, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: on ? t.primary : t.surfaceAlt }}>
                <Text style={{ color: on ? t.onPrimary : t.text, fontWeight: '600', textTransform: 'capitalize' }}>{mt}</Text>
              </Pressable>
            );
          })}
        </View>

        <Card style={{ gap: space.sm }}>
          <Text style={{ color: t.text, fontWeight: '600' }} accessibilityLiveRegion="polite">Portion: {draft.portion.toFixed(2)}x</Text>
          <Slider
            minimumValue={SLIDER_MIN} maximumValue={SLIDER_MAX} step={0.05} value={draft.portion}
            onValueChange={store.setPortion}
            minimumTrackTintColor={t.primary} thumbTintColor={t.primary} maximumTrackTintColor={t.ringTrack}
            accessibilityLabel="Portion size multiplier" accessibilityValue={{ min: SLIDER_MIN, max: SLIDER_MAX, now: draft.portion, text: `${draft.portion.toFixed(2)} times` }}
            style={{ height: MIN_TOUCH }}
          />
        </Card>

        <Card>
          {draft.items.length === 0 ? <Text style={{ color: t.textMuted }}>No items yet.</Text> : null}
          {draft.items.map((it) => <ItemRow key={it.id} item={it} units={units} onChange={store.updateItem} onRemove={store.removeItem} />)}
          <View style={{ paddingTop: space.md }}>
            <Button title="Add item" variant="secondary" onPress={store.addItem} />
          </View>
        </Card>

        {canReanalyze ? <Button title="Re-analyze with note" variant="secondary" onPress={() => { setSheetError(null); setSheet(true); }} /> : null}
        <Button title="Save meal" onPress={save} loading={saving} />
      </ScrollView>
      <ClarifySheet visible={sheet} prompt={prompt} busy={busy} error={sheetError} onSubmit={reanalyze} onSkip={() => setSheet(false)} />
    </>
  );
}
