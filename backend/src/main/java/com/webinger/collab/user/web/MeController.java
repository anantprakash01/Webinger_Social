package com.webinger.collab.user.web;

import com.webinger.collab.common.web.Rules;
import com.webinger.collab.common.web.Rules.ValidName;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.service.UserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /me, PATCH /me, PUT /me/avatar (contract tag Users). */
@RestController
@RequestMapping("/me")
public class MeController {
    private final UserService users;

    public MeController(UserService users) {
        this.users = users;
    }

    public record UpdateMeRequest(@ValidName(optional = true) String name) {
        public UpdateMeRequest {
            name = Rules.trim(name);
        }
    }

    public record AvatarUpdate(@Size(max = 2048, message = "Use a shorter link.") String url) {}

    @GetMapping
    public MeDto me(@AuthenticationPrincipal AuthUser me) {
        return users.me(me.userId(), me.impersonatorName());
    }

    @PatchMapping
    public MeDto update(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody UpdateMeRequest body) {
        return users.rename(me.userId(), body.name());
    }

    @PutMapping("/avatar")
    public MeDto avatar(@AuthenticationPrincipal AuthUser me, @Valid @RequestBody AvatarUpdate body) {
        return users.setAvatar(me.userId(), body.url());
    }
}
