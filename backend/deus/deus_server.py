#!/usr/bin/env python3
"""Simple HTTP Server With Upload, Drag-n-Drop and Auto-Zip, now with Bootstrap styling, multiple files, progress bar, file list and delete support."""

__version__ = "0.6"
__all__ = ["SimpleHTTPRequestHandler"]
__author__ = "ldesi + chatgpt"

import os
import posixpath
import http.server
import urllib.request, urllib.parse, urllib.error
import html
import shutil
import mimetypes
import re
import time
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO

ALLOWED_EXTENSIONS = {".py", ".java", ".txt", ".md", ".c", ".cpp", ".m"}

class SimpleHTTPRequestHandler(http.server.BaseHTTPRequestHandler):
    server_version = "FancyHTTPWithUploadZip/" + __version__

    def do_GET(self):
        f = self.send_head()
        if f:
            self.copyfile(f, self.wfile)
            f.close()

    def do_HEAD(self):
        f = self.send_head()
        if f:
            f.close()

    def do_POST(self):
        r, info = self.deal_post_data()
        print((r, info, "by:", self.client_address))
        f = BytesIO()
        f.write(b'<!DOCTYPE html>')
        f.write(b"<html><head><link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'></head><body class='p-5'>")
        f.write(b"<div class='container'><h2>Upload Result</h2><hr>")
        f.write(b"<div class='alert alert-%s d-flex align-items-center' role='alert'><svg class='bi flex-shrink-0 me-2' width='24' height='24' role='img' aria-label='%s:'><use xlink:href='%s'/></svg> %s</div>" % 
                (b"success" if r else b"danger", b"Success" if r else b"Error", b"#check-circle-fill" if r else b"#exclamation-triangle-fill", info.encode()))
        f.write(b"<a href='/' class='btn btn-primary mt-3'>Return</a></div></body></html>")
        length = f.tell()
        f.seek(0)
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        self.copyfile(f, self.wfile)
        f.close()

    def deal_post_data(self):
        content_type = self.headers['content-type']
        if not content_type:
            return (False, "Missing Content-Type header")
        boundary = content_type.split("=")[1].encode()
        remainbytes = int(self.headers['content-length'])

        data = self.rfile.read(remainbytes)
        parts = data.split(b"--" + boundary)

        fields = {"nome": "", "cognome": "", "matricola": "", "docente": ""}
        files = []

        for part in parts:
            if b'Content-Disposition' in part:
                headers, _, content = part.partition(b"\r\n\r\n")
                content = content.rstrip(b"\r\n")
                disp = headers.decode(errors='ignore')
                name_match = re.search(r'name="([^"]+)"', disp)
                if not name_match:
                    continue
                name = name_match.group(1)
                if 'filename="' in disp:
                    filename_match = re.search(r'filename="([^"]+)"', disp)
                    if filename_match:
                        filename = filename_match.group(1)
                        ext = os.path.splitext(filename)[1].lower()
                        files.append((filename, content))
                elif name in fields:
                    fields[name] = content.decode(errors='ignore')

        if not all(fields.values()):
            return (False, "All fields must be filled")

        if not files:
            return (False, "No valid files uploaded")

        base_dir = os.getcwd()
        safe_prefix = f"{fields['cognome']}_{fields['nome']}_{fields['matricola']}_{fields['docente']}"
        ip = self.client_address[0].replace('.', '_')
        port = str(self.client_address[1])
        zip_filename = f"{safe_prefix}_{ip}_{port}.zip"
        zip_path = os.path.join(base_dir, zip_filename)

        project_dir = os.path.join(base_dir, f"{safe_prefix}_upload")
        os.makedirs(project_dir, exist_ok=True)

        for fname, content in files:
            uploaded_file_path = os.path.join(project_dir, fname)
            base, ext = os.path.splitext(fname)
            counter = 1
            while os.path.exists(uploaded_file_path):
                new_fname = f"{base}_{counter}{ext}"
                uploaded_file_path = os.path.join(project_dir, new_fname)
                counter += 1
            with open(uploaded_file_path, 'wb') as out_file:
                out_file.write(content)

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(project_dir):
                for file in files:
                    full_path = os.path.join(root, file)
                    arcname = os.path.relpath(full_path, project_dir)
                    zf.write(full_path, arcname)

        shutil.rmtree(project_dir)
        return (True, f"Project files zipped as {zip_filename}")

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return self.list_directory(path)
        ctype = self.guess_type(path)

        # Force Content-Type for SVG files so browsers render them correctly
        if path.endswith('.svg'):
            ctype = 'image/svg+xml'

        try:
            f = open(path, 'rb')
        except IOError:
            self.send_error(404, "File not found")
            return None
        self.send_response(200)
        self.send_header("Content-type", ctype)
        fs = os.fstat(f.fileno())
        self.send_header("Content-Length", str(fs[6]))
        self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
        self.end_headers()
        return f


    def list_directory(self, path):
        f = BytesIO()
        f.write(b'<!DOCTYPE html><html><head><title>Sistema di Consegna Esame UNINA (SCE-UNINA)</title>')
        f.write(b'<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">')
        f.write(b'<style>')
        f.write(b'.drop-zone{border:2px dashed #ccc;padding:20px;text-align:center;cursor:pointer;border-radius:8px;}')
        f.write(b'.drop-zone.dragover{background:#f8f9fa;}')
        f.write(b'.file-list{margin-top:10px;}')
        f.write(b'.file-item{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;}')
        f.write(b'.file-info{display:flex;align-items:center;gap:8px;}')
        f.write(b'.file-info img.icon-img{width:24px;height:24px;}')
        f.write(b'</style>')

        html_script = f"""
<script>
document.addEventListener("DOMContentLoaded", () => {{
    const dz = document.querySelector(".drop-zone"),
          input = document.querySelector("input[name=file]"),
          list = document.getElementById("file-list"),
          form = document.getElementById("upload-form"),
          progress = document.getElementById("progress");

    let selectedFiles = [];

    // Map file extensions to local SVG icon paths
    const iconMap = {{
      "java": "icons/java-original.svg",
      "py": "icons/python-original.svg",
      "c": "icons/c-original.svg",
      "cpp": "icons/cplusplus-original.svg",
      "m": "icons/matlab-original.svg"
    }};

    dz.addEventListener("click", () => input.click());
    dz.addEventListener("dragover", e => {{ e.preventDefault(); dz.classList.add("dragover"); }});
    dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
    dz.addEventListener("drop", e => {{
        e.preventDefault();
        dz.classList.remove("dragover");
        handleFiles(e.dataTransfer.files);
    }});

    input.addEventListener("change", () => handleFiles(input.files));

    function handleFiles(files) {{
        for (const file of files) {{
            selectedFiles.push(file);
        }}
        renderFileList();
    }}

    function renderFileList() {{
        list.innerHTML = '';
        selectedFiles.forEach((file, index) => {{
            const ext = file.name.split('.').pop().toLowerCase();
            const iconSrc = iconMap[ext] || "icons/question-mark.svg";
            const item = document.createElement("div");
            item.className = "file-item";
            item.innerHTML = `
                <div class="file-info">
                    <img src="${{iconSrc}}" alt="${{ext}}" class="icon-img" />
                    <span>${{file.name}}</span>
                </div>
                <button type="button" class="btn-close" aria-label="Remove"></button>
            `;
            item.querySelector(".btn-close").onclick = () => {{
                selectedFiles.splice(index, 1);
                renderFileList();
            }};
            list.appendChild(item);
        }});
    }}

    form.addEventListener("submit", e => {{
        e.preventDefault();
        const fields = form.querySelectorAll("input[type=text]");
        for (const field of fields) {{
            if (!field.value) {{
                alert("Fill all fields");
                return;
            }}
        }}
        if (!selectedFiles.length) {{
            alert("Attach at least one file");
            return;
        }}

        const formData = new FormData();
        fields.forEach(field => formData.append(field.name, field.value));
        selectedFiles.forEach(file => formData.append("file", file));

        progress.classList.remove("d-none");

        fetch("/", {{
            method: "POST",
            body: formData
        }})
        .then(response => response.text())
        .then(html => document.body.innerHTML = html)
        .catch(err => {{
            alert("Upload failed: " + err);
            progress.classList.add("d-none");
        }});
    }});
}});
</script>
"""
        f.write(html_script.encode())
        f.write(b'</head>')
        f.write(b'<body class="container py-5"><h2 class="mb-4">Sistema di Consegna Esame UNINA (SCE-UNINA)</h2>')
        f.write(b'<form enctype="multipart/form-data" method="post" id="upload-form">')
        f.write(b'<div class="row g-4">')
        
        f.write(b'<div class="col-md-6">')
        f.write(b'<div class="mb-3"><label class="form-label">Nome</label><input name="nome" class="form-control" type="text" required></div>')
        f.write(b'<div class="mb-3"><label class="form-label">Cognome</label><input name="cognome" class="form-control" type="text" required></div>')
        f.write(b'<div class="mb-3"><label class="form-label">Matricola</label><input name="matricola" class="form-control" type="text" required></div>')
        f.write(b'<div class="mb-3"><label class="form-label">Docente</label><input name="docente" class="form-control" type="text" required></div>')
        f.write(b'</div>')

        # Drop zone area
        f.write(b'<div class="col-md-6">')
        f.write(b'<label class="form-label">Upload Files</label>')
        f.write(b'<div class="drop-zone mb-2">Drag & Drop i file qui oppure clicca per selezionarli<input style="display:none" class="form-control" name="file" type="file" multiple></div>')
        f.write(b'<div id="file-list" class="file-list mb-3"></div>')
        f.write(b'<div class="progress mb-3 d-none" id="progress"><div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%"></div></div>')
        f.write(b'<div><button type="submit" class="btn btn-success btn-lg w-100">Upload</button></div>')


        f.write(b'</div>')
        f.write(b'</div>')  # end row

        f.write(b'</form></body></html>')
        
        length = f.tell()
        f.seek(0)
        self.send_response(200)
        self.send_header("Content-type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        return f

    def translate_path(self, path):
        # Serve files relative to current directory
        path = path.split('?',1)[0]
        path = path.split('#',1)[0]
        trailing_slash = path.rstrip().endswith('/')
        path = posixpath.normpath(urllib.parse.unquote(path))
        words = path.strip('/').split('/')
        path = os.getcwd()
        for word in words:
            if os.path.dirname(word) or word in (os.curdir, os.pardir):
                # suspicious path element
                continue
            path = os.path.join(path, word)
        if trailing_slash:
            path += '/'
        return path

    def copyfile(self, source, outputfile):
        shutil.copyfileobj(source, outputfile)

    def guess_type(self, path):
        base, ext = posixpath.splitext(path)
        if ext in ALLOWED_EXTENSIONS:
            return mimetypes.types_map.get(ext, "application/octet-stream")
        else:
            return "application/octet-stream"

def run(server_class=ThreadingHTTPServer, handler_class=SimpleHTTPRequestHandler, addr="0.0.0.0", port=8000):
    server_address = (addr, port)
    httpd = server_class(server_address, handler_class)
    print(f"Serving HTTP on {addr} port {port} (http://{addr}:{port}/) ...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == "__main__":
    run()
