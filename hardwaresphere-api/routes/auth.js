const express = require('express');
const { firestore } = require('../config/firebase'); 
const { verifyFirebaseToken } = require('../middleware/auth');

// 🚀 NEW: Import Redis caching
const { cache } = require('../middleware/cache');
const redisClient = require('../config/redis');

const router = express.Router();

// 🚀 NEW: Cache middleware for current user (short cache - 2 minutes)
const cacheCurrentUser = cache((req) => `user:${req.user.uid}:auth`, 120);

// Get current user info (WITH CACHING)
router.get('/me', verifyFirebaseToken, cacheCurrentUser, async (req, res) => {
  try {
    const userDoc = await firestore 
      .collection('users')
      .doc(req.user.uid)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: req.user.uid,
      ...userDoc.data()
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile (WITH CACHE INVALIDATION)
router.put('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const { displayName, bio, github, linkedin } = req.body;
    
    const updateData = {
      displayName,
      bio,
      github,
      linkedin,
      updatedAt: new Date()
    };

    await firestore
      .collection('users')
      .doc(req.user.uid)
      .update(updateData);

    // 🚀 NEW: Invalidate current user cache
    await redisClient.del(`user:${req.user.uid}:auth`);
    console.log(`💾 Cache invalidated for auth user: ${req.user.uid}`);

    // 🚀 NEW: Also invalidate user profile cache (if username exists)
    const userDoc = await firestore.collection('users').doc(req.user.uid).get();
    const username = userDoc.data()?.username;
    if (username) {
      await redisClient.del(`user:${username}:profile`);
      console.log(`💾 Cache invalidated for user profile: ${username}`);
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;