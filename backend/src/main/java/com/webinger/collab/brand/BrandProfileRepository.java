package com.webinger.collab.brand;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BrandProfileRepository extends JpaRepository<BrandProfile, Long> {
    Optional<BrandProfile> findByUserId(Long userId);
}
