package com.webinger.collab.creator.web;

import com.webinger.collab.creator.service.CreatorInputs.PayoutAccountInput;
import com.webinger.collab.creator.service.PayoutAccountService;
import com.webinger.collab.creator.web.CreatorDtos.PayoutAccountDto;
import com.webinger.collab.security.AuthUser;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET/PUT /payouts/account (FR-62). Balance, withdrawals and settings come with the payments module. */
@RestController
@RequestMapping("/payouts/account")
public class PayoutAccountController {
    private final PayoutAccountService accounts;

    public PayoutAccountController(PayoutAccountService accounts) {
        this.accounts = accounts;
    }

    /** The account, or JSON `null` when none is set up yet (as the mock answers). */
    @GetMapping
    public ResponseEntity<?> get(@AuthenticationPrincipal AuthUser me) {
        return accounts.get(me).<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body("null"));
    }

    @PutMapping
    public PayoutAccountDto save(@AuthenticationPrincipal AuthUser me, @RequestBody PayoutAccountInput body) {
        return accounts.save(me, body);
    }
}
