package com.webinger.collab.dev;

import com.webinger.collab.creator.domain.CreatorPackage;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.order.domain.Order;
import com.webinger.collab.order.service.OrderInputs.ReviewRequest;
import com.webinger.collab.order.service.OrderService;
import com.webinger.collab.order.service.OrderService.SeedStep;
import com.webinger.collab.order.service.OrderStateMachine.Actor;
import com.webinger.collab.order.service.OrderStateMachine.Event;
import com.webinger.collab.order.service.OrderStateMachine.EventType;
import com.webinger.collab.payment.service.PaymentService;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.domain.Role;
import com.webinger.collab.user.domain.User;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Demo orders between Saltbay (brand@demo.test) and Leo (creator@demo.test), one or more in every state, made by
 * running the real state machine with back-dated times like the mock's seed/orders.ts. Two are close to a
 * deadline, so "Simulate time" shows an expiry and an auto-approval straight away.
 */
class OrderDemoData {
    private final OrderService orders;
    private final PaymentService payments;

    OrderDemoData(OrderService orders, PaymentService payments) {
        this.orders = orders;
        this.payments = payments;
    }

    private static Instant ago(Instant now, double hours) {
        return now.minus(Duration.ofMinutes((long) (hours * 60)));
    }

    void seed(User brand, User leo, User admin, CreatorProfile leoProfile, List<CreatorPackage> leoPackages, Instant now) {
        payments.seedSavedMethods(brand.getId(), now);
        AuthUser maya = new AuthUser(brand.getId(), brand.getPublicId(), Role.BRAND, null, null);
        Actor b = new Actor(brand.getId(), Role.BRAND, true);
        Actor c = new Actor(leo.getId(), Role.CREATOR, true);
        Actor a = new Actor(admin.getId(), Role.ADMIN, true);
        List<CreatorPackage> pk = new ArrayList<>(leoPackages);
        pk.sort(Comparator.comparingLong(CreatorPackage::getPriceCents));
        CreatorPackage stories = pk.get(0), reel = pk.get(1), tiktok = pk.get(2), youtube = pk.get(3);
        String brief = "Show the Saltbay tote in your morning routine, natural light, and mention the recycled cotton.";
        double d = 24;

        // Waiting for Leo: a fresh one, and one that expires in 2 hours.
        orders.seedOrder(maya, leoProfile, reel, brief, ago(now, 10), List.of());
        orders.seedOrder(maya, leoProfile, stories, brief, ago(now, 70), List.of());
        // In progress: on time, and late.
        orders.seedOrder(maya, leoProfile, tiktok, brief, ago(now, 5 * d), List.of(step(EventType.ACCEPT, c, ago(now, 4 * d))));
        orders.seedOrder(maya, leoProfile, reel, brief, ago(now, 12 * d), List.of(step(EventType.ACCEPT, c, ago(now, 11 * d))));
        // Delivered: the brand has 2 days left, and one auto-approves in 2 hours.
        orders.seedOrder(maya, leoProfile, stories, brief, ago(now, 6 * d),
                List.of(step(EventType.ACCEPT, c, ago(now, 5 * d)), step(EventType.DELIVER, c, ago(now, 1 * d))));
        orders.seedOrder(maya, leoProfile, tiktok, brief, ago(now, 7 * d),
                List.of(step(EventType.ACCEPT, c, ago(now, 6 * d)), step(EventType.DELIVER, c, ago(now, 70))));
        // Completed and reviewed.
        Order done = orders.seedOrder(maya, leoProfile, youtube, brief, ago(now, 30 * d), List.of(step(EventType.ACCEPT, c, ago(now, 29 * d)),
                step(EventType.DELIVER, c, ago(now, 25 * d)), step(EventType.APPROVE, b, ago(now, 24 * d))));
        orders.review(maya, done.getPublicId(), new ReviewRequest(5, "Clear script, on time, and the video kept selling for weeks."));
        orders.seedOrder(maya, leoProfile, reel, brief, ago(now, 45 * d), List.of(step(EventType.ACCEPT, c, ago(now, 44 * d)),
                step(EventType.DELIVER, c, ago(now, 40 * d)), step(EventType.REQUEST_REVISION, b, ago(now, 39 * d), "Please show the logo in the first 3 seconds."),
                step(EventType.DELIVER, c, ago(now, 37 * d)), step(EventType.APPROVE, b, ago(now, 36 * d))));
        // Disputed, waiting for an admin.
        orders.seedOrder(maya, leoProfile, reel, brief, ago(now, 20 * d), List.of(step(EventType.ACCEPT, c, ago(now, 19 * d)),
                step(EventType.DELIVER, c, ago(now, 15 * d)), step(EventType.DISPUTE, b, ago(now, 14 * d), "The tote is not shown at all in the final cut.")));
        // Refunded after a dispute.
        orders.seedOrder(maya, leoProfile, stories, brief, ago(now, 60 * d), List.of(step(EventType.ACCEPT, c, ago(now, 59 * d)),
                step(EventType.DELIVER, c, ago(now, 55 * d)), step(EventType.DISPUTE, b, ago(now, 54 * d), "The Stories went up for an hour and were deleted."),
                new SeedStep(Event.refund(refundAll(stories), "Creator removed the Stories; full refund."), a, ago(now, 50 * d))));
        // Closed: declined by Leo, and cancelled by the brand.
        orders.seedOrder(maya, leoProfile, youtube, brief, ago(now, 15 * d), List.of(step(EventType.DECLINE, c, ago(now, 14 * d), "Fully booked this month.")));
        orders.seedOrder(maya, leoProfile, tiktok, brief, ago(now, 9 * d), List.of(step(EventType.CANCEL, b, ago(now, 9 * d - 2))));
    }

    /** A full refund is what the brand paid: price + fee + GST on the fee (Leo is not GST-registered; Saltbay is in Karnataka). */
    private static long refundAll(CreatorPackage k) {
        long fee = com.webinger.collab.order.service.Money.applyBps(k.getPriceCents(), 1000);
        return k.getPriceCents() + fee + com.webinger.collab.order.service.Money.applyBps(fee, 1800);
    }

    private static SeedStep step(EventType type, Actor actor, Instant at) {
        return new SeedStep(Event.of(type), actor, at);
    }

    private static SeedStep step(EventType type, Actor actor, Instant at, String note) {
        return new SeedStep(Event.withNote(type, note), actor, at);
    }
}
