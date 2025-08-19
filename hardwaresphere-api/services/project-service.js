const { firestore, storage, admin } = require('../config/firebase');
const fileService = require('./file-service');
const conversionService = require('./conversion-service');
const redisClient = require('../config/redis'); // ✅ NEW: Added for cache invalidation
const path = require('path');

// --- NEW: Helper function to generate secure, temporary URLs ---
/**
 * Generates a signed URL for a file in Firebase Storage.
 * @param {string} filePath The path to the file in the storage bucket.
 * @returns {Promise<string|null>} A promise that resolves to the signed URL.
 */
async function generateSignedUrl(filePath) {
  if (!filePath) return null;
  
  // Set the expiration for the signed URL. 15 minutes is a good balance of security and usability.
  const options = {
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
  };

  try {
    const [url] = await storage.bucket().file(filePath).getSignedUrl(options);
    return url;
  } catch (error) {
    // This can happen if the file doesn't exist, which is a valid state during conversion.
    console.warn(`Could not generate signed URL for ${filePath}: ${error.message}`);
    return null; // Return null if there's an error
  }
}


// Helper function to invalidate all user-related caches
async function invalidateUserCaches(userId, projectId = null) {
  try {
    // Get username for profile cache invalidation
    const userDoc = await firestore.collection('users').doc(userId).get();
    const username = userDoc.data()?.username;
    
    const cacheKeys = [
      `user:${userId}:projects`,  // User projects cache (projects.js)
      ...(username ? [`user:${username}:profile`] : []), // User profile cache (users.js)
      ...(projectId ? [`project:${projectId}`] : []) // Individual project cache
    ];
    
    // Invalidate all relevant caches
    const deletePromises = cacheKeys.map(key => 
      redisClient.del(key).then(() => 
        console.log(`💾 Cache invalidated: ${key}`)
      ).catch(err => 
        console.warn(`⚠️ Cache invalidation failed for ${key}:`, err.message)
      )
    );
    
    await Promise.all(deletePromises);
    
  } catch (error) {
    console.warn('Cache invalidation failed:', error.message);
  }
}

class ProjectService {

