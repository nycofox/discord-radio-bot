FROM node:20-bookworm-slim

# Install ffmpeg for stream decoding
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
# If you add package-lock.json later, copy it too for reproducible builds
RUN npm install --omit=dev

COPY src ./src

CMD ["npm", "start"]
