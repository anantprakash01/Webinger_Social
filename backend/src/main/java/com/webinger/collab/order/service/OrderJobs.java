package com.webinger.collab.order.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * Scheduled jobs (CLAUDE.md §4.3): every minute, expire orders not accepted within 72 hours and auto-approve
 * deliveries the brand did not review within 72 hours. Off when `app.jobs-enabled=false` (tests run them directly).
 * One instance for now; add ShedLock before running more than one.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "app", name = "jobs-enabled", havingValue = "true", matchIfMissing = true)
public class OrderJobs {
    private static final Logger log = LoggerFactory.getLogger(OrderJobs.class);
    private final OrderService orders;

    public OrderJobs(OrderService orders) {
        this.orders = orders;
    }

    @Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT30S")
    public void run() {
        OrderService.JobCounts c = orders.runDueJobs();
        if (c.expired() + c.autoApproved() > 0) log.info("Order jobs: {} expired, {} auto-approved", c.expired(), c.autoApproved());
    }
}
