#!/bin/bash
# Install python dependencies for Tiak server

if [ -d "venv_python" ]; then
    echo "Using existing venv..."
    source venv_python/bin/activate
else
    echo "Creating venv..."
    python3 -m venv venv_python
    source venv_python/bin/activate
fi

echo "Installing faster-whisper..."
pip install faster-whisper

echo "Downloading yt-dlp..."
mkdir -p bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o bin/yt-dlp
chmod +x bin/yt-dlp

echo "Done."
