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

function getExtensionVersion(context: vscode.ExtensionContext): string {
  return context.extension.packageJSON.version;
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

function zipFolder(source: string, out: string): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive.directory(source, false).on('error', reject).pipe(stream);
    stream.on('close', () => resolve());
    archive.finalize();
  });
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
    const url = `${await getServerUrl()}/get_exam`;
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
  await zipFolder(folderPath, zipPath);

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

    const surname = await vscode.window.showInputBox({ prompt: "COGNOME" });
    const name = await vscode.window.showInputBox({ prompt: "NOME" });
    const studentID = await vscode.window.showInputBox({ prompt: "MATRICOLA" });
    const teacher = await vscode.window.showInputBox({ prompt: "DOCENTE" });

    if (!surname || !name || !studentID || !teacher) return;

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

  /* ---------- Download Command ---------- */

  context.subscriptions.push(vscode.commands.registerCommand('sce-unina.getExam', async () => {

    const serverUrl = `${await getServerUrl()}/get_exam`;

    const folderUri = await vscode.window.showOpenDialog({ canSelectFolders: true });
    if (!folderUri) return;

    const saveFolder = folderUri[0].fsPath;

    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Download..." }, async progress => {

      const response = await fetchWithTimeout(serverUrl, {}, 30000);
      if (!response.ok) return vscode.window.showErrorMessage("Errore server");

      const buffer = Buffer.from(await response.arrayBuffer());

      let filename = "exam_download.pdf";
      const cd = response.headers.get('content-disposition');
      if (cd) {
        const match = /filename="?([^"]+)"?/.exec(cd);
        if (match) filename = match[1];
      }

      const savePath = path.join(saveFolder, filename);
      const ext = path.extname(filename).toLowerCase();

      if (ext === '.zip') {
        const zip = new AdmZip(buffer);
        zip.extractAllTo(saveFolder, true);
      } else {
        await fs.promises.writeFile(savePath, buffer);
      }

      vscode.window.showInformationMessage("File scaricati!");
    });
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

  context.subscriptions.push(vscode.commands.registerCommand('sce-unina.connectServer', async () => {
    const url = await getServerUrl();

    try {
      const response = await fetchWithTimeout(`${url}/get_exam`, {}, 5000);
      if (!response.ok) throw new Error();
      isConnected = true;
      vscode.window.showInformationMessage("Connessione riuscita!");
    } catch {
      isConnected = false;
      vscode.window.showErrorMessage("Connessione fallita!");
    }

    connectionsProvider.refresh();
  }));
}

export function deactivate() {}
