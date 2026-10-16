# Linux with Chromium's headless shell: the only place Chrome renders frame by frame on demand (not on macOS)
FROM mcr.microsoft.com/playwright:v1.64.1-noble
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
