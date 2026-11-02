const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const proofDirectory = path.join(__dirname, '..', 'private', 'delivery-proofs');
fs.mkdirSync(proofDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: proofDirectory,
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const uploadProofPhoto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new Error('Proof photo must be JPEG, PNG, or WebP.'));
    }
    callback(null, true);
  },
});

module.exports = { proofDirectory, uploadProofPhoto };
