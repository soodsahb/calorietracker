import React from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

type P = { color: ColorValue; size?: number };
const base = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const });

export const TodayIcon = ({ color, size }: P) => (
  <Svg {...base(size)}><Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={2} /><Path d="M12 4a8 8 0 0 1 8 8" stroke={color} strokeWidth={4} strokeLinecap="round" /></Svg>
);
export const HistoryIcon = ({ color, size }: P) => (
  <Svg {...base(size)}><Path d="M4 5h16M4 12h16M4 19h10" stroke={color} strokeWidth={2} strokeLinecap="round" /></Svg>
);
export const SettingsIcon = ({ color, size }: P) => (
  <Svg {...base(size)}><Path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke={color} strokeWidth={2} strokeLinecap="round" /><Circle cx="16" cy="7" r="2.5" stroke={color} strokeWidth={2} /><Circle cx="8" cy="17" r="2.5" stroke={color} strokeWidth={2} /></Svg>
);
