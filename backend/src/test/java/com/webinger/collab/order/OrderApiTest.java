package com.webinger.collab.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.webinger.collab.ledger.service.LedgerLines.Account;
import com.webinger.collab.ledger.service.LedgerService;
import com.webinger.collab.order.repository.OrderRepository;
import com.webinger.collab.order.service.Money;
import com.webinger.collab.support.ApiTest;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Orders through the API (FR-30 – FR-38, FR-60, FR-64), ported from frontend/src/api/mock/handlers/orders.test.ts
 * and payments.test.ts. Runs against the demo orders between Saltbay and Leo, plus new orders paid through the
 * simulated Razorpay Checkout.
 */
class OrderApiTest extends ApiTest {
    static final String BRIEF = "{\"requirements\":\"Show the tote bag in a morning routine, natural light.\",\"needsShipping\":false,\"links\":[],\"referenceFiles\":[]}";
    static final AtomicInteger KEYS = new AtomicInteger();

    @Autowired
    LedgerService ledger;

    @Autowired
    OrderRepository orderRows;

    static String key() {
        return "test-key-" + KEYS.incrementAndGet();
    }

    void asBrand() throws Exception {
        login("brand@demo.test", DEMO_PASSWORD);
    }

    void asLeo() throws Exception {
        login("creator@demo.test", DEMO_PASSWORD);
    }

    /** Leo's cheapest active package: 3 Instagram Stories at ₹6,000. */
    String leoPackage() throws Exception {
        return call("GET", "/creators/leomakes", null).str("$.packages[0].id");
    }

    Res expect(Res r, int status, String code) {
        assertThat(r.status()).as(r.body()).isEqualTo(status);
        if (code != null) assertThat(r.code()).isEqualTo(code);
        return r;
    }

    static long num(Object o) {
        return ((Number) o).longValue();
    }

    /** Opens a Razorpay session and pays it in the simulated Checkout; returns the proof for POST /orders. */
    String pay(long totalCents, String how) throws Exception {
        String session = expect(call("POST", "/payments/sessions", "{\"purpose\":\"ORDER\",\"amountCents\":" + totalCents + "}"), 201, null).str("$.id");
        Res paid = expect(call("POST", "/dev/razorpay/pay", "{\"sessionId\":\"" + session + "\"," + how + "}"), 200, null);
        return "{\"sessionId\":\"" + session + "\",\"razorpayPaymentId\":\"" + paid.str("$.razorpayPaymentId") + "\",\"razorpaySignature\":\""
                + paid.str("$.razorpaySignature") + "\"}";
    }

    String payUpi(long totalCents) throws Exception {
        return pay(totalCents, "\"method\":\"UPI\",\"vpa\":\"success@razorpay\"");
    }

    long quoteTotal(String packageId) throws Exception {
        return num(call("GET", "/orders/quote?packageId=" + packageId, null).get("$.totalCents"));
    }

    String orderBody(String packageId, String payment) {
        return "{\"packageId\":\"" + packageId + "\",\"brief\":" + BRIEF + ",\"payment\":" + payment + "}";
    }

    /** Saltbay orders Leo's cheapest package; returns the order id. */
    String placeOrder() throws Exception {
        asBrand();
        String pkg = leoPackage();
        return expect(call("POST", "/orders", orderBody(pkg, payUpi(quoteTotal(pkg))), key()), 201, null).str("$.orderId");
    }

    @SuppressWarnings("unchecked")
    static List<String> list(Res r, String path) {
        return (List<String>) r.get(path);
    }

    @Nested
    class DemoOrders {
        @Test
        void coverEveryStateForTheDemoBrandWithABalancedLedger() throws Exception {
            asBrand();
            Res page = call("GET", "/orders?size=50", null);
            for (String s : List.of("PENDING_ACCEPTANCE", "IN_PROGRESS", "DELIVERED", "COMPLETED", "DISPUTED", "REFUNDED", "CLOSED")) {
                assertThat(num(page.get("$.statusCounts." + s))).as(s).isPositive();
            }
            assertThat(ledger.unbalancedTransactions()).isEmpty();
            assertThat(page.str("$.serverTime")).isNotNull();
        }

        @Test
        void creatorsOnlySeeOrdersAddressedToThem() throws Exception {
            asLeo();
            Res page = call("GET", "/orders?size=50", null);
            assertThat(list(page, "$.content[*].counterparty.name")).isNotEmpty().allMatch("Saltbay Supply Co."::equals);
            login("kabirfits@creators.demo.test", DEMO_PASSWORD);
            assertThat((List<?>) call("GET", "/orders", null).get("$.content")).isEmpty();
        }

