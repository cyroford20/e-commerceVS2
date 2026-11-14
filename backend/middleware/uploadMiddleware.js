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

const validateProofPhotoFile = async (file) => {
  const handle = await fs.promises.open(file.path, 'r');
  const header = Buffer.alloc(12);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }

  let extension = null;
  let mimeType = null;
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    extension = '.jpg';
    mimeType = 'image/jpeg';
  } else if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    extension = '.png';
    mimeType = 'image/png';
  } else if (header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP') {
    extension = '.webp';
    mimeType = 'image/webp';
  }

  if (!extension || file.mimetype !== mimeType) return false;

  const filename = `${path.parse(file.filename).name}${extension}`;
  if (filename !== file.filename) {
    const canonicalPath = path.join(proofDirectory, filename);
    await fs.promises.rename(file.path, canonicalPath);
    file.filename = filename;
    file.path = canonicalPath;
  }
  return true;
};

module.exports = { proofDirectory, uploadProofPhoto, validateProofPhotoFile };
