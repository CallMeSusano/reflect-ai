import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ['192.168.1.180.sslip.io', 'reflectai.ddns.net'],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "unsafe-none", // Allow Firebase auth popups to close correctly
          },
        ],
      },
    ];
  },
};

export default nextConfig;
