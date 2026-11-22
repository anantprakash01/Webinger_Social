package com.webinger.collab.order.web;

import com.webinger.collab.order.service.FeeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /fees (public): current fees and the plans, so every screen quotes the live rates. */
@RestController
public class FeeController {
    private final FeeService fees;

    public FeeController(FeeService fees) {
        this.fees = fees;
    }

    @GetMapping("/fees")
    public FeeService.PublicFees fees() {
        return fees.publicFees();
    }
}
