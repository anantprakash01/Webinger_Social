package com.webinger.collab.payment.repository;

import com.webinger.collab.payment.domain.PaymentSession;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentSessionRepository extends JpaRepository<PaymentSession, Long> {
    Optional<PaymentSession> findByPublicIdAndUserId(String publicId, Long userId);
}
