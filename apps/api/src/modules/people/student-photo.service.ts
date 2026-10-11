import { MEDIA_PURPOSES, newId, sniffImage } from '@academybee/contracts';
import type { TenantBoundClient, TransactionClient } from '@academybee/database';
import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { AuditService } from '../../core/audit/audit.service.js';
import type { RequestContext } from '../../core/context/request-context.js';
import { TENANT_DB } from '../../core/database/database.module.js';
import { DomainError } from '../../core/errors/domain-error.js';
import { stripImageMetadata } from '../../core/media/image-metadata.js';
import { MediaStorage } from '../../core/media/media-storage.js';
import { scopedWhere } from '../../core/rbac/scope.js';
import { studentPolicy } from './people.policy.js';

const PURPOSE = 'student.photo' as const;
const LINK_SECONDS = 300;

/**
 * Students' photos (G-05, C-97): a child's image, so it is private media — its own bucket, read
 * only through presigned links valid ≤ 5 minutes, every view audited — and consent-gated: it can
 * be added only while a parent's current consent includes `photos` (G-06), and it is removed when
 * that consent is withdrawn.
 */
@Injectable()
export class StudentPhotoService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantBoundClient,
    private readonly cls: ClsService<RequestContext>,
    private readonly storage: MediaStorage,
    private readonly audit: AuditService,
  ) {}

  /** Whether a parent's latest consent for this student includes photos. */
  async hasPhotoConsent(
    db: Pick<TenantBoundClient, 'consentRecord'>,
    studentId: string,
  ): Promise<boolean> {
    const records = await db.consentRecord.findMany({
      where: { studentId },
      orderBy: { recordedAt: 'desc' },
      select: { parentId: true, action: true, purposes: true },
    });
    const latest = new Map<string, { action: string; purposes: string[] }>();
    for (const r of records) if (!latest.has(r.parentId)) latest.set(r.parentId, r);
    return [...latest.values()].some((r) => r.action === 'GRANT' && r.purposes.includes('photos'));
  }

  async upload(studentId: string, body: unknown): Promise<void> {
    if (!this.storage.privateAvailable)
      throw new DomainError('SERVICE_UNAVAILABLE', 'private storage not configured', [
        { path: 'photo', issue: 'photos_unavailable' },
      ]);
    const bytes = body instanceof Uint8Array ? body : null;
    if (!bytes || bytes.byteLength === 0)
      throw new DomainError('VALIDATION_FAILED', 'no file', [{ path: 'photo', issue: 'required' }]);
    if (bytes.byteLength > MEDIA_PURPOSES[PURPOSE].maxBytes)
      throw new DomainError('VALIDATION_FAILED', 'too large', [
        { path: 'photo', issue: 'too_large' },
      ]);
    const image = sniffImage(bytes);
    if (!image)
      throw new DomainError('VALIDATION_FAILED', 'not an image', [
        { path: 'photo', issue: 'unsupported_type' },
      ]);
    const student = await this.findForWrite(this.db, studentId);
    if (!(await this.hasPhotoConsent(this.db, studentId)))
      throw new DomainError('VALIDATION_FAILED', 'no photo consent', [
        { path: 'photo', issue: 'consent_required' },
      ]);
    const mediaId = newId();
    const ext =
      image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const key = `t/${student.tenantId}/students/${mediaId}.${ext}`;
    // No location, camera or time metadata leaves with a child's photo (G-05, G-06).
    const clean = stripImageMetadata(bytes, image.mimeType);
    await this.storage.putPrivate(key, clean, image.mimeType);
    const previous = await this.db.$transaction(async (tx) => {
      await tx.mediaFile.create({
        data: {
          id: mediaId,
          tenantId: student.tenantId,
          purpose: PURPOSE,
          visibility: 'PRIVATE',
          storageKey: key,
          mimeType: image.mimeType,
          sizeBytes: clean.byteLength,
          width: image.width,
          height: image.height,
          createdById: this.cls.get('membership')?.id ?? null,
        },
      });
      await tx.student.update({
        where: { id: studentId },
        data: { photoMediaId: mediaId, version: { increment: 1 } },
      });
      await this.audit.record(
        { action: 'student.photo_updated', entityType: 'Student', entityId: studentId },
        tx,
      );
      return student.photoMediaId ? this.retire(tx, student.photoMediaId) : null;
    });
    if (previous) await this.storage.deletePrivate(previous);
  }

  async remove(studentId: string): Promise<void> {
    const student = await this.findForWrite(this.db, studentId);
    if (!student.photoMediaId) return;
    const key = await this.db.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: studentId },
        data: { photoMediaId: null, version: { increment: 1 } },
      });
      await this.audit.record(
        { action: 'student.photo_removed', entityType: 'Student', entityId: studentId },
        tx,
      );
      return this.retire(tx, student.photoMediaId!);
    });
    if (key) await this.storage.deletePrivate(key);
  }

  /** A link to view the photo for 5 minutes; each issue is an audited view (C-97). */
  async link(studentId: string): Promise<{ url: string; expiresAt: string }> {
    const student = await this.db.student.findFirst({
      where: { AND: [{ id: studentId }, scopedWhere(this.cls, 'student.read', studentPolicy)] },
      select: { photoMediaId: true },
    });
    if (!student?.photoMediaId) throw new DomainError('NOT_FOUND', 'photo');
    const media = await this.db.mediaFile.findFirst({
      where: { id: student.photoMediaId, purpose: PURPOSE, status: 'READY' },
      select: { storageKey: true },
    });
    if (!media) throw new DomainError('NOT_FOUND', 'photo');
    await this.audit.record({
      action: 'student.photo_viewed',
      entityType: 'Student',
      entityId: studentId,
    });
    return {
      url: await this.storage.signedGet(media.storageKey, LINK_SECONDS),
      expiresAt: new Date(Date.now() + LINK_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Called when consent is recorded: without photo consent any more, the photo goes (G-06).
   * Returns the storage key to delete after the transaction commits.
   */
  async removeIfConsentGone(tx: TransactionClient, studentId: string): Promise<string | null> {
    if (await this.hasPhotoConsent(tx, studentId)) return null;
    const student = await tx.student.findFirst({
      where: { id: studentId },
      select: { photoMediaId: true },
    });
    if (!student?.photoMediaId) return null;
    await tx.student.update({
      where: { id: studentId },
      data: { photoMediaId: null, version: { increment: 1 } },
    });
    await this.audit.record(
      {
        action: 'student.photo_removed',
        entityType: 'Student',
        entityId: studentId,
        metadata: { reason: 'consent_withdrawn' },
      },
      tx,
    );
    return this.retire(tx, student.photoMediaId);
  }

  private async findForWrite(db: TenantBoundClient, studentId: string) {
    const student = await db.student.findFirst({
      where: {
        AND: [
          { id: studentId, archivedAt: null },
          scopedWhere(this.cls, 'student.update', studentPolicy),
        ],
      },
      select: { tenantId: true, photoMediaId: true },
    });
    if (!student) throw new DomainError('NOT_FOUND', 'student');
    return student;
  }

  /** Mark a media row removed; the caller deletes the object after commit. */
  private async retire(tx: TransactionClient, mediaId: string): Promise<string | null> {
    const media = await tx.mediaFile.findFirst({
      where: { id: mediaId },
      select: { storageKey: true },
    });
    if (!media) return null;
    await tx.mediaFile.update({
      where: { id: mediaId },
      data: { status: 'REMOVED', removedAt: new Date() },
    });
    return media.storageKey;
  }
}
