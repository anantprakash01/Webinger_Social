package com.webinger.collab.payout.web;

import com.webinger.collab.payout.service.PayoutService;
import com.webinger.collab.payout.service.PayoutService.Overview;
import com.webinger.collab.payout.service.PayoutService.PayoutDto;
import com.webinger.collab.payout.service.PayoutService.Settings;
import com.webinger.collab.payout.service.PayoutService.WithdrawalRequest;
import com.webinger.collab.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Creator payouts (FR-63): balance and history, withdraw now, weekly payout on or off. The account is /payouts/account. */
@RestController
@RequestMapping("/payouts")
public class PayoutController {
    private final PayoutService payouts;

    public PayoutController(PayoutService payouts) {
        this.payouts = payouts;
    }

    @GetMapping("/balance")
    public Overview balance(@AuthenticationPrincipal AuthUser me) {
        return payouts.overview(me);
    }

    @PostMapping("/withdrawals")
    @ResponseStatus(HttpStatus.CREATED)
    public PayoutDto withdraw(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = "Idempotency-Key", required = false) String key,
            @RequestBody WithdrawalRequest body) {
        return payouts.withdrawOnce(me, key, body);
    }

    @PutMapping("/settings")
    public Overview settings(@AuthenticationPrincipal AuthUser me, @RequestBody Settings body) {
        return payouts.settings(me, body);
    }
}
