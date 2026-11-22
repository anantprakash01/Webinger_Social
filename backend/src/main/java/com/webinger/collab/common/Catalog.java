package com.webinger.collab.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Fixed lists shared with the frontend (frontend/src/lib/catalog.ts and api/mock/tax.ts) and the enums in
 * docs/api/openapi.yaml. Keep them in step when either side changes.
 */
public final class Catalog {
    private Catalog() {}

    public static final String CURRENCY = "INR";

    public static final Set<String> PLATFORMS = Set.of("INSTAGRAM", "TIKTOK", "YOUTUBE", "UGC");

    /** Niche code → label, in the catalog's order (keyword search also matches the label). */
    public static final Map<String, String> NICHES = ordered(
            "BEAUTY", "Beauty", "FASHION", "Fashion", "FITNESS", "Fitness", "FOOD", "Food & drink", "TRAVEL", "Travel",
            "TECH", "Tech", "GAMING", "Gaming", "LIFESTYLE", "Lifestyle", "PARENTING", "Parenting", "FINANCE", "Finance",
            "HOME", "Home & decor", "PETS", "Pets", "MUSIC", "Music", "EDUCATION", "Education", "COMEDY", "Comedy",
            "WELLNESS", "Health & wellness", "SUSTAINABILITY", "Sustainability", "AUTOMOTIVE", "Automotive");

    public static final Set<String> GENDERS = Set.of("FEMALE", "MALE", "NON_BINARY");

    public static final Set<String> INDUSTRIES = Set.of("BEAUTY", "FASHION", "FOOD", "HEALTH", "HOME", "TECH", "TRAVEL", "FINANCE", "EDUCATION", "PETS", "AGENCY", "OTHER");

    /** Usernames that would clash with routes or confuse people. */
    public static final Set<String> RESERVED_USERNAMES = Set.of("me", "admin", "api", "u", "search", "login", "signup", "support", "help", "brand", "creator", "checkout", "settings", "webinger", "collab");

    public record Location(String country, String label, List<String> cities) {}

    /** Countries and the cities search suggests; India first (launch market). */
    public static final List<Location> LOCATIONS = List.of(
            new Location("IN", "India", List.of("Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Kochi", "Chandigarh", "Lucknow", "Indore", "Goa", "Guwahati")),
            new Location("AE", "United Arab Emirates", List.of("Dubai", "Abu Dhabi")),
            new Location("GB", "United Kingdom", List.of("London", "Manchester", "Bristol")),
            new Location("US", "United States", List.of("New York", "Los Angeles", "Austin", "Miami", "Chicago")),
            new Location("SG", "Singapore", List.of("Singapore")),
            new Location("CA", "Canada", List.of("Toronto", "Vancouver", "Montreal")),
            new Location("AU", "Australia", List.of("Sydney", "Melbourne")),
            new Location("DE", "Germany", List.of("Berlin", "Munich")),
            new Location("BR", "Brazil", List.of("São Paulo", "Rio de Janeiro")),
            new Location("ES", "Spain", List.of("Madrid", "Barcelona")));

    public record IndianState(String code, String gst, String name) {}

    /** State code → GST state code (first two digits of a GSTIN). */
    public static final List<IndianState> INDIAN_STATES = List.of(
            new IndianState("AN", "35", "Andaman and Nicobar Islands"), new IndianState("AP", "37", "Andhra Pradesh"),
            new IndianState("AR", "12", "Arunachal Pradesh"), new IndianState("AS", "18", "Assam"), new IndianState("BR", "10", "Bihar"),
            new IndianState("CH", "04", "Chandigarh"), new IndianState("CT", "22", "Chhattisgarh"),
            new IndianState("DN", "26", "Dadra and Nagar Haveli and Daman and Diu"), new IndianState("DL", "07", "Delhi"),
            new IndianState("GA", "30", "Goa"), new IndianState("GJ", "24", "Gujarat"), new IndianState("HR", "06", "Haryana"),
            new IndianState("HP", "02", "Himachal Pradesh"), new IndianState("JK", "01", "Jammu and Kashmir"),
            new IndianState("JH", "20", "Jharkhand"), new IndianState("KA", "29", "Karnataka"), new IndianState("KL", "32", "Kerala"),
            new IndianState("LA", "38", "Ladakh"), new IndianState("LD", "31", "Lakshadweep"), new IndianState("MP", "23", "Madhya Pradesh"),
            new IndianState("MH", "27", "Maharashtra"), new IndianState("MN", "14", "Manipur"), new IndianState("ML", "17", "Meghalaya"),
            new IndianState("MZ", "15", "Mizoram"), new IndianState("NL", "13", "Nagaland"), new IndianState("OR", "21", "Odisha"),
            new IndianState("PY", "34", "Puducherry"), new IndianState("PB", "03", "Punjab"), new IndianState("RJ", "08", "Rajasthan"),
            new IndianState("SK", "11", "Sikkim"), new IndianState("TN", "33", "Tamil Nadu"), new IndianState("TG", "36", "Telangana"),
            new IndianState("TR", "16", "Tripura"), new IndianState("UP", "09", "Uttar Pradesh"), new IndianState("UK", "05", "Uttarakhand"),
            new IndianState("WB", "19", "West Bengal"));

    public static Optional<IndianState> indianState(String code) {
        return INDIAN_STATES.stream().filter(s -> s.code().equals(code)).findFirst();
    }

    /** GSTIN: 2-digit state code + PAN + entity number + Z + checksum character. */
    public static final String GSTIN_PATTERN = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$";

    private static Map<String, String> ordered(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return java.util.Collections.unmodifiableMap(m);
    }
}
