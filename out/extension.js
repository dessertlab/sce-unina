"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServerUrl = getServerUrl;
exports.setServerUrl = setServerUrl;
exports.uploadExamProject = uploadExamProject;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const archiver_1 = __importDefault(require("archiver"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const form_data_1 = __importDefault(require("form-data"));
const adm_zip_1 = __importDefault(require("adm-zip"));
function getFormDataLength(form) {
    return new Promise((resolve, reject) => {
        form.getLength((err, length) => {
            if (err)
                reject(err);
            else
                resolve(length);
        });
    });
}
function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    options.signal = controller.signal;
    return (0, node_fetch_1.default)(url, options).finally(() => clearTimeout(id));
}
/*
function getServerUrl(): string {
  const config = vscode.workspace.getConfiguration();
  return config.get<string>('sce-unina.serverUrl') || 'http://127.0.0.1:5001';
}
*/
function getConfigFilePath() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        return path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'sce-unina-config.json');
    }
    else {
        return path.join(os.homedir(), '.sce-unina-config.json'); // fallback to user home
    }
}
async function getServerUrl() {
    const configPath = getGlobalConfigPath();
    try {
        const raw = await fs.promises.readFile(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.serverUrl === 'string') {
            return parsed.serverUrl;
        }
    }
    catch {
        // file missing or corrupt → use default
    }
    return 'http://127.0.0.1:5001'; // default fallback
}
function getGlobalConfigPath() {
    const baseDir = (() => {
        const platform = process.platform;
        if (platform === 'win32') {
            return path.join(process.env.APPDATA || '', 'sce-unina');
        }
        else if (platform === 'darwin') {
            return path.join(process.env.HOME || '', 'Library', 'Application Support', 'sce-unina');
        }
        else {
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
async function setServerUrl(newUrl) {
    const configPath = getGlobalConfigPath();
    const configDir = path.dirname(configPath);
    await fs.promises.mkdir(configDir, { recursive: true });
    const config = { serverUrl: newUrl };
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}
class UploadNode extends vscode.TreeItem {
    constructor(label, commandId, tooltip, iconId) {
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
class UploadProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren() {
        return [
            new UploadNode("CONSEGNA compito", "sce-unina.uploadExam", "Clicca per consegnare i file relativi al compito richiesto", "cloud-upload"),
            new UploadNode("SCARICA file compito", "sce-unina.getExam", "Clicca per scaricare i file necessari per completare il compito richiesto", "cloud-download"),
            new UploadNode("CONFIGURA macchina docente", "sce-unina.configureServerHost", `MACCHINA DOCENTE corrente: ${await getServerUrl()}`, "settings-gear")
        ];
    }
}
/* add for testing */
async function uploadExamProject(folderPath, surname, name, studentID, teacher, progress) {
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
    if (progress) {
        progress.report({ message: "Creating ZIP archive..." });
        await zipFolder(folderPath, zipPath);
    }
    if (progress) {
        progress.report({ message: "Sending project to server..." });
    }
    const form = new form_data_1.default();
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
    }
    finally {
        fs.unlink(zipPath, () => { });
    }
}
function activate(context) {
    // Register the TreeDataProvider for the sidebar view
    const uploadProvider = new UploadProvider();
    vscode.window.registerTreeDataProvider('sceUninaView', uploadProvider);
    // Register the upload command
    const uploadExamDisposable = vscode.commands.registerCommand('sce-unina.uploadExam', async (uri) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage("Nessuna directory workspace è aperta!");
            return;
        }
        const folderPath = uri?.fsPath || workspaceFolders[0].uri.fsPath;
        // Prompt user for info
        const surname = await vscode.window.showInputBox({
            prompt: "Inserisci il COGNOME",
            ignoreFocusOut: true,
            validateInput: text => text.trim() === '' ? 'Il campo COGNOME non puo\' essere vuoto!!!' : null
        });
        if (!surname) {
            vscode.window.showWarningMessage("UPLOAD annullato. COGNOME non fornita.");
            return;
        }
        const name = await vscode.window.showInputBox({
            prompt: "Inserisci il NOME",
            ignoreFocusOut: true,
            validateInput: text => text.trim() === '' ? 'Il campo NOME non puo\' essere vuoto!!!' : null
        });
        if (!name) {
            vscode.window.showWarningMessage("UPLOAD annullato. NOME non fornita.");
            return;
        }
        const studentID = await vscode.window.showInputBox({
            prompt: "Inserisci la MATRICOLA",
            ignoreFocusOut: true,
            validateInput: text => text.trim() === '' ? 'Il campo MATRICOLA non puo\' essere vuoto!!!' : null
        });
        if (!studentID) {
            vscode.window.showWarningMessage("UPLOAD annullato. MATRICOLA non fornita.");
            return;
        }
        const teacher = await vscode.window.showInputBox({
            prompt: "Inserisci il DOCENTE (NOME e COGNOME)",
            ignoreFocusOut: true,
            validateInput: text => text.trim() === '' ? 'Il campo DOCENTE non puo\' essere vuoto!!!' : null
        });
        if (!teacher) {
            vscode.window.showWarningMessage("UPLOAD annullato. DOCENTE non fornito.");
            return;
        }
        const safe = (str) => str.trim().replace(/[^a-zA-Z0-9 _-]/g, '');
        const safeSurname = safe(surname).toUpperCase();
        const safeName = safe(name).toUpperCase();
        const safeStudentID = safe(studentID).toUpperCase();
        const safeTeacher = safe(teacher).toUpperCase();
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Consegna compito a ${await getServerUrl()}...`,
            cancellable: false
        }, async (progress) => {
            try {
                await uploadExamProject(folderPath, safeSurname, safeName, safeStudentID, safeTeacher, progress);
                vscode.window.showInformationMessage("Compito inviato correttamente!!!");
            }
            catch (err) {
                if (err.name === 'AbortError') {
                    vscode.window.showErrorMessage("La richiesta è scaduta. Riprovare e assicurarsi che l'URL della macchina docente sia corretto.");
                }
                else {
                    vscode.window.showErrorMessage("Errore. Compito non inviato correttamente: " + err.message);
                }
            }
        });
    });
    context.subscriptions.push(uploadExamDisposable);
    const getExamDisposable = vscode.commands.registerCommand('sce-unina.getExam', async () => {
        const serverUrl = `${await getServerUrl()}/get_exam`; // your flask backend endpoint
        // Prompt user to pick a folder to save the PDF
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: "Selezionare la cartella in cui salvare i file del compito"
        });
        if (!folderUri || folderUri.length === 0) {
            vscode.window.showWarningMessage("Download annullato. Non è stata selezionata alcuna cartella.");
            return;
        }
        const saveFolder = folderUri[0].fsPath;
        //const savePath = path.join(saveFolder, "traccia.pdf");
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Scaricamento dei file del compito...",
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: `Scaricamento dei file da ${getServerUrl()}...` });
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
                vscode.window.showInformationMessage(`Salvataggio dei file del compito come: ${filename}`);
                // Read response as buffer
                const buffer = Buffer.from(await response.arrayBuffer());
                const ext = path.extname(filename).toLowerCase();
                if (ext === '.zip') {
                    try {
                        const zip = new adm_zip_1.default(buffer);
                        const entries = zip.getEntries();
                        for (const entry of entries) {
                            const entryPathRaw = (entry.entryName || '');
                            // Remove leading slashes/backslashes and normalize the path
                            let sanitized = entryPathRaw.replace(/^[\/]+/, '');
                            sanitized = path.normalize(sanitized);
                            // Reject empty entries or traversal attempts
                            if (!sanitized || sanitized === '.')
                                continue;
                            const parts = sanitized.split(path.sep);
                            if (parts.includes('..') || path.isAbsolute(sanitized)) {
                                console.warn(`Skipping suspicious entry (path traversal): ${entryPathRaw}`);
                                continue;
                            }
                            const targetPath = path.join(saveFolder, sanitized);
                            // Extra safety: ensure extraction stays inside saveFolder
                            if (!targetPath.startsWith(saveFolder)) {
                                console.warn(`Skipping suspicious entry: ${entryPathRaw}`);
                                continue;
                            }
                            if (entry.isDirectory) {
                                await fs.promises.mkdir(targetPath, { recursive: true });
                            }
                            else {
                                await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
                                const data = entry.getData();
                                await fs.promises.writeFile(targetPath, data);
                            }
                        }
                        vscode.window.showInformationMessage(`Exam ZIP extracted successfully to ${saveFolder}`);
                    }
                    catch (e) {
                        // Fallback: if extraction fails, save the raw zip file
                        await fs.promises.writeFile(savePath, buffer);
                        vscode.window.showWarningMessage(`Failed to extract ZIP; saved raw ZIP to ${savePath}: ${e.message}`);
                    }
                }
                else {
                    // Write file to disk
                    await fs.promises.writeFile(savePath, buffer);
                    vscode.window.showInformationMessage(`File del compito correttamente scaricati in ${savePath}`);
                }
            }
            catch (err) {
                if (err.name === 'AbortError') {
                    vscode.window.showErrorMessage("La richiesta è scaduta. Riprovare e assicurarsi che l'URL della macchina docente sia corretto.");
                }
                else {
                    vscode.window.showErrorMessage("Errore. File del compito non scaricati correttamente: " + err.message);
                }
            }
        });
    });
    context.subscriptions.push(getExamDisposable);
    const configureServerHostDisposable = vscode.commands.registerCommand('sce-unina.configureServerHost', async () => {
        const currentUrl = await getServerUrl();
        const newUrl = await vscode.window.showInputBox({
            prompt: "Inserisci l'URL della macchina docente",
            value: currentUrl,
            ignoreFocusOut: true,
            validateInput: (text) => {
                try {
                    const url = new URL(text);
                    if (!['http:', 'https:'].includes(url.protocol)) {
                        return "L'URL deve iniziare con http:// o https://";
                    }
                    return null;
                }
                catch {
                    return "Formato URL invalido";
                }
            }
        });
        if (newUrl) {
            await setServerUrl(newUrl);
            vscode.window.showInformationMessage(`URL della macchina docente impostato a: ${newUrl}`);
            uploadProvider.refresh(); // <== refresh the tree view here!
        }
        else {
            vscode.window.showInformationMessage("Configurazione dell'URL della macchina docente annullato!");
        }
    });
    context.subscriptions.push(configureServerHostDisposable);
}
function zipFolder(source, out) {
    const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
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
function deactivate() { }
//# sourceMappingURL=extension.js.map