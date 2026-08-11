import { ScrollView, ScrollViewProps } from 'react-native';

type Props = ScrollViewProps & {
  /** Kept for call-site compatibility; ignored on purpose. */
  bottomOffset?: number;
};

/**
 * Plain ScrollView wrapper.
 * react-native-keyboard-controller's KeyboardAwareScrollView has crashed
 * Expo Go on some SDK 54 builds, so we keep forms simple and stable.
 */
export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = 'handled',
  bottomOffset: _bottomOffset,
  ...props
}: Props) {
  return (
    <ScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode="on-drag"
      {...props}
    >
      {children}
    </ScrollView>
  );
}
