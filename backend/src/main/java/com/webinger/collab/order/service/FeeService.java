package com.webinger.collab.order.service;

import com.webinger.collab.order.domain.FeeConfig;
import com.webinger.collab.order.repository.FeeConfigRepository;
import com.webinger.collab.order.service.Money.FeeRates;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fees per brand plan (FR-66, FR-83): the newest fee_configs row for the plan applies to new orders and is
 * copied onto the order. Also the public GET /fees with the plan catalogue (frontend lib/plans.ts).
 */
@Service
public class FeeService {
    private final FeeConfigRepository configs;

    public FeeService(FeeConfigRepository configs) {
        this.configs = configs;
    }

    public record Plan(String plan, String name, long monthlyCents, long yearlyCents, int defaultBrandFeeBps, Integer inquiryLimit, String tagline, List<String> features) {}

    public static final List<Plan> PLANS = List.of(
            new Plan("FREE", "Free", 0, 0, 1000, 5, "For trying the marketplace",
                    List.of("Book any creator", "Campaigns and saved lists", "5 pre-booking chats a month", "Escrow on every order")),
            new Plan("PRO", "Pro", 4_999_00, 49_990_00, 500, 50, "For brands hiring every month",
                    List.of("Service fee cut to 5%", "50 pre-booking chats a month", "“Pro brand” badge creators can see", "Priority email support")),
            new Plan("PREMIUM", "Premium", 14_999_00, 1_49_990_00, 200, null, "For agencies and large teams",
                    List.of("Service fee cut to 2%", "Unlimited pre-booking chats", "“Premium brand” badge", "Disputes handled first", "Dedicated account manager")));

    public record PlanOffer(String plan, String name, String tagline, long monthlyCents, long yearlyCents, int gstBps, int brandFeeBps, int creatorFeeBps,
            Integer inquiryLimit, List<String> features) {}

    public record PublicFees(String plan, int brandFeeBps, int creatorFeeBps, List<PlanOffer> plans) {}

    /** The fees that apply to a new order from a brand on this plan. */
    @Transactional(readOnly = true)
    public FeeRates ratesFor(String plan) {
        String p = plan == null ? "FREE" : plan;
        return configs.findFirstByPlanOrderByEffectiveFromDescIdDesc(p).map(c -> new FeeRates(c.getBrandFeeBps(), c.getCreatorFeeBps()))
                .orElseGet(() -> {
                    int brand = PLANS.stream().filter(x -> x.plan().equals(p)).findFirst().map(Plan::defaultBrandFeeBps).orElse(1000);
                    int creator = configs.findFirstByPlanOrderByEffectiveFromDescIdDesc("FREE").map(FeeConfig::getCreatorFeeBps).orElse(1500);
                    return new FeeRates(brand, creator);
                });
    }

    /** GET /fees: the Free plan's rates and every plan's offer. */
    @Transactional(readOnly = true)
    public PublicFees publicFees() {
        FeeRates free = ratesFor("FREE");
        List<PlanOffer> offers = PLANS.stream().map(p -> {
            FeeRates r = ratesFor(p.plan());
            return new PlanOffer(p.plan(), p.name(), p.tagline(), p.monthlyCents(), p.yearlyCents(), Money.GST_BPS, r.brandFeeBps(), r.creatorFeeBps(), p.inquiryLimit(),
                    p.features());
        }).toList();
        return new PublicFees("FREE", free.brandFeeBps(), free.creatorFeeBps(), offers);
    }
}
