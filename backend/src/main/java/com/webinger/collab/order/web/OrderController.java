package com.webinger.collab.order.web;

import com.webinger.collab.order.service.OrderInputs.BriefInput;
import com.webinger.collab.order.service.OrderInputs.CreateOrderRequest;
import com.webinger.collab.order.service.OrderInputs.DeliverRequest;
import com.webinger.collab.order.service.OrderInputs.DisputeRequest;
import com.webinger.collab.order.service.OrderInputs.NoteRequest;
import com.webinger.collab.order.service.OrderInputs.ReasonRequest;
import com.webinger.collab.order.service.OrderInputs.ReplyRequest;
import com.webinger.collab.order.service.OrderInputs.ReviewRequest;
import com.webinger.collab.order.service.OrderService;
import com.webinger.collab.order.service.OrderStateMachine.EventType;
import com.webinger.collab.order.web.OrderDtos.Created;
import com.webinger.collab.order.web.OrderDtos.Detail;
import com.webinger.collab.security.AuthUser;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Orders (FR-30 – FR-38) and reviews. Money-moving calls honour `Idempotency-Key`: a retry with the same key
 * returns the first result. Every action answers with the order as the caller now sees it.
 */
@RestController
public class OrderController {
    private static final String KEY = "Idempotency-Key";

    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    @GetMapping("/orders/quote")
    public OrderDtos.Quote quote(@AuthenticationPrincipal AuthUser me, @RequestParam Map<String, String> q) {
        return orders.quote(me, q);
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    public Created create(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = KEY, required = false) String key, @RequestBody CreateOrderRequest body) {
        return orders.createOnce(me, key, body);
    }

    @GetMapping("/orders")
    public OrderDtos.Page list(@AuthenticationPrincipal AuthUser me, @RequestParam Map<String, String> q) {
        return orders.list(me, q);
    }

    @GetMapping("/orders/{id}")
    public Detail get(@AuthenticationPrincipal AuthUser me, @PathVariable String id) {
        return orders.detail(me, id);
    }

    @PostMapping("/orders/{id}/accept")
    public Detail accept(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = KEY, required = false) String key, @PathVariable String id) {
        return orders.actOnce(me, key, id, "accept", () -> orders.act(me, id, EventType.ACCEPT, null, null));
    }

    @PostMapping("/orders/{id}/decline")
    public Detail decline(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = KEY, required = false) String key, @PathVariable String id,
            @RequestBody(required = false) ReasonRequest body) {
        String reason = body == null ? null : body.validatedReason();
        return orders.actOnce(me, key, id, "decline", () -> orders.act(me, id, EventType.DECLINE, reason, null));
    }

    @PostMapping("/orders/{id}/cancel")
    public Detail cancel(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = KEY, required = false) String key, @PathVariable String id,
            @RequestBody(required = false) ReasonRequest body) {
        String reason = body == null ? null : body.validatedReason();
        return orders.actOnce(me, key, id, "cancel", () -> orders.act(me, id, EventType.CANCEL, reason, null));
    }

    @PostMapping("/orders/{id}/deliver")
    public Detail deliver(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = KEY, required = false) String key, @PathVariable String id,
            @RequestBody DeliverRequest body) {
        return orders.actOnce(me, key, id, "deliver", () -> orders.deliver(me, id, body));
    }

    @PostMapping("/orders/{id}/approve")
    public Detail approve(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = KEY, required = false) String key, @PathVariable String id) {
        return orders.actOnce(me, key, id, "approve", () -> orders.act(me, id, EventType.APPROVE, null, null));
    }

    @PostMapping("/orders/{id}/request-revision")
    public Detail requestRevision(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = KEY, required = false) String key, @PathVariable String id,
            @RequestBody NoteRequest body) {
        String note = body.validatedNote();
        return orders.actOnce(me, key, id, "request-revision", () -> orders.act(me, id, EventType.REQUEST_REVISION, note, null));
    }

    @PostMapping("/orders/{id}/dispute")
    public Detail dispute(@AuthenticationPrincipal AuthUser me, @RequestHeader(name = KEY, required = false) String key, @PathVariable String id,
            @RequestBody DisputeRequest body) {
        DisputeRequest d = body.validated();
        return orders.actOnce(me, key, id, "dispute", () -> orders.act(me, id, EventType.DISPUTE, d.note(), d.reasonCode()));
    }

    @PostMapping("/orders/{id}/brief")
    public Detail brief(@AuthenticationPrincipal AuthUser me, @PathVariable String id, @RequestBody BriefInput body) {
        return orders.updateBrief(me, id, body);
    }

    @PostMapping("/orders/{id}/review")
    @ResponseStatus(HttpStatus.CREATED)
    public OrderDtos.ReviewDto review(@AuthenticationPrincipal AuthUser me, @PathVariable String id, @RequestBody ReviewRequest body) {
        return orders.review(me, id, body);
    }

    @PostMapping("/reviews/{id}/reply")
    public OrderDtos.ReviewDto reply(@AuthenticationPrincipal AuthUser me, @PathVariable String id, @RequestBody ReplyRequest body) {
        return orders.reply(me, id, body.validatedReply());
    }

    @GetMapping("/brands/me/stats")
    public OrderService.BrandStats brandStats(@AuthenticationPrincipal AuthUser me) {
        return orders.brandStats(me);
    }
}
