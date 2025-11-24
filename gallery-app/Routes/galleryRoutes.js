// routes/galleryRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 50 }
});

const ctrl = require('../Controller/galleryController'); // adjust path if your folder is "Controller"

// -----------------------------
// Create a full gallery (multiple images)
// POST /api/galleries
// field name for files: "images[]"
// -----------------------------
router.post('/', upload.array('images[]', 50), ctrl.createGallery);

// -----------------------------
// Single image endpoints
// POST /api/galleries/image   (single file field "image")
// GET  /api/galleries/image/:imageId/blob
// DELETE /api/galleries/image/:imageId
// -----------------------------
router.post('/image', upload.single('image'), ctrl.createImage);
router.get('/image/:imageId/blob', ctrl.getImageBlob);
router.delete('/image/:imageId', ctrl.deleteImage);

// -----------------------------
// Gallery endpoints
// GET    /api/galleries          (list - paginated)
// GET    /api/galleries/:id      (get gallery metadata + image list)
// PUT    /api/galleries/:id      (update gallery, append images using images[])
// DELETE /api/galleries/:id
// -----------------------------
router.get('/', ctrl.listGalleries);
router.get('/:id', ctrl.getGallery);
router.put('/:id', upload.array('images[]', 50), ctrl.updateGallery);
router.delete('/:id', ctrl.deleteGallery);

module.exports = router;
