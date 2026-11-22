package com.webinger.collab.payment.web;

import com.webinger.collab.payment.service.PaymentService;
import com.webinger.collab.payment.service.PaymentService.MethodsDto;
import com.webinger.collab.payment.service.PaymentService.SessionDto;
import com.webinger.collab.payment.service.PaymentService.SessionRequest;
import com.webinger.collab.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Payments (v2.0): a Razorpay session per checkout, and the brand's saved cards and UPI IDs. */
@RestController
@RequestMapping("/payments")
public class PaymentController {
    private final PaymentService payments;

    public PaymentController(PaymentService payments) {
        this.payments = payments;
    }

    @PostMapping("/sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public SessionDto session(@AuthenticationPrincipal AuthUser me, @RequestBody SessionRequest body) {
        return payments.createSession(me, body);
    }

    @GetMapping("/methods")
    public MethodsDto methods(@AuthenticationPrincipal AuthUser me) {
        return payments.listMethods(me);
    }

    @DeleteMapping("/methods/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthUser me, @PathVariable String id) {
        payments.deleteMethod(me, id);
    }
}
