# Debian-slim (glibc) base: the bundled ffmpeg-static/ffprobe-static binaries
# are glibc builds and will NOT run on Alpine (musl), so we can't use alpine here.
FROM node:24-slim

# App lives here.
WORKDIR /app

# Install dependencies first for a cache-friendly layer.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source.
COPY server.js ./
COPY transcribe ./transcribe

# Bind to all interfaces inside the container (the app defaults to 127.0.0.1,
# which would be unreachable from outside) and pick the listen port.
ENV HOST=0.0.0.0
ENV PORT=8000

# Run as the built-in unprivileged user shipped with the node image.
USER node

EXPOSE 8000

# Container-native health check hitting the UI route.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
