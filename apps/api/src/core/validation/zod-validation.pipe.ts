import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';

import { isZodDto } from './zod-dto.js';

/** Global pipe: validates any parameter typed with a `createZodDto` class; others pass through. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!isZodDto(metadata.metatype)) return value;
    // Throws ZodError → VALIDATION_FAILED via the error filter.
    return metadata.metatype.schema.parse(value);
  }
}
