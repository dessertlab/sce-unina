import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import archiver from 'archiver';
import fetch from 'node-fetch';
import FormData from 'form-data';

function getFormDataLength(form: FormData): Promise<number> {
  return new Promise((resolve, reject) => {
    form.getLength((err, length) => {
      if (err) reject(err);
      else resolve(length);
    });
  });
}

function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  options.signal = controller.signal;

  return fetch(url, options).finally(() => clearTimeout(id));
}

/*
function getServerUrl(): string {
  const config = vscode.workspace.getConfiguration();
  return config.get<string>('sce-unina.serverUrl') || 'http://127.0.0.1:5001';
}
*/

function getConfigFilePath(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'sce-unina-config.json');
  } else {
    return path.join(os.homedir(), '.sce-unina-config.json'); // fallback to user home
  }
}

/*
export async function getServerUrl(): Promise<string> {
  const configPath = getConfigFilePath();

  try {
    const raw = await fs.promises.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.serverUrl) {
      return parsed.serverUrl;
    }
  } catch {
    // file doesn’t exist or parse error → fallback
  }

  // fallback default
  return 'http://127.0.0.1:5001';
}
*/

export async function getServerUrl(): Promise<string> {
  const configPath = getGlobalConfigPath();

  try {
    const raw = await fs.promises.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.serverUrl === 'string') {
      return parsed.serverUrl;
    }
  } catch {
    // file missing or corrupt → use default
  }

  return 'http://127.0.0.1:5001'; // default fallback
}

/*
async function setServerUrl(newUrl: string) {
  const config = vscode.workspace.getConfiguration();
  // Update workspace setting if a workspace is open, else user setting
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    await config.update('sce-unina.serverUrl', newUrl, vscode.ConfigurationTarget.Workspace);
  } else {
    await config.update('sce-unina.serverUrl', newUrl, vscode.ConfigurationTarget.Global);
  }
}
*/

function getGlobalConfigPath(): string {
  const baseDir = (() => {
    const platform = process.platform;
    if (platform === 'win32') {
      return path.join(process.env.APPDATA || '', 'sce-unina');
    } else if (platform === 'darwin') {
      return path.join(process.env.HOME || '', 'Library', 'Application Support', 'sce-unina');
    } else {
      return path.join(process.env.HOME || '', '.config', 'sce-unina');
    }
  })();

  return path.join(baseDir, 'config.json');
}
/*
export async function setServerUrl(newUrl: string) {
  const configPath = getConfigFilePath();

  const config = {
    serverUrl: newUrl
  };

  const configDir = path.dirname(configPath);
  await fs.promises.mkdir(configDir, { recursive: true });
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
*/

export async function setServerUrl(newUrl: string): Promise<void> {
  const configPath = getGlobalConfigPath();
  const configDir = path.dirname(configPath);

  await fs.promises.mkdir(configDir, { recursive: true });

  const config = { serverUrl: newUrl };

  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}

class UploadNode extends vscode.TreeItem {
  constructor(label: string, commandId: string, tooltip: string, iconId: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: commandId,
      title: label,
      tooltip: tooltip
    };
    this.contextValue = commandId;
    this.iconPath = new vscode.ThemeIcon(iconId); // Use ThemeIcon
  }
}


class UploadProvider implements vscode.TreeDataProvider<UploadNode> {

  private _onDidChangeTreeData: vscode.EventEmitter<UploadNode | undefined | null | void> = new vscode.EventEmitter<UploadNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<UploadNode | undefined | null | void> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: UploadNode): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<UploadNode[]> {
    return [
      new UploadNode(
        "Upload Exam Project",
        "sce-unina.uploadExam",
        "Click to upload your exam project",
        "cloud-upload"
      ),
      new UploadNode(
        "Download Exam Files",
        "sce-unina.getExam",
        "Click to download your exam files",
        "cloud-download"
      ),
      new UploadNode(
        "Configure Server Host",
        "sce-unina.configureServerHost",
        `Current server: ${await getServerUrl()}`,
        "settings-gear"
      )
    ];
  }

}

