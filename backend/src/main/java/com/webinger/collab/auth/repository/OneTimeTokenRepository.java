package com.webinger.collab.auth.repository;

import com.webinger.collab.auth.domain.OneTimeToken;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OneTimeTokenRepository extends JpaRepository<OneTimeToken, Long> {
    Optional<OneTimeToken> findByTokenHashAndKind(String tokenHash, OneTimeToken.Kind kind);

    long countByUserIdAndKindAndCreatedAtAfter(Long userId, OneTimeToken.Kind kind, Instant after);

    /** A new link replaces older unused links of the same kind. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update OneTimeToken t set t.usedAt = :at where t.userId = :userId and t.kind = :kind and t.usedAt is null")
    int retireUnused(@Param("userId") Long userId, @Param("kind") OneTimeToken.Kind kind, @Param("at") Instant at);
}
