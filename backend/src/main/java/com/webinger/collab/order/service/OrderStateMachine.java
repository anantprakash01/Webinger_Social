package com.webinger.collab.order.service;

import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.ledger.service.LedgerLines;
import com.webinger.collab.ledger.service.LedgerLines.Line;
import com.webinger.collab.order.service.Money.OrderAmounts;
import com.webinger.collab.user.domain.Role;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;

/**
 * The order state machine (CLAUDE.md §4), a port of the frontend's mock orderMachine.ts with the same states,
 * transitions, guards, error codes and money movements.
 *
 * <pre>
 *   [start] --brand pays (authorised)--> PENDING_ACCEPTANCE
 *   PENDING_ACCEPTANCE --creator accepts (captured)--> IN_PROGRESS
 *   PENDING_ACCEPTANCE --decline / cancel / 72 h (hold released)--> CLOSED
 *   IN_PROGRESS --creator delivers--> DELIVERED
 *   DELIVERED --revision requested (max 2)--> IN_PROGRESS
 *   DELIVERED --brand approves or 72 h (creator paid)--> COMPLETED
 *   DELIVERED --brand disputes--> DISPUTED
 *   DISPUTED --admin releases--> COMPLETED
 *   DISPUTED --admin refunds (full or partial)--> REFUNDED
 *   IN_PROGRESS / DELIVERED --admin cancels (FR-37, full refund)--> REFUNDED
 * </pre>
 *
 * Every money movement belongs to exactly one transition, and no other code path moves money. The machine is
 * pure: it takes a state and returns the next state, the event, the ledger lines and the payment action.
 */
public final class OrderStateMachine {
    private OrderStateMachine() {}

    public enum Status { PENDING_ACCEPTANCE, IN_PROGRESS, DELIVERED, COMPLETED, DISPUTED, REFUNDED, CLOSED }

    public enum CloseReason { DECLINED, EXPIRED, CANCELED }

    public enum PaymentStatus { AUTHORIZED, CAPTURED, REFUNDED, CANCELED }

    public enum PaymentAction { AUTHORIZE, CAPTURE, CANCEL, REFUND }

    public enum EventType { ACCEPT, DECLINE, CANCEL, EXPIRE, DELIVER, REQUEST_REVISION, APPROVE, AUTO_APPROVE, DISPUTE, ADMIN_RELEASE, ADMIN_REFUND, ADMIN_CANCEL }

    public static final Duration ACCEPT_WINDOW = Duration.ofHours(72);
    public static final Duration REVIEW_WINDOW = Duration.ofHours(72);
    public static final int MAX_REVISIONS = 2;
    /** A revision request gives the creator at least this long, even if the due date has passed. */
    public static final Duration REVISION_MIN = Duration.ofDays(3);
    public static final int MIN_DELIVERY_DAYS = 1;
    public static final int MAX_DELIVERY_DAYS = 60;

    /** Who acts: a signed-in user or the scheduled jobs. */
    public record Actor(Long userId, Role role, boolean emailVerified) {
        public static final Actor SYSTEM = new Actor(null, null, true);

        boolean system() {
            return role == null;
        }

        String roleName() {
            return system() ? "SYSTEM" : role.name();
        }
    }

    /** An order as the machine sees it. Immutable: transitions return a new one. */
    public record OrderState(Long brandUserId, Long creatorUserId, Status status, CloseReason closeReason, OrderAmounts amounts, int deliveryDays, Instant acceptBy,
            Instant dueAt, Instant reviewBy, int revisionCount, int maxRevisions, PaymentStatus paymentStatus, long paymentAmountCents, long refundedCents, long version) {

        OrderState with(Status s, CloseReason close, Instant due, Instant review, int revisions, PaymentStatus pay, long refunded) {
            return new OrderState(brandUserId, creatorUserId, s, close, amounts, deliveryDays, acceptBy, due, review, revisions, maxRevisions, pay, paymentAmountCents, refunded,
                    version + 1);
        }
    }

    public record Event(EventType type, String note, Long refundCents) {
        public static Event of(EventType type) {
            return new Event(type, null, null);
        }

