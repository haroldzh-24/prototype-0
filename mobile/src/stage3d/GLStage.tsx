import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import type { ViewStyle } from 'react-native';
import type { Scene } from './scene';
import type { Mat4 } from './math';
import { createRenderer } from './renderer';
import type { GLContext, Renderer } from './renderer';

/**
 * The GL surface. expo-gl is loaded lazily: a build without its native module (anything before the 3D release) gets
 * a message and the 2D plan instead of a crash.
 */
type GLViewProps = { style?: ViewStyle; msaaSamples?: number; onContextCreate: (gl: GLContext) => void };
let GLView: ComponentType<GLViewProps> | null = null, loadError = '';
try {
  GLView = require('expo-gl').GLView;
} catch (error) {
  loadError = error instanceof Error ? error.message : String(error);
}
/** Why 3D cannot run here, or null when it can. */
export const glUnavailable = (): string | null => GLView ? null : (loadError || '3D needs a newer build of the app.');

export default function GLStage({ scene, viewProj, clear, onError }: {
  scene: Scene; viewProj: Mat4; clear: [number, number, number]; onError: (message: string) => void;
}) {
  const renderer = useRef<Renderer | null>(null), uploaded = useRef<Scene | null>(null), frame = useRef<number | null>(null);
  const latest = useRef({ scene, viewProj, clear, onError });
  latest.current = { scene, viewProj, clear, onError };
  // Draw on demand, at most once per frame however many changes arrive.
  const request = useRef(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const r = renderer.current, { scene: s, viewProj: m, clear: c } = latest.current;
      if (!r) return;
      try {
        if (uploaded.current !== s) { r.setScene(s); uploaded.current = s; }
        r.draw(m, c);
      } catch (error) { latest.current.onError(error instanceof Error ? error.message : String(error)); }
    });
  }).current;
  useEffect(request, [scene, viewProj, clear, request]);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    try { renderer.current?.dispose(); } catch { /* context already gone */ }
    renderer.current = null;
  }, []);
  if (!GLView) return null;
  return <GLView style={{ flex: 1 }} msaaSamples={4} onContextCreate={gl => {
    try { renderer.current = createRenderer(gl); uploaded.current = null; request(); }
    catch (error) { latest.current.onError(error instanceof Error ? error.message : String(error)); }
  }} />;
}
