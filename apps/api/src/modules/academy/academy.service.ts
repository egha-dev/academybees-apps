import {
  type AcademyBranding,
  type AcademySettings,
  IMAGE_TYPES,
  isReadableBrandColor,
  localDate,
  MAX_IMAGE_SIDE,
  MEDIA_PURPOSES,
  newId,
  ProfileStepSchema,
  sniffImage,
  type UpdateBranding,
} from '@academybee/contracts';
import type { TenantBoundClient } from '@academybee/database';
import { normalizeRootDomain, tenantHost } from '@academybee/tenant';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { z } from 'zod';

import { AuditService } from '../../core/audit/audit.service.js';
import { API_CONFIG } from '../../core/config/config.module.js';
import { type ApiConfig, platformRootDomain } from '../../core/config/config.schema.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { MediaStorage } from '../../core/media/media-storage.js';
import { TenantResolver } from '../../core/tenant/tenant-resolver.service.js';
import { SchedulingService } from '../scheduling/index.js';

export type BrandImage = 'logo' | 'favicon';
const PURPOSE = { logo: 'branding.logo', favicon: 'branding.favicon' } as const;
const KEY_COLUMN = { logo: 'logoKey', favicon: 'faviconKey' } as const;

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/**
 * Settings → Academy and Branding & Domain (UX v1.1 §6, V1.2 §5; C-49, C-93, C-95, C-97): the
 * academy profile, brand colour (must carry readable text, C-49), logo and favicon (PNG, JPEG or
 * WebP, checked from the bytes, stored in the public branding bucket under a new key each time),
 * and the public-profile switch (the page itself is Phase 8). Every change is audited and drops
 * the cached academy identity so it shows at once.
 */
