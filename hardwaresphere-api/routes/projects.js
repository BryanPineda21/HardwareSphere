const express = require('express');
const { verifyFirebaseToken, optionalVerifyFirebaseToken } = require('../middleware/auth');
const { uploadProject, uploadProjectUpdate, handleUploadError } = require('../middleware/upload');
const projectService = require('../services/project-service'); // 💡 Use the new service
const { admin } = require('../config/firebase');

const router = express.Router();

// --- Get a single project by ID ---
// This is the most critical route for fixing your issue.
router.get('/:id', optionalVerifyFirebaseToken, async (req, res) => {
  try {

    console.log('Server time upon request:', new Date().toISOString());

    // 💡 The service now handles fetching AND generating fresh signed URLs.
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
    
    // The `project` object now contains fresh, valid URLs.
    res.json(project);

  } catch (error) {
    console.error(`Error fetching project ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});


// --- Other routes now simplified by using the service ---

router.post('/', verifyFirebaseToken, uploadProject, handleUploadError, async (req, res) => {
  try {
    const project = await projectService.createProject(req.user.uid, req.body, req.files);
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project', message: error.message });
  }
});

router.put('/:id', verifyFirebaseToken, uploadProjectUpdate, handleUploadError, async (req, res) => {
  try {
    const updatedProject = await projectService.updateProject(req.params.id, req.user.uid, req.body, req.files);
    res.status(200).json(updatedProject);
  } catch (error) {
    console.error(`Error updating project ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update project', message: error.message });
  }
});

router.delete('/:id', verifyFirebaseToken, async (req, res) => {
  try {
    const result = await projectService.deleteProject(req.params.id, req.user.uid);
    res.status(200).json(result);
  } catch (error) {
    console.error(`Error deleting project ${req.params.id}:`, error);
    res.status(error.code || 500).json({ error: error.message });
  }
});

router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const projects = await projectService.getUserProjects(req.user.uid);
    res.json(projects);
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Increment view count for a project
router.post('/:id/view', async (req, res) => {
  try {
    const projectId = req.params.id;
    const projectRef = admin.firestore().collection('projects').doc(projectId);
    await projectRef.update({ 'stats.views': admin.firestore.FieldValue.increment(1) });
    res.status(200).send({ success: true });
  } catch (error) {
    console.error('Error incrementing view count:', error);
    res.status(500).json({ error: 'Failed to update view count' });
  }
});


module.exports = router;