package com.webinger.collab.creator.service;

import com.webinger.collab.common.Catalog;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.creator.domain.CreatorPackage;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.domain.SocialAccount;
import com.webinger.collab.creator.repository.CreatorProfileRepository;
import com.webinger.collab.creator.repository.PackageRepository;
import com.webinger.collab.creator.repository.PortfolioItemRepository;
import com.webinger.collab.creator.repository.SocialAccountRepository;
import com.webinger.collab.creator.web.CreatorDtos.CreatorCardDto;
import com.webinger.collab.creator.web.CreatorDtos.CreatorProfileDto;
import com.webinger.collab.creator.web.CreatorDtos.CreatorSearchPageDto;
import com.webinger.collab.creator.web.CreatorDtos.ReachDto;
import com.webinger.collab.creator.web.CreatorDtos.SuggestionDto;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.domain.Role;
import com.webinger.collab.user.domain.User;
import com.webinger.collab.user.domain.UserStatus;
import com.webinger.collab.user.service.UserService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Public discovery (FR-15, FR-20 – FR-24), ported from the mock's handlers/creators.ts. SQL narrows the
 * candidates by the plain filters; the platform view (reach, starting price), relevance and sorting are
 * computed here, exactly as the mock does. Fine for the launch catalogue; FULLTEXT or OpenSearch replaces
 * the candidate scan past ~100k creators (CLAUDE.md §6).
 */
@Service
public class CreatorSearchService {
    private final CreatorProfileRepository profiles;
    private final SocialAccountRepository socials;
    private final PackageRepository packages;
    private final PortfolioItemRepository portfolio;
    private final UserService users;
    private final Clock clock;

    public CreatorSearchService(CreatorProfileRepository profiles, SocialAccountRepository socials, PackageRepository packages, PortfolioItemRepository portfolio,
            UserService users, Clock clock) {
        this.profiles = profiles;
        this.socials = socials;
        this.packages = packages;
        this.portfolio = portfolio;
        this.users = users;
        this.clock = clock;
    }

    private LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    /** One creator as seen through an optional platform filter. */
    record Facts(CreatorProfile profile, CreatorCardDto card, Instant listedAt) {}

    /** Socials and active packages of many creators in two queries. */
    record Loaded(Map<Long, List<SocialAccount>> socials, Map<Long, List<CreatorPackage>> packages) {
        static Loaded of(Collection<Long> ids, SocialAccountRepository s, PackageRepository k) {
            if (ids.isEmpty()) return new Loaded(Map.of(), Map.of());
            return new Loaded(s.findByCreatorIdIn(ids).stream().collect(Collectors.groupingBy(SocialAccount::getCreatorId)),
                    k.findByCreatorIdInAndActiveTrue(ids).stream().collect(Collectors.groupingBy(CreatorPackage::getCreatorId)));
        }
    }

    /**
     * The card (FR-24). With a platform: that platform's account and packages; empty if the creator has
     * neither there. Ratings arrive with the reviews module (Weeks 16–18).
     */
    Optional<Facts> cardFor(CreatorProfile p, String platform, Loaded loaded, LocalDate today) {
        List<SocialAccount> mine = loaded.socials().getOrDefault(p.getId(), List.of());
        List<CreatorPackage> pk = loaded.packages().getOrDefault(p.getId(), List.of()).stream().filter(k -> platform == null || k.getPlatform().equals(platform)).toList();
        Optional<SocialAccount> top = mine.stream().max(Comparator.comparingLong(SocialAccount::getFollowers));
        Optional<SocialAccount> reach = platform == null ? top : mine.stream().filter(s -> s.getPlatform().equals(platform)).findFirst();
        if (platform != null && reach.isEmpty() && pk.isEmpty()) return Optional.empty();
        CreatorCardDto card = new CreatorCardDto(
                p.getUsername(),
                p.getDisplayName(),
                p.getPhotoUrl(),
                p.getCity(),
                p.getCountry(),
                p.getNiches().stream().limit(3).toList(),
                reach.map(s -> new ReachDto(s.getPlatform(), s.getHandle(), s.getFollowers())).orElse(null),
                pk.stream().mapToLong(CreatorPackage::getPriceCents).min().stream().boxed().findFirst().orElse(null),
                Catalog.CURRENCY,
                null,
                0,
                mine.stream().anyMatch(s -> s.getVerifiedAt() != null),
                p.isAwayOn(today));
        return Optional.of(new Facts(p, card, p.getApprovedAt() != null ? p.getApprovedAt() : p.getCreatedAt()));
    }

