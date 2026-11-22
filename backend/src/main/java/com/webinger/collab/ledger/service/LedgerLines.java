package com.webinger.collab.ledger.service;

import java.util.ArrayList;
import java.util.List;

/**
 * The double-entry rules (CLAUDE.md §4.1; mock ledger.ts). Money "moves from A to B" as a credit on A and a
 * debit on B. One builder per money movement; {@link #check} refuses any transaction that does not sum to zero.
 */
public final class LedgerLines {
    private LedgerLines() {}

    /**
     * BRAND_CHARGE: taken from the brand's payment method. GST_PAYABLE: GST on platform fees, owed to the
     * government. TAX_WITHHELD: TDS and TCS withheld from creators. PROMOTIONS: platform-funded discounts.
     */
    public enum Account { BRAND_CHARGE, ESCROW, PLATFORM_REVENUE, GST_PAYABLE, TAX_WITHHELD, CREATOR_BALANCE, PAYOUT, PROMOTIONS }

    public record Line(Account account, long debitCents, long creditCents) {
        static Line debit(Account a, long cents) {
            return new Line(a, cents, 0);
        }

        static Line credit(Account a, long cents) {
            return new Line(a, 0, cents);
        }
    }

    public static class ImbalanceException extends IllegalStateException {
        public ImbalanceException(String message) {
            super(message);
        }
    }

    /** Sum of debits minus credits. Zero for every valid transaction. */
    public static long balance(List<Line> lines) {
        return lines.stream().mapToLong(l -> l.debitCents() - l.creditCents()).sum();
    }

    /** Drops zero lines and validates the rest: two or more, one-sided, non-negative, balanced. */
    public static List<Line> check(String txnId, List<Line> lines) {
        List<Line> kept = lines.stream().filter(l -> l.debitCents() != 0 || l.creditCents() != 0).toList();
        if (kept.size() < 2) throw new ImbalanceException("Transaction " + txnId + " needs at least two entries");
        for (Line l : kept) {
            if (l.debitCents() < 0 || l.creditCents() < 0) throw new ImbalanceException("Entries cannot be negative");
            if (l.debitCents() > 0 && l.creditCents() > 0) throw new ImbalanceException("An entry is either a debit or a credit");
        }
        long b = balance(kept);
        if (b != 0) throw new ImbalanceException("Transaction " + txnId + " is off by " + b + " cents");
        return kept;
    }

    /** Step 2 — accepted, payment captured: BRAND_CHARGE (and PROMOTIONS for a discount) → ESCROW. */
    public static List<Line> capture(long brandTotalCents, long promotionsCents) {
        if (promotionsCents < 0 || promotionsCents >= brandTotalCents) throw new ImbalanceException("Discount must be less than the order total");
        return List.of(Line.credit(Account.BRAND_CHARGE, brandTotalCents - promotionsCents), Line.credit(Account.PROMOTIONS, promotionsCents),
                Line.debit(Account.ESCROW, brandTotalCents));
    }

    /**
     * Step 4 — approval: ESCROW → CREATOR_BALANCE (their share), GST_PAYABLE (GST on both fees), TAX_WITHHELD
     * (TDS + TCS) and PLATFORM_REVENUE (both fees: whatever is left).
     */
    public static List<Line> release(long escrowCents, long creatorPayoutCents, long gstCents, long withheldCents) {
        long platform = escrowCents - creatorPayoutCents - gstCents - withheldCents;
        if (platform < 0) throw new ImbalanceException("Creator payout and taxes exceed escrow");
        List<Line> out = new ArrayList<>();
        out.add(Line.credit(Account.ESCROW, escrowCents));
        if (platform != 0) out.add(Line.debit(Account.PLATFORM_REVENUE, platform));
        if (gstCents != 0) out.add(Line.debit(Account.GST_PAYABLE, gstCents));
        if (withheldCents != 0) out.add(Line.debit(Account.TAX_WITHHELD, withheldCents));
        out.add(Line.debit(Account.CREATOR_BALANCE, creatorPayoutCents));
        return out;
    }

    /** Step 6 — refund to the original payment method: ESCROW → BRAND_CHARGE (and the discount back to PROMOTIONS). */
    public static List<Line> refund(long refundCents, long promotionsCents) {
        return List.of(Line.credit(Account.ESCROW, refundCents + promotionsCents), Line.debit(Account.BRAND_CHARGE, refundCents),
                Line.debit(Account.PROMOTIONS, promotionsCents));
    }

    /** Step 5 — payout: CREATOR_BALANCE → PAYOUT; an instant payout's fee goes to PLATFORM_REVENUE. */
    public static List<Line> payout(long cents, long feeCents) {
        if (feeCents < 0 || feeCents >= cents) throw new ImbalanceException("Payout fee must be less than the amount");
        return List.of(Line.credit(Account.CREATOR_BALANCE, cents), Line.debit(Account.PAYOUT, cents - feeCents), Line.debit(Account.PLATFORM_REVENUE, feeCents));
    }
}
