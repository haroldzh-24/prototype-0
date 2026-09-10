import { Text as NativeText } from 'react-native';
import type { TextProps } from 'react-native';

/** Shared presentation baseline; explicit local styles can still override it. */
export default function FieldText({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ color: '#e1e5db', fontSize: 12 }, style]} />;
}
