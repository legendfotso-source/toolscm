import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the access test sets this: it builds the site a second time WITH
  // accounts switched on, and must not overwrite the ordinary build the other
  // browser tests are about to serve. Unset, this is Next's own default.
  distDir: process.env.TOOLSCM_DIST_DIR || ".next",
};

export default nextConfig;
