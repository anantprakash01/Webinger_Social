package com.webinger.collab.ledger.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.webinger.collab.ledger.service.LedgerLines.Account;
import com.webinger.collab.ledger.service.LedgerLines.ImbalanceException;
import com.webinger.collab.ledger.service.LedgerLines.Line;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The double-entry rules, ported from frontend/src/api/mock/ledger.test.ts. */
class LedgerLinesTest {

    @Test
    void eachBuilderSumsToZero() {
        assertThat(LedgerLines.balance(LedgerLines.capture(22_000, 0))).isZero();
        assertThat(LedgerLines.balance(LedgerLines.capture(22_000, 5_000))).isZero();
        assertThat(LedgerLines.balance(LedgerLines.release(22_000, 17_000, 0, 0))).isZero();
        assertThat(LedgerLines.balance(LedgerLines.release(1_118_000, 822_000, 45_000, 1_000))).isZero();
        assertThat(LedgerLines.balance(LedgerLines.refund(22_000, 0))).isZero();
        assertThat(LedgerLines.balance(LedgerLines.payout(17_000, 170))).isZero();
    }

    @Test
    void releaseSplitsEscrowIntoPlatformRevenueAndCreatorBalance() {
        assertThat(LedgerLines.release(22_000, 17_000, 0, 0)).containsExactly(
                new Line(Account.ESCROW, 0, 22_000), new Line(Account.PLATFORM_REVENUE, 5_000, 0), new Line(Account.CREATOR_BALANCE, 17_000, 0));
    }

    @Test
    void releaseWithTaxesPaysGstAndWithheldTaxSeparately() {
        assertThat(LedgerLines.release(1_118_000, 822_000, 45_000, 1_000)).containsExactly(
                new Line(Account.ESCROW, 0, 1_118_000), new Line(Account.PLATFORM_REVENUE, 250_000, 0), new Line(Account.GST_PAYABLE, 45_000, 0),
                new Line(Account.TAX_WITHHELD, 1_000, 0), new Line(Account.CREATOR_BALANCE, 822_000, 0));
    }

    @Test
    void refusesAReleaseThatPaysTheCreatorMoreThanEscrowHolds() {
        assertThatThrownBy(() -> LedgerLines.release(100, 200, 0, 0)).isInstanceOf(ImbalanceException.class);
        assertThatThrownBy(() -> LedgerLines.capture(100, 100)).isInstanceOf(ImbalanceException.class);
        assertThatThrownBy(() -> LedgerLines.payout(100, 100)).isInstanceOf(ImbalanceException.class);
    }

    @Test
    void checkDropsZeroLinesAndKeepsBalancedOnes() {
        List<Line> kept = LedgerLines.check("T1", LedgerLines.capture(22_000, 0));
        assertThat(kept).hasSize(2).extracting(Line::account).containsExactly(Account.BRAND_CHARGE, Account.ESCROW);
    }

    @Test
    void checkThrowsOnUnbalancedNegativeOrTwoSidedEntries() {
        assertThatThrownBy(() -> LedgerLines.check("T2", List.of(new Line(Account.ESCROW, 100, 0), new Line(Account.BRAND_CHARGE, 0, 99))))
                .isInstanceOf(ImbalanceException.class).hasMessageContaining("off by 1 cents");
        assertThatThrownBy(() -> LedgerLines.check("T4", List.of(new Line(Account.ESCROW, -5, 0), new Line(Account.BRAND_CHARGE, -5, 0))))
                .isInstanceOf(ImbalanceException.class);
        assertThatThrownBy(() -> LedgerLines.check("T5", List.of(new Line(Account.ESCROW, 5, 5), new Line(Account.BRAND_CHARGE, 0, 0))))
                .isInstanceOf(ImbalanceException.class);
        assertThatThrownBy(() -> LedgerLines.check("T6", List.of(new Line(Account.ESCROW, 5, 0)))).isInstanceOf(ImbalanceException.class);
    }
}