        public static Event withNote(EventType type, String note) {
            return new Event(type, note, null);
        }

        public static Event refund(long refundCents, String note) {
            return new Event(EventType.ADMIN_REFUND, note, refundCents);
        }
    }

    public record Result(OrderState order, EventType type, Status from, Status to, String note, List<Line> lines, String memo, PaymentAction paymentAction) {}

    private record Rule(Set<Status> from, Status to, Set<String> by) {}

    private static Rule rule(Status from, Status to, String... by) {
        return new Rule(EnumSet.of(from), to, Set.of(by));
    }

    private static final Map<EventType, Rule> RULES = Map.ofEntries(
            Map.entry(EventType.ACCEPT, rule(Status.PENDING_ACCEPTANCE, Status.IN_PROGRESS, "CREATOR")),
            Map.entry(EventType.DECLINE, rule(Status.PENDING_ACCEPTANCE, Status.CLOSED, "CREATOR")),
            Map.entry(EventType.CANCEL, rule(Status.PENDING_ACCEPTANCE, Status.CLOSED, "BRAND", "CREATOR")),
            Map.entry(EventType.EXPIRE, rule(Status.PENDING_ACCEPTANCE, Status.CLOSED, "SYSTEM")),
            Map.entry(EventType.DELIVER, rule(Status.IN_PROGRESS, Status.DELIVERED, "CREATOR")),
            Map.entry(EventType.REQUEST_REVISION, rule(Status.DELIVERED, Status.IN_PROGRESS, "BRAND")),
            Map.entry(EventType.APPROVE, rule(Status.DELIVERED, Status.COMPLETED, "BRAND")),
            Map.entry(EventType.AUTO_APPROVE, rule(Status.DELIVERED, Status.COMPLETED, "SYSTEM")),
            Map.entry(EventType.DISPUTE, rule(Status.DELIVERED, Status.DISPUTED, "BRAND")),
            Map.entry(EventType.ADMIN_RELEASE, rule(Status.DISPUTED, Status.COMPLETED, "ADMIN")),
            Map.entry(EventType.ADMIN_REFUND, rule(Status.DISPUTED, Status.REFUNDED, "ADMIN")),
            Map.entry(EventType.ADMIN_CANCEL, new Rule(EnumSet.of(Status.IN_PROGRESS, Status.DELIVERED), Status.REFUNDED, Set.of("ADMIN"))));

    private static ApiException error(HttpStatus status, String code, String message) {
        return new ApiException(status, message, code);
    }

    private static boolean isPast(Instant at, Instant now) {
        return at != null && !now.isBefore(at);
    }

    // ---------- Checks shared by every transition ----------

    private static void checkActor(OrderState o, Rule rule, Actor actor) {
        String role = actor.roleName();
        if (!rule.by().contains(role)) throw error(HttpStatus.FORBIDDEN, "ROLE_NOT_ALLOWED", "A " + role.toLowerCase() + " cannot do this.");
        if (actor.role() == Role.BRAND && !actor.userId().equals(o.brandUserId()))
            throw error(HttpStatus.FORBIDDEN, "NOT_ORDER_PARTICIPANT", "This order belongs to another brand.");
        if (actor.role() == Role.CREATOR && !actor.userId().equals(o.creatorUserId()))
            throw error(HttpStatus.FORBIDDEN, "NOT_ORDER_PARTICIPANT", "This order is addressed to another creator.");
    }

