import json
import os
import sys
import wave

from vosk import KaldiRecognizer, Model, SetLogLevel


MODEL_BASE_DIR = os.path.join(os.path.dirname(__file__), "models")
DEFAULT_MODEL_CANDIDATES = (
    "vosk-model-small-en-in-0.5",
    "vosk-model-small-en-in-0.4",
)


def fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(1)


def resolve_model_path():
    configured_path = os.environ.get("VOSK_MODEL_PATH")
    if configured_path:
        return configured_path

    for model_name in DEFAULT_MODEL_CANDIDATES:
        candidate_path = os.path.join(MODEL_BASE_DIR, model_name)
        if os.path.isdir(candidate_path):
            return candidate_path

    return os.path.join(MODEL_BASE_DIR, DEFAULT_MODEL_CANDIDATES[0])


def extract_text(recognizer, raw_result):
    try:
        payload = json.loads(raw_result)
    except json.JSONDecodeError:
        return ""
    return (payload.get("text") or "").strip()


def transcribe_audio(file_path):
    model_path = resolve_model_path()

    if not os.path.isdir(model_path):
        fail(f"Vosk model not found at {model_path}")

    if not os.path.isfile(file_path):
        fail(f"Audio file not found: {file_path}")

    SetLogLevel(-1)
    model = Model(model_path)

    try:
        with wave.open(file_path, "rb") as audio_file:
            if audio_file.getcomptype() != "NONE":
                fail("Compressed WAV files are not supported")

            recognizer = KaldiRecognizer(model, audio_file.getframerate())
            parts = []

            while True:
                chunk = audio_file.readframes(4000)
                if not chunk:
                    break

                if recognizer.AcceptWaveform(chunk):
                    text = extract_text(recognizer, recognizer.Result())
                    if text:
                        parts.append(text)

            final_text = extract_text(recognizer, recognizer.FinalResult())
            if final_text:
                parts.append(final_text)
    except wave.Error as error:
        fail(f"Invalid WAV file: {error}")

    return " ".join(part for part in parts if part).strip()


def main():
    if len(sys.argv) != 2:
        fail("Usage: python voice.py <wav-file-path>")

    text = transcribe_audio(sys.argv[1])
    print(text, end="")


if __name__ == "__main__":
    main()
