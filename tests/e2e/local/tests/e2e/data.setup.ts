// Placeholder data-setup project. No worker-scope data-creation fixtures are
// required for the current spec set; this file exists so the playwright.config
// "data-setup" project has a target to match. Add tests here only when a spec
// genuinely depends on pre-seeded data.
import { test as setup } from "@playwright/test";

setup("noop", async () => {
  // Intentionally empty.
});
