package com.webinger.collab.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.webinger.collab.support.ApiTest;
import java.net.URI;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * POST /files/presign and the local stand-in for S3: PUT the bytes to the signed upload URL, then GET them
 * from fileUrl — what the frontend's api.files.upload does in http mode.
 */
class FileApiTest extends ApiTest {
    static final byte[] PNG = {(byte) 137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4};

    @BeforeEach
    void signIn() throws Exception {
        login("newcreator@demo.test", DEMO_PASSWORD);
    }

    Res presign(String purpose, String type, long size) throws Exception {
        return call("POST", "/files/presign", "{\"purpose\":\"" + purpose + "\",\"fileName\":\"me.png\",\"contentType\":\"" + type + "\",\"sizeBytes\":" + size + "}");
    }

    /** PUT to an upload URL exactly as given (path and signed query), without a bearer token. */
    MockHttpServletResponse upload(String uploadUrl, String contentType, byte[] body) throws Exception {
        return mvc.perform(put(URI.create(uploadUrl)).contextPath("/api/v1").contentType(contentType).content(body)).andReturn().getResponse();
    }

    MockHttpServletResponse download(String fileUrl) throws Exception {
        return mvc.perform(get(URI.create(fileUrl)).contextPath("/api/v1")).andReturn().getResponse();
    }

    @Test
    void presignsUploadsAndServesAnImage() throws Exception {
        Res p = presign("AVATAR", "image/png", PNG.length);
        assertThat(p.status()).as(p.body()).isEqualTo(200);
        assertThat(p.str("$.method")).isEqualTo("PUT");
        assertThat(p.str("$.headers['Content-Type']")).isEqualTo("image/png");
        assertThat(p.str("$.fileUrl")).startsWith("/api/v1/files/avatar/01JD000000000000000CREATR2/").endsWith(".png");
        assertThat(p.str("$.uploadUrl")).startsWith("/api/v1/files/uploads/avatar/").contains("?expires=", "&sig=");

        // Not served before the bytes arrive.
        assertThat(download(p.str("$.fileUrl")).getStatus()).isEqualTo(404);
        assertThat(upload(p.str("$.uploadUrl"), "image/png", PNG).getStatus()).isEqualTo(200);
        MockHttpServletResponse file = download(p.str("$.fileUrl"));
        assertThat(file.getStatus()).isEqualTo(200);
        assertThat(file.getContentType()).isEqualTo("image/png");
        assertThat(file.getContentAsByteArray()).isEqualTo(PNG);
        assertThat(file.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");

        // The upload link works once; the file can then be used as the profile photo.
        assertThat(upload(p.str("$.uploadUrl"), "image/png", PNG).getStatus()).isEqualTo(409);
        Res me = call("PUT", "/me/avatar", "{\"url\":\"" + p.str("$.fileUrl") + "\"}");
        assertThat(me.str("$.avatarUrl")).isEqualTo(p.str("$.fileUrl"));
    }

    @Test
    void refusesOtherFilesTooLargeFilesAndPdfsOutsideChat() throws Exception {
        Res pdf = presign("AVATAR", "application/pdf", 100);
        assertThat(pdf.status()).isEqualTo(422);
        assertThat(pdf.str("$.errors[0].field")).isEqualTo("contentType");
        assertThat(pdf.str("$.errors[0].message")).isEqualTo("Use a JPEG, PNG or WebP image.");
        assertThat(presign("MESSAGE_ATTACHMENT", "application/pdf", 100).status()).isEqualTo(200);
        Res big = presign("PORTFOLIO", "image/jpeg", 10L * 1024 * 1024 + 1);
        assertThat(big.str("$.errors[0].message")).isEqualTo("Images can be at most 10 MB.");
        assertThat(presign("SELFIE", "image/png", 10).str("$.errors[0].field")).isEqualTo("purpose");
        assertThat(presign("AVATAR", "image/gif", 10).str("$.errors[0].field")).isEqualTo("contentType");
    }

    @Test
    void theUploadLinkMustBeUnchangedUnexpiredAndMatchTheAnnouncedFile() throws Exception {
        String url = presign("COVER", "image/png", PNG.length).str("$.uploadUrl");
        assertThat(upload(url.replaceAll("sig=[0-9a-f]{4}", "sig=0000"), "image/png", PNG).getStatus()).isEqualTo(403);
        assertThat(upload(url.replace("/cover/", "/avatar/"), "image/png", PNG).getStatus()).isEqualTo(403);
        assertThat(upload(url.replaceAll("&sig=.*", ""), "image/png", PNG).getStatus()).isEqualTo(422);
        assertThat(upload(url, "image/jpeg", PNG).getStatus()).isEqualTo(422);
        byte[] bigger = new byte[PNG.length + 1];
        assertThat(upload(url, "image/png", bigger).getStatus()).isEqualTo(422);
        assertThat(upload(url, "image/png", new byte[0]).getStatus()).isEqualTo(422);

        clock.advance(Duration.ofMinutes(11));
        MockHttpServletResponse late = upload(url, "image/png", PNG);
        assertThat(late.getStatus()).isEqualTo(403);
        assertThat(late.getContentAsString()).contains("UPLOAD_REFUSED", "expired");
    }

    @Test
    void presignNeedsASignInAndUnknownFilesAre404() throws Exception {
        // Path traversal: Spring Security's firewall refuses it (400) before the file lookup would (404).
        assertThat(download("/api/v1/files/avatar/nobody/../../secret.png").getStatus()).isIn(400, 404);
        assertThat(download("/api/v1/files/avatar/nope.png").getStatus()).isEqualTo(404);
        signOutLocally();
        assertThat(presign("AVATAR", "image/png", 10).status()).isEqualTo(401);
    }
}
