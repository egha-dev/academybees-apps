// Local/CI seed helpers (also used by integration and E2E setups). Never in production paths.
export { syncFeatureFlagDefinitions } from './flags.js';
export { DEV_TENANTS, type DevTenant, seedDevTenants } from './tenants.js';