        @Test
        void filtersByStatusAndSortsWhatNeedsTheCallerFirst() throws Exception {
            asBrand();
            Res page = call("GET", "/orders?status=DELIVERED,DISPUTED", null);
            assertThat(list(page, "$.content[*].status")).allMatch(s -> s.equals("DELIVERED") || s.equals("DISPUTED"));
            assertThat((List<?>) page.get("$.content")).hasSize((int) (num(page.get("$.statusCounts.DELIVERED")) + num(page.get("$.statusCounts.DISPUTED"))));
            // Deliveries waiting for the brand's approval come first.
            assertThat((Boolean) page.get("$.content[0].needsAction")).isTrue();
            expect(call("GET", "/orders?status=NOPE", null), 422, "VALIDATION_FAILED");
        }

        @Test
        void aLateOrderIsFlagged() throws Exception {
            asLeo();
            Res page = call("GET", "/orders?status=IN_PROGRESS", null);
            assertThat((List<Boolean>) page.get("$.content[*].late")).contains(true, false);
        }
    }

    @Nested
    class QuoteAndCheckout {
        @Test
        void quotesAPackageWithTheFeeAndGstOnIt() throws Exception {
            asBrand();
            Res q = expect(call("GET", "/orders/quote?packageId=" + leoPackage(), null), 200, null);
            long price = num(q.get("$.priceCents"));
            assertThat(price).isEqualTo(600_000);
            assertThat(num(q.get("$.brandFeeCents"))).isEqualTo(Money.applyBps(price, 1000));
            assertThat(num(q.get("$.brandFeeBps"))).isEqualTo(1000);
            assertThat(num(q.get("$.acceptWindowHours"))).isEqualTo(72);
            assertThat(q.body()).contains("\"intraState\":true", "\"creatorGstRegistered\":false", "\"creatorGstCents\":0", "\"kind\":\"PACKAGE\"", "\"package\":{");
            assertThat(num(q.get("$.taxes.brandFeeGstCents"))).isEqualTo(Money.applyBps(60_000, 1800));
            assertThat(num(q.get("$.totalCents"))).isEqualTo(600_000 + 60_000 + 10_800);
            assertThat(num(q.get("$.amountDueCents"))).isEqualTo(670_800);
            assertThat(q.str("$.creator.username")).isEqualTo("leomakes");
        }

        @Test
        void quotesACustomOfferAndRefusesBadInput() throws Exception {
            asBrand();
            assertThat(num(call("GET", "/orders/quote?creatorUsername=leomakes&priceCents=1000000", null).get("$.totalCents"))).isEqualTo(1_118_000);
            expect(call("GET", "/orders/quote?creatorUsername=leomakes&priceCents=49999", null), 422, "VALIDATION_FAILED");
            expect(call("GET", "/orders/quote?creatorUsername=nobody&priceCents=1000000", null), 404, "CREATOR_NOT_FOUND");
            expect(call("GET", "/orders/quote?creatorUsername=tarasings&priceCents=1000000", null), 404, "CREATOR_NOT_FOUND");
            expect(call("GET", "/orders/quote", null), 422, "VALIDATION_FAILED");
            expect(call("GET", "/orders/quote?packageId=" + leoPackage() + "&promoCode=WELCOME500", null), 422, "PROMO_NOT_FOUND");
            asLeo();
            expect(call("GET", "/orders/quote?packageId=" + leoPackage(), null), 403, "ROLE_NOT_ALLOWED");
        }

        @Test
        void aGstRegisteredCreatorAndAnOutOfStateBrandChangeTheTaxes() throws Exception {
            // Fernhill is in West Bengal (IGST) — but its email is not verified, so only the quote is checked here.
            login("unverified@demo.test", DEMO_PASSWORD);
            Res q = call("GET", "/orders/quote?creatorUsername=leomakes&priceCents=1000000", null);
            assertThat((Boolean) q.get("$.taxes.intraState")).isFalse();
            asLeo();
            expect(call("PUT", "/payouts/account", "{\"pan\":\"ABCDE1234F\",\"holderName\":\"Leo Fernandes\",\"method\":\"BANK_ACCOUNT\",\"accountNumber\":\"50100123456789\","
                    + "\"ifsc\":\"HDFC0001234\",\"gstin\":\"27ABCDE1234F1Z5\"}"), 200, null);
            asBrand();
            Res reg = call("GET", "/orders/quote?creatorUsername=leomakes&priceCents=1000000", null);
            assertThat(num(reg.get("$.taxes.creatorGstCents"))).isEqualTo(180_000);
            assertThat(num(reg.get("$.totalCents"))).isEqualTo(1_298_000);
        }

