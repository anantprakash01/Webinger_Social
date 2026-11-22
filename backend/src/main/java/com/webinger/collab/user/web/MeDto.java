package com.webinger.collab.user.web;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/**
 * Contract Me. `creator` and `brand` are left out for other roles (like the mock); every other
 * optional field is sent as null.
 */
public record MeDto(
        String id,
        String email,
        String name,
        String role,
        String status,
        boolean emailVerified,
        Instant createdAt,
        String impersonatedBy,
        String avatarUrl,
        Instant deletionScheduledFor,
        @JsonInclude(JsonInclude.Include.NON_NULL) CreatorSummary creator,
        @JsonInclude(JsonInclude.Include.NON_NULL) BrandSummary brand) {

    public record CreatorSummary(String username, String vettingStatus, String rejectionReason) {}

    public record BrandSummary(String companyName) {}
}
