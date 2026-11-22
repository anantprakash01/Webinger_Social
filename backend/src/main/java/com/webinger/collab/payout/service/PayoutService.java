package com.webinger.collab.payout.service;

import com.webinger.collab.common.Catalog;
import com.webinger.collab.common.Ulid;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.common.web.FieldCheck;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.service.CreatorService;
import com.webinger.collab.creator.service.PayoutAccountService;
import com.webinger.collab.creator.web.CreatorDtos.PayoutAccountDto;
import com.webinger.collab.ledger.service.LedgerLines;
import com.webinger.collab.ledger.service.LedgerService;
import com.webinger.collab.order.service.CreatorTrackRecord;
import com.webinger.collab.order.service.IdempotencyService;
import com.webinger.collab.order.service.Money;
import com.webinger.collab.payout.domain.JobRun;
import com.webinger.collab.payout.domain.Payout;
import com.webinger.collab.payout.repository.JobRunRepository;
import com.webinger.collab.payout.repository.PayoutRepository;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.service.UserService;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creator balances and payouts (FR-62, FR-63), ported from the mock's payoutsCore.ts and handlers/payouts.ts.
 * Approval credits CREATOR_BALANCE (the ledger); money leaves as a RazorpayX payout — every Monday 00:00 UTC for
 * creators with the weekly payout on, or on request (standard, free; instant, 1% and at least ₹10).
 * Each payout posts CREATOR_BALANCE → PAYOUT (+ PLATFORM_REVENUE for an instant fee), referenced `payout_<id>`.
 * RazorpayX is simulated until the account is connected: payouts arrive after the usual delay.
 */
@Service
public class PayoutService {
    public static final long MIN_WITHDRAWAL_CENTS = 50_000; // ₹500
    public static final int INSTANT_FEE_BPS = 100; // 1%
    public static final long INSTANT_FEE_MIN_CENTS = 1_000; // ₹10
    private static final String WEEKLY_JOB = "weekly-payouts";
    private static final Map<String, Duration> ARRIVAL = Map.of("SCHEDULED", Duration.ofDays(1), "STANDARD", Duration.ofDays(1), "INSTANT", Duration.ofMinutes(5));

    private final PayoutRepository payouts;
    private final JobRunRepository jobRuns;
    private final CreatorService creators;
    private final PayoutAccountService accounts;
    private final CreatorTrackRecord track;
    private final LedgerService ledger;
    private final IdempotencyService idempotency;
    private final UserService users;
    private final Clock clock;

    public PayoutService(PayoutRepository payouts, JobRunRepository jobRuns, CreatorService creators, PayoutAccountService accounts, CreatorTrackRecord track,
            LedgerService ledger, IdempotencyService idempotency, UserService users, Clock clock) {
        this.payouts = payouts;
        this.jobRuns = jobRuns;
        this.creators = creators;
        this.accounts = accounts;
        this.track = track;
        this.ledger = ledger;
        this.idempotency = idempotency;
        this.users = users;
        this.clock = clock;
    }

    public record PayoutDto(String id, long amountCents, long feeCents, String speed, String destinationLabel, String status, Instant createdAt, Instant arrivalDate,
            String failureReason) {}

    public record Overview(String currency, long availableCents, long inEscrowCents, long lifetimeEarnedCents, long paidOutCents, Instant nextPayoutAt, String schedule,
            String payoutStatus, List<CreatorTrackRecord.Transfer> transfers, List<PayoutDto> payouts, PayoutAccountDto account, boolean autoWeekly,
            long minWithdrawalCents, int instantFeeBps, long instantFeeMinCents, String financialYear, long tdsWithheldCents, long tcsWithheldCents) {}

    public record WithdrawalRequest(Long amountCents, String speed) {}

    public record Settings(Boolean autoWeekly) {}

    /** Instant payout fee: 1% of the amount, at least ₹10. */
    public static long instantFee(long amountCents) {
        return Math.max(INSTANT_FEE_MIN_CENTS, Money.applyBps(amountCents, INSTANT_FEE_BPS));
    }

