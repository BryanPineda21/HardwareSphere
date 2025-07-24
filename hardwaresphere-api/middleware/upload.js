const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// ✅ NEW: Track uploaded temp files for cleanup safety net
const tempFileTracker = new Set();

// ✅ IMPROVED: Better temp file organization
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // Create organized temp directory structure
      const baseDir = 'uploads/';
      const dateDir = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const fullDir = path.join(baseDir, dateDir);
      
      // Ensure the directory exists
      await fs.mkdir(fullDir, { recursive: true });
      
      cb(null, fullDir);
    } catch (error) {
      console.error('Error creating upload directory:', error);
      // Fallback to base uploads directory
      try {
        await fs.mkdir('uploads/', { recursive: true });
        cb(null, 'uploads/');
      } catch (fallbackError) {
        cb(fallbackError);
      }
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename with better naming
    const timestamp = Date.now();
    const randomId = Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueName = `${file.fieldname}-${timestamp}-${randomId}-${sanitizedName}`;
    
    cb(null, uniqueName);
  }
});

// ✅ NEW: Enhanced file filter with better error messages
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    // 3D Models
    models: ['.stl', '.gltf', '.glb', '.obj'],
    // Documentation  
    docs: ['.pdf', '.doc', '.docx', '.txt', '.md'],
    // Videos
    videos: ['.mp4', '.mov', '.avi', '.webm'],
    // Code files
    code: ['.py', '.cpp', '.c', '.java', '.js', '.ts', '.tsx', '.jsx', '.html', 
           '.css', '.m', '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs', 
           '.swift', '.kt', '.scala', '.r', '.matlab', '.sh', '.bat', '.ps1'],
    // Images (for banners)
    images: ['.png', '.jpg', '.jpeg', '.webp']
  };
  
  const allAllowedTypes = Object.values(allowedTypes).flat();
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (allAllowedTypes.includes(fileExt)) {
    cb(null, true);
  } else {
    const fileType = Object.keys(allowedTypes).find(type => 
      allowedTypes[type].includes(fileExt)
    );
    
    cb(new Error(
      `File type ${fileExt} not allowed. Allowed types: ${allAllowedTypes.join(', ')}`
    ), false);
  }
};

// ✅ IMPROVED: Configure multer with better error handling
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 20 // Max 20 files per request
  },
  fileFilter: fileFilter
});

// ✅ NEW: Middleware to track temp files for cleanup
const trackTempFiles = (req, res, next) => {
  // Store original end function
  const originalEnd = res.end;
  
  // Override res.end to ensure cleanup
  res.end = function(...args) {
    // Clean up temp files after response
    setImmediate(() => {
      cleanupRequestTempFiles(req);
    });
    
    // Call original end function
    originalEnd.apply(this, args);
  };
  
  // Track files in request for cleanup
  req.tempFilesToCleanup = new Set();
  
  next();
};

// ✅ NEW: Add temp files to cleanup tracker
const addToTempTracker = (req, res, next) => {
  if (req.files) {
    // Handle multiple field uploads
    Object.values(req.files).flat().forEach(file => {
      if (file.path) {
        tempFileTracker.add(file.path);
        req.tempFilesToCleanup?.add(file.path);
        console.log(`📁 Temp file tracked: ${path.basename(file.path)}`);
      }
    });
  }
  
  if (req.file && req.file.path) {
    // Handle single file uploads
    tempFileTracker.add(req.file.path);
    req.tempFilesToCleanup?.add(req.file.path);
    console.log(`📁 Temp file tracked: ${path.basename(req.file.path)}`);
  }
  
  next();
};

