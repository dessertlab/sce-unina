from flask import Flask, request, send_file, abort
import os
import argparse

app = Flask(__name__)

# Allowed file extensions for download
ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx', '.rtf', '.zip'}
FILE_PATH = ''  # Will be set from argument

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Ensure uploads dir exists

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
    if 'file' not in request.files:
        return "No file part in the request", 400

    file = request.files['file']
    if file.filename == '':
        return "No selected file", 400

    if not file.filename.endswith('.zip'):
        return "Only .zip files are allowed", 415

    filename = file.filename
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)

    return f'Upload received and saved as {filename}', 200

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

    args = parser.parse_args()
    FILE_PATH = args.file

    app.run(host=args.host, port=args.port, threaded=True, debug=True)

