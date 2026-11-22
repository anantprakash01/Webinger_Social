package com.webinger.collab.payment.repository;

import com.webinger.collab.payment.domain.SavedPaymentMethod;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SavedPaymentMethodRepository extends JpaRepository<SavedPaymentMethod, Long> {
    List<SavedPaymentMethod> findByUserIdOrderByCreatedAtDescIdDesc(Long userId);

    Optional<SavedPaymentMethod> findByPublicIdAndUserId(String publicId, Long userId);
}
