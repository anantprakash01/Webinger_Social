package com.webinger.collab.payout;

import static org.assertj.core.api.Assertions.assertThat;

import com.webinger.collab.ledger.service.LedgerLines.Account;
import com.webinger.collab.ledger.service.LedgerService;
import com.webinger.collab.payout.service.PayoutService;
import com.webinger.collab.support.ApiTest;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Creator balances and payouts (FR-62, FR-63), ported from the withdrawal cases in
 * frontend/src/api/mock/handlers/payments.test.ts plus the overview, idempotency and the Monday run.
 * Leo starts with the balance of his two completed demo orders.
 */
class PayoutApiTest extends ApiTest {
    static final AtomicInteger KEYS = new AtomicInteger();

    @Autowired
    LedgerService ledger;

    static String key() {
        return "payout-key-" + KEYS.incrementAndGet();
    }

    static long num(Object o) {
        return ((Number) o).longValue();
    }

    @BeforeEach
    void asLeo() throws Exception {
        login("creator@demo.test", DEMO_PASSWORD);
    }

    Res expect(Res r, int status, String code) {
        assertThat(r.status()).as(r.body()).isEqualTo(status);
        if (code != null) assertThat(r.code()).isEqualTo(code);
        return r;
    }

    String withdraw(long cents, String speed) {
        return "{\"amountCents\":" + cents + ",\"speed\":\"" + speed + "\"}";
    }

    @Test
    void theOverviewShowsBalanceTransfersAccountAndRules() throws Exception {
        Res o = expect(call("GET", "/payouts/balance", null), 200, null);
        assertThat(num(o.get("$.availableCents"))).isGreaterThan(100_000);
        assertThat(num(o.get("$.lifetimeEarnedCents"))).isEqualTo(num(o.get("$.availableCents")));
        assertThat(num(o.get("$.paidOutCents"))).isZero();
        assertThat(num(o.get("$.inEscrowCents"))).isPositive();
        assertThat(o.str("$.account.status")).isEqualTo("VERIFIED");
        assertThat(o.str("$.account.method")).isEqualTo("BANK_ACCOUNT");
        assertThat(o.body()).contains("\"schedule\":\"WEEKLY_MONDAY\"", "\"autoWeekly\":true", "\"minWithdrawalCents\":50000", "\"instantFeeBps\":100",
                "\"instantFeeMinCents\":1000", "\"payoutStatus\":\"ENABLED\"", "\"payouts\":[]");
        // Two completed demo orders moved to the balance, newest first.
        List<Number> amounts = (List<Number>) o.get("$.transfers[*].amountCents");
        assertThat(amounts).hasSize(2);
        assertThat(amounts.stream().mapToLong(Number::longValue).sum()).isEqualTo(num(o.get("$.availableCents")));
        assertThat((List<String>) o.get("$.transfers[*].orderTitle")).contains("YouTube integration (60–90 s)");
        assertThat(Instant.parse(o.str("$.nextPayoutAt")).atZone(java.time.ZoneOffset.UTC).getDayOfWeek()).isEqualTo(java.time.DayOfWeek.MONDAY);
        assertThat(o.str("$.financialYear")).matches("\\d{4}-\\d{2}");
        assertThat(num(o.get("$.tdsWithheldCents"))).isPositive(); // 0.1% TDS on the released orders this year
        assertThat(num(o.get("$.tcsWithheldCents"))).isZero(); // Leo is not GST-registered
    }

    @Test
    void withdrawsStandardFreeOrInstantAtOnePercentAndAtLeast10Rupees() throws Exception {
        long available = num(call("GET", "/payouts/balance", null).get("$.availableCents"));
        assertThat(call("POST", "/payouts/withdrawals", withdraw(10_000, "STANDARD"), key()).str("$.errors[0].message")).isEqualTo("The minimum withdrawal is ₹500.");
        assertThat(expect(call("POST", "/payouts/withdrawals", withdraw(available + 1, "STANDARD"), key()), 422, "VALIDATION_FAILED").str("$.errors[0].message"))
                .isEqualTo("That is more than your available balance.");
        expect(call("POST", "/payouts/withdrawals", withdraw(50_000, "OVERNIGHT"), key()), 422, "VALIDATION_FAILED");

        Res std = expect(call("POST", "/payouts/withdrawals", withdraw(50_000, "STANDARD"), key()), 201, null);
        assertThat(num(std.get("$.amountCents"))).isEqualTo(50_000);
        assertThat(num(std.get("$.feeCents"))).isZero();
        assertThat(std.str("$.speed")).isEqualTo("STANDARD");
        assertThat(std.str("$.status")).isEqualTo("IN_TRANSIT");
        assertThat(std.str("$.id")).startsWith("pout_");
        assertThat(std.str("$.destinationLabel")).isEqualTo("HDFC Bank •••• 0189");

        long rest = available - 50_000;
        Res inst = expect(call("POST", "/payouts/withdrawals", withdraw(rest, "INSTANT"), key()), 201, null);
        assertThat(num(inst.get("$.feeCents"))).isEqualTo(PayoutService.instantFee(rest));
        assertThat(PayoutService.instantFee(50_000)).isEqualTo(1_000); // ₹10 minimum
        assertThat(PayoutService.instantFee(1_000_000)).isEqualTo(10_000); // 1%

        Res after = call("GET", "/payouts/balance", null);
        assertThat(num(after.get("$.availableCents"))).isZero();
        assertThat(num(after.get("$.paidOutCents"))).isEqualTo(available);
        assertThat((List<String>) after.get("$.payouts[*].speed")).containsExactly("INSTANT", "STANDARD");
        assertThat(ledger.balance("payout_" + inst.str("$.id"), Account.PLATFORM_REVENUE)).isEqualTo(PayoutService.instantFee(rest));
        assertThat(ledger.balance("payout_" + inst.str("$.id"), Account.PAYOUT)).isEqualTo(rest - PayoutService.instantFee(rest));
        assertThat(ledger.unbalancedTransactions()).isEmpty();
        // Lifetime earnings do not shrink when money is paid out.
        assertThat(num(after.get("$.lifetimeEarnedCents"))).isEqualTo(available);
    }

