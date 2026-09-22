import type { CloseExtraction, CloseSelection } from './closeUp';
import type { VideoSession } from './videoModel';
export async function extractCloseUp(_session: VideoSession, _selection: CloseSelection, _job: string, _signal: AbortSignal, _progress: (n: number) => void): Promise<CloseExtraction> {
  throw new Error('Local close-up analysis requires the rebuilt iOS app. Browser manual editing remains available.');
}
