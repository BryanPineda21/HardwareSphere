const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure the uploads directory exists
    const fs = require('fs');
    const dir = 'uploads/';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
    cb(null, 'uploads/'); // Temporary storage
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter for validation
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // 3D Models
    '.stl', '.gltf', '.glb', '.obj',
    // Documentation
    '.pdf', '.doc', '.docx', '.txt', '.md',
    // Videos
    '.mp4', '.mov', '.avi', '.webm',
    // Code
    '.py', '.cpp', '.c', '.java', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.m', '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.r', '.matlab', '.sh', '.bat', '.ps1',
    // Images (for banners)
    '.png', '.jpg', '.jpeg', '.webp'
  ];
  
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${fileExt} not allowed`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 20 // Max 20 files per request
  },
  fileFilter: fileFilter
});

// Export different upload configurations
module.exports = {
  // For project creation (multiple project files + optional banner)
  uploadProject: upload.fields([
    { name: 'projectFiles', maxCount: 15 },
    { name: 'bannerImage', maxCount: 1 }
  ]),
  
  // --- NEW: Specific configuration for updating a project ---
  uploadProjectUpdate: upload.fields([
    { name: 'modelFile', maxCount: 1 },
    { name: 'bannerImage', maxCount: 1 },
    { name: 'projectFiles', maxCount: 15 }
  ]),
  
  // For single file uploads
  uploadSingle: upload.single('file'),
  
  // Error handler for multer errors
  handleUploadError: (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Too many files. Maximum is 20 files.' });
      }
    }
    
    if (err && err.message && err.message.includes('File type')) {
      return res.status(400).json({ error: err.message });
    }
    
    next(err);
  }
};
