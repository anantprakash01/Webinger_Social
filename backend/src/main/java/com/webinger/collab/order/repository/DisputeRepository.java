package com.webinger.collab.order.repository;

import com.webinger.collab.order.domain.Dispute;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DisputeRepository extends JpaRepository<Dispute, Long> {
    Optional<Dispute> findByOrderId(Long orderId);
}
