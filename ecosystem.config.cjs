/**
 * 文件说明: 提供 HTTP Proxy 的 PM2 生产启动配置，直接运行构建后的服务产物。
 * 参考资料: package.json, src/server.ts
 */

module.exports = {
  apps: [
    {
      name: "http-proxy",
      script: "dist/src/server.js",
      cwd: __dirname,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOST: "0.0.0.0",
      },
    },
  ],
};
