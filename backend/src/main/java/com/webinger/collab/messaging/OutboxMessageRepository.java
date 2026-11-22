package com.webinger.collab.messaging;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OutboxMessageRepository extends JpaRepository<OutboxMessage, Long> {
    List<OutboxMessage> findTop50ByOrderByIdDesc();

    List<OutboxMessage> findTop50ByToAddressOrderByIdDesc(String toAddress);
}