    /** The first Monday 00:00 UTC strictly after `t`. */
    public static Instant nextMonday(Instant t) {
        LocalDate d = LocalDate.ofInstant(t, ZoneOffset.UTC);
        return d.with(TemporalAdjusters.next(DayOfWeek.MONDAY)).atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    /** Indian financial year (1 April – 31 March) of a date, e.g. "2026-27", and when it started. */
    public record FinancialYear(String label, Instant start) {}

    public static FinancialYear financialYear(Instant t) {
        LocalDate d = LocalDate.ofInstant(t, ZoneOffset.UTC);
        int y = d.getMonthValue() >= 4 ? d.getYear() : d.getYear() - 1;
        return new FinancialYear(y + "-" + String.format("%02d", (y + 1) % 100), LocalDate.of(y, 4, 1).atStartOfDay().toInstant(ZoneOffset.UTC));
    }

    static PayoutDto toDto(Payout p) {
        return new PayoutDto(p.getPublicId(), p.getAmountCents(), p.getFeeCents(), p.getSpeed(), p.getDestinationLabel(), p.getStatus(), p.getCreatedAt(), p.getArrivalDate(),
                p.getFailureReason());
    }

    // ---------- Overview (FR-63) ----------

    @Transactional(readOnly = true)
    public Overview overview(AuthUser me) {
        CreatorProfile p = creators.ownProfile(me);
        Instant now = clock.instant();
        CreatorTrackRecord.Earnings e = track.earnings(p.getUserId());
        List<Payout> mine = payouts.findByCreatorUserIdOrderByCreatedAtDescIdDesc(p.getUserId());
        long paidOut = mine.stream().filter(x -> !"FAILED".equals(x.getStatus())).mapToLong(Payout::getAmountCents).sum();
        FinancialYear fy = financialYear(now);
        CreatorTrackRecord.Withheld w = track.withheldSince(p.getUserId(), fy.start());
        return new Overview(Catalog.CURRENCY, e.availableCents(), e.inEscrowCents(), e.lifetimeEarnedCents(), paidOut, nextMonday(now), "WEEKLY_MONDAY", p.getPayoutStatus(),
                track.transfers(p.getUserId()), mine.stream().map(PayoutService::toDto).toList(), accounts.accountOf(p.getId()).orElse(null), p.isAutoWeekly(),
                MIN_WITHDRAWAL_CENTS, INSTANT_FEE_BPS, INSTANT_FEE_MIN_CENTS, fy.label(), w.tdsCents(), w.tcsCents());
    }

    @Transactional
    public Overview settings(AuthUser me, Settings in) {
        if (in == null || in.autoWeekly() == null) throw FieldCheck.invalid("autoWeekly", "Choose whether to be paid every Monday.");
        creators.setAutoWeekly(me, in.autoWeekly());
        return overview(me);
    }

    // ---------- Withdraw now ----------

    /** POST /payouts/withdrawals with an Idempotency-Key: a retry returns the first payout. */
    @Transactional
    public PayoutDto withdrawOnce(AuthUser me, String key, WithdrawalRequest in) {
        String ref = idempotency.once(me, key, "POST", "/payouts/withdrawals", 201, () -> withdraw(me, in).getPublicId());
        return toDto(payouts.findByPublicId(ref).orElseThrow());
    }

    /** Standard (NEFT, free, next working day) or instant (IMPS/UPI, fee, minutes), from the available balance. */
    Payout withdraw(AuthUser me, WithdrawalRequest in) {
        CreatorProfile p = creators.ownProfile(me);
        FieldCheck c = new FieldCheck();
        c.whole("amountCents", in.amountCents(), MIN_WITHDRAWAL_CENTS, Long.MAX_VALUE / 4, "Enter an amount.", "The minimum withdrawal is ₹500.", "That amount is too large.");
        c.oneOf("speed", in.speed() == null ? null : in.speed().toUpperCase(Locale.ROOT), Set.of("STANDARD", "INSTANT"), "Choose standard or instant.");
        c.throwIfAny();
        PayoutAccountDto account = accounts.accountOf(p.getId()).filter(a -> "VERIFIED".equals(a.status()))
                .orElseThrow(() -> new ApiException(HttpStatus.CONFLICT, "Add and verify a payout account first.", "PAYOUT_ACCOUNT_REQUIRED"));
        long available = ledger.creatorBalance(p.getUserId());
        if (in.amountCents() > available) throw FieldCheck.invalid("amountCents", "That is more than your available balance.");
        String speed = in.speed().toUpperCase(Locale.ROOT);
        long fee = "INSTANT".equals(speed) ? instantFee(in.amountCents()) : 0;
        if (fee >= in.amountCents()) throw FieldCheck.invalid("amountCents", "The amount must be more than the instant fee.");
        return send(p.getUserId(), account.destinationLabel(), in.amountCents(), fee, speed, users.get(me.userId()), clock.instant());
    }

    /** One RazorpayX payout from the balance: the payout row and its balanced ledger posting. */
    private Payout send(Long creatorUserId, String destination, long amountCents, long feeCents, String speed, User actor, Instant at) {
        Instant now = clock.instant();
        Instant arrival = at.plus(ARRIVAL.get(speed));
        Payout p = new Payout();
        p.setPublicId("pout_" + Ulid.next(at.toEpochMilli()).toLowerCase(Locale.ROOT));
        p.setCreatorUserId(creatorUserId);
        p.setAmountCents(amountCents);
        p.setFeeCents(feeCents);
        p.setSpeed(speed);
        p.setDestinationLabel(destination);
        p.setStatus(arrival.isAfter(now) ? "IN_TRANSIT" : "PAID");
        p.setCreatedAt(at);
        p.setArrivalDate(arrival);
        payouts.save(p);
        String memo = "SCHEDULED".equals(speed) ? "Weekly payout" : "INSTANT".equals(speed) ? "Instant withdrawal" : "Withdrawal";
        ledger.post("payout_" + p.getPublicId(), memo, LedgerLines.payout(amountCents, feeCents), creatorUserId, actor);
        return p;
    }

    // ---------- Scheduled job ----------

    /** Starts the weekly schedule from `at` if it has not started (demo data, like the mock's lastPayoutRunAt). */
    @Transactional
    public void startWeeklySchedule(Instant at) {
        if (!jobRuns.existsById(WEEKLY_JOB)) jobRuns.save(new JobRun(WEEKLY_JOB, at));
    }

    /**
     * Marks arrived payouts PAID and, once per Monday boundary since the last run, pays out the whole available balance
     * of every creator with the weekly payout on and a verified account. Returns how many payouts it sent.
     */
    @Transactional
    public int runWeekly() {
        Instant now = clock.instant();
        payouts.findByStatusAndArrivalDateLessThanEqual("IN_TRANSIT", now).forEach(p -> p.setStatus("PAID"));
        JobRun run = jobRuns.findById(WEEKLY_JOB).orElse(null);
        if (run == null) {
            jobRuns.save(new JobRun(WEEKLY_JOB, now)); // first start: the next Monday is the first payout day
            return 0;
        }
        Instant boundary = nextMonday(run.getLastRunAt());
        if (boundary.isAfter(now)) return 0;
        int made = 0;
        for (CreatorProfile c : creators.weeklyPayoutCreators()) {
            var account = accounts.accountOf(c.getId()).filter(a -> "VERIFIED".equals(a.status()));
            if (account.isEmpty()) continue;
            long available = ledger.creatorBalance(c.getUserId());
            if (available <= 0) continue;
            send(c.getUserId(), account.get().destinationLabel(), available, 0, "SCHEDULED", null, boundary);
            made++;
        }
        run.setLastRunAt(now);
        return made;
    }
}