@Injectable()
export class AcademyService {
  private readonly root: string;

  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly media: MediaStorage,
    private readonly audit: AuditService,
    private readonly resolver: TenantResolver,
    private readonly scheduling: SchedulingService,
    @Inject(API_CONFIG) config: ApiConfig,
  ) {
    this.root = normalizeRootDomain(platformRootDomain(config));
  }

  async settings(): Promise<AcademySettings> {
    const [tenant, settings] = await Promise.all([
      this.db.tenant.findFirst({
        select: { name: true, academyType: true, timezone: true, currency: true },
      }),
      this.db.tenantSettings.findFirst({ select: { contact: true, version: true } }),
    ]);
    if (!tenant || !settings) throw new DomainError('NOT_FOUND', 'academy');
    const contact = (settings.contact ?? {}) as Record<string, unknown>;
    return {
      name: tenant.name,
      academyType: tenant.academyType,
      phone: str(contact.phone),
      email: str(contact.email),
      address: str(contact.address),
      timezone: tenant.timezone,
      currency: tenant.currency,
      version: settings.version,
    };
  }

  async updateSettings(
    input: z.infer<typeof ProfileStepSchema> & { version: number },
  ): Promise<AcademySettings> {
    const tenantId = this.tenantId();
    const before = await this.settings();
    await this.db.$transaction(async (tx) => {
      const updated = await tx.tenantSettings.updateMany({
        where: { version: input.version },
        data: {
          contact: {
            phone: input.phone ?? null,
            email: input.email ?? null,
            address: input.address ?? null,
          },
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      await tx.tenant.update({
        where: { id: tenantId },
        data: { name: input.name, timezone: input.timezone, currency: input.currency },
      });
      // Classes already generated follow a new timezone (review M1).
      if (input.timezone !== before.timezone)
        await this.scheduling.regenerateForTimezone(tx, {
          tenantId,
          timeZone: input.timezone,
          today: localDate(new Date(), input.timezone),
        });
      await tx.tenantBranding.updateMany({ data: { displayName: input.name } });
      await this.audit.record(
        {
          action: 'academy.settings_changed',
          entityType: 'Tenant',
          entityId: tenantId,
          before: { name: before.name, timezone: before.timezone, currency: before.currency },
          after: { name: input.name, timezone: input.timezone, currency: input.currency },
        },
        tx,
      );
    });
    await this.resolver.invalidateTenant(tenantId);
    return this.settings();
  }

  async branding(): Promise<AcademyBranding> {
    const [tenant, branding, settings] = await Promise.all([
      this.db.tenant.findFirst({ select: { slug: true } }),
      this.db.tenantBranding.findFirst(),
      this.db.tenantSettings.findFirst({ select: { publicProfile: true } }),
    ]);
    if (!tenant || !branding) throw new DomainError('NOT_FOUND', 'academy');
    const pub = (settings?.publicProfile ?? {}) as { enabled?: unknown };
    return {
      displayName: branding.displayName,
      primaryColor: branding.primaryColor,
      logoUrl: this.media.publicUrl(branding.logoKey),
      faviconUrl: this.media.publicUrl(branding.faviconKey),
      host: tenantHost(tenant.slug, this.root),
      publicProfile: { enabled: pub.enabled === true },
      uploadsAvailable: this.media.available,
      version: branding.version,
    };
  }

  async updateBranding(input: UpdateBranding): Promise<AcademyBranding> {
    if (input.primaryColor && !isReadableBrandColor(input.primaryColor))
      throw new DomainError('VALIDATION_FAILED', 'colour unreadable', [
        { path: 'primaryColor', issue: 'low_contrast' },
      ]);
    const tenantId = this.tenantId();
    await this.db.$transaction(async (tx) => {
      const before = await tx.tenantBranding.findFirst({ select: { primaryColor: true } });
      const updated = await tx.tenantBranding.updateMany({
        where: { version: input.version },
        data: {
          ...(input.primaryColor !== undefined
            ? { primaryColor: input.primaryColor?.toUpperCase() ?? null }
            : {}),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new DomainError('VERSION_CONFLICT');
      if (input.publicProfileEnabled !== undefined) {
        const settings = await tx.tenantSettings.findFirst({ select: { publicProfile: true } });
        await tx.tenantSettings.updateMany({
          data: {
            publicProfile: {
              ...((settings?.publicProfile ?? {}) as Record<string, unknown>),
              enabled: input.publicProfileEnabled,
            },
          },
        });
      }
      await this.audit.record(
        {
          action: 'academy.branding_changed',
          entityType: 'TenantBranding',
          entityId: tenantId,
          before: { primaryColor: before?.primaryColor ?? null },
          after: {
            ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
            ...(input.publicProfileEnabled !== undefined
              ? { publicProfile: input.publicProfileEnabled }
              : {}),
          },
        },
        tx,
      );
    });
    await this.resolver.invalidateTenant(tenantId);
    return this.branding();
  }

  /**
   * Upload a new logo or favicon (C-97). The bytes are checked before anything is stored: size
   * for the purpose, a real PNG/JPEG/WebP whatever the browser claimed, sane dimensions. A new
   * key every time; the old object is deleted after the change commits.
   */
  async uploadImage(kind: BrandImage, body: unknown): Promise<AcademyBranding> {
    if (!this.media.available)
      throw new DomainError('SERVICE_UNAVAILABLE', 'uploads not configured', [
        { path: 'file', issue: 'uploads_unavailable' },
      ]);
    const bytes = body instanceof Uint8Array ? body : null;
    if (!bytes || bytes.byteLength === 0)
      throw new DomainError('VALIDATION_FAILED', 'no file', [{ path: 'file', issue: 'required' }]);
    const purpose = PURPOSE[kind];
    if (bytes.byteLength > MEDIA_PURPOSES[purpose].maxBytes)
      throw new DomainError('VALIDATION_FAILED', 'too large', [
        { path: 'file', issue: 'too_large' },
      ]);
    const image = sniffImage(bytes);
    if (!image)
      throw new DomainError('VALIDATION_FAILED', 'not an image', [
        { path: 'file', issue: 'unsupported_type' },
      ]);
    if ((image.width ?? 0) > MAX_IMAGE_SIDE || (image.height ?? 0) > MAX_IMAGE_SIDE)
      throw new DomainError('VALIDATION_FAILED', 'too big', [
        { path: 'file', issue: 'too_large_dimensions' },
      ]);

    const tenantId = this.tenantId();
    const id = newId();
    const key = `t/${tenantId}/${MEDIA_PURPOSES[purpose].area}/${id}.${IMAGE_TYPES[image.mimeType]}`;
    await this.media.putPublic(key, bytes, image.mimeType);
    let previous: string | null = null;
    try {
      await this.db.$transaction(async (tx) => {
        const branding = await tx.tenantBranding.findFirst({
          select: { logoKey: true, faviconKey: true },
        });
        previous = branding?.[KEY_COLUMN[kind]] ?? null;
        await tx.mediaFile.updateMany({
          where: { purpose, status: 'READY' },
          data: { status: 'REMOVED', removedAt: new Date() },
        });
        await tx.mediaFile.create({
          data: {
            id,
            tenantId,
            purpose,
            visibility: 'PUBLIC',
            storageKey: key,
            mimeType: image.mimeType,
            sizeBytes: bytes.byteLength,
            width: image.width,
            height: image.height,
            createdById: this.cls.get('userId') ?? null,
          },
        });
        await tx.tenantBranding.updateMany({
          data: { [KEY_COLUMN[kind]]: key, version: { increment: 1 } },
        });
        await this.audit.record(
          {
            action: `academy.${kind}_uploaded`,
            entityType: 'MediaFile',
            entityId: id,
            metadata: { mimeType: image.mimeType, sizeBytes: bytes.byteLength },
          },
          tx,
        );
      });
    } catch (error) {
      await this.media.deletePublic(key);
      throw error;
    }
    if (previous) await this.media.deletePublic(previous);
    await this.resolver.invalidateTenant(tenantId);
    return this.branding();
  }

  /** Back to the generated monogram. */
  async removeImage(kind: BrandImage): Promise<AcademyBranding> {
    const tenantId = this.tenantId();
    let previous: string | null = null;
    await this.db.$transaction(async (tx) => {
      const branding = await tx.tenantBranding.findFirst({
        select: { logoKey: true, faviconKey: true },
      });
      previous = branding?.[KEY_COLUMN[kind]] ?? null;
      if (!previous) return;
      await tx.mediaFile.updateMany({
        where: { purpose: PURPOSE[kind], status: 'READY' },
        data: { status: 'REMOVED', removedAt: new Date() },
      });
      await tx.tenantBranding.updateMany({
        data: { [KEY_COLUMN[kind]]: null, version: { increment: 1 } },
      });
      await this.audit.record(
        { action: `academy.${kind}_removed`, entityType: 'TenantBranding', entityId: tenantId },
        tx,
      );
    });
    if (previous) {
      await this.media.deletePublic(previous);
      await this.resolver.invalidateTenant(tenantId);
    }
    return this.branding();
  }

  private tenantId(): string {
    const id = this.cls.get('tenantId');
    if (!id) throw new DomainError('NOT_FOUND', 'no academy');
    return id;
  }
}
