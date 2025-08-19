const express = require('express');
const { verifyFirebaseToken, optionalVerifyFirebaseToken } = require('../middleware/auth');
const { firestore, admin, storage } = require('../config/firebase');
const fileService = require('../services/file-service');
const multer = require('multer');
const { URL } = require('url');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp');
// 🚀 NEW: Import Redis caching
const { cache } = require('../middleware/cache');
const redisClient = require('../config/redis');

const router = express.Router();
// Use memory storage to handle file buffers directly
const upload = multer({ storage: multer.memoryStorage() });

// 🚀 NEW: Compress user images
async function compressUserImage(inputPath, originalName, type) {
  const ext = path.extname(originalName).toLowerCase();
  const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
  
  if (!isImage) return null;
  
  const compressedPath = inputPath + '_compressed.webp';
  
  // Different sizes for different image types
  const maxWidth = type === 'avatar' ? 400 : 1920; // Avatar: 400px, Background: 1920px
  const quality = type === 'avatar' ? 85 : 75; // Higher quality for avatars
  
  try {
    await sharp(inputPath)
      .resize(maxWidth, null, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .webp({ 
        quality: quality,
        effort: 6
      })
      .toFile(compressedPath);
    
    return compressedPath;
  } catch (error) {
    console.warn(`User image compression failed for ${originalName}:`, error.message);
    return null;
  }
}

// Add generateSignedUrl function
async function generateSignedUrl(filePath) {
  if (!filePath) return null;
  
  const options = {
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
  };

  try {
    const [url] = await storage.bucket().file(filePath).getSignedUrl(options);
    return url;
  } catch (error) {
    console.warn(`Could not generate signed URL for ${filePath}: ${error.message}`);
    return null;
  }
}

// 🚀 NEW: Cache middleware for user profiles (10 minutes)
const cacheUserProfile = cache((req) => `user:${req.params.username}:profile`, 600);

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

// Get public user profile by username (WITH CACHING)
router.get('/:username', optionalVerifyFirebaseToken, cacheUserProfile, async (req, res) => {
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

    // Generate signed URLs for thumbnails
    const projectsWithSignedUrls = await Promise.all(
      allProjects.map(async (project) => {
        if (project.files?.thumbnail?.storagePath) {
          const thumbnailUrl = await generateSignedUrl(project.files.thumbnail.storagePath);
          return {
            ...project,
            files: {
              ...project.files,
              thumbnail: {
                ...project.files.thumbnail,
                url: thumbnailUrl
              }
            }
          };
        }
        return project;
      })
    );

    const pinnedProjects = projectsWithSignedUrls.filter(p => p.isPinned);
    const otherProjects = projectsWithSignedUrls.filter(p => !p.isPinned);





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

// --- Update current user profile endpoint (WITH CACHE INVALIDATION) ---
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
      
      // 🚀 NEW: Get current username for cache invalidation
      const currentUserDoc = await userRef.get();
      const currentUserData = currentUserDoc.data();
      const oldUsername = currentUserData?.username;
      
      const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

      // --- Username Validation ---
      if (username) {
        const currentUsername = currentUserData?.username;
        if (username !== currentUsername) {
          const usernameQuery = await firestore.collection('users').where('username', '==', username).limit(1).get();
          if (!usernameQuery.empty) {
            return res.status(400).json({ error: 'Username is already taken. Please choose another.' });
          }
          updateData.username = username;
        }
      }

      // --- File Upload Logic with Compression, Cache Busting, and Cleanup ---
      const uploadFile = async (file, type) => {
        const timestamp = Date.now();
        const tempPath = `/tmp/${uid}-${type}-${timestamp}`;
        
        // Get current storage path for deletion
        const currentStoragePath = currentUserData[type === 'avatar' ? 'avatarStoragePath' : 'backgroundStoragePath'];
        
        // Write buffer to temp file
        await fs.writeFile(tempPath, file.buffer);
        
        // Compress the image
        const compressedPath = await compressUserImage(tempPath, file.originalname, type);
        
        if (compressedPath) {
          // Use compressed version
          const compressedFilename = `${type}-${timestamp}.webp`;
          const storagePath = `users/${uid}/${compressedFilename}`;
          
          const result = await fileService.uploadToFirebase({
            path: compressedPath,
            originalname: compressedFilename,
            mimetype: 'image/webp',
          }, storagePath);
          
          // Clean up temp files
          await fs.unlink(tempPath);
          await fs.unlink(compressedPath);
          
          // Delete old image if it exists
          if (currentStoragePath) {
            try {
              await fileService.deleteFromFirebase(currentStoragePath);
              console.log(`🗑️ Deleted old ${type}: ${currentStoragePath}`);
            } catch (error) {
              console.warn(`Failed to delete old ${type}:`, error.message);
            }
          }
          
          // Return storage path instead of signed URL
          return result.storagePath;
        }
        
        // Fallback to original if compression fails
        const originalFilename = `${type}-${timestamp}${path.extname(file.originalname)}`;
        const storagePath = `users/${uid}/${originalFilename}`;
        
        const result = await fileService.uploadToFirebase({
          path: tempPath,
          originalname: originalFilename,
          mimetype: file.mimetype,
        }, storagePath);
        
        await fs.unlink(tempPath);
        
        // Delete old image if it exists
        if (currentStoragePath) {
          try {
            await fileService.deleteFromFirebase(currentStoragePath);
            console.log(`🗑️ Deleted old ${type}: ${currentStoragePath}`);
          } catch (error) {
            console.warn(`Failed to delete old ${type}:`, error.message);
          }
        }
        
        return result.storagePath;
      };

      // Update the file handling logic
      if (files?.avatar?.[0]) {
        const avatarStoragePath = await uploadFile(files.avatar[0], 'avatar');
        updateData.avatarStoragePath = avatarStoragePath;
        updateData.avatar = await generateSignedUrl(avatarStoragePath); // Generate signed URL
      }
      if (files?.backgroundImage?.[0]) {
        const backgroundStoragePath = await uploadFile(files.backgroundImage[0], 'background');
        updateData.backgroundStoragePath = backgroundStoragePath;
        updateData.backgroundImage = await generateSignedUrl(backgroundStoragePath); // Generate signed URL
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

      // 🚀 NEW: Invalidate user profile cache
      if (oldUsername) {
        await redisClient.del(`user:${oldUsername}:profile`);
        console.log(`💾 Cache invalidated for user profile: ${oldUsername}`);
      }
      
      // If username changed, also invalidate the new username cache (just in case)
      if (username && username !== oldUsername) {
        await redisClient.del(`user:${username}:profile`);
        console.log(`💾 Cache invalidated for new username: ${username}`);
      }

      // Also invalidate user's project list cache (since profile changes might affect it)
      await redisClient.del(`user:${uid}:projects`);
      console.log(`💾 Cache invalidated for user projects: ${uid}`);

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

// Check if a username is available (NO CACHING - real-time check needed)
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

// Toggle pin status (WITH CACHE INVALIDATION)
router.post('/projects/:projectId/toggle-pin', verifyFirebaseToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { uid } = req.user;
    const projectRef = firestore.collection('projects').doc(projectId);

    // 🚀 NEW: Get user's username for cache invalidation
    const userDoc = await firestore.collection('users').doc(uid).get();
    const username = userDoc.data()?.username;

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

    // 🚀 NEW: Invalidate user profile cache (pinned projects changed)
    if (username) {
      await redisClient.del(`user:${username}:profile`);
      console.log(`💾 Cache invalidated for pin toggle - user profile: ${username}`);
    }
    
    // Also invalidate user's project list cache
    await redisClient.del(`user:${uid}:projects`);
    console.log(`💾 Cache invalidated for pin toggle - user projects: ${uid}`);

    res.json({ success: true, message: 'Pin status updated.' });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ error: error.message || 'Failed to update pin status.' });
  }
});

module.exports = router;