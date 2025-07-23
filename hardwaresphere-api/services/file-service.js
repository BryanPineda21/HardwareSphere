const { storage } = require('../config/firebase'); // Import the initialized storage instance
const fs = require('fs').promises;
const path = require('path');

class FileService {
  /**
   * Upload a file to Firebase Storage
   * @param {Object} file - Multer file object
   * @param {string} storagePath - Path in Firebase Storage (e.g., 'projects/userId/projectId/model.stl')
   * @returns {Promise<Object>} - Object with downloadURL and metadata
   */
  async uploadToFirebase(file, storagePath) {
    try {
      console.log(`Uploading ${file.originalname} to ${storagePath}`);
      
      // --- FIX: Use the storage object directly ---
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
        stream.end(buffer); // Use the buffer here
      });
      
      // Make file publicly readable
      await fileUpload.makePublic();
      
      // Get download URL
      const downloadURL = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      
      // Get file metadata
      const [metadata] = await fileUpload.getMetadata();
      
      console.log(`Successfully uploaded ${file.originalname}`);
      
      return {
        url: downloadURL,
        size: parseInt(metadata.size),
        contentType: metadata.contentType,
        uploadedAt: metadata.metadata?.uploadedAt,
        originalName: file.originalname,
        storagePath: storagePath
      };
      
    } catch (error) {
      console.error(`Error uploading ${file.originalname}:`, error);
      throw new Error(`Failed to upload ${file.originalname}: ${error.message}`);
    }
  }
  
  /**
   * Upload multiple project files to Firebase Storage
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
    
    for (const file of files) {
      try {
        const fileType = this.getFileType(file);
        const fileName = this.sanitizeFileName(file.originalname);
        const storagePath = `projects/${userId}/${projectId}/${fileType}s/${fileName}`;
        
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
        console.error(`Failed to upload ${file.originalname}:`, error);
        // Continue with other files, but log the error
      }
    }
    
    return uploadedFiles;
  }
  
  /**
   * Upload banner image
   * @param {Object} file - Multer file object for banner
   * @param {string} userId - User ID
   * @param {string} projectId - Project ID
   * @returns {Promise<Object>} - Upload result
   */
  async uploadBannerImage(file, userId, projectId) {
    if (!file) return null;
    
    const fileName = `banner${path.extname(file.originalname)}`;
    const storagePath = `projects/${userId}/${projectId}/${fileName}`;
    
    return await this.uploadToFirebase(file, storagePath);
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
   * Clean up temporary files
   * @param {Array} files - Array of file objects with path property
   */
  async cleanupTempFiles(files) {
    for (const file of files) {
      try {
        if (file.path) {
          await fs.unlink(file.path);
          console.log(`Cleaned up temp file: ${file.path}`);
        }
      } catch (error) {
        console.error(`Error cleaning up ${file.path}:`, error);
        // Continue with other files
      }
    }
  }
  
  /**
   * Delete file from Firebase Storage
   * @param {string} storagePath - Path in Firebase Storage
   */
  async deleteFromFirebase(storagePath) {
    try {
      // --- FIX: Use the storage object directly ---
      const bucket = storage.bucket();
      await bucket.file(storagePath).delete();
      console.log(`Deleted file: ${storagePath}`);
    } catch (error) {
      console.error(`Error deleting ${storagePath}:`, error);
      throw error;
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