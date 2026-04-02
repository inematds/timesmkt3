const { getEnv } = require('../config/env');

// Redis connection config for BullMQ (ioredis-compatible format)
// Supports both local Redis and Upstash (remote with TLS)
const redisEndpoint = getEnv('UPSTASH_REDIS_ENDPOINT', 'localhost');
const redisPassword = getEnv('UPSTASH_REDIS_PASSWORD', '');
const isLocal = redisEndpoint === 'localhost' || redisEndpoint === '127.0.0.1';

const redisConnection = {
  host: redisEndpoint,
  port: 6379,
  ...(redisPassword && { password: redisPassword }),
  ...(!isLocal && { tls: {} }),
};

module.exports = { redisConnection };
