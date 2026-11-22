package com.webinger.collab.payout.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** payouts (FR-63): money sent from a creator's balance to their payout account (a RazorpayX payout). */
@Entity
@Table(name = "payouts")
@Getter
@Setter
public class Payout {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "creator_user_id", nullable = false, updatable = false)
    private Long creatorUserId;

    /** Taken from the balance; the creator receives amount − fee. */
    @Column(name = "amount_cents", nullable = false, updatable = false)
    private long amountCents;

    @Column(name = "fee_cents", nullable = false, updatable = false)
    private long feeCents;

    /** SCHEDULED (weekly), STANDARD or INSTANT. */
    @Column(nullable = false, updatable = false)
    private String speed;

    @Column(name = "destination_label", nullable = false, updatable = false)
    private String destinationLabel;

    /** IN_TRANSIT, PAID or FAILED. */
    @Column(nullable = false)
    private String status;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "razorpay_payout_id")
    private String razorpayPayoutId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "arrival_date", nullable = false)
    private Instant arrivalDate;
}
