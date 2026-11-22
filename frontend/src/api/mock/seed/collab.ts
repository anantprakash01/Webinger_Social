/**
 * Phase C seed: add-ons on about half the packages (Leo's always) and results on delivered post links of
 * completed orders, so the brand dashboard shows numbers. Deterministic, like the rest of the seed.
 */
import type { PackageAddon } from '@/types';
import type { DeliveryRow, PackageRow } from '../db';
import type { MockOrder } from '../orderMachine';

const round = (cents: number) => Math.max(10_000, Math.round(cents / 50_000) * 50_000); // nearest ₹500, min ₹100

export function seedAddons(packages: PackageRow[], leoId: string): void {
  packages.forEach((k, i) => {
    if (k.creatorId !== leoId && i % 2 === 1) return;
    const addons: PackageAddon[] = [
      { id: `${k.id}-usage`, kind: 'USAGE_RIGHTS', title: 'Paid ad usage for 30 days', priceCents: round(k.priceCents * 0.3), usageDays: 30, rushDays: null },
    ];
    if (k.deliveryDays > 2) {
      const d = Math.max(1, Math.floor(k.deliveryDays / 2));
      addons.push({ id: `${k.id}-rush`, kind: 'RUSH', title: `Rush delivery in ${d} day${d === 1 ? '' : 's'}`, priceCents: round(k.priceCents * 0.2), usageDays: null, rushDays: d });
    }
    if (i % 3 === 0 || k.creatorId === leoId) addons.push({ id: `${k.id}-revision`, kind: 'EXTRA_REVISION', title: 'One extra revision', priceCents: round(k.priceCents * 0.1), usageDays: null, rushDays: null });
    k.addons = addons;
  });
}

export function seedMetrics(orders: MockOrder[], deliveries: DeliveryRow[], recordedAt: string): void {
  deliveries.forEach((d, i) => {
    const o = orders.find((x) => x.id === d.orderId);
    if (!o || o.status !== 'COMPLETED') return;
    d.items.forEach((it, j) => {
      if (it.type !== 'POST_URL') return;
      const views = 12_000 + ((i * 7919 + j * 104_729) % 180_000);
      it.metrics = { views, likes: Math.round(views * 0.06), comments: Math.round(views * 0.004), shares: Math.round(views * 0.002), reach: Math.round(views * 0.8), recordedAt };
    });
  });
}
