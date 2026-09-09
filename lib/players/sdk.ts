/** Official YouTube SDK. Dailymotion uses its standard iframe without an SDK. */
export interface YouTubePlayer {
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  isMuted(): boolean;
  getVolume(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}
export type YouTubeSDK = {
  Player: new (
    target: HTMLElement,
    options: {
      videoId: string;
      host: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => YouTubePlayer;
};
type SDKWindow = Window & { YT?: YouTubeSDK };
const pending = new Map<string, Promise<void>>();

function loadScript(src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  const existing = pending.get(src);
  if (existing) return existing;
  const job = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    const start = Date.now();
    const finish = (error?: Error) => {
      window.clearInterval(timer);
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else resolve();
    };
    // Readiness is bounded; no fabricated ready event or overwritten global callback.
    const timer = window.setInterval(() => {
      if (ready()) finish();
      else if (Date.now() - start > 12_000)
        finish(new Error("Player SDK unavailable"));
    }, 50);
    script.onerror = () => finish(new Error("Player SDK blocked"));
    document.body.appendChild(script);
  });
  pending.set(src, job);
  void job.catch(() => {
    pending.delete(src);
  });
  return job;
}
export async function loadYouTube(): Promise<YouTubeSDK> {
  const win = window as SDKWindow;
  await loadScript("https://www.youtube.com/iframe_api", () =>
    Boolean(win.YT?.Player),
  );
  return win.YT!;
}
