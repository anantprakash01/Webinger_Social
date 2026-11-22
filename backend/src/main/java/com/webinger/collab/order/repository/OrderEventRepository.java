package com.webinger.collab.order.repository;

import com.webinger.collab.order.domain.OrderEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderEventRepository extends JpaRepository<OrderEvent, Long> {
    List<OrderEvent> findByOrderIdOrderByIdAsc(Long orderId);

    List<OrderEvent> findByOrderIdInAndTypeIn(Collection<Long> orderIds, Collection<String> types);
}