  async createProject(userId, projectData, files) {
    const projectId = this.generateProjectId();
    const projectRef = firestore.collection('projects').doc(projectId);

    let stlFile = null;
    let otherFiles = files.projectFiles ? [...files.projectFiles] : [];

    if (files.modelFile && files.modelFile[0]) {
        stlFile = files.modelFile[0];
    } else {
        const stlIndex = otherFiles.findIndex(f => f.originalname.toLowerCase().endsWith('.stl'));
        if (stlIndex > -1) {
            stlFile = otherFiles.splice(stlIndex, 1)[0]; 
        }
    }
    
    const bannerFile = files.bannerImage ? files.bannerImage[0] : null;

    if (!stlFile) {
      throw new Error('A 3D model file (.stl) is required to create a project.');
    }

    // 💡 IMPROVEMENT: Fetch all user details concurrently.
    const [username, authorName, authorAvatar, modelUploadResult, bannerUploadResult, attachmentsResult] = await Promise.all([
      this.getUsernameFromUserId(userId),
      this.getDisplayNameFromUserId(userId),
      this.getAvatarFromUserId(userId), // Fetches the user's avatar URL
      // UPDATED THIS LINE
      fileService.uploadToFirebase(stlFile, `projects/${userId}/${projectId}/models/${stlFile.originalname}`),
      
      bannerFile ? fileService.uploadBannerImage(bannerFile, userId, projectId) : Promise.resolve(null),
      fileService.uploadProjectFiles(otherFiles, userId, projectId)
    ]);

    const filesForFirestore = this.organizeProjectFiles(
      { models: [modelUploadResult], attachments: attachmentsResult.attachments },
      bannerUploadResult
    );

    const parsedTags = JSON.parse(projectData.tags || '[]');
    
    // ✅ KEY CHANGE: Added `authorAvatar` to the new project schema.
    const newProject = {
      userId: userId,
      username: username,
      authorName: authorName,
      authorAvatar: authorAvatar, // The user's avatar URL is now saved.
      title: projectData.title,
      description: projectData.description,
      tags: parsedTags,
      visibility: projectData.isPublic === 'true' ? 'public' : 'private',
      allowDownloads: projectData.allowDownloads === 'true',
      files: filesForFirestore,
      searchTerms: this.generateSearchTerms(projectData.title, projectData.description, parsedTags),
      category: this.determineCategory(parsedTags),
      stats: { views: 0, downloads: 0, likes: 0 },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      conversionStatus: {
        stlFiles: 1,
        convertedFiles: 0,
        inProgress: true,
        completed: false,
        errors: [],
        startedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    };

    await projectRef.set(newProject);
    console.log(`Project document ${projectId} created successfully.`);
    await invalidateUserCaches(userId, projectId);


    if (stlFile.path) {
      setTimeout(() => {
        this.startBackgroundConversion(projectId, userId, [stlFile])
          .catch(err => console.error(`Background conversion failed to start for ${projectId}:`, err));
      }, 100);
    }

    return { id: projectId, ...newProject };
  }

  async updateProject(projectId, userId, updateData, files) {
    const projectRef = firestore.collection('projects').doc(projectId);
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists || projectDoc.data().userId !== userId) {
      throw new Error('Project not found or you do not have permission to edit it.');
    }
    const existingProject = projectDoc.data();

    const pathsToDelete = new Set();
    
    const safeJsonParse = (jsonString, defaultValue = []) => {
      if (!jsonString) return defaultValue;
      try {
        return Array.isArray(jsonString) ? jsonString : JSON.parse(jsonString);
      } catch (e) { return defaultValue; }
    };
    const filesToDeleteFromFrontend = safeJsonParse(updateData.filesToDelete, []);
    filesToDeleteFromFrontend.forEach(path => pathsToDelete.add(path));

    const finalUpdate = {
      title: updateData.title,
      description: updateData.description,
      tags: safeJsonParse(updateData.tags, []),
      visibility: updateData.isPublic === 'true' ? 'public' : 'private',
      allowDownloads: updateData.allowDownloads === 'true',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    finalUpdate.searchTerms = this.generateSearchTerms(finalUpdate.title, finalUpdate.description, finalUpdate.tags);

    const newModelFile = files.modelFile ? files.modelFile[0] : null;
    const newBannerFile = files.bannerImage ? files.bannerImage[0] : null;
    const newAttachments = files.projectFiles || [];

    if (newModelFile) {
      if (existingProject.files?.model?.stl?.storagePath) pathsToDelete.add(existingProject.files.model.stl.storagePath);
      if (existingProject.files?.model?.glb?.storagePath) pathsToDelete.add(existingProject.files.model.glb.storagePath);
      // UPDATED THIS LINE
      const modelUploadResult = await fileService.uploadToFirebase(newModelFile, `projects/${userId}/${projectId}/models/${newModelFile.originalname}`);

      finalUpdate['files.model.stl'] = {
        filename: modelUploadResult.originalName,
        size: modelUploadResult.size,
        storagePath: modelUploadResult.storagePath,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      finalUpdate['files.model.glb'] = admin.firestore.FieldValue.delete();
      finalUpdate.conversionStatus = {
        stlFiles: 1,
        convertedFiles: 0,
        inProgress: true,
        completed: false,
        errors: [],
        startedAt: admin.firestore.FieldValue.serverTimestamp()
      };
    }

    if (newBannerFile) {
      if (existingProject.files?.thumbnail?.storagePath) pathsToDelete.add(existingProject.files.thumbnail.storagePath);
      const bannerUploadResult = await fileService.uploadBannerImage(newBannerFile, userId, projectId);
      finalUpdate['files.thumbnail'] = {
        filename: bannerUploadResult.originalName,
        size: bannerUploadResult.size,
        storagePath: bannerUploadResult.storagePath
      };
    }

    let updatedAttachments = (existingProject.files?.attachments || []).filter(file => !filesToDeleteFromFrontend.includes(file.storagePath));
    if (newAttachments.length > 0) {
      const attachmentsUploadResult = await fileService.uploadProjectFiles(newAttachments, userId, projectId);
      updatedAttachments.push(...attachmentsUploadResult.attachments);
    }
    finalUpdate['files.attachments'] = updatedAttachments;
    
    if (pathsToDelete.size > 0) {
      const deletePromises = Array.from(pathsToDelete).map(p => fileService.deleteFromFirebase(p).catch(err => console.warn(err.message)));
      await Promise.all(deletePromises);
    }

    await projectRef.update(finalUpdate);

    // ✅ NEW: Invalidate Redis cache when project is updated
    // Invalidate all user-related caches  
    await invalidateUserCaches(userId, projectId);


    if (newModelFile && newModelFile.path) {
      setTimeout(() => {
        this.startBackgroundConversionForUpdate(projectId, userId, newModelFile)
          .catch(err => console.error(`Background re-conversion failed for project ${projectId}:`, err));
      }, 100);
    }
    
    const updatedDoc = await projectRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
  }
  
  async getProject(projectId) {
    const projectRef = firestore.collection('projects').doc(projectId);
    const doc = await projectRef.get();

    if (!doc.exists) {
      return null;
    }

    const projectData = { 
        id: doc.id, 
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
    };

    if (projectData.files?.model?.glb?.storagePath) {
        projectData.files.model.glb.url = await generateSignedUrl(projectData.files.model.glb.storagePath);
    }
    
    if (projectData.files?.model?.stl?.storagePath) {
        projectData.files.model.stl.url = await generateSignedUrl(projectData.files.model.stl.storagePath);
    }

    if (projectData.files?.thumbnail?.storagePath) {
        projectData.files.thumbnail.url = await generateSignedUrl(projectData.files.thumbnail.storagePath);
    }

    if (projectData.files?.attachments && Array.isArray(projectData.files.attachments)) {
        projectData.files.attachments = await Promise.all(
            projectData.files.attachments.map(async (file) => {
                const signedUrl = await generateSignedUrl(file.storagePath);
                return { ...file, url: signedUrl };
            })
        );
    }

    return projectData;
  }

  organizeProjectFiles(projectFilesResult, bannerResult) {
    const files = {
      model: {},
      ...(bannerResult && { 
        thumbnail: { 
          filename: bannerResult.originalName, 
          size: bannerResult.size, 
          storagePath: bannerResult.storagePath 
        } 
      }),
      attachments: []
    };

    if (projectFilesResult.models && projectFilesResult.models.length > 0) {
      const stlModel = projectFilesResult.models.find(f => f.originalName.toLowerCase().endsWith('.stl'));
      if (stlModel) {
        files.model.stl = { 
          filename: stlModel.originalName, 
          size: stlModel.size, 
          uploadedAt: stlModel.uploadedAt, 
          storagePath: stlModel.storagePath 
        };
      }
    }

    if (projectFilesResult.attachments) {
      files.attachments = projectFilesResult.attachments.map(file => ({ 
        type: file.type, 
        filename: file.originalName, 
        size: file.size, 
        description: file.description, 
        storagePath: file.storagePath 
      }));
    }
    return files;
  }

  async addConvertedFile(projectId, originalStlName, glbResult) {
    try {
      await firestore.runTransaction(async (transaction) => {
        const projectRef = firestore.collection('projects').doc(projectId);
        transaction.update(projectRef, {
          'files.model.glb': {
            filename: glbResult.originalName,
            size: glbResult.size,
            convertedFrom: originalStlName,
            conversionStats: glbResult.conversionStats,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            storagePath: glbResult.storagePath
          },
          'conversionStatus.convertedFiles': admin.firestore.FieldValue.increment(1),
          'conversionStatus.lastUpdate': admin.firestore.FieldValue.serverTimestamp()
        });
      });
      console.log(`📁 Added converted GLB file metadata to project ${projectId}`);
    } catch (error) {
      console.error('Error adding converted file:', error);
      throw error;
    }
  }

  async deleteProject(projectId, userId) {
    const projectRef = firestore.collection('projects').doc(projectId);
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists) throw new Error('Project not found.');
    const projectData = projectDoc.data();
    if (projectData.userId !== userId) throw new Error('You do not have permission to delete this project.');
    
    const bucket = admin.storage().bucket();
    const prefix = `projects/${userId}/${projectId}/`;
    try {
      await bucket.deleteFiles({ prefix: prefix });
    } catch (error) {
      console.error(`Failed to delete files for project ${projectId}. Manual cleanup may be required.`, error);
    }
    
    await projectRef.delete();

    // ✅ NEW: Invalidate cache when project is deleted
    // Invalidate all user-related caches
    await invalidateUserCaches(userId, projectId);
    
    return { success: true, message: 'Project and all associated files deleted.' };
  }

  // ✅ NEW: Enhanced temp file cleanup method
  async enhancedCleanup(filePaths, description = "") {
    if (!filePaths || filePaths.length === 0) return;
    
    console.log(`🧹 Starting cleanup: ${description}`);
    
    const fileObjects = filePaths
      .filter(p => p && typeof p === 'string')
      .map(p => ({ path: p }));
    
    if (fileObjects.length > 0) {
      try {
        await fileService.cleanupTempFiles(fileObjects);
        console.log(`✅ Cleanup successful: ${fileObjects.length} files removed`);
      } catch (err) {
        console.error(`❌ Cleanup failed: ${err.message}`);
        
        // Fallback: Try manual cleanup
        const fs = require('fs').promises;
        for (const file of fileObjects) {
          try {
            await fs.unlink(file.path);
            console.log(`🗑️ Manual cleanup successful: ${file.path}`);
          } catch (unlinkErr) {
            console.warn(`⚠️ Manual cleanup failed: ${file.path} - ${unlinkErr.message}`);
          }
        }
      }
    }
  }

    async startBackgroundConversion(projectId, userId, stlFiles) {
    console.log(`🔄 Starting background conversion for project ${projectId}`);
    const tempFilesToCleanup = stlFiles.map(f => f.path).filter(Boolean);
    
    try {
      for (let i = 0; i < stlFiles.length; i++) {
        const stlFile = stlFiles[i];
        try {
          await this.updateConversionStatus(projectId, { 
            currentFile: stlFile.originalname, 
            progress: Math.round((i / stlFiles.length) * 100) 
          });
          const glbResult = await this.convertStlFile(projectId, userId, stlFile);
          await this.addConvertedFile(projectId, stlFile.originalname, glbResult);
          
          // ✅ Clean up this STL temp file after successful conversion
          if (stlFile.path) {
            await this.enhancedCleanup([stlFile.path], `STL temp file after conversion: ${stlFile.originalname}`);
          }
          
        } catch (error) {
          await this.addConversionError(projectId, stlFile.originalname, error.message);
          
          // ✅ Clean up STL temp file even on conversion error
          if (stlFile.path) {
            await this.enhancedCleanup([stlFile.path], `STL temp file after failed conversion: ${stlFile.originalname}`);
          }
        }
      }

      // ✅ Cache invalidation after all conversions complete
      // After conversion completes, invalidate caches
      await invalidateUserCaches(userId, projectId);

    } finally {
      // ✅ SAFETY: Final cleanup for any remaining temp files
      await this.enhancedCleanup(tempFilesToCleanup, "final safety cleanup after background conversion");
      await this.updateConversionStatus(projectId, { 
        inProgress: false, 
        completed: true, 
        completedAt: new Date(), 
        progress: 100 
      });
    }
  }

  async startBackgroundConversionForUpdate(projectId, userId, stlFile) {
    console.log(`🔄 Starting background conversion for updated model in project ${projectId}`);
    const tempFilesToCleanup = [stlFile.path].filter(Boolean);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const glbResult = await this.convertStlFile(projectId, userId, stlFile);
      
      await firestore.runTransaction(async (transaction) => {
        const projectRef = firestore.collection('projects').doc(projectId);
        transaction.update(projectRef, {
          'files.model.glb': {
            filename: glbResult.originalName,
            size: glbResult.size,
            convertedFrom: stlFile.originalname,
            conversionStats: glbResult.conversionStats,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            storagePath: glbResult.storagePath
          },
          'conversionStatus.convertedFiles': 1,
          'conversionStatus.inProgress': false,
          'conversionStatus.completed': true,
          'conversionStatus.completedAt': admin.firestore.FieldValue.serverTimestamp(),
          'conversionStatus.lastUpdate': admin.firestore.FieldValue.serverTimestamp()
        });
      });

      // ✅ Cache invalidation after conversion
      // After conversion completes, invalidate caches
      await invalidateUserCaches(userId, projectId);

      // ✅ Clean up STL temp file after successful conversion
      if (stlFile.path) {
        await this.enhancedCleanup([stlFile.path], `STL temp file after update conversion: ${stlFile.originalname}`);
      }

    } catch (error) {
      await this.updateConversionStatus(projectId, { 
        errors: [{ fileName: stlFile.originalname, error: error.message, timestamp: new Date() }], 
        inProgress: false, 
        completed: true, 
        completedAt: new Date() 
      });
      
      // ✅ Clean up STL temp file even on conversion error
      if (stlFile.path) {
        await this.enhancedCleanup([stlFile.path], `STL temp file after failed update conversion: ${stlFile.originalname}`);
      }
      
      throw error;
    } finally {
      // ✅ SAFETY: Final cleanup
      await this.enhancedCleanup(tempFilesToCleanup, "final safety cleanup after background conversion update");
    }
  }

