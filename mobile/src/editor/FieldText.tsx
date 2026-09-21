import { colors, typography } from '../ui/tokens';
import { Text as NativeText } from 'react-native';
import type { TextProps } from 'react-native';

/** Shared presentation baseline; explicit local styles can still override it. */
export default function FieldText({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ ...typography.body, color: colors.text }, style]} />;
}
