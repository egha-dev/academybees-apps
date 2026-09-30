import { migrateAndApplySql } from '@academybee/database/migrate';
import { integrationGlobalSetup } from '@academybee/testing';

export default integrationGlobalSetup({ migrate: migrateAndApplySql, redis: true });
