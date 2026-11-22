package com.webinger.collab.order.service;

import com.webinger.collab.ledger.service.LedgerService;
import com.webinger.collab.order.domain.Order;
import com.webinger.collab.order.domain.OrderEvent;
import com.webinger.collab.order.domain.Review;
import com.webinger.collab.order.repository.OrderEventRepository;
import com.webinger.collab.order.repository.OrderRepository;
import com.webinger.collab.order.repository.ReviewRepository;
import com.webinger.collab.order.service.OrderStateMachine.Status;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What orders say about a creator, for the creator module's cards, profile and dashboard: ratings and reviews
 * (FR-38), completed orders and typical acceptance time (v1.1), earnings and order counts (FR-70).
 * Reads order data only, so the creator module can use it without a dependency cycle.
 */
@Service
public class CreatorTrackRecord {
    public static final List<String> STATUSES = List.of("PENDING_ACCEPTANCE", "IN_PROGRESS", "DELIVERED", "COMPLETED", "DISPUTED", "REFUNDED", "CLOSED");

    private final OrderRepository orders;
    private final OrderEventRepository events;
    private final ReviewRepository reviews;
    private final LedgerService ledger;

    public CreatorTrackRecord(OrderRepository orders, OrderEventRepository events, ReviewRepository reviews, LedgerService ledger) {
        this.orders = orders;
        this.events = events;
        this.reviews = reviews;
        this.ledger = ledger;
    }

    /** Average rating to one decimal (null without reviews) and the count. */
    public record Rating(Double avg, int count) {
        public static final Rating NONE = new Rating(null, 0);
    }

    public record Track(int completedOrders, Integer typicalAcceptHours) {
        public static final Track NONE = new Track(0, null);
    }

    public record ReviewView(String id, int rating, String comment, String brandName, Instant createdAt, String creatorReply, Instant repliedAt) {}

    public record Earnings(long availableCents, long inEscrowCents, long lifetimeEarnedCents, Map<String, Integer> ordersByStatus) {}

    @Transactional(readOnly = true)
    public boolean packageHasOrders(Long packageId) {
        return orders.existsByPackageId(packageId);
    }

    @Transactional(readOnly = true)
    public Map<Long, Rating> ratings(Collection<Long> creatorUserIds) {
        if (creatorUserIds.isEmpty()) return Map.of();
        Map<Long, List<Review>> by = reviews.findByCreatorUserIdIn(creatorUserIds).stream().collect(Collectors.groupingBy(Review::getCreatorUserId));
        Map<Long, Rating> out = new HashMap<>();
        by.forEach((id, list) -> {
            double avg = list.stream().mapToInt(Review::getRating).average().orElse(0);
            out.put(id, new Rating(Math.round(avg * 10) / 10.0, list.size()));
        });
        return out;
    }

    /**
     * Completed orders, and the median hours from order to acceptance over the last 20 accepted orders,
     * rounded up and at least 1; null with fewer than 3 (v1.1).
     */
    @Transactional(readOnly = true)
    public Map<Long, Track> tracks(Collection<Long> creatorUserIds) {
        if (creatorUserIds.isEmpty()) return Map.of();
        List<Order> mine = orders.findByCreatorUserIdIn(creatorUserIds);
        if (mine.isEmpty()) return Map.of();
        Map<Long, Order> byId = mine.stream().collect(Collectors.toMap(Order::getId, o -> o));
        Map<Long, Instant> accepted = new HashMap<>();
        for (OrderEvent e : events.findByOrderIdInAndTypeIn(byId.keySet(), Set.of("ACCEPT"))) accepted.put(e.getOrderId(), e.getCreatedAt());
        Map<Long, Track> out = new HashMap<>();
        mine.stream().collect(Collectors.groupingBy(Order::getCreatorUserId)).forEach((creator, list) -> {
            int completed = (int) list.stream().filter(o -> o.getStatus() == Status.COMPLETED).count();
            List<Instant[]> waits = new ArrayList<>();
            for (Order o : list) if (accepted.containsKey(o.getId())) waits.add(new Instant[] {o.getCreatedAt(), accepted.get(o.getId())});
            List<Double> hours = waits.stream().sorted(Comparator.comparing((Instant[] w) -> w[1]).reversed()).limit(20)
                    .map(w -> Duration.between(w[0], w[1]).toMillis() / 3_600_000.0).sorted().toList();
            Integer typical = hours.size() < 3 ? null : (int) Math.max(1, Math.ceil(hours.get((hours.size() - 1) / 2)));
            out.put(creator, new Track(completed, typical));
        });
        return out;
    }

    /** Latest reviews first (the profile shows 20). */
    @Transactional(readOnly = true)
    public List<ReviewView> latestReviews(Long creatorUserId, int limit) {
        return reviews.findByCreatorUserIdOrderByCreatedAtDesc(creatorUserId).stream().limit(limit)
                .map(r -> new ReviewView(r.getPublicId(), r.getRating(), r.getComment(), r.getBrandName(), r.getCreatedAt(), r.getCreatorReply(), r.getRepliedAt()))
                .toList();
    }

    /** FR-70 dashboard: balance from the ledger, escrow and order counts from the orders. */
    @Transactional(readOnly = true)
    public Earnings earnings(Long creatorUserId) {
        List<Order> mine = orders.findByCreatorUserId(creatorUserId);
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        STATUSES.forEach(s -> byStatus.put(s, 0));
        long escrow = 0;
        for (Order o : mine) {
            byStatus.merge(o.getStatus().name(), 1, Integer::sum);
            if (o.getStatus() == Status.IN_PROGRESS || o.getStatus() == Status.DELIVERED || o.getStatus() == Status.DISPUTED) escrow += o.amounts().creatorPayoutCents();
        }
        return new Earnings(ledger.creatorBalance(creatorUserId), escrow, ledger.creatorLifetimeEarned(creatorUserId), byStatus);
    }
}
