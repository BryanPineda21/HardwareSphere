// server.js
require('dotenv').config(); // Load environment variables first

const app = require('./app'); // Assuming your main Express app is exported from app.js
const PORT = process.env.PORT || 3001; // Get port from environment or default to 3000

app.listen(PORT, () => { // Line 7 in your case
  console.log(`Server running on port ${PORT}`);
});