        @Test
        void placesAPackageOrderAuthorisedNotCapturedWith72HoursToAccept() throws Exception {
            String id = placeOrder();
            Res o = expect(call("GET", "/orders/" + id, null), 200, null);
            assertThat(o.str("$.status")).isEqualTo("PENDING_ACCEPTANCE");
            assertThat(o.str("$.kind")).isEqualTo("PACKAGE");
            assertThat(o.str("$.title")).isEqualTo("3 Instagram Stories");
            assertThat(o.str("$.payment.status")).isEqualTo("AUTHORIZED");
            assertThat(o.str("$.payment.methodLabel")).isEqualTo("UPI · success@razorpay");
            assertThat(num(o.get("$.payment.refundedCents"))).isZero();
            assertThat(num(o.get("$.money.totalCents"))).isEqualTo(num(o.get("$.money.priceCents")) + num(o.get("$.money.brandFeeCents"))
                    + num(o.get("$.money.taxes.brandFeeGstCents")) + num(o.get("$.money.taxes.creatorGstCents")));
            assertThat(Duration.between(Instant.parse(o.str("$.createdAt")), Instant.parse(o.str("$.acceptBy")))).isEqualTo(Duration.ofHours(72));
            assertThat(list(o, "$.allowedActions")).containsExactlyInAnyOrder("CANCEL", "EDIT_BRIEF");
            assertThat(list(o, "$.events[*].type")).containsExactly("CREATE");
            assertThat(o.str("$.packageId")).isEqualTo(leoPackage());
            assertThat(o.body()).contains("\"taxParties\":{\"platformGstin\":\"29AAACW0000A1Z5\",\"platformState\":\"KA\",\"brandGstin\":\"29AAACS1234B1Z9\"");
            assertThat(ledger.balance(id, Account.ESCROW)).isZero(); // nothing captured yet
        }

        @Test
        void placesACustomOffer() throws Exception {
            asBrand();
            String offer = "{\"creatorUsername\":\"LeoMakes\",\"offer\":{\"title\":\"Two-part series\",\"platform\":\"TIKTOK\",\"deliverables\":[\"2 TikToks\"],"
                    + "\"priceCents\":50000,\"deliveryDays\":10},\"brief\":" + BRIEF + ",\"payment\":" + payUpi(55_900) + "}";
            Res created = expect(call("POST", "/orders", offer, key()), 201, null);
            assertThat(num(created.get("$.totalCents"))).isEqualTo(55_900); // ₹500 + ₹50 fee + ₹9 GST on the fee
            assertThat(num(created.get("$.paidCents"))).isEqualTo(55_900);
            Res o = call("GET", "/orders/" + created.str("$.orderId"), null);
            assertThat(o.str("$.kind")).isEqualTo("CUSTOM_OFFER");
            assertThat(o.str("$.title")).isEqualTo("Two-part series");
            assertThat((Object) o.get("$.packageId")).isNull();
            assertThat(list(o, "$.deliverables")).containsExactly("2 TikToks");
            assertThat(num(o.get("$.deliveryDays"))).isEqualTo(10);
        }

        @Test
        void isIdempotentTheSameKeyReturnsTheSameOrder() throws Exception {
            asBrand();
            String pkg = leoPackage();
            String body = orderBody(pkg, payUpi(quoteTotal(pkg)));
            long before = orderRows.count();
            String k = key();
            String a = expect(call("POST", "/orders", body, k), 201, null).str("$.orderId");
            String b = expect(call("POST", "/orders", body, k), 201, null).str("$.orderId");
            assertThat(b).isEqualTo(a);
            assertThat(orderRows.count()).isEqualTo(before + 1);
            expect(call("POST", "/orders/" + a + "/cancel", null, k), 422, "IDEMPOTENCY_KEY_REUSED");
        }

        @Test
        void needsAVerifiedBrandAndAValidBrief() throws Exception {
            String unpaid = "{\"sessionId\":\"x\",\"razorpayPaymentId\":\"y\",\"razorpaySignature\":\"z\"}";
            asBrand();
            String pkg = leoPackage();
            login("unverified@demo.test", DEMO_PASSWORD);
            expect(call("POST", "/orders", orderBody(pkg, unpaid), key()), 403, "EMAIL_NOT_VERIFIED");
            asBrand();
            Res shortBrief = expect(call("POST", "/orders", orderBody(pkg, unpaid).replace("Show the tote bag in a morning routine, natural light.", "too short"), key()),
                    422, "VALIDATION_FAILED");
            assertThat(list(shortBrief, "$.errors[*].field")).contains("brief.requirements");
            Res noAddress = expect(call("POST", "/orders", orderBody(pkg, unpaid).replace("\"needsShipping\":false", "\"needsShipping\":true"), key()), 422, null);
            assertThat(list(noAddress, "$.errors[*].field")).contains("brief.shippingAddress");
            expect(call("POST", "/orders", "{\"brief\":" + BRIEF + "}", key()), 422, "VALIDATION_FAILED");
            asLeo();
            expect(call("POST", "/orders", orderBody(pkg, unpaid), key()), 403, "ROLE_NOT_ALLOWED");
        }

