const redisClient = require('../config/redis');

// Generic cache middleware
const cache = (keyGenerator, ttlSeconds = 300) => {
  return async (req, res, next) => {
    try {
      // Generate cache key
      const cacheKey = typeof keyGenerator === 'function' 
        ? keyGenerator(req) 
        : keyGenerator;

      console.log(`🔍 Checking cache for key: ${cacheKey}`);

      // Try to get from cache
      const cachedData = await redisClient.get(cacheKey);
      
      if (cachedData) {
        console.log(`✅ Cache HIT for key: ${cacheKey}`);
        return res.json(cachedData);
      }

      console.log(`❌ Cache MISS for key: ${cacheKey}`);

      // Store original res.json to intercept response
      const originalJson = res.json;
      res.json = function(data) {
        // Cache the response data
        redisClient.set(cacheKey, data, ttlSeconds)
          .then(() => console.log(`💾 Cached data for key: ${cacheKey}`))
          .catch(err => console.error('Cache SET error:', err));
        
        // Call original res.json
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next(); // Continue without caching if Redis fails
    }
  };
};

// Project-specific cache middleware
const cacheProject = cache((req) => `project:${req.params.id}`, 300); // 5 minutes
const cacheUser = cache((req) => `user:${req.params.username}`, 600); // 10 minutes
const cacheProjectsList = cache((req) => {
  const query = req.query;
  const queryString = Object.keys(query).sort().map(key => `${key}:${query[key]}`).join('|');
  return `projects:list:${queryString}`;
}, 120); // 2 minutes

module.exports = {
  cache,
  cacheProject,
  cacheUser,
  cacheProjectsList
};