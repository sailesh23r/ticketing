import type { NextConfig } from "next";

// Added transpilePackages to ensure ESM-only dependencies like tailwind-merge are
// transformed by Next's compiler. This can resolve runtime SyntaxError issues
// (Unexpected token 'const' or 'export') that occur when a package ships
// untranspiled modern syntax and the bundler in your current setup inlines it
// without processing.
const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow dev server access from production domain (only relevant in dev mode)
  allowedDevOrigins: ["https://cyberloop.xeltr.com", "http://cyberloop.xeltr.com"],
  // Keep existing config options here if you add more later.
  transpilePackages: ["tailwind-merge"],
};

export default nextConfig;
