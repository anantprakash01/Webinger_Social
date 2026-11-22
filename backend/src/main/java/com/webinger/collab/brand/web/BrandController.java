package com.webinger.collab.brand.web;

import com.webinger.collab.brand.service.BrandService;
import com.webinger.collab.brand.service.BrandService.BrandProfileDto;
import com.webinger.collab.brand.service.BrandService.BrandProfileInput;
import com.webinger.collab.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET/PUT /brands/me/profile (FR-05). Brand stats (FR-71) come with the orders module. */
@RestController
@RequestMapping("/brands/me")
public class BrandController {
    private final BrandService brands;

    public BrandController(BrandService brands) {
        this.brands = brands;
    }

    @GetMapping("/profile")
    public BrandProfileDto profile(@AuthenticationPrincipal AuthUser me) {
        return brands.get(me);
    }

    @PutMapping("/profile")
    public BrandProfileDto update(@AuthenticationPrincipal AuthUser me, @RequestBody BrandProfileInput body) {
        return brands.update(me, body);
    }
}
