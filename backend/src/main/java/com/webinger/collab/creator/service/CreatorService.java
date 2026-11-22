package com.webinger.collab.creator.service;

import static com.webinger.collab.creator.service.CreatorInputs.MAX_ACTIVE_PACKAGES;
import static com.webinger.collab.creator.service.CreatorInputs.MAX_PORTFOLIO_ITEMS;

import com.webinger.collab.audit.AuditService;
import com.webinger.collab.common.Catalog;
import com.webinger.collab.common.Ulid;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.common.web.FieldCheck;
import com.webinger.collab.common.web.FieldErrorDto;
import com.webinger.collab.creator.domain.CreatorPackage;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.domain.PortfolioItem;
import com.webinger.collab.creator.domain.SocialAccount;
import com.webinger.collab.creator.repository.CreatorProfileRepository;
import com.webinger.collab.creator.repository.PackageRepository;
import com.webinger.collab.creator.repository.PortfolioItemRepository;
import com.webinger.collab.creator.repository.SocialAccountRepository;
import com.webinger.collab.creator.service.CreatorInputs.AddonInput;
import com.webinger.collab.creator.service.CreatorInputs.AvailabilityInput;
import com.webinger.collab.creator.service.CreatorInputs.PackageInput;
import com.webinger.collab.creator.service.CreatorInputs.PackagePatch;
import com.webinger.collab.creator.service.CreatorInputs.PortfolioInput;
import com.webinger.collab.creator.service.CreatorInputs.ProfileInput;
import com.webinger.collab.creator.service.CreatorInputs.SocialInput;
import com.webinger.collab.creator.web.CreatorDtos.AddonDto;
import com.webinger.collab.creator.web.CreatorDtos.AvailabilityDto;
import com.webinger.collab.creator.web.CreatorDtos.ChecklistDto;
import com.webinger.collab.creator.web.CreatorDtos.CreatorMeDto;
import com.webinger.collab.creator.web.CreatorDtos.CreatorStatsDto;
import com.webinger.collab.creator.web.CreatorDtos.OwnPackageDto;
import com.webinger.collab.creator.web.CreatorDtos.PackageDto;
import com.webinger.collab.creator.web.CreatorDtos.PortfolioItemDto;
import com.webinger.collab.creator.web.CreatorDtos.SocialAccountDto;
import com.webinger.collab.creator.web.CreatorDtos.VettingItemDto;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.domain.Role;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.service.UserService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creator workspace (FR-10 – FR-16, FR-70) and vetting (FR-80), ported from the mock's
 * handlers/creatorMe.ts, handlers/admin.ts (vetting) and handlers/retention.ts (availability).
 */
@Service
public class CreatorService {
    /** Every order status, for the dashboard counts (orders arrive with the orders module). */
    public static final List<String> ORDER_STATUSES = List.of("PENDING_ACCEPTANCE", "IN_PROGRESS", "DELIVERED", "COMPLETED", "DISPUTED", "REFUNDED", "CLOSED");

    private final CreatorProfileRepository profiles;
    private final SocialAccountRepository socials;
    private final PackageRepository packages;
    private final PortfolioItemRepository portfolio;
    private final UserService users;
    private final AuditService audit;
    private final Clock clock;

