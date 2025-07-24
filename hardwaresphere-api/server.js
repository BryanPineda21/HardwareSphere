const app = require('./app');
const redisClient = require('./config/redis')

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Connect to Redis first
    await redisClient.connect();
    
    // Start Express server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Redis status: ${redisClient.isConnected ? 'Connected' : 'Disconnected'}`);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

startServer();
