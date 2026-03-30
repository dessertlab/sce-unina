import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import archiver from 'archiver';
import fetch from 'node-fetch';
import FormData from 'form-data';
import AdmZip from 'adm-zip';

let isConnected = false;

/* -------------------- Utils -------------------- */

async function chooseOrCreateWorkingDirectory(): Promise<string | undefined> {
  // 1. Choose parent folder
  const parentUri = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Seleziona la cartella padre"
  });

  if (!parentUri || parentUri.length === 0) {
    return undefined;
  }

  const parentPath = parentUri[0].fsPath;

  // 2. Ask new folder name
  const folderName = await vscode.window.showInputBox({
    prompt: "Nome della nuova cartella di lavoro",
    placeHolder: "es. Compito_Rossi_12345",
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value || !value.trim()) {
        return "Il nome della cartella non può essere vuoto.";
      }

      // Windows-invalid chars + a few universally problematic ones
      if (/[<>:"/\\|?*\x00-\x1F]/.test(value)) {
        return "Il nome contiene caratteri non validi.";
      }

      if (value === "." || value === "..") {
        return "Nome cartella non valido.";
      }

      return null;
    }
  });

  if (!folderName) {
    return undefined;
  }

  const workingDir = path.join(parentPath, folderName.trim());

  try {
    await fs.promises.mkdir(workingDir, { recursive: false });
  } catch (err: any) {
    if (err?.code === "EEXIST") {
      const choice = await vscode.window.showWarningMessage(
        `La cartella "${folderName}" esiste già. Vuoi usarla comunque?`,
        "Usa cartella esistente",
        "Annulla"
      );

      if (choice !== "Usa cartella esistente") {
        return undefined;
      }
    } else {
      throw err;
    }
  }

  return workingDir;
}

function getGlobalConfigPath(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'sce-unina', 'config.json');
  } else if (platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'sce-unina', 'config.json');
  } else {
    return path.join(process.env.HOME || '', '.config', 'sce-unina', 'config.json');
  }
}

export async function getServerUrl(): Promise<string> {
  const configPath = getGlobalConfigPath();
  try {
    const raw = await fs.promises.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.serverUrl) return parsed.serverUrl;
  } catch {}
  return 'http://127.0.0.1:5001';
}

export async function setServerUrl(newUrl: string): Promise<void> {
  const configPath = getGlobalConfigPath();
  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
  await fs.promises.writeFile(configPath, JSON.stringify({ serverUrl: newUrl }, null, 2));
}

function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  options.signal = controller.signal;
  return fetch(url, options).finally(() => clearTimeout(id));
}

function getFormDataLength(form: FormData): Promise<number> {
  return new Promise((resolve, reject) => {
    form.getLength((err, length) => {
      if (err) reject(err);
      else resolve(length);
    });
  });
}

function zipFolder(source: string, out: string, rootFolderName: string): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    // Put everything inside rootFolderName/
    archive.directory(source, rootFolderName)
      .on('error', reject)
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

async function extractZipToFolder(buffer: Buffer, destination: string): Promise<void> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const validEntries = entries.filter(e => {
    const name = e.entryName.replace(/\\/g, '/');
    return name && !name.startsWith('__MACOSX/') && name !== '__MACOSX';
  });

  if (validEntries.length === 0) {
    return;
  }

  const firstSegments = validEntries
    .map(e => e.entryName.replace(/\\/g, '/'))
    .map(name => name.split('/').filter(Boolean)[0])
    .filter(Boolean);

  const uniqueFirstSegments = [...new Set(firstSegments)];
  const commonRoot = uniqueFirstSegments.length === 1 ? uniqueFirstSegments[0] : null;

  for (const entry of validEntries) {
    if (entry.isDirectory) {
      continue;
    }

    const normalizedEntryName = entry.entryName.replace(/\\/g, '/');
    let relativePath = normalizedEntryName;

    // Se tutto lo zip è contenuto in una sola cartella radice, la rimuove
    if (commonRoot && relativePath.startsWith(commonRoot + '/')) {
      relativePath = relativePath.slice(commonRoot.length + 1);
    }

    relativePath = relativePath.replace(/^\/+/, '');

    if (!relativePath) {
      continue;
    }

    // Protezione zip-slip
    const targetPath = path.resolve(destination, relativePath);
    const destinationResolved = path.resolve(destination);

    if (
      targetPath !== destinationResolved &&
      !targetPath.startsWith(destinationResolved + path.sep)
    ) {
      throw new Error(`Percorso non valido nello ZIP: ${entry.entryName}`);
    }

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, entry.getData());
  }
}

/* -------------------- Tree Items -------------------- */

class ActionNode extends vscode.TreeItem {
  constructor(
    label: string,
    commandId?: string,
    tooltip?: string,
    iconId?: string,
    color?: vscode.ThemeColor
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);

    if (commandId) {
      this.command = {
        command: commandId,
        title: label,
        tooltip: tooltip
      };
    }

