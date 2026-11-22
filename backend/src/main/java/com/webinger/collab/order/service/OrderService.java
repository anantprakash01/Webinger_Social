package com.webinger.collab.order.service;

import com.webinger.collab.brand.service.BrandService;
import com.webinger.collab.brand.service.BrandService.BrandInfo;
import com.webinger.collab.common.Catalog;
import com.webinger.collab.common.Ulid;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.common.web.FieldCheck;
import com.webinger.collab.creator.domain.CreatorPackage;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.service.CreatorService;
import com.webinger.collab.creator.service.CreatorService.PackageOffer;
import com.webinger.collab.creator.service.PayoutAccountService;
import com.webinger.collab.creator.web.CreatorDtos.AddonDto;
import com.webinger.collab.ledger.service.LedgerService;
import com.webinger.collab.order.domain.Delivery;
import com.webinger.collab.order.domain.Dispute;
import com.webinger.collab.order.domain.Order;
import com.webinger.collab.order.domain.OrderBrief;
import com.webinger.collab.order.domain.OrderEvent;
import com.webinger.collab.order.domain.Review;
import com.webinger.collab.order.repository.DeliveryRepository;
import com.webinger.collab.order.repository.DisputeRepository;
import com.webinger.collab.order.repository.OrderBriefRepository;
import com.webinger.collab.order.repository.OrderEventRepository;
import com.webinger.collab.order.repository.OrderRepository;
import com.webinger.collab.order.repository.ReviewRepository;
import com.webinger.collab.order.service.Money.FeeRates;
import com.webinger.collab.order.service.Money.OrderAmounts;
import com.webinger.collab.order.service.OrderInputs.BriefInput;
import com.webinger.collab.order.service.OrderInputs.CreateOrderRequest;
import com.webinger.collab.order.service.OrderInputs.DeliverRequest;
import com.webinger.collab.order.service.OrderInputs.ReviewRequest;
import com.webinger.collab.order.service.OrderInputs.ShippingAddress;
import com.webinger.collab.order.service.OrderStateMachine.Actor;
import com.webinger.collab.order.service.OrderStateMachine.Event;
import com.webinger.collab.order.service.OrderStateMachine.EventType;
import com.webinger.collab.order.service.OrderStateMachine.OrderState;
import com.webinger.collab.order.service.OrderStateMachine.Result;
import com.webinger.collab.order.service.OrderStateMachine.Status;
import com.webinger.collab.order.web.OrderDtos;
import com.webinger.collab.order.web.OrderDtos.Created;
import com.webinger.collab.order.web.OrderDtos.Deadline;
import com.webinger.collab.order.web.OrderDtos.Detail;
import com.webinger.collab.order.web.OrderDtos.Discount;
import com.webinger.collab.order.web.OrderDtos.MoneyDto;
import com.webinger.collab.order.web.OrderDtos.Party;
import com.webinger.collab.order.web.OrderDtos.Quote;
import com.webinger.collab.order.web.OrderDtos.Summary;
import com.webinger.collab.payment.service.PaymentService;
import com.webinger.collab.payment.service.PaymentService.Verified;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.domain.Role;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.service.UserService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Orders and reviews (FR-30 – FR-38, FR-60, FR-64, FR-71), ported from the mock's handlers/orders.ts.
 * Every status change goes through {@link OrderStateMachine}, so states, guards, error codes, payment states and
 * ledger postings match the mock exactly. Not here yet (later modules): notifications, chat threads, promo codes
 * and credits, drafts, shipping, extensions, and the dispute workflow after opening.
 */
@Service
public class OrderService {
    public static final List<String> STATUSES = CreatorTrackRecord.STATUSES;
    private static final Set<String> NEEDS_ACTION = Set.of("ACCEPT", "DELIVER", "APPROVE");
    private static final Map<EventType, String> ACTIONS = Map.of(EventType.ACCEPT, "ACCEPT", EventType.DECLINE, "DECLINE", EventType.CANCEL, "CANCEL",
            EventType.DELIVER, "DELIVER", EventType.APPROVE, "APPROVE", EventType.REQUEST_REVISION, "REQUEST_REVISION", EventType.DISPUTE, "DISPUTE",
            EventType.ADMIN_CANCEL, "ADMIN_CANCEL");

    private final OrderRepository orders;
    private final OrderBriefRepository briefs;
    private final OrderEventRepository events;
    private final DeliveryRepository deliveries;
    private final DisputeRepository disputes;
    private final ReviewRepository reviews;
    private final CreatorService creators;
    private final PayoutAccountService payoutAccounts;
    private final BrandService brands;
    private final UserService users;
    private final FeeService fees;
    private final PaymentService payments;
    private final LedgerService ledger;
    private final IdempotencyService idempotency;
    private final TransactionTemplate tx;
    private final Clock clock;

