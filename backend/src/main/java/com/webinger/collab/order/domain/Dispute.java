package com.webinger.collab.order.domain;

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
 * disputes (FR-37): opened when the brand disputes a delivery. The creator's response, evidence and the
 * admin's resolution arrive with the disputes module (Weeks 16–18).
 */
@Entity
@Table(name = "disputes")
@Getter
@Setter
public class Dispute {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false, updatable = false)
    private Long orderId;

    @Column(name = "opened_by", nullable = false, updatable = false)
    private Long openedBy;

    @Column(nullable = false)
    private String reason;

    @Column(name = "reason_code", nullable = false)
    private String reasonCode;

    /** OPEN or RESOLVED. */
    @Column(nullable = false)
    private String status;

    /** The creator's 48-hour window to respond (v3.1). */
    @Column(name = "respond_by", nullable = false)
    private Instant respondBy;

    private String resolution;

    @Column(name = "refund_cents")
    private Long refundCents;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;
}
