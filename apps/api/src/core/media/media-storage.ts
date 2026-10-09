import { Inject, Injectable, Logger } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';

import { API_CONFIG } from '../config/config.module.js';
import type { ApiConfig } from '../config/config.schema.js';
import { DomainError } from '../errors/domain-error.js';

/**
 * Object storage (C-93, C-97) over the S3 API — SeaweedFS locally, Cloudflare R2 on staging and
 * production — signed with SigV4 (`aws4fetch`); no vendor SDK. Path-style URLs work on both.
 *
 * Public and private never mix (C-97): this adapter writes public objects only to the public
 * bucket, and has no way to produce a public URL for anything else. Private media (Phase 4) gets
 * `putPrivate` / `signedGet` against MEDIA_PRIVATE_BUCKET.
 */
@Injectable()
export class MediaStorage {
  private readonly logger = new Logger(MediaStorage.name);
  private readonly client: AwsClient | undefined;
  private readonly endpoint: string;
  private readonly publicBucket: string;
  private readonly publicBase: string;

  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    this.endpoint = (config.MEDIA_S3_ENDPOINT ?? '').replace(/\/+$/, '');
    this.publicBucket = config.MEDIA_PUBLIC_BUCKET ?? '';
    this.publicBase = (config.MEDIA_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
    this.client =
      config.MEDIA_S3_ENDPOINT &&
      config.MEDIA_S3_ACCESS_KEY_ID &&
      config.MEDIA_S3_SECRET_ACCESS_KEY &&
      config.MEDIA_PUBLIC_BUCKET &&
      config.MEDIA_PUBLIC_BASE_URL
        ? new AwsClient({
            accessKeyId: config.MEDIA_S3_ACCESS_KEY_ID,
            secretAccessKey: config.MEDIA_S3_SECRET_ACCESS_KEY,
            service: 's3',
            region: config.MEDIA_S3_REGION,
          })
        : undefined;
  }

  /** Public uploads work in this deployment. */
  get available(): boolean {
    return this.client !== undefined;
  }

  /** Where a public object is served (built at read time, never stored — C-70). */
  publicUrl(key: string | null | undefined): string | null {
    return key && this.publicBase ? `${this.publicBase}/${key}` : null;
  }

  async putPublic(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const res = await this.send('PUT', key, {
      body,
      headers: {
        'content-type': contentType,
        'content-length': String(body.byteLength),
        // A new upload always gets a new key, so cached copies never go stale.
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
    if (!res.ok) {
      this.logger.error({ status: res.status }, 'Object storage refused an upload');
      throw new DomainError('SERVICE_UNAVAILABLE', `storage put ${res.status}`);
    }
  }

  /** Best effort: a leftover object is harmless (its key is never referenced again). */
  async deletePublic(key: string): Promise<void> {
    try {
      const res = await this.send('DELETE', key);
      if (!res.ok && res.status !== 404)
        this.logger.warn({ status: res.status }, 'Object storage did not delete an object');
    } catch (error) {
      this.logger.warn({ err: error }, 'Object storage unreachable for a delete');
    }
  }

  private async send(
    method: 'PUT' | 'DELETE',
    key: string,
    init: { body?: Uint8Array; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    if (!this.client) throw new DomainError('SERVICE_UNAVAILABLE', 'media storage not configured');
    if (!/^t\/[0-9a-f-]{36}\/[a-z]+\/[0-9a-f-]{36}\.[a-z]+$/.test(key))
      throw new Error('unsafe storage key');
    const url = `${this.endpoint}/${this.publicBucket}/${key}`;
    return this.client.fetch(url, {
      method,
      ...(init.body ? { body: init.body } : {}),
      ...(init.headers ? { headers: init.headers } : {}),
      signal: AbortSignal.timeout(15_000),
    });
  }
}
