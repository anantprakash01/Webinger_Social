package com.webinger.collab.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** audit_logs (FR-84): append-only. */
@Entity
@Table(name = "audit_logs")
@Getter
@Setter
public class AuditLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "actor_id", updatable = false)
    private Long actorId;

    @Column(name = "actor_name", nullable = false, updatable = false)
    private String actorName;

    @Column(nullable = false, updatable = false)
    private String action;

    @Column(name = "entity_type", nullable = false, updatable = false)
    private String entityType;

    @Column(name = "entity_id", nullable = false, updatable = false)
    private String entityId;

    @Column(nullable = false, updatable = false)
    private String summary;

    @Column(name = "before_json", updatable = false)
    private String beforeJson;

    @Column(name = "after_json", updatable = false)
    private String afterJson;

    @Column(updatable = false)
    private String ip;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
