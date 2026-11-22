package com.webinger.collab.payment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * payment_sessions (v2.0): one Razorpay order per checkout, for an exact amount. Checkout's payment id and
 * signature are verified against it before an order exists; `usedByRef` makes each session single-use.
 */
@Entity
@Table(name = "payment_sessions")
@Getter
@Setter
public class PaymentSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    /** ORDER or SUBSCRIPTION. */
    @Column(nullable = false, updatable = false)
    private String purpose;

    @Column(name = "amount_cents", nullable = false, updatable = false)
    private long amountCents;

    @Column(name = "razorpay_order_id", nullable = false, updatable = false)
    private String razorpayOrderId;

    /** Set once the brand has paid in Checkout. */
    @Column(name = "razorpay_payment_id")
    private String razorpayPaymentId;

    @Column(name = "payment_method")
    private String paymentMethod;

    @Column(name = "payment_label")
    private String paymentLabel;

    /** The order (or subscription) this payment paid for. */
    @Column(name = "used_by_ref")
    private String usedByRef;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;
}
