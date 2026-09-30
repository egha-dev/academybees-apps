export type Connectivity = 'online' | 'offline';

export type ConnectivityOptions = {
  /** Liveness endpoint on the same origin (ARCHITECTURE §11.4). */
  heartbeatUrl?: string;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  fetchFn?: typeof fetch;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'> & {
    navigator: { onLine: boolean };
  };
};

/**
 * Connection state from two signals: the browser's online/offline events (fast, but "online"
 * can be a captive portal or dead Wi-Fi) and a same-origin API heartbeat (truthful). Offline
 * wins immediately; "online" is confirmed by a successful heartbeat.
 */
export class ConnectivityMonitor {
  private state: Connectivity;
  private readonly listeners = new Set<(state: Connectivity) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly opts: Required<Omit<ConnectivityOptions, 'target'>> & {
    target: ConnectivityOptions['target'] | undefined;
  };

  constructor(options: ConnectivityOptions = {}) {
    this.opts = {
      heartbeatUrl: options.heartbeatUrl ?? '/api/v1/health/live',
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30_000,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? 5_000,
      fetchFn: options.fetchFn ?? ((...args) => fetch(...args)),
      target: options.target ?? (typeof window === 'undefined' ? undefined : window),
    };
    this.state = this.opts.target && !this.opts.target.navigator.onLine ? 'offline' : 'online';
  }

  get current(): Connectivity {
    return this.state;
  }

  subscribe(listener: (state: Connectivity) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    this.opts.target?.addEventListener('online', this.onOnline);
    this.opts.target?.addEventListener('offline', this.onOffline);
    this.timer = setInterval(() => void this.check(), this.opts.heartbeatIntervalMs);
    void this.check();
  }

  stop(): void {
    this.opts.target?.removeEventListener('online', this.onOnline);
    this.opts.target?.removeEventListener('offline', this.onOffline);
    clearInterval(this.timer);
  }

  /** Probe the API now; returns the resulting state. */
  async check(): Promise<Connectivity> {
    if (this.opts.target && !this.opts.target.navigator.onLine) {
      this.set('offline');
      return this.state;
    }
    try {
      const res = await this.opts.fetchFn(this.opts.heartbeatUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(this.opts.heartbeatTimeoutMs),
      });
      this.set(res.ok ? 'online' : 'offline');
    } catch {
      this.set('offline');
    }
    return this.state;
  }

  private readonly onOnline = () => void this.check();
  private readonly onOffline = () => this.set('offline');

  private set(state: Connectivity): void {
    if (state === this.state) return;
    this.state = state;
    for (const l of this.listeners) l(state);
  }
}
