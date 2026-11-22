package com.webinger.collab;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** The whole application starts with the Flyway schema (validated by Hibernate) on H2. */
@SpringBootTest
@ActiveProfiles("test")
class CollabApplicationTests {

    @Test
    void contextLoads() {}
}
