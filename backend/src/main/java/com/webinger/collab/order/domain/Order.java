package com.webinger.collab.order.domain;

import com.webinger.collab.order.service.Money;
import com.webinger.collab.order.service.Money.OrderAmounts;
import com.webinger.collab.order.service.OrderStateMachine.CloseReason;
import com.webinger.collab.order.service.OrderStateMachine.OrderState;
import com.webinger.collab.order.service.OrderStateMachine.PaymentStatus;
import com.webinger.collab.order.service.OrderStateMachine.Status;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

/**
 * orders: the core entity (CLAUDE.md §7). Money, fees, taxes and discount are copied on at checkout and never
 * change. Status, deadlines and payment change only through {@link #apply}, with a result of the state machine.
 * `version` is the optimistic lock, so approve and auto-approve cannot both win.
 */
@Entity(name = "CollabOrder")
@Table(name = "orders")
@Getter
@Setter
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "brand_user_id", nullable = false, updatable = false)
    private Long brandUserId;

    @Column(name = "creator_user_id", nullable = false, updatable = false)
    private Long creatorUserId;

    @Column(name = "package_id", updatable = false)
    private Long packageId;

    @Column(name = "campaign_id", updatable = false)
    private Long campaignId;

    /** PACKAGE, CUSTOM_OFFER or CAMPAIGN. */
    @Column(nullable = false, updatable = false)
    private String kind;

    @Column(nullable = false, updatable = false)
    private String title;

    @Column(nullable = false, updatable = false)
    private String platform;

    @Column(name = "usage_rights", updatable = false)
    private String usageRights;

    @ElementCollection
    @CollectionTable(name = "order_deliverables", joinColumns = @JoinColumn(name = "order_id"))
    @OrderColumn(name = "idx")
    @Column(name = "deliverable")
    @BatchSize(size = 50)
    private List<String> deliverables = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "order_addons", joinColumns = @JoinColumn(name = "order_id"))
    @OrderColumn(name = "idx")
    @BatchSize(size = 50)
    private List<Addon> addons = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(name = "close_reason")
    private CloseReason closeReason;

    @Column(nullable = false, updatable = false)
    private String currency;

    @Column(name = "price_cents", nullable = false, updatable = false)
    private long priceCents;

    @Column(name = "brand_fee_cents", nullable = false, updatable = false)
    private long brandFeeCents;

    @Column(name = "creator_fee_cents", nullable = false, updatable = false)
    private long creatorFeeCents;

    @Column(name = "brand_fee_bps", nullable = false, updatable = false)
    private int brandFeeBps;

    @Column(name = "creator_fee_bps", nullable = false, updatable = false)
    private int creatorFeeBps;

    @Column(name = "intra_state", nullable = false, updatable = false)
    private boolean intraState;

    @Column(name = "creator_gst_registered", nullable = false, updatable = false)
    private boolean creatorGstRegistered;

    @Column(name = "creator_gst_cents", nullable = false, updatable = false)
    private long creatorGstCents;

    @Column(name = "brand_fee_gst_cents", nullable = false, updatable = false)
    private long brandFeeGstCents;

    @Column(name = "creator_fee_gst_cents", nullable = false, updatable = false)
    private long creatorFeeGstCents;

    @Column(name = "tds_cents", nullable = false, updatable = false)
    private long tdsCents;

    @Column(name = "tcs_cents", nullable = false, updatable = false)
    private long tcsCents;

    @Column(name = "promo_code", updatable = false)
    private String promoCode;

    @Column(name = "promo_cents", nullable = false, updatable = false)
    private long promoCents;

    @Column(name = "credit_cents", nullable = false, updatable = false)
    private long creditCents;

    @Column(name = "delivery_days", nullable = false, updatable = false)
    private int deliveryDays;

    @Column(name = "accept_by", nullable = false)
    private Instant acceptBy;

    @Column(name = "due_at")
    private Instant dueAt;

    @Column(name = "review_by")
    private Instant reviewBy;

    @Column(name = "revision_count", nullable = false)
    private int revisionCount;

    @Column(name = "max_revisions", nullable = false, updatable = false)
    private int maxRevisions;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false)
    private PaymentStatus paymentStatus;

    @Column(name = "payment_amount_cents", nullable = false, updatable = false)
    private long paymentAmountCents;

    @Column(name = "payment_refunded_cents", nullable = false)
    private long paymentRefundedCents;

    @Column(name = "payment_method", nullable = false, updatable = false)
    private String paymentMethod;

    @Column(name = "payment_method_label", nullable = false, updatable = false)
    private String paymentMethodLabel;

    @Column(name = "razorpay_payment_id", updatable = false)
    private String razorpayPaymentId;

    @Version
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** A package add-on bought with the order (v2.4), copied at checkout. */
    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Addon {
        @Column(name = "addon_id", nullable = false)
        private String addonId;

        @Column(nullable = false)
        private String kind;

        @Column(nullable = false)
        private String title;

        @Column(name = "price_cents", nullable = false)
        private long priceCents;

        @Column(name = "usage_days")
        private Integer usageDays;

        @Column(name = "rush_days")
        private Integer rushDays;
    }

    public Money.Taxes taxes() {
        return new Money.Taxes(intraState, creatorGstRegistered, creatorGstCents, brandFeeGstCents, creatorFeeGstCents, tdsCents, tcsCents);
    }

    public OrderAmounts amounts() {
        return new OrderAmounts(priceCents, brandFeeCents, creatorFeeCents, taxes(), promoCents, creditCents);
    }

    /** The order as the state machine sees it. */
    public OrderState state() {
        return new OrderState(brandUserId, creatorUserId, status, closeReason, amounts(), deliveryDays, acceptBy, dueAt, reviewBy, revisionCount, maxRevisions, paymentStatus,
                paymentAmountCents, paymentRefundedCents, version);
    }

    /** Copies what a transition changed. The version column is advanced by JPA itself. */
    public void apply(OrderState next, Instant now) {
        this.status = next.status();
        this.closeReason = next.closeReason();
        this.dueAt = next.dueAt();
        this.reviewBy = next.reviewBy();
        this.revisionCount = next.revisionCount();
        this.paymentStatus = next.paymentStatus();
        this.paymentRefundedCents = next.refundedCents();
        this.updatedAt = now;
    }

    /** Sets the amounts and the initial state from checkout. */
    public void initialise(OrderState s, Money.FeeRates rates, Instant now) {
        OrderAmounts a = s.amounts();
        Money.Taxes t = a.taxes();
        this.brandUserId = s.brandUserId();
        this.creatorUserId = s.creatorUserId();
        this.status = s.status();
        this.priceCents = a.priceCents();
        this.brandFeeCents = a.brandFeeCents();
        this.creatorFeeCents = a.creatorFeeCents();
        this.brandFeeBps = rates.brandFeeBps();
        this.creatorFeeBps = rates.creatorFeeBps();
        this.intraState = t.intraState();
        this.creatorGstRegistered = t.creatorGstRegistered();
        this.creatorGstCents = t.creatorGstCents();
        this.brandFeeGstCents = t.brandFeeGstCents();
        this.creatorFeeGstCents = t.creatorFeeGstCents();
        this.tdsCents = t.tdsCents();
        this.tcsCents = t.tcsCents();
        this.promoCents = a.promoCents();
        this.creditCents = a.creditCents();
        this.deliveryDays = s.deliveryDays();
        this.acceptBy = s.acceptBy();
        this.maxRevisions = s.maxRevisions();
        this.paymentStatus = s.paymentStatus();
        this.paymentAmountCents = s.paymentAmountCents();
        this.createdAt = now;
        this.updatedAt = now;
    }
}
