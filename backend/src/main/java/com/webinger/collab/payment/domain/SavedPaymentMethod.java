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

/** saved_payment_methods: a Razorpay card token (network and last four only) or a UPI ID. */
@Entity
@Table(name = "saved_payment_methods")
@Getter
@Setter
public class SavedPaymentMethod {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    /** CARD or UPI. */
    @Column(nullable = false, updatable = false)
    private String type;

    private String network;
    private String last4;
    private String expiry;
    private String vpa;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
