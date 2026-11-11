import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { ApiError, errorMessage } from '@/api';
import { Button, Field } from '@/components/ui';
import { prepareImage } from '@/image/prepare';
import { analyzeWithCache } from '@/services/analyze';
import { useDraftMealStore } from '@/state/draftMealStore';
import { NOTE_MAX } from '@shared/schema';
import { MIN_TOUCH, radius, space, useTheme } from '@/theme';

export default function Capture() {
  const t = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = React.useRef<CameraView>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; retryable: boolean } | null>(null);
  const lastUri = React.useRef<string | null>(null);
  const { startFromAnalysis, startManual } = useDraftMealStore();

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const analyze = React.useCallback(async (sourceUri: string) => {
    lastUri.current = sourceUri;
    setBusy(true);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const prepared = await prepareImage(sourceUri);
      if (ctrl.signal.aborted) return;
      const analysis = await analyzeWithCache({ imageUri: prepared.uri, imageHash: prepared.hash, note, signal: ctrl.signal });
      startFromAnalysis({ photoUri: prepared.uri, imageHash: prepared.hash, note, analysis });
      router.replace({ pathname: '/meal/[id]', params: { id: 'new' } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'cancelled') { setBusy(false); return; }
      const msg = e instanceof ApiError
        ? e.code === 'rate_limited' && e.retryAfterSeconds
          ? `${errorMessage('rate_limited')} Try again in about ${Math.ceil(e.retryAfterSeconds / 60)} min.`
          : e.message
        : 'Could not process that photo. Please try another.';
      setError({ message: msg, retryable: !(e instanceof ApiError) || e.retryable });
      setBusy(false);
    }
  }, [note, startFromAnalysis]);

  const shoot = async () => {
    const pic = await camRef.current?.takePictureAsync({ quality: 0.8 });
    if (pic?.uri) await analyze(pic.uri);
  };
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (!res.canceled && res.assets[0]) await analyze(res.assets[0].uri);
  };
  const manual = () => { startManual(); router.replace({ pathname: '/meal/[id]', params: { id: 'new' } }); };
  const cancel = () => { abortRef.current?.abort(); setBusy(false); };

  if (busy) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl, backgroundColor: t.bg }}>
        <ActivityIndicator size="large" color={t.primary} />
        <Text accessibilityLiveRegion="polite" style={{ color: t.text, fontSize: 18 }}>Analyzing your meal…</Text>
        <Button title="Cancel" variant="secondary" onPress={cancel} />
      </View>
    );
  }

  const granted = permission?.granted;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, margin: space.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' }}>
        {granted ? (
          <CameraView ref={camRef} style={{ flex: 1 }} facing="back" accessibilityLabel="Camera preview" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md }}>
            <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16 }}>
              {permission && !permission.canAskAgain ? 'Camera access is off. Enable it in system settings, or choose a photo from your library.' : 'Allow camera access to photograph your meal, or choose a photo from your library.'}
            </Text>
            {permission?.canAskAgain !== false ? <Button title="Allow camera" onPress={() => requestPermission()} /> : null}
          </View>
        )}
      </View>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md }}>
        <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={NOTE_MAX} placeholder="e.g. homemade, no oil" returnKeyType="done" />
        {error ? (
          <View accessibilityLiveRegion="polite" style={{ gap: space.sm }}>
            <Text style={{ color: t.danger }}>{error.message}</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {error.retryable && lastUri.current ? <Button title="Try again" variant="secondary" onPress={() => analyze(lastUri.current!)} /> : null}
              <Button title="Enter manually" variant="secondary" onPress={manual} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button title="Gallery" variant="secondary" onPress={pick} />
          <Pressable
            accessibilityRole="button" accessibilityLabel="Take photo" disabled={!granted} onPress={shoot}
            style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: t.primary, alignItems: 'center', justifyContent: 'center', opacity: granted ? 1 : 0.4 }}
          >
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: t.primary }} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={manual} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.md }}>
            <Text style={{ color: t.primary, fontWeight: '600' }}>Manual</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
