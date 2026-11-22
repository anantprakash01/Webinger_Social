package com.webinger.collab.order.repository;

import com.webinger.collab.order.domain.Order;
import com.webinger.collab.order.service.OrderStateMachine.Status;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OrderRepository extends JpaRepository<Order, Long> {
    Optional<Order> findByPublicId(String publicId);

    List<Order> findByBrandUserId(Long brandUserId);

    List<Order> findByCreatorUserId(Long creatorUserId);

    List<Order> findByCreatorUserIdIn(Collection<Long> creatorUserIds);

    boolean existsByPackageId(Long packageId);

    boolean existsByBrandUserId(Long brandUserId);

    /** Orders a scheduled job may be due for (CLAUDE.md §4.3): unaccepted past the window, or delivered past review. */
    @Query("""
            select o.id from CollabOrder o
            where (o.status = :pending and o.acceptBy <= :now) or (o.status = :delivered and o.reviewBy <= :now)
            order by o.id
            """)
    List<Long> findDue(@Param("now") Instant now, @Param("pending") Status pending, @Param("delivered") Status delivered);
}