    public OrderService(OrderRepository orders, OrderBriefRepository briefs, OrderEventRepository events, DeliveryRepository deliveries, DisputeRepository disputes,
            ReviewRepository reviews, CreatorService creators, PayoutAccountService payoutAccounts, BrandService brands, UserService users, FeeService fees,
            PaymentService payments, LedgerService ledger, IdempotencyService idempotency, PlatformTransactionManager txManager, Clock clock) {
        this.idempotency = idempotency;
        this.orders = orders;
        this.briefs = briefs;
        this.events = events;
        this.deliveries = deliveries;
        this.disputes = disputes;
        this.reviews = reviews;
        this.creators = creators;
        this.payoutAccounts = payoutAccounts;
        this.brands = brands;
        this.users = users;
        this.fees = fees;
        this.payments = payments;
        this.ledger = ledger;
        this.tx = new TransactionTemplate(txManager);
        this.clock = clock;
    }

    // ---------- Helpers ----------

    private static void requireBrand(AuthUser me) {
        if (me.role() != Role.BRAND) throw new ApiException(HttpStatus.FORBIDDEN, "Only brand accounts can do this.", "ROLE_NOT_ALLOWED");
    }

    Actor actorOf(AuthUser me) {
        return new Actor(me.userId(), me.role(), users.get(me.userId()).isEmailVerified());
    }

    /** The order if the caller takes part in it (admins see all). Others get 404, so ids cannot be probed. */
    Order visibleOrder(AuthUser me, String id) {
        Order o = orders.findByPublicId(id == null ? "" : id).orElse(null);
        boolean mine = o != null && (me.role() == Role.ADMIN || (me.role() == Role.BRAND && o.getBrandUserId().equals(me.userId()))
                || (me.role() == Role.CREATOR && o.getCreatorUserId().equals(me.userId())));
        if (!mine) throw new ApiException(HttpStatus.NOT_FOUND, "No such order.", "ORDER_NOT_FOUND");
        return o;
    }

