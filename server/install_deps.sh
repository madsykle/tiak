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

echo "Done."
