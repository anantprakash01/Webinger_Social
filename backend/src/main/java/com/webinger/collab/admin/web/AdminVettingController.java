package com.webinger.collab.admin.web;

import com.webinger.collab.creator.service.CreatorInputs.ReasonInput;
import com.webinger.collab.creator.service.CreatorService;
import com.webinger.collab.creator.web.CreatorDtos.VettingItemDto;
import com.webinger.collab.creator.web.CreatorDtos.VettingQueueDto;
import com.webinger.collab.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Creator vetting queue (FR-80). Admins only; `id` is the creator's user id. Each decision is audited (FR-84). */
@RestController
@RequestMapping("/admin")
public class AdminVettingController {
    private final CreatorService creators;

    public AdminVettingController(CreatorService creators) {
        this.creators = creators;
    }

    @GetMapping("/vetting")
    public VettingQueueDto queue(@AuthenticationPrincipal AuthUser me, @RequestParam(required = false) String status) {
        return new VettingQueueDto(creators.vettingQueue(me, status));
    }

    @PostMapping("/creators/{id}/approve")
    public VettingItemDto approve(@AuthenticationPrincipal AuthUser me, @PathVariable String id) {
        return creators.approve(me, id);
    }

    @PostMapping("/creators/{id}/reject")
    public VettingItemDto reject(@AuthenticationPrincipal AuthUser me, @PathVariable String id, @RequestBody ReasonInput body) {
        return creators.reject(me, id, body.validatedReason());
    }
}