  async convertStlFile(projectId, userId, stlFile) {
    const glbFileName = stlFile.originalname.replace(/\.stl$/i, '.glb');
    const glbTempPath = path.join('uploads', `converted-${projectId}-${Date.now()}-${glbFileName}`);
    
    try {
      if (!stlFile.path) throw new Error('STL file path is missing for conversion');
      
      const conversionResult = await conversionService.convertStlToGltf(stlFile.path, glbTempPath);
      const glbStoragePath = `projects/${userId}/${projectId}/models/${glbFileName}`;
      const uploadResult = await fileService.uploadToFirebase(
        { path: conversionResult.filePath, originalname: glbFileName, mimetype: 'model/gltf-binary' }, 
        glbStoragePath
      );
      
      // ✅ IMPROVED: Clean up conversion temp file immediately after upload
      await this.enhancedCleanup([conversionResult.filePath], "post-conversion GLB file");
      
      return { 
        ...uploadResult, 
        conversionStats: { 
          originalSize: stlFile.size || 0,
          convertedSize: uploadResult.size || 0,
          conversionTime: Date.now()
        } 
      };
    } catch (error) {
      // ✅ IMPROVED: Clean up temp files even on error
      await this.enhancedCleanup([glbTempPath], "failed conversion cleanup");
      throw error;
    }
  }

