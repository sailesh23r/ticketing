/* eslint-disable */
const path = require("path");

module.exports = {
  apps: [
    {
      name: "ticketing-next",
      // Run from the Next.js project directory dynamically (clone-location agnostic)
      cwd: path.resolve(__dirname).replace(/\\/g, "/"),
      // Use Next.js binary directly (more reliable than wrapping via npm on Windows)
      script: "node_modules/next/dist/bin/next",
      // Bind to all interfaces so it's reachable on LAN
      args: "start -p 3000 -H 0.0.0.0",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
}
