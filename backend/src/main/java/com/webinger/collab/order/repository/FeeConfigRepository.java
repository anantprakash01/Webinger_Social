package com.webinger.collab.order.repository;

import com.webinger.collab.order.domain.FeeConfig;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FeeConfigRepository extends JpaRepository<FeeConfig, Long> {
    Optional<FeeConfig> findFirstByPlanOrderByEffectiveFromDescIdDesc(String plan);
}
