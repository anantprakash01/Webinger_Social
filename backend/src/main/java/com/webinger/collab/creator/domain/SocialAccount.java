package com.webinger.collab.creator.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** social_accounts (FR-11): one per platform per creator; verified by our team (manual in the MVP). */
@Entity
@Table(name = "social_accounts")
@Getter
@Setter
public class SocialAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    @Column(name = "creator_id", nullable = false, updatable = false)
    private Long creatorId;

    @Column(nullable = false)
    private String platform;

    @Column(nullable = false)
    private String handle;

    private String url;

    @Column(nullable = false)
    private long followers;

    @Column(name = "engagement_rate_bps")
    private Integer engagementRateBps;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
