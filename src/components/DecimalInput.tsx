// ============================================================
// DecimalInput - Android-friendly decimal number input
// ------------------------------------------------------------
// Keeps the raw text in local state so typing a trailing decimal
// point ("0.") is not erased by a controlled numeric value round-
// trip. Uses keyboardType="numeric" (shows the dot on Android
// numeric pads) and reports the parsed number via onValue.
// ============================================================

import React, { useState } from 'react';
import { TextInput, TextInputProps, StyleProp, TextStyle } from 'react-native';
import { Colors } from '../theme';

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> & {
  value: number | null | undefined;
  onValue: (n: number | null) => void;
  style?: StyleProp<TextStyle>;
};

export default function DecimalInput({ value, onValue, style, ...rest }: Props) {
  const [text, setText] = useState(value == null ? '' : String(value));

  return (
    <TextInput
      {...rest}
      style={style}
      value={text}
      keyboardType="numeric"
      placeholderTextColor={Colors.textMuted}
      onChangeText={(t) => {
        // 只允许数字与一个小数点（"12" "0.6" "."）
        if (t !== '' && !/^\d*\.?\d*$/.test(t)) return;
        setText(t);
        const n = t === '' ? null : parseFloat(t);
        onValue(n == null || Number.isNaN(n) ? null : n);
      }}
    />
  );
}
