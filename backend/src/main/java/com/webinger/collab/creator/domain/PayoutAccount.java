package com.webinger.collab.creator.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

/**
 * payout_accounts (FR-62): where a creator is paid — PAN plus a bank account (IFSC) or a UPI ID.
 * Lives with the creator because onboarding needs it before submitting for review (FR-16); balances,
 * withdrawals and payouts come with the payments module.
 */
@Entity
@Table(name = "payout_accounts")
@Getter
@Setter
public class PayoutAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "creator_id", nullable = false, updatable = false)
    private Long creatorId;

    /** BANK_ACCOUNT or UPI. */
    @Column(nullable = false)
    private String method;

    @Column(name = "holder_name", nullable = false)
    private String holderName;

    @Column(nullable = false)
    private String pan;

    @Column(name = "account_number")
    private String accountNumber;

    private String ifsc;
    private String vpa;
    private String gstin;

    /** VERIFYING, VERIFIED or FAILED. */
    @Column(nullable = false)
    private String status;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