        @Test
        void refusesSwitchedOffPackagesAndPackagesWithOrdersCannotBeDeleted() throws Exception {
            String pkg = leoPackage();
            placeOrder();
            asLeo();
            expect(call("DELETE", "/creators/me/packages/" + pkg, null), 409, "PACKAGE_HAS_ORDERS");
            expect(call("PATCH", "/creators/me/packages/" + pkg, "{\"active\":false}"), 200, null);
            asBrand();
            expect(call("POST", "/orders", orderBody(pkg, payUpi(670_800)), key()), 409, "PACKAGE_UNAVAILABLE");
        }

        @Test
        void refusesCreatorsWhoAreAway() throws Exception {
            asLeo();
            call("PUT", "/creators/me/availability", "{\"away\":true}");
            asBrand();
            String pkg = leoPackage();
            Res r = expect(call("POST", "/orders", orderBody(pkg, payUpi(quoteTotal(pkg))), key()), 409, "CREATOR_AWAY");
            assertThat(r.str("$.detail")).isEqualTo("Leo Fernandes is away and not taking new orders.");
        }

        @Test
        void addOnsRaiseThePriceShortenDeliveryAndAddARevision() throws Exception {
            asBrand();
            Res profile = call("GET", "/creators/leomakes", null);
            String pkg = profile.str("$.packages[1].id"); // Instagram Reel ₹12,000, 5 days, with rush (2 days) and usage rights
            List<String> addonIds = list(profile, "$.packages[1].addons[*].id");
            long addonsTotal = ((List<Number>) profile.get("$.packages[1].addons[*].priceCents")).stream().mapToLong(Number::longValue).sum();
            Res q = call("GET", "/orders/quote?packageId=" + pkg + "&addonIds=" + String.join(",", addonIds), null);
            assertThat(num(q.get("$.priceCents"))).isEqualTo(1_200_000 + addonsTotal);
            String body = "{\"packageId\":\"" + pkg + "\",\"addonIds\":[\"" + String.join("\",\"", addonIds) + "\"],\"brief\":" + BRIEF + ",\"payment\":"
                    + payUpi(num(q.get("$.totalCents"))) + "}";
            String id = expect(call("POST", "/orders", body, key()), 201, null).str("$.orderId");
            Res o = call("GET", "/orders/" + id, null);
            assertThat(num(o.get("$.deliveryDays"))).isEqualTo(2);
            assertThat(o.str("$.usageRights")).isEqualTo("Paid ads for 30 days");
            assertThat((List<?>) o.get("$.addons")).hasSize(2);
            expect(call("GET", "/orders/quote?packageId=" + pkg + "&addonIds=NOPE", null), 422, "UNKNOWN_ADDON");
        }
    }

    @Nested
    class Lifecycle {
        @Test
        void acceptDeliverApprovePaysTheCreatorThenOneReviewAndOneReply() throws Exception {
            String id = placeOrder();
            asLeo();
            long availableBefore = num(call("GET", "/creators/me/stats", null).get("$.availableCents"));
            Res o = call("GET", "/orders/" + id, null);
            assertThat(list(o, "$.allowedActions")).containsExactlyInAnyOrder("ACCEPT", "DECLINE", "CANCEL");
            assertThat((Boolean) o.get("$.needsAction")).isTrue();

            o = expect(call("POST", "/orders/" + id + "/accept", null, key()), 200, null);
            assertThat(o.str("$.status")).isEqualTo("IN_PROGRESS");
            assertThat(o.str("$.payment.status")).isEqualTo("CAPTURED");
            assertThat(o.str("$.dueAt")).isNotNull();
            long total = num(o.get("$.money.totalCents"));
            assertThat(ledger.balance(id, Account.ESCROW)).isEqualTo(total);
            assertThat(num(call("GET", "/creators/me/stats", null).get("$.inEscrowCents"))).isGreaterThanOrEqualTo(num(o.get("$.money.creatorPayoutCents")));

            expect(call("POST", "/orders/" + id + "/deliver", "{\"items\":[{\"type\":\"POST_URL\",\"url\":\"http://insecure.example.com\"}]}", key()), 422, null);
            o = expect(call("POST", "/orders/" + id + "/deliver", "{\"items\":[{\"type\":\"POST_URL\",\"url\":\"https://example.com/p/1\",\"name\":\"Reel\"}],\"note\":\"Here you go\"}",
                    key()), 200, null);
            assertThat(o.str("$.status")).isEqualTo("DELIVERED");
            assertThat(num(o.get("$.deliveries[0].revisionNo"))).isZero();
            assertThat(o.str("$.deliveries[0].note")).isEqualTo("Here you go");

            asBrand();
            assertThat(list(call("GET", "/orders/" + id, null), "$.allowedActions")).containsExactlyInAnyOrder("APPROVE", "DISPUTE", "REQUEST_REVISION");
            o = expect(call("POST", "/orders/" + id + "/approve", null, key()), 200, null);
            assertThat(o.str("$.status")).isEqualTo("COMPLETED");
            assertThat(list(o, "$.allowedActions")).containsExactly("REVIEW");
            assertThat(ledger.balance(id, Account.ESCROW)).isZero();
            long payout = num(o.get("$.money.creatorPayoutCents"));
            assertThat(ledger.balance(id, Account.CREATOR_BALANCE)).isEqualTo(payout);
            assertThat(ledger.unbalancedTransactions()).isEmpty();
            assertThat(list(o, "$.events[*].type")).containsExactly("CREATE", "ACCEPT", "DELIVER", "APPROVE");
            assertThat(list(o, "$.events[*].actor")).containsExactly("BRAND", "CREATOR", "CREATOR", "BRAND");

            Res review = expect(call("POST", "/orders/" + id + "/review", "{\"rating\":4,\"comment\":\"Lovely work.\"}"), 201, null);
            expect(call("POST", "/orders/" + id + "/review", "{\"rating\":5}"), 409, "ALREADY_REVIEWED");
            expect(call("POST", "/orders/" + id + "/review", "{\"rating\":6}"), 409, "ALREADY_REVIEWED");

            asLeo();
            assertThat(num(call("GET", "/creators/me/stats", null).get("$.availableCents")) - availableBefore).isEqualTo(payout);
            assertThat(list(call("GET", "/orders/" + id, null), "$.allowedActions")).containsExactly("REPLY");
            assertThat(expect(call("POST", "/reviews/" + review.str("$.id") + "/reply", "{\"reply\":\"Thank you!\"}"), 200, null).str("$.creatorReply")).isEqualTo("Thank you!");
            expect(call("POST", "/reviews/" + review.str("$.id") + "/reply", "{\"reply\":\"Again\"}"), 409, "ALREADY_REPLIED");
            Res profile = call("GET", "/creators/leomakes", null);
            assertThat(profile.str("$.reviews[0].comment")).isEqualTo("Lovely work.");
            assertThat(profile.str("$.reviews[0].creatorReply")).isEqualTo("Thank you!");
            assertThat(profile.str("$.reviews[0].brandName")).isEqualTo("Saltbay Supply Co.");
            assertThat(num(profile.get("$.ratingCount"))).isEqualTo(2);
            assertThat(((Number) profile.get("$.ratingAvg")).doubleValue()).isEqualTo(4.5);
        }

