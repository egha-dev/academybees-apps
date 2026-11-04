import {
  CreatedShareLinkSchema,
  type DocumentLayout,
  DocumentLayoutSchema,
  FinanceDocumentSchema,
  ShareLinkListSchema,
  ShareLinkSchema,
} from '@academybee/contracts';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../../../core/auth/public.decorator.js';
import { DomainError } from '../../../core/errors/domain-error.js';
import { Can } from '../../../core/rbac/can.decorator.js';
import { ZodResponse } from '../../../core/validation/zod-dto.js';
import { DocumentsService } from './documents.service.js';

const Id = new ParseUUIDPipe({ version: '7' });
const layoutOf = (value: string): DocumentLayout => {
  const parsed = DocumentLayoutSchema.safeParse(value);
  if (!parsed.success) throw new DomainError('NOT_FOUND', 'layout');
  return parsed.data;
};

/** An invoice as a file (G-18). */
@Controller({ path: 'invoices/:id', version: '1' })
export class InvoiceDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('documents/:layout')
  @Can('invoice.read')
  @ZodResponse(FinanceDocumentSchema)
  get(@Param('id', Id) id: string, @Param('layout') layout: string) {
    return this.documents.get({ kind: 'INVOICE', id }, layoutOf(layout));
  }

  @Post('documents/:layout')
  @Can('invoice.read')
  @HttpCode(200)
  @ZodResponse(FinanceDocumentSchema)
  prepare(@Param('id', Id) id: string, @Param('layout') layout: string) {
    return this.documents.prepare({ kind: 'INVOICE', id }, layoutOf(layout));
  }

  @Post('documents/:layout/share-links')
  @Can('invoice.read')
  @HttpCode(201)
  @ZodResponse(CreatedShareLinkSchema)
  share(@Param('id', Id) id: string, @Param('layout') layout: string) {
    return this.documents.share({ kind: 'INVOICE', id }, layoutOf(layout));
  }

  @Get('share-links')
  @Can('invoice.read')
  @ZodResponse(ShareLinkListSchema)
  links(@Param('id', Id) id: string) {
    return this.documents.links({ kind: 'INVOICE', id });
  }

  @Post('share-links/:linkId/revoke')
  @Can('invoice.read')
  @HttpCode(200)
  @ZodResponse(ShareLinkSchema)
  revoke(@Param('id', Id) id: string, @Param('linkId', Id) linkId: string) {
    return this.documents.revoke({ kind: 'INVOICE', id }, linkId);
  }
}

/** A receipt as a file (G-18): reprint any time, the same file. */
@Controller({ path: 'payments/:id', version: '1' })
export class ReceiptDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('documents/:layout')
  @Can('receipt.read')
  @ZodResponse(FinanceDocumentSchema)
  get(@Param('id', Id) id: string, @Param('layout') layout: string) {
    return this.documents.get({ kind: 'RECEIPT', id }, layoutOf(layout));
  }

  @Post('documents/:layout')
  @Can('receipt.read')
  @HttpCode(200)
  @ZodResponse(FinanceDocumentSchema)
  prepare(@Param('id', Id) id: string, @Param('layout') layout: string) {
    return this.documents.prepare({ kind: 'RECEIPT', id }, layoutOf(layout));
  }

  @Post('documents/:layout/share-links')
  @Can('receipt.read')
  @HttpCode(201)
  @ZodResponse(CreatedShareLinkSchema)
  share(@Param('id', Id) id: string, @Param('layout') layout: string) {
    return this.documents.share({ kind: 'RECEIPT', id }, layoutOf(layout));
  }

  @Get('share-links')
  @Can('receipt.read')
  @ZodResponse(ShareLinkListSchema)
  links(@Param('id', Id) id: string) {
    return this.documents.links({ kind: 'RECEIPT', id });
  }

  @Post('share-links/:linkId/revoke')
  @Can('receipt.read')
  @HttpCode(200)
  @ZodResponse(ShareLinkSchema)
  revoke(@Param('id', Id) id: string, @Param('linkId', Id) linkId: string) {
    return this.documents.revoke({ kind: 'RECEIPT', id }, linkId);
  }
}

/** A shared link, opened by whoever received it: no sign-in, on the academy's own host. */
@Controller({ path: 'share', version: '1' })
export class ShareLinkController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':token')
  @Public()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Robots-Tag', 'noindex')
  @Header('Referrer-Policy', 'no-referrer')
  async open(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const { bytes, filename } = await this.documents.open(token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return new StreamableFile(Buffer.from(bytes));
  }
}
