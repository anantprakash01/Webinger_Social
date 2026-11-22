package com.webinger.collab.auth.repository;

import com.webinger.collab.auth.domain.RefreshToken;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken r set r.revokedAt = :at where r.sessionId = :sessionId and r.revokedAt is null")
    int revokeSession(@Param("sessionId") Long sessionId, @Param("at") Instant at);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken r set r.revokedAt = :at where r.userId = :userId and r.revokedAt is null")
    int revokeUser(@Param("userId") Long userId, @Param("at") Instant at);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update RefreshToken r set r.revokedAt = :at where r.userId = :userId and r.sessionId <> :keep and r.revokedAt is null")
    int revokeUserExcept(@Param("userId") Long userId, @Param("keep") Long keepSessionId, @Param("at") Instant at);
}