    this.tooltip = tooltip;

    if (iconId) {
      this.iconPath = color
        ? new vscode.ThemeIcon(iconId, color)
        : new vscode.ThemeIcon(iconId);
    }
  }
}


/* -------------------- Exams Provider -------------------- */

class ExamsProvider implements vscode.TreeDataProvider<ActionNode> {
  getTreeItem(e: ActionNode): vscode.TreeItem { return e; }

  getChildren(): ActionNode[] {
    return [
      new ActionNode("CONSEGNA compito", "sce-unina.uploadExam", "Invia compito", "cloud-upload"),
      new ActionNode("SCARICA file compito", "sce-unina.getExam", "Scarica compito", "cloud-download")
    ];
  }
}

/* -------------------- Connections Provider -------------------- */

async function checkServerConnection(): Promise<boolean> {
  try {
    const url = `${await getServerUrl()}/list_exams`;
    const res = await fetchWithTimeout(url, {}, 5000);
    return res.ok;
  } catch {
    return false;
  }
}



class ConnectionsProvider implements vscode.TreeDataProvider<ActionNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(e: ActionNode): vscode.TreeItem {
    return e;
  }

  async getChildren(): Promise<ActionNode[]> {
    const serverUrl = await getServerUrl();
    const isConnected = await checkServerConnection();

    return [
      new ActionNode(
        "Configura macchina docente",
        "sce-unina.configureServerHost",
        serverUrl,
        "settings-gear"
      ),

      new ActionNode(
        "Connetti alla macchina docente",
        "sce-unina.connectServer",
        "Test connessione al server",
        "plug"
      ),

      new ActionNode(
        isConnected ? "Stato: CONNESSO" : "Stato: NON CONNESSO",
        undefined,
        "Stato connessione",
        "circle-filled",
        new vscode.ThemeColor(isConnected ? "charts.green" : "charts.red")
      )
    ];
  }
}

class HelpNode extends vscode.TreeItem {
    constructor(label: string) {
      super(label, vscode.TreeItemCollapsibleState.None);
      this.iconPath = new vscode.ThemeIcon('info'); // optional
      this.command = undefined; // non-clickable
    }
  }


class HelpProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

  constructor(private context: vscode.ExtensionContext) {}

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    const version = this.context.extension.packageJSON.version;

    return [
      new HelpNode(`Version: ${version}`)
    ];
  }
}


/* -------------------- Upload Logic -------------------- */

async function uploadExamProject(folderPath: string, surname: string, name: string, studentID: string, teacher: string, progress?: vscode.Progress<{message?: string}>) {

  const zipFileName = `${surname}_${name}_${studentID}_${teacher}.zip`;
  const zipPath = path.join(folderPath, '..', zipFileName);

  const serverUrl = `${await getServerUrl()}/upload`;

  progress?.report({ message: "Creazione archivio ZIP..." });
  //await zipFolder(folderPath, zipPath);
  const baseName = path.basename(zipFileName, ".zip");

  await zipFolder(folderPath, zipPath, baseName);

  const form = new FormData();
  form.append('file', fs.createReadStream(zipPath), { filename: zipFileName });

  const headers = { ...form.getHeaders(), 'Content-Length': (await getFormDataLength(form)).toString() };

  try {
    const response = await fetchWithTimeout(serverUrl, { method: 'POST', headers, body: form }, 30000);
    if (!response.ok) throw new Error(await response.text());
  } finally {
    fs.unlink(zipPath, () => {});
  }
}

/* -------------------- Activate -------------------- */

