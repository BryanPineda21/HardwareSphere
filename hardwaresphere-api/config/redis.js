const { createClient } = require("redis");

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isDevelopment = process.env.NODE_ENV === "development";
  }

  async connect() {
    // Skip Redis in development if no REDIS_URL is provided
    if (this.isDevelopment && !process.env.REDIS_URL) {
      console.log("🔄 Development mode: Redis disabled (no REDIS_URL)");
      return null;
    }

    try {
      this.client = createClient({
        url: process.env.REDIS_URL || "redis://localhost:6379",
      });

      this.client.on("error", (err) => {
        console.error("Redis Client Error:", err);
        this.isConnected = false;
      });

      this.client.on("connect", () => {
        console.log("✅ Redis connected successfully");
        this.isConnected = true;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      console.error("❌ Redis connection failed:", error);
      this.isConnected = false;
      return null;
    }
  }

  async get(key) {
    if (!this.isConnected) return null; // Gracefully fallback
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error("Redis GET error:", error);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 300) {
    if (!this.isConnected) return false; // Gracefully fallback
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Redis SET error:", error);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error("Redis DEL error:", error);
      return false;
    }
  }

  async flushPattern(pattern) {
    if (!this.isConnected) return false;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      console.error("Redis FLUSH error:", error);
      return false;
    }
  }
}

const redisClient = new RedisClient();

module.exports = redisClient;