    /** GST place of supply and the creator's registration (v2.3). */
    private Money.Taxes taxesFor(Money.Fees f, BrandInfo brand, CreatorProfile creator) {
        boolean intra = brand.state() == null || brand.state().equals(Money.PLATFORM_STATE);
        boolean registered = payoutAccounts.verifiedGstinOf(creator.getId()).isPresent();
        return Money.taxes(f.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), intra, registered);
    }

    /** What is being bought: a package (with add-ons) or a custom offer. Fixed on the order at checkout. */
    record Line(String kind, CreatorPackage pkg, String title, String platform, List<String> deliverables, long priceCents, int deliveryDays, int maxRevisions,
            List<CreatorPackage.Addon> addons, String usageRights) {}

    /** Price, delivery days and revisions for a package with the chosen add-ons (v2.4). */
    static Line withAddons(CreatorPackage k, List<String> ids) {
        List<CreatorPackage.Addon> chosen = new ArrayList<>();
        for (String id : new LinkedHashSet<>(ids)) {
            CreatorPackage.Addon a = k.getAddons().stream().filter(x -> x.getAddonId().equals(id)).findFirst()
                    .orElseThrow(() -> ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "This add-on is not offered with the package.", "UNKNOWN_ADDON", "addonIds",
                            "Unknown add-on."));
            chosen.add(a);
        }
        long price = k.getPriceCents() + chosen.stream().mapToLong(CreatorPackage.Addon::getPriceCents).sum();
        Integer rush = chosen.stream().filter(a -> "RUSH".equals(a.getKind())).map(CreatorPackage.Addon::getRushDays).findFirst().orElse(null);
        Integer usage = chosen.stream().filter(a -> "USAGE_RIGHTS".equals(a.getKind())).map(CreatorPackage.Addon::getUsageDays).findFirst().orElse(null);
        int revisions = OrderStateMachine.MAX_REVISIONS + (int) chosen.stream().filter(a -> "EXTRA_REVISION".equals(a.getKind())).count();
        return new Line("PACKAGE", k, k.getTitle(), k.getPlatform(), List.copyOf(k.getDeliverables()), price, rush != null ? rush : k.getDeliveryDays(), revisions, chosen,
                usage == null ? null : "Paid ads for " + usage + " days");
    }

    /** Promo codes and referral credits arrive with the promos module; until then no code exists and no one has credit. */
    private static Discount discountFor(String promoCode) {
        if (promoCode != null && !promoCode.isBlank()) {
            throw ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "That code doesn’t exist. Check the spelling.", "PROMO_NOT_FOUND", "promoCode",
                    "That code doesn’t exist. Check the spelling.");
        }
        return Discount.NONE;
    }

    // ---------- Quote and checkout (FR-30, FR-31, FR-60) ----------

    @Transactional(readOnly = true)
    public Quote quote(AuthUser me, Map<String, String> q) {
        requireBrand(me);
        String packageId = blankToNull(q.get("packageId"));
        String username = blankToNull(q.get("creatorUsername"));
        FieldCheck c = new FieldCheck();
        Long price = null;
        if (q.get("priceCents") != null && !q.get("priceCents").isBlank()) {
            String raw = q.get("priceCents").trim();
            if (!raw.matches("^\\d{1,12}$")) c.fail("priceCents", "Enter a price.");
            else {
                price = Long.parseLong(raw);
                if (price < Money.MIN_PRICE_CENTS) c.fail("priceCents", "The minimum price is ₹500.");
                else if (price > 500_000_000L) c.fail("priceCents", "The maximum price is ₹50,00,000.");
            }
        }
        if (packageId == null && (username == null || price == null) && !c.has("priceCents")) c.fail("packageId", "Send a packageId, or a creatorUsername with a priceCents.");
        if (q.get("addonIds") != null && q.get("addonIds").length() > 400) c.fail("addonIds", "Too many add-ons.");
        c.throwIfAny();

        BrandInfo brand = brands.infoOf(me.userId());
        CreatorProfile creator;
        com.webinger.collab.creator.web.CreatorDtos.PackageDto pkg = null;
        long priceCents;
        if (packageId != null) {
            PackageOffer offer = creators.packageForCheckout(packageId);
            creator = offer.owner();
            pkg = CreatorService.toPackage(offer.pkg());
            List<String> ids = q.get("addonIds") == null ? List.of() : List.of(q.get("addonIds").split(",")).stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
            priceCents = withAddons(offer.pkg(), ids).priceCents();
        } else {
            creator = creators.approvedCreator(username);
            priceCents = price;
        }
        FeeRates rates = fees.ratesFor(brand.plan());
        Money.Fees f = Money.fees(priceCents, rates);
        Money.Taxes t = taxesFor(f, brand, creator);
        Discount d = discountFor(blankToNull(q.get("promoCode")));
        OrderAmounts m = new OrderAmounts(priceCents, f.brandFeeCents(), f.creatorFeeCents(), t, d.promoCents(), d.creditCents());
        return new Quote(pkg != null ? "PACKAGE" : "CUSTOM_OFFER", creatorParty(creator), pkg, priceCents, f.brandFeeCents(), m.totalCents(), rates.brandFeeBps(),
                Catalog.CURRENCY, (int) OrderStateMachine.ACCEPT_WINDOW.toHours(), toTaxes(t), d, m.paidCents(), 0, null);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** POST /orders: a package order or a custom offer. Returns the new order's public id (for idempotent replays). */
    @Transactional
    public String create(AuthUser me, CreateOrderRequest input) {
        requireBrand(me);
        CreateOrderRequest body = input.validated();
        Line line;
        CreatorProfile creator;
        if (body.packageId() != null) {
            PackageOffer offer = creators.packageForCheckout(body.packageId());
            creator = offer.owner();
            line = withAddons(offer.pkg(), body.addonIds());
        } else {
            creator = creators.approvedCreator(body.creatorUsername());
            var o = body.offer();
            line = new Line("CUSTOM_OFFER", null, o.title(), o.platform(), o.deliverables(), o.priceCents(), o.deliveryDays(), OrderStateMachine.MAX_REVISIONS, List.of(),
                    null);
        }
        return placeOrder(me, creator, line, body.brief(), body.payment(), body.promoCode(), clock.instant()).getPublicId();
    }

    /**
     * Checkout core, shared with campaign hiring later (FR-42: same flow). The payment is verified for the exact
     * amount before the order exists, so a failed or forged payment never creates one (FR-30: authorised, not captured).
     */
    Order placeOrder(AuthUser me, CreatorProfile creator, Line line, BriefInput brief, PaymentService.PaymentProof proof, String promoCode, Instant now) {
        creators.assertTakingOrders(creator);
        Actor actor = actorOf(me);
        if (!actor.emailVerified()) throw new ApiException(HttpStatus.FORBIDDEN, "Verify your email before placing orders.", "EMAIL_NOT_VERIFIED");
        BrandInfo brand = brands.infoOf(me.userId());
        FeeRates rates = fees.ratesFor(brand.plan());
        Money.Fees f = Money.fees(line.priceCents(), rates);
        Money.Taxes t = taxesFor(f, brand, creator);
        Discount d = discountFor(promoCode);
        OrderAmounts amounts = new OrderAmounts(line.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), t, d.promoCents(), d.creditCents());
        OrderState state = OrderStateMachine.create(creator.getUserId(), actor, line.priceCents(), line.deliveryDays(), line.maxRevisions(), amounts, now);
        Verified paid = payments.verify(me, proof, amounts.paidCents(), "ORDER");
        return saveNewOrder(state, rates, line, brief, paid.method(), paid.methodLabel(), paid.razorpayPaymentId(), now, paid);
    }

    private Order saveNewOrder(OrderState state, FeeRates rates, Line line, BriefInput brief, String method, String methodLabel, String razorpayPaymentId, Instant now,
            Verified paid) {
        Order o = new Order();
        o.setPublicId(Ulid.next(now.toEpochMilli()));
        o.initialise(state, rates, now);
        o.setPackageId(line.pkg() == null ? null : line.pkg().getId());
        o.setKind(line.kind());
        o.setTitle(line.title());
        o.setPlatform(line.platform());
        o.setDeliverables(new ArrayList<>(line.deliverables()));
        o.setAddons(new ArrayList<>(line.addons().stream().map(a -> new Order.Addon(a.getAddonId(), a.getKind(), a.getTitle(), a.getPriceCents(), a.getUsageDays(),
                a.getRushDays())).toList()));
        o.setUsageRights(line.usageRights());
        o.setCurrency(Catalog.CURRENCY);
        o.setPaymentMethod(method);
        o.setPaymentMethodLabel(methodLabel);
        o.setRazorpayPaymentId(razorpayPaymentId);
        orders.save(o);
        events.save(new OrderEvent(o.getId(), "CREATE", null, Status.PENDING_ACCEPTANCE.name(), state.brandUserId(), null, now));
        OrderBrief b = new OrderBrief();
        b.setOrderId(o.getId());
        writeBrief(b, brief, now);
        briefs.save(b);
        if (paid != null) payments.markUsed(paid, o.getPublicId());
        payments.onPaymentAction("AUTHORIZE", razorpayPaymentId, o.getPaymentAmountCents(), o.getPublicId());
        return o;
    }

    private static void writeBrief(OrderBrief b, BriefInput in, Instant now) {
        b.setRequirements(in.requirements());
        b.setNeedsShipping(Boolean.TRUE.equals(in.needsShipping()));
        ShippingAddress a = Boolean.TRUE.equals(in.needsShipping()) ? in.shippingAddress() : null;
        b.setShipName(a == null ? null : a.name());
        b.setShipLine1(a == null ? null : a.line1());
        b.setShipLine2(a == null ? null : a.line2());
        b.setShipCity(a == null ? null : a.city());
        b.setShipPostalCode(a == null ? null : a.postalCode());
        b.setShipCountry(a == null ? null : a.country());
        b.setLinks(new ArrayList<>(in.links()));
        b.setReferenceFiles(new ArrayList<>(in.referenceFiles()));
        b.setUpdatedAt(now);
    }

    /** POST /orders with an Idempotency-Key: a retry returns the order the first request created. */
    @Transactional
    public Created createOnce(AuthUser me, String key, CreateOrderRequest body) {
        return created(idempotency.once(me, key, "POST", "/orders", 201, () -> create(me, body)));
    }

    /** An order action with an Idempotency-Key: a retry returns the order instead of acting twice. */
    @Transactional
    public Detail actOnce(AuthUser me, String key, String id, String action, java.util.function.Supplier<String> run) {
        return detail(me, idempotency.once(me, key, "POST", "/orders/" + id + "/" + action, 200, run));
    }

    @Transactional(readOnly = true)
    public Created created(String orderPublicId) {
        Order o = orders.findByPublicId(orderPublicId).orElseThrow();
        OrderAmounts m = o.amounts();
        return new Created(o.getPublicId(), o.getStatus().name(), o.getPriceCents(), o.getBrandFeeCents(), m.totalCents(), m.paidCents(), o.getCurrency(), o.getAcceptBy());
    }

    // ---------- Transitions ----------

    /** Runs one machine transition and stores everything it produced: state, event, ledger, payment action, dispute. */
    Order applyTransition(Order o, Event e, Actor actor, Instant now) {
        Result r = OrderStateMachine.transition(o.state(), e, actor, now);
        o.apply(r.order(), now);
        orders.saveAndFlush(o); // the @Version check happens here: approve and auto-approve cannot both win
        events.save(new OrderEvent(o.getId(), r.type().name(), r.from().name(), r.to().name(), actor.userId(), r.note(), now));
        User actingUser = actor.userId() == null ? null : users.get(actor.userId());
        ledger.post(o.getPublicId(), r.memo(), r.lines(), o.getCreatorUserId(), actingUser);
        if (r.paymentAction() != null) {
            long amount = r.paymentAction() == OrderStateMachine.PaymentAction.REFUND ? r.order().refundedCents() : o.getPaymentAmountCents();
            payments.onPaymentAction(r.paymentAction().name(), o.getRazorpayPaymentId(), amount, o.getPublicId());
        }
        return o;
    }

    /** POST /orders/{id}/accept|decline|cancel|approve|request-revision|dispute. Returns the order's public id. */
    @Transactional
    public String act(AuthUser me, String id, EventType type, String note, String reasonCode) {
        Order o = visibleOrder(me, id);
        Instant now = clock.instant();
        applyTransition(o, Event.withNote(type, note), actorOf(me), now);
        if (type == EventType.DISPUTE) {
            Dispute d = new Dispute();
            d.setOrderId(o.getId());
            d.setOpenedBy(me.userId());
            d.setReason(note == null ? "" : note);
            d.setReasonCode(reasonCode == null ? "OTHER" : reasonCode);
            d.setStatus("OPEN");
            d.setRespondBy(now.plus(Duration.ofHours(OrderInputs.DISPUTE_RESPONSE_HOURS)));
            d.setCreatedAt(now);
            disputes.save(d);
        }
        return o.getPublicId();
    }

    /** POST /orders/{id}/deliver (FR-34). */
    @Transactional
    public String deliver(AuthUser me, String id, DeliverRequest input) {
        Order o = visibleOrder(me, id);
        DeliverRequest body = input.validated();
        Instant now = clock.instant();
        int revisionNo = o.getRevisionCount();
        applyTransition(o, Event.of(EventType.DELIVER), actorOf(me), now);
        Delivery d = new Delivery();
        d.setPublicId(Ulid.next(now.toEpochMilli()));
        d.setOrderId(o.getId());
        d.setRevisionNo(revisionNo);
        d.setItems(new ArrayList<>(body.items().stream().map(i -> new Delivery.Item(i.type(), i.url(), i.name())).toList()));
        d.setNote(body.note());
        d.setSubmittedAt(now);
        deliveries.save(d);
        return o.getPublicId();
    }

    /** POST /orders/{id}/brief (FR-33): the brand edits the brief until delivery. */
    @Transactional
    public Detail updateBrief(AuthUser me, String id, BriefInput input) {
        Order o = visibleOrder(me, id);
        if (me.role() != Role.BRAND) throw new ApiException(HttpStatus.FORBIDDEN, "Only the brand can edit the brief.", "ROLE_NOT_ALLOWED");
        if (o.getStatus() != Status.PENDING_ACCEPTANCE && o.getStatus() != Status.IN_PROGRESS)
            throw new ApiException(HttpStatus.CONFLICT, "The brief can only change before delivery.", "INVALID_TRANSITION");
        FieldCheck c = new FieldCheck();
        BriefInput b = input.validated(c, "");
        c.throwIfAny();
        OrderBrief row = briefs.findById(o.getId()).orElseThrow();
        writeBrief(row, b, clock.instant());
        return detail(me, o.getPublicId());
    }

    // ---------- Scheduled jobs (CLAUDE.md §4.3) ----------

    public record JobCounts(int expired, int autoApproved) {}

    /**
     * Expires unaccepted orders and auto-approves deliveries whose review window passed. Each order runs in its own
     * transaction; an order changed at the same moment by its brand is skipped and picked up next time.
     */
    public JobCounts runDueJobs() {
        Instant now = clock.instant();
        int[] counts = new int[2];
        for (Long id : orders.findDue(now, Status.PENDING_ACCEPTANCE, Status.DELIVERED)) {
            try {
                EventType done = tx.execute(s -> {
                    Order o = orders.findById(id).orElseThrow();
                    EventType due = OrderStateMachine.dueSystemEvent(o.state(), now);
                    if (due != null) applyTransition(o, Event.of(due), Actor.SYSTEM, now);
                    return due;
                });
                if (done == EventType.EXPIRE) counts[0]++;
                else if (done == EventType.AUTO_APPROVE) counts[1]++;
            } catch (OptimisticLockingFailureException e) {
                // Someone acted on the order at the same time; the next run sees its new state.
            }
        }
        return new JobCounts(counts[0], counts[1]);
    }

    // ---------- Reviews (FR-38) ----------

    @Transactional
    public OrderDtos.ReviewDto review(AuthUser me, String orderId, ReviewRequest input) {
        Order o = visibleOrder(me, orderId);
        if (me.role() != Role.BRAND) throw new ApiException(HttpStatus.FORBIDDEN, "Only the brand can review an order.", "ROLE_NOT_ALLOWED");
        if (o.getStatus() != Status.COMPLETED) throw new ApiException(HttpStatus.CONFLICT, "You can review an order once it is completed.", "ORDER_NOT_COMPLETED");
        if (reviews.findByOrderId(o.getId()).isPresent()) throw new ApiException(HttpStatus.CONFLICT, "You already reviewed this order.", "ALREADY_REVIEWED");
        ReviewRequest body = input.validated();
        Instant now = clock.instant();
        Review r = new Review();
        r.setPublicId(Ulid.next(now.toEpochMilli()));
        r.setOrderId(o.getId());
        r.setCreatorUserId(o.getCreatorUserId());
        r.setBrandUserId(me.userId());
        r.setBrandName(brandParty(o.getBrandUserId(), brands.infoOf(List.of(o.getBrandUserId()))).name());
        r.setRating(body.rating());
        r.setComment(body.comment());
        r.setCreatedAt(now);
        reviews.save(r);
        return toReview(r);
    }

    @Transactional
    public OrderDtos.ReviewDto reply(AuthUser me, String reviewId, String reply) {
        Review r = reviews.findByPublicId(reviewId == null ? "" : reviewId).orElse(null);
        if (r == null || me.role() != Role.CREATOR || !r.getCreatorUserId().equals(me.userId()))
            throw new ApiException(HttpStatus.NOT_FOUND, "No such review.", "REVIEW_NOT_FOUND");
        if (r.getCreatorReply() != null) throw new ApiException(HttpStatus.CONFLICT, "You already replied to this review.", "ALREADY_REPLIED");
        r.setCreatorReply(reply);
        r.setRepliedAt(clock.instant());
        return toReview(r);
    }

    private static OrderDtos.ReviewDto toReview(Review r) {
        return new OrderDtos.ReviewDto(r.getPublicId(), r.getRating(), r.getComment(), r.getBrandName(), r.getCreatedAt(), r.getCreatorReply(), r.getRepliedAt());
    }

    // ---------- Reading ----------

    private Party creatorParty(CreatorProfile p) {
        return p == null ? new Party("Creator", null, null) : new Party(p.getDisplayName(), p.getPhotoUrl(), p.getUsername());
    }

    private Party brandParty(Long brandUserId, Map<Long, BrandInfo> info) {
        BrandInfo b = info.get(brandUserId);
        String name = b != null && b.companyName() != null ? b.companyName() : users.get(brandUserId).getName();
        return new Party(name, b == null ? null : b.logoUrl(), null);
    }

    private static OrderDtos.Taxes toTaxes(Money.Taxes t) {
        return new OrderDtos.Taxes(t.intraState(), t.creatorGstRegistered(), t.creatorGstCents(), t.brandFeeGstCents(), t.creatorFeeGstCents(), t.tdsCents(), t.tcsCents());
    }

    static MoneyDto moneyOf(Order o) {
        OrderAmounts m = o.amounts();
        return new MoneyDto(o.getCurrency(), m.priceCents(), m.brandFeeCents(), m.totalCents(), m.creatorFeeCents(), m.creatorPayoutCents(), toTaxes(m.taxes()),
                new Discount(o.getPromoCode(), o.getPromoCents(), o.getCreditCents()), m.paidCents());
    }

    /** Machine events the viewer may fire now, plus brief, review and reply. */
    private List<String> actionsFor(Order o, AuthUser me, Actor actor, Instant now, Review review) {
        List<String> out = new ArrayList<>();
        for (EventType e : OrderStateMachine.allowedEvents(o.state(), actor, now)) if (ACTIONS.containsKey(e)) out.add(ACTIONS.get(e));
        if (me.role() == Role.BRAND && (o.getStatus() == Status.PENDING_ACCEPTANCE || o.getStatus() == Status.IN_PROGRESS)) out.add("EDIT_BRIEF");
        if (me.role() == Role.BRAND && o.getStatus() == Status.COMPLETED && review == null) out.add("REVIEW");
        if (me.role() == Role.CREATOR && review != null && review.getCreatorReply() == null) out.add("REPLY");
        return out;
    }

    private record Context(Map<Long, BrandInfo> brands, Map<Long, CreatorProfile> creators, Actor actor, Instant now) {}

    private Context context(AuthUser me, List<Order> list) {
        Set<Long> brandIds = new HashSet<>();
        Set<Long> creatorIds = new HashSet<>();
        list.forEach(o -> {
            brandIds.add(o.getBrandUserId());
            creatorIds.add(o.getCreatorUserId());
        });
        return new Context(brands.infoOf(brandIds), creators.profilesOfUsers(creatorIds), actorOf(me), clock.instant());
    }

    private Summary summary(Order o, AuthUser me, Context ctx, Review review) {
        Deadline next = switch (o.getStatus()) {
            case PENDING_ACCEPTANCE -> new Deadline("ACCEPT", o.getAcceptBy());
            case IN_PROGRESS -> o.getDueAt() == null ? null : new Deadline("DUE", o.getDueAt());
            case DELIVERED -> o.getReviewBy() == null ? null : new Deadline("REVIEW", o.getReviewBy());
            default -> null;
        };
        Party brand = brandParty(o.getBrandUserId(), ctx.brands());
        Party creator = creatorParty(ctx.creators().get(o.getCreatorUserId()));
        boolean late = o.getStatus() == Status.IN_PROGRESS && o.getDueAt() != null && o.getDueAt().isBefore(ctx.now());
        boolean needsAction = actionsFor(o, me, ctx.actor(), ctx.now(), review).stream().anyMatch(NEEDS_ACTION::contains);
        return new Summary(o.getPublicId(), o.getStatus().name(), o.getCloseReason() == null ? null : o.getCloseReason().name(), o.getKind(), o.getTitle(), o.getPlatform(),
                me.role() == Role.CREATOR ? brand : creator, brand, creator, moneyOf(o), next, late, needsAction, o.getCreatedAt(), o.getUpdatedAt());
    }

    /** GET /orders: the caller's orders (admins: all), by urgency — waiting on the caller, nearest deadline, newest activity. */
    @Transactional(readOnly = true)
    public OrderDtos.Page list(AuthUser me, Map<String, String> q) {
        List<Order> mine = me.role() == Role.ADMIN ? orders.findAll()
                : me.role() == Role.BRAND ? orders.findByBrandUserId(me.userId()) : orders.findByCreatorUserId(me.userId());
        List<String> wanted = q.get("status") == null ? List.of()
                : List.of(q.get("status").split(",")).stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        for (String s : wanted) {
            if (!STATUSES.contains(s)) throw ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "Unknown status " + s + ".", "VALIDATION_FAILED", "status", "Unknown status.");
        }
        int page = Math.max(0, parseIntOr(q.get("page"), 0));
        int size = Math.min(50, Math.max(1, parseIntOr(q.get("size"), 20)));
        Context ctx = context(me, mine);
        Map<Long, Review> reviewed = new java.util.HashMap<>();
        for (Order o : mine) if (o.getStatus() == Status.COMPLETED) reviews.findByOrderId(o.getId()).ifPresent(r -> reviewed.put(o.getId(), r));
        List<Summary> rows = mine.stream().filter(o -> wanted.isEmpty() || wanted.contains(o.getStatus().name())).map(o -> summary(o, me, ctx, reviewed.get(o.getId())))
                .sorted(Comparator.comparingInt((Summary s) -> s.needsAction() ? 0 : s.nextDeadline() != null ? 1 : 2)
                        .thenComparing(s -> s.nextDeadline() == null ? Instant.MAX : s.nextDeadline().at())
                        .thenComparing(Comparator.comparing(Summary::updatedAt).reversed()))
                .toList();
        Map<String, Integer> counts = new LinkedHashMap<>();
        STATUSES.forEach(s -> counts.put(s, 0));
        mine.forEach(o -> counts.merge(o.getStatus().name(), 1, Integer::sum));
        int from = Math.min(page * size, rows.size());
        return new OrderDtos.Page(rows.subList(from, Math.min(from + size, rows.size())), page, size, rows.size(), (rows.size() + size - 1) / size, counts, ctx.now());
    }

    private static int parseIntOr(String s, int fallback) {
        try {
            return s == null ? fallback : Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    /** GET /orders/{id} and the answer to every action. */
    @Transactional(readOnly = true)
    public Detail detail(AuthUser me, String id) {
        Order o = visibleOrder(me, id);
        Context ctx = context(me, List.of(o));
        Review review = reviews.findByOrderId(o.getId()).orElse(null);
        Summary s = summary(o, me, ctx, review);
        OrderBrief b = briefs.findById(o.getId()).orElse(null);
        OrderDtos.Brief brief = b == null ? new OrderDtos.Brief("", false, null, List.of(), List.of())
                : new OrderDtos.Brief(b.getRequirements(), b.isNeedsShipping(),
                        b.isNeedsShipping() && b.getShipName() != null
                                ? new ShippingAddress(b.getShipName(), b.getShipLine1(), b.getShipLine2(), b.getShipCity(), b.getShipPostalCode(), b.getShipCountry())
                                : null,
                        List.copyOf(b.getLinks()), List.copyOf(b.getReferenceFiles()));
        List<OrderDtos.DeliveryDto> delivered = deliveries.findByOrderIdOrderByIdDesc(o.getId()).stream()
                .map(d -> new OrderDtos.DeliveryDto(d.getPublicId(), d.getRevisionNo(),
                        d.getItems().stream().map(i -> new OrderDtos.DeliveryItem(i.getType(), i.getUrl(), i.getName(), null)).toList(), d.getNote(), d.getSubmittedAt()))
                .toList();
        List<OrderEvent> evs = events.findByOrderIdOrderByIdAsc(o.getId());
        Map<Long, User> actors = users.getAll(evs.stream().map(OrderEvent::getActorId).filter(x -> x != null).distinct().toList());
        List<OrderDtos.EventView> timeline = evs.stream().map(e -> new OrderDtos.EventView(e.getType(), e.getFromStatus(), e.getToStatus(),
                e.getActorId() == null || !actors.containsKey(e.getActorId()) ? "SYSTEM" : actors.get(e.getActorId()).getRole().name(), e.getNote(), e.getCreatedAt())).toList();
        OrderDtos.DisputeView dispute = disputes.findByOrderId(o.getId()).map(d -> new OrderDtos.DisputeView(d.getReason(), d.getStatus(), d.getCreatedAt(),
                d.getResolution(), d.getRefundCents(), d.getReasonCode(), d.getRespondBy(), null, null, List.of(), null, null)).orElse(null);
        BrandInfo brandInfo = ctx.brands().get(o.getBrandUserId());
        CreatorProfile creator = ctx.creators().get(o.getCreatorUserId());
        String creatorGstin = o.isCreatorGstRegistered() && creator != null ? payoutAccounts.verifiedGstinOf(creator.getId()).orElse(null) : null;
        OrderDtos.TaxParties parties = new OrderDtos.TaxParties(Money.PLATFORM_GSTIN, Money.PLATFORM_STATE, brandInfo == null ? null : brandInfo.gstin(),
                brandInfo == null ? null : brandInfo.state(), creatorGstin);
        String packageId = o.getPackageId() == null ? null : creators.packagePublicId(o.getPackageId());
        List<AddonDto> addons = o.getAddons().stream().map(a -> new AddonDto(a.getAddonId(), a.getKind(), a.getTitle(), a.getPriceCents(), a.getUsageDays(), a.getRushDays()))
                .toList();
        return Detail.of(s, packageId, null, "", List.copyOf(o.getDeliverables()), o.getDeliveryDays(),
                new OrderDtos.Payment(o.getPaymentStatus().name(), o.getPaymentAmountCents(), o.getPaymentRefundedCents(), o.getPaymentMethod(), o.getPaymentMethodLabel()),
                o.getAcceptBy(), o.getDueAt(), o.getReviewBy(), o.getRevisionCount(), o.getMaxRevisions(), brief, delivered, timeline, dispute,
                review == null ? null : toReview(review), actionsFor(o, me, ctx.actor(), ctx.now(), review), ctx.now(), parties, addons, o.getUsageRights());
    }

    // ---------- Brand dashboard (FR-71) ----------

    public record DeliveredPost(String orderId, String orderTitle, String creatorName, String url, Instant deliveredAt, Object metrics) {}

    public record MonthSpend(String month, long cents) {}

    public record BrandStats(String currency, long spentCents, long inEscrowCents, long authorisedCents, Map<String, Integer> ordersByStatus,
            List<DeliveredPost> deliveredPosts, int openCampaigns, int pendingApplications, List<MonthSpend> spendByMonth) {}

    /** Spend after refunds, escrow, holds, orders by status, delivered post links and the last 6 months' spend. Campaigns come later. */
    @Transactional(readOnly = true)
    public BrandStats brandStats(AuthUser me) {
        if (me.role() != Role.BRAND) throw new ApiException(HttpStatus.FORBIDDEN, "Only brand accounts have a company profile.", "ROLE_NOT_ALLOWED");
        List<Order> mine = orders.findByBrandUserId(me.userId());
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        STATUSES.forEach(s -> byStatus.put(s, 0));
        long spent = 0, escrow = 0, held = 0;
        for (Order o : mine) {
            byStatus.merge(o.getStatus().name(), 1, Integer::sum);
            long paid = o.amounts().paidCents();
            var ps = o.getPaymentStatus();
            if (ps == OrderStateMachine.PaymentStatus.CAPTURED || ps == OrderStateMachine.PaymentStatus.REFUNDED) spent += paid - o.getPaymentRefundedCents();
            if (o.getStatus() == Status.IN_PROGRESS || o.getStatus() == Status.DELIVERED || o.getStatus() == Status.DISPUTED) escrow += paid;
            if (o.getStatus() == Status.PENDING_ACCEPTANCE) held += paid;
        }
        YearMonth thisMonth = YearMonth.now(clock.withZone(ZoneOffset.UTC));
        Map<YearMonth, Long> months = new LinkedHashMap<>();
        for (int i = 5; i >= 0; i--) months.put(thisMonth.minusMonths(i), 0L);
        Map<Long, Order> byId = new java.util.HashMap<>();
        mine.forEach(o -> byId.put(o.getId(), o));
        if (!byId.isEmpty()) {
            for (OrderEvent e : events.findByOrderIdInAndTypeIn(byId.keySet(), Set.of("ACCEPT", "ADMIN_REFUND", "ADMIN_CANCEL"))) {
                YearMonth m = YearMonth.from(e.getCreatedAt().atZone(ZoneOffset.UTC));
                if (!months.containsKey(m)) continue;
                Order o = byId.get(e.getOrderId());
                long delta = "ACCEPT".equals(e.getType()) ? o.amounts().paidCents() : -o.getPaymentRefundedCents();
                months.merge(m, delta, Long::sum);
            }
        }
        Context ctx = context(me, mine);
        List<DeliveredPost> posts = new ArrayList<>();
        for (Order o : mine) {
            for (Delivery d : deliveries.findByOrderIdOrderByIdDesc(o.getId())) {
                for (Delivery.Item i : d.getItems()) {
                    if ("POST_URL".equals(i.getType())) posts.add(new DeliveredPost(o.getPublicId(), o.getTitle(), creatorParty(ctx.creators().get(o.getCreatorUserId())).name(),
                            i.getUrl(), d.getSubmittedAt(), null));
                }
            }
        }
        posts.sort(Comparator.comparing(DeliveredPost::deliveredAt).reversed());
        return new BrandStats(Catalog.CURRENCY, spent, escrow, held, byStatus, posts.stream().limit(20).toList(), 0, 0,
                months.entrySet().stream().map(x -> new MonthSpend(x.getKey().toString(), x.getValue())).toList());
    }

    // ---------- Demo data ----------

    /** Demo only: places an order as if paid at `at` (no Checkout), then runs the given transitions at their times. */
    @Transactional
    public Order seedOrder(AuthUser brand, CreatorProfile creator, CreatorPackage pkg, String requirements, Instant at, List<SeedStep> steps) {
        Line line = withAddons(pkg, List.of());
        BrandInfo info = brands.infoOf(brand.userId());
        FeeRates rates = fees.ratesFor(info.plan());
        Money.Fees f = Money.fees(line.priceCents(), rates);
        Money.Taxes t = taxesFor(f, info, creator);
        OrderAmounts amounts = new OrderAmounts(line.priceCents(), f.brandFeeCents(), f.creatorFeeCents(), t, 0, 0);
        OrderState state = OrderStateMachine.create(creator.getUserId(), actorOf(brand), line.priceCents(), line.deliveryDays(), line.maxRevisions(), amounts, at);
        BriefInput brief = new BriefInput(requirements, false, null, List.of(), List.of());
        Order o = saveNewOrder(state, rates, line, brief, "UPI", "UPI · saltbay@okhdfcbank", "pay_demo" + Long.toHexString(at.toEpochMilli()), at, null);
        for (SeedStep s : steps) {
            if (s.event().type() == EventType.DELIVER) {
                Delivery d = new Delivery();
                d.setPublicId(Ulid.next(s.at().toEpochMilli()));
                d.setOrderId(o.getId());
                d.setRevisionNo(o.getRevisionCount());
                d.setItems(new ArrayList<>(List.of(new Delivery.Item("POST_URL", "https://example.com/p/" + o.getPublicId().toLowerCase(), "Live post"))));
                d.setSubmittedAt(s.at());
                deliveries.save(d);
            }
            applyTransition(o, s.event(), s.actor(), s.at());
            if (s.event().type() == EventType.DISPUTE) {
                Dispute d = new Dispute();
                d.setOrderId(o.getId());
                d.setOpenedBy(brand.userId());
                d.setReason(s.event().note());
                d.setReasonCode("NOT_AS_BRIEFED");
                d.setStatus("OPEN");
                d.setRespondBy(s.at().plus(Duration.ofHours(OrderInputs.DISPUTE_RESPONSE_HOURS)));
                d.setCreatedAt(s.at());
                disputes.save(d);
            }
        }
        return o;
    }

    public record SeedStep(Event event, Actor actor, Instant at) {}
}
