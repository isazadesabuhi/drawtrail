import { fileURLToPath } from 'node:url';
import { readServerConfig } from './src/lib/env.mjs';

readServerConfig(process.env);

/** @type {import('next').NextConfig} */
const config = {
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  turbopack: { root: fileURLToPath(new URL('../..', import.meta.url)) },
  reactStrictMode: true,
  transpilePackages: [
    '@drawtrail/types',
    '@drawtrail/validation',
    '@drawtrail/geo-utils',
    '@drawtrail/api-client',
  ],
};

export default config;
