declare module 'adm-zip' {
  interface IZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  }

  class AdmZip {
    constructor(input?: Buffer | string);
    getEntries(): IZipEntry[];
  }

  export default AdmZip;
}
