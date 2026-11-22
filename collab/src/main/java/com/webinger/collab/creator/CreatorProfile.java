package com.webinger.collab.creator;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** creator_profiles (FR-10, FR-16). More fields arrive with the creators module (Weeks 9–11). */
@Entity
@Table(name = "creator_profiles")
@Getter
@Setter
public class CreatorProfile {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private Long userId;

    private String username;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(name = "photo_url")
    private String photoUrl;

    /** DRAFT → PENDING_REVIEW → APPROVED / REJECTED (FR-16). */
    @Column(name = "vetting_status", nullable = false)
    private String vettingStatus = "DRAFT";

    @Column(name = "rejection_reason")
    private String rejectionReason;

    @Column(name = "payout_status", nullable = false)
    private String payoutStatus = "NOT_STARTED";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
