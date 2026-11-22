package com.webinger.collab.order.service;

import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.order.domain.IdempotencyRecord;
import com.webinger.collab.order.repository.IdempotencyRecordRepository;
import com.webinger.collab.security.AuthUser;
import java.time.Clock;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Idempotency-Key on money-moving requests (CLAUDE.md §8), like the mock's server.ts: the first successful
 * result is remembered per user and key, and a retry gets it again instead of acting twice. The same key on a
 * different request → 422 IDEMPOTENCY_KEY_REUSED. The record commits in the same transaction as the action.
 */
@Service
public class IdempotencyService {
    private final IdempotencyRecordRepository records;
    private final Clock clock;

    public IdempotencyService(IdempotencyRecordRepository records, Clock clock) {
        this.records = records;
        this.clock = clock;
    }

    /** Runs `action` (which returns the result's reference, e.g. the order id) once per key. */
    @Transactional(propagation = Propagation.MANDATORY)
    public String once(AuthUser me, String key, String method, String path, int status, Supplier<String> action) {
        if (key == null || key.isBlank()) return action.get();
        if (key.length() > 100) throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "The Idempotency-Key is too long.", "VALIDATION_FAILED");
        var seen = records.findByUserIdAndKey(me.userId(), key);
        if (seen.isPresent()) {
            IdempotencyRecord r = seen.get();
            if (!r.getMethod().equals(method) || !r.getPath().equals(path)) {
                throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "This Idempotency-Key was already used for a different request.", "IDEMPOTENCY_KEY_REUSED");
            }
            return r.getResultRef();
        }
        String ref = action.get();
        records.save(new IdempotencyRecord(me.userId(), key, method, path, status, ref, clock.instant()));
        return ref;
    }
}
