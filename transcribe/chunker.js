// Audio splitting with the bundled ffmpeg/ffprobe static binaries.
//
//  * byDuration — segment into fixed-length pieces with stream copy (fast, no
//    re-encode). Falls back to a re-encode if copy-segmenting fails for the
//    container.
//  * bySize     — probe duration + byte size, derive the seconds-per-segment
//    that approximates the target MB, then delegate to byDuration. (VBR audio
//    makes an exact byte target impossible without re-encoding, so this is an
//    approximation.)

const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(stderr)
        : reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.slice(-500)}`))
    );
  });
}

// Total duration (seconds) and size (bytes) of the input.
async function probe(inputPath) {
  const out = await new Promise((resolve, reject) => {
    const p = spawn(ffprobePath, [
      "-v", "error",
      "-show_entries", "format=duration,size",
      "-print_format", "json",
      inputPath,
    ]);
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`ffprobe: ${stderr}`))
    );
  });
  const fmt = JSON.parse(out).format || {};
  return {
    duration: parseFloat(fmt.duration) || 0,
    size: parseInt(fmt.size, 10) || 0,
  };
}

async function segment(inputPath, outDir, secondsPerSegment, ext, reencode) {
  const pattern = path.join(outDir, `%03d.${ext}`);
  const codecArgs = reencode ? [] : ["-c", "copy"];
  await run(ffmpegPath, [
    "-i", inputPath,
    "-f", "segment",
    "-segment_time", String(secondsPerSegment),
    "-reset_timestamps", "1",
    ...codecArgs,
    "-y",
    pattern,
  ]);

  const files = (await fsp.readdir(outDir))
    .filter((f) => f.endsWith(`.${ext}`))
    .sort();
  if (!files.length) throw new Error("ffmpeg produced no segments");
  return files.map((f) => path.join(outDir, f));
}

// Split `inputPath` into `outDir`. `unit` is "seconds" or "mb"; `size` is the
// number the user typed. Returns ordered chunk descriptors.
async function split(inputPath, outDir, unit, size, ext) {
  await fsp.mkdir(outDir, { recursive: true });
  const { duration } = await probe(inputPath);

  let secondsPerSegment;
  if (unit === "mb") {
    const { size: bytes } = await probe(inputPath);
    const bytesPerSec = duration > 0 ? bytes / duration : 0;
    const targetBytes = size * 1024 * 1024;
    secondsPerSegment =
      bytesPerSec > 0 ? Math.max(5, Math.floor(targetBytes / bytesPerSec)) : 60;
  } else {
    secondsPerSegment = Math.max(1, Math.floor(size));
  }

  let files;
  try {
    files = await segment(inputPath, outDir, secondsPerSegment, ext, false);
  } catch {
    // Some containers won't stream-copy cleanly at arbitrary cut points.
    files = await segment(inputPath, outDir, secondsPerSegment, ext, true);
  }

  return files.map((p, idx) => {
    const startSec = idx * secondsPerSegment;
    const durSec = Math.max(0, Math.min(secondsPerSegment, duration - startSec));
    return { path: p, idx, startSec, durSec };
  });
}

module.exports = { split, probe };
