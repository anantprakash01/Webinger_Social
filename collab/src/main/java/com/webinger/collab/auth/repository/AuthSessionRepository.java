package com.webinger.collab.auth.repository;

import com.webinger.collab.auth.domain.AuthSession;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthSessionRepository extends JpaRepository<AuthSession, Long> {
    Optional<AuthSession> findByPublicId(String publicId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AuthSession s set s.revokedAt = :at where s.userId = :userId and s.revokedAt is null")
    int revokeAll(@Param("userId") Long userId, @Param("at") Instant at);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AuthSession s set s.revokedAt = :at where s.userId = :userId and s.revokedAt is null and s.id <> :keep")
    int revokeAllExcept(@Param("userId") Long userId, @Param("keep") Long keepSessionId, @Param("at") Instant at);
}
