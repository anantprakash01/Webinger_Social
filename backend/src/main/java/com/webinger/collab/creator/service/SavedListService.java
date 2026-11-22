package com.webinger.collab.creator.service;

import com.webinger.collab.common.Ulid;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.domain.SavedList;
import com.webinger.collab.creator.repository.CreatorProfileRepository;
import com.webinger.collab.creator.repository.SavedListRepository;
import com.webinger.collab.creator.service.CreatorInputs.SavedListInput;
import com.webinger.collab.creator.web.CreatorDtos.SavedListDetailDto;
import com.webinger.collab.creator.web.CreatorDtos.SavedListDto;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.domain.Role;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Saved lists (FR-25), ported from the mock's handlers/retention.ts. Brands only; each brand sees only its own. */
@Service
public class SavedListService {
    public static final int MAX_LISTS = 20;
    public static final int MAX_LIST_SIZE = 200;

    private final SavedListRepository lists;
    private final CreatorProfileRepository profiles;
    private final CreatorSearchService search;
    private final Clock clock;

    public SavedListService(SavedListRepository lists, CreatorProfileRepository profiles, CreatorSearchService search, Clock clock) {
        this.lists = lists;
        this.profiles = profiles;
        this.search = search;
        this.clock = clock;
    }

    private static void requireBrand(AuthUser me) {
        if (me.role() != Role.BRAND) throw new ApiException(HttpStatus.FORBIDDEN, "Saved lists are for brand accounts.", "ROLE_NOT_ALLOWED");
    }

    private SavedList ownList(AuthUser me, String id) {
        requireBrand(me);
        return lists.findByPublicIdAndBrandUserId(id, me.userId()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No such list.", "NOT_FOUND"));
    }

    /** Newest addition first. */
    private static List<SavedList.Entry> ordered(SavedList l) {
        return l.getEntries().stream().sorted(Comparator.comparing(SavedList.Entry::getAddedAt).reversed()).toList();
    }

    private List<CreatorProfile> creatorsOf(SavedList l) {
        List<SavedList.Entry> entries = ordered(l);
        Map<Long, CreatorProfile> byId = profiles.findAllById(entries.stream().map(SavedList.Entry::getCreatorId).toList()).stream()
                .collect(Collectors.toMap(CreatorProfile::getId, Function.identity()));
        return entries.stream().map(e -> byId.get(e.getCreatorId())).filter(p -> p != null).toList();
    }

    private SavedListDto toDto(SavedList l) {
        List<String> usernames = creatorsOf(l).stream().map(CreatorProfile::getUsername).filter(u -> u != null).toList();
        return new SavedListDto(l.getPublicId(), l.getName(), usernames, l.getCreatedAt(), l.getUpdatedAt());
    }

    private void uniqueName(AuthUser me, String name, Long except) {
        boolean taken = lists.findByBrandUserIdOrderByCreatedAtDesc(me.userId()).stream()
                .anyMatch(l -> !l.getId().equals(except) && l.getName().toLowerCase(Locale.ROOT).equals(name.toLowerCase(Locale.ROOT)));
        if (taken) throw ApiException.field(HttpStatus.CONFLICT, "You already have a list with that name.", "LIST_NAME_TAKEN", "name", "You already have a list with that name.");
    }

    @Transactional(readOnly = true)
    public List<SavedListDto> list(AuthUser me) {
        requireBrand(me);
        return lists.findByBrandUserIdOrderByCreatedAtDesc(me.userId()).stream().map(this::toDto).toList();
    }

    @Transactional
    public SavedListDto create(AuthUser me, SavedListInput input) {
        requireBrand(me);
        String name = input.validatedName();
        if (lists.countByBrandUserId(me.userId()) >= MAX_LISTS) throw new ApiException(HttpStatus.CONFLICT, "You can have up to " + MAX_LISTS + " lists.", "LIST_LIMIT");
        uniqueName(me, name, null);
        Instant now = clock.instant();
        SavedList l = new SavedList();
        l.setPublicId(Ulid.next(now.toEpochMilli()));
        l.setBrandUserId(me.userId());
        l.setName(name);
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        lists.save(l);
        return toDto(l);
    }

    /** The list with cards for creators still visible to brands (hidden or suspended ones are left out). */
    @Transactional(readOnly = true)
    public SavedListDetailDto get(AuthUser me, String id) {
        SavedList l = ownList(me, id);
        SavedListDto d = toDto(l);
        return new SavedListDetailDto(d.id(), d.name(), d.usernames(), d.createdAt(), d.updatedAt(), search.visibleCards(creatorsOf(l)));
    }

    @Transactional
    public SavedListDto rename(AuthUser me, String id, SavedListInput input) {
        SavedList l = ownList(me, id);
        String name = input.validatedName();
        uniqueName(me, name, l.getId());
        l.setName(name);
        l.setUpdatedAt(clock.instant());
        return toDto(l);
    }

    @Transactional
    public void delete(AuthUser me, String id) {
        lists.delete(ownList(me, id));
    }

    private CreatorProfile listedCreator(String username) {
        return profiles.findByUsername(username.toLowerCase(Locale.ROOT)).filter(CreatorProfile::isApproved)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No creator with that username.", "CREATOR_NOT_FOUND"));
    }

    /** Adding someone already on the list changes nothing. */
    @Transactional
    public SavedListDto add(AuthUser me, String id, String username) {
        SavedList l = ownList(me, id);
        CreatorProfile p = listedCreator(username);
        if (l.getEntries().stream().noneMatch(e -> e.getCreatorId().equals(p.getId()))) {
            if (l.getEntries().size() >= MAX_LIST_SIZE) throw new ApiException(HttpStatus.CONFLICT, "A list holds up to " + MAX_LIST_SIZE + " creators.", "LIST_FULL");
            Instant now = clock.instant();
            l.getEntries().add(new SavedList.Entry(p.getId(), now));
            l.setUpdatedAt(now);
        }
        return toDto(l);
    }

    @Transactional
    public SavedListDto remove(AuthUser me, String id, String username) {
        SavedList l = ownList(me, id);
        CreatorProfile p = listedCreator(username);
        l.getEntries().removeIf(e -> e.getCreatorId().equals(p.getId()));
        l.setUpdatedAt(clock.instant());
        return toDto(l);
    }
}
