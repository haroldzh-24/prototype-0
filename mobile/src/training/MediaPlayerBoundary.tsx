import { Component } from 'react';
import type { ReactNode } from 'react';
import { Action, Copy, Panel } from '../ui/kit';

/** A failed native player initialization must not hide the saved annotation editor. */
export class MediaPlayerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <Panel><Copy>Playback is unavailable. Your annotations remain accessible below. You can retry playback or continue manual editing.</Copy>
      <Action title="Retry playback" onPress={() => this.setState({ failed: false })} /></Panel> : this.props.children;
  }
}
