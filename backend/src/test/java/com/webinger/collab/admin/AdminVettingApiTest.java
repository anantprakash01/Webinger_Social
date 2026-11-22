package com.webinger.collab.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.webinger.collab.audit.AuditLog;
import com.webinger.collab.audit.AuditLogRepository;
import com.webinger.collab.support.ApiTest;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** Creator vetting queue (FR-80) with audit entries (FR-84), ported from the vetting cases in handlers/admin.test.ts. */
class AdminVettingApiTest extends ApiTest {
    @Autowired
    AuditLogRepository auditLogs;

    @BeforeEach
    void signIn() throws Exception {
        login("admin@demo.test", DEMO_PASSWORD);
    }

    String idOf(String username) throws Exception {
        Res q = call("GET", "/admin/vetting", null);
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) q.get("$.content[?(@.username == '" + username + "')].creatorId");
        return ids.getFirst();
    }

    @Test
    void listsProfilesInReviewOldestSubmissionFirstWithEverythingToJudge() throws Exception {
        Res q = call("GET", "/admin/vetting", null);
        assertThat(q.status()).isEqualTo(200);
        // Vikram joined 5 days ago, Tara 8: Tara submitted first.
        assertThat((List<String>) q.get("$.content[*].username")).containsExactly("tarasings", "vikramdrives");
        assertThat(q.str("$.content[0].email")).isEqualTo("tarasings@creators.demo.test");
        assertThat(q.str("$.content[0].creatorId")).hasSize(26);
        assertThat((List<?>) q.get("$.content[0].socials")).hasSize(1);
        assertThat((List<?>) q.get("$.content[0].packages")).hasSize(1);
        assertThat((List<?>) q.get("$.content[0].portfolio")).hasSize(4);
        assertThat((List<String>) call("GET", "/admin/vetting?status=REJECTED", null).get("$.content[*].username")).containsExactly("nehaglow");
        assertThat(call("GET", "/admin/vetting?status=LOST", null).status()).isEqualTo(422);
    }

    @Test
    void approvingPutsTheCreatorInSearchAndIsAudited() throws Exception {
        String id = idOf("tarasings");
        Res approved = call("POST", "/admin/creators/" + id + "/approve", null);
        assertThat(approved.status()).as(approved.body()).isEqualTo(200);
        assertThat(approved.str("$.vettingStatus")).isEqualTo("APPROVED");
        assertThat(call("GET", "/creators/tarasings", null).str("$.vettingStatus")).isEqualTo("APPROVED");
        assertThat((List<String>) call("GET", "/admin/vetting", null).get("$.content[*].username")).containsExactly("vikramdrives");
        // Deciding twice is refused.
        assertThat(call("POST", "/admin/creators/" + id + "/approve", null).code()).isEqualTo("INVALID_VETTING_STATE");

        AuditLog entry = auditLogs.findAll().stream().filter(a -> a.getAction().equals("CREATOR_APPROVED")).findFirst().orElseThrow();
        assertThat(entry.getEntityId()).isEqualTo(id);
        assertThat(entry.getActorName()).isEqualTo("Sam Mehta");
        assertThat(entry.getSummary()).isEqualTo("Approved Tara Bose (@tarasings)");
        assertThat(entry.getAfterJson()).contains("APPROVED");
    }

    @Test
    void rejectingNeedsAReasonTheCreatorThenSees() throws Exception {
        String id = idOf("vikramdrives");
        Res noReason = call("POST", "/admin/creators/" + id + "/reject", "{\"reason\":\"too short\"}");
        assertThat(noReason.status()).isEqualTo(422);
        assertThat(noReason.str("$.errors[0].message")).isEqualTo("Give a reason of at least 10 characters.");
        Res rejected = call("POST", "/admin/creators/" + id + "/reject", "{\"reason\":\"  Please add a clearer profile photo.  \"}");
        assertThat(rejected.str("$.vettingStatus")).isEqualTo("REJECTED");
        assertThat(rejected.str("$.rejectionReason")).isEqualTo("Please add a clearer profile photo.");
        assertThat(auditLogs.findAll().stream().map(AuditLog::getAction)).contains("CREATOR_REJECTED");

        login("vikramdrives@creators.demo.test", DEMO_PASSWORD);
        assertThat(call("GET", "/me", null).str("$.creator.rejectionReason")).isEqualTo("Please add a clearer profile photo.");
        assertThat(call("POST", "/creators/me/submit-for-review", null).str("$.vettingStatus")).isEqualTo("PENDING_REVIEW");
    }

    @Test
    void isAdminOnlyAndUnknownCreatorsAre404() throws Exception {
        assertThat(call("POST", "/admin/creators/01JD0000000000000000NOBODY/approve", null).status()).isEqualTo(404);
        String id = idOf("tarasings");
        login("brand@demo.test", DEMO_PASSWORD);
        Res brand = call("GET", "/admin/vetting", null);
        assertThat(brand.status()).isEqualTo(403);
        assertThat(brand.code()).isEqualTo("ROLE_NOT_ALLOWED");
        assertThat(call("POST", "/admin/creators/" + id + "/approve", null).status()).isEqualTo(403);
        login("tarasings@creators.demo.test", DEMO_PASSWORD);
        assertThat(call("POST", "/admin/creators/" + id + "/approve", null).status()).isEqualTo(403);
    }
}
