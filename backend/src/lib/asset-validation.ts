/**
 * Asset registration validation — mirrors api-design.md §6 `CreateAssetRequest`
 * and database-design.md §3.3 per-type `details` shapes. Validated at the API
 * edge so malformed documents are rejected with 400, not a MongoDB validator 500.
 */
import { z } from 'zod';

export const ASSET_TYPES = [
  'vehicle',
  'laptop',
  'smartphone',
  'tablet',
  'tv',
  'desktop',
  'business_equipment',
  'other_electronics',
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

const vehicleDetailsSchema = z
  .object({
    make: z.string().min(1),
    model: z.string().min(1),
    year: z.number().int(),
    vin: z.string().min(1),
    licensePlate: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    mileage: z.number().int().nullable().optional(),
  })
  .strict();

const laptopDetailsSchema = z
  .object({
    brand: z.string().min(1),
    model: z.string().min(1),
    serialNumber: z.string().min(1),
    operatingSystem: z.string().nullable().optional(),
  })
  .strict();

const smartphoneDetailsSchema = z
  .object({
    brand: z.string().min(1),
    model: z.string().min(1),
    imei: z.string().min(1),
    serialNumber: z.string().nullable().optional(),
  })
  .strict();

const tabletDetailsSchema = z
  .object({
    brand: z.string().min(1),
    model: z.string().min(1),
    serialNumber: z.string().min(1),
    imei: z.string().nullable().optional(),
  })
  .strict();

const tvDetailsSchema = z
  .object({
    brand: z.string().min(1),
    model: z.string().min(1),
    serialNumber: z.string().min(1),
    screenSizeInches: z.number().nullable().optional(),
  })
  .strict();

const desktopDetailsSchema = z
  .object({
    brand: z.string().min(1),
    model: z.string().min(1),
    serialNumber: z.string().min(1),
    components: z.string().nullable().optional(),
  })
  .strict();

const businessEquipmentDetailsSchema = z
  .object({
    category: z.string().min(1),
    brand: z.string().min(1),
    model: z.string().min(1),
    serialNumber: z.string().min(1),
    description: z.string().nullable().optional(),
  })
  .strict();

const otherElectronicsDetailsSchema = businessEquipmentDetailsSchema;

const estimatedValueSchema = z
  .object({
    amount: z.number().min(0),
    currency: z.string().length(3),
  })
  .strict();

export const createAssetBodySchema = z
  .object({
    assetType: z.enum(ASSET_TYPES),
    displayName: z.string().min(1).max(120),
    estimatedValue: estimatedValueSchema.nullable().optional(),
    details: z.unknown(),
  })
  .superRefine((body, ctx) => {
    const detailsResult = detailsSchemaForType(body.assetType).safeParse(body.details);
    if (!detailsResult.success) {
      for (const issue of detailsResult.error.issues) {
        ctx.addIssue({ ...issue, path: ['details', ...issue.path] });
      }
    }
  });

export type CreateAssetBody = z.infer<typeof createAssetBodySchema>;

export const updateAssetBodySchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    estimatedValue: estimatedValueSchema.nullable().optional(),
    details: z.unknown().optional(),
  })
  .strict()
  .refine((body) => body.displayName !== undefined || body.estimatedValue !== undefined || body.details !== undefined, {
    message: 'At least one updatable field is required',
  });

export type UpdateAssetBody = z.infer<typeof updateAssetBodySchema>;

function detailsSchemaForType(assetType: AssetType): z.ZodType<Record<string, unknown>> {
  switch (assetType) {
    case 'vehicle':
      return vehicleDetailsSchema;
    case 'laptop':
      return laptopDetailsSchema;
    case 'smartphone':
      return smartphoneDetailsSchema;
    case 'tablet':
      return tabletDetailsSchema;
    case 'tv':
      return tvDetailsSchema;
    case 'desktop':
      return desktopDetailsSchema;
    case 'business_equipment':
      return businessEquipmentDetailsSchema;
    case 'other_electronics':
      return otherElectronicsDetailsSchema;
    default:
      return z.never();
  }
}

/** Returns validated details object for persistence after body schema passes. */
export function parseAssetDetails(assetType: AssetType, details: unknown): Record<string, unknown> {
  return detailsSchemaForType(assetType).parse(details) as Record<string, unknown>;
}
