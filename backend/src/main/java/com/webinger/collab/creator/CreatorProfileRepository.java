package com.webinger.collab.creator;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreatorProfileRepository extends JpaRepository<CreatorProfile, Long> {
    Optional<CreatorProfile> findByUserId(Long userId);
}
