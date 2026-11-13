/**
 * Jest stand-in for react-native-reanimated.
 *
 * The real package cannot initialise in this project's Jest environment
 * (react-native-worklets' native module is undefined: "loadUnpackers"), and the
 * official `react-native-reanimated/mock` imports the same worklets code, so it
 * fails the same way. This file is picked up automatically for node modules
 * (adjacent to node_modules) and provides just what the app uses so screens can
 * render in tests. Animations are not run: shared values are plain objects and
 * the with* helpers return their target value immediately.
 */
const React = require('react');
const RN = require('react-native');

const passthrough = (Component) => Component;

const Animated = {
  View: RN.View,
  Text: RN.Text,
  Image: RN.Image,
  ScrollView: RN.ScrollView,
  FlatList: RN.FlatList,
  createAnimatedComponent: passthrough,
};

// Easing.* functions are only ever passed back into with* helpers; any call returns a function.
const identity = (x) => x;
const Easing = new Proxy(
  {},
  {
    get: () => (..._args) => identity,
  },
);

const useSharedValue = (initial) => React.useRef({ value: initial }).current;
const useAnimatedStyle = (factory) => {
  try {
    return factory();
  } catch {
    return {};
  }
};

const withTiming = (toValue) => toValue;
const withDelay = (_delay, animation) => animation;
const withRepeat = (animation) => animation;
const withSequence = (...animations) => animations[animations.length - 1];

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
};
