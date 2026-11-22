package com.webinger.collab.creator.web;

import com.webinger.collab.creator.service.CreatorInputs.AvailabilityInput;
import com.webinger.collab.creator.service.CreatorInputs.PackageInput;
import com.webinger.collab.creator.service.CreatorInputs.PackagePatch;
import com.webinger.collab.creator.service.CreatorInputs.PortfolioInput;
import com.webinger.collab.creator.service.CreatorInputs.ProfileInput;
import com.webinger.collab.creator.service.CreatorInputs.SocialInput;
import com.webinger.collab.creator.service.CreatorSearchService;
import com.webinger.collab.creator.service.CreatorService;
import com.webinger.collab.creator.service.SearchQuery;
import com.webinger.collab.creator.web.CreatorDtos.AvailabilityDto;
import com.webinger.collab.creator.web.CreatorDtos.CreatorMeDto;
import com.webinger.collab.creator.web.CreatorDtos.CreatorProfileDto;
import com.webinger.collab.creator.web.CreatorDtos.CreatorSearchPageDto;
import com.webinger.collab.creator.web.CreatorDtos.CreatorStatsDto;
import com.webinger.collab.creator.web.CreatorDtos.OwnPackageDto;
import com.webinger.collab.creator.web.CreatorDtos.PortfolioItemDto;
import com.webinger.collab.creator.web.CreatorDtos.SocialAccountDto;
import com.webinger.collab.creator.web.CreatorDtos.SuggestionsDto;
import com.webinger.collab.security.AuthUser;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Creators (contract tags Creators and Creator workspace): public search and profiles, and the signed-in
 * creator's workspace under /creators/me. Literal paths (/me, /suggestions) win over /{username}.
 */
@RestController
@RequestMapping("/creators")
public class CreatorController {
    private final CreatorService creators;
    private final CreatorSearchService search;

    public CreatorController(CreatorService creators, CreatorSearchService search) {
        this.creators = creators;
        this.search = search;
    }

    // ---------- Public ----------

    @GetMapping
    public CreatorSearchPageDto search(@RequestParam Map<String, String> params) {
        return search.search(SearchQuery.parse(params));
    }

    @GetMapping("/suggestions")
    public SuggestionsDto suggestions(@RequestParam(required = false) String q) {
        return new SuggestionsDto(search.suggest(q));
    }

    /** Public; a signed-in owner or admin may preview an unapproved profile. */
    @GetMapping("/{username}")
    public CreatorProfileDto profile(@PathVariable String username, @AuthenticationPrincipal AuthUser me) {
        return search.profile(username, me);
    }

    // ---------- Workspace ----------

    @GetMapping("/me")
    public CreatorMeDto me(@AuthenticationPrincipal AuthUser me) {
        return creators.me(me);
    }

    @PutMapping("/me/profile")
    public CreatorMeDto updateProfile(@AuthenticationPrincipal AuthUser me, @RequestBody ProfileInput body) {
        return creators.updateProfile(me, body);
    }

    @PostMapping("/me/social-accounts")
    @ResponseStatus(HttpStatus.CREATED)
    public SocialAccountDto addSocial(@AuthenticationPrincipal AuthUser me, @RequestBody SocialInput body) {
        return creators.addSocial(me, body);
    }

    @DeleteMapping("/me/social-accounts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeSocial(@AuthenticationPrincipal AuthUser me, @PathVariable String id) {
        creators.removeSocial(me, id);
    }

    @PostMapping("/me/packages")
    @ResponseStatus(HttpStatus.CREATED)
    public OwnPackageDto createPackage(@AuthenticationPrincipal AuthUser me, @RequestBody PackageInput body) {
        return creators.createPackage(me, body);
    }

    @PatchMapping("/me/packages/{id}")
    public OwnPackageDto updatePackage(@AuthenticationPrincipal AuthUser me, @PathVariable String id, @RequestBody PackagePatch body) {
        return creators.updatePackage(me, id, body);
    }

    @DeleteMapping("/me/packages/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePackage(@AuthenticationPrincipal AuthUser me, @PathVariable String id) {
        creators.deletePackage(me, id);
    }

    @PostMapping("/me/portfolio")
    @ResponseStatus(HttpStatus.CREATED)
    public PortfolioItemDto addPortfolioItem(@AuthenticationPrincipal AuthUser me, @RequestBody PortfolioInput body) {
        return creators.addPortfolioItem(me, body);
    }

    @DeleteMapping("/me/portfolio/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removePortfolioItem(@AuthenticationPrincipal AuthUser me, @PathVariable String id) {
        creators.removePortfolioItem(me, id);
    }

    @PostMapping("/me/submit-for-review")
    public CreatorMeDto submitForReview(@AuthenticationPrincipal AuthUser me) {
        return creators.submitForReview(me);
    }

    @GetMapping("/me/stats")
    public CreatorStatsDto stats(@AuthenticationPrincipal AuthUser me) {
        return creators.stats(me);
    }

    @PutMapping("/me/availability")
    public AvailabilityDto availability(@AuthenticationPrincipal AuthUser me, @RequestBody AvailabilityInput body) {
        return creators.saveAvailability(me, body);
    }
}