    /** Guards beyond "right state, right actor". Null when the event may happen. */
    private static ApiException guard(OrderState o, Event e, Actor actor, Instant now) {
        return switch (e.type()) {
            case ACCEPT -> {
                if (!actor.system() && !actor.emailVerified()) yield error(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED", "Verify your email before accepting orders.");
                yield isPast(o.acceptBy(), now) ? error(HttpStatus.CONFLICT, "ACCEPT_WINDOW_PASSED", "The 72-hour window to accept has passed.") : null;
            }
            case EXPIRE -> isPast(o.acceptBy(), now) ? null : error(HttpStatus.CONFLICT, "NOT_YET_DUE", "The order can still be accepted.");
            case REQUEST_REVISION -> {
                if (o.revisionCount() >= o.maxRevisions())
                    yield error(HttpStatus.CONFLICT, "REVISION_LIMIT", "Only " + o.maxRevisions() + " revisions are included.");
                yield isPast(o.reviewBy(), now) ? error(HttpStatus.CONFLICT, "REVIEW_WINDOW_PASSED", "The 72-hour review window has passed.") : null;
            }
            case APPROVE, DISPUTE -> isPast(o.reviewBy(), now) ? error(HttpStatus.CONFLICT, "REVIEW_WINDOW_PASSED", "The 72-hour review window has passed.") : null;
            case AUTO_APPROVE -> isPast(o.reviewBy(), now) ? null : error(HttpStatus.CONFLICT, "NOT_YET_DUE", "The brand still has time to review.");
            case ADMIN_REFUND -> {
                // A refund goes back to the brand's payment method, so it is capped at what the brand paid.
                long paid = o.amounts().paidCents();
                long cap = Math.min(o.amounts().creatorPayoutCents(), paid);
                Long r = e.refundCents();
                boolean ok = r != null && (r == paid || (r > 0 && r <= cap));
                yield ok ? null
                        : new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Refund the full " + paid + " cents, or a partial amount from 1 to " + cap + " cents.",
                                "INVALID_REFUND_AMOUNT");
            }
            default -> null;
        };
    }

    // ---------- Public API ----------

    /** Events this actor may fire on this order now, in declaration order. The UI offers only these. */
    public static List<EventType> allowedEvents(OrderState o, Actor actor, Instant now) {
        List<EventType> out = new ArrayList<>();
        for (EventType type : EventType.values()) {
            Rule rule = RULES.get(type);
            if (!rule.from().contains(o.status())) continue;
            try {
                checkActor(o, rule, actor);
            } catch (ApiException ex) {
                continue;
            }
            Event probe = type == EventType.ADMIN_REFUND ? Event.refund(o.amounts().paidCents(), null) : Event.of(type);
            if (guard(o, probe, actor, now) == null) out.add(type);
        }
        return out;
    }

    private static String words(Enum<?> e) {
        return e.name().toLowerCase().replace('_', ' ');
    }

