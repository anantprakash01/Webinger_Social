package com.webinger.collab.order.repository;

import com.webinger.collab.order.domain.OrderBrief;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderBriefRepository extends JpaRepository<OrderBrief, Long> {}