        @Test
        void declineAndCancelReleaseTheHoldWithoutCharging() throws Exception {
            String a = placeOrder();
            String b = placeOrder();
            asLeo();
            Res declined = expect(call("POST", "/orders/" + a + "/decline", "{\"reason\":\"Fully booked\"}", key()), 200, null);
            assertThat(declined.str("$.status")).isEqualTo("CLOSED");
            assertThat(declined.str("$.closeReason")).isEqualTo("DECLINED");
            assertThat(declined.str("$.payment.status")).isEqualTo("CANCELED");
            assertThat(declined.str("$.events[1].note")).isEqualTo("Fully booked");
            asBrand();
            Res cancelled = expect(call("POST", "/orders/" + b + "/cancel", null, key()), 200, null);
            assertThat(cancelled.str("$.closeReason")).isEqualTo("CANCELED");
            for (Account acc : Account.values()) {
                assertThat(ledger.balance(a, acc)).isZero();
                assertThat(ledger.balance(b, acc)).isZero();
            }
        }

        @Test
        void revisionsAreCappedAt2AndDisputesNeedAReason() throws Exception {
            String id = placeOrder();
            asLeo();
            call("POST", "/orders/" + id + "/accept", null, key());
            for (int i = 0; i < 2; i++) {
                asLeo();
                expect(call("POST", "/orders/" + id + "/deliver", "{\"items\":[{\"type\":\"FILE\",\"url\":\"/demo/work-01.svg\"}]}", key()), 200, null);
                asBrand();
                expect(call("POST", "/orders/" + id + "/request-revision", "{\"note\":\"Please brighten the opening shot.\"}", key()), 200, null);
            }
            asLeo();
            call("POST", "/orders/" + id + "/deliver", "{\"items\":[{\"type\":\"FILE\",\"url\":\"/demo/work-02.svg\"}]}", key());
            asBrand();
            Res o = call("GET", "/orders/" + id, null);
            assertThat(num(o.get("$.revisionCount"))).isEqualTo(2);
            assertThat(list(o, "$.allowedActions")).doesNotContain("REQUEST_REVISION");
            expect(call("POST", "/orders/" + id + "/request-revision", "{\"note\":\"One more please, thanks\"}", key()), 409, "REVISION_LIMIT");
            expect(call("POST", "/orders/" + id + "/request-revision", "{\"note\":\"short\"}", key()), 422, "VALIDATION_FAILED");
            expect(call("POST", "/orders/" + id + "/dispute", "{\"note\":\"bad\"}", key()), 422, "VALIDATION_FAILED");
            Res d = expect(call("POST", "/orders/" + id + "/dispute", "{\"note\":\"The product is not shown at all in the final cut.\",\"reasonCode\":\"NOT_AS_BRIEFED\"}",
                    key()), 200, null);
            assertThat(d.str("$.status")).isEqualTo("DISPUTED");
            assertThat(d.str("$.dispute.status")).isEqualTo("OPEN");
            assertThat(d.str("$.dispute.reasonCode")).isEqualTo("NOT_AS_BRIEFED");
            assertThat(Duration.between(Instant.parse(d.str("$.dispute.openedAt")), Instant.parse(d.str("$.dispute.respondBy")))).isEqualTo(Duration.ofHours(48));
            assertThat((List<Integer>) d.get("$.deliveries[*].revisionNo")).containsExactly(2, 1, 0);
            assertThat(ledger.balance(id, Account.ESCROW)).isEqualTo(num(d.get("$.money.totalCents")));
        }

