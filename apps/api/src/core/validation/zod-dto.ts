import { SetMetadata } from '@nestjs/common';
import { type z } from 'zod';

/**
 * A class wrapper around a shared Zod schema so Nest's reflected parameter types carry it:
 *
 *   export class CreateThingDto extends createZodDto(CreateThingSchema) {}
 *   create(@Body() body: CreateThingDto) { … }
 *
 * The global ZodValidationPipe parses with `schema` (unknown keys stripped, ARCHITECTURE §9.1).
 */
export type ZodDtoClass<T extends z.ZodType = z.ZodType> = {
  new (): z.infer<T>;
  readonly schema: T;
};

export function createZodDto<T extends z.ZodType>(schema: T): ZodDtoClass<T> {
  class ZodDto {
    static readonly schema = schema;
  }
  return ZodDto as unknown as ZodDtoClass<T>;
}

export function isZodDto(metatype: unknown): metatype is ZodDtoClass {
  return typeof metatype === 'function' && 'schema' in metatype;
}

export const ZOD_RESPONSE = 'academybee:zod-response';

/** Declare (and enforce) the response schema of a route: the body is parsed before sending. */
export const ZodResponse = (schema: z.ZodType) => SetMetadata(ZOD_RESPONSE, schema);
