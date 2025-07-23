const express = require('express');
// Import the initialized firestore object directly from your config
const { firestore } = require('../config/firebase'); 
const { verifyFirebaseToken } = require('../middleware/auth');
const router = express.Router();

// Get current user info
router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    // --- FIX: Use the firestore object directly ---
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

// Update user profile
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

    // --- FIX: Use the firestore object directly ---
    await firestore
      .collection('users')
      .doc(req.user.uid)
      .update(updateData);

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;