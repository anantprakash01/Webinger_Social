package com.webinger.collab.order.service;

import com.webinger.collab.common.Catalog;
import com.webinger.collab.common.web.FieldCheck;
import com.webinger.collab.common.web.Urls;
import com.webinger.collab.payment.service.PaymentService.PaymentProof;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Order request bodies and their rules, with the field paths and messages of the frontend's Zod schemas
 * (features/orders/schemas.ts). Each `validated` throws 422 VALIDATION_FAILED.
 */
public final class OrderInputs {
    private OrderInputs() {}

    private static final Pattern HTTPS = Pattern.compile("^https://[^\\s/]+\\.\\S+");
    public static final int DISPUTE_RESPONSE_HOURS = 48;
    public static final Set<String> DISPUTE_REASONS = Set.of("NOT_AS_BRIEFED", "LOW_QUALITY", "NOT_DELIVERED", "LATE", "POST_REMOVED", "OTHER");

    public record ShippingAddress(String name, String line1, String line2, String city, String postalCode, String country) {}

    /** FR-33 brief. `prefix` is "brief." inside an order, "" when edited on its own. */
    public record BriefInput(String requirements, Boolean needsShipping, ShippingAddress shippingAddress, List<String> links, List<String> referenceFiles) {
        public BriefInput validated(FieldCheck c, String prefix) {
            String req = c.text(prefix + "requirements", requirements, 20, 4000, "Tell the creator what you need (at least 20 characters).", "Use at most 4000 characters.");
            if (needsShipping == null) c.fail(prefix + "needsShipping", "Say whether the product ships to the creator.");
            ShippingAddress addr = null;
            if (Boolean.TRUE.equals(needsShipping)) {
                if (shippingAddress == null) c.fail(prefix + "shippingAddress", "Add the address the product ships from.");
                else {
                    String p = prefix + "shippingAddress.";
                    String country = shippingAddress.country() == null ? null : shippingAddress.country().trim().toUpperCase(Locale.ROOT);
                    if (country == null || country.length() != 2) c.fail(p + "country", "Choose the country.");
                    addr = new ShippingAddress(
                            c.text(p + "name", shippingAddress.name(), 2, 100, "Enter the recipient’s name.", "Use at most 100 characters."),
                            c.text(p + "line1", shippingAddress.line1(), 3, 200, "Enter the street address.", "Use at most 200 characters."),
                            c.optionalText(p + "line2", shippingAddress.line2(), 200, "Use at most 200 characters."),
                            c.text(p + "city", shippingAddress.city(), 2, 100, "Enter the city.", "Use at most 100 characters."),
                            c.text(p + "postalCode", shippingAddress.postalCode(), 2, 20, "Enter the postal code.", "Use at most 20 characters."),
                            country);
                }
            }
            List<String> l = new ArrayList<>();
            if (links != null) {
                if (links.size() > 5) c.fail(prefix + "links", "Add up to 5 links.");
                for (int i = 0; i < links.size(); i++) {
                    String u = links.get(i) == null ? "" : links.get(i).trim();
                    if (u.length() > 500 || !HTTPS.matcher(u).lookingAt()) c.fail(prefix + "links." + i, "Links must start with https://");
                    else l.add(u);
                }
            }
            List<String> files = new ArrayList<>();
            if (referenceFiles != null) {
                if (referenceFiles.size() > 5) c.fail(prefix + "referenceFiles", "Add up to 5 files.");
                for (int i = 0; i < referenceFiles.size(); i++) {
                    String u = referenceFiles.get(i);
                    if (!Urls.isSafeImage(u)) c.fail(prefix + "referenceFiles." + i, "Upload the file first.");
                    else files.add(u);
                }
            }
            return new BriefInput(req, needsShipping, addr, l, files);
        }
    }

    /** FR-31 custom offer: the same limits as packages. */
    public record OfferInput(String title, String platform, List<String> deliverables, Long priceCents, Integer deliveryDays) {
        OfferInput validated(FieldCheck c) {
            String p = "offer.";
            String t = c.text(p + "title", title, 3, 80, "Give the offer a short title.", "Use at most 80 characters.");
            c.oneOf(p + "platform", platform, Catalog.PLATFORMS, "Choose a platform.");
            List<String> items = new ArrayList<>();
            if (deliverables == null || deliverables.isEmpty()) c.fail(p + "deliverables", "List at least one deliverable.");
            else {
                if (deliverables.size() > 10) c.fail(p + "deliverables", "List up to 10 deliverables.");
                for (int i = 0; i < deliverables.size(); i++) items.add(c.text(p + "deliverables." + i, deliverables.get(i), 2, 120, "Too short.", "Use at most 120 characters."));
            }
            c.whole(p + "priceCents", priceCents, Money.MIN_PRICE_CENTS, 500_000_000L, "Enter a price.", "The minimum price is ₹500.", "The maximum price is ₹50,00,000.");
            c.whole(p + "deliveryDays", deliveryDays, 1, 60, "Enter the number of days.", "Delivery must be 1 to 60 days.", "Delivery must be 1 to 60 days.");
            return new OfferInput(t, platform, items, priceCents, deliveryDays);
        }
    }

