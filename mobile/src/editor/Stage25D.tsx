import { colors } from '../ui/tokens';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Text from '@/editor/FieldText';
import { Image } from 'expo-image';
import type { StageDocument } from '@/stage/model';
import { stageSvg } from '@/stage/projection';

export default function Stage25D({ stage, selectedId, back }: { stage: StageDocument; selectedId: string | null; back: () => void }) {
  const [yaw, setYaw] = useState(45);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const uri = useMemo(() => 'data:image/svg+xml;base64,' + btoa(stageSvg(stage, yaw, zoom, selectedId)), [stage, yaw, zoom, selectedId]);
  return <View style={{ flex: 1, gap: 8, padding: 8 }}>
    <Text>2.5D / READ ONLY</Text>
    <Image source={{ uri }} style={{ width: '100%', flex: 1, minHeight: 80, backgroundColor: colors.panel }} contentFit="contain"
      cachePolicy="none" transition={0} accessibilityLabel="Read-only projected stage visualization"
      onError={() => setError('The 2.5D preview could not be displayed on this device. Top Down remains available.')}
      onLoad={() => setError('')} />
    {error !== '' && <Text accessibilityLiveRegion="polite">{error}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {[
        { label: 'Rotate left', action: () => setYaw(value => (value + 345) % 360), disabled: false },
        { label: 'Rotate right', action: () => setYaw(value => (value + 15) % 360), disabled: false },
        { label: 'Zoom out', action: () => setZoom(value => Math.max(0.5, value / 1.25)), disabled: zoom <= 0.5 },
        { label: 'Zoom in', action: () => setZoom(value => Math.min(3, value * 1.25)), disabled: zoom >= 3 },
        { label: 'Fit', action: () => { setYaw(45); setZoom(1); }, disabled: false },
        { label: 'Back', action: back, disabled: false },
      ].map(control => <Pressable key={control.label} accessibilityRole="button" disabled={control.disabled}
        accessibilityState={{ disabled: control.disabled }} onPress={control.action}
        style={{ backgroundColor: colors.secondary, padding: 10, minHeight: 44, minWidth: 44, maxWidth: '100%', flexShrink: 1, borderBottomWidth: 1, borderColor: colors.border, opacity: control.disabled ? 0.4 : 1 }}>
        <Text style={{ color: colors.text }}>{control.label}</Text>
      </Pressable>)}
    </View>
    <Text>{yaw} degrees / {Math.round(zoom * 100)}%</Text>
  </View>;
}
