package com.webinger.collab.creator.service;

import com.webinger.collab.creator.domain.CreatorProfile;
import com.webinger.collab.creator.domain.PayoutAccount;
import com.webinger.collab.creator.repository.PayoutAccountRepository;
import com.webinger.collab.creator.service.CreatorInputs.PayoutAccountInput;
import com.webinger.collab.creator.web.CreatorDtos.PayoutAccountDto;
import com.webinger.collab.security.AuthUser;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * GET/PUT /payouts/account (FR-62): the creator's PAN and bank account or UPI ID, needed before submitting
 * the profile for review. Ported from the mock's handlers/payouts.ts. Verification is simulated like the mock
 * (account number of zeros or a UPI ID ending @fail → FAILED) until the payments module calls Razorpay.
 */
@Service
public class PayoutAccountService {
    private record Bank(String prefix, String name) {}

    private static final List<Bank> BANKS = List.of(new Bank("HDFC", "HDFC Bank"), new Bank("ICIC", "ICICI Bank"), new Bank("SBIN", "State Bank of India"),
            new Bank("UTIB", "Axis Bank"), new Bank("KKBK", "Kotak Mahindra Bank"));

    private final PayoutAccountRepository accounts;
    private final CreatorService creators;
    private final Clock clock;

    public PayoutAccountService(PayoutAccountRepository accounts, CreatorService creators, Clock clock) {
        this.accounts = accounts;
        this.creators = creators;
        this.clock = clock;
    }

    static String bankNameFor(String ifsc) {
        return BANKS.stream().filter(b -> ifsc != null && ifsc.startsWith(b.prefix())).map(Bank::name).findFirst().orElse("Bank");
    }

    static String destinationOf(PayoutAccount a) {
        if ("UPI".equals(a.getMethod())) return a.getVpa();
        String n = a.getAccountNumber() == null ? "" : a.getAccountNumber();
        return bankNameFor(a.getIfsc()) + " •••• " + n.substring(Math.max(0, n.length() - 4));
    }

    static PayoutAccountDto toDto(PayoutAccount a) {
        String pan = a.getPan();
        return new PayoutAccountDto(a.getMethod(), a.getHolderName(), pan.substring(0, 5) + "••••" + pan.substring(pan.length() - 1), destinationOf(a), a.getStatus(),
                a.getFailureReason(), a.getUpdatedAt(), a.getGstin());
    }

    /** A creator's payout account as shown to them (payout overview). */
    @Transactional(readOnly = true)
    public Optional<PayoutAccountDto> accountOf(Long creatorProfileId) {
        return accounts.findByCreatorId(creatorProfileId).map(PayoutAccountService::toDto);
    }

    /** The GSTIN on a creator's verified payout account: they are GST-registered for tax on orders (v2.3). */
    @Transactional(readOnly = true)
    public Optional<String> verifiedGstinOf(Long creatorProfileId) {
        return accounts.findByCreatorId(creatorProfileId).filter(a -> "VERIFIED".equals(a.getStatus())).map(PayoutAccount::getGstin);
    }

    @Transactional(readOnly = true)
    public Optional<PayoutAccountDto> get(AuthUser me) {
        CreatorProfile p = creators.own(me);
        return accounts.findByCreatorId(p.getId()).map(PayoutAccountService::toDto);
    }

    @Transactional
    public PayoutAccountDto save(AuthUser me, PayoutAccountInput input) {
        CreatorProfile p = creators.own(me);
        PayoutAccountInput body = input.validated();
        boolean bank = "BANK_ACCOUNT".equals(body.method());
        boolean failed = bank ? body.accountNumber().matches("^0+$") : body.vpa().endsWith("@fail");
        Instant now = clock.instant();
        PayoutAccount a = accounts.findByCreatorId(p.getId()).orElseGet(() -> {
            PayoutAccount x = new PayoutAccount();
            x.setCreatorId(p.getId());
            x.setCreatedAt(now);
            return x;
        });
        a.setMethod(body.method());
        a.setHolderName(body.holderName());
        a.setPan(body.pan());
        a.setAccountNumber(body.accountNumber());
        a.setIfsc(body.ifsc());
        a.setVpa(body.vpa());
        a.setGstin(body.gstin());
        a.setStatus(failed ? "FAILED" : "VERIFIED");
        a.setFailureReason(!failed ? null
                : bank ? bankNameFor(body.ifsc()) + " could not confirm this account. Check the account number and IFSC."
                        : "This UPI ID could not be verified. Check it in your UPI app.");
        a.setUpdatedAt(now);
        accounts.save(a);
        creators.setPayoutStatus(p.getId(), failed ? "PENDING" : "ENABLED");
        return toDto(a);
    }
}
