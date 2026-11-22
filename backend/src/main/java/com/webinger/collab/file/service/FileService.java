package com.webinger.collab.file.service;

import com.webinger.collab.common.AppProperties;
import com.webinger.collab.common.Ulid;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.common.web.FieldCheck;
import com.webinger.collab.file.domain.StoredFile;
import com.webinger.collab.file.repository.StoredFileRepository;
import com.webinger.collab.security.AuthUser;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * POST /files/presign and the upload it allows (contract PresignRequest/PresignResponse; mock handlers/files.ts).
 *
 * <p>Until S3 is wired in, files live on local disk ({@code app.upload-dir}): the upload URL is this API's own
 * {@code PUT /files/uploads/{key}}, signed with an HMAC and valid for 10 minutes, and the file is served from
 * {@code GET /files/{key}}. Switching to S3 changes only {@link #presign}'s URLs; the frontend already PUTs to
 * whatever {@code uploadUrl} says and stores {@code fileUrl}.
 */
@Service
public class FileService {
    public static final long MAX_UPLOAD_BYTES = 10L * 1024 * 1024;
    public static final Duration UPLOAD_WINDOW = Duration.ofMinutes(10);
    /** Where the API is mounted (server.servlet.context-path); the frontend proxies /api to it. */
    static final String BASE = "/api/v1/files/";

    private static final Set<String> PURPOSES = Set.of("AVATAR", "COVER", "PORTFOLIO", "BRAND_LOGO", "BRIEF_REFERENCE", "DELIVERABLE", "MESSAGE_ATTACHMENT", "DISPUTE_EVIDENCE");
    private static final Set<String> PDF_PURPOSES = Set.of("MESSAGE_ATTACHMENT", "DISPUTE_EVIDENCE");
    private static final Map<String, String> EXTENSIONS = Map.of("image/jpeg", "jpeg", "image/png", "png", "image/webp", "webp", "application/pdf", "pdf");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final StoredFileRepository files;
    private final Clock clock;
    private final Path root;
    private final byte[] signingKey;

    public FileService(StoredFileRepository files, Clock clock, AppProperties props) {
        this.files = files;
        this.clock = clock;
        this.root = Path.of(props.uploadDir()).toAbsolutePath().normalize();
        this.signingKey = ("uploads:" + props.jwtSecret()).getBytes(StandardCharsets.UTF_8);
    }

    public record PresignRequest(String purpose, String fileName, String contentType, Long sizeBytes) {}

    public record PresignResponse(String uploadUrl, String method, Map<String, String> headers, String fileUrl, Instant expiresAt) {}

    /** A file to send back: its type, size and bytes. */
    public record Download(String contentType, long sizeBytes, Path path) {}

    @Transactional
    public PresignResponse presign(AuthUser me, PresignRequest in) {
        FieldCheck c = new FieldCheck();
        c.oneOf("purpose", in.purpose(), PURPOSES, "Choose what the file is for.");
        c.text("fileName", in.fileName(), 1, 200, "Name the file.", "Use a shorter file name.");
        if (in.contentType() == null || !EXTENSIONS.containsKey(in.contentType())
                || ("application/pdf".equals(in.contentType()) && !PDF_PURPOSES.contains(in.purpose()))) {
            c.fail("contentType", "Use a JPEG, PNG or WebP image.");
        }
        c.whole("sizeBytes", in.sizeBytes(), 1, MAX_UPLOAD_BYTES, "Give the file size.", "That file is empty.", "Images can be at most 10 MB.");
        c.throwIfAny();

        Instant now = clock.instant();
        byte[] random = new byte[16];
        RANDOM.nextBytes(random);
        String key = in.purpose().toLowerCase() + "/" + me.publicId() + "/" + HexFormat.of().formatHex(random) + "." + EXTENSIONS.get(in.contentType());
        StoredFile f = new StoredFile();
        f.setPublicId(Ulid.next(now.toEpochMilli()));
        f.setOwnerUserId(me.userId());
        f.setStorageKey(key);
        f.setPurpose(in.purpose());
        f.setContentType(in.contentType());
        f.setSizeBytes(in.sizeBytes());
        f.setCreatedAt(now);
        files.save(f);

        Instant expires = now.plus(UPLOAD_WINDOW);
        long exp = expires.getEpochSecond();
        String uploadUrl = BASE + "uploads/" + key + "?expires=" + exp + "&sig=" + sign(key, exp);
        return new PresignResponse(uploadUrl, "PUT", Map.of("Content-Type", in.contentType()), BASE + key, expires);
    }

    String sign(String key, long expiresEpochSecond) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((key + "\n" + expiresEpochSecond).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ApiException uploadRefused(String detail) {
        return new ApiException(HttpStatus.FORBIDDEN, detail, "UPLOAD_REFUSED");
    }

    /**
     * PUT /files/uploads/{key}: stores the bytes once, if the signature is valid and unexpired, the type matches
     * the presign and the body is no larger than declared.
     */
    @Transactional
    public void receive(String key, long expires, String sig, String contentType, InputStream body) throws IOException {
        if (sig == null || !MessageDigest.isEqual(sign(key, expires).getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8))) {
            throw uploadRefused("This upload link is not valid.");
        }
        if (clock.instant().getEpochSecond() > expires) throw uploadRefused("This upload link has expired. Try again.");
        StoredFile f = files.findByStorageKey(key).orElseThrow(() -> uploadRefused("This upload link is not valid."));
        if (f.getUploadedAt() != null) throw new ApiException(HttpStatus.CONFLICT, "This file was already uploaded.", "ALREADY_UPLOADED");
        String type = contentType == null ? "" : contentType.split(";")[0].trim();
        if (!type.equalsIgnoreCase(f.getContentType())) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "Upload the file type you asked for (" + f.getContentType() + ").", "VALIDATION_FAILED");
        }
        Path target = pathOf(key);
        Files.createDirectories(target.getParent());
        Path tmp = Files.createTempFile(target.getParent(), "upload", ".part");
        try {
            long written = copyAtMost(body, tmp, f.getSizeBytes());
            if (written < 0) throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "The file is larger than announced.", "VALIDATION_FAILED");
            if (written == 0) throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "That file is empty.", "VALIDATION_FAILED");
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            f.setSizeBytes(written);
            f.setUploadedAt(clock.instant());
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    /** Copies up to `limit` bytes; returns -1 if the stream holds more. */
    private static long copyAtMost(InputStream in, Path to, long limit) throws IOException {
        long total = 0;
        byte[] buf = new byte[64 * 1024];
        try (OutputStream out = Files.newOutputStream(to)) {
            int n;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > limit) return -1;
                out.write(buf, 0, n);
            }
        }
        return total;
    }

    /** GET /files/{key}: only files that finished uploading. */
    @Transactional(readOnly = true)
    public Download download(String key) {
        StoredFile f = files.findByStorageKey(key).filter(x -> x.getUploadedAt() != null)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "No such file.", "NOT_FOUND"));
        return new Download(f.getContentType(), f.getSizeBytes(), pathOf(f.getStorageKey()));
    }

    /** Resolves a key under the upload root; keys come from presign, but never trust them with the file system. */
    private Path pathOf(String key) {
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root) || List.of(key.split("/")).contains("..")) throw new ApiException(HttpStatus.NOT_FOUND, "No such file.", "NOT_FOUND");
        return p;
    }
}
