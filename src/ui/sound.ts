/** UI sounds by name, through whatever the audio module offers (silently skipped if a name is unknown). */
import { sfx } from '../audio/sfx';

export function uiSound(name: string, level?: number): void {
  try {
    (sfx as unknown as { play: (n: string, l?: number) => void }).play(name, level);
  } catch {
    // Unknown sound: stay quiet.
  }
}
