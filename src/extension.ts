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

async function extractZipDirectly(buffer: Buffer, destination: string) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  // Determine the top-level folder name (skip __MACOSX)
  const topLevelFolders = entries
    .map(e => e.entryName.split(/\/|\\/)[0])
    .filter(name => name && name !== '__MACOSX');

  // Pick the most common top-level folder
  const topFolder = topLevelFolders[0]; // assume first one

  for (const entry of entries) {
    if (entry.isDirectory) continue; // skip directories
    if (entry.entryName.startsWith('__MACOSX')) continue; // skip macOS metadata

    // Remove the top-level folder
    const relativePath = entry.entryName.startsWith(topFolder + '/')
      ? entry.entryName.substring(topFolder.length + 1)
      : entry.entryName;

    if (!relativePath) continue; // skip empty names

    const targetPath = path.join(destination, relativePath);

    // Ensure parent dir exists
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

    // Write the file
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
      prompt: "COGNOME",
      ignoreFocusOut: true,
      validateInput: notEmpty("COGNOME")
    });
    if (!surname) return; // user cancelled

    const name = await vscode.window.showInputBox({
      prompt: "NOME",
      ignoreFocusOut: true,
      validateInput: notEmpty("NOME")
    });
    if (!name) return;

    const studentID = await vscode.window.showInputBox({
      prompt: "MATRICOLA",
      ignoreFocusOut: true,
      validateInput: notEmpty("MATRICOLA")
    });
    if (!studentID) return;

    const teacher = await vscode.window.showInputBox({
      prompt: "DOCENTE",
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
      // 1. Ask server for available exams
      const listResponse = await fetchWithTimeout(`${baseUrl}/list_exams`, {}, 5000);

      if (!listResponse.ok) {
        return vscode.window.showErrorMessage("Errore nel recupero lista file dal server.");
      }

      const files: string[] = await listResponse.json();

      if (!files || files.length === 0) {
        return vscode.window.showWarningMessage("Nessun file di esame disponibile.");
      }

      // 2. Show dropdown
      const selectedFile = await vscode.window.showQuickPick(files, {
        placeHolder: "Seleziona il file di esame da scaricare"
      });

      if (!selectedFile) {
        return vscode.window.showInformationMessage("Download annullato.");
      }

      // 3. Choose destination folder
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Seleziona cartella di destinazione"
      });

      if (!folderUri) return;

      const saveFolder = folderUri[0].fsPath;
      const savePath = path.join(saveFolder, selectedFile);

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Scaricamento ${selectedFile}...` },
        async () => {

          const response = await fetchWithTimeout(
            `${baseUrl}/get_exam/${encodeURIComponent(selectedFile)}`,
            {},
            30000
          );

          if (!response.ok) {
            return vscode.window.showErrorMessage("Errore durante il download del file.");
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          const ext = path.extname(selectedFile).toLowerCase();

          if (ext === ".zip") {
            //const zip = new AdmZip(buffer);
            await extractZipDirectly(buffer, saveFolder);
            //zip.extractAllTo(saveFolder, true);

            vscode.window.showInformationMessage(`Archivio estratto in ${saveFolder}`);
          } else {
            await fs.promises.writeFile(savePath, buffer);
            vscode.window.showInformationMessage(`File salvato in ${savePath}`);
          }
        }
      );

      await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(saveFolder),
        false   // false = open in same window, true = new window
      );

      

    } catch (err: any) {
      vscode.window.showErrorMessage("Errore di connessione al server: " + err.message);
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
