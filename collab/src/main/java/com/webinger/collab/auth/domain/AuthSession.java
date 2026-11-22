package com.webinger.collab.auth.domain;

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
 * One sign-in: a family of rotating refresh tokens. Access tokens carry its public id (`sid`), so
 * revoking the session ends its access tokens at once (sign out, password reset, suspension).
 */
@Entity
@Table(name = "auth_sessions")
@Getter
@Setter
public class AuthSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    /** Read-only admin impersonation (FR-82): the admin's user id. No refresh token. */
    @Column(name = "impersonator_id")
    private Long impersonatorId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    public boolean isRevoked() {
        return revokedAt != null;
    }
}
