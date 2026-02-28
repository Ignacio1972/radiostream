module.exports = {
  apps: [{
    name: 'radiostream',
    script: 'backend/server.js',
    cwd: '/var/www/radiostream',
    env: {
      NODE_ENV: 'production',
      PORT: 4001
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M'
  }]
};
