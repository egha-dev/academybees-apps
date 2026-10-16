import { z } from 'zod';

import { cursorPageSchema } from './pagination.js';

/**
 * In-app notifications for staff (Phase 6; C-04, C-128). The text comes from the catalogue by
 * `kind` with `params`; `link` opens what it is about.
 */
export const NOTIFICATION_KINDS = ['ATTENDANCE_NOT_TAKEN'] as const;
export const NotificationKindSchema = z.enum(NOTIFICATION_KINDS);

export const NotificationSchema = z.object({
  id: z.uuid(),
  kind: NotificationKindSchema,
  params: z.record(z.string(), z.union([z.string(), z.number()])),
  link: z.string().nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;
export const NotificationPageSchema = cursorPageSchema(NotificationSchema);
export const UnreadCountSchema = z.object({ count: z.number().int() });

/** `POST /notifications/read`: some (by id) or all of mine. */
export const MarkNotificationsReadSchema = z
  .object({ ids: z.array(z.uuid()).max(100).optional(), all: z.literal(true).optional() })
  .refine((v) => Boolean(v.ids?.length) !== Boolean(v.all), {
    message: 'ids_or_all',
    path: ['ids'],
  });

/** How long after a class ends a teacher is reminded to take attendance (G-16). */
export const ATTENDANCE_NUDGE_MINUTES = 30;
