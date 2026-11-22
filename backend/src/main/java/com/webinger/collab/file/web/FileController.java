package com.webinger.collab.file.web;

import com.webinger.collab.file.service.FileService;
import com.webinger.collab.file.service.FileService.Download;
import com.webinger.collab.file.service.FileService.PresignRequest;
import com.webinger.collab.file.service.FileService.PresignResponse;
import com.webinger.collab.security.AuthUser;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Duration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /files/presign (signed in). The upload and download routes stand in for S3 and need no token:
 * the upload URL carries its own signature, and files are public like CloudFront URLs would be.
 */
@RestController
@RequestMapping("/files")
public class FileController {
    private final FileService files;

    public FileController(FileService files) {
        this.files = files;
    }

    @PostMapping("/presign")
    public PresignResponse presign(@AuthenticationPrincipal AuthUser me, @RequestBody PresignRequest body) {
        return files.presign(me, body);
    }

    @PutMapping("/uploads/{*key}")
    public ResponseEntity<Void> upload(@PathVariable String key, @RequestParam long expires, @RequestParam String sig, HttpServletRequest req) throws IOException {
        files.receive(key.substring(1), expires, sig, req.getContentType(), req.getInputStream());
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{*key}")
    public ResponseEntity<Resource> download(@PathVariable String key) {
        Download d = files.download(key.substring(1));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(d.contentType()))
                .contentLength(d.sizeBytes())
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CONTENT_DISPOSITION, d.contentType().equals("application/pdf") ? "attachment" : "inline")
                .body(new FileSystemResource(d.path()));
    }
}
