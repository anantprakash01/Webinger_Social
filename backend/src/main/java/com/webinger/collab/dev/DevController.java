package com.webinger.collab.dev;

import com.webinger.collab.messaging.OutboxMessage;
import com.webinger.collab.messaging.OutboxMessageRepository;
import java.time.Instant;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Demo-only helpers (app.demo=true), never in production — like the mock's /dev endpoints.
 * GET /dev/outbox lets the demo inbox show the verification and reset emails.
 */
@RestController
@RequestMapping("/dev")
@ConditionalOnProperty(prefix = "app", name = "demo", havingValue = "true")
public class DevController {
    private final OutboxMessageRepository outbox;

    public DevController(OutboxMessageRepository outbox) {
        this.outbox = outbox;
    }

    /** Same shape as the mock's OutboxEmail. */
    public record OutboxEmail(String id, String channel, String to, String subject, String body, String link, Instant createdAt) {}

    @GetMapping("/outbox")
    public List<OutboxEmail> outbox(@RequestParam(required = false) String to) {
        List<OutboxMessage> rows = to == null || to.isBlank() ? outbox.findTop50ByOrderByIdDesc() : outbox.findTop50ByToAddressOrderByIdDesc(to.trim().toLowerCase(java.util.Locale.ROOT));
        return rows.stream().map(m -> new OutboxEmail(m.getPublicId(), m.getChannel(), m.getToAddress(), m.getSubject(), m.getBody(), m.getLink(), m.getCreatedAt())).toList();
    }
}
