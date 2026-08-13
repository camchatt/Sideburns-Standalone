import { PRODUCT_NAME } from "@/lib/branding";
import { parseEnv, type AppEnvConfig } from "@/lib/validation/env";
import { APP_SHELL_CACHE_VERSION } from "@/lib/pwa/versioning";

export type AppConfig = {
  env: AppEnvConfig;
  appName: string;
  shellVersion: string;
};

export function loadAppConfig(raw?: Record<string, unknown>): AppConfig {
  const env = parseEnv(raw ?? import.meta.env);
  return {
    env,
    appName: PRODUCT_NAME,
    shellVersion: APP_SHELL_CACHE_VERSION,
  };
}
