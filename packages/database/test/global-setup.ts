import { integrationGlobalSetup } from '@academybee/testing';

import { migrateAndApplySql } from '../src/migrate.js';

export default integrationGlobalSetup({ migrate: migrateAndApplySql });
