package com.webinger.collab.dev;

import com.webinger.collab.common.AdjustableClock;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.order.service.OrderService;
import com.webinger.collab.payment.service.PaymentService;
import com.webinger.collab.creator.service.CreatorService;
import com.webinger.collab.creator.web.CreatorDtos.CreatorMeDto;
import com.webinger.collab.messaging.OutboxMessage;
import com.webinger.collab.messaging.OutboxMessageRepository;
import com.webinger.collab.security.AuthUser;
import java.time.Instant;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Demo-only helpers (app.demo=true), never in production — like the mock's /dev endpoints.
 * GET /dev/outbox lets the demo inbox show the verification and reset emails.
 * POST /dev/vetting-decision approves or rejects the signed-in creator's own profile in review, so the
 * demo can show every vetting state without an admin.
 */
@RestController
@RequestMapping("/dev")
@ConditionalOnProperty(prefix = "app", name = "demo", havingValue = "true")
public class DevController {
    private final OutboxMessageRepository outbox;
    private final CreatorService creators;
    private final PaymentService payments;
    private final OrderService orders;
    private final AdjustableClock clock;

    public DevController(OutboxMessageRepository outbox, CreatorService creators, PaymentService payments, OrderService orders, AdjustableClock clock) {
        this.outbox = outbox;
        this.creators = creators;
        this.payments = payments;
        this.orders = orders;
        this.clock = clock;
    }

    /** Same shape as the mock's OutboxEmail. */
    public record OutboxEmail(String id, String channel, String to, String subject, String body, String link, Instant createdAt) {}

    @GetMapping("/outbox")
    public List<OutboxEmail> outbox(@RequestParam(required = false) String to) {
        List<OutboxMessage> rows = to == null || to.isBlank() ? outbox.findTop50ByOrderByIdDesc() : outbox.findTop50ByToAddressOrderByIdDesc(to.trim().toLowerCase(java.util.Locale.ROOT));
        return rows.stream().map(m -> new OutboxEmail(m.getPublicId(), m.getChannel(), m.getToAddress(), m.getSubject(), m.getBody(), m.getLink(), m.getCreatedAt())).toList();
    }

    /** POST /dev/razorpay/pay: plays the brand paying in Razorpay Checkout (simulator; Razorpay's test values). */
    @PostMapping("/razorpay/pay")
    public PaymentService.CheckoutResult pay(@AuthenticationPrincipal AuthUser me, @RequestBody PaymentService.CheckoutInput body) {
        if (me == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in.", "NOT_AUTHENTICATED");
        return payments.simulateCheckout(me, body);
    }

    public record SimulateTime(Integer hours) {}

    public record ClockView(long offsetHours, java.time.Instant now) {}

    public record SimulateResult(long offsetHours, java.time.Instant now, int expired, int autoApproved) {}

    /** POST /dev/simulate-time: moves the app clock forward and runs the scheduled jobs (expiry, auto-approval). */
    @PostMapping("/simulate-time")
    public SimulateResult simulateTime(@RequestBody(required = false) SimulateTime body) {
        Integer h = body == null ? null : body.hours();
        if (h == null || h < 1 || h > 720) throw ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "Hours must be a whole number from 1 to 720.", "VALIDATION_FAILED", "hours", "1 to 720.");
        clock.advance(java.time.Duration.ofHours(h));
        OrderService.JobCounts jobs = orders.runDueJobs();
        return new SimulateResult(clock.offset().toHours(), clock.instant(), jobs.expired(), jobs.autoApproved());
    }

    @GetMapping("/clock")
    public ClockView clock() {
        return new ClockView(clock.offset().toHours(), clock.instant());
    }

    public record VettingDecision(String decision, String reason) {}

    @PostMapping("/vetting-decision")
    public CreatorMeDto vettingDecision(@AuthenticationPrincipal AuthUser me, @RequestBody(required = false) VettingDecision body) {
        if (me == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in.", "NOT_AUTHENTICATED");
        return creators.decideOwnForDemo(me, body == null ? null : body.decision(), body == null ? null : body.reason());
    }
}
