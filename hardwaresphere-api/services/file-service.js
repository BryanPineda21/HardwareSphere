const { storage } = require('../config/firebase'); // Import the initialized storage instance
const fs = require('fs').promises;
const path = require('path');

class FileService {
  constructor() {
    // Track temp files for cleanup (optional debugging)
    this.tempFilesCreated = new Set();
    this.tempFilesCleanedUp = new Set();
  }

  /**
   * Upload a file to Firebase Storage with automatic temp cleanup
   * @param {Object} file - Multer file object
   * @param {string} storagePath - Path in Firebase Storage (e.g., 'projects/userId/projectId/model.stl')
   * @returns {Promise<Object>} - Object with downloadURL and metadata
   */
  
  async uploadToFirebase(file, storagePath) {
    let tempFilePath = null;
    
    try {
        console.log(`📤 Uploading ${file.originalname} to ${storagePath}`);
        
        // Track temp file if it exists
        if (file.path) {
            tempFilePath = file.path;
            this.tempFilesCreated.add(tempFilePath);
        }
        
        const bucket = storage.bucket();
        const fileUpload = bucket.file(storagePath);

        // 1. Read the file asynchronously first
        const buffer = await fs.readFile(file.path);
        
        // Create upload stream
        const stream = fileUpload.createWriteStream({
            metadata: {
                contentType: file.mimetype,
                metadata: {
                    originalName: file.originalname,
                    uploadedAt: new Date().toISOString()
                }
            }
        });
        
        // 2. Upload the buffer using a promise-wrapped stream
        await new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('finish', resolve);
            stream.end(buffer);
        });
        
        // --- 🛑 REMOVED ---
        // await fileUpload.makePublic();
        // This line was removed. Files are now private by default and will be
        // protected by your Storage Security Rules. This is essential for your
        // public/private project feature to work correctly.
        
        // --- 🛑 REMOVED ---
        // const downloadURL = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        // The permanent public URL is no longer generated. Instead, your backend will
        // create temporary, secure signed URLs on-demand when a user needs to view or
        // download a file, as seen in your `project-service.js`.

        // Get file metadata
        const [metadata] = await fileUpload.getMetadata();
        
        console.log(`✅ Successfully uploaded ${file.originalname}`);
        
        // Clean up temp file immediately after successful upload
        if (tempFilePath) {
            await this.cleanupSingleTempFile(tempFilePath);
        }
        
