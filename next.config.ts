import type { NextConfig } from "next";

// For the browser proxy: route through the internal Docker network to Supabase Kong,
// bypassing Traefik and its broken SSL certificates entirely.
const supabaseInternalUrl = process.env.SUPABASE_INTERNAL_URL || 'http://cogneapp-kong:8000'

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: '/supabase-proxy/:path*',
        destination: `${supabaseInternalUrl}/:path*`,
      },
    ]
  },
};

export default nextConfig;