    public record CreateOrderRequest(String packageId, String creatorUsername, OfferInput offer, BriefInput brief, PaymentProof payment, List<String> addonIds,
            String promoCode, Boolean useCredits) {

        public CreateOrderRequest validated() {
            FieldCheck c = new FieldCheck();
            boolean byPackage = packageId != null && !packageId.isBlank();
            boolean byOffer = offer != null && creatorUsername != null && !creatorUsername.isBlank();
            if (byPackage == byOffer || (byPackage && (offer != null || creatorUsername != null))) {
                c.fail("packageId", "Send either a packageId, or a creatorUsername with an offer.");
            }
            OfferInput o = offer == null || byPackage ? null : offer.validated(c);
            BriefInput b = brief == null ? (BriefInput) c.fail("brief", "Add a brief.") : brief.validated(c, "brief.");
            if (addonIds != null && addonIds.size() > 5) c.fail("addonIds", "Choose up to 5 add-ons.");
            String promo = promoCode == null ? null : promoCode.trim();
            if (promo != null && promo.length() > 20) c.fail("promoCode", "Codes are at most 20 characters.");
            c.throwIfAny();
            return new CreateOrderRequest(byPackage ? packageId : null, byPackage ? null : creatorUsername.trim().toLowerCase(Locale.ROOT), o, b, payment,
                    addonIds == null ? List.of() : addonIds, promo == null || promo.isEmpty() ? null : promo.toUpperCase(Locale.ROOT), Boolean.TRUE.equals(useCredits));
        }
    }

    public record DeliveryItemInput(String type, String url, String name) {}

    /** FR-34: files or post links. */
    public record DeliverRequest(List<DeliveryItemInput> items, String note) {
        public DeliverRequest validated() {
            FieldCheck c = new FieldCheck();
            List<DeliveryItemInput> out = new ArrayList<>();
            if (items == null || items.isEmpty()) c.fail("items", "Add at least one file or post link.");
            else {
                if (items.size() > 10) c.fail("items", "Add up to 10 items.");
                for (int i = 0; i < items.size(); i++) {
                    DeliveryItemInput it = items.get(i);
                    String p = "items." + i + ".";
                    if (it == null || !Set.of("FILE", "POST_URL").contains(it.type())) {
                        c.fail(p + "type", "Choose a file or a post link.");
                        continue;
                    }
                    String url = it.url() == null ? "" : it.url().trim();
                    if ("FILE".equals(it.type())) {
                        if (url.isEmpty()) c.fail(p + "url", "Upload a file.");
                        else if (!Urls.isSafeImage(url)) c.fail(p + "url", "Upload the file first.");
                    } else if (url.length() > 500 || !HTTPS.matcher(url).lookingAt()) {
                        c.fail(p + "url", "Paste the full post link, starting with https://");
                    }
                    String name = c.optionalText(p + "name", it.name(), 200, "Use at most 200 characters.");
                    out.add(new DeliveryItemInput(it.type(), url, name == null || name.isEmpty() ? null : name));
                }
            }
            String n = c.optionalText("note", note, 1000, "Use at most 1000 characters.");
            c.throwIfAny();
            return new DeliverRequest(out, n == null || n.isEmpty() ? null : n);
        }
    }

    /** A revision request needs an explanation. */
    public record NoteRequest(String note) {
        public String validatedNote() {
            FieldCheck c = new FieldCheck();
            String n = c.text("note", note, 10, 2000, "Explain in at least 10 characters.", "Use at most 2000 characters.");
            c.throwIfAny();
            return n;
        }
    }

    /** FR-37 dispute: a reason and an explanation. */
    public record DisputeRequest(String note, String reasonCode) {
        public DisputeRequest validated() {
            FieldCheck c = new FieldCheck();
            String n = c.text("note", note, 10, 2000, "Explain in at least 10 characters.", "Use at most 2000 characters.");
            String code = reasonCode == null ? "OTHER" : reasonCode;
            c.oneOf("reasonCode", code, DISPUTE_REASONS, "Choose a reason.");
            c.throwIfAny();
            return new DisputeRequest(n, code);
        }
    }

    /** Decline or cancel: an optional reason. */
    public record ReasonRequest(String reason) {
        public String validatedReason() {
            FieldCheck c = new FieldCheck();
            String r = c.optionalText("reason", reason, 500, "Use at most 500 characters.");
            c.throwIfAny();
            return r == null || r.isEmpty() ? null : r;
        }
    }

    /** FR-38: 1 to 5 stars and an optional comment. */
    public record ReviewRequest(Integer rating, String comment) {
        public ReviewRequest validated() {
            FieldCheck c = new FieldCheck();
            c.whole("rating", rating, 1, 5, "Choose a rating.", "Choose 1 to 5 stars.", "Choose 1 to 5 stars.");
            String cm = c.optionalText("comment", comment, 1000, "Use at most 1000 characters.");
            c.throwIfAny();
            return new ReviewRequest(rating, cm == null || cm.isEmpty() ? null : cm);
        }
    }

    public record ReplyRequest(String reply) {
        public String validatedReply() {
            FieldCheck c = new FieldCheck();
            String r = c.text("reply", reply, 2, 500, "Write a short reply.", "Use at most 500 characters.");
            c.throwIfAny();
            return r;
        }
    }
}
