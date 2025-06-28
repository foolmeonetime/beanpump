/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Externalize packages that should only run on server
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    
    // Add pg and related database packages to externals for client-side builds
    if (!isServer) {
      config.externals.push('pg', 'pg-hstore', 'pg-pool', 'pg-cloudflare');
      
      // Handle node modules that shouldn't be bundled for client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        dns: false,
        net: false,
        tls: false,
        fs: false,
        'cloudflare:sockets': false,
      };
      
      // Ignore problematic imports in client bundles
      config.plugins.push(
        new config.webpack.IgnorePlugin({
          resourceRegExp: /^(cloudflare:sockets|dns|net|tls|pg|pg-cloudflare)$/,
        })
      );
    }
    
    return config;
  },
  // Ensure server components are properly handled
  experimental: {
    serverComponentsExternalPackages: ['pg', 'pg-pool', 'pg-hstore', 'pg-cloudflare'],
  },
};

export default nextConfig;