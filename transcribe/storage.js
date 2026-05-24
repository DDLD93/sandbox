// MinIO (S3-compatible) object storage for the transcriber. Holds the source
// audio, each chunk, and the final compiled Markdown. Config from env vars.

const Minio = require("minio");
const fs = require("fs");

const BUCKET = process.env.MINIO_BUCKET || "transcriber";

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || "127.0.0.1",
  port: parseInt(process.env.MINIO_PORT || "9000", 10),
  useSSL: /^true$/i.test(process.env.MINIO_USE_SSL || "false"),
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});

// Create the bucket on first boot if it isn't there yet.
async function ensureBucket() {
  const exists = await client.bucketExists(BUCKET).catch(() => false);
  if (!exists) await client.makeBucket(BUCKET);
}

// Upload a local file under `key`.
function putFile(key, filePath, contentType) {
  const meta = contentType ? { "Content-Type": contentType } : {};
  return client.fPutObject(BUCKET, key, filePath, meta);
}

// Download object `key` to a local path.
function getFile(key, filePath) {
  return client.fGetObject(BUCKET, key, filePath);
}

// Upload a Buffer/string under `key`.
function putBuffer(key, buf, contentType) {
  const body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const meta = contentType ? { "Content-Type": contentType } : {};
  return client.putObject(BUCKET, key, body, body.length, meta);
}

// Read an object fully into a Buffer.
async function getBuffer(key) {
  const stream = await client.getObject(BUCKET, key);
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

// Open a readable stream for an object (used to stream results to the client).
function getStream(key) {
  return client.getObject(BUCKET, key);
}

module.exports = {
  BUCKET,
  client,
  ensureBucket,
  putFile,
  getFile,
  putBuffer,
  getBuffer,
  getStream,
};
