// ============================================================
// SwipeBackView - in-app swipe-back for pushed sub-pages
// ------------------------------------------------------------
// Native-stack on Android only supports the system predictive
// back gesture, which triggers only when the touch starts in the
// narrow bezel zone (~30dp). A real finger often starts 100-300px
// inside the screen, so the swipe does nothing. This wrapper adds
// a pure-JS rightward-swipe detector (left half of the screen)
// that calls goBack() on release, without stealing taps or
// vertical scrolls.
// ============================================================

import React, { useRef } from 'react';
import { View, PanResponder, ViewStyle, Dimensions } from 'react-native';

type Props = {
  onSwipeBack: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
};

const START_ZONE_RATIO = 0.5;        // only start tracking in left 50% of screen
const CLAIM_DX = 14;                 // horizontal distance before claiming gesture
const DIRECTION_SLOPE = 1.4;         // require |dx| > 1.4 * |dy| to ignore vertical scrolls
const COMMIT_DISTANCE = 80;          // release after dragging this far -> go back
const FLICK_MIN_DISTANCE = 30;       // short drags must also travel this far
const FLICK_VELOCITY = 0.5;          // ... with enough rightward velocity

export default function SwipeBackView({ onSwipeBack, children, style }: Props) {
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, g) => {
        const { dx, dy, x0, y0, moveX, moveY } = g;
        const screenWidth = Dimensions.get('window').width;
        if (!active.current && x0 <= screenWidth * START_ZONE_RATIO && dx > CLAIM_DX && Math.abs(dx) > Math.abs(dy) * DIRECTION_SLOPE) {
          startX.current = moveX;
          startY.current = moveY;
          active.current = true;
          return true;
        }
        return active.current;
      },
      onPanResponderMove: () => {},
      onPanResponderRelease: (_evt, g) => {
        active.current = false;
        const traveled = g.moveX - startX.current;
        if (traveled > COMMIT_DISTANCE || (traveled > FLICK_MIN_DISTANCE && g.vx > FLICK_VELOCITY)) {
          onSwipeBack();
        }
      },
      onPanResponderTerminate: () => {
        active.current = false;
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <View style={[{ flex: 1 }, style]} {...responder.panHandlers}>
      {children}
    </View>
  );
}
