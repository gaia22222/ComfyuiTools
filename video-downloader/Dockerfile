FROM node:22-bookworm-slim AS node
FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY video-downloader/requirements.txt /app/video-downloader/requirements.txt
RUN pip install --no-cache-dir -r /app/video-downloader/requirements.txt \
    && useradd --create-home --uid 10001 media
COPY VideoDownloader.html /app/VideoDownloader.html
COPY video-downloader/server.py video-downloader/app.js video-downloader/style.css /app/video-downloader/
RUN chown -R media:media /app
USER media
ENV PYTHONUNBUFFERED=1 MEDIA_MODE=cloud PORT=10000
EXPOSE 10000
CMD ["python", "video-downloader/server.py"]
