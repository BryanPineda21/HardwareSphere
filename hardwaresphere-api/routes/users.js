const express = require('express');
const { verifyFirebaseToken, optionalVerifyFirebaseToken } = require('../middleware/auth');
const { firestore, admin } = require('../config/firebase');
const fileService = require('../services/file-service');
const multer = require('multer');
const { URL } = require('url');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

// Use memory storage to handle file buffers directly
const upload = multer({ storage: multer.memoryStorage() });

const parseUsername = (input, hostname) => {
  if (!input) return '';
  try {
    if (input.startsWith('http')) {
      const url = new URL(input);
      if (url.hostname.includes(hostname)) {
        return path.basename(url.pathname);
      }
    }
    return input.split('/').pop();
  } catch (error) {
    return input;
  }
};

// Get public user profile by username (no changes needed here)
router.get('/:username', optionalVerifyFirebaseToken, async (req, res) => {
  try {
    const username = req.params.username;
    const userQuery = await firestore.collection('users').where('username', '==', username).limit(1).get();
    if (userQuery.empty) return res.status(404).json({ error: 'User not found' });

    const userDoc = userQuery.docs[0];
    const userData = userDoc.data();
    
    let projectsQuery = firestore.collection('projects').where('userId', '==', userDoc.id);
    
    const isOwner = req.user && req.user.uid === userDoc.id;
    if (!isOwner) {
      projectsQuery = projectsQuery.where('visibility', '==', 'public');
    }

    const allProjectsSnapshot = await projectsQuery.orderBy('createdAt', 'desc').get();
    const allProjects = allProjectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const pinnedProjects = allProjects.filter(p => p.isPinned);
    const otherProjects = allProjects.filter(p => !p.isPinned);

    const publicProfile = {
      id: userDoc.id,
      displayName: userData.displayName,
      username: userData.username,
      bio: userData.bio || '',
      avatar: userData.avatar,
      backgroundImage: userData.backgroundImage,
      github: userData.github,
      linkedin: userData.linkedin,
      skills: userData.skills || [],
      location: userData.location || '',
      stats: userData.stats || { totalProjects: 0, totalViews: 0, totalLikes: 0 },
      createdAt: userData.createdAt?.toDate?.() || userData.createdAt,
      pinnedProjects,
      otherProjects
    };

    res.json(publicProfile);
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// --- REVISED: Update current user profile endpoint ---
router.put(
  '/me',
  verifyFirebaseToken,
  upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'backgroundImage', maxCount: 1 }]),
  async (req, res) => {
    const { uid } = req.user;
    const { displayName, username, bio, github, linkedin, location, skills } = req.body;
    const files = req.files;

    try {
      const userRef = firestore.collection('users').doc(uid);
      const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

      // --- Username Validation ---
      if (username) {
        const currentUserDoc = await userRef.get();
        const currentUsername = currentUserDoc.data()?.username;
        if (username !== currentUsername) {
          const usernameQuery = await firestore.collection('users').where('username', '==', username).limit(1).get();
          if (!usernameQuery.empty) {
            return res.status(400).json({ error: 'Username is already taken. Please choose another.' });
          }
          updateData.username = username;
        }
      }

      // --- File Upload Logic with Cache Busting ---
      const uploadFile = async (file, type) => {
        // --- FIX: Add a timestamp to the filename to ensure a unique URL ---
        const timestamp = Date.now();
        const originalFilename = `${type}-${timestamp}.jpg`;
        const tempPath = `/tmp/${uid}-${originalFilename}`;
        
        await fs.writeFile(tempPath, file.buffer);
        
        const storagePath = `users/${uid}/${originalFilename}`;
        
        const result = await fileService.uploadToFirebase({
          path: tempPath,
          originalname: originalFilename,
          mimetype: file.mimetype,
        }, storagePath);
        
        await fs.unlink(tempPath);
        return result.url;
      };

      if (files?.avatar?.[0]) {
        updateData.avatar = await uploadFile(files.avatar[0], 'avatar');
      }
      if (files?.backgroundImage?.[0]) {
        updateData.backgroundImage = await uploadFile(files.backgroundImage[0], 'background');
      }

      // --- Text and Array Fields ---
      if (displayName !== undefined) updateData.displayName = displayName;
      if (bio !== undefined) updateData.bio = bio;
      if (location !== undefined) updateData.location = location;
      if (github !== undefined) updateData.github = parseUsername(github, 'github.com');
      if (linkedin !== undefined) updateData.linkedin = parseUsername(linkedin, 'linkedin.com');
      
      if (skills !== undefined) {
        try {
          updateData.skills = JSON.parse(skills);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid format for skills. Expected a JSON array.' });
        }
      }

      // --- Atomically Update Firestore ---
      await userRef.set(updateData, { merge: true });

      const updatedUserDoc = await userRef.get();
      res.json({
        message: 'Profile updated successfully',
        updatedProfile: updatedUserDoc.data(),
      });
    } catch (error) {
      console.error(`Error updating profile for user ${uid}:`, error);
      res.status(500).json({ error: 'An unexpected error occurred while updating the profile.' });
    }
  }
);


// Check if a username is available
router.post('/username-check', verifyFirebaseToken, async (req, res) => {
  const { username } = req.body;
  if (!username || username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }

  try {
    const userQuery = await firestore.collection('users').where('username', '==', username).limit(1).get();
    if (userQuery.empty) {
      res.json({ available: true });
    } else {
      if (userQuery.docs[0].id === req.user.uid) {
        res.json({ available: true, isCurrentUser: true });
      } else {
        res.json({ available: false });
      }
    }
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Toggle pin status (no changes needed here)
router.post('/projects/:projectId/toggle-pin', verifyFirebaseToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { uid } = req.user;
    const projectRef = firestore.collection('projects').doc(projectId);

    await firestore.runTransaction(async (transaction) => {
      const projectDoc = await transaction.get(projectRef);
      if (!projectDoc.exists || projectDoc.data().userId !== uid) {
        throw new Error('Project not found or you do not have permission to pin it.');
      }
      const currentlyPinned = projectDoc.data().isPinned === true;
      if (!currentlyPinned) {
        const pinQuery = firestore.collection('projects').where('userId', '==', uid).where('isPinned', '==', true);
        const pinSnapshot = await transaction.get(pinQuery);
        if (pinSnapshot.size >= 4) {
          throw new Error('You can only pin a maximum of 4 projects.');
        }
      }
      transaction.update(projectRef, { isPinned: !currentlyPinned });
    });
    res.json({ success: true, message: 'Pin status updated.' });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ error: error.message || 'Failed to update pin status.' });
  }
});

module.exports = router;
