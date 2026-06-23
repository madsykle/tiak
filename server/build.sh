#!/bin/bash
# Build server in release mode for small binary size

set -e

echo "Building server in release mode..."
cargo build --release

echo ""
echo "Binary size:"
ls -lh target/release/server

echo ""
echo "To run: ./target/release/server"