// ✅ NEW: Clean up temp files for a specific request
async function cleanupRequestTempFiles(req) {
  if (!req.tempFilesToCleanup || req.tempFilesToCleanup.size === 0) {
    return;
  }
  
  console.log(`🧹 Safety cleanup for ${req.tempFilesToCleanup.size} temp files`);
  
  for (const filePath of req.tempFilesToCleanup) {
    try {
      await fs.access(filePath); // Check if file exists
      await fs.unlink(filePath);
      tempFileTracker.delete(filePath);
      console.log(`🗑️ Safety cleanup: ${path.basename(filePath)}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File already deleted - that's good!
        tempFileTracker.delete(filePath);
        console.log(`✅ Temp file already cleaned: ${path.basename(filePath)}`);
      } else {
        console.warn(`⚠️ Safety cleanup failed: ${path.basename(filePath)} - ${error.message}`);
      }
    }
  }
}

// ✅ NEW: Emergency cleanup function for old temp files
async function emergencyCleanupOldTempFiles() {
  try {
    const uploadsDir = 'uploads/';
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds
    
    // Read all subdirectories (including date-based ones)
    const items = await fs.readdir(uploadsDir, { withFileTypes: true });
    
    for (const item of items) {
      const itemPath = path.join(uploadsDir, item.name);
      
      if (item.isDirectory()) {
        // Clean up files in subdirectories
        try {
          const files = await fs.readdir(itemPath);
          for (const file of files) {
            const filePath = path.join(itemPath, file);
            const stats = await fs.stat(filePath);
            
            // Delete files older than 1 hour
            if (now - stats.mtime.getTime() > ONE_HOUR) {
              await fs.unlink(filePath);
              tempFileTracker.delete(filePath);
              console.log(`🧹 Emergency cleanup: ${file} (${Math.round((now - stats.mtime.getTime()) / (1000 * 60))} minutes old)`);
            }
          }
          
          // Remove empty directories
          const remainingFiles = await fs.readdir(itemPath);
          if (remainingFiles.length === 0) {
            await fs.rmdir(itemPath);
            console.log(`📁 Removed empty temp directory: ${item.name}`);
          }
        } catch (error) {
          console.warn(`⚠️ Error cleaning directory ${itemPath}:`, error.message);
        }
      } else if (item.isFile()) {
        // Clean up files in root uploads directory
        try {
          const stats = await fs.stat(itemPath);
          if (now - stats.mtime.getTime() > ONE_HOUR) {
            await fs.unlink(itemPath);
            tempFileTracker.delete(itemPath);
            console.log(`🧹 Emergency cleanup: ${item.name} (${Math.round((now - stats.mtime.getTime()) / (1000 * 60))} minutes old)`);
          }
        } catch (error) {
          console.warn(`⚠️ Error cleaning file ${itemPath}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('❌ Emergency cleanup failed:', error.message);
  }
}

// ✅ NEW: Schedule periodic cleanup (every 30 minutes)
setInterval(emergencyCleanupOldTempFiles, 30 * 60 * 1000);

// ✅ NEW: Cleanup on process exit
process.on('SIGTERM', async () => {
  console.log('🧹 Process terminating, cleaning up temp files...');
  await emergencyCleanupOldTempFiles();
});

process.on('SIGINT', async () => {
  console.log('🧹 Process interrupted, cleaning up temp files...');
  await emergencyCleanupOldTempFiles();
});

// ✅ IMPROVED: Enhanced error handler with temp file cleanup
const handleUploadError = async (err, req, res, next) => {
  // Clean up temp files if upload failed
  if (req.files || req.file) {
    console.log('🧹 Upload failed, cleaning up temp files...');
    await cleanupRequestTempFiles(req);
  }
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large. Maximum size is 100MB per file.',
        code: 'FILE_TOO_LARGE'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        error: 'Too many files. Maximum is 20 files per upload.',
        code: 'TOO_MANY_FILES'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        error: 'Unexpected file field. Check your form field names.',
        code: 'UNEXPECTED_FIELD'
      });
    }
  }
  
  if (err && err.message && err.message.includes('File type')) {
    return res.status(400).json({ 
      error: err.message,
      code: 'INVALID_FILE_TYPE'
    });
  }
  
  if (err && err.message && err.message.includes('ENOSPC')) {
    return res.status(507).json({ 
      error: 'Server storage full. Please try again later.',
      code: 'STORAGE_FULL'
    });
  }
  
  next(err);
};

// ✅ NEW: Get temp file statistics
const getTempFileStats = () => {
  return {
    tracked_files: tempFileTracker.size,
    tracked_paths: Array.from(tempFileTracker).map(p => path.basename(p))
  };
};

// Export configurations with safety net middleware
module.exports = {
  // For project creation (multiple project files + optional banner)
  uploadProject: [
    trackTempFiles,
    upload.fields([
      { name: 'projectFiles', maxCount: 15 },
      { name: 'bannerImage', maxCount: 1 }
    ]),
    addToTempTracker
  ],
  
  // For updating a project
  uploadProjectUpdate: [
    trackTempFiles,
    upload.fields([
      { name: 'modelFile', maxCount: 1 },
      { name: 'bannerImage', maxCount: 1 },
      { name: 'projectFiles', maxCount: 15 }
    ]),
    addToTempTracker
  ],
  
  // For single file uploads
  uploadSingle: [
    trackTempFiles,
    upload.single('file'),
    addToTempTracker
  ],
  
  // Error handler with cleanup
  handleUploadError,
  
  // ✅ NEW: Utility functions
  getTempFileStats,
  emergencyCleanupOldTempFiles,
  cleanupRequestTempFiles
};