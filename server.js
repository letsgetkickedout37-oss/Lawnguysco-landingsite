const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// Change this password! Set via env var ADMIN_PASSWORD or update the default below.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'LawnGuys2026!';

const DATA_DIR = process.env.DATA_DIR || __dirname;
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews-data.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(UPLOADS_DIR));

function loadReviews() {
  try {
    if (!fs.existsSync(REVIEWS_FILE)) return [];
    return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveReviews(reviews) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 2));
}

app.get('/api/reviews', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(loadReviews());
});

app.post('/api/reviews', (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  const { name, rating, description, jobType } = req.body;

  if (!name?.trim() || !rating || !description?.trim() || !jobType?.trim()) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }

  const ratingNum = parseInt(rating);
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }

  const review = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 100),
    rating: ratingNum,
    description: description.trim().slice(0, 1000),
    jobType: jobType.trim().slice(0, 100),
    photo: req.file ? `/uploads/${req.file.filename}` : null,
    date: new Date().toISOString()
  };

  const reviews = loadReviews();
  reviews.unshift(review);
  saveReviews(reviews);
  res.json({ success: true, review });
});

app.delete('/api/reviews/:id', (req, res) => {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const reviews = loadReviews();
  const idx = reviews.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Review not found.' });

  const [removed] = reviews.splice(idx, 1);
  if (removed.photo) {
    const photoPath = path.join(__dirname, removed.photo);
    try { if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath); } catch {}
  }

  saveReviews(reviews);
  res.json({ success: true });
});

const server = app.listen(PORT, () => {
  console.log(`\nLawn Guys Co. server running at http://localhost:${PORT}`);
  console.log(`Admin panel:     http://localhost:${PORT}/admin.html`);
  console.log(`Admin password:  ${ADMIN_PASSWORD}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Try: PORT=3002 npm start\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
