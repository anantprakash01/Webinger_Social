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

/** idempotency_keys: the first result of a money-moving request, so a retry with the same key gets it again. */
@Entity
@Table(name = "idempotency_keys")
@Getter
@NoArgsConstructor
public class IdempotencyRecord {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    @Column(name = "idem_key", nullable = false, updatable = false)
    private String key;

    @Column(nullable = false, updatable = false)
    private String method;

    @Column(nullable = false, updatable = false)
    private String path;

    @Column(nullable = false, updatable = false)
    private int status;

    /** What the response is rebuilt from: the order's public id. */
    @Column(name = "result_ref", nullable = false, updatable = false)
    private String resultRef;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public IdempotencyRecord(Long userId, String key, String method, String path, int status, String resultRef, Instant createdAt) {
        this.userId = userId;
        this.key = key;
        this.method = method;
        this.path = path;
        this.status = status;
        this.resultRef = resultRef;
        this.createdAt = createdAt;
    }
}
