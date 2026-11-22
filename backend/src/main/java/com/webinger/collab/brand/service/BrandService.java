package com.webinger.collab.brand.service;

import com.webinger.collab.brand.domain.BrandProfile;
import com.webinger.collab.brand.repository.BrandProfileRepository;
import com.webinger.collab.common.Catalog;
import com.webinger.collab.common.web.ApiException;
import com.webinger.collab.common.web.FieldCheck;
import com.webinger.collab.common.web.Urls;
import com.webinger.collab.security.AuthUser;
import com.webinger.collab.user.domain.Role;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Clock;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Brand company profile (FR-05), ported from the mock's handlers/brands.ts and features/brands/schemas.ts. */
@Service
public class BrandService {
    private final BrandProfileRepository brands;
    private final Clock clock;

    public BrandService(BrandProfileRepository brands, Clock clock) {
        this.brands = brands;
        this.clock = clock;
    }

    public record BrandProfileDto(String companyName, String website, String logoUrl, String industry, String country, String plan, String state, String gstin) {}

    public record BrandProfileInput(String companyName, String website, String logoUrl, String industry, String country, String state, String gstin) {}

    private BrandProfile own(AuthUser me) {
        if (me.role() != Role.BRAND) throw new ApiException(HttpStatus.FORBIDDEN, "Only brand accounts have a company profile.", "ROLE_NOT_ALLOWED");
        return brands.findByUserId(me.userId()).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Brand profile not found.", "NOT_FOUND"));
    }

    static BrandProfileDto toDto(BrandProfile b) {
        return new BrandProfileDto(b.getCompanyName(), b.getWebsite(), b.getLogoUrl(), b.getIndustry(), b.getCountry(), b.getPlan(), b.getState(), b.getGstin());
    }

    /** What orders show and need about a brand: name and logo, plan (fees), state and GSTIN (taxes). */
    public record BrandInfo(Long userId, String companyName, String logoUrl, String plan, String state, String gstin) {}

    @Transactional(readOnly = true)
    public java.util.Map<Long, BrandInfo> infoOf(java.util.Collection<Long> brandUserIds) {
        java.util.Map<Long, BrandInfo> out = new java.util.HashMap<>();
        for (Long id : brandUserIds) {
            brands.findByUserId(id).ifPresent(b -> out.put(id, new BrandInfo(id, b.getCompanyName(), b.getLogoUrl(), b.getPlan(), b.getState(), b.getGstin())));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public BrandInfo infoOf(Long brandUserId) {
        return infoOf(java.util.List.of(brandUserId)).getOrDefault(brandUserId, new BrandInfo(brandUserId, null, null, "FREE", null, null));
    }

    @Transactional(readOnly = true)
    public BrandProfileDto get(AuthUser me) {
        return toDto(own(me));
    }

    @Transactional
    public BrandProfileDto update(AuthUser me, BrandProfileInput in) {
        BrandProfile b = own(me);
        FieldCheck c = new FieldCheck();
        String company = c.text("companyName", in.companyName(), 2, 100, "Enter your company name.", "Use at most 100 characters.");
        String website = website(c, in.website());
        String logo = null;
        if (in.logoUrl() != null) {
            logo = in.logoUrl().trim();
            if (!Urls.isSafeImage(logo)) c.fail("logoUrl", "Upload an image instead.");
        }
        c.oneOf("industry", in.industry(), Catalog.INDUSTRIES, "Choose an industry.");
        String country = in.country() == null ? null : in.country().trim().toUpperCase(Locale.ROOT);
        if (country == null || country.length() != 2) c.fail("country", "Choose your country.");
        String state = in.state() == null ? null : in.state().trim().toUpperCase(Locale.ROOT);
        String gstin = in.gstin() == null || in.gstin().isBlank() ? null : in.gstin().trim().toUpperCase(Locale.ROOT);
        if ("IN".equals(country)) {
            var st = Catalog.indianState(state);
            if (st.isEmpty()) c.fail("state", "Choose your state (needed for GST on our invoices).");
            if (gstin != null) {
                if (!gstin.matches(Catalog.GSTIN_PATTERN)) c.fail("gstin", "Enter a 15-character GSTIN, e.g. 29ABCDE1234F1Z5.");
                else if (st.isPresent() && !gstin.startsWith(st.get().gst())) c.fail("gstin", "A " + st.get().name() + " GSTIN starts with " + st.get().gst() + ".");
            }
        }
        c.throwIfAny();
        b.setCompanyName(company);
        b.setWebsite(website);
        b.setLogoUrl(logo);
        b.setIndustry(in.industry());
        b.setCountry(country);
        b.setState("IN".equals(country) ? state : null);
        b.setGstin("IN".equals(country) ? gstin : null);
        b.setUpdatedAt(clock.instant());
        return toDto(b);
    }

    /** Accepts "example.com", "http://…" or "https://…" and stores https://… without a trailing slash; empty = none. */
    static String website(FieldCheck c, String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.isEmpty()) return null;
        if (s.length() > 200) return c.fail("website", "Use at most 200 characters.");
        String withScheme = s.matches("(?i)^https?://.*") ? s.replaceFirst("(?i)^http://", "https://").replaceFirst("(?i)^https://", "https://") : "https://" + s;
        try {
            URI u = new URI(withScheme);
            String host = u.getHost();
            if (host == null || !host.contains(".") || u.getUserInfo() != null) return c.fail("website", "Enter a website like yourbrand.com");
            StringBuilder out = new StringBuilder("https://").append(host.toLowerCase(Locale.ROOT));
            if (u.getPort() != -1) out.append(':').append(u.getPort());
            if (u.getRawPath() != null) out.append(u.getRawPath());
            if (u.getRawQuery() != null) out.append('?').append(u.getRawQuery());
            String result = out.toString();
            return result.endsWith("/") ? result.substring(0, result.length() - 1) : result;
        } catch (URISyntaxException e) {
            return c.fail("website", "Enter a website like yourbrand.com");
        }
    }
}