    /** Cards for creators still visible to brands (approved, active account), in the given order. Used by saved lists. */
    @Transactional(readOnly = true)
    public List<CreatorCardDto> visibleCards(List<CreatorProfile> list) {
        Map<Long, User> owners = users.getAll(list.stream().map(CreatorProfile::getUserId).toList());
        List<CreatorProfile> visible = list.stream()
                .filter(p -> p.isApproved() && p.getUsername() != null && owners.containsKey(p.getUserId()) && owners.get(p.getUserId()).getStatus() == UserStatus.ACTIVE)
                .toList();
        Loaded loaded = Loaded.of(visible.stream().map(CreatorProfile::getId).toList(), socials, packages);
        LocalDate today = today();
        return visible.stream().map(p -> cardFor(p, null, loaded, today).orElseThrow().card()).toList();
    }

    /** Keyword relevance: every word must match somewhere; name hits weigh most (FR-20). 0 = no match. */
    static int keywordScore(CreatorProfile p, List<String> words) {
        if (words.isEmpty()) return 1;
        String name = (p.getDisplayName() + " " + p.getUsername()).toLowerCase(Locale.ROOT);
        String niches = p.getNiches().stream().map(n -> n + " " + Catalog.NICHES.getOrDefault(n, "")).collect(Collectors.joining(" ")).toLowerCase(Locale.ROOT);
        String bio = p.getBio() == null ? "" : p.getBio().toLowerCase(Locale.ROOT);
        int score = 0;
        for (String w : words) {
            int s = (name.contains(w) ? 3 : 0) + (niches.contains(w) ? 2 : 0) + (bio.contains(w) ? 1 : 0);
            if (s == 0) return 0;
            score += s;
        }
        return score;
    }

    private static boolean inRange(Long v, Long min, Long max) {
        if (min == null && max == null) return true;
        return v != null && (min == null || v >= min) && (max == null || v <= max);
    }

    /** "Featured" order without a keyword: well-rated creators with many reviews first. */
    private static double featuredScore(CreatorCardDto c) {
        return (c.ratingAvg() == null ? 3.5 : c.ratingAvg()) * (Math.log(c.ratingCount() + 2) / Math.log(2));
    }

    private record Scored(Facts facts, int score) {}

    @Transactional(readOnly = true)
    public CreatorSearchPageDto search(SearchQuery q) {
        List<String> words = q.q() == null ? List.of() : List.of(q.q().toLowerCase(Locale.ROOT).split("\\s+")).stream().filter(w -> !w.isEmpty()).toList();
        int year = today().getYear();
        // Age range → birth-year range (age = this year − birth year).
        Integer bornFrom = q.ageMax() == null ? null : year - q.ageMax();
        Integer bornTo = q.ageMin() == null ? null : year - q.ageMin();
        List<CreatorProfile> candidates = profiles.searchCandidates(q.country(), q.city() == null ? null : q.city().toLowerCase(Locale.ROOT), q.gender(), bornFrom, bornTo,
                q.niche(), q.language());
        if (q.ageMin() != null || q.ageMax() != null) candidates = candidates.stream().filter(p -> p.getBirthYear() != null).toList();

        Loaded loaded = Loaded.of(candidates.stream().map(CreatorProfile::getId).toList(), socials, packages);
        LocalDate today = today();
        List<Scored> scored = new ArrayList<>();
        for (CreatorProfile p : candidates) {
            Optional<Facts> f = cardFor(p, q.platform(), loaded, today);
            if (f.isEmpty()) continue;
            CreatorCardDto c = f.get().card();
            if (!inRange(c.reach() == null ? null : c.reach().followers(), q.followersMin(), q.followersMax())) continue;
            if (!inRange(c.startingPriceCents(), q.priceMinCents(), q.priceMaxCents())) continue;
            // v2.6 "accepts within 24 h": needs the typical acceptance time from orders (Weeks 12–15); none qualify yet.
            if (Boolean.TRUE.equals(q.fastAccept())) continue;
            int score = keywordScore(p, words);
            if (score > 0) scored.add(new Scored(f.get(), score));
        }

        Comparator<Scored> byName = Comparator.comparing(s -> s.facts().profile().getUsername());
        Comparator<Scored> cmp = switch (q.sort()) {
            case "price_asc" -> Comparator.comparingLong((Scored s) -> s.facts().card().startingPriceCents() == null ? Long.MAX_VALUE : s.facts().card().startingPriceCents())
                    .thenComparing(byName);
            case "followers_desc" -> Comparator.comparingLong((Scored s) -> s.facts().card().reach() == null ? 0 : s.facts().card().reach().followers()).reversed()
                    .thenComparing(byName);
            case "rating_desc" -> Comparator.comparingDouble((Scored s) -> s.facts().card().ratingAvg() == null ? 0 : s.facts().card().ratingAvg()).reversed()
                    .thenComparing(Comparator.comparingInt((Scored s) -> s.facts().card().ratingCount()).reversed())
                    .thenComparing(byName);
            case "newest" -> Comparator.comparing((Scored s) -> s.facts().listedAt()).reversed().thenComparing(byName);
            default -> Comparator.comparingInt(Scored::score).reversed()
                    .thenComparing(Comparator.comparingDouble((Scored s) -> featuredScore(s.facts().card())).reversed())
                    .thenComparing(byName);
        };
        scored.sort(cmp);

        int total = scored.size();
        int from = Math.min(q.page() * q.size(), total);
        int to = Math.min(from + q.size(), total);
        List<CreatorCardDto> content = scored.subList(from, to).stream().map(s -> s.facts().card()).toList();
        return new CreatorSearchPageDto(content, q.page(), q.size(), total, (total + q.size() - 1) / q.size());
    }

