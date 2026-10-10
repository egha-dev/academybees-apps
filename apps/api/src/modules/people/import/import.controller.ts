import {
  CommitImportSchema,
  ImportJobSchema,
  UpdateImportMappingSchema,
} from '@academybee/contracts';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { Idempotent } from '../../../core/idempotency/idempotent.js';
import { Can } from '../../../core/rbac/can.decorator.js';
import { TenantHost } from '../../../core/tenant/host-policy.js';
import { createZodDto, ZodResponse } from '../../../core/validation/zod-dto.js';
import { ImportService } from './import.service.js';

class MappingDto extends createZodDto(UpdateImportMappingSchema) {}
class CommitDto extends createZodDto(CommitImportSchema) {}

const Id = new ParseUUIDPipe({ version: '7' });

/**
 * Import students and parents from a spreadsheet (G-02, ADR-036). Registered before Students.
 * Also open while the academy is setting up: the onboarding Students step offers it (G-02).
 */
@Controller({ path: 'students/import', version: '1' })
@TenantHost('SETUP', 'ACTIVE')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  /** The CSV template: field headers plus the academy's custom fields. */
  @Get('template')
  @Can('student.import')
  async template(@Res() res: Response): Promise<void> {
    const csv = await this.imports.template();
    res
      .status(200)
      .set({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="students-template.csv"',
        'cache-control': 'no-store',
      })
      .send(`\uFEFF${csv}`);
  }

  /** Raw file bytes; the file name travels in `x-file-name` (URI-encoded). */
  @Post()
  @Can('student.import')
  @Idempotent()
  @HttpCode(201)
  @ZodResponse(ImportJobSchema)
  upload(@Req() req: Request, @Headers('x-file-name') fileName: string | undefined) {
    const bytes = req.body instanceof Uint8Array ? req.body : new Uint8Array();
    let name = 'students';
    try {
      name = decodeURIComponent(fileName ?? 'students');
    } catch {
      // keep the default
    }
    return this.imports.upload(bytes, name);
  }

  @Get(':id')
  @Can('student.import')
  @ZodResponse(ImportJobSchema)
  get(@Param('id', Id) id: string) {
    return this.imports.get(id);
  }

  @Put(':id/mapping')
  @Can('student.import')
  @ZodResponse(ImportJobSchema)
  mapping(@Param('id', Id) id: string, @Body() body: MappingDto) {
    return this.imports.setMapping(id, body.version, body.mapping);
  }

  @Post(':id/commit')
  @Can('student.import')
  @Idempotent()
  @HttpCode(200)
  @ZodResponse(ImportJobSchema)
  commit(@Param('id', Id) id: string, @Body() body: CommitDto) {
    return this.imports.commit(id, body.version);
  }

  /** Rows that weren't imported, with the problem in words (CSV, formula-safe). */
  @Get(':id/errors.csv')
  @Can('student.import')
  async errors(@Param('id', Id) id: string, @Res() res: Response): Promise<void> {
    const report = await this.imports.errorReport(id);
    res
      .status(200)
      .set({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(report.fileName)}`,
        'cache-control': 'no-store',
      })
      .send(report.csv);
  }
}
