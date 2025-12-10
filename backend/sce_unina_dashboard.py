from flask import Flask, render_template_string, send_file, request, abort, send_from_directory
import os
import datetime
import argparse

app = Flask(__name__)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/uploads/<filename>')
def download_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename, as_attachment=True)


@app.route('/dashboard')
def dashboard():
    # Sorting parameters
    sort_by = request.args.get('sort', 'timestamp')
    order = request.args.get('order', 'desc')

    files = [
        f for f in os.listdir(UPLOAD_FOLDER)
        if f.endswith('.zip') and os.path.isfile(os.path.join(UPLOAD_FOLDER, f))
    ]

    records = []
    for filename in files:
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        stat = os.stat(file_path)
        timestamp = datetime.datetime.fromtimestamp(stat.st_mtime)

        base = filename[:-4]
        parts = base.split('_')
        if len(parts) < 4:
            continue

        surname = parts[0]
        name = parts[1]
        student_id = parts[2]
        teacher = '_'.join(parts[3:])

        records.append({
            'timestamp': timestamp,
            'surname': surname,
            'name': name,
            'student_id': student_id,
            'teacher': teacher,
            'filename': filename
        })

    # Sort
    reverse = (order == 'desc')
    try:
        records.sort(key=lambda x: x[sort_by].lower() if isinstance(x[sort_by], str) else x[sort_by], reverse=reverse)
    except KeyError:
        pass  # fallback to default if sort_by invalid

    def sort_url(field):
        new_order = 'asc' if (sort_by != field or order == 'desc') else 'desc'
        return f"/dashboard?sort={field}&order={new_order}"

    html = """
    <!DOCTYPE html>
    <html>
    <head>
      <title>SCE-UNINA Dashboard</title>
      <meta http-equiv="refresh" content="5">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        th a {
          color: inherit;
          text-decoration: none;
        }
        th a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body class="bg-light">
      <div class="container mt-5">
        <h1 class="mb-4">Uploaded Exam Projects</h1>
        {% if records %}
        <table class="table table-striped table-bordered align-middle">
          <thead class="table-dark">
            <tr>
              <th><a href="{{ sort_url('timestamp') }}">Timestamp{% if sort_by == 'timestamp' %} {{ '↑' if order == 'asc' else '↓' }}{% endif %}</a></th>
              <th><a href="{{ sort_url('surname') }}">Surname{% if sort_by == 'surname' %} {{ '↑' if order == 'asc' else '↓' }}{% endif %}</a></th>
              <th><a href="{{ sort_url('name') }}">Name{% if sort_by == 'name' %} {{ '↑' if order == 'asc' else '↓' }}{% endif %}</a></th>
              <th><a href="{{ sort_url('student_id') }}">Student ID{% if sort_by == 'student_id' %} {{ '↑' if order == 'asc' else '↓' }}{% endif %}</a></th>
              <th><a href="{{ sort_url('teacher') }}">Teacher{% if sort_by == 'teacher' %} {{ '↑' if order == 'asc' else '↓' }}{% endif %}</a></th>
              <th>Download</th>
            </tr>
          </thead>
          <tbody>
            {% for r in records %}
            <tr>
              <td>{{ r.timestamp.strftime('%Y-%m-%d %H:%M:%S') }}</td>
              <td>{{ r.surname }}</td>
              <td>{{ r.name }}</td>
              <td>{{ r.student_id }}</td>
              <td>{{ r.teacher }}</td>
              <td><a href="/uploads/{{ r.filename }}" class="btn btn-sm btn-primary" download>Download</a></td>
            </tr>
            {% endfor %}
          </tbody>
        </table>
        {% else %}
          <p class="text-muted">No ZIP files uploaded yet.</p>
        {% endif %}
      </div>
    </body>
    </html>
    """

    return render_template_string(html, records=records, sort_by=sort_by, order=order, sort_url=sort_url)

if __name__ == '__main__':

    parser = argparse.ArgumentParser(description='SCE-Unina Dashboard Server')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host IP address')
    parser.add_argument('--port', type=int, default=5002, help='Port number')

    args = parser.parse_args()

    app.run(host=args.host, port=args.port, threaded=True, debug=True)
