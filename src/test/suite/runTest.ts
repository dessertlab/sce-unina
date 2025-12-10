import * as path from 'path';
import Mocha from 'mocha';

console.log("runTest.ts loaded");

export function run(): Promise<void> {
  console.log("Starting Mocha test run");

  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 10000
  });

  // Add your test file(s) here:
  //mocha.addFile(path.resolve(__dirname, 'test_upload.ts'));
  mocha.addFile(path.resolve(__dirname, 'test_upload.js'));


  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      console.log(`Mocha run finished: ${failures} failure(s)`);
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