        @Test
        void rejectsActionsOutOfTurnAndHidesOtherPeoplesOrders() throws Exception {
            String id = placeOrder();
            expect(call("POST", "/orders/" + id + "/approve", null, key()), 409, "INVALID_TRANSITION");
            expect(call("POST", "/orders/" + id + "/accept", null, key()), 403, "ROLE_NOT_ALLOWED");
            login("kabirfits@creators.demo.test", DEMO_PASSWORD);
            expect(call("GET", "/orders/" + id, null), 404, "ORDER_NOT_FOUND");
            expect(call("POST", "/orders/" + id + "/accept", null, key()), 404, "ORDER_NOT_FOUND");
            login("unverified@demo.test", DEMO_PASSWORD);
            expect(call("GET", "/orders/" + id, null), 404, "ORDER_NOT_FOUND");
            login("admin@demo.test", DEMO_PASSWORD);
            assertThat(call("GET", "/orders/" + id, null).str("$.id")).isEqualTo(id);
        }

        @Test
        void aRetriedActionReturnsTheOrderInsteadOfActingTwice() throws Exception {
            String id = placeOrder();
            asLeo();
            String k = key();
            expect(call("POST", "/orders/" + id + "/accept", null, k), 200, null);
            Res again = expect(call("POST", "/orders/" + id + "/accept", null, k), 200, null);
            assertThat(again.str("$.status")).isEqualTo("IN_PROGRESS");
            assertThat(list(again, "$.events[*].type")).containsExactly("CREATE", "ACCEPT");
            // Without the key, a second accept is out of turn.
            expect(call("POST", "/orders/" + id + "/accept", null, key()), 409, "INVALID_TRANSITION");
        }

        @Test
        void editsTheBriefOnlyBeforeDelivery() throws Exception {
            String id = placeOrder();
            Res o = expect(call("POST", "/orders/" + id + "/brief", BRIEF.replace("Show the tote bag in a morning routine, natural light.",
                    "Updated: please film outdoors in daylight."), null), 200, null);
            assertThat(o.str("$.brief.requirements")).isEqualTo("Updated: please film outdoors in daylight.");
            String delivered = call("GET", "/orders?status=DELIVERED", null).str("$.content[0].id");
            expect(call("POST", "/orders/" + delivered + "/brief", BRIEF, null), 409, "INVALID_TRANSITION");
            asLeo();
            expect(call("POST", "/orders/" + id + "/brief", BRIEF, null), 403, "ROLE_NOT_ALLOWED");
        }
    }

    @Nested
    class SimulateTime {
        @Test
        void expiresUnacceptedOrdersAndAutoApprovesDeliveriesAfter72Hours() throws Exception {
            String id = placeOrder();
            List<String> delivered = list(call("GET", "/orders?status=DELIVERED", null), "$.content[*].id");
            assertThat(delivered).hasSize(2);
            Res res = expect(call("POST", "/dev/simulate-time", "{\"hours\":73}"), 200, null);
            assertThat(num(res.get("$.offsetHours"))).isEqualTo(73);
            assertThat(num(res.get("$.expired"))).isGreaterThanOrEqualTo(1);
            assertThat(num(res.get("$.autoApproved"))).isEqualTo(delivered.size());

            asBrand(); // the 15-minute access token expired with the clock
            Res expired = call("GET", "/orders/" + id, null);
            assertThat(expired.str("$.status")).isEqualTo("CLOSED");
            assertThat(expired.str("$.closeReason")).isEqualTo("EXPIRED");
            assertThat(expired.str("$.payment.status")).isEqualTo("CANCELED");
            for (String d : delivered) {
                Res o = call("GET", "/orders/" + d, null);
                assertThat(o.str("$.status")).isEqualTo("COMPLETED");
                assertThat(o.str("$.events[-1].type")).isEqualTo("AUTO_APPROVE");
                assertThat(o.str("$.events[-1].actor")).isEqualTo("SYSTEM");
            }
            assertThat(ledger.unbalancedTransactions()).isEmpty();
            assertThat(num(call("GET", "/dev/clock", null).get("$.offsetHours"))).isEqualTo(73);
        }

