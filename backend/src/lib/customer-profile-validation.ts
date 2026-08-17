import { z } from 'zod';

const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^\+?[0-9\s()-]+$/);

export const updateCustomerProfileBodySchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    middleName: z.string().trim().max(80).nullable().optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    dateOfBirth: z.string().date().nullable().optional(),
    phone: phoneSchema.optional(),
    idNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{13}$/, 'South African ID must be 13 digits')
      .optional(),
    residentialAddress: z
      .object({
        line1: z.string().trim().min(1).max(200),
        line2: z.string().trim().max(200).nullable().optional(),
        city: z.string().trim().min(1).max(100),
        province: z.string().trim().min(1).max(100),
        postalCode: z.string().trim().min(1).max(20),
        country: z.string().trim().min(2).max(2).default('ZA'),
      })
      .optional(),
    emergencyContact: z
      .object({
        name: z.string().trim().min(1).max(120),
        relationship: z.string().trim().min(1).max(80),
        phone: phoneSchema,
      })
      .optional(),
  })
  .strict();

export type UpdateCustomerProfileBody = z.infer<typeof updateCustomerProfileBodySchema>;
