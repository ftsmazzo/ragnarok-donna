import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();

export default withSentryConfig(nextConfig, {
  org: sentryOrg || undefined,
  project: sentryProject || undefined,
  authToken: sentryAuthToken || undefined,
  silent: !process.env.CI,
  // Sem token: não quebra o build (source maps ficam de fora).
  sourcemaps: {
    disable: !sentryAuthToken,
  },
  widenClientFileUpload: Boolean(sentryAuthToken),
  disableLogger: true,
  automaticVercelMonitors: false,
});
