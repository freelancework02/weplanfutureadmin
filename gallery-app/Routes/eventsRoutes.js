// routes/eventsRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 50 } // 8MB per file, up to 50 files (adjust)
});

const ctrl = require('../Controller/eventsController'); // adjust path to match your structure

// Single-image endpoints (keep near top to avoid conflicts)
router.post('/image', upload.single('image'), ctrl.createImage);
router.get('/image/:imageId/blob', ctrl.getImageBlob);
router.delete('/image/:imageId', ctrl.deleteImage);

// Events CRUD
router.post('/', upload.array('images[]', 50), ctrl.createEvent);
router.get('/', ctrl.listEvents);
router.get('/:id', ctrl.getEvent);
router.put('/:id', upload.array('images[]', 50), ctrl.updateEvent);
router.delete('/:id', ctrl.deleteEvent);

module.exports = router;
