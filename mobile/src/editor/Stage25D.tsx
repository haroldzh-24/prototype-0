import { colors } from '../ui/tokens';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Text from '@/editor/FieldText';
import { Image } from 'expo-image';
import type { StageDocument } from '@/stage/model';
import { stageSvg } from '@/stage/projection';

export default function Stage25D({ stage, selectedId }: { stage: StageDocument; selectedId: string | null }) {
  const [yaw, setYaw] = useState(45);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const uri = useMemo(() => 'data:image/svg+xml;base64,' + btoa(stageSvg(stage, yaw, zoom, selectedId)), [stage, yaw, zoom, selectedId]);
  return <View style={{ flex: 1, gap: 8, padding: 8 }}>
    <Text>2.5D preview — switch to Top Down to edit. Ground grid: 5 feet. Blue outlines mark the selected object.</Text>
    <Image source={{ uri }} style={{ width: '100%', flex: 1, minHeight: 80, backgroundColor: colors.panel }} contentFit="contain"
      cachePolicy="none" transition={0} accessibilityLabel="Read-only projected stage visualization"
      onError={() => setError('The 2.5D preview could not be displayed on this device. Top Down remains available.')}
      onLoad={() => setError('')} />
    {error !== '' && <Text accessibilityLiveRegion="polite">{error}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {[
        { label: 'View left', action: () => setYaw(value => (value + 345) % 360), disabled: false },
        { label: 'View right', action: () => setYaw(value => (value + 15) % 360), disabled: false },
        { label: 'Zoom out', action: () => setZoom(value => Math.max(0.5, value / 1.25)), disabled: zoom <= 0.5 },
        { label: 'Zoom in', action: () => setZoom(value => Math.min(3, value * 1.25)), disabled: zoom >= 3 },
      ].map(control => <Pressable key={control.label} accessibilityRole="button" disabled={control.disabled}
        accessibilityState={{ disabled: control.disabled }} onPress={control.action}
        style={{ backgroundColor: colors.secondary, padding: 10, minHeight: 44, borderBottomWidth: 1, borderColor: colors.border, opacity: control.disabled ? 0.4 : 1 }}>
        <Text style={{ color: colors.text }}>{control.label}</Text>
      </Pressable>)}
    </View>
    <Text>Camera {yaw}° · {Math.round(zoom * 100)}%. Openings are cut through walls; surface ordering is approximate.</Text>
  </View>;
}
