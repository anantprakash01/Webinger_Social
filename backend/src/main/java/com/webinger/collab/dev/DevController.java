package com.webinger.collab.dev;

import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.creator.service.CreatorService;
import com.webinger.collab.creator.web.CreatorDtos.CreatorMeDto;
import com.webinger.collab.messaging.OutboxMessage;
import com.webinger.collab.messaging.OutboxMessageRepository;
import com.webinger.collab.security.AuthUser;
import java.time.Instant;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Demo-only helpers (app.demo=true), never in production — like the mock's /dev endpoints.
 * GET /dev/outbox lets the demo inbox show the verification and reset emails.
 * POST /dev/vetting-decision approves or rejects the signed-in creator's own profile in review, so the
 * demo can show every vetting state without an admin.
 */
@RestController
@RequestMapping("/dev")
@ConditionalOnProperty(prefix = "app", name = "demo", havingValue = "true")
public class DevController {
    private final OutboxMessageRepository outbox;
    private final CreatorService creators;

    public DevController(OutboxMessageRepository outbox, CreatorService creators) {
        this.outbox = outbox;
        this.creators = creators;
    }

    /** Same shape as the mock's OutboxEmail. */
    public record OutboxEmail(String id, String channel, String to, String subject, String body, String link, Instant createdAt) {}

    @GetMapping("/outbox")
    public List<OutboxEmail> outbox(@RequestParam(required = false) String to) {
        List<OutboxMessage> rows = to == null || to.isBlank() ? outbox.findTop50ByOrderByIdDesc() : outbox.findTop50ByToAddressOrderByIdDesc(to.trim().toLowerCase(java.util.Locale.ROOT));
        return rows.stream().map(m -> new OutboxEmail(m.getPublicId(), m.getChannel(), m.getToAddress(), m.getSubject(), m.getBody(), m.getLink(), m.getCreatedAt())).toList();
    }

    public record VettingDecision(String decision, String reason) {}

    @PostMapping("/vetting-decision")
    public CreatorMeDto vettingDecision(@AuthenticationPrincipal AuthUser me, @RequestBody(required = false) VettingDecision body) {
        if (me == null) throw new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in.", "NOT_AUTHENTICATED");
        return creators.decideOwnForDemo(me, body == null ? null : body.decision(), body == null ? null : body.reason());
    }
}
