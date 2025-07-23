const { auth } = require('../config/firebase');

const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided or invalid format' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || decodedToken.email
    };
    next();
  } catch (error) {
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token has expired.' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// --- NEW: Optional middleware to check for a token without failing ---
const optionalVerifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      // If a token is present, try to verify it
      const decodedToken = await auth.verifyIdToken(token);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email
      };
    } catch (error) {
      // If token is invalid/expired, just ignore it and proceed
      // req.user will remain undefined
      console.log('Optional auth: Invalid token provided, proceeding as guest.');
    }
  }
  // Always proceed to the next middleware/route handler
  next();
};


module.exports = { 
  verifyFirebaseToken,
  optionalVerifyFirebaseToken // <-- Export the new function
};
