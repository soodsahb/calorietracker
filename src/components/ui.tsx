import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { MIN_TOUCH, radius, space, useTheme } from '@/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderRadius: radius.md, padding: space.lg, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }, style]}>{children}</View>;
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({
  title, onPress, variant = 'primary', disabled, loading, accessibilityHint, style,
}: {
  title: string; onPress: () => void; variant?: Variant; disabled?: boolean; loading?: boolean;
  accessibilityHint?: string; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : variant === 'secondary' ? t.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? t.onPrimary : variant === 'danger' ? '#FFFFFF' : t.text;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: MIN_TOUCH + 4, borderRadius: radius.pill, paddingHorizontal: space.xl, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const t = useTheme();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: t.textMuted, fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.textMuted}
        {...rest}
        style={[{ minHeight: MIN_TOUCH, borderRadius: radius.sm, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, color: t.text, paddingHorizontal: space.md, fontSize: 16 }, style]}
      />
    </View>
  );
}

/** Numeric field that keeps its own text while typing and commits valid numbers. */
export function NumberField({ label, value, onCommit, min = 0, max, decimals = 1, style }: {
  label: string; value: number; onCommit: (n: number) => void; min?: number; max?: number; decimals?: number; style?: StyleProp<ViewStyle>;
}) {
  const fmt = (n: number) => `${Math.round(n * 10 ** decimals) / 10 ** decimals}`;
  const [text, setText] = React.useState(fmt(value));
  const [focused, setFocused] = React.useState(false);
  React.useEffect(() => {
    if (!focused) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const commit = (s: string) => {
    const n = Number(s.replace(',', '.'));
    if (s.trim() !== '' && Number.isFinite(n)) {
      onCommit(Math.min(max ?? Infinity, Math.max(min, n)));
    }
  };
  return (
    <View style={[{ flex: 1 }, style]}>
      <Field
        label={label}
        value={text}
        keyboardType="decimal-pad"
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit(text); setText(fmt(value)); }}
        onChangeText={(s) => { setText(s); commit(s); }}
        selectTextOnFocus
      />
    </View>
  );
}