    public static Result transition(OrderState o, Event e, Actor actor, Instant now) {
        Rule rule = RULES.get(e.type());
        checkActor(o, rule, actor);
        if (!rule.from().contains(o.status())) {
            throw error(HttpStatus.CONFLICT, "INVALID_TRANSITION", "Cannot " + words(e.type()) + " an order that is " + words(o.status()) + ".");
        }
        ApiException blocked = guard(o, e, actor, now);
        if (blocked != null) throw blocked;

        OrderAmounts m = o.amounts();
        Status to = rule.to();
        OrderState next = o.with(to, o.closeReason(), o.dueAt(), o.reviewBy(), o.revisionCount(), o.paymentStatus(), o.refundedCents());
        List<Line> lines = null;
        String memo = "";
        PaymentAction pay = null;

        switch (e.type()) {
            case ACCEPT -> {
                next = o.with(to, null, now.plus(Duration.ofDays(o.deliveryDays())), o.reviewBy(), o.revisionCount(), PaymentStatus.CAPTURED, o.refundedCents());
                pay = PaymentAction.CAPTURE;
                lines = LedgerLines.capture(m.totalCents(), m.discountCents());
                memo = "Payment captured on acceptance";
            }
            case DECLINE, CANCEL, EXPIRE -> {
                CloseReason reason = e.type() == EventType.DECLINE ? CloseReason.DECLINED : e.type() == EventType.CANCEL ? CloseReason.CANCELED : CloseReason.EXPIRED;
                // Authorisation released: the brand is never charged and nothing reaches the ledger.
                next = o.with(to, reason, o.dueAt(), o.reviewBy(), o.revisionCount(), PaymentStatus.CANCELED, o.refundedCents());
                pay = PaymentAction.CANCEL;
            }
            case DELIVER -> next = o.with(to, null, o.dueAt(), now.plus(REVIEW_WINDOW), o.revisionCount(), o.paymentStatus(), o.refundedCents());
            case REQUEST_REVISION -> {
                Instant floor = now.plus(REVISION_MIN);
                Instant due = o.dueAt() != null && o.dueAt().isAfter(floor) ? o.dueAt() : floor;
                next = o.with(to, null, due, null, o.revisionCount() + 1, o.paymentStatus(), o.refundedCents());
            }
            case APPROVE, AUTO_APPROVE, ADMIN_RELEASE -> {
                lines = LedgerLines.release(m.totalCents(), m.creatorPayoutCents(), m.feeGstCents(), m.withheldCents());
                memo = e.type() == EventType.AUTO_APPROVE ? "Auto-approved after 72 h" : e.type() == EventType.ADMIN_RELEASE ? "Dispute resolved: released" : "Approved by brand";
            }
            case DISPUTE -> {}
            case ADMIN_REFUND -> {
                long refund = e.refundCents();
                next = o.with(to, null, o.dueAt(), o.reviewBy(), o.revisionCount(), PaymentStatus.REFUNDED, refund);
                pay = PaymentAction.REFUND;
                if (refund == m.paidCents()) {
                    lines = LedgerLines.refund(refund, m.discountCents());
                    memo = "Dispute resolved: full refund";
                } else {
                    // A partial refund comes out of the creator's share; the rest follows the release rule.
                    // Provisional until the fee policy for partial refunds is decided (CLAUDE.md §16).
                    lines = new ArrayList<>(LedgerLines.refund(refund, 0));
                    lines.addAll(LedgerLines.release(m.totalCents() - refund, m.creatorPayoutCents() - refund, m.feeGstCents(), m.withheldCents()));
                    memo = "Dispute resolved: partial refund";
                }
            }
            case ADMIN_CANCEL -> {
                long paid = m.paidCents();
                next = o.with(to, null, o.dueAt(), o.reviewBy(), o.revisionCount(), PaymentStatus.REFUNDED, paid);
                pay = PaymentAction.REFUND;
                lines = LedgerLines.refund(paid, m.discountCents());
                memo = "Cancelled by admin: full refund";
            }
        }
        return new Result(next, e.type(), o.status(), to, e.note(), lines == null ? List.of() : List.copyOf(lines), memo, pay);
    }

    /** The scheduled job due for this order now (CLAUDE.md §4.3), or null. */
    public static EventType dueSystemEvent(OrderState o, Instant now) {
        if (o.status() == Status.PENDING_ACCEPTANCE && isPast(o.acceptBy(), now)) return EventType.EXPIRE;
        if (o.status() == Status.DELIVERED && isPast(o.reviewBy(), now)) return EventType.AUTO_APPROVE;
        return null;
    }

    /**
     * Checkout (FR-30): checks the brand, price, days and discount, and returns the new order — payment
     * authorised, fees and taxes copied on, 72 hours to accept.
     */
    public static OrderState create(Long creatorUserId, Actor actor, long priceCents, int deliveryDays, int maxRevisions, OrderAmounts amounts, Instant now) {
        if (actor.role() != Role.BRAND) throw error(HttpStatus.FORBIDDEN, "ROLE_NOT_ALLOWED", "Only brands can place orders.");
        if (!actor.emailVerified()) throw error(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED", "Verify your email before placing orders.");
        if (priceCents < Money.MIN_PRICE_CENTS) throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "The minimum price is ₹500.", "PRICE_TOO_LOW");
        if (deliveryDays < MIN_DELIVERY_DAYS || deliveryDays > MAX_DELIVERY_DAYS)
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Delivery must be between 1 and 60 days.", "INVALID_DELIVERY_DAYS");
        if (amounts.promoCents() < 0 || amounts.creditCents() < 0 || amounts.paidCents() < Money.MIN_CHARGE_CENTS)
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Discounts cannot bring the payment below ₹1.", "DISCOUNT_TOO_LARGE");
        return new OrderState(actor.userId(), creatorUserId, Status.PENDING_ACCEPTANCE, null, amounts, deliveryDays, now.plus(ACCEPT_WINDOW), null, null, 0, maxRevisions,
                PaymentStatus.AUTHORIZED, amounts.paidCents(), 0, 0);
    }
}
