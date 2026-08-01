// ============================================================
// PressableScale - tactile press feedback with spring physics
// Pure RN Animated, no third-party dependencies.
// ============================================================

import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

type Props = PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
};

export default function PressableScale({ children, style, pressedScale = 0.975, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      stiffness: 420,
      damping: 24,
      mass: 0.6,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        {...rest}
        onPressIn={(e) => { animateTo(pressedScale); rest.onPressIn?.(e); }}
        onPressOut={(e) => { animateTo(1); rest.onPressOut?.(e); }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
