# SCE-UNINA (Sistema Consegna Esami)

📘 Sistema Consegna Esami (SCE) is an extension for VS Code / VSCodium to simplify handling exam projects for computer science courses at DIETI, **Università degli Studi di Napoli Federico II**.

---

## ✨ Features

* ✅ **Upload your exam project** as a `.zip` file to the university server
* ✅ **Download the exam paper PDF** directly into your workspace
* ✅ **Configure backend server host** from the sidebar or Command Palette
* ✅ Sidebar view with tree-style command access

---

## 🚀 Getting Started

### 1. Install the Extension

If you're using VS Code:

```bash
vsce package          # Generate .vsix bundle
code --install-extension sce-unina-0.0.x.vsix
```

For **VSCodium**, use:

```bash
codium --install-extension sce-unina-0.0.x.vsix
```

> Replace `0.0.x` with your actual version number.

---

### 2. Using the Extension

#### Run the backend Server

Open a terminal/prompt, go to ``backend`` folder and run the server (``sce_unina_server.py``):

```
$ python sce_unina_server.py
```

By default, ``sce_unina_server`` listening on ``0.0.0.0:5001`` and file name for exam paper is ``traccia.pdf``. Change the server host, port, and file name for exam paper if needed. For example, for server URL ``192.168.3.51:8080`` and file name ``sample_exam.docx``, use the following:

```
python sce_unina_server.py --host 192.168.3.51 --port 8080 --file sample_exam.docx
```

Please, be sure to put the exam trace file within the backend folder.

#### Run the VSCodium extension

* Open VSCodium and create a new project for the exam
* Open the **SCE-UNINA** view from the Activity Bar
* Click on:

  * 📤 **Upload Exam Project**, to upload you exam project. Fill up info when requested.
  * 📥 **Download Exam Paper PDF**, to download the exam paper locally.

* Or use the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and search for:

  * `SCE-UNINA: Upload Exam Project`
  * `SCE-UNINA: Download Exam Paper PDF`


---

## ⚙️ Configuration

To set or change the server URL:

1. Open Command Palette and run:

   ```
   SCE-UNINA: Configure server host
   ```

2. Enter the server address, e.g.:

   ```
   http://127.0.0.1:5001
   ```

You can also set this manually in `sce-unina-config.json`:

```json
{
  "serverUrl": "http://your-server-address:port"
}
```

---

## 💻 Development

### Prerequisites

* [Node.js](https://nodejs.org/) (v18+ recommended)
* [VS Code](https://code.visualstudio.com/) or [VSCodium](https://vscodium.com/)
* `vsce` for bundling:

```bash
npm install -g @vscode/vsce
```

### Build & Run

```bash
npm install
npm run compile
code .
```

Use `F5` to open a new Extension Development Host.

### Package

```bash
vsce package
```

This generates a `.vsix` file for distribution.

---

## 🥪 Testing

To run the tests:

```bash
npm run test
```

---

## 📄 License

MIT License

---

## 🧠 Credits

Luigi De Simone, Assistant Professor @DIETI, **Università degli Studi di Napoli Federico II**.