export function activate(context: vscode.ExtensionContext) {

  const examsProvider = new ExamsProvider();
  const connectionsProvider = new ConnectionsProvider();
  const helpProvider = new HelpProvider(context);

  const examsView = vscode.window.createTreeView('sceUninaExamsView', { treeDataProvider: examsProvider });
  const connectionsView = vscode.window.createTreeView('sceUninaConnectionsView', { treeDataProvider: connectionsProvider });
  const sceUninaHelpView = vscode.window.createTreeView('sceUninaHelpView', { treeDataProvider: helpProvider });

  context.subscriptions.push(examsView, connectionsView, sceUninaHelpView);

  /* ---------- Upload Command ---------- */

  context.subscriptions.push(vscode.commands.registerCommand('sce-unina.uploadExam', async () => {

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return vscode.window.showErrorMessage("Aprire una cartella!");

    const folderPath = workspaceFolders[0].uri.fsPath;

    // Helper to validate input
    const notEmpty = (fieldName: string) => (value: string | undefined) => {
      if (!value || !value.trim()) {
        return `Il campo ${fieldName} non può essere vuoto!`;
      }
      return null; // valid
    };

    // Prompt user for all fields with validation
    const surname = await vscode.window.showInputBox({
      prompt: "Inserisci il tuo COGNOME",
      ignoreFocusOut: true,
      validateInput: notEmpty("COGNOME")
    });
    if (!surname) return; // user cancelled

    const name = await vscode.window.showInputBox({
      prompt: "Inserisci il tuo NOME",
      ignoreFocusOut: true,
      validateInput: notEmpty("NOME")
    });
    if (!name) return;

    const studentID = await vscode.window.showInputBox({
      prompt: "Inserisci la tua MATRICOLA",
      ignoreFocusOut: true,
      validateInput: notEmpty("MATRICOLA")
    });
    if (!studentID) return;

    const teacher = await vscode.window.showInputBox({
      prompt: "Inserisci il COGNOME del DOCENTE",
      ignoreFocusOut: true,
      validateInput: notEmpty("DOCENTE")
    });
    if (!teacher) return;

    const safe = (s: string) => s.trim().replace(/[^a-zA-Z0-9 _-]/g, '').toUpperCase();

    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Invio compito..." }, async progress => {
      try {
        await uploadExamProject(folderPath, safe(surname), safe(name), safe(studentID), safe(teacher), progress);
        vscode.window.showInformationMessage("Compito inviato correttamente!");
      } catch (e:any) {
        vscode.window.showErrorMessage("Errore invio: " + e.message);
      }
    });
  }));

  

  /* ---------- Download Command (with dropdown list) ---------- */

  context.subscriptions.push(vscode.commands.registerCommand('sce-unina.getExam', async () => {
  const baseUrl = await getServerUrl();

  try {
    // 1. Recupera lista file dal server
    const listResponse = await fetchWithTimeout(`${baseUrl}/list_exams`, {}, 5000);

    if (!listResponse.ok) {
      return vscode.window.showErrorMessage("Errore nel recupero lista file dal server.");
    }

    const files: string[] = await listResponse.json();

    if (!Array.isArray(files) || files.length === 0) {
      return vscode.window.showWarningMessage("Nessun file di esame disponibile.");
    }

    // 2. Selezione file
    const selectedFile = await vscode.window.showQuickPick(files, {
      placeHolder: "Seleziona il file di esame da scaricare"
    });

    if (!selectedFile) {
      return vscode.window.showInformationMessage("Download annullato.");
    }

    // 3. Selezione cartella padre (che sarà anche la working directory)
    const folderUri = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: "Seleziona la cartella di lavoro"
    });

    if (!folderUri || folderUri.length === 0) {
      return vscode.window.showInformationMessage("Operazione annullata.");
    }

    const workingDir = folderUri[0].fsPath;

    // 4. Download ed estrazione/salvataggio nella cartella scelta
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Scaricamento ${selectedFile}...`
      },
      async (progress) => {
        progress.report({ message: "Download in corso..." });

        const response = await fetchWithTimeout(
          `${baseUrl}/get_exam/${encodeURIComponent(selectedFile)}`,
          {},
          30000
        );

        if (!response.ok) {
          throw new Error("Errore durante il download del file.");
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = path.extname(selectedFile).toLowerCase();

        if (ext === ".zip") {
          progress.report({ message: "Estrazione archivio..." });
          await extractZipToFolder(buffer, workingDir);

          vscode.window.showInformationMessage(
            `Archivio estratto in: ${workingDir}`
          );
        } else {
          const savePath = path.join(workingDir, selectedFile);
          await fs.promises.writeFile(savePath, buffer);

          vscode.window.showInformationMessage(
            `File salvato in: ${savePath}`
          );
        }
      }
    );

    // 5. Porta il focus direttamente su questa cartella aprendola come workspace
    await vscode.commands.executeCommand(
      'vscode.openFolder',
      vscode.Uri.file(workingDir),
      false
    );

  } catch (err: any) {
    vscode.window.showErrorMessage("Errore: " + err.message);
  }
}));

  
  /* ---------- Configure Server ---------- */

  context.subscriptions.push(vscode.commands.registerCommand('sce-unina.configureServerHost', async () => {

    const currentUrl = await getServerUrl();

    const newUrl = await vscode.window.showInputBox({
      prompt: "URL macchina docente",
      value: currentUrl
    });

    if (!newUrl) return;

    await setServerUrl(newUrl);
    vscode.window.showInformationMessage(`Server impostato: ${newUrl}`);
    connectionsProvider.refresh();
  }));

  /* ---------- Connect Server ---------- */

  context.subscriptions.push(
  vscode.commands.registerCommand('sce-unina.connectServer', async () => {
    const url = await getServerUrl();

    try {
      const response = await fetchWithTimeout(`${url}/list_exams`, {}, 5000);

      if (!response.ok) throw new Error("Server not reachable");

      const files = await response.json();
      if (!Array.isArray(files)) throw new Error("Invalid response");

      isConnected = true;
      vscode.window.showInformationMessage("Connessione riuscita!");
    } catch (err) {
      isConnected = false;
      vscode.window.showErrorMessage("Connessione fallita!");
    }

    connectionsProvider.refresh();
  }));

}

export function deactivate() {}
