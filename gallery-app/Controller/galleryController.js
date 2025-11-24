// controllers/galleryController.js
const pool = require('../Db/index');
const fs = require('fs');

// Convert Bytes to MB (for debug)
const bytesToMB = (b) => Math.round((b / (1024 * 1024)) * 10) / 10;

// -------------------------------------------------------
// CREATE GALLERY (with multiple images)
// -------------------------------------------------------
exports.createGallery = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { title, description = '', isPublished = 'true', coverIndex = '0' } = req.body;

    if (!title || !req.files || req.files.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Title and at least one image required.' });
    }

    // Insert gallery
    const [gRes] = await conn.query(
      `INSERT INTO galleries (title, description, is_published)
       VALUES (?, ?, ?)`,
      [title.trim(), description, (isPublished === 'true' || isPublished === '1') ? 1 : 0]
    );
    const galleryId = gRes.insertId;

    // Insert images (image_blob column expected)
    const insertedImageIds = [];
    let idx = 0;
    for (const file of req.files) {
      // file.buffer is available because multer.memoryStorage() is used
      const [iRes] = await conn.query(
        `INSERT INTO gallery_images (gallery_id, image_name, image_blob, sort_order)
         VALUES (?, ?, ?, ?)`,
        [galleryId, file.originalname, file.buffer, idx]
      );
      insertedImageIds.push(iRes.insertId);
      idx++;
    }

    // Set cover_image_id if requested & within range
    const ci = Math.max(0, Math.min(insertedImageIds.length - 1, Number(coverIndex || 0)));
    if (insertedImageIds[ci]) {
      await conn.query(`UPDATE galleries SET cover_image_id = ? WHERE id = ?`, [insertedImageIds[ci], galleryId]);
    }

    await conn.commit();
    res.status(201).json({ success: true, galleryId, insertedImages: insertedImageIds.length });
  } catch (err) {
    try { await conn.rollback(); } catch (e) { /* ignore */ }
    console.error('createGallery error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  } finally {
    conn.release();
  }
};

// -------------------------------------------------------
// CREATE SINGLE IMAGE (attach to an existing gallery)
// Route: POST /api/galleries/image  (field name: "image")
// -------------------------------------------------------
exports.createImage = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { gallery_id, sort_order } = req.body;
    const galleryId = Number(gallery_id);

    if (!galleryId || Number.isNaN(galleryId)) {
      return res.status(400).json({ error: 'gallery_id (number) is required.' });
    }

    // optional: validate gallery exists
    const [[gallery]] = await conn.query(`SELECT id FROM galleries WHERE id = ?`, [galleryId]);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found.' });

    const [r] = await conn.query(
      `INSERT INTO gallery_images (gallery_id, image_name, image_blob, sort_order)
       VALUES (?, ?, ?, ?)`,
      [galleryId, req.file.originalname, req.file.buffer, Number(sort_order) || 0]
    );

    res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    console.error('createImage error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  } finally {
    conn.release();
  }
};

