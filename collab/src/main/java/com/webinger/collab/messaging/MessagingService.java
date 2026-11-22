package com.webinger.collab.messaging;

import com.webinger.collab.common.Ulid;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Queues outgoing messages. A sender job (SES for email; SMS/WhatsApp provider still to be chosen,
 * CLAUDE.md §16) delivers them and stamps sent_at. The mock's demo outbox shows the same rows.
 */
@Service
public class MessagingService {
    private final OutboxMessageRepository outbox;
    private final Clock clock;

    public MessagingService(OutboxMessageRepository outbox, Clock clock) {
        this.outbox = outbox;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void email(String to, String subject, String body, String link) {
        Instant now = clock.instant();
        OutboxMessage m = new OutboxMessage();
        m.setPublicId(Ulid.next(now.toEpochMilli()));
        m.setChannel("EMAIL");
        m.setToAddress(to);
        m.setSubject(subject);
        m.setBody(body);
        m.setLink(link);
        m.setCreatedAt(now);
        outbox.save(m);
    }
}
