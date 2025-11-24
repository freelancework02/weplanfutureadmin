// routes/blogRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 } // adjust limits: 5MB per file, up to 5 files per request
});

const ctrl = require('../Controller/blogController'); // adjust path if your folder is different

// Create blog with multiple images (field name: images[])
router.post('/', upload.array('images[]', 5), ctrl.createBlog);

// List blogs (paginated)
router.get('/', ctrl.listBlogs);

// Get single blog + images (no blobs)
router.get('/:id', ctrl.getBlog);

// Update blog (edit fields, append images, delete image ids)
// Use upload.array to accept new images with same field name images[]
router.put('/:id', upload.array('images[]', 5), ctrl.updateBlog);

// Delete blog
router.delete('/:id', ctrl.deleteBlog);

// Image-specific endpoints
router.post('/image', upload.single('image'), ctrl.createImage); // attach a single image to existing blog
router.get('/image/:imageId/blob', ctrl.getImageBlob);          // download/view image blob
router.delete('/image/:imageId', ctrl.deleteImage);            // delete single image

module.exports = router;
