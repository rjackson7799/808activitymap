import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public pages are SSG/ISR (TSD §1); per-route config arrives with the
  // public-surface checkpoint. Brand strings come only from env (D27).
};

export default nextConfig;
