package com.webinger.collab.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** order_events: the append-only timeline (FR-52). `actorId` is null for the scheduled jobs. */
@Entity
@Table(name = "order_events")
@Getter
@NoArgsConstructor
public class OrderEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false, updatable = false)
    private Long orderId;

    /** CREATE or a state-machine event (later also the collaboration events). */
    @Column(nullable = false, updatable = false)
    private String type;

    @Column(name = "from_status", updatable = false)
    private String fromStatus;

    @Column(name = "to_status", nullable = false, updatable = false)
    private String toStatus;

    @Column(name = "actor_id", updatable = false)
    private Long actorId;

    @Column(updatable = false)
    private String note;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public OrderEvent(Long orderId, String type, String fromStatus, String toStatus, Long actorId, String note, Instant createdAt) {
        this.orderId = orderId;
        this.type = type;
        this.fromStatus = fromStatus;
        this.toStatus = toStatus;
        this.actorId = actorId;
        this.note = note;
        this.createdAt = createdAt;
    }
}
