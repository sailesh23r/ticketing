module.exports = {
  apps: [
    {
      name: "nextjs-app",
      // Run from your actual Next.js project directory
      cwd: "C:/Users/Test.HMI-TEST-PC/Downloads/ticketing-system/front",
      // Use Next.js binary directly (more reliable than wrapping via npm on Windows)
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
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
