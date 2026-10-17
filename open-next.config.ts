import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();

export default {
  ...config,
  // `npm run build` runs OpenNext (so Cloudflare's default "npm run build" +
  // "npx wrangler deploy" works); OpenNext itself must call plain Next.js.
  buildCommand: "npx next build",
};
