import sys
import json
import os
try:
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({"error": "faster_whisper not installed"}))
    sys.exit(1)

def transcribe(video_path):
    if not os.path.exists(video_path):
        return {"error": "File not found"}

    try:
        # Use "small" or "base" model as requested. User said "small".
        # device="cpu" or "cuda" if available. Sticking to cpu for compatibility unless instructed.
        model = WhisperModel("small", device="cpu", compute_type="int8")
        segments, _ = model.transcribe(video_path)

        transcript = " ".join([segment.text for segment in segments]).strip()
        return {"transcript": transcript}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No video path provided"}))
        sys.exit(1)

    video_path = sys.argv[1]
    result = transcribe(video_path)
    print(json.dumps(result))
