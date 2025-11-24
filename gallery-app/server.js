require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const galleryRoutes = require('./Routes/galleryRoutes');
const blogRoutes = require('./Routes/blogRoutes');
const eventsRoutes = require('./Routes/eventsRoutes')
const dashboardRoutes = require('./Routes/dashboardRoutes')

const PORT = process.env.PORT || 3000;

// ------------------------------
// CORS - dynamic whitelist
// ------------------------------
const allowed = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:3000',
  'http://localhost:3000'
]);

app.use(cors({
  origin: function(origin, callback){
    // allow requests with no origin (curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowed.has(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','Accept'],
  credentials: true
}));

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/galleries', galleryRoutes);
app.use('/api/blogs', blogRoutes); // or app.use('/api', blogRoutes) if routes define '/blogs' root
app.use('/api/events', eventsRoutes); // or app.use('/api', blogRoutes) if routes define '/blogs' root
app.use('/api/dashboard', dashboardRoutes); // or app.use('/api', blogRoutes) if routes define '/blogs' root

 
// Health route
app.get('/', (req, res) => res.json({ ok: true, version: '1.0' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('ERROR HANDLER:', err && err.message ? err.message : err);
  // If this is a CORS error, return 403 with message:
  if (err && err.message && err.message.startsWith('Not allowed by CORS')) {
    return res.status(403).json({ error: 'CORS Error: origin not allowed' });
  }
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
