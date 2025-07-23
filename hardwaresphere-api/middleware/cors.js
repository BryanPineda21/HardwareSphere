const cors = require('cors');

const corsOptions = {
  origin: [
    'http://localhost:3000',  // Your Next.js dev server
    process.env.CORS_ORIGIN  // Your production domain
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

module.exports = cors(corsOptions);