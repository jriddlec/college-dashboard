# canvas-runner: the Canvas sync (compose service canvas-sync). Standard
# library only, so a plain Python image is enough. See docs/canvas.md.
FROM python:3.13-alpine
# Context is the app dir (see Dockerfile.dockerignore). The script is baked
# in, so rebuild the image after changing it.
COPY scripts/canvas_sync.py /opt/canvas-runner/canvas_sync.py
ENV PYTHONUTF8=1 PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python3", "/opt/canvas-runner/canvas_sync.py"]
CMD ["--dest", "/data", "--every", "1800"]
