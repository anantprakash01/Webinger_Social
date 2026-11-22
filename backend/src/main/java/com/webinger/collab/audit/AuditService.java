package com.webinger.collab.audit;

import com.webinger.collab.common.Ulid;
import com.webinger.collab.user.domain.User;
import java.time.Clock;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Writes audit entries (FR-84) inside the caller's transaction, so an action and its entry commit together. */
@Service
public class AuditService {
    private final AuditLogRepository repo;
    private final ObjectMapper json;
    private final Clock clock;

    public AuditService(AuditLogRepository repo, ObjectMapper json, Clock clock) {
        this.repo = repo;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(User actor, String action, String entityType, String entityId, String summary, Object before, Object after) {
        Instant now = clock.instant();
        AuditLog a = new AuditLog();
        a.setPublicId(Ulid.next(now.toEpochMilli()));
        a.setActorId(actor == null ? null : actor.getId());
        a.setActorName(actor == null ? "SYSTEM" : actor.getName());
        a.setAction(action);
        a.setEntityType(entityType);
        a.setEntityId(entityId);
        a.setSummary(summary);
        a.setBeforeJson(before == null ? null : json.writeValueAsString(before));
        a.setAfterJson(after == null ? null : json.writeValueAsString(after));
        a.setCreatedAt(now);
        repo.save(a);
    }
}
