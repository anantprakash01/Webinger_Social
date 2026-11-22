package com.webinger.collab.order.service;

/**
 * Fees and Indian taxes in integer paise (CLAUDE.md §4.2; mock fees.ts and tax.ts). Every function here must
 * give the same result as the frontend mock for every input.
 *
 * <p>Rounding: half up to the nearest paisa per line, with integer arithmetic only.
 */
public final class Money {
    private Money() {}

    public static final int BPS_DENOMINATOR = 10_000;
    /** Minimum package or offer price (FR-12): ₹500. */
    public static final long MIN_PRICE_CENTS = 50_000;
    /** Razorpay's smallest charge: a discounted order still costs at least ₹1. */
    public static final long MIN_CHARGE_CENTS = 100;

    public static final int GST_BPS = 1_800;
    public static final int TDS_194O_BPS = 10;
    public static final int TCS_GST_BPS = 50;

    /** Placeholders until the company is registered. */
    public static final String PLATFORM_STATE = "KA";
    public static final String PLATFORM_GSTIN = "29AAACW0000A1Z5";

    /** cents × bps / 10 000, rounded half up, without floating point. */
    public static long applyBps(long cents, int bps) {
        if (bps < 0 || bps > BPS_DENOMINATOR) throw new IllegalArgumentException("Invalid basis points: " + bps);
        if (cents < 0) throw new IllegalArgumentException("Fees apply to non-negative amounts only");
        return Math.floorDiv(Math.multiplyExact(cents, bps) + BPS_DENOMINATOR / 2, BPS_DENOMINATOR);
    }

    public record FeeRates(int brandFeeBps, int creatorFeeBps) {
        public static final FeeRates DEFAULT = new FeeRates(1000, 1500);
    }

    public record Fees(long priceCents, long brandFeeCents, long brandTotalCents, long creatorFeeCents, long creatorPayoutCents, long platformGrossCents) {}

    public static Fees fees(long priceCents, FeeRates rates) {
        if (priceCents <= 0) throw new IllegalArgumentException("Price must be positive");
        long brandFee = applyBps(priceCents, rates.brandFeeBps());
        long creatorFee = applyBps(priceCents, rates.creatorFeeBps());
        return new Fees(priceCents, brandFee, priceCents + brandFee, creatorFee, priceCents - creatorFee, brandFee + creatorFee);
    }

    /** GST, TDS and TCS on one order, fixed at checkout like the fees. */
    public record Taxes(boolean intraState, boolean creatorGstRegistered, long creatorGstCents, long brandFeeGstCents, long creatorFeeGstCents, long tdsCents,
            long tcsCents) {
        public static final Taxes NONE = new Taxes(true, false, 0, 0, 0, 0, 0);
    }

    /**
     * GST 18% on both platform fees; GST-registered creators add 18% on their price (passed to them); TDS 0.1%
     * (s.194-O) and, for registered creators, TCS 0.5% (s.52 CGST Act) on the price, withheld from the creator.
     */
    public static Taxes taxes(long priceCents, long brandFeeCents, long creatorFeeCents, boolean intraState, boolean creatorGstRegistered) {
        return new Taxes(intraState, creatorGstRegistered,
                creatorGstRegistered ? applyBps(priceCents, GST_BPS) : 0,
                applyBps(brandFeeCents, GST_BPS),
                applyBps(creatorFeeCents, GST_BPS),
                applyBps(priceCents, TDS_194O_BPS),
                creatorGstRegistered ? applyBps(priceCents, TCS_GST_BPS) : 0);
    }

    /** CGST and SGST halves of an intra-state GST amount (the odd paisa goes to SGST). */
    public static long[] splitGst(long gstCents) {
        long cgst = gstCents / 2;
        return new long[] {cgst, gstCents - cgst};
    }

    /** The money fixed on an order: price, both fees, taxes and the platform-funded discount. */
    public record OrderAmounts(long priceCents, long brandFeeCents, long creatorFeeCents, Taxes taxes, long promoCents, long creditCents) {
        /** What the brand owes: price + creator GST + service fee + GST on the fee. */
        public long totalCents() {
            return priceCents + brandFeeCents + taxes.creatorGstCents() + taxes.brandFeeGstCents();
        }

        /** What the creator receives on release: price + their GST − commission − GST on it − TDS − TCS. */
        public long creatorPayoutCents() {
            return priceCents + taxes.creatorGstCents() - creatorFeeCents - taxes.creatorFeeGstCents() - taxes.tdsCents() - taxes.tcsCents();
        }

        public long discountCents() {
            return promoCents + creditCents;
        }

        /** What the brand is actually charged. */
        public long paidCents() {
            return totalCents() - discountCents();
        }

        /** GST on both platform fees, owed by the platform. */
        public long feeGstCents() {
            return taxes.brandFeeGstCents() + taxes.creatorFeeGstCents();
        }

        /** TDS + TCS withheld from the creator. */
        public long withheldCents() {
            return taxes.tdsCents() + taxes.tcsCents();
        }
    }
}
