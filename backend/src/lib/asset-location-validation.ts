/**
 * Self-device location report validation — Feature 008 Phase 1.
 */
import { z } from 'zod';

export const locationReportBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(100_000).nullable().optional(),
  capturedAt: z.string().datetime().optional(),
  triggeredBy: z.enum(['foreground_open', 'manual_refresh']).optional(),
});

export type LocationReportBody = z.infer<typeof locationReportBodySchema>;

export function parseLocationReportRecordedAt(capturedAt: string | undefined): Date {
  if (!capturedAt) return new Date();
  const parsed = new Date(capturedAt);
  const skewMs = 5 * 60 * 1000;
  if (parsed.getTime() > Date.now() + skewMs) {
    throw new Error('CAPTURED_AT_FUTURE');
  }
  return parsed;
}
