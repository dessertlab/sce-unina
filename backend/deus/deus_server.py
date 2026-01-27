import os
import zipfile
import tempfile
from flask import Flask, render_template, request, redirect, flash, session, send_from_directory, abort
from werkzeug.utils import secure_filename

ALLOWED_EXTENSIONS = {".py", ".java", ".c", ".cpp", ".m", ".h", ".makefile"}

app = Flask(__name__)
app.secret_key = "sce-unina-secret-key"

DOWNLOAD_DIR = os.path.join(os.getcwd(), "download")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

def allowed_file(filename):
    return os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS

def sanitize_field(value: str) -> str:
    return value.strip().replace(" ", "_")

@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        nome = sanitize_field(request.form.get("nome", ""))
        cognome = sanitize_field(request.form.get("cognome", ""))
        matricola = request.form.get("matricola", "").strip()
        docente = sanitize_field(request.form.get("docente", ""))

        files = request.files.getlist("files")

        if not all([nome, cognome, matricola, docente]):
            flash("Compilare tutti i campi", "danger")
            return redirect("/")

        if not files or files[0].filename == "":
            flash("Caricare almeno un file sorgente", "danger")
            return redirect("/")

        zip_name = f"{nome}_{cognome}_{matricola}_{docente}.zip"

        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, zip_name)

            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
                for file in files:
                    if file.filename in "Makefile" or allowed_file(file.filename):
                        filename = secure_filename(file.filename)
                        file_path = os.path.join(tmpdir, filename)
                        file.save(file_path)
                        zipf.write(file_path, arcname=filename)
                    else:
                        flash(f"Estensione non supportata: {file.filename}", "warning")

            os.makedirs("uploads", exist_ok=True)
            os.replace(zip_path, os.path.join("uploads", zip_name))

        session["submitted"] = True
        session["uploaded_files"] = [f.filename for f in files if f.filename]

        flash("Consegna effettuata con successo!", "success")
        return redirect("/")

    #return render_template("index.html")
    return render_template(
    	"index.html",
    	submitted=session.get("submitted", False),
    	uploaded_files=session.get("uploaded_files", [])
    )

@app.route("/download/<path:filename>")
def download_file(filename):

    file_path = os.path.join(DOWNLOAD_DIR, filename)

    if not os.path.isfile(file_path):
        abort(404)

    return send_from_directory(
        DOWNLOAD_DIR,
        filename,
        as_attachment=True
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5000)
    args = parser.parse_args()

    app.run(host="0.0.0.0", port=args.port, threaded=True)