    @Test
    void aRetriedWithdrawalWithTheSameKeyPaysOnce() throws Exception {
        String k = key();
        String a = expect(call("POST", "/payouts/withdrawals", withdraw(50_000, "STANDARD"), k), 201, null).str("$.id");
        String b = expect(call("POST", "/payouts/withdrawals", withdraw(50_000, "STANDARD"), k), 201, null).str("$.id");
        assertThat(b).isEqualTo(a);
        assertThat((List<?>) call("GET", "/payouts/balance", null).get("$.payouts")).hasSize(1);
    }

    @Test
    void needsAVerifiedPayoutAccount() throws Exception {
        call("PUT", "/payouts/account", "{\"pan\":\"ABCDE1234F\",\"holderName\":\"Leo Fernandes\",\"method\":\"BANK_ACCOUNT\",\"accountNumber\":\"000000000\",\"ifsc\":\"HDFC0001234\"}");
        expect(call("POST", "/payouts/withdrawals", withdraw(50_000, "STANDARD"), key()), 409, "PAYOUT_ACCOUNT_REQUIRED");
    }

    @Test
    void paysTheWholeBalanceOnMondaysUnlessTheWeeklyPayoutIsOff() throws Exception {
        long available = num(call("GET", "/payouts/balance", null).get("$.availableCents"));
        expect(call("POST", "/dev/simulate-time", "{\"hours\":192}"), 200, null);
        asLeo(); // the access token expired with the clock
        Res after = call("GET", "/payouts/balance", null);
        assertThat((List<String>) after.get("$.payouts[*].speed")).containsExactly("SCHEDULED");
        // The two delivered demo orders auto-approved first (expiry and approval run before payouts), so Monday paid out more.
        assertThat(num(after.get("$.payouts[0].amountCents"))).isGreaterThan(available);
        assertThat(num(after.get("$.availableCents"))).isZero();
        Instant sent = Instant.parse(after.str("$.payouts[0].createdAt"));
        assertThat(sent.atZone(java.time.ZoneOffset.UTC).getDayOfWeek()).isEqualTo(java.time.DayOfWeek.MONDAY);
        assertThat(sent.atZone(java.time.ZoneOffset.UTC).toLocalTime()).isEqualTo(java.time.LocalTime.MIDNIGHT);
        // It arrives a day later.
        call("POST", "/dev/simulate-time", "{\"hours\":48}");
        asLeo();
        assertThat(call("GET", "/payouts/balance", null).str("$.payouts[0].status")).isEqualTo("PAID");
    }

    @Test
    void skipsTheMondayPayoutWhenTheCreatorTurnsItOff() throws Exception {
        Res o = expect(call("PUT", "/payouts/settings", "{\"autoWeekly\":false}"), 200, null);
        assertThat((Boolean) o.get("$.autoWeekly")).isFalse();
        long available = num(o.get("$.availableCents"));
        call("POST", "/dev/simulate-time", "{\"hours\":192}");
        asLeo();
        Res after = call("GET", "/payouts/balance", null);
        assertThat((List<?>) after.get("$.payouts")).isEmpty();
        assertThat(num(after.get("$.availableCents"))).isGreaterThanOrEqualTo(available);
        expect(call("PUT", "/payouts/settings", "{}"), 422, "VALIDATION_FAILED");
    }

    @Test
    void isCreatorOnly() throws Exception {
        login("brand@demo.test", DEMO_PASSWORD);
        expect(call("GET", "/payouts/balance", null), 403, "ROLE_NOT_ALLOWED");
        expect(call("POST", "/payouts/withdrawals", withdraw(50_000, "STANDARD"), key()), 403, "ROLE_NOT_ALLOWED");
        expect(call("PUT", "/payouts/settings", "{\"autoWeekly\":false}"), 403, "ROLE_NOT_ALLOWED");
        signOutLocally();
        expect(call("GET", "/payouts/balance", null), 401, null);
    }

    @Test
    void financialYearsRunFromAprilToMarch() {
        assertThat(PayoutService.financialYear(Instant.parse("2026-11-23T00:00:00Z")).label()).isEqualTo("2026-27");
        assertThat(PayoutService.financialYear(Instant.parse("2027-03-31T23:59:59Z")).label()).isEqualTo("2026-27");
        assertThat(PayoutService.financialYear(Instant.parse("2027-04-01T00:00:00Z")).label()).isEqualTo("2027-28");
        assertThat(PayoutService.nextMonday(Instant.parse("2026-11-23T10:00:00Z"))).isEqualTo(Instant.parse("2026-11-30T00:00:00Z")); // a Monday → the next one
        assertThat(PayoutService.nextMonday(Instant.parse("2026-11-22T23:59:00Z"))).isEqualTo(Instant.parse("2026-11-23T00:00:00Z"));
    }
}
