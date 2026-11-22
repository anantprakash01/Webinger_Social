package com.webinger.collab.creator.domain;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

/**
 * creator_profiles (FR-10, FR-16, FR-70). One per creator account, created empty (DRAFT) at sign-up.
 * Lists are loaded in batches so search does not query once per creator.
 */
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

    /** Lower case; null until chosen in onboarding; locked after first approval. */
    private String username;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    private String bio;
    private String city;
    private String country;

    /** Search filter only, never shown on the profile. */
    private String gender;

    @Column(name = "birth_year")
    private Integer birthYear;

    @Column(name = "photo_url")
    private String photoUrl;

    @ElementCollection
    @CollectionTable(name = "creator_niches", joinColumns = @JoinColumn(name = "creator_id"))
    @OrderColumn(name = "idx")
    @Column(name = "niche")
    @BatchSize(size = 100)
    private List<String> niches = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "creator_languages", joinColumns = @JoinColumn(name = "creator_id"))
    @OrderColumn(name = "idx")
    @Column(name = "language")
    @BatchSize(size = 100)
    private List<String> languages = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "creator_cover_urls", joinColumns = @JoinColumn(name = "creator_id"))
    @OrderColumn(name = "idx")
    @Column(name = "url")
    @BatchSize(size = 100)
    private List<String> coverUrls = new ArrayList<>();

    /** DRAFT → PENDING_REVIEW → APPROVED / REJECTED (FR-16). */
    @Column(name = "vetting_status", nullable = false)
    private String vettingStatus = "DRAFT";

    @Column(name = "rejection_reason")
    private String rejectionReason;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "approved_at")
    private Instant approvedAt;

    /** NOT_STARTED → PENDING (account being verified, or verification failed) → ENABLED. */
    @Column(name = "payout_status", nullable = false)
    private String payoutStatus = "NOT_STARTED";

    @Column(name = "profile_views", nullable = false)
    private long profileViews;

    @Column(nullable = false)
    private boolean away;

    @Column(name = "away_until")
    private LocalDate awayUntil;

    @Column(name = "away_message")
    private String awayMessage;

    @Version
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** Away now: switched on and `awayUntil` (inclusive) not yet passed. */
    public boolean isAwayOn(LocalDate today) {
        return away && (awayUntil == null || !awayUntil.isBefore(today));
    }

    public boolean isApproved() {
        return "APPROVED".equals(vettingStatus);
    }
}
