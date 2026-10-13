# LibreOffice (headless) for turning Office files into PDF previews.
FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui libreoffice-impress-nogui libreoffice-calc-nogui \
      fonts-dejavu fonts-liberation2 fonts-crosextra-carlito fonts-crosextra-caladea \
 && rm -rf /var/lib/apt/lists/*
COPY convert.sh /usr/local/bin/convert.sh
ENV HOME=/tmp
ENTRYPOINT ["bash", "/usr/local/bin/convert.sh"]
