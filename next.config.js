/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Garantiza que los JSON de la BD (fuera de public/) se incluyan en el
    // bundle de las funciones serverless de Vercel.
    outputFileTracingIncludes: {
      '/api/**/*': ['./data/*.json'],
    },
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    }
    return config
  },
}

module.exports = nextConfig
