/**
 * CrazyGames: the portal's SDK (v3), all of it behind this one file. The rest of the game talks to
 * `portal` (platform/portal.ts) and never to window.CrazyGames.
 *
 * The SDK's script is only on the page in the CrazyGames build (`npm run build:crazygames`: vite's
 * `crazygames` mode adds it to index.html). Anywhere else there is no window.CrazyGames and every
 * call here does nothing. On CrazyGames it reports loading and play, shows ads at the breaks the
 * game names, keeps saves on the player's account, says when to mute and what the device is.
 *
 * It runs in three places (SDK.environment): 'crazygames' (the real thing), 'local' (localhost: ads
 * are a grey sheet for five seconds, data stays in the browser) and 'disabled' (the build served from
 * some other site: the game plays on with no portal).
 */
import type { SaveStore } from '../core/save';

/** What an ad request came to. */
export type AdOutcome =
  /** It played to the end: a rewarded ad's reward is due. */
  | 'done'
  /** None to show just now (unfilled, too soon after the last, an ad blocker): try again later. */
  | 'none'
  /** Ads are off for this game or session (CrazyGames' Basic Launch, kids mode): stop offering them. */
  | 'off';

interface AdError {
  code?: string;
  message?: string;
}

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (e: AdError) => void;
}

interface GameSettings {
  muteAudio?: boolean;
  disableChat?: boolean;
}

interface CrazySdk {
  init(): Promise<void>;
  readonly environment: 'crazygames' | 'local' | 'disabled';
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings: GameSettings;
    addSettingsChangeListener(fn: (s: GameSettings) => void): void;
    reportGameCompletedPercentage?(pct: number): void;
    setGameContext?(ctx: Record<string, string | number>): void;
    clearGameContext?(): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: AdCallbacks): unknown;
  };
  data: SaveStore;
  user: {
    systemInfo?: { device?: { type?: 'desktop' | 'tablet' | 'mobile' }; locale?: string };
    addAuthListener?(fn: (user: unknown) => void): void;
  };
}

/** How long the SDK may take to answer before the game starts without it (its own wait for the portal's frame is 7 s). */
const INIT_WAIT_MS = 9000;
/** An ad that never calls back (a hung request) lets the game go after this long. */
const AD_WAIT_MS = 90_000;

function sdkOnPage(): CrazySdk | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK ?? null;
}

/** Calls into the SDK never take the game down with them. */
function safely<T>(fn: () => T, otherwise: T): T {
  try {
    return fn();
  } catch {
    return otherwise;
  }
}

function browserStore(): SaveStore | null {
  return safely(() => (typeof localStorage !== 'undefined' ? localStorage : null), null);
}

export class CrazyGames {
  private sdk: CrazySdk | null = null;
  /** What the game last said (gameplay), and what the SDK was last told: an ad on screen is never play. */
  private wanted = false;
  private playing = false;
  private loading = false;
  private adUp = false;
  private requesting = false;
  private rewardedOff = false;
  private frozen = false;
  private muteFns = new Set<(muted: boolean) => void>();

  /** The SDK answered and the game is on CrazyGames (or on localhost, standing in for it). */
  get on(): boolean {
    return this.sdk !== null;
  }

