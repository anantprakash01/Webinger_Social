package com.webinger.collab.ledger.repository;

import com.webinger.collab.ledger.domain.LedgerEntry;
import com.webinger.collab.ledger.service.LedgerLines.Account;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, Long> {
    List<LedgerEntry> findByRefOrderByIdAsc(String ref);

    /** Debits minus credits on one account for one reference. */
    @Query("select coalesce(sum(e.debitCents - e.creditCents), 0) from LedgerEntry e where e.ref = :ref and e.account = :account")
    long balanceOf(@Param("ref") String ref, @Param("account") Account account);

    /** A creator's CREATOR_BALANCE: debits minus credits. */
    @Query("select coalesce(sum(e.debitCents - e.creditCents), 0) from LedgerEntry e where e.partyUserId = :user and e.account = :account")
    long partyBalance(@Param("user") Long userId, @Param("account") Account account);

    /** Everything ever credited to a creator's balance from orders (lifetime earnings). */
    @Query("select coalesce(sum(e.debitCents), 0) from LedgerEntry e where e.partyUserId = :user and e.account = :account")
    long partyDebits(@Param("user") Long userId, @Param("account") Account account);

    /** Approved work released to a creator's balance (not payouts), newest first. */
    @Query("""
            select e from LedgerEntry e where e.partyUserId = :user and e.account = :account and e.debitCents > 0 and e.ref not like 'payout%'
            order by e.createdAt desc, e.id desc
            """)
    List<LedgerEntry> partyCredits(@Param("user") Long userId, @Param("account") Account account);

    /** Transactions whose lines do not sum to zero (should always be empty). */
    @Query("select e.txnId from LedgerEntry e group by e.txnId having sum(e.debitCents - e.creditCents) <> 0")
    List<String> unbalancedTxnIds();
}
