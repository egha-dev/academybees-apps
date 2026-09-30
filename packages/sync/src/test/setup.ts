// In-memory IndexedDB for Dexie under jsdom (tests only).
import 'fake-indexeddb/auto';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
