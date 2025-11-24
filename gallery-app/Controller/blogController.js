// controllers/blogController.js
const pool = require('../Db/index');
//
// Blog controller: create/list/get/update/delete, image endpoints
//

// helper
const safeParseJSON = (v) => {
  try { return JSON.parse(v); } catch(e){ return null; }
};

exports.createBlog = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      title,
      excerpt = null,
      content_html = '',
      content_delta = null,
      isPublished = 'true',
      coverIndex = '-1'
    } = req.body;

    const files = req.files || [];

    if (!title || !String(title).trim()) {
      await conn.rollback();
      return res.status(400).json({ error: 'title is required' });
    }

    // Insert blog
    const [blogRes] = await conn.query(
      `INSERT INTO blogs (title, excerpt, content_html, content_delta, is_published)
       VALUES (?, ?, ?, ?, ?)`,
      [
        String(title).trim(),
        excerpt ? String(excerpt).trim() : null,
        content_html || '',
        content_delta ? content_delta : null,
        (isPublished === 'true' || isPublished === '1') ? 1 : 0
      ]
    );

    const blogId = blogRes.insertId;
    const insertedImageIds = [];

    // Insert images (if any)
    let idx = 0;
    for (const f of files) {
      const [imgRes] = await conn.query(
        `INSERT INTO blog_images (blog_id, image_name, mime_type, image_blob, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [blogId, f.originalname || `file-${Date.now()}`, f.mimetype || null, f.buffer, idx]
      );
      insertedImageIds.push(imgRes.insertId);
      idx++;
    }

    // set cover image if requested
    const ci = Math.max(-1, Number(coverIndex || -1));
    if (ci >= 0 && insertedImageIds[ci]) {
      await conn.query(`UPDATE blogs SET cover_image_id = ? WHERE id = ?`, [insertedImageIds[ci], blogId]);
    }

    await conn.commit();
    res.status(201).json({ ok: true, blogId, imagesInserted: insertedImageIds.length });
  } catch (err) {
    try { await conn.rollback(); } catch(e){/*ignore*/ }
    console.error('createBlog error', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  } finally {
    conn.release();
  }
};

exports.listBlogs = async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const per = Math.min(50, Number(req.query.per) || 12);
  const offset = (page - 1) * per;

  const conn = await pool.getConnection();
  try {
    // return blog metadata + image counts (without blobs)
    const [rows] = await conn.query(
      `SELECT 
         b.id, b.title, b.excerpt, b.is_published, b.cover_image_id, b.created_at, b.updated_at,
         COALESCE(ci.images_count, 0) AS images_count
       FROM blogs b
       LEFT JOIN (
         SELECT blog_id, COUNT(*) AS images_count FROM blog_images GROUP BY blog_id
       ) ci ON ci.blog_id = b.id
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      [per, offset]
    );

    res.json({ page, per, data: rows });
  } catch (err) {
    console.error('listBlogs error', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

exports.getBlog = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const conn = await pool.getConnection();
  try {
    const [[blog]] = await conn.query(`SELECT * FROM blogs WHERE id = ?`, [id]);
    if (!blog) return res.status(404).json({ error: 'Blog not found' });

    // get images (no blob)
    const [images] = await conn.query(
      `SELECT id, image_name, mime_type, CHAR_LENGTH(image_blob) AS size, sort_order, created_at
       FROM blog_images
       WHERE blog_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [id]
    );

    res.json({ blog, images });
  } catch (err) {
    console.error('getBlog error', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

exports.getImageBlob = async (req, res) => {
  const id = Number(req.params.imageId);
  if (!id) return res.status(400).json({ error: 'Invalid image id' });

  const conn = await pool.getConnection();
  try {
    const [[img]] = await conn.query(
      `SELECT id, image_name, mime_type, image_blob FROM blog_images WHERE id = ?`,
      [id]
    );
    if (!img) return res.status(404).json({ error: 'Image not found' });

    const mime = img.mime_type || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    // inline display; clients can override by saving
    res.setHeader('Content-Disposition', `inline; filename="${img.image_name || ('image-' + img.id)}"`);
    res.send(img.image_blob);
  } catch (err) {
    console.error('getImageBlob error', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

// Attach a single image to an existing blog
exports.createImage = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const blogId = Number(req.body.blog_id);
    if (!blogId) return res.status(400).json({ error: 'blog_id is required' });

    // ensure blog exists
    const [[b]] = await conn.query(`SELECT id FROM blogs WHERE id = ?`, [blogId]);
    if (!b) return res.status(404).json({ error: 'Blog not found' });

    const sortOrder = Number(req.body.sort_order) || 0;
    const [r] = await conn.query(
      `INSERT INTO blog_images (blog_id, image_name, mime_type, image_blob, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [blogId, req.file.originalname || '', req.file.mimetype || null, req.file.buffer, sortOrder]
    );

    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error('createImage error', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  } finally {
    conn.release();
  }
};

// Update blog: edit fields, append new images, optionally delete image ids, set cover image
exports.updateBlog = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const id = Number(req.params.id);
    if (!id) { await conn.rollback(); return res.status(400).json({ error: 'Invalid id' }); }

    // get fields
    const { title, excerpt, content_html, content_delta, isPublished, coverImageId, deleteImageIds } = req.body;
    const files = req.files || [];

    // update blog fields if provided
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push('title = ?'); params.push(String(title).trim()); }
    if (excerpt !== undefined) { updates.push('excerpt = ?'); params.push(excerpt ? String(excerpt) : null); }
    if (content_html !== undefined) { updates.push('content_html = ?'); params.push(content_html); }
    if (content_delta !== undefined) { updates.push('content_delta = ?'); params.push(content_delta || null); }
    if (isPublished !== undefined) { updates.push('is_published = ?'); params.push((isPublished === 'true' || isPublished === '1') ? 1 : 0); }

    if (updates.length > 0) {
      params.push(id);
      await conn.query(`UPDATE blogs SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    // delete images if requested (comma-separated ids or array)
    if (deleteImageIds) {
      let delIds = [];
      if (Array.isArray(deleteImageIds)) delIds = deleteImageIds.map(Number);
      else delIds = String(deleteImageIds).split(',').map(s => Number(s)).filter(Boolean);

      if (delIds.length) {
        // null any cover references that point to these images
        await conn.query(`UPDATE blogs SET cover_image_id = NULL WHERE cover_image_id IN (?) AND id = ?`, [delIds, id]);
        await conn.query(`DELETE FROM blog_images WHERE id IN (?) AND blog_id = ?`, [delIds, id]);
      }
    }

    // append new files
    if (files.length > 0) {
      // determine current max sort_order
      const [[{ maxorder }]] = await conn.query(`SELECT COALESCE(MAX(sort_order), -1) AS maxorder FROM blog_images WHERE blog_id = ?`, [id]);
      let order = (maxorder === null ? -1 : maxorder);
      for (const f of files) {
        order++;
        await conn.query(
          `INSERT INTO blog_images (blog_id, image_name, mime_type, image_blob, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [id, f.originalname || '', f.mimetype || null, f.buffer, order]
        );
      }
    }

    // set cover image if provided (must belong to this blog)
    if (coverImageId !== undefined && coverImageId !== '') {
      const coverId = Number(coverImageId);
      if (!Number.isNaN(coverId)) {
        const [[img]] = await conn.query(`SELECT id FROM blog_images WHERE id = ? AND blog_id = ?`, [coverId, id]);
        if (img) {
          await conn.query(`UPDATE blogs SET cover_image_id = ? WHERE id = ?`, [coverId, id]);
        } else {
          // ignore if image not found / doesn't belong
        }
      }
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    try { await conn.rollback(); } catch(e){/*ignore*/ }
    console.error('updateBlog error', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};

exports.deleteBlog = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [r] = await pool.query(`DELETE FROM blogs WHERE id = ?`, [id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteBlog error', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteImage = async (req, res) => {
  const id = Number(req.params.imageId);
  if (!id) return res.status(400).json({ error: 'Invalid image id' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // clear cover references
    await conn.query(`UPDATE blogs SET cover_image_id = NULL WHERE cover_image_id = ?`, [id]);
    const [r] = await conn.query(`DELETE FROM blog_images WHERE id = ?`, [id]);
    await conn.commit();
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Image not found' });
    res.json({ ok: true });
  } catch (err) {
    try { await conn.rollback(); } catch(e){/*ignore*/ }
    console.error('deleteImage error', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};
