// Object storage for the transcriber, via the AWS S3 SDK (v3). Holds the source
// audio, each chunk, and the final compiled Markdown.
//
// Works against real AWS S3 or any S3-compatible server (e.g. MinIO): set
// AWS_S3_ENDPOINT to the custom endpoint and the client switches to path-style
// addressing automatically. Credentials come from AWS_ACCESS_KEY_ID /
// AWS_SECRET_ACCESS_KEY, or fall back to the SDK's default provider chain.

const fs = require("fs");
const { pipeline } = require("stream/promises");
const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const BUCKET = process.env.AWS_S3_BUCKET_NAME || "transcriber";
const REGION = process.env.AWS_S3_REGION || process.env.AWS_REGION || "us-east-1";
const ENDPOINT = process.env.AWS_S3_ENDPOINT || undefined;

// Path-style is required by most S3-compatible servers (MinIO). Default it on
// whenever a custom endpoint is set; allow an explicit override.
const FORCE_PATH_STYLE = process.env.AWS_S3_FORCE_PATH_STYLE
  ? /^true$/i.test(process.env.AWS_S3_FORCE_PATH_STYLE)
  : Boolean(ENDPOINT);

const credentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined; // fall back to the SDK default credential provider chain

const client = new S3Client({
  region: REGION,
  ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
  forcePathStyle: FORCE_PATH_STYLE,
  ...(credentials ? { credentials } : {}),
});

// Create the bucket on first boot if it isn't there yet.
async function ensureBucket() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return;
  } catch (err) {
    // 404/NotFound/NoSuchBucket → create it; anything else is a real error.
    const status = err?.$metadata?.httpStatusCode;
    if (status && status !== 404 && err.name !== "NotFound" && err.name !== "NoSuchBucket") {
      throw err;
    }
  }
  // Real AWS outside us-east-1 needs an explicit LocationConstraint; S3-compatible
  // servers behind a custom endpoint generally don't want one.
  const input = { Bucket: BUCKET };
  if (!ENDPOINT && REGION !== "us-east-1") {
    input.CreateBucketConfiguration = { LocationConstraint: REGION };
  }
  await client.send(new CreateBucketCommand(input));
}

// Upload a local file under `key`. Uses the managed Upload (multipart for large
// files) so the source audio streams from disk without buffering.
async function putFile(key, filePath, contentType) {
  const up = new Upload({
    client,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: fs.createReadStream(filePath),
      ...(contentType ? { ContentType: contentType } : {}),
    },
  });
  await up.done();
}

// Download object `key` to a local path.
async function getFile(key, filePath) {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  await pipeline(res.Body, fs.createWriteStream(filePath));
}

// Upload a Buffer/string under `key`.
async function putBuffer(key, buf, contentType) {
  const Body = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body,
      ContentLength: Body.length,
      ...(contentType ? { ContentType: contentType } : {}),
    })
  );
}

// Read an object fully into a Buffer.
async function getBuffer(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

// Open a readable stream for an object (used to stream results to the client).
async function getStream(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return res.Body; // Node Readable
}

// Delete every object under `prefix` (e.g. "jobs/<id>/"). Lists in pages and
// deletes in batches of up to 1000 keys (the S3/MinIO DeleteObjects limit).
// No-ops cleanly when nothing matches.
async function deletePrefix(prefix) {
  let token;
  do {
    const list = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    const objs = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (objs.length) {
      await client.send(
        new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: objs, Quiet: true } })
      );
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
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
  deletePrefix,
};
