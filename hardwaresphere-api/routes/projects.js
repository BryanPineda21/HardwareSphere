const express = require('express');
const { verifyFirebaseToken, optionalVerifyFirebaseToken } = require('../middleware/auth');
const { uploadProject, uploadProjectUpdate, handleUploadError } = require('../middleware/upload');
const projectService = require('../services/project-service');
const { admin } = require('../config/firebase');

// 🚀 NEW: Import Redis caching
const { cache } = require('../middleware/cache');
const redisClient = require('../config/redis');

const router = express.Router();

// 🚀 NEW: Cache middleware for individual projects (5 minutes)
const cacheProject = cache((req) => `project:${req.params.id}`, 300);

// 🚀 NEW: Cache middleware for user projects (2 minutes) 
const cacheUserProjects = cache((req) => `user:${req.user.uid}:projects`, 120);

// --- Get a single project by ID (WITH CACHING) ---
router.get('/:id', optionalVerifyFirebaseToken, cacheProject, async (req, res) => {
  try {
    console.log('Server time upon request:', new Date().toISOString());

    const project = await projectService.getProject(req.params.id);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check permissions for private projects
    if (project.visibility === 'private') {
      if (!req.user || req.user.uid !== project.userId) {
        return res.status(404).json({ error: 'Project not found or you do not have permission to view it.' });
      }
    }
    
    res.json(project);

  } catch (error) {
    console.error(`Error fetching project ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// --- Get user's projects (WITH CACHING) ---
router.get('/me', verifyFirebaseToken, cacheUserProjects, async (req, res) => {
  try {
    const projects = await projectService.getUserProjects(req.user.uid);
    res.json(projects);
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// --- Create project (WITH CACHE INVALIDATION) ---
router.post('/', verifyFirebaseToken, uploadProject, handleUploadError, async (req, res) => {
  try {
    const project = await projectService.createProject(req.user.uid, req.body, req.files);
    
    // 🚀 NEW: Invalidate user's project list cache
    await redisClient.del(`user:${req.user.uid}:projects`);
    console.log(`💾 Cache invalidated for user projects: ${req.user.uid}`);
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project', message: error.message });
  }
});

// --- Update project (WITH CACHE INVALIDATION) ---
router.put('/:id', verifyFirebaseToken, uploadProjectUpdate, handleUploadError, async (req, res) => {
  try {
    const updatedProject = await projectService.updateProject(req.params.id, req.user.uid, req.body, req.files);
    
    // 🚀 NEW: Invalidate both project and user project list caches
    await redisClient.del(`project:${req.params.id}`);
    await redisClient.del(`user:${req.user.uid}:projects`);
    console.log(`💾 Cache invalidated for project: ${req.params.id} and user: ${req.user.uid}`);
    
    res.status(200).json(updatedProject);
  } catch (error) {
    console.error(`Error updating project ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update project', message: error.message });
  }
});

// --- Delete project (WITH CACHE INVALIDATION) ---
router.delete('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const result = await projectService.deleteProject(req.params.id, req.user.uid);
    
    // 🚀 NEW: Invalidate both project and user project list caches
    await redisClient.del(`project:${req.params.id}`);
    await redisClient.del(`user:${req.user.uid}:projects`);
    console.log(`💾 Cache invalidated for deleted project: ${req.params.id} and user: ${req.user.uid}`);
    
    res.status(200).json(result);
  } catch (error) {
    console.error(`Error deleting project ${req.params.id}:`, error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

// --- Increment view count (WITH CACHE INVALIDATION) ---
router.post('/:id/view', async (req, res) => {
  try {
    const projectId = req.params.id;
    const projectRef = admin.firestore().collection('projects').doc(projectId);
    await projectRef.update({ 'stats.views': admin.firestore.FieldValue.increment(1) });
    
    // 🚀 NEW: Invalidate project cache (view count changed)
    await redisClient.del(`project:${projectId}`);
    console.log(`💾 Cache invalidated for view count update: ${projectId}`);
    
    res.status(200).send({ success: true });
  } catch (error) {
    console.error('Error incrementing view count:', error);
    res.status(500).json({ error: 'Failed to update view count' });
  }
});

module.exports = router;