package com.webinger.collab.order.repository;

import com.webinger.collab.order.domain.Delivery;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeliveryRepository extends JpaRepository<Delivery, Long> {
    List<Delivery> findByOrderIdOrderByIdDesc(Long orderId);
}