  /**
   * Starts the SDK (before the game reads its save: the save lives in the SDK's data). Resolves
   * whatever happens: no script on the page, an init that fails or takes too long, or the build
   * served from another site all leave the game running on its own.
   */
  async init(): Promise<void> {
    const sdk = sdkOnPage();
    if (!sdk) return;
    try {
      await Promise.race([sdk.init(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), INIT_WAIT_MS))]);
      if (safely(() => sdk.environment, 'disabled') === 'disabled') return;
    } catch {
      return;
    }
    this.sdk = sdk;
    safely(() => sdk.game.addSettingsChangeListener(() => this.tellMute()), undefined);
    // A guest who signs in mid-game: the SDK swaps in their account's data (or moves the guest's
    // progress onto a new account). Saving over it with what's in memory could wipe an account's
    // progress, so saving stops and the game starts again from whatever the account now holds.
    safely(
      () =>
        sdk.user.addAuthListener?.((user) => {
          if (!user) return;
          this.frozen = true;
          setTimeout(() => location.reload(), 1500);
        }),
      undefined,
    );
    // (Basic Launch has no ads: the SDK knows from the start, though it only says so when asked for one.)
    const flow = safely(() => (sdk.ad as unknown as { initInfo?: { launchFlow?: string } }).initInfo?.launchFlow, undefined);
    if (flow === 'basic') this.rewardedOff = true;
  }

  // ---------------------------------------------------------------- loading and play

  loadingStart(): void {
    if (!this.sdk || this.loading) return;
    this.loading = true;
    safely(() => this.sdk!.game.loadingStart(), undefined);
  }

  loadingStop(): void {
    if (!this.sdk || !this.loading) return;
    this.loading = false;
    safely(() => this.sdk!.game.loadingStop(), undefined);
  }

  /**
   * The player is playing (true) or on a break (the title, a menu over the game). The SDK hears each
   * change once; the first start is also where CrazyGames stops measuring the game's download.
   */
  gameplay(on: boolean): void {
    this.wanted = on;
    this.syncPlay();
  }

  private syncPlay(): void {
    const on = this.wanted && !this.adUp;
    if (!this.sdk || on === this.playing) return;
    this.playing = on;
    safely(() => (on ? this.sdk!.game.gameplayStart() : this.sdk!.game.gameplayStop()), undefined);
  }

  /** A moment worth the portal's confetti (a boss down for the first time, a rebirth). Sparingly. */
  happytime(): void {
    if (this.sdk) safely(() => this.sdk!.game.happytime(), undefined);
  }

  /** How far through the game the player is, 0 to 100 (the portal shows and uses it). */
  progress(pct: number): void {
    if (this.sdk) safely(() => this.sdk!.game.reportGameCompletedPercentage?.(Math.max(0, Math.min(100, Math.round(pct)))), undefined);
  }

  /** Where the player is, attached to any feedback they send from the portal. */
  context(ctx: Record<string, string | number> | null): void {
    if (!this.sdk) return;
    safely(() => (ctx ? this.sdk!.game.setGameContext?.(ctx) : this.sdk!.game.clearGameContext?.()), undefined);
  }

  // ---------------------------------------------------------------- sound

  /** The portal wants the game silent (its own mute switch), or an ad is playing. Above the game's own volume sliders. */
  get muted(): boolean {
    return this.adUp || (this.sdk ? safely(() => !!this.sdk!.game.settings.muteAudio, false) : false);
  }

  /** `fn` hears every change of `muted` (and its value now). */
  onMute(fn: (muted: boolean) => void): () => void {
    this.muteFns.add(fn);
    fn(this.muted);
    return () => this.muteFns.delete(fn);
  }

  private tellMute(): void {
    const m = this.muted;
    for (const fn of this.muteFns) safely(() => fn(m), undefined);
  }

  // ---------------------------------------------------------------- ads

  /** An ad is being asked for or is playing: the game waits (App pauses it and covers its buttons). */
  get busy(): boolean {
    return this.requesting;
  }

  /** Rewarded ads can be offered (false off CrazyGames, and once the SDK has said ads are off). */
  get rewards(): boolean {
    return this.sdk !== null && !this.rewardedOff;
  }

  /**
   * Asks for an ad and resolves when it's over, however it went. The game is `busy` from the ask to
   * the end; its sound goes only while an ad is really playing (most asks come back empty: the SDK
   * shows at most one midgame ad every three minutes and decides that itself).
   */
  ad(kind: 'midgame' | 'rewarded'): Promise<AdOutcome> {
    const sdk = this.sdk;
    if (!sdk || this.requesting) return Promise.resolve('none');
    if (kind === 'rewarded' && this.rewardedOff) return Promise.resolve('off');
    this.requesting = true;
    return new Promise<AdOutcome>((resolve) => {
      let over = false;
      const end = (outcome: AdOutcome) => {
        if (over) return;
        over = true;
        clearTimeout(giveUp);
        this.requesting = false;
        if (this.adUp) {
          this.adUp = false;
          this.tellMute();
          this.syncPlay();
          // (The ad had the keyboard: the game takes it back.)
          safely(() => window.focus(), undefined);
        }
        resolve(outcome);
      };
      const giveUp = setTimeout(() => end('none'), AD_WAIT_MS);
      try {
        sdk.ad.requestAd(kind, {
          adStarted: () => {
            if (over) return;
            this.adUp = true;
            this.tellMute();
            this.syncPlay();
          },
          adFinished: () => end('done'),
          adError: (e) => {
            const off = e?.code === 'adsDisabled';
            if (off && kind === 'rewarded') this.rewardedOff = true;
            end(off ? 'off' : 'none');
          },
        });
      } catch {
        end('none');
      }
    });
  }

  // ---------------------------------------------------------------- saves

  /**
   * Where saves go on CrazyGames: the SDK's data module (the player's account, on every device they
   * sign in on; the browser for a guest, moved to their account when they sign in). If the module is
   * switched off for this game in the Developer Portal it throws on every call: the browser's own
   * storage takes over then (which CrazyGames' automatic progress save can back up instead).
   */
  store(): SaveStore | null {
    const sdk = this.sdk;
    if (!sdk) return null;
    const local = browserStore();
    return {
      getItem: (key) => {
        try {
          const v = sdk.data.getItem(key);
          // (Nothing on the account yet: a save from before the data module, if this browser has one.)
          return v ?? local?.getItem(key) ?? null;
        } catch {
          return safely(() => local?.getItem(key) ?? null, null);
        }
      },
      setItem: (key, value) => {
        if (this.frozen) return;
        try {
          sdk.data.setItem(key, value);
        } catch {
          safely(() => local?.setItem(key, value), undefined);
        }
      },
      removeItem: (key) => {
        if (this.frozen) return;
        safely(() => sdk.data.removeItem(key), undefined);
        safely(() => local?.removeItem(key), undefined);
      },
    };
  }

  // ---------------------------------------------------------------- the device

  /**
   * What the player is on, by the portal's own detection (it knows a touchscreen laptop from a phone,
   * which the browser's touch support alone doesn't). Null when there's no portal to ask.
   */
  get device(): 'desktop' | 'tablet' | 'mobile' | null {
    if (!this.sdk) return null;
    return safely(() => this.sdk!.user.systemInfo?.device?.type ?? null, null);
  }
}
