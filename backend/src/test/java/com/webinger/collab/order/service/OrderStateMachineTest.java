package com.webinger.collab.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.ledger.service.LedgerLines;
import com.webinger.collab.ledger.service.LedgerLines.Account;
import com.webinger.collab.ledger.service.LedgerLines.Line;
import com.webinger.collab.order.service.Money.FeeRates;
import com.webinger.collab.order.service.Money.OrderAmounts;
import com.webinger.collab.order.service.OrderStateMachine.Actor;
import com.webinger.collab.order.service.OrderStateMachine.CloseReason;
import com.webinger.collab.order.service.OrderStateMachine.Event;
import com.webinger.collab.order.service.OrderStateMachine.EventType;
import com.webinger.collab.order.service.OrderStateMachine.OrderState;
import com.webinger.collab.order.service.OrderStateMachine.PaymentAction;
import com.webinger.collab.order.service.OrderStateMachine.PaymentStatus;
import com.webinger.collab.order.service.OrderStateMachine.Result;
import com.webinger.collab.order.service.OrderStateMachine.Status;
import com.webinger.collab.user.domain.Role;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The order state machine, ported case for case from frontend/src/api/mock/orderMachine.test.ts
 * (₹10,000 package, default fees, unregistered creator in the platform's state).
 */
class OrderStateMachineTest {
    static final Instant T0 = Instant.parse("2026-11-20T10:00:00Z");

    static Instant hours(long h) {
        return T0.plus(Duration.ofHours(h));
    }

    static final Actor BRAND = new Actor(1L, Role.BRAND, true);
    static final Actor OTHER_BRAND = new Actor(2L, Role.BRAND, true);
    static final Actor CREATOR = new Actor(11L, Role.CREATOR, true);
    static final Actor OTHER_CREATOR = new Actor(12L, Role.CREATOR, true);
    static final Actor ADMIN = new Actor(21L, Role.ADMIN, true);
    static final Actor SYSTEM = Actor.SYSTEM;

    static OrderAmounts amounts(long price) {
        Money.Fees f = Money.fees(price, FeeRates.DEFAULT);
        return new OrderAmounts(price, f.brandFeeCents(), f.creatorFeeCents(), Money.taxes(price, f.brandFeeCents(), f.creatorFeeCents(), true, false), 0, 0);
    }

    static OrderState newOrder() {
        return OrderStateMachine.create(11L, BRAND, 1_000_000, 5, OrderStateMachine.MAX_REVISIONS, amounts(1_000_000), T0);
    }

    record Step(Event event, Actor actor, long atHours) {}

    static Step step(EventType t, Actor a, long h) {
        return new Step(Event.of(t), a, h);
    }

    /** Runs the steps from a new order and collects every ledger line. */
    record Run(OrderState order, List<Line> ledger) {}

    static Run run(Step... steps) {
        OrderState o = newOrder();
        List<Line> ledger = new ArrayList<>();
        for (Step s : steps) {
            Result r = OrderStateMachine.transition(o, s.event(), s.actor(), hours(s.atHours()));
            o = r.order();
            ledger.addAll(r.lines());
        }
        return new Run(o, ledger);
    }

    static long balance(List<Line> lines, Account account) {
        return lines.stream().filter(l -> l.account() == account).mapToLong(l -> l.debitCents() - l.creditCents()).sum();
    }

    static void expectError(Runnable r, int status, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.status().value()).isEqualTo(status);
            assertThat(e.code()).isEqualTo(code);
        });
    }

    @Nested
    class Checkout {
        @Test
        void authorisesTheTotalAndCopiesFeesOntoTheOrder() {
            OrderState o = newOrder();
            assertThat(o.status()).isEqualTo(Status.PENDING_ACCEPTANCE);
            assertThat(o.amounts().priceCents()).isEqualTo(1_000_000);
            assertThat(o.amounts().brandFeeCents()).isEqualTo(100_000);
            assertThat(o.amounts().creatorFeeCents()).isEqualTo(150_000);
            assertThat(o.paymentStatus()).isEqualTo(PaymentStatus.AUTHORIZED);
            assertThat(o.paymentAmountCents()).isEqualTo(1_118_000);
            assertThat(o.refundedCents()).isZero();
            assertThat(o.acceptBy()).isEqualTo(hours(72));
        }

        @Test
        void onlyVerifiedBrandsCanOrder() {
            expectError(() -> OrderStateMachine.create(11L, CREATOR, 1_000_000, 5, 2, amounts(1_000_000), T0), 403, "ROLE_NOT_ALLOWED");
            expectError(() -> OrderStateMachine.create(11L, new Actor(1L, Role.BRAND, false), 1_000_000, 5, 2, amounts(1_000_000), T0), 403, "EMAIL_NOT_VERIFIED");
        }

        @Test
        void validatesPriceDaysAndDiscount() {
            expectError(() -> OrderStateMachine.create(11L, BRAND, 49_999, 5, 2, amounts(49_999), T0), 422, "PRICE_TOO_LOW");
            expectError(() -> OrderStateMachine.create(11L, BRAND, 1_000_000, 0, 2, amounts(1_000_000), T0), 422, "INVALID_DELIVERY_DAYS");
            expectError(() -> OrderStateMachine.create(11L, BRAND, 1_000_000, 61, 2, amounts(1_000_000), T0), 422, "INVALID_DELIVERY_DAYS");
            OrderAmounts a = amounts(1_000_000);
            OrderAmounts tooMuch = new OrderAmounts(a.priceCents(), a.brandFeeCents(), a.creatorFeeCents(), a.taxes(), a.totalCents() - 99, 0);
            expectError(() -> OrderStateMachine.create(11L, BRAND, 1_000_000, 5, 2, tooMuch, T0), 422, "DISCOUNT_TOO_LARGE");
            assertThat(OrderStateMachine.create(11L, BRAND, 50_000, 60, 2, amounts(50_000), T0).status()).isEqualTo(Status.PENDING_ACCEPTANCE);
        }
    }

    @Nested
    class PendingAcceptance {
        @Test
        void acceptCapturesIntoEscrowAndSetsTheDueDate() {
            Run r = run(step(EventType.ACCEPT, CREATOR, 1));
            assertThat(r.order().status()).isEqualTo(Status.IN_PROGRESS);
            assertThat(r.order().paymentStatus()).isEqualTo(PaymentStatus.CAPTURED);
            assertThat(r.order().dueAt()).isEqualTo(hours(1 + 5 * 24));
            assertThat(balance(r.ledger(), Account.ESCROW)).isEqualTo(1_118_000);
            assertThat(balance(r.ledger(), Account.BRAND_CHARGE)).isEqualTo(-1_118_000);
            assertThat(r.order().version()).isEqualTo(1);
        }

        @ParameterizedTest
        @CsvSource({"DECLINE,CREATOR,DECLINED", "CANCEL,BRAND,CANCELED", "CANCEL,CREATOR,CANCELED"})
        void declineOrCancelClosesAndReleasesTheHoldWithoutLedger(EventType type, String who, CloseReason reason) {
            Result r = OrderStateMachine.transition(newOrder(), Event.of(type), who.equals("BRAND") ? BRAND : CREATOR, T0);
            assertThat(r.order().status()).isEqualTo(Status.CLOSED);
            assertThat(r.order().closeReason()).isEqualTo(reason);
            assertThat(r.order().paymentStatus()).isEqualTo(PaymentStatus.CANCELED);
            assertThat(r.paymentAction()).isEqualTo(PaymentAction.CANCEL);
            assertThat(r.lines()).isEmpty();
        }

        @Test
        void expiresOnlyAfter72Hours() {
            expectError(() -> OrderStateMachine.transition(newOrder(), Event.of(EventType.EXPIRE), SYSTEM, hours(71)), 409, "NOT_YET_DUE");
            Result r = OrderStateMachine.transition(newOrder(), Event.of(EventType.EXPIRE), SYSTEM, hours(72));
            assertThat(r.order().status()).isEqualTo(Status.CLOSED);
            assertThat(r.order().closeReason()).isEqualTo(CloseReason.EXPIRED);
            assertThat(r.order().paymentStatus()).isEqualTo(PaymentStatus.CANCELED);
        }

        @Test
        void cannotAcceptAfterTheWindowNorWithoutAVerifiedEmail() {
            expectError(() -> OrderStateMachine.transition(newOrder(), Event.of(EventType.ACCEPT), CREATOR, hours(72)), 409, "ACCEPT_WINDOW_PASSED");
            expectError(() -> OrderStateMachine.transition(newOrder(), Event.of(EventType.ACCEPT), new Actor(11L, Role.CREATOR, false), T0), 403, "EMAIL_NOT_VERIFIED");
        }

        @Test
        void enforcesRoleAndOwnership() {
            expectError(() -> OrderStateMachine.transition(newOrder(), Event.of(EventType.ACCEPT), BRAND, T0), 403, "ROLE_NOT_ALLOWED");
            expectError(() -> OrderStateMachine.transition(newOrder(), Event.of(EventType.ACCEPT), OTHER_CREATOR, T0), 403, "NOT_ORDER_PARTICIPANT");
            expectError(() -> OrderStateMachine.transition(newOrder(), Event.of(EventType.CANCEL), OTHER_BRAND, T0), 403, "NOT_ORDER_PARTICIPANT");
            expectError(() -> OrderStateMachine.transition(newOrder(), Event.of(EventType.EXPIRE), ADMIN, hours(80)), 403, "ROLE_NOT_ALLOWED");
        }
    }

    @Nested
    class InProgressAndDelivered {
        final Step accept = step(EventType.ACCEPT, CREATOR, 1);
        final Step deliver = step(EventType.DELIVER, CREATOR, 48);

        @Test
        void deliverOpensA72HourReviewWindow() {
            Run r = run(accept, deliver);
            assertThat(r.order().status()).isEqualTo(Status.DELIVERED);
            assertThat(r.order().reviewBy()).isEqualTo(hours(48 + 72));
        }

        @Test
        void approvePaysTheCreatorTheirShareAndThePlatformBothFees() {
            Run r = run(accept, deliver, step(EventType.APPROVE, BRAND, 50));
            assertThat(r.order().status()).isEqualTo(Status.COMPLETED);
            assertThat(balance(r.ledger(), Account.ESCROW)).isZero();
            assertThat(balance(r.ledger(), Account.CREATOR_BALANCE)).isEqualTo(822_000);
            assertThat(balance(r.ledger(), Account.PLATFORM_REVENUE)).isEqualTo(250_000);
            assertThat(balance(r.ledger(), Account.GST_PAYABLE)).isEqualTo(45_000);
            assertThat(balance(r.ledger(), Account.TAX_WITHHELD)).isEqualTo(1_000);
            assertThat(LedgerLines.balance(r.ledger())).isZero();
        }

        @Test
        void autoApprovesOnlyAfter72HoursWithoutBrandAction() {
            OrderState o = run(accept, deliver).order();
            expectError(() -> OrderStateMachine.transition(o, Event.of(EventType.AUTO_APPROVE), SYSTEM, hours(48 + 71)), 409, "NOT_YET_DUE");
            Result r = OrderStateMachine.transition(o, Event.of(EventType.AUTO_APPROVE), SYSTEM, hours(48 + 72));
            assertThat(r.order().status()).isEqualTo(Status.COMPLETED);
            assertThat(balance(r.lines(), Account.CREATOR_BALANCE)).isEqualTo(822_000);
            assertThat(r.memo()).isEqualTo("Auto-approved after 72 h");
        }

        @ParameterizedTest
        @EnumSource(value = EventType.class, names = {"APPROVE", "DISPUTE", "REQUEST_REVISION"})
        void theBrandCannotActAfterTheReviewWindow(EventType type) {
            OrderState o = run(accept, deliver).order();
            expectError(() -> OrderStateMachine.transition(o, Event.of(type), BRAND, hours(48 + 72)), 409, "REVIEW_WINDOW_PASSED");
        }

        @Test
        void revisionsAreCappedAt2() {
            Run r = run(accept, deliver, step(EventType.REQUEST_REVISION, BRAND, 50), step(EventType.DELIVER, CREATOR, 60),
                    step(EventType.REQUEST_REVISION, BRAND, 61), step(EventType.DELIVER, CREATOR, 70));
            assertThat(r.order().revisionCount()).isEqualTo(2);
            assertThat(r.order().status()).isEqualTo(Status.DELIVERED);
            expectError(() -> OrderStateMachine.transition(r.order(), Event.of(EventType.REQUEST_REVISION), BRAND, hours(71)), 409, "REVISION_LIMIT");
            assertThat(OrderStateMachine.allowedEvents(r.order(), BRAND, hours(71))).containsExactly(EventType.APPROVE, EventType.DISPUTE);
        }

        @Test
        void anExtraRevisionAddOnRaisesTheLimit() {
            OrderState o = OrderStateMachine.create(11L, BRAND, 1_000_000, 5, 3, amounts(1_000_000), T0);
            for (int i = 0; i < 3; i++) {
                o = OrderStateMachine.transition(o, Event.of(i == 0 ? EventType.ACCEPT : EventType.DELIVER), CREATOR, hours(1)).order();
                if (i > 0) o = OrderStateMachine.transition(o, Event.of(EventType.REQUEST_REVISION), BRAND, hours(2)).order();
            }
            o = OrderStateMachine.transition(o, Event.of(EventType.DELIVER), CREATOR, hours(3)).order();
            o = OrderStateMachine.transition(o, Event.of(EventType.REQUEST_REVISION), BRAND, hours(4)).order();
            assertThat(o.revisionCount()).isEqualTo(3);
        }

        @Test
        void aRevisionRequestGivesTheCreatorAtLeast3MoreDays() {
            // Accepted at 1 h with 5-day delivery: due at 121 h, later than 12 h + 72 h.
            OrderState early = run(accept, step(EventType.DELIVER, CREATOR, 10), step(EventType.REQUEST_REVISION, BRAND, 12)).order();
            assertThat(early.dueAt()).isEqualTo(hours(1 + 5 * 24));
            OrderState late = run(accept, step(EventType.DELIVER, CREATOR, 118), step(EventType.REQUEST_REVISION, BRAND, 120)).order();
            assertThat(late.dueAt()).isEqualTo(hours(120 + 72));
            assertThat(late.reviewBy()).isNull();
        }

        @Test
        void disputeKeepsTheMoneyInEscrow() {
            Run r = run(accept, deliver, new Step(Event.withNote(EventType.DISPUTE, "Wrong product shown"), BRAND, 50));
            assertThat(r.order().status()).isEqualTo(Status.DISPUTED);
            assertThat(balance(r.ledger(), Account.ESCROW)).isEqualTo(1_118_000);
        }
    }

    @Nested
    class Disputed {
        final Step[] disputed = {step(EventType.ACCEPT, CREATOR, 1), step(EventType.DELIVER, CREATOR, 48), step(EventType.DISPUTE, BRAND, 50)};

        Run then(Step last) {
            Step[] all = java.util.Arrays.copyOf(disputed, disputed.length + 1);
            all[disputed.length] = last;
            return run(all);
        }

        @Test
        void adminReleasePaysTheCreator() {
            Run r = then(step(EventType.ADMIN_RELEASE, ADMIN, 60));
            assertThat(r.order().status()).isEqualTo(Status.COMPLETED);
            assertThat(balance(r.ledger(), Account.CREATOR_BALANCE)).isEqualTo(822_000);
        }

        @Test
        void fullRefundReturnsEverythingToTheBrand() {
            Run r = then(new Step(Event.refund(1_118_000, null), ADMIN, 60));
            assertThat(r.order().status()).isEqualTo(Status.REFUNDED);
            assertThat(r.order().paymentStatus()).isEqualTo(PaymentStatus.REFUNDED);
            assertThat(r.order().refundedCents()).isEqualTo(1_118_000);
            for (Account a : new Account[] {Account.ESCROW, Account.BRAND_CHARGE, Account.CREATOR_BALANCE, Account.PLATFORM_REVENUE}) {
                assertThat(balance(r.ledger(), a)).as(a.name()).isZero();
            }
        }

        @Test
        void partialRefundComesOutOfTheCreatorShareAndTheRestIsReleased() {
            Run r = then(new Step(Event.refund(350_000, null), ADMIN, 60));
            assertThat(r.order().status()).isEqualTo(Status.REFUNDED);
            assertThat(balance(r.ledger(), Account.ESCROW)).isZero();
            assertThat(balance(r.ledger(), Account.BRAND_CHARGE)).isEqualTo(-768_000);
            assertThat(balance(r.ledger(), Account.CREATOR_BALANCE)).isEqualTo(472_000);
            assertThat(balance(r.ledger(), Account.PLATFORM_REVENUE)).isEqualTo(250_000);
            assertThat(LedgerLines.balance(r.ledger())).isZero();
        }

        @ParameterizedTest
        @ValueSource(longs = {0, -1, 822_001, 1_117_999, 1_118_001})
        void rejectsRefundAmountsOutsideTheAllowedRange(long refund) {
            OrderState o = run(disputed).order();
            expectError(() -> OrderStateMachine.transition(o, Event.refund(refund, null), ADMIN, hours(60)), 422, "INVALID_REFUND_AMOUNT");
        }

        @Test
        void onlyAdminsResolveDisputes() {
            OrderState o = run(disputed).order();
            expectError(() -> OrderStateMachine.transition(o, Event.of(EventType.ADMIN_RELEASE), BRAND, hours(60)), 403, "ROLE_NOT_ALLOWED");
        }

        @Test
        void adminCancelOfAnAcceptedOrderRefundsInFull() {
            Run r = run(step(EventType.ACCEPT, CREATOR, 1), step(EventType.ADMIN_CANCEL, ADMIN, 2));
            assertThat(r.order().status()).isEqualTo(Status.REFUNDED);
            assertThat(r.order().refundedCents()).isEqualTo(1_118_000);
            assertThat(balance(r.ledger(), Account.ESCROW)).isZero();
            assertThat(balance(r.ledger(), Account.BRAND_CHARGE)).isZero();
        }
    }

    @Nested
    class InvalidTransitions {
        final Map<Status, Step[]> states = Map.of(
                Status.IN_PROGRESS, new Step[] {step(EventType.ACCEPT, CREATOR, 1)},
                Status.DELIVERED, new Step[] {step(EventType.ACCEPT, CREATOR, 1), step(EventType.DELIVER, CREATOR, 2)},
                Status.COMPLETED, new Step[] {step(EventType.ACCEPT, CREATOR, 1), step(EventType.DELIVER, CREATOR, 2), step(EventType.APPROVE, BRAND, 3)},
                Status.DISPUTED, new Step[] {step(EventType.ACCEPT, CREATOR, 1), step(EventType.DELIVER, CREATOR, 2), step(EventType.DISPUTE, BRAND, 3)},
                Status.REFUNDED, new Step[] {step(EventType.ACCEPT, CREATOR, 1), step(EventType.DELIVER, CREATOR, 2), step(EventType.DISPUTE, BRAND, 3),
                        new Step(Event.refund(1_118_000, null), ADMIN, 4)},
                Status.CLOSED, new Step[] {step(EventType.DECLINE, CREATOR, 1)});

        @ParameterizedTest
        @EnumSource(value = Status.class, names = "PENDING_ACCEPTANCE", mode = EnumSource.Mode.EXCLUDE)
        void eachStateRejectsActionsFromOtherStatesWith409(Status s) {
            OrderState o = run(states.get(s)).order();
            assertThat(o.status()).isEqualTo(s);
            List<EventType> allowed = new ArrayList<>(OrderStateMachine.allowedEvents(o, CREATOR, hours(5)));
            allowed.addAll(OrderStateMachine.allowedEvents(o, BRAND, hours(5)));
            allowed.addAll(OrderStateMachine.allowedEvents(o, ADMIN, hours(5)));
            Map<EventType, Actor> wrong = Map.of(EventType.ACCEPT, CREATOR, EventType.DECLINE, CREATOR, EventType.CANCEL, BRAND, EventType.DELIVER, CREATOR,
                    EventType.APPROVE, BRAND, EventType.ADMIN_RELEASE, ADMIN);
            wrong.forEach((type, actor) -> {
                if (!allowed.contains(type)) expectError(() -> OrderStateMachine.transition(o, Event.of(type), actor, hours(5)), 409, "INVALID_TRANSITION");
            });
        }

        @Test
        void terminalStatesAllowNothing() {
            for (Status s : List.of(Status.COMPLETED, Status.REFUNDED, Status.CLOSED)) {
                OrderState o = run(states.get(s)).order();
                for (Actor a : List.of(BRAND, CREATOR, ADMIN, SYSTEM)) assertThat(OrderStateMachine.allowedEvents(o, a, hours(500))).as(s + " " + a).isEmpty();
            }
        }

        @Test
        void theErrorMessageNamesTheActionAndTheState() {
            OrderState o = run(states.get(Status.COMPLETED)).order();
            assertThatThrownBy(() -> OrderStateMachine.transition(o, Event.of(EventType.APPROVE), BRAND, hours(5)))
                    .hasMessage("Cannot approve an order that is completed.");
        }
    }

    @Nested
    class AllowedEventsAndJobs {
        @Test
        void listsWhatEachSideMayDoOnANewOrder() {
            OrderState o = newOrder();
            assertThat(OrderStateMachine.allowedEvents(o, CREATOR, T0)).containsExactly(EventType.ACCEPT, EventType.DECLINE, EventType.CANCEL);
            assertThat(OrderStateMachine.allowedEvents(o, BRAND, T0)).containsExactly(EventType.CANCEL);
            assertThat(OrderStateMachine.allowedEvents(o, OTHER_BRAND, T0)).isEmpty();
            assertThat(OrderStateMachine.allowedEvents(o, SYSTEM, T0)).isEmpty();
            assertThat(OrderStateMachine.allowedEvents(o, SYSTEM, hours(72))).containsExactly(EventType.EXPIRE);
        }

        @Test
        void reportsDueScheduledJobs() {
            assertThat(OrderStateMachine.dueSystemEvent(newOrder(), hours(10))).isNull();
            assertThat(OrderStateMachine.dueSystemEvent(newOrder(), hours(72))).isEqualTo(EventType.EXPIRE);
            OrderState o = run(step(EventType.ACCEPT, CREATOR, 1), step(EventType.DELIVER, CREATOR, 2)).order();
            assertThat(OrderStateMachine.dueSystemEvent(o, hours(73))).isNull();
            assertThat(OrderStateMachine.dueSystemEvent(o, hours(74))).isEqualTo(EventType.AUTO_APPROVE);
        }

        @Test
        void doesNotChangeTheInputOrder() {
            OrderState o = newOrder();
            OrderState copy = new OrderState(o.brandUserId(), o.creatorUserId(), o.status(), o.closeReason(), o.amounts(), o.deliveryDays(), o.acceptBy(), o.dueAt(),
                    o.reviewBy(), o.revisionCount(), o.maxRevisions(), o.paymentStatus(), o.paymentAmountCents(), o.refundedCents(), o.version());
            OrderStateMachine.transition(o, Event.of(EventType.ACCEPT), CREATOR, T0);
            assertThat(o).isEqualTo(copy);
        }
    }
}
