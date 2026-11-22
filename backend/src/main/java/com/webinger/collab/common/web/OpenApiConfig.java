package com.webinger.collab.common.web;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger UI (/api/v1/swagger-ui) and the generated spec (/api/v1/v3/api-docs). Declares the bearer token so
 * the UI's Authorize button can call signed-in endpoints: sign in with POST /auth/login and paste `accessToken`.
 * The hand-written contract stays frontend/docs/api/openapi.yaml.
 */
@Configuration
public class OpenApiConfig {
    @Bean
    OpenAPI collabOpenApi() {
        return new OpenAPI()
                .info(new Info().title("Webinger Collab API").version("v1")
                        .description("Generated from the running code. The contract is frontend/docs/api/openapi.yaml. "
                                + "Demo accounts (h2/demo profile): brand@demo.test, creator@demo.test, newcreator@demo.test, admin@demo.test — password demo1234."))
                .components(new Components().addSecuritySchemes("bearerAuth",
                        new SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT")))
                .addSecurityItem(new SecurityRequirement().addList("bearerAuth"));
    }
}
