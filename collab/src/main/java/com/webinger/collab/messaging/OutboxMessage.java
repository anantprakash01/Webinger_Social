package com.webinger.collab.messaging;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/** message_outbox: email / SMS / WhatsApp waiting to be sent (outbox pattern). */
@Entity
@Table(name = "message_outbox")
@Getter
@Setter
public class OutboxMessage {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private String publicId;

    /** EMAIL, SMS or WHATSAPP. */
    @Column(nullable = false)
    private String channel;

    @Column(name = "to_address", nullable = false)
    private String toAddress;

    @Column(nullable = false)
    private String subject;

    @Column(nullable = false)
    private String body;

    /** App path the message links to, e.g. /verify-email?token=… (the sender adds the site address). */
    private String link;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "sent_at")
    private Instant sentAt;
}