  // ✅ DEPRECATED: Replaced by enhancedCleanup
  async safeCleanup(filePaths) {
    console.warn('safeCleanup is deprecated, use enhancedCleanup instead');
    await this.enhancedCleanup(filePaths, "legacy cleanup");
  }

  async updateConversionStatus(projectId, statusUpdates) {
    try {
        const updatePayload = {};
        for (const key in statusUpdates) updatePayload[`conversionStatus.${key}`] = statusUpdates[key];
        updatePayload['conversionStatus.lastUpdate'] = admin.firestore.FieldValue.serverTimestamp();
        await firestore.collection('projects').doc(projectId).update(updatePayload);
    } catch (error) {
        console.error(`Error updating conversion status for project ${projectId}:`, error);
    }
  }

  async addConversionError(projectId, fileName, errorMessage) {
    try {
      await firestore.collection('projects').doc(projectId).update({ 
        'conversionStatus.errors': admin.firestore.FieldValue.arrayUnion({ 
          fileName, 
          error: errorMessage, 
          timestamp: new Date() 
        }) 
      });
    } catch (error) {
      console.error('Error adding conversion error:', error);
    }
  }

  async getUserProjects(userId) {
    const snapshot = await firestore.collection('projects').where('userId', '==', userId).orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  generateProjectId() { return firestore.collection('projects').doc().id; }
  
  async getUsernameFromUserId(userId) {
    const userDoc = await firestore.collection('users').doc(userId).get();
    return userDoc.exists ? userDoc.data().username || 'unknown' : 'unknown';
  }

  async getDisplayNameFromUserId(userId) {
    const userDoc = await firestore.collection('users').doc(userId).get();
    return userDoc.exists ? userDoc.data().displayName || 'Unknown Author' : 'Unknown Author';
  }
  
  // ✅ FIXED: Changed field name from 'photoURL' to 'avatar'
  async getAvatarFromUserId(userId) {
    try {
      const userDoc = await firestore.collection('users').doc(userId).get();
      if (userDoc.exists) { 
        // Changed from 'photoURL' to 'avatar' to match your users schema
        return userDoc.data().avatar || null; 
      }
      return null;
    } catch (error) {
      console.error('Error fetching user avatar:', error);
      return null; // Return null on error to prevent breaking project creation.
    }
  }
  
  generateSearchTerms(title, description, tags) {
    const terms = new Set();
    if (title) title.toLowerCase().split(/\s+/).forEach(w => w.length > 2 && terms.add(w));
    if (description) description.toLowerCase().substring(0, 100).split(/\s+/).forEach(w => w.length > 2 && terms.add(w));
    if (Array.isArray(tags)) tags.forEach(t => t && terms.add(t.toLowerCase()));
    return Array.from(terms);
  }
  
  determineCategory(tags) {
    const categories = {
      mechanical: ['mechanical', 'gear', 'engine', 'motor', 'machine'],
      electronics: ['electronic', 'circuit', 'pcb', 'arduino', 'raspberry'],
      automotive: ['car', 'automotive', 'vehicle', 'wheel', 'brake'],
      architecture: ['building', 'house', 'architecture', 'structure'],
      art: ['art', 'sculpture', 'decorative', 'ornament'],
      gaming: ['game', 'gaming', 'character', 'weapon', 'prop'],
      medical: ['medical', 'prosthetic', 'anatomical', 'dental'],
      aerospace: ['aerospace', 'aircraft', 'drone', 'rocket', 'space'],
      jewelry: ['jewelry', 'ring', 'pendant', 'bracelet'],
      tools: ['tool', 'wrench', 'hammer', 'screwdriver']
    };
    
    if (!Array.isArray(tags)) return 'general';
    const lowerTags = tags.map(t => t ? t.toLowerCase() : '').filter(Boolean);
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(k => lowerTags.some(t => t.includes(k)))) return category;
    }
    return 'general';
  }
}

module.exports = new ProjectService();