package com.webinger.collab.ledger.service;

import com.webinger.collab.audit.AuditService;
import com.webinger.collab.common.Ulid;
import com.webinger.collab.ledger.domain.LedgerEntry;
import com.webinger.collab.ledger.repository.LedgerEntryRepository;
import com.webinger.collab.ledger.service.LedgerLines.Account;
import com.webinger.collab.ledger.service.LedgerLines.Line;
import com.webinger.collab.user.domain.User;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Posts balanced transactions (CLAUDE.md §4.1) and answers balance questions. The only writer of
 * ledger_entries. Each posting is also an audit entry (MONEY_MOVEMENT, FR-84), in the caller's transaction.
 */
@Service
public class LedgerService {
    private final LedgerEntryRepository entries;
    private final AuditService audit;
    private final Clock clock;

    public LedgerService(LedgerEntryRepository entries, AuditService audit, Clock clock) {
        this.entries = entries;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * Validates and stores one transaction. `creatorUserId` is recorded on CREATOR_BALANCE lines so a creator's
     * balance can be summed. Returns the transaction id, or null when there was nothing to post.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public String post(String ref, String memo, List<Line> lines, Long creatorUserId, User actor) {
        if (lines.isEmpty()) return null;
        Instant now = clock.instant();
        String txnId = Ulid.next(now.toEpochMilli());
        List<Line> kept = LedgerLines.check(txnId, lines);
        for (Line l : kept) {
            entries.save(new LedgerEntry(txnId, ref, l.account(), l.debitCents(), l.creditCents(), l.account() == Account.CREATOR_BALANCE ? creatorUserId : null, memo, now));
        }
        long amount = kept.stream().mapToLong(Line::debitCents).sum();
        audit.record(actor, "MONEY_MOVEMENT", "ORDER", ref, memo + ": " + formatRupees(amount), null,
                Map.of("txnId", txnId, "lines", kept.stream().map(l -> Map.of("account", l.account().name(), "debitCents", l.debitCents(), "creditCents", l.creditCents())).toList()));
        return txnId;
    }

    @Transactional(readOnly = true)
    public long balance(String ref, Account account) {
        return entries.balanceOf(ref, account);
    }

    /** A creator's available balance: everything released to them minus payouts. */
    @Transactional(readOnly = true)
    public long creatorBalance(Long creatorUserId) {
        return entries.partyBalance(creatorUserId, Account.CREATOR_BALANCE);
    }

    /** Everything ever released to a creator. */
    @Transactional(readOnly = true)
    public long creatorLifetimeEarned(Long creatorUserId) {
        return entries.partyDebits(creatorUserId, Account.CREATOR_BALANCE);
    }

    @Transactional(readOnly = true)
    public List<String> unbalancedTransactions() {
        return entries.unbalancedTxnIds();
    }

    /** ₹1,118.00 style, for audit summaries (Indian digit grouping). */
    static String formatRupees(long paise) {
        long rupees = paise / 100;
        String digits = Long.toString(rupees);
        StringBuilder out = new StringBuilder();
        int n = digits.length();
        if (n <= 3) out.append(digits);
        else {
            String head = digits.substring(0, n - 3);
            for (int i = 0; i < head.length(); i++) {
                if (i > 0 && (head.length() - i) % 2 == 0) out.append(',');
                out.append(head.charAt(i));
            }
            out.append(',').append(digits.substring(n - 3));
        }
        return "₹" + out + "." + String.format("%02d", paise % 100);
    }
}