    public CreatorService(CreatorProfileRepository profiles, SocialAccountRepository socials, PackageRepository packages, PortfolioItemRepository portfolio,
            UserService users, AuditService audit, Clock clock) {
        this.profiles = profiles;
        this.socials = socials;
        this.packages = packages;
        this.portfolio = portfolio;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    /** The signed-in creator's profile, or 403 for other roles. */
    CreatorProfile own(AuthUser me) {
        if (me.role() != Role.CREATOR) throw new ApiException(HttpStatus.FORBIDDEN, "Only creator accounts have a creator profile.", "ROLE_NOT_ALLOWED");
        return profiles.findByUserId(me.userId()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Creator profile not found.", "CREATOR_NOT_FOUND"));
    }

    private void touch(CreatorProfile p) {
        p.setUpdatedAt(clock.instant());
    }

    // ---------- Views shared with search, vetting and saved lists ----------

    public static SocialAccountDto toSocial(SocialAccount s) {
        return new SocialAccountDto(s.getPublicId(), s.getPlatform(), s.getHandle(), s.getUrl(), s.getFollowers(), s.getEngagementRateBps(), s.getVerifiedAt() != null);
    }

    static List<AddonDto> toAddons(CreatorPackage k) {
        return k.getAddons().stream().map(a -> new AddonDto(a.getAddonId(), a.getKind(), a.getTitle(), a.getPriceCents(), a.getUsageDays(), a.getRushDays())).toList();
    }

    public static OwnPackageDto toOwnPackage(CreatorPackage k) {
        return new OwnPackageDto(k.getPublicId(), k.getPlatform(), k.getTitle(), k.getDescription(), List.copyOf(k.getDeliverables()), k.getPriceCents(),
                k.getCurrency(), k.getDeliveryDays(), k.isActive(), toAddons(k));
    }

    public static PackageDto toPackage(CreatorPackage k) {
        return new PackageDto(k.getPublicId(), k.getPlatform(), k.getTitle(), k.getDescription(), List.copyOf(k.getDeliverables()), k.getPriceCents(),
                k.getCurrency(), k.getDeliveryDays(), toAddons(k));
    }

    public static PortfolioItemDto toPortfolioItem(PortfolioItem i) {
        return new PortfolioItemDto(i.getPublicId(), i.getType(), i.getUrl(), i.getCaption());
    }

    public static AvailabilityDto availabilityOf(CreatorProfile p, LocalDate today) {
        return p.isAwayOn(today) ? new AvailabilityDto(true, p.getAwayUntil(), p.getAwayMessage()) : AvailabilityDto.AVAILABLE;
    }

    List<SocialAccountDto> socialsOf(CreatorProfile p) {
        return socials.findByCreatorId(p.getId()).stream().sorted(Comparator.comparingLong(SocialAccount::getFollowers).reversed()).map(CreatorService::toSocial).toList();
    }

    /** Active first, then cheapest first. */
    List<OwnPackageDto> ownPackagesOf(CreatorProfile p) {
        return packages.findByCreatorId(p.getId()).stream()
                .sorted(Comparator.comparing((CreatorPackage k) -> !k.isActive()).thenComparingLong(CreatorPackage::getPriceCents))
                .map(CreatorService::toOwnPackage)
                .toList();
    }

    List<PortfolioItemDto> portfolioOf(CreatorProfile p) {
        return portfolio.findByCreatorIdOrderBySortOrderAsc(p.getId()).stream().map(CreatorService::toPortfolioItem).toList();
    }

    ChecklistDto checklistOf(CreatorProfile p) {
        boolean profile = p.getUsername() != null && p.getDisplayName() != null && p.getBio() != null && p.getCity() != null && p.getCountry() != null
                && !p.getNiches().isEmpty() && !p.getLanguages().isEmpty();
        return new ChecklistDto(profile, p.getPhotoUrl() != null, !socials.findByCreatorId(p.getId()).isEmpty(), packages.countByCreatorIdAndActiveTrue(p.getId()) > 0,
                portfolio.countByCreatorId(p.getId()) > 0, !"NOT_STARTED".equals(p.getPayoutStatus()));
    }

    public CreatorMeDto toCreatorMe(CreatorProfile p) {
        return new CreatorMeDto(availabilityOf(p, today()), p.getUsername(), p.getDisplayName(), p.getBio(), p.getCity(), p.getCountry(), p.getGender(),
                p.getBirthYear(), List.copyOf(p.getLanguages()), List.copyOf(p.getNiches()), p.getPhotoUrl(), List.copyOf(p.getCoverUrls()), p.getVettingStatus(),
                p.getRejectionReason(), p.getSubmittedAt(), socialsOf(p), ownPackagesOf(p), portfolioOf(p), p.getPayoutStatus(), checklistOf(p),
                p.getApprovedAt() != null);
    }

    // ---------- Profile (FR-10) ----------

    @Transactional(readOnly = true)
    public CreatorMeDto me(AuthUser me) {
        return toCreatorMe(own(me));
    }

    @Transactional
    public CreatorMeDto updateProfile(AuthUser me, ProfileInput input) {
        CreatorProfile p = own(me);
        ProfileInput body = input.validated(LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC).getYear());
        if (!body.username().equals(p.getUsername())) {
            if (p.getApprovedAt() != null) {
                throw ApiException.field(HttpStatus.CONFLICT, "Your username cannot change after approval, because brands already link to it.", "USERNAME_LOCKED",
                        "username", "Locked after approval.");
            }
            if (profiles.existsByUsernameAndUserIdNot(body.username(), p.getUserId())) throw usernameTaken();
        }
        p.setUsername(body.username());
        p.setDisplayName(body.displayName());
        p.setBio(body.bio());
        p.setCity(body.city());
        p.setCountry(body.country());
        p.setGender(body.gender());
        p.setBirthYear(body.birthYear());
        p.setLanguages(new ArrayList<>(body.languages()));
        p.setNiches(new ArrayList<>(body.niches()));
        p.setPhotoUrl(body.photoUrl());
        p.setCoverUrls(new ArrayList<>(body.coverUrls()));
        touch(p);
        try {
            profiles.saveAndFlush(p);
        } catch (DataIntegrityViolationException e) {
            throw usernameTaken(); // another creator took it between the check and the save
        }
        users.setName(p.getUserId(), body.displayName());
        return toCreatorMe(p);
    }

    private static ApiException usernameTaken() {
        return ApiException.field(HttpStatus.CONFLICT, "That username is taken.", "USERNAME_TAKEN", "username", "That username is taken. Try another.");
    }

    // ---------- Social accounts (FR-11) ----------

    @Transactional
    public SocialAccountDto addSocial(AuthUser me, SocialInput input) {
        CreatorProfile p = own(me);
        SocialInput body = input.validated();
        if (socials.existsByCreatorIdAndPlatform(p.getId(), body.platform())) {
            throw ApiException.field(HttpStatus.CONFLICT, "You already linked an account on that platform. Remove it first to change it.", "PLATFORM_EXISTS",
                    "platform", "Already linked.");
        }
        Instant now = clock.instant();
        SocialAccount s = new SocialAccount();
        s.setPublicId(Ulid.next(now.toEpochMilli()));
        s.setCreatorId(p.getId());
        s.setPlatform(body.platform());
        s.setHandle(body.handle());
        s.setFollowers(body.followers());
        s.setCreatedAt(now);
        socials.save(s);
        touch(p);
        return toSocial(s);
    }

    @Transactional
    public void removeSocial(AuthUser me, String id) {
        CreatorProfile p = own(me);
        SocialAccount s = socials.findByPublicIdAndCreatorId(id, p.getId()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No such social account.", "NOT_FOUND"));
        socials.delete(s);
        touch(p);
    }

    // ---------- Packages (FR-12, FR-13) ----------

    private CreatorPackage ownPackage(CreatorProfile p, String id) {
        return packages.findByPublicIdAndCreatorId(id, p.getId()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No such package.", "NOT_FOUND"));
    }

    private static ApiException limitError() {
        return ApiException.field(HttpStatus.CONFLICT, "You can have at most " + MAX_ACTIVE_PACKAGES + " active packages. Switch one off first.", "PACKAGE_LIMIT",
                "active", "At most " + MAX_ACTIVE_PACKAGES + " active packages.");
    }

    /** Gives new add-ons ids (stable across edits: by id, else by kind); rush must be faster than the package. */
    private List<CreatorPackage.Addon> normaliseAddons(List<AddonInput> list, int deliveryDays, List<CreatorPackage.Addon> existing) {
        List<CreatorPackage.Addon> out = new ArrayList<>();
        for (AddonInput a : list) {
            if ("RUSH".equals(a.kind()) && a.rushDays() != null && a.rushDays() >= deliveryDays) {
                throw ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "Rush delivery must be faster than the package.", "VALIDATION_FAILED", "addons",
                        "Rush delivery must be under " + deliveryDays + " days.");
            }
            String id = existing.stream().filter(e -> e.getAddonId().equals(a.id())).map(CreatorPackage.Addon::getAddonId).findFirst()
                    .or(() -> existing.stream().filter(e -> e.getKind().equals(a.kind())).map(CreatorPackage.Addon::getAddonId).findFirst())
                    .orElseGet(() -> Ulid.next(clock.instant().toEpochMilli()));
            out.add(new CreatorPackage.Addon(id, a.kind(), a.title(), a.priceCents(), a.usageDays(), a.rushDays()));
        }
        return out;
    }

    @Transactional
    public OwnPackageDto createPackage(AuthUser me, PackageInput input) {
        CreatorProfile p = own(me);
        PackageInput body = input.validated();
        if (body.active() && packages.countByCreatorIdAndActiveTrue(p.getId()) >= MAX_ACTIVE_PACKAGES) throw limitError();
        Instant now = clock.instant();
        CreatorPackage k = new CreatorPackage();
        k.setPublicId(Ulid.next(now.toEpochMilli()));
        k.setCreatorId(p.getId());
        k.setPlatform(body.platform());
        k.setTitle(body.title());
        k.setDescription(body.description());
        k.setDeliverables(new ArrayList<>(body.deliverables()));
        k.setPriceCents(body.priceCents());
        k.setCurrency(Catalog.CURRENCY);
        k.setDeliveryDays(body.deliveryDays());
        k.setActive(body.active());
        k.setAddons(normaliseAddons(body.addons(), body.deliveryDays(), List.of()));
        k.setCreatedAt(now);
        k.setUpdatedAt(now);
        packages.save(k);
        touch(p);
        return toOwnPackage(k);
    }

    @Transactional
    public OwnPackageDto updatePackage(AuthUser me, String id, PackagePatch input) {
        CreatorProfile p = own(me);
        CreatorPackage k = ownPackage(p, id);
        PackagePatch patch = input.validated();
        if (Boolean.TRUE.equals(patch.active()) && !k.isActive() && packages.countByCreatorIdAndActiveTrue(p.getId()) >= MAX_ACTIVE_PACKAGES) throw limitError();
        if (patch.platform() != null) k.setPlatform(patch.platform());
        if (patch.title() != null) k.setTitle(patch.title());
        if (patch.description() != null) k.setDescription(patch.description());
        if (patch.deliverables() != null) k.setDeliverables(new ArrayList<>(patch.deliverables()));
        if (patch.priceCents() != null) k.setPriceCents(patch.priceCents());
        if (patch.deliveryDays() != null) k.setDeliveryDays(patch.deliveryDays());
        if (patch.active() != null) k.setActive(patch.active());
        if (patch.addons() != null) {
            k.setAddons(normaliseAddons(patch.addons(), k.getDeliveryDays(), k.getAddons()));
        } else if (patch.deliveryDays() != null) {
            // A shorter delivery time can make the rush add-on pointless: drop it.
            k.getAddons().removeIf(a -> "RUSH".equals(a.getKind()) && a.getRushDays() != null && a.getRushDays() >= k.getDeliveryDays());
        }
        k.setUpdatedAt(clock.instant());
        touch(p);
        return toOwnPackage(k);
    }

    /**
     * Deletes a package. Once the orders module exists, a package with orders can only be switched off
     * (409 PACKAGE_HAS_ORDERS, as in the mock); until then no package has orders.
     */
    @Transactional
    public void deletePackage(AuthUser me, String id) {
        CreatorProfile p = own(me);
        packages.delete(ownPackage(p, id));
        touch(p);
    }

    // ---------- Portfolio (FR-14) ----------

    @Transactional
    public PortfolioItemDto addPortfolioItem(AuthUser me, PortfolioInput input) {
        CreatorProfile p = own(me);
        PortfolioInput body = input.validated();
        List<PortfolioItem> mine = portfolio.findByCreatorIdOrderBySortOrderAsc(p.getId());
        if (mine.size() >= MAX_PORTFOLIO_ITEMS) {
            throw new ApiException(HttpStatus.CONFLICT, "Your portfolio can hold " + MAX_PORTFOLIO_ITEMS + " items. Remove one first.", "PORTFOLIO_LIMIT");
        }
        Instant now = clock.instant();
        PortfolioItem i = new PortfolioItem();
        i.setPublicId(Ulid.next(now.toEpochMilli()));
        i.setCreatorId(p.getId());
        i.setType(body.type());
        i.setUrl(body.url());
        i.setCaption(body.caption());
        i.setSortOrder(mine.stream().mapToInt(PortfolioItem::getSortOrder).max().orElse(-1) + 1);
        i.setCreatedAt(now);
        portfolio.save(i);
        touch(p);
        return toPortfolioItem(i);
    }

    @Transactional
    public void removePortfolioItem(AuthUser me, String id) {
        CreatorProfile p = own(me);
        PortfolioItem i = portfolio.findByPublicIdAndCreatorId(id, p.getId()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No such portfolio item.", "NOT_FOUND"));
        portfolio.delete(i);
        touch(p);
    }

    // ---------- Submit for review and vetting (FR-16, FR-80) ----------

    private static final Map<String, String> MISSING = missing();

    private static Map<String, String> missing() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("profile", "Complete your profile: username, bio, location, niches and languages.");
        m.put("photo", "Add a profile photo.");
        m.put("socials", "Link at least one social account.");
        m.put("packages", "Create at least one active package.");
        m.put("payouts", "Set up payouts so you can be paid.");
        return m;
    }

    @Transactional
    public CreatorMeDto submitForReview(AuthUser me) {
        CreatorProfile p = own(me);
        if (!"DRAFT".equals(p.getVettingStatus()) && !"REJECTED".equals(p.getVettingStatus())) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "PENDING_REVIEW".equals(p.getVettingStatus()) ? "Your profile is already with our team." : "Your profile is already approved.", "INVALID_VETTING_STATE");
        }
        ChecklistDto c = checklistOf(p);
        Map<String, Boolean> done = Map.of("profile", c.profile(), "photo", c.photo(), "socials", c.socials(), "packages", c.packages(), "payouts", c.payouts());
        List<FieldErrorDto> errors = MISSING.entrySet().stream().filter(e -> !done.get(e.getKey())).map(e -> new FieldErrorDto(e.getKey(), e.getValue())).toList();
        if (!errors.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "A few things are missing before we can review your profile.", "PROFILE_INCOMPLETE", errors);
        }
        p.setVettingStatus("PENDING_REVIEW");
        p.setRejectionReason(null);
        p.setSubmittedAt(clock.instant());
        touch(p);
        return toCreatorMe(p);
    }

    /** One rule for the admin queue and the demo-only control: only profiles in review can be decided. */
    void decide(CreatorProfile p, String decision, String reason) {
        if (!"PENDING_REVIEW".equals(p.getVettingStatus())) throw new ApiException(HttpStatus.CONFLICT, "Only profiles waiting for review can be decided.", "INVALID_VETTING_STATE");
        if ("REJECT".equals(decision) && (reason == null || reason.isBlank())) {
            throw ApiException.field(HttpStatus.UNPROCESSABLE_CONTENT, "Give the creator a reason.", "REASON_REQUIRED", "reason", "Required when rejecting.");
        }
        if ("APPROVE".equals(decision)) {
            p.setVettingStatus("APPROVED");
            if (p.getApprovedAt() == null) p.setApprovedAt(clock.instant());
            p.setRejectionReason(null);
        } else {
            p.setVettingStatus("REJECTED");
            p.setRejectionReason(reason.trim());
        }
        touch(p);
    }

    /** POST /dev/vetting-decision (demo only): decide the signed-in creator's own profile. */
    @Transactional
    public CreatorMeDto decideOwnForDemo(AuthUser me, String decision, String reason) {
        CreatorProfile p = own(me);
        if (!"APPROVE".equals(decision) && !"REJECT".equals(decision)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Decision must be APPROVE or REJECT.", "VALIDATION_FAILED");
        }
        decide(p, decision, reason);
        return toCreatorMe(p);
    }

    private static void requireAdmin(AuthUser me) {
        if (me.role() != Role.ADMIN) throw new ApiException(HttpStatus.FORBIDDEN, "Admins only.", "ROLE_NOT_ALLOWED");
    }

    private VettingItemDto toVettingItem(CreatorProfile p, User u) {
        return new VettingItemDto(u.getPublicId(), p.getUsername(), p.getDisplayName(), u.getEmail(), p.getPhotoUrl(), p.getBio(), p.getCity(), p.getCountry(),
                List.copyOf(p.getNiches()), List.copyOf(p.getLanguages()), socialsOf(p), ownPackagesOf(p), portfolioOf(p), p.getVettingStatus(), p.getRejectionReason(),
                p.getSubmittedAt(), p.getCreatedAt());
    }

    /** GET /admin/vetting: PENDING_REVIEW oldest submission first; other statuses newest first, at most 50. */
    @Transactional(readOnly = true)
    public List<VettingItemDto> vettingQueue(AuthUser me, String status) {
        requireAdmin(me);
        String s = status == null || status.isBlank() ? "PENDING_REVIEW" : status;
        if (!List.of("DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED").contains(s)) throw FieldCheck.invalid("status", "Choose a vetting status.");
        List<CreatorProfile> rows = new ArrayList<>(profiles.findByVettingStatusOrderBySubmittedAtAscCreatedAtAsc(s));
        rows.sort(Comparator.comparing((CreatorProfile p) -> p.getSubmittedAt() != null ? p.getSubmittedAt() : p.getCreatedAt()));
        if (!"PENDING_REVIEW".equals(s)) rows = new ArrayList<>(rows.reversed().subList(0, Math.min(50, rows.size())));
        Map<Long, User> byId = users.getAll(rows.stream().map(CreatorProfile::getUserId).toList());
        return rows.stream().map(p -> toVettingItem(p, byId.get(p.getUserId()))).toList();
    }

    private CreatorProfile vettingTarget(String creatorUserPublicId) {
        return users.findByPublicId(creatorUserPublicId)
                .flatMap(u -> profiles.findByUserId(u.getId()))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No such creator.", "CREATOR_NOT_FOUND"));
    }

    /** POST /admin/creators/{id}/approve (FR-80): the profile goes live in search. */
    @Transactional
    public VettingItemDto approve(AuthUser me, String creatorUserPublicId) {
        requireAdmin(me);
        CreatorProfile p = vettingTarget(creatorUserPublicId);
        decide(p, "APPROVE", null);
        User admin = users.get(me.userId());
        User u = users.get(p.getUserId());
        audit.record(admin, "CREATOR_APPROVED", "CREATOR_PROFILE", u.getPublicId(), "Approved " + p.getDisplayName() + " (@" + p.getUsername() + ")",
                Map.of("vettingStatus", "PENDING_REVIEW"), Map.of("vettingStatus", "APPROVED"));
        return toVettingItem(p, u);
    }

    /** POST /admin/creators/{id}/reject (FR-80): the reason is shown to the creator. */
    @Transactional
    public VettingItemDto reject(AuthUser me, String creatorUserPublicId, String reason) {
        requireAdmin(me);
        CreatorProfile p = vettingTarget(creatorUserPublicId);
        decide(p, "REJECT", reason);
        User admin = users.get(me.userId());
        User u = users.get(p.getUserId());
        audit.record(admin, "CREATOR_REJECTED", "CREATOR_PROFILE", u.getPublicId(), "Rejected " + p.getDisplayName() + ": " + reason,
                Map.of("vettingStatus", "PENDING_REVIEW"), Map.of("vettingStatus", "REJECTED", "reason", reason));
        return toVettingItem(p, u);
    }

    @Transactional(readOnly = true)
    public long pendingVettingCount() {
        return profiles.countByVettingStatus("PENDING_REVIEW");
    }

    // ---------- Vacation mode (v2.5) ----------

    @Transactional
    public AvailabilityDto saveAvailability(AuthUser me, AvailabilityInput input) {
        if (me.role() != Role.CREATOR) throw new ApiException(HttpStatus.FORBIDDEN, "Only creators have availability.", "ROLE_NOT_ALLOWED");
        CreatorProfile p = own(me);
        var until = input.validatedUntil(today());
        boolean away = Boolean.TRUE.equals(input.away());
        p.setAway(away);
        p.setAwayUntil(away ? until : null);
        String message = input.message() == null ? null : input.message().trim();
        p.setAwayMessage(away && message != null && !message.isEmpty() ? message : null);
        touch(p);
        return availabilityOf(p, today());
    }

    // ---------- Dashboard (FR-70) ----------

    /**
     * Profile views and active packages are live. Money and order counts are zero until the orders and
     * ledger modules land (Weeks 12–15); every status is present, as the contract requires.
     */
    @Transactional(readOnly = true)
    public CreatorStatsDto stats(AuthUser me) {
        CreatorProfile p = own(me);
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        ORDER_STATUSES.forEach(s -> byStatus.put(s, 0));
        return new CreatorStatsDto(Catalog.CURRENCY, 0, 0, 0, byStatus, p.getProfileViews(), packages.countByCreatorIdAndActiveTrue(p.getId()));
    }

    // ---------- For other modules ----------

    /** The creator profile of a user id, if any (payout accounts, saved lists, future orders). */
    @Transactional(readOnly = true)
    public java.util.Optional<CreatorProfile> profileOfUser(Long userId) {
        return profiles.findByUserId(userId);
    }

    @Transactional
    public void setPayoutStatus(Long creatorProfileId, String status) {
        CreatorProfile p = profiles.findById(creatorProfileId).orElseThrow();
        if (!Objects.equals(p.getPayoutStatus(), status)) {
            p.setPayoutStatus(status);
            touch(p);
        }
    }
}
