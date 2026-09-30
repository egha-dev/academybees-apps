import { createConfig } from '@academybee/config/eslint';
import { reactConfig } from '@academybee/config/eslint/react';

export default [...createConfig({ tsconfigRootDir: import.meta.dirname }), ...reactConfig()];
