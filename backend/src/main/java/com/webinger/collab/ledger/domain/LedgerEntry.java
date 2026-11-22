package com.webinger.collab.ledger.domain;

import com.webinger.collab.ledger.service.LedgerLines.Account;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** ledger_entries: one line of a balanced transaction. Append-only: never updated or deleted. */
@Entity
@Table(name = "ledger_entries")
@Getter
@NoArgsConstructor
public class LedgerEntry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "txn_id", nullable = false, updatable = false)
    private String txnId;

    /** The order's public id (later also payout and subscription references). */
    @Column(nullable = false, updatable = false)
    private String ref;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private Account account;

    @Column(name = "debit_cents", nullable = false, updatable = false)
    private long debitCents;

    @Column(name = "credit_cents", nullable = false, updatable = false)
    private long creditCents;

    /** The creator whose balance a CREATOR_BALANCE line moves. */
    @Column(name = "party_user_id", updatable = false)
    private Long partyUserId;

    @Column(nullable = false, updatable = false)
    private String memo;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public LedgerEntry(String txnId, String ref, Account account, long debitCents, long creditCents, Long partyUserId, String memo, Instant createdAt) {
        this.txnId = txnId;
        this.ref = ref;
        this.account = account;
        this.debitCents = debitCents;
        this.creditCents = creditCents;
        this.partyUserId = partyUserId;
        this.memo = memo;
        this.createdAt = createdAt;
    }
}
