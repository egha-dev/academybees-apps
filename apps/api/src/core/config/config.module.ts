import { type DynamicModule, Global, Module } from '@nestjs/common';

import type { ApiConfig } from './config.schema.js';

export const API_CONFIG = Symbol('API_CONFIG');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: ApiConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: API_CONFIG, useValue: Object.freeze(config) }],
      exports: [API_CONFIG],
    };
  }
}
