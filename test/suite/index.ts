import * as path from 'path';
import { runTests } from 'vscode-test';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
    const extensionTestsPath = path.resolve(__dirname, './runTest');  // point directly to runTest.ts
    const executablePath = '/usr/local/bin/codium'; // or your VS Codium path

    console.log("Starting vscode-test");

    await runTests({
      
      extensionDevelopmentPath,
      extensionTestsPath,
      
    });

    console.log("vscode-test run completed");
  } catch (err) {
    console.error('Failed to run tests', err);
    process.exit(1);
  }
}

main();