// -------------------------------------------------------
// GET GALLERY + IMAGES (NO BLOBS IN LIST)
// Route: GET /api/galleries/:id
// -------------------------------------------------------
exports.getGallery = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const conn = await pool.getConnection();
  try {
    const [[gallery]] = await conn.query(`SELECT * FROM galleries WHERE id = ?`, [id]);
    if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

    const [images] = await conn.query(
      `SELECT id, image_name, CHAR_LENGTH(image_blob) AS size, sort_order, created_at
       FROM gallery_images
       WHERE gallery_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [id]
    );

    res.json({ gallery, images });
  } catch (err) {
    console.error('getGallery error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// -------------------------------------------------------
// GET SINGLE IMAGE BLOB (DOWNLOAD/VIEW)
// Route: GET /api/galleries/image/:imageId/blob
// -------------------------------------------------------
exports.getImageBlob = async (req, res) => {
  const id = Number(req.params.imageId);
  if (!id) return res.status(400).json({ error: 'Invalid image id' });

  const conn = await pool.getConnection();
  try {
    const [[img]] = await conn.query(
      `SELECT id, image_name, image_blob FROM gallery_images WHERE id = ?`,
      [id]
    );

    if (!img) return res.status(404).json({ error: 'Image not found' });

    // We don't store mime_type in schema — use generic octet-stream.
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${img.image_name}"`);
    res.send(img.image_blob);
  } catch (err) {
    console.error('getImageBlob error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// -------------------------------------------------------
// LIST ALL GALLERIES (paginated)
// Route: GET /api/galleries
// -------------------------------------------------------
exports.listGalleries = async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const per = Math.min(50, Number(req.query.per) || 12);
  const offset = (page - 1) * per;

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT g.id, g.title, g.description, g.is_published, g.cover_image_id, g.created_at
       FROM galleries g
       ORDER BY g.created_at DESC
       LIMIT ? OFFSET ?`,
      [per, offset]
    );

    res.json({ page, per, data: rows });
  } catch (err) {
    console.error('listGalleries error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// -------------------------------------------------------
// UPDATE GALLERY (EDIT + UPLOAD FILES)
// Route: PUT /api/galleries/:id
// -------------------------------------------------------
exports.updateGallery = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const { title, description, isPublished, coverIndex } = req.body;
  const files = req.files || [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const updateFields = [];
    const params = [];

    if (title !== undefined) { updateFields.push('title = ?'); params.push(title); }
    if (description !== undefined) { updateFields.push('description = ?'); params.push(description); }
    if (isPublished !== undefined) { updateFields.push('is_published = ?'); params.push((isPublished === 'true' || isPublished === '1') ? 1 : 0); }

    if (updateFields.length > 0) {
      params.push(id);
      await conn.query(`UPDATE galleries SET ${updateFields.join(', ')} WHERE id = ?`, params);
    }

    // append new files if any
    if (files.length > 0) {
      const [[{ maxorder }]] = await conn.query(`SELECT COALESCE(MAX(sort_order), -1) AS maxorder FROM gallery_images WHERE gallery_id = ?`, [id]);
      let order = (maxorder === null ? -1 : maxorder);
      for (const f of files) {
        order++;
        await conn.query(
          `INSERT INTO gallery_images (gallery_id, image_name, image_blob, sort_order) VALUES (?, ?, ?, ?)`,
          [id, f.originalname, f.buffer, order]
        );
      }
    }

    // optionally set cover image by index (index relative to gallery ordered list)
    if (coverIndex !== undefined) {
      const ci = Number(coverIndex);
      const [imgs] = await conn.query(
        `SELECT id FROM gallery_images WHERE gallery_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1 OFFSET ?`,
        [id, Math.max(0, ci)]
      );
      if (imgs.length) {
        await conn.query(`UPDATE galleries SET cover_image_id = ? WHERE id = ?`, [imgs[0].id, id]);
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('updateGallery error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// -------------------------------------------------------
// DELETE ENTIRE GALLERY
// Route: DELETE /api/galleries/:id
// -------------------------------------------------------
exports.deleteGallery = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const conn = await pool.getConnection();
  try {
    const [r] = await conn.query(`DELETE FROM galleries WHERE id = ?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('deleteGallery error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// -------------------------------------------------------
// DELETE SINGLE IMAGE
// Route: DELETE /api/galleries/image/:imageId
// -------------------------------------------------------
exports.deleteImage = async (req, res) => {
  const id = Number(req.params.imageId);
  if (!id) return res.status(400).json({ error: 'Invalid image id' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // null cover reference if this image was set as cover
    await conn.query(`UPDATE galleries SET cover_image_id = NULL WHERE cover_image_id = ?`, [id]);

    const [r] = await conn.query(`DELETE FROM gallery_images WHERE id = ?`, [id]);
    await conn.commit();

    if (r.affectedRows === 0) return res.status(404).json({ error: 'Image not found' });
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('deleteImage error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};
