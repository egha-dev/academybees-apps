/** A PII-free analytics event ready for a provider (ADR-032). */
export type CapturedEvent = {
  /** Hashed user ID, hashed tenant ID or `system:<service>` — never a raw ID. */
  distinctId: string;
  event: string;
  properties: Record<string, unknown>;
  /** Group analytics: the hashed academy. */
  groups?: { academy: string };
  timestamp: Date;
};

export interface AnalyticsPort {
  capture(event: CapturedEvent): Promise<void>;
  shutdown(): Promise<void>;
}

export const ANALYTICS_PORT = Symbol('ANALYTICS_PORT');
