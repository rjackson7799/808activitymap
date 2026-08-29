import type { NextConfig } from "next";
import { createSecurityHeaders } from "./config/security-headers";

const nextConfig: NextConfig = {
  // Public pages are SSG/ISR (TSD §1); per-route config arrives with the
  // public-surface checkpoint. Brand strings come only from env (D27).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: createSecurityHeaders(process.env.APP_ENV),
      },
    ];
  },
};

export default nextConfig;
