const multer = require("multer");

const maxCoverBytes = 2 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxCoverBytes, files: 1, fields: 12, fieldSize: 4096 },
}).single("cover");

function coverType(bytes) {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function readCoverUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      req.coverError = err.code === "LIMIT_FILE_SIZE"
        ? "The cover photo must be 2 MB or smaller."
        : "Could not read the photo upload. Choose one image and try again.";
      return next();
    }
    if (req.file) {
      const type = coverType(req.file.buffer);
      if (!type || type !== req.file.mimetype) {
        req.coverError = "Choose a JPEG, PNG, or WebP image.";
      } else {
        req.cover = { coverBytes: req.file.buffer, coverType: type };
      }
    }
    return next();
  });
}

module.exports = { readCoverUpload };