        @Test
        void rejectsSillyAmounts() throws Exception {
            expect(call("POST", "/dev/simulate-time", "{\"hours\":0}"), 422, "VALIDATION_FAILED");
            expect(call("POST", "/dev/simulate-time", "{\"hours\":10000}"), 422, "VALIDATION_FAILED");
            expect(call("POST", "/dev/simulate-time", null), 422, "VALIDATION_FAILED");
        }
    }

    @Nested
    class Payments {
        @Test
        void authorisesByUpiCardNetbankingOrWalletAppAndRecordsTheMethod() throws Exception {
            asBrand();
            String pkg = leoPackage();
            long total = quoteTotal(pkg);
            Map<String, String> cases = Map.of(
                    "\"method\":\"UPI\",\"vpa\":\"success@razorpay\"", "UPI · success@razorpay",
                    "\"method\":\"CARD\",\"card\":{\"number\":\"4111 1111 1111 1111\",\"expiry\":\"12 / 39\",\"cvc\":\"123\"}", "Visa •••• 1111",
                    "\"method\":\"NETBANKING\",\"bank\":\"ICIC\"", "ICICI Bank netbanking",
                    "\"method\":\"WALLET_APP\",\"app\":\"phonepe\"", "PhonePe wallet");
            for (var c : cases.entrySet()) {
                String id = expect(call("POST", "/orders", orderBody(pkg, pay(total, c.getKey())), key()), 201, null).str("$.orderId");
                Res o = call("GET", "/orders/" + id, null);
                assertThat(o.str("$.payment.methodLabel")).isEqualTo(c.getValue());
                assertThat(num(o.get("$.payment.amountCents"))).isEqualTo(total);
            }
        }

        @Test
        void neverCreatesAnOrderForAFailedForgedReusedOrWrongAmountPayment() throws Exception {
            asBrand();
            String pkg = leoPackage();
            long total = quoteTotal(pkg);
            long before = orderRows.count();
            String session = call("POST", "/payments/sessions", "{\"purpose\":\"ORDER\",\"amountCents\":" + total + "}").str("$.id");
            expect(call("POST", "/dev/razorpay/pay", "{\"sessionId\":\"" + session + "\",\"method\":\"UPI\",\"vpa\":\"failure@razorpay\"}"), 402, "PAYMENT_FAILED");
            expect(call("POST", "/dev/razorpay/pay", "{\"sessionId\":\"" + session + "\",\"method\":\"CARD\",\"card\":{\"number\":\"4000 0000 0000 0002\",\"expiry\":\"12 / 39\","
                    + "\"cvc\":\"123\"}}"), 402, "PAYMENT_FAILED");
            Res badCard = expect(call("POST", "/dev/razorpay/pay", "{\"sessionId\":\"" + session + "\",\"method\":\"CARD\",\"card\":{\"number\":\"1234\",\"expiry\":\"01 / 20\","
                    + "\"cvc\":\"1\"}}"), 422, "VALIDATION_FAILED");
            assertThat(list(badCard, "$.errors[*].field")).containsExactly("card.number", "card.expiry", "card.cvc");

            String ok = payUpi(total);
            expect(call("POST", "/orders", orderBody(pkg, ok.replaceAll("\"razorpaySignature\":\"[0-9a-f]+\"", "\"razorpaySignature\":\"forged\"")), key()), 402,
                    "PAYMENT_FAILED");
            expect(call("POST", "/orders", orderBody(pkg, payUpi(total - 100)), key()), 409, "AMOUNT_MISMATCH");
            assertThat(orderRows.count()).isEqualTo(before);
            expect(call("POST", "/orders", orderBody(pkg, ok), key()), 201, null);
            expect(call("POST", "/orders", orderBody(pkg, ok), key()), 409, "SESSION_USED");
            assertThat(orderRows.count()).isEqualTo(before + 1);
            // A session belongs to the brand that opened it.
            login("unverified@demo.test", DEMO_PASSWORD);
            expect(call("POST", "/dev/razorpay/pay", "{\"sessionId\":\"" + session + "\",\"method\":\"UPI\",\"vpa\":\"success@razorpay\"}"), 404, "NOT_FOUND");
        }

        @Test
        void anExpiredSessionCannotBePaid() throws Exception {
            asBrand();
            String session = call("POST", "/payments/sessions", "{\"purpose\":\"ORDER\",\"amountCents\":670800}").str("$.id");
            clock.advance(Duration.ofMinutes(31));
            asBrand();
            expect(call("POST", "/dev/razorpay/pay", "{\"sessionId\":\"" + session + "\",\"method\":\"UPI\",\"vpa\":\"success@razorpay\"}"), 409, "SESSION_EXPIRED");
        }

