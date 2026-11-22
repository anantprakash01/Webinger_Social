package com.webinger.collab.creator.repository;

import com.webinger.collab.creator.domain.PayoutAccount;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PayoutAccountRepository extends JpaRepository<PayoutAccount, Long> {
    Optional<PayoutAccount> findByCreatorId(Long creatorId);
}