/* add for testing */ 

export async function uploadExamProject(
  folderPath: string,
  surname: string,
  name: string,
  studentID: string,
  teacher: string,
  progress?: vscode.Progress<{ message?: string }>
): Promise<void> {

  /*
  const safe = (str: string) =>
    str.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

  const safeSurname = safe(surname).toUpperCase();
  const safeName = safe(name).toUpperCase();
  const safeStudentID = safe(studentID).toUpperCase();
  const safeTeacher = safe(teacher).toUpperCase();
  */

  const zipFileName = `${surname}_${name}_${studentID}_${teacher}.zip`;
  const zipPath = path.join(folderPath, '..', zipFileName);

  const serverUrl = `${await getServerUrl()}/upload`;

  if (progress) progress.report({ message: "Creating ZIP archive..." });
  await zipFolder(folderPath, zipPath);

  if (progress) progress.report({ message: "Sending project to server..." });

  const form = new FormData();
  form.append('file', fs.createReadStream(zipPath), {
    filename: zipFileName,
    contentType: 'application/zip'
  });

  const length = await getFormDataLength(form);

  const headers = {
    ...form.getHeaders(),
    'Content-Length': length.toString()
  };

  try {
    const response = await fetchWithTimeout(serverUrl, {
      method: 'POST',
      headers,
      body: form
    }, 30000);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error ${response.status}: ${text}`);
    }
  } finally {
    fs.unlink(zipPath, () => { });
  }
}



export function activate(context: vscode.ExtensionContext) {

  // Register the TreeDataProvider for the sidebar view
  const uploadProvider = new UploadProvider();
  vscode.window.registerTreeDataProvider('sceUninaView', uploadProvider);

  // Register the upload command
  const uploadExamDisposable = vscode.commands.registerCommand('sce-unina.uploadExam', async (uri?: vscode.Uri) => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder is open!");
      return;
    }

    const folderPath = uri?.fsPath || workspaceFolders[0].uri.fsPath;

    // Prompt user for info
    const surname = await vscode.window.showInputBox({
      prompt: "Enter your surname",
      ignoreFocusOut: true,
      validateInput: text => text.trim() === '' ? 'Surname cannot be empty' : null
    });
    if (!surname) {
      vscode.window.showWarningMessage("Upload canceled. Surname not provided.");
      return;
    }

    const name = await vscode.window.showInputBox({
      prompt: "Enter your name",
      ignoreFocusOut: true,
      validateInput: text => text.trim() === '' ? 'Name cannot be empty' : null
    });
    if (!name) {
      vscode.window.showWarningMessage("Upload canceled. Name not provided.");
      return;
    }

    const studentID = await vscode.window.showInputBox({
      prompt: "Enter your student ID",
      ignoreFocusOut: true,
      validateInput: text => text.trim() === '' ? 'Student ID cannot be empty' : null
    });
    if (!studentID) {
      vscode.window.showWarningMessage("Upload canceled. Student ID not provided.");
      return;
    }

    const teacher = await vscode.window.showInputBox({
      prompt: "Enter your teacher",
      ignoreFocusOut: true,
      validateInput: text => text.trim() === '' ? 'Teacher cannot be empty' : null
    });
    if (!teacher) {
      vscode.window.showWarningMessage("Upload canceled. Teacher not provided.");
      return;
    }

    const safe = (str: string) => str.trim().replace(/[^a-zA-Z0-9 _-]/g, '');

    const safeSurname = safe(surname).toUpperCase();
    const safeName = safe(name).toUpperCase();
    const safeStudentID = safe(studentID).toUpperCase();
    const safeTeacher = safe(teacher).toUpperCase();

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Uploading exam project to ${await getServerUrl()}...`,
      cancellable: false
    }, async (progress) => {
      try {
        await uploadExamProject(folderPath, safeSurname, safeName, safeStudentID, safeTeacher, progress);
        vscode.window.showInformationMessage("Project sent successfully!");
      } catch (err: any) {
        if (err.name === 'AbortError') {
          vscode.window.showErrorMessage("Request timed out. Please try again and make sure host server URL is correct.");
        } else {
          vscode.window.showErrorMessage("Failed to upload exam project: " + err.message);
        }
      }
    });

  });

  context.subscriptions.push(uploadExamDisposable);

  const getExamDisposable = vscode.commands.registerCommand('sce-unina.getExam', async () => {
    const serverUrl = `${await getServerUrl()}/get_exam`;; // your flask backend endpoint
  

    console.log("sce-unina.getExam IS INVOKED!!!");

    // Prompt user to pick a folder to save the PDF
    const folderUri = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: "Select folder to save exam files"
    });
  
    if (!folderUri || folderUri.length === 0) {
      vscode.window.showWarningMessage("Download canceled. No folder selected.");
      return;
    }
  
    const saveFolder = folderUri[0].fsPath;
    //const savePath = path.join(saveFolder, "traccia.pdf");
  
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Downloading exam files...",
      cancellable: false
    }, async (progress) => {
      try {
        progress.report({ message: `Fetching PDF from ${getServerUrl()}...` });

        //const response = await fetch(serverUrl);
        const response = await fetchWithTimeout(serverUrl, {}, 30000);

        if (!response.ok) {
          const text = await response.text();
          vscode.window.showErrorMessage(`Server ${getServerUrl()} error ${response.status}: ${text}`);
          return;
        }
  
        // Extract filename from Content-Disposition
        let contentDisposition = response.headers.get('content-disposition');
        let filename = "exam_download";

        if (contentDisposition) {
          const match = /filename\*=UTF-8''(.+)$/.exec(contentDisposition) 
            || /filename="?([^"]+)"?/.exec(contentDisposition);
          if (match) {
            filename = decodeURIComponent(match[1]);
          }
        }

        // Fallback if no extension
        if (!path.extname(filename)) {
          filename += ".pdf";
        }

        const savePath = path.join(saveFolder, filename);

        console.log(filename);
        console.log(savePath);
        
        vscode.window.showInformationMessage(`Saving exam files as: ${filename}`);

        // Read response as buffer
        const buffer = Buffer.from(await response.arrayBuffer());

        // Write file to disk
        await fs.promises.writeFile(savePath, buffer);

        vscode.window.showInformationMessage(`Exam files downloaded successfully to ${savePath}`);

      } catch (err: any) {
        if (err.name === 'AbortError') {
          vscode.window.showErrorMessage("Request timed out. Please try again and make sure host server URL is correct.");
        } else {
          vscode.window.showErrorMessage("Failed to download exam files: " + err.message);
        }
      }
    });
  });
  
  context.subscriptions.push(getExamDisposable);

  const configureServerHostDisposable = vscode.commands.registerCommand('sce-unina.configureServerHost', async () => {

    console.log("sce-unina.configureServerHost IS INVOKED!!!");

    const currentUrl = await getServerUrl();
    const newUrl = await vscode.window.showInputBox({
      prompt: "Enter the backend server URL",
      value: currentUrl,
      ignoreFocusOut: true,
      validateInput: (text) => {
        try {
          const url = new URL(text);
          if (!['http:', 'https:'].includes(url.protocol)) {
            return "URL must start with http:// or https://";
          }
          return null;
        } catch {
          return "Invalid URL format";
        }
      }
    });
    if (newUrl) {
      await setServerUrl(newUrl);
      vscode.window.showInformationMessage(`Server URL set to: ${newUrl}`);

      uploadProvider.refresh(); // <== refresh the tree view here!
      
    } else {
      vscode.window.showInformationMessage("Server URL configuration canceled.");
    }
  });
  
  context.subscriptions.push(configureServerHostDisposable);

}

function zipFolder(source: string, out: string): Promise<void> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

export function deactivate() {}
