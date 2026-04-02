const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Deleted file: ${filePath}`);
    }
  } catch (err) {
    logger.error(`Failed to delete file ${filePath}: ${err.message}`);
  }
}

function ensureTempDir() {
  const tempDir = path.resolve(process.env.TEMP_DIR || './temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

function generateTempPath(filename) {
  const tempDir = ensureTempDir();
  return path.join(tempDir, filename);
}

module.exports = { deleteFile, ensureTempDir, generateTempPath };
