import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ConfidenceBadge } from './ConfidenceBadge';
import { Field, NumberField } from './ui';
import { itemMacros, MAX_GRAMS, MIN_GRAMS } from '@/domain/nutrition';
import { fromDisplayWeight, toDisplayWeight, type Units } from '@/domain/format';
import type { DraftItem } from '@/state/draftMealStore';
import { MIN_TOUCH, radius, space, useTheme } from '@/theme';

function ItemRowImpl({ item, units, onChange, onRemove }: {
  item: DraftItem; units: Units; onChange: (id: string, patch: Partial<DraftItem>) => void; onRemove: (id: string) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = React.useState(false);
  const m = itemMacros(item);
  const step = units === 'oz' ? 0.5 : 10;
  const bump = (dir: 1 | -1) => {
    const shown = toDisplayWeight(item.grams, units) + dir * step;
    onChange(item.id, { grams: Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, fromDisplayWeight(shown, units))) });
  };
  const stepBtn = (label: string, dir: 1 | -1, a11y: string) => (
    <Pressable
      accessibilityRole="button" accessibilityLabel={a11y} onPress={() => bump(dir)} hitSlop={4}
      style={{ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: t.text, fontSize: 22 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: space.sm, paddingVertical: space.md, borderBottomColor: t.border, borderBottomWidth: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Field label="Name" value={item.name} maxLength={80} onChangeText={(name) => onChange(item.id, { name })} />
        </View>
        <ConfidenceBadge confidence={item.confidence} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {stepBtn('−', -1, `Decrease ${item.name} weight`)}
        <NumberField
          label={`Weight (${units})`} value={toDisplayWeight(item.grams, units)} decimals={units === 'oz' ? 1 : 0} min={0}
          onCommit={(n) => onChange(item.id, { grams: fromDisplayWeight(n, units) })}
        />
        {stepBtn('+', 1, `Increase ${item.name} weight`)}
        <View style={{ alignItems: 'flex-end', minWidth: 72 }} accessible accessibilityLabel={`${m.kcal} kilocalories`}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>{m.kcal}</Text>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>kcal</Text>
        </View>
      </View>
      <Text style={{ color: t.textMuted, fontSize: 13 }} accessibilityLabel={`Protein ${m.protein} grams, carbs ${m.carbs} grams, fat ${m.fat} grams`}>
        P {m.protein} g · C {m.carbs} g · F {m.fat} g
      </Text>
      <View style={{ flexDirection: 'row', gap: space.lg }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text style={{ color: t.primary, fontWeight: '600' }}>{open ? 'Hide nutrition per 100 g' : 'Edit nutrition per 100 g'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={() => onRemove(item.id)} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text style={{ color: t.danger, fontWeight: '600' }}>Remove</Text>
        </Pressable>
      </View>
      {open ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <NumberField label="kcal" value={item.kcalPer100g} max={900} onCommit={(n) => onChange(item.id, { kcalPer100g: n })} />
          <NumberField label="Protein" value={item.proteinPer100g} max={100} onCommit={(n) => onChange(item.id, { proteinPer100g: n })} />
          <NumberField label="Carbs" value={item.carbsPer100g} max={100} onCommit={(n) => onChange(item.id, { carbsPer100g: n })} />
          <NumberField label="Fat" value={item.fatPer100g} max={100} onCommit={(n) => onChange(item.id, { fatPer100g: n })} />
        </View>
      ) : null}
    </View>
  );
}
export const ItemRow = React.memo(ItemRowImpl);
