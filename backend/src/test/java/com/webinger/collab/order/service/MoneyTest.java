package com.webinger.collab.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.webinger.collab.order.service.Money.FeeRates;
import com.webinger.collab.order.service.Money.Fees;
import com.webinger.collab.order.service.Money.Taxes;
import org.junit.jupiter.api.Test;

/** Fees and Indian taxes, ported from frontend/src/api/mock/fees.test.ts and tax.test.ts. */
class MoneyTest {

    @Test
    void matchesTheSection42Example() {
        assertThat(Money.fees(20_000, FeeRates.DEFAULT)).isEqualTo(new Fees(20_000, 2_000, 22_000, 3_000, 17_000, 5_000));
    }

    @Test
    void usesTheConfiguredBasisPoints() {
        Fees f = Money.fees(20_000, new FeeRates(500, 1000));
        assertThat(f.brandFeeCents()).isEqualTo(1_000);
        assertThat(f.creatorFeeCents()).isEqualTo(2_000);
        assertThat(f.brandTotalCents()).isEqualTo(21_000);
        assertThat(f.creatorPayoutCents()).isEqualTo(18_000);
    }

    @Test
    void alwaysBalancesBrandTotalAgainstPayoutPlusPlatform() {
        for (long price : new long[] {1_000, 1_001, 1_999, 3_333, 12_345, 99_999, 1_234_567}) {
            Fees f = Money.fees(price, FeeRates.DEFAULT);
            assertThat(f.brandTotalCents()).isEqualTo(f.creatorPayoutCents() + f.platformGrossCents());
        }
    }

    @Test
    void rejectsNonPositivePrices() {
        assertThatThrownBy(() -> Money.fees(0, FeeRates.DEFAULT)).hasMessageContaining("positive");
        assertThatThrownBy(() -> Money.fees(-100, FeeRates.DEFAULT)).hasMessageContaining("positive");
    }

    @Test
    void roundsHalfUpToTheNearestPaisa() {
        assertThat(Money.applyBps(1_005, 1000)).isEqualTo(101); // 100.5 → 101
        assertThat(Money.applyBps(1_004, 1000)).isEqualTo(100); // 100.4 → 100
        assertThat(Money.applyBps(3_333, 1500)).isEqualTo(500); // 499.95 → 500
        assertThat(Money.applyBps(1_001, 1500)).isEqualTo(150); // 150.15 → 150
        assertThat(Money.applyBps(12_345, 0)).isZero();
        assertThat(Money.applyBps(12_345, 10_000)).isEqualTo(12_345);
        assertThatThrownBy(() -> Money.applyBps(100, -1)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Money.applyBps(100, 10_001)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void neverOverflowsSilently() {
        assertThatThrownBy(() -> Money.applyBps(Long.MAX_VALUE / 2, 10_000)).isInstanceOf(ArithmeticException.class);
    }

    // ---------- Taxes on a ₹10,000 package with default fees (₹1,000 brand fee, ₹1,500 commission) ----------

    final Fees f = Money.fees(1_000_000, FeeRates.DEFAULT);

    @Test
    void unregisteredCreatorPaysGstOnFeesAndTdsButNoTcs() {
        Taxes t = Money.taxes(f.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), true, false);
        assertThat(t).isEqualTo(new Taxes(true, false, 0, 18_000, 27_000, 1_000, 0));
        // Brand pays ₹10,000 + ₹1,000 + ₹180 = ₹11,180; the creator gets ₹10,000 − ₹1,500 − ₹270 − ₹10 = ₹8,220.
        Money.OrderAmounts m = new Money.OrderAmounts(f.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), t, 0, 0);
        assertThat(m.totalCents()).isEqualTo(1_118_000);
        assertThat(m.creatorPayoutCents()).isEqualTo(822_000);
    }

    @Test
    void registeredCreatorAddsGstOnThePriceAndHasTcsWithheld() {
        Taxes t = Money.taxes(f.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), false, true);
        assertThat(t.creatorGstCents()).isEqualTo(180_000);
        assertThat(t.tcsCents()).isEqualTo(5_000);
        assertThat(t.tdsCents()).isEqualTo(1_000);
        Money.OrderAmounts m = new Money.OrderAmounts(f.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), t, 0, 0);
        assertThat(m.totalCents()).isEqualTo(1_298_000);
        assertThat(m.creatorPayoutCents()).isEqualTo(997_000);
    }

    @Test
    void splitsIntraStateGstIntoCgstAndSgst() {
        assertThat(Money.splitGst(18_001)).containsExactly(9_000, 9_001);
    }

    @Test
    void discountsComeOffWhatTheBrandPaysNotTheCreatorShare() {
        Taxes t = Money.taxes(f.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), true, false);
        Money.OrderAmounts m = new Money.OrderAmounts(f.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), t, 50_000, 10_000);
        assertThat(m.paidCents()).isEqualTo(1_118_000 - 60_000);
        assertThat(m.creatorPayoutCents()).isEqualTo(822_000);
    }
}
