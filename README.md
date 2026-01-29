# SCE-UNINA (Sistema Consegna Esami)

📘 Sistema Consegna Esami (SCE) is an extension for VS Code / VSCodium to simplify handling exam projects for computer science courses at DIETI, **Università degli Studi di Napoli Federico II**.

---

## ✨ Features

* ✅ **Upload your exam project files** as a `.zip` file to the university server
* ✅ **Download the exam project files** directly into student's workspace
* ✅ **Manage backend server host** from the sidebar or Command Palette

---

## 🚀 Getting Started

### 1. Install the Extension

If you're using VS Code:

```bash
code --install-extension sce-unina-0.0.x.vsix
```

For **VSCodium**, use:

```bash
codium --install-extension sce-unina-0.0.x.vsix
```

> Replace `0.0.x` with your actual version number.

---

The extension can be also installed by searching it from the list of public extensions.

### 2. Using the Extension

#### Run the backend Server

Open a terminal/prompt, go to ``backend`` folder and run the server (``sce_unina_server.py``):

```
$ cd sce-unina/backend
$ python sce_unina_server.py
```

By default, ``sce_unina_server``is listening on ``0.0.0.0:5001`` and all the exam files should be put under ``backend/download`` dir. 
Each file under the ``download`` directory can be downloaded by the student. So, you can organize the ``download`` dir with the exam files like in the following:

```
teacher1.zip
teacher2.zip
...
```

You can change the default server host and port as follows:

```
python sce_unina_server.py --host 192.168.3.51 --port 8080
```

#### Run the VSCodium extension

* Tab **ESAME**:

  * 📤 **CONSEGNA compito**, to upload your exam project. Fill up the info when requested.
  * 📥 **SCARICA file compito**, to download the exam files into the working directory.

* Tab **CONNESSIONE**:

  * **Configura macchina docente** allows students to configure the backend IP address, e.g.:

   ```
   http://127.0.0.1:5001
   ```
  * **Connetti alla macchina docente** allows students to connect with the backend

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

### Publish

Use ``ovsx publish`` for VSCodium or ``vsce publish`` for VSCode.

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

