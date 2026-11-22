package com.webinger.collab.order.web;

import com.webinger.collab.creator.web.CreatorDtos.AddonDto;
import com.webinger.collab.creator.web.CreatorDtos.PackageDto;
import com.webinger.collab.order.service.OrderInputs.ShippingAddress;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Response shapes of the order module, field for field as in docs/api/openapi.yaml. */
public final class OrderDtos {
    private OrderDtos() {}

    public record Party(String name, String photoUrl, String username) {}

    public record Taxes(boolean intraState, boolean creatorGstRegistered, long creatorGstCents, long brandFeeGstCents, long creatorFeeGstCents, long tdsCents,
            long tcsCents) {}

    public record Discount(String promoCode, long promoCents, long creditCents) {
        public static final Discount NONE = new Discount(null, 0, 0);
    }

    public record MoneyDto(String currency, long priceCents, long brandFeeCents, long totalCents, long creatorFeeCents, long creatorPayoutCents, Taxes taxes,
            Discount discount, long paidCents) {}

    public record Deadline(String kind, Instant at) {}

    public record Summary(String id, String status, String closeReason, String kind, String title, String platform, Party counterparty, Party brand, Party creator,
            MoneyDto money, Deadline nextDeadline, boolean late, boolean needsAction, Instant createdAt, Instant updatedAt) {}

    public record Payment(String status, long amountCents, long refundedCents, String method, String methodLabel) {}

    public record Brief(String requirements, boolean needsShipping, ShippingAddress shippingAddress, List<String> links, List<String> referenceFiles) {}

    public record DeliveryItem(String type, String url, String name, Object metrics) {}

    public record DeliveryDto(String id, int revisionNo, List<DeliveryItem> items, String note, Instant submittedAt) {}

    public record EventView(String type, String fromStatus, String toStatus, String actor, String note, Instant at) {}

    public record DisputeView(String reason, String status, Instant openedAt, String resolution, Long refundCents, String reasonCode, Instant respondBy,
            String creatorResponse, Instant respondedAt, List<Object> evidence, String resolutionReason, String resolutionNote) {}

    public record ReviewDto(String id, int rating, String comment, String brandName, Instant createdAt, String creatorReply, Instant repliedAt) {}

    public record TaxParties(String platformGstin, String platformState, String brandGstin, String brandState, String creatorGstin) {}

    public record BrandRating(Double ratingAvg, int ratingCount) {
        public static final BrandRating NONE = new BrandRating(null, 0);
    }

    /** Contract OrderDetail: the summary fields plus everything on the order page. */
    public record Detail(
            String id, String status, String closeReason, String kind, String title, String platform, Party counterparty, Party brand, Party creator, MoneyDto money,
            Deadline nextDeadline, boolean late, boolean needsAction, Instant createdAt, Instant updatedAt,
            String packageId, String campaignId, String conversationId, List<String> deliverables, int deliveryDays, Payment payment, Instant acceptBy, Instant dueAt,
            Instant reviewBy, int revisionCount, int maxRevisions, Brief brief, List<DeliveryDto> deliveries, List<EventView> events, DisputeView dispute, ReviewDto review,
            List<String> allowedActions, Instant serverTime, TaxParties taxParties, Object brandReview, BrandRating brandRating, List<AddonDto> addons, String usageRights,
            List<Object> drafts, Object shipment, Object extension) {

        public static Detail of(Summary s, String packageId, String campaignId, String conversationId, List<String> deliverables, int deliveryDays, Payment payment,
                Instant acceptBy, Instant dueAt, Instant reviewBy, int revisionCount, int maxRevisions, Brief brief, List<DeliveryDto> deliveries, List<EventView> events,
                DisputeView dispute, ReviewDto review, List<String> allowedActions, Instant serverTime, TaxParties taxParties, List<AddonDto> addons, String usageRights) {
            return new Detail(s.id(), s.status(), s.closeReason(), s.kind(), s.title(), s.platform(), s.counterparty(), s.brand(), s.creator(), s.money(), s.nextDeadline(),
                    s.late(), s.needsAction(), s.createdAt(), s.updatedAt(), packageId, campaignId, conversationId, deliverables, deliveryDays, payment, acceptBy, dueAt,
                    reviewBy, revisionCount, maxRevisions, brief, deliveries, events, dispute, review, allowedActions, serverTime, taxParties, null, BrandRating.NONE, addons,
                    usageRights, List.of(), null, null);
        }
    }

    public record Page(List<Summary> content, int page, int size, long totalElements, int totalPages, Map<String, Integer> statusCounts, Instant serverTime) {}

    public record Quote(String kind, Party creator, @com.fasterxml.jackson.annotation.JsonProperty("package") PackageDto pkg, long priceCents, long brandFeeCents, long totalCents, int brandFeeBps, String currency,
            int acceptWindowHours, Taxes taxes, Discount discount, long amountDueCents, long creditBalanceCents, String promoDescription) {}

    public record Created(String orderId, String status, long priceCents, long brandFeeCents, long totalCents, long paidCents, String currency, Instant acceptBy) {}
}
