package com.webinger.collab.creator.web;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** Response shapes of the creator module, field for field as in docs/api/openapi.yaml. */
public final class CreatorDtos {
    private CreatorDtos() {}

    public record SocialAccountDto(String id, String platform, String handle, String url, long followers, Integer engagementRateBps, boolean verified) {}

    public record AddonDto(String id, String kind, String title, long priceCents, Integer usageDays, Integer rushDays) {}

    /** Contract Package (public profile: active packages only). */
    public record PackageDto(String id, String platform, String title, String description, List<String> deliverables, long priceCents, String currency,
            int deliveryDays, List<AddonDto> addons) {}

    /** Contract OwnPackage (the creator's own, active or not). */
    public record OwnPackageDto(String id, String platform, String title, String description, List<String> deliverables, long priceCents, String currency,
            int deliveryDays, boolean active, List<AddonDto> addons) {}

    public record PortfolioItemDto(String id, String type, String url, String caption) {}

    public record ChecklistDto(boolean profile, boolean photo, boolean socials, boolean packages, boolean portfolio, boolean payouts) {}

    public record AvailabilityDto(boolean away, LocalDate until, String message) {
        public static final AvailabilityDto AVAILABLE = new AvailabilityDto(false, null, null);
    }

    public record CreatorMeDto(
            AvailabilityDto availability,
            String username,
            String displayName,
            String bio,
            String city,
            String country,
            String gender,
            Integer birthYear,
            List<String> languages,
            List<String> niches,
            String photoUrl,
            List<String> coverUrls,
            String vettingStatus,
            String rejectionReason,
            Instant submittedAt,
            List<SocialAccountDto> socials,
            List<OwnPackageDto> packages,
            List<PortfolioItemDto> portfolio,
            String payoutStatus,
            ChecklistDto checklist,
            boolean usernameLocked) {}

    public record ReachDto(String platform, String handle, long followers) {}

    /** Contract CreatorCard (FR-24). */
    public record CreatorCardDto(
            String username,
            String displayName,
            String photoUrl,
            String city,
            String country,
            List<String> niches,
            ReachDto reach,
            Long startingPriceCents,
            String currency,
            Double ratingAvg,
            int ratingCount,
            boolean verified,
            boolean away) {}

    public record CreatorSearchPageDto(List<CreatorCardDto> content, int page, int size, long totalElements, int totalPages) {}

    public record ReviewDto(String id, int rating, String comment, String brandName, Instant createdAt, String creatorReply, Instant repliedAt) {}

    /** Contract CreatorProfile: the card fields plus the public profile (FR-15). */
    public record CreatorProfileDto(
            String username,
            String displayName,
            String photoUrl,
            String city,
            String country,
            List<String> niches,
            ReachDto reach,
            Long startingPriceCents,
            String currency,
            Double ratingAvg,
            int ratingCount,
            boolean verified,
            boolean away,
            int completedOrders,
            Integer typicalAcceptHours,
            AvailabilityDto availability,
            String myInquiryId,
            String bio,
            List<String> languages,
            List<String> coverUrls,
            List<SocialAccountDto> socials,
            List<PackageDto> packages,
            List<PortfolioItemDto> portfolio,
            List<ReviewDto> reviews,
            Instant memberSince,
            String vettingStatus) {}

    public record SuggestionDto(String kind, String label, String value, String detail) {}

    public record SuggestionsDto(List<SuggestionDto> suggestions) {}

    public record CreatorStatsDto(String currency, long availableCents, long inEscrowCents, long lifetimeEarnedCents, Map<String, Integer> ordersByStatus,
            long profileViews, long activePackages) {}

    /** Contract VettingItem (admin queue, FR-80). `creatorId` is the creator's user id. */
    public record VettingItemDto(
            String creatorId,
            String username,
            String displayName,
            String email,
            String photoUrl,
            String bio,
            String city,
            String country,
            List<String> niches,
            List<String> languages,
            List<SocialAccountDto> socials,
            List<OwnPackageDto> packages,
            List<PortfolioItemDto> portfolio,
            String vettingStatus,
            String rejectionReason,
            Instant submittedAt,
            Instant createdAt) {}

    public record VettingQueueDto(List<VettingItemDto> content) {}

    public record PayoutAccountDto(String method, String holderName, String panMasked, String destinationLabel, String status, String failureReason,
            Instant updatedAt, String gstin) {}

    public record SavedListDto(String id, String name, List<String> usernames, Instant createdAt, Instant updatedAt) {}

    public record SavedListDetailDto(String id, String name, List<String> usernames, Instant createdAt, Instant updatedAt, List<CreatorCardDto> creators) {}
}
