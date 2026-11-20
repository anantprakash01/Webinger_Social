/** Mock for the brand workspace: company profile (FR-05). Brand role only. */
import { brandProfileInputSchema } from '@/features/brands/schemas';
import type { BrandProfile } from '@/types';
import { getDb, now, type BrandProfileRow, type UserRow } from '../db';
import { fail, ok, parseBody, type Handler } from '../http';

function myBrand(user: UserRow): BrandProfileRow {
  if (user.role !== 'BRAND') fail(403, 'Only brand accounts have a company profile.', 'ROLE_NOT_ALLOWED');
  const b = getDb().brandProfiles.find((x) => x.userId === user.id);
  if (!b) fail(404, 'Brand profile not found.', 'NOT_FOUND');
  return b;
}

const toBrandProfile = (b: BrandProfileRow): BrandProfile => ({
  companyName: b.companyName,
  website: b.website,
  logoUrl: b.logoUrl,
  industry: b.industry,
  country: b.country,
  plan: b.plan,
});

export const getMyBrandProfile: Handler = ({ user }) => ok(toBrandProfile(myBrand(user)));

export const updateMyBrandProfile: Handler = ({ req, user }) => {
  const b = myBrand(user);
  const body = parseBody(brandProfileInputSchema, req.body);
  Object.assign(b, {
    companyName: body.companyName,
    website: body.website ?? null,
    logoUrl: body.logoUrl ?? null,
    industry: body.industry,
    country: body.country,
  });
  user.updatedAt = now().toISOString();
  return ok(toBrandProfile(b));
};
