import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { composeNote, type ClarifyPrompt } from '@/domain/clarify';
import { NOTE_MAX } from '@shared/schema';
import { Button, Field } from './ui';
import { MIN_TOUCH, radius, space, useTheme } from '@/theme';

/** Plain-text only: model strings are never rendered as markdown/HTML. */
export function ClarifySheet({ visible, prompt, busy, error, onSubmit, onSkip }: {
  visible: boolean; prompt: ClarifyPrompt; busy?: boolean; error?: string | null;
  onSubmit: (note: string) => void; onSkip: () => void;
}) {
  const t = useTheme();
  const [chip, setChip] = React.useState<string | null>(null);
  const [text, setText] = React.useState('');
  React.useEffect(() => {
    if (visible) { setChip(null); setText(''); }
  }, [visible]);
  const note = composeNote(chip, text, NOTE_MAX);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onSkip} accessibilityViewIsModal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.xl, gap: space.lg, maxHeight: '85%' }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.lg }}>
            <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>{prompt.question}</Text>
            {prompt.chips.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {prompt.chips.map((c) => {
                  const on = chip === c;
                  return (
                    <Pressable
                      key={c} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setChip(on ? null : c)}
                      style={{ minHeight: MIN_TOUCH, paddingHorizontal: space.lg, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: on ? t.primary : t.surfaceAlt }}
                    >
                      <Text style={{ color: on ? t.onPrimary : t.text, fontWeight: '600' }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <Field label="Add details (optional)" value={text} onChangeText={setText} maxLength={NOTE_MAX} multiline placeholder="e.g. whole-wheat bread, ham and cheese" />
            {error ? <Text accessibilityLiveRegion="polite" style={{ color: t.danger }}>{error}</Text> : null}
            <View style={{ gap: space.sm }}>
              <Button title="Re-analyze" loading={busy} disabled={note.length === 0} onPress={() => onSubmit(note)} accessibilityHint="Sends your answer with the same photo for a better estimate" />
              <Button title="Keep as is" variant="ghost" disabled={busy} onPress={onSkip} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
