import { type KeyRing, loadKeyRing, loadMasterKeys, type MasterKeyRing } from '@academybee/auth';
import type { Provider } from '@nestjs/common';

import { API_CONFIG } from '../config/config.module.js';
import type { ApiConfig } from '../config/config.schema.js';

/** Access-token signing keys (C-64), loaded once at boot; a bad key set stops the API starting. */
export const AUTH_KEYS = Symbol('AUTH_KEYS');
/** Master key ring for secrets at rest (ADR-033, C-62). */
export const MASTER_KEYS = Symbol('MASTER_KEYS');

export const keyProviders: Provider[] = [
  {
    provide: AUTH_KEYS,
    inject: [API_CONFIG],
    useFactory: (config: ApiConfig): Promise<KeyRing> => loadKeyRing(config.AUTH_SIGNING_KEYS),
  },
  {
    provide: MASTER_KEYS,
    inject: [API_CONFIG],
    useFactory: (config: ApiConfig): MasterKeyRing => loadMasterKeys(config.SECRETS_MASTER_KEY),
  },
];