        @Test
        void sessionsAreForBrandsAndValidated() throws Exception {
            asBrand();
            Res s = expect(call("POST", "/payments/sessions", "{\"purpose\":\"ORDER\",\"amountCents\":670800}"), 201, null);
            assertThat(s.str("$.razorpayOrderId")).startsWith("order_sim");
            assertThat(s.str("$.razorpayKeyId")).isEqualTo("rzp_test_simulated");
            assertThat(s.str("$.currency")).isEqualTo("INR");
            expect(call("POST", "/payments/sessions", "{\"purpose\":\"ORDER\",\"amountCents\":99}"), 422, "VALIDATION_FAILED");
            expect(call("POST", "/payments/sessions", "{\"purpose\":\"GIFT\",\"amountCents\":1000}"), 422, "VALIDATION_FAILED");
            asLeo();
            expect(call("POST", "/payments/sessions", "{\"purpose\":\"ORDER\",\"amountCents\":1000}"), 403, "ROLE_NOT_ALLOWED");
        }

        @Test
        void savesCardsAsTokensAndUpiIdsAndLetsTheBrandRemoveThem() throws Exception {
            asBrand();
            long total = quoteTotal(leoPackage());
            pay(total, "\"method\":\"CARD\",\"card\":{\"number\":\"5555 5555 5555 4444\",\"expiry\":\"10 / 30\",\"cvc\":\"123\",\"save\":true}");
            pay(total, "\"method\":\"UPI\",\"vpa\":\"maya@okicici\",\"saveVpa\":true");
            Res methods = call("GET", "/payments/methods", null);
            assertThat(list(methods, "$.content[*].label")).contains("Mastercard •••• 4444", "maya@okicici", "Visa •••• 1111", "saltbay@okhdfcbank");
            assertThat(methods.body()).doesNotContain("5555555555554444");
            String mc = ((List<String>) methods.get("$.content[?(@.label == 'Mastercard •••• 4444')].id")).getFirst();
            // Paying with a saved card uses its token.
            Res saved = expect(call("POST", "/dev/razorpay/pay", "{\"sessionId\":\"" + call("POST", "/payments/sessions", "{\"purpose\":\"ORDER\",\"amountCents\":1000}").str("$.id")
                    + "\",\"method\":\"CARD\",\"savedMethodId\":\"" + mc + "\"}"), 200, null);
            assertThat(saved.str("$.razorpayPaymentId")).startsWith("pay_sim");
            expect(call("DELETE", "/payments/methods/" + mc, null), 204, null);
            assertThat(list(call("GET", "/payments/methods", null), "$.content[*].id")).doesNotContain(mc);
            expect(call("DELETE", "/payments/methods/" + mc, null), 404, "NOT_FOUND");
            asLeo();
            expect(call("GET", "/payments/methods", null), 403, "ROLE_NOT_ALLOWED");
        }
    }

    @Nested
    class FeesAndDashboards {
        @Test
        void publicFeesListThePlans() throws Exception {
            signOutLocally();
            Res f = expect(call("GET", "/fees", null), 200, null);
            assertThat(f.body()).contains("\"plan\":\"FREE\"", "\"brandFeeBps\":1000", "\"creatorFeeBps\":1500");
            assertThat(list(f, "$.plans[*].plan")).containsExactly("FREE", "PRO", "PREMIUM");
            assertThat((List<Integer>) f.get("$.plans[*].brandFeeBps")).containsExactly(1000, 500, 200);
            assertThat(num(f.get("$.plans[1].monthlyCents"))).isEqualTo(4_999_00);
        }

        @Test
        void brandStatsSumSpendEscrowAndHoldsAndListDeliveredPosts() throws Exception {
            asBrand();
            Res s = expect(call("GET", "/brands/me/stats", null), 200, null);
            assertThat(s.str("$.currency")).isEqualTo("INR");
            assertThat(num(s.get("$.spentCents"))).isPositive();
            assertThat(num(s.get("$.inEscrowCents"))).isPositive();
            assertThat(num(s.get("$.authorisedCents"))).isPositive();
            assertThat((List<?>) s.get("$.spendByMonth")).hasSize(6);
            assertThat(list(s, "$.deliveredPosts[*].url")).allMatch(u -> u.startsWith("https://"));
            assertThat(((Map<String, Object>) s.get("$.ordersByStatus")).keySet()).hasSize(7);
            asLeo();
            expect(call("GET", "/brands/me/stats", null), 403, "ROLE_NOT_ALLOWED");
        }

        @Test
        void creatorStatsComeFromTheLedgerAndTheOrders() throws Exception {
            asLeo();
            Res s = call("GET", "/creators/me/stats", null);
            assertThat(num(s.get("$.availableCents"))).isPositive();
            assertThat(num(s.get("$.lifetimeEarnedCents"))).isGreaterThanOrEqualTo(num(s.get("$.availableCents")));
            assertThat(num(s.get("$.inEscrowCents"))).isPositive();
            assertThat(num(s.get("$.ordersByStatus.COMPLETED"))).isEqualTo(2);
        }
    }
}
