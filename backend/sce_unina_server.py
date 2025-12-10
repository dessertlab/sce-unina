#! /usr/bin/env python3

from flask import Flask, request, send_file, abort
import difflib
import re
import os
import argparse

app = Flask(__name__)

# Allowed file extensions for download
ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx', '.rtf', '.zip'}
FILE_PATH = ''  # Will be set from argument

UPLOAD_FOLDER = 'uploads'
# Optional: configure known channels via environment variable, comma-separated
# Example: export CHANNELS="A,B,C"
CHANNELS = [c.strip() for c in os.environ.get('CHANNELS', '').split(',') if c.strip()]

"""
@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return "No file part in the request", 400

    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    filename = file.filename
    file.save(filename)

    return f'Upload received and saved as {filename}', 200
"""

@app.route('/upload', methods=['POST'])
def upload():
    """
    Handle a multipart POST upload (form field 'file') and route the file into a channel subfolder.

    Behavior:

    - Accepts only files with a .zip extension (returns 415 otherwise).
    - Expects filename format: SURNAME_NAME_STUDENTID_CHANNEL.zip (parser is resilient to extra underscores).
    - Extracts and sanitizes the CHANNEL token (keeps letters, digits, underscores, dashes).
    - If environment variable CHANNELS is set (comma-separated known channels), attempts a case-insensitive or fuzzy match to map typos to a known channel.
    - Creates uploads/<channel>/ if needed and saves the uploaded file there.
    - Returns 200 with an informative message on success, or appropriate 4xx on error.
    
    Security:

    Uses os.path.basename and token sanitization to prevent path traversal.
    Fuzzy mapping with difflib (threshold 0.7) only applies when CHANNELS is configured to avoid unexpected remapping.
    """
    if 'file' not in request.files:
        return "No file part in the request", 400

    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    if not file.filename.endswith('.zip'):
        return "Only .zip files are allowed", 415

    # normalize filename and avoid path traversal
    filename = os.path.basename(file.filename)

    # Attempt to parse channel from filename with expected format:
    # SURNAME_NAME_STUDENTID_CHANNEL.zip
    name_no_ext = os.path.splitext(filename)[0]
    # Try splitting from the right to be resilient to extra underscores in names
    parts = name_no_ext.rsplit('_', 2)
    if len(parts) == 3:
        # head, studentid, channel
        _, studentid, channel_raw = parts
    else:
        # fallback: take last segment as channel
        channel_raw = parts[-1]

    # sanitize channel token
    channel_candidate = re.sub(r'[^A-Za-z0-9_-]', '', channel_raw).strip()
    if not channel_candidate:
        channel_candidate = 'unknown'

    # If CHANNELS configured, try fuzzy match to known channels (case-insensitive)
    mapped_channel = channel_candidate
    note = ''
    if CHANNELS:
        # build case-insensitive mapping
        ci_map = {c.lower(): c for c in CHANNELS}
        lower_candidate = channel_candidate.lower()
        if lower_candidate in ci_map:
            mapped_channel = ci_map[lower_candidate]
            note = f"mapped to known channel '{mapped_channel}'"
        else:
            # use difflib to find close match
            matches = difflib.get_close_matches(channel_candidate, CHANNELS, n=1, cutoff=0.85)
            if matches:
                mapped_channel = matches[0]
                note = f"fuzzy-mapped '{channel_candidate}' -> '{mapped_channel}'"
            else:
                # no good match; use sanitized candidate but mark note
                mapped_channel = channel_candidate
                note = f"no close match for '{channel_candidate}'; created new channel"
    else:
        note = f"no CHANNELS configured; using '{mapped_channel}'"

    # create channel subfolder and save file
    channel_dir = os.path.join(UPLOAD_FOLDER, mapped_channel)
    os.makedirs(channel_dir, exist_ok=True)
    file_path = os.path.join(channel_dir, filename)
    file.save(file_path)

    return f"Upload received and saved as {filename} in channel '{mapped_channel}'. {note}", 200

@app.route('/get_exam', methods=['GET'])
def get_exam():
    if not os.path.exists(FILE_PATH):
        abort(404, description="Exam file not found.")

    _, ext = os.path.splitext(FILE_PATH)
    ext = ext.lower()

    if ext not in ALLOWED_EXTENSIONS:
        abort(415, description=f"Unsupported file format: {ext}")

    # Guess MIME type based on extension
    mimetypes = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.rtf': 'application/rtf',
        '.zip': 'application/zip'
    }

    return send_file(
        FILE_PATH,
        mimetype=mimetypes.get(ext, 'application/octet-stream'),
        as_attachment=True,
        download_name=os.path.basename(FILE_PATH)
    )

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='SCE-Unina Flask Server')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host IP address')
    parser.add_argument('--port', type=int, default=5001, help='Port number')
    parser.add_argument('--file', type=str, default='traccia.pdf', help='Path to exam file')
    parser.add_argument('--upload-folder', type=str, default='uploads', help='Folder to store uploaded files')

    args = parser.parse_args()
    FILE_PATH = args.file
    UPLOAD_FOLDER = args.upload_folder
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Ensure uploads dir exists

    app.run(host=args.host, port=args.port, threaded=True, debug=True)