    /** v2.6 search-box suggestions: niches and cities first (up to 3), then creators by name or username; 8 at most. */
    @Transactional(readOnly = true)
    public List<SuggestionDto> suggest(String raw) {
        String q = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (q.length() > 100) q = q.substring(0, 100);
        if (q.isEmpty()) return List.of();
        List<SuggestionDto> out = new ArrayList<>();
        for (var n : Catalog.NICHES.entrySet()) if (n.getValue().toLowerCase(Locale.ROOT).startsWith(q)) out.add(new SuggestionDto("NICHE", n.getValue(), n.getKey(), "Niche"));
        for (var l : Catalog.LOCATIONS)
            for (String c : l.cities()) if (c.toLowerCase(Locale.ROOT).startsWith(q)) out.add(new SuggestionDto("CITY", c, l.country() + ":" + c, l.label()));
        String query = q;
        List<SuggestionDto> people = profiles.searchCandidates(null, null, null, null, null, null, null).stream()
                .filter(p -> {
                    String name = p.getDisplayName().toLowerCase(Locale.ROOT);
                    return name.startsWith(query) || List.of(name.split("\\s+")).stream().anyMatch(w -> w.startsWith(query)) || p.getUsername().startsWith(query);
                })
                .sorted(Comparator.comparing(CreatorProfile::getDisplayName))
                .limit(5)
                .map(p -> new SuggestionDto("CREATOR", p.getDisplayName(), p.getUsername(), "@" + p.getUsername()))
                .toList();
        List<SuggestionDto> all = new ArrayList<>(out.subList(0, Math.min(3, out.size())));
        all.addAll(people);
        return all.subList(0, Math.min(8, all.size()));
    }

    /**
     * GET /creators/{username} (FR-15). 404 unless APPROVED and the account is active — the creator and
     * admins may preview. Each view by someone else counts (FR-70).
     */
    @Transactional
    public CreatorProfileDto profile(String username, AuthUser viewer) {
        CreatorProfile p = profiles.findByUsername(username.toLowerCase(Locale.ROOT)).orElse(null);
        boolean isOwner = p != null && viewer != null && viewer.userId().equals(p.getUserId());
        boolean canPreview = isOwner || (viewer != null && viewer.role() == Role.ADMIN);
        boolean live = p != null && p.isApproved() && users.get(p.getUserId()).getStatus() == UserStatus.ACTIVE;
        if (p == null || p.getUsername() == null || (!live && !canPreview)) throw new ApiException(HttpStatus.NOT_FOUND, "No creator with that username.", "CREATOR_NOT_FOUND");

        LocalDate today = today();
        Loaded loaded = Loaded.of(List.of(p.getId()), socials, packages);
        CreatorCardDto c = cardFor(p, null, loaded, today).orElseThrow().card();

        List<SocialAccount> mine = loaded.socials().getOrDefault(p.getId(), List.of());
        CreatorProfileDto body = new CreatorProfileDto(
                c.username(), c.displayName(), c.photoUrl(), c.city(), c.country(), c.niches(), c.reach(), c.startingPriceCents(), c.currency(), c.ratingAvg(),
                c.ratingCount(), c.verified(), c.away(),
                0, // completedOrders: orders module
                null, // typicalAcceptHours: orders module
                CreatorService.availabilityOf(p, today),
                null, // myInquiryId: chat module (pre-booking inquiries)
                p.getBio(),
                List.copyOf(p.getLanguages()),
                p.getCoverUrls().stream().limit(3).toList(),
                mine.stream().sorted(Comparator.comparingLong(SocialAccount::getFollowers).reversed()).map(CreatorService::toSocial).toList(),
                loaded.packages().getOrDefault(p.getId(), List.of()).stream().sorted(Comparator.comparingLong(CreatorPackage::getPriceCents)).map(CreatorService::toPackage).toList(),
                portfolio.findByCreatorIdOrderBySortOrderAsc(p.getId()).stream().limit(12).map(CreatorService::toPortfolioItem).toList(),
                List.of(), // reviews: reviews module
                p.getCreatedAt(),
                p.getVettingStatus());
        // Counted last: the update clears the persistence context, so nothing above may need it afterwards.
        if (!isOwner && p.isApproved()) profiles.incrementViews(p.getId());
        return body;
    }

}
