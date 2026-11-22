package com.webinger.collab.payment.service;

import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.common.web.FieldCheck;
import com.webinger.collab.common.web.FieldErrorDto;
import com.webinger.collab.payment.domain.PaymentSession;
import com.webinger.collab.payment.domain.SavedPaymentMethod;
import com.webinger.collab.payment.repository.PaymentSessionRepository;
import com.webinger.collab.payment.repository.SavedPaymentMethodRepository;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.domain.Role;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Payments (v2.0, Razorpay), ported from the mock's handlers/payments.ts.
 *
 * <p>Flow: {@link #createSession} opens a Razorpay order for the exact total → the brand pays in Checkout (UPI,
 * card, netbanking, wallet app) → Checkout returns a payment id and signature → {@link #verify} checks the HMAC
 * and the amount before the order exists → capture on accept, cancel on close, refund on a dispute.
 *
 * <p>Until the Razorpay account is connected, Razorpay's side is simulated: sessions get `order_sim…` ids and
 * the demo-only {@link #simulateCheckout} plays Checkout with Razorpay's test values. The signature check is the
 * real algorithm, so switching to live Razorpay changes only session creation and the capture/cancel/refund calls.
 */
@Service
@EnableConfigurationProperties(RazorpayProperties.class)
public class PaymentService {
    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);
    public static final Duration SESSION_TTL = Duration.ofMinutes(30);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern VPA = Pattern.compile("^[a-zA-Z0-9.\\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$");
    private static final Pattern EXPIRY = Pattern.compile("^(\\d{2})\\s*/\\s*(\\d{2})$");
    public static final String DECLINE_TEST_CARD = "4000000000000002";
    private static final Map<String, String> BANKS = Map.of("HDFC", "HDFC Bank", "ICIC", "ICICI Bank", "SBIN", "State Bank of India", "UTIB", "Axis Bank",
            "KKBK", "Kotak Mahindra Bank", "YESB", "Yes Bank");
    private static final Map<String, String> WALLETS = Map.of("paytm", "Paytm", "phonepe", "PhonePe", "amazonpay", "Amazon Pay", "mobikwik", "MobiKwik");

    private final PaymentSessionRepository sessions;
    private final SavedPaymentMethodRepository methods;
    private final RazorpayProperties razorpay;
    private final Clock clock;

    public PaymentService(PaymentSessionRepository sessions, SavedPaymentMethodRepository methods, RazorpayProperties razorpay, Clock clock) {
        this.sessions = sessions;
        this.methods = methods;
        this.razorpay = razorpay;
        this.clock = clock;
    }

    // ---------- DTOs ----------

    public record SessionRequest(String purpose, Long amountCents) {}

    public record SessionDto(String id, String purpose, long amountCents, String currency, String razorpayOrderId, String razorpayKeyId, Instant expiresAt) {}

    /** Proof from Checkout, sent with POST /orders. */
    public record PaymentProof(String sessionId, String razorpayPaymentId, String razorpaySignature) {}

    public record CardInput(String number, String expiry, String cvc, Boolean save) {}

    public record CheckoutInput(String sessionId, String method, String savedMethodId, String vpa, Boolean saveVpa, CardInput card, String bank, String app) {}

    public record CheckoutResult(String razorpayPaymentId, String razorpaySignature) {}

    public record SavedMethodDto(String id, String type, String label, String network, String last4, String expiry, String vpa, Instant createdAt) {}

    public record MethodsDto(List<SavedMethodDto> content) {}

    /** What the order records about the payment, and the session to mark used once the order exists. */
    public record Verified(String method, String methodLabel, String razorpayPaymentId, Long sessionId) {}

    // ---------- Helpers ----------

    private static void requireBrand(AuthUser me) {
        if (me.role() != Role.BRAND) throw new ApiException(HttpStatus.FORBIDDEN, "Only brand accounts can pay.", "ROLE_NOT_ALLOWED");
    }

    private static String token(String prefix) {
        byte[] b = new byte[6];
        RANDOM.nextBytes(b);
        return prefix + HexFormat.of().formatHex(b);
    }

    /** Razorpay's signature: HMAC-SHA256("order_id|payment_id", key secret), hex. */
    String sign(String razorpayOrderId, String paymentId) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(razorpay.keySecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((razorpayOrderId + "|" + paymentId).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static SessionDto toDto(PaymentSession s, String keyId) {
        return new SessionDto(s.getPublicId(), s.getPurpose(), s.getAmountCents(), "INR", s.getRazorpayOrderId(), keyId, s.getExpiresAt());
    }

    // ---------- Sessions ----------

    @Transactional
    public SessionDto createSession(AuthUser me, SessionRequest in) {
        requireBrand(me);
        FieldCheck c = new FieldCheck();
        c.oneOf("purpose", in.purpose(), Set.of("ORDER", "SUBSCRIPTION"), "Choose what the payment is for.");
        c.whole("amountCents", in.amountCents(), 100, Long.MAX_VALUE / 2, "Enter the amount.", "The smallest payment is ₹1.", "That amount is too large.");
        c.throwIfAny();
        Instant now = clock.instant();
        PaymentSession s = new PaymentSession();
        s.setPublicId("ps_" + com.webinger.collab.common.Ulid.next(now.toEpochMilli()).toLowerCase(Locale.ROOT));
        s.setUserId(me.userId());
        s.setPurpose(in.purpose());
        s.setAmountCents(in.amountCents());
        s.setRazorpayOrderId(token("order_sim"));
        s.setCreatedAt(now);
        s.setExpiresAt(now.plus(SESSION_TTL));
        sessions.save(s);
        return toDto(s, razorpay.keyId());
    }

    /**
     * Demo only (POST /dev/razorpay/pay): plays the brand paying in Razorpay Checkout. Applies Razorpay's test
     * outcomes (failure@razorpay, the decline card) and keeps only a card's network and last four digits.
     */
    @Transactional
    public CheckoutResult simulateCheckout(AuthUser me, CheckoutInput in) {
        requireBrand(me);
        FieldCheck c = new FieldCheck();
        c.text("sessionId", in.sessionId(), 1, 60, "Start the payment again.", "Start the payment again.");
        c.oneOf("method", in.method(), Set.of("UPI", "CARD", "NETBANKING", "WALLET_APP"), "Choose how to pay.");
        c.throwIfAny();
        PaymentSession s = sessions.findByPublicIdAndUserId(in.sessionId(), me.userId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Payment session not found.", "NOT_FOUND"));
        if (s.getRazorpayPaymentId() != null || s.getUsedByRef() != null) throw new ApiException(HttpStatus.CONFLICT, "This payment was already made.", "SESSION_USED");
        if (s.getExpiresAt().isBefore(clock.instant())) throw new ApiException(HttpStatus.CONFLICT, "The payment window expired. Please try again.", "SESSION_EXPIRED");

        SavedPaymentMethod saved = null;
        if (in.savedMethodId() != null) {
            saved = methods.findByPublicIdAndUserId(in.savedMethodId(), me.userId())
                    .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Saved payment method not found.", "NOT_FOUND"));
        }
        String label = switch (in.method()) {
            case "UPI" -> {
                String vpa = (saved != null && saved.getVpa() != null ? saved.getVpa() : in.vpa() == null ? "" : in.vpa()).trim().toLowerCase(Locale.ROOT);
                if (!VPA.matcher(vpa).matches()) throw FieldCheck.invalid("vpa", "Enter a UPI ID like name@okhdfcbank.");
                if (vpa.equals("failure@razorpay")) throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "The payment was declined in the UPI app. Try again or use another method.", "PAYMENT_FAILED");
                String v = vpa;
                if (Boolean.TRUE.equals(in.saveVpa()) && saved == null && methods.findByUserIdOrderByCreatedAtDescIdDesc(me.userId()).stream().noneMatch(m -> v.equals(m.getVpa()))) {
                    saveMethod(me.userId(), "UPI", null, null, null, vpa);
                }
                yield "UPI · " + vpa;
            }
            case "CARD" -> {
                if (saved != null) yield saved.getNetwork() + " •••• " + saved.getLast4();
                CardInput card = in.card() == null ? new CardInput("", "", "", false) : in.card();
                String number = card.number() == null ? "" : card.number().replaceAll("\\s+", "");
                List<FieldErrorDto> errors = new ArrayList<>();
                if (!number.matches("^\\d{16}$") || !luhn(number)) errors.add(new FieldErrorDto("card.number", "Enter a valid card number."));
                Matcher m = EXPIRY.matcher(card.expiry() == null ? "" : card.expiry().trim());
                boolean expiryOk = m.matches() && futureMonth(Integer.parseInt(m.group(1)), 2000 + Integer.parseInt(m.group(2)));
                if (!expiryOk) errors.add(new FieldErrorDto("card.expiry", "Enter a future expiry date as MM / YY."));
                if (card.cvc() == null || !card.cvc().trim().matches("^\\d{3,4}$")) errors.add(new FieldErrorDto("card.cvc", "Enter the 3 or 4 digits on the back."));
                if (!errors.isEmpty()) throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Check the card details.", "VALIDATION_FAILED", errors);
                if (number.equals(DECLINE_TEST_CARD)) throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "Your card was declined by the bank. Try another card or UPI.", "PAYMENT_FAILED");
                String network = cardNetwork(number);
                String last4 = number.substring(12);
                String expiry = m.group(1) + "/" + m.group(2);
                if (Boolean.TRUE.equals(card.save()) && methods.findByUserIdOrderByCreatedAtDescIdDesc(me.userId()).stream()
                        .noneMatch(x -> last4.equals(x.getLast4()) && network.equals(x.getNetwork()))) {
                    saveMethod(me.userId(), "CARD", network, last4, expiry, null);
                }
                yield network + " •••• " + last4;
            }
            case "NETBANKING" -> {
                String bank = BANKS.get(in.bank() == null ? "" : in.bank());
                if (bank == null) throw FieldCheck.invalid("bank", "Choose your bank.");
                yield bank + " netbanking";
            }
            default -> {
                String app = WALLETS.get(in.app() == null ? "" : in.app());
                if (app == null) throw FieldCheck.invalid("app", "Choose a wallet.");
                yield app + " wallet";
            }
        };
        String paymentId = token("pay_sim");
        s.setRazorpayPaymentId(paymentId);
        s.setPaymentMethod(in.method());
        s.setPaymentLabel(label);
        return new CheckoutResult(paymentId, sign(s.getRazorpayOrderId(), paymentId));
    }

    private boolean futureMonth(int month, int year) {
        if (month < 1 || month > 12) return false;
        return !YearMonth.of(year, month).isBefore(YearMonth.now(clock.withZone(ZoneOffset.UTC)));
    }

    static boolean luhn(String n) {
        int sum = 0;
        for (int i = 0; i < n.length(); i++) {
            int d = n.charAt(n.length() - 1 - i) - '0';
            if (i % 2 == 1) {
                d *= 2;
                if (d > 9) d -= 9;
            }
            sum += d;
        }
        return sum % 10 == 0;
    }

    static String cardNetwork(String number) {
        if (number.startsWith("4")) return "Visa";
        if (number.matches("^(5[1-5]|2[2-7]).*")) return "Mastercard";
        if (number.matches("^(60|65|81|82|508).*")) return "RuPay";
        if (number.matches("^3[47].*")) return "Amex";
        return "Card";
    }

    private void saveMethod(Long userId, String type, String network, String last4, String expiry, String vpa) {
        SavedPaymentMethod m = new SavedPaymentMethod();
        m.setPublicId(token("token_"));
        m.setUserId(userId);
        m.setType(type);
        m.setNetwork(network);
        m.setLast4(last4);
        m.setExpiry(expiry);
        m.setVpa(vpa);
        m.setCreatedAt(clock.instant());
        methods.save(m);
    }

    // ---------- Verifying a payment for an order ----------

    /**
     * Checks Checkout's proof for a session of exactly `totalCents` before the order exists, so a failed or
     * forged payment never creates one. Call {@link #markUsed} with the new order's id afterwards.
     */
    @Transactional
    public Verified verify(AuthUser me, PaymentProof proof, long totalCents, String purpose) {
        if (proof == null || blank(proof.sessionId()) || blank(proof.razorpayPaymentId()) || blank(proof.razorpaySignature())) {
            throw FieldCheck.invalid("payment", "Complete the payment first.");
        }
        PaymentSession s = sessions.findByPublicIdAndUserId(proof.sessionId(), me.userId()).filter(x -> x.getPurpose().equals(purpose))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Payment session not found.", "NOT_FOUND"));
        if (s.getUsedByRef() != null) throw new ApiException(HttpStatus.CONFLICT, "This payment was already used.", "SESSION_USED");
        boolean genuine = s.getRazorpayPaymentId() != null && s.getRazorpayPaymentId().equals(proof.razorpayPaymentId())
                && MessageDigest.isEqual(sign(s.getRazorpayOrderId(), proof.razorpayPaymentId()).getBytes(StandardCharsets.UTF_8),
                        proof.razorpaySignature().getBytes(StandardCharsets.UTF_8));
        if (!genuine) throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "We could not verify the payment. You have not been charged; please try again.", "PAYMENT_FAILED");
        if (s.getAmountCents() != totalCents) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "The price changed after you started paying. Your payment will be released; please review the new total and pay again.", "AMOUNT_MISMATCH");
        }
        return new Verified(s.getPaymentMethod(), s.getPaymentLabel(), s.getRazorpayPaymentId(), s.getId());
    }

    @Transactional
    public void markUsed(Verified v, String ref) {
        sessions.findById(v.sessionId()).orElseThrow().setUsedByRef(ref);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    // ---------- Gateway calls on transitions (simulated until Razorpay is connected) ----------

    /** Capture on accept, release the hold on close, refund to the original method on a dispute or admin cancel. */
    public void onPaymentAction(String action, String razorpayPaymentId, long amountCents, String orderRef) {
        log.info("Razorpay (simulated): {} {} paise for order {} (payment {})", action, amountCents, orderRef, razorpayPaymentId);
    }

    // ---------- Saved methods ----------

    @Transactional(readOnly = true)
    public MethodsDto listMethods(AuthUser me) {
        requireBrand(me);
        return new MethodsDto(methods.findByUserIdOrderByCreatedAtDescIdDesc(me.userId()).stream()
                .map(m -> new SavedMethodDto(m.getPublicId(), m.getType(), "CARD".equals(m.getType()) ? m.getNetwork() + " •••• " + m.getLast4() : m.getVpa(), m.getNetwork(),
                        m.getLast4(), m.getExpiry(), m.getVpa(), m.getCreatedAt()))
                .toList());
    }

    @Transactional
    public void deleteMethod(AuthUser me, String id) {
        requireBrand(me);
        methods.delete(methods.findByPublicIdAndUserId(id, me.userId())
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Saved payment method not found.", "NOT_FOUND")));
    }

    /** Demo data: a saved card and UPI ID for the demo brand. */
    @Transactional
    public void seedSavedMethods(Long brandUserId, Instant at) {
        SavedPaymentMethod card = new SavedPaymentMethod();
        card.setPublicId("token_demosaltbayvisa");
        card.setUserId(brandUserId);
        card.setType("CARD");
        card.setNetwork("Visa");
        card.setLast4("1111");
        card.setExpiry("12/29");
        card.setCreatedAt(at.minus(Duration.ofDays(40)));
        methods.save(card);
        SavedPaymentMethod upi = new SavedPaymentMethod();
        upi.setPublicId("token_demosaltbayupi");
        upi.setUserId(brandUserId);
        upi.setType("UPI");
        upi.setVpa("saltbay@okhdfcbank");
        upi.setCreatedAt(at.minus(Duration.ofDays(30)));
        methods.save(upi);
    }
}
