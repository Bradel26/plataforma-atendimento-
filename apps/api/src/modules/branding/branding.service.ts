import { prisma } from '../../lib/prisma';
import type { z } from 'zod';
import type { updateBrandingSchema } from './branding.schemas';

const ID = 'default';

/** Registro unico de White Label — criado sob demanda com os valores padrao. */
export async function getBranding() {
  return prisma.branding.upsert({ where: { id: ID }, update: {}, create: { id: ID } });
}

export async function updateBranding(input: z.infer<typeof updateBrandingSchema>) {
  return prisma.branding.upsert({ where: { id: ID }, update: input, create: { id: ID, ...input } });
}