        // --- ✨ IMPROVED RETURN VALUE ---
        // The function no longer returns a public 'url'. It returns the 'storagePath',
        // which is used to identify the file for generating signed URLs or for deletion.
        return {
            size: parseInt(metadata.size),
            contentType: metadata.contentType,
            uploadedAt: metadata.metadata?.uploadedAt,
            originalName: file.originalname,
            storagePath: storagePath // This is now the key piece of information
        };
        
    } catch (error) {
        console.error(`❌ Error uploading ${file.originalname}:`, error);
        
        // Clean up temp file even on upload failure
        if (tempFilePath) {
            await this.cleanupSingleTempFile(tempFilePath).catch(cleanupErr => 
                console.warn(`⚠️ Cleanup failed for ${tempFilePath}:`, cleanupErr.message)
            );
        }
        
        throw new Error(`Failed to upload ${file.originalname}: ${error.message}`);
    }
  }
  
  /**
   * Upload multiple project files to Firebase Storage with enhanced cleanup
   * @param {Array} files - Array of multer file objects
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} - Organized file data
   */
  async uploadProjectFiles(files, userId, projectId) {
    const uploadedFiles = {
      models: [],
      attachments: []
    };
    
    // ✅ NEW: Track all temp files for cleanup
    const tempFilesToCleanup = files.map(f => f.path).filter(Boolean);
    
    try {
      for (const file of files) {
        try {
          const fileType = this.getFileType(file);
          const fileName = this.sanitizeFileName(file.originalname);
          const storagePath = `projects/${userId}/${projectId}/${fileType}s/${fileName}`;
          
          // Upload file (temp cleanup happens inside uploadToFirebase)
          const uploadResult = await this.uploadToFirebase(file, storagePath);
          
          const fileData = {
            ...uploadResult,
            type: fileType,
            filename: fileName
          };
          
          if (fileType === 'model') {
            uploadedFiles.models.push(fileData);
          } else {
            uploadedFiles.attachments.push({
              ...fileData,
              description: this.getFileDescription(fileType)
            });
          }
          
        } catch (error) {
          console.error(`❌ Failed to upload ${file.originalname}:`, error);
          // Continue with other files, but ensure cleanup happens
        }
      }
      
      return uploadedFiles;
      
    } catch (error) {
      console.error('❌ Error in uploadProjectFiles:', error);
      throw error;
    } finally {
      // ✅ NEW: Final safety cleanup for any remaining temp files
      await this.cleanupTempFiles(tempFilesToCleanup.map(path => ({ path })))
        .catch(err => console.warn('⚠️ Final cleanup warning:', err.message));
    }
  }
  
  /**
   * Upload banner image with temp cleanup
   * @param {Object} file - Multer file object for banner
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} - Upload result
   */
  async uploadBannerImage(file, userId, projectId) {
    if (!file) return null;
    
    const fileName = `banner${path.extname(file.originalname)}`;
    const storagePath = `projects/${userId}/${projectId}/${fileName}`;
    
    // ✅ IMPROVED: uploadToFirebase now handles temp cleanup automatically
    return await this.uploadToFirebase(file, storagePath);
  }
  
  /**
   * ✅ NEW: Clean up a single temp file with better error handling
   * @param {string} filePath - Path to temp file
   */
  async cleanupSingleTempFile(filePath) {
    if (!filePath) return;
    
    try {
      // Check if file exists before trying to delete
      await fs.access(filePath);
      await fs.unlink(filePath);
      
      this.tempFilesCleanedUp.add(filePath);
      console.log(`🗑️ Cleaned up temp file: ${path.basename(filePath)}`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - that's fine, it's already "cleaned up"
        console.log(`🔍 Temp file already removed: ${path.basename(filePath)}`);
      } else {
        console.error(`⚠️ Error cleaning up ${filePath}:`, error.message);
        throw error;
      }
    }
  }
  
  /**
   * ✅ ENHANCED: Clean up temporary files with better error handling
   * @param {Array} files - Array of file objects with path property
   */
  async cleanupTempFiles(files) {
    if (!files || files.length === 0) {
      console.log('🧹 No temp files to clean up');
      return;
    }
    
    console.log(`🧹 Cleaning up ${files.length} temp files`);
    
    const cleanupPromises = files.map(async (file) => {
      if (file && file.path) {
        try {
          await this.cleanupSingleTempFile(file.path);
        } catch (error) {
          console.error(`❌ Failed to cleanup ${file.path}:`, error.message);
          // Don't throw - continue with other files
        }
      }
    });
    
    // Wait for all cleanup operations to complete
    await Promise.allSettled(cleanupPromises);
    
    console.log('✅ Temp file cleanup completed');
  }
  
  /**
   * ✅ NEW: Enhanced cleanup with fallback strategies
   * @param {Array} filePaths - Array of file paths (strings)
   */
  async enhancedCleanupByPaths(filePaths) {
    if (!filePaths || filePaths.length === 0) return;
    
    console.log(`🧹 Enhanced cleanup for ${filePaths.length} files`);
    
    for (const filePath of filePaths) {
      if (!filePath || typeof filePath !== 'string') continue;
      
      try {
        await this.cleanupSingleTempFile(filePath);
      } catch (error) {
        console.warn(`⚠️ Cleanup failed for ${filePath}, trying fallback`);
        
        // Fallback: Force delete without checking existence
        try {
          await fs.unlink(filePath);
          console.log(`🔧 Fallback cleanup successful: ${path.basename(filePath)}`);
        } catch (fallbackError) {
          console.error(`💥 Fallback cleanup failed: ${filePath}`, fallbackError.message);
        }
      }
    }
  }
  
  /**
   * ✅ NEW: Get temp file statistics (for debugging)
   */
  getTempFileStats() {
    return {
      created: this.tempFilesCreated.size,
      cleaned: this.tempFilesCleanedUp.size,
      potential_leaks: this.tempFilesCreated.size - this.tempFilesCleanedUp.size
    };
  }
  
  /**
   * ✅ NEW: Force cleanup of all tracked temp files (emergency cleanup)
   */
  async emergencyCleanup() {
    console.log('🚨 Emergency cleanup initiated');
    
    const uncleanedFiles = Array.from(this.tempFilesCreated)
      .filter(file => !this.tempFilesCleanedUp.has(file));
    
    if (uncleanedFiles.length > 0) {
      console.log(`🧹 Emergency cleaning ${uncleanedFiles.length} uncleaned files`);
      await this.enhancedCleanupByPaths(uncleanedFiles);
    } else {
      console.log('✅ No files need emergency cleanup');
    }
  }
  
  /**
   * Determine file type based on extension
   * @param {Object} file - Multer file object
   * @returns {string} - File type category
   */
  getFileType(file) {
    const extension = path.extname(file.originalname).toLowerCase();
    
    if (['.stl', '.gltf', '.glb', '.obj'].includes(extension)) {
      return 'model';
    }
    if (['.py', '.cpp', '.js', '.m', '.zip'].includes(extension)) {
      return 'code';
    }
    if (['.pdf', '.doc', '.docx', '.txt'].includes(extension)) {
      return 'documentation';
    }
    if (['.mp4', '.mov', '.avi', '.webm'].includes(extension)) {
      return 'video';
    }
    
    return 'other';
  }
  
  /**
   * Get a description for file type
   * @param {string} fileType - File type
   * @returns {string} - Description
   */
  getFileDescription(fileType) {
    const descriptions = {
      code: 'Source code and scripts',
      documentation: 'Documentation and guides',
      video: 'Demo and instructional videos',
      other: 'Additional project files'
    };
    
    return descriptions[fileType] || 'Project file';
  }
  
  /**
   * Sanitize filename for storage
   * @param {string} filename - Original filename
   * @returns {string} - Sanitized filename
   */
  sanitizeFileName(filename) {
    // Remove special characters and spaces, keep extension
    const name = path.parse(filename).name;
    const ext = path.parse(filename).ext;
    const sanitized = name
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    return `${sanitized}${ext}`;
  }
  
  /**
   * Delete file from Firebase Storage
   * @param {string} storagePath - Path in Firebase Storage
   */
  async deleteFromFirebase(storagePath) {
    try {
      const bucket = storage.bucket();
      await bucket.file(storagePath).delete();
      console.log(`🗑️ Deleted from Firebase: ${storagePath}`);
    } catch (error) {
      if (error.code === 404) {
        console.log(`🔍 File not found in Firebase (already deleted): ${storagePath}`);
      } else {
        console.error(`❌ Error deleting ${storagePath}:`, error);
        throw error;
      }
    }
  }
  
  /**
   * Generate thumbnail for 3D models (placeholder for now)
   * @param {string} modelUrl - URL of the 3D model
   * @returns {Promise<string>} - Thumbnail URL
   */
  async generateThumbnail(modelUrl) {
    // TODO: Implement 3D model thumbnail generation
    // For now, return a placeholder
    return null;
  }
}

module.exports = new FileService();