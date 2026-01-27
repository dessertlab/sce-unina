import * as path from 'path';
import * as fs from 'fs';
import * as assert from 'assert';
import { uploadExamProject } from '../../extension'; // adjust if necessary

console.log("test_upload.ts invoked...");

describe('SCE Unina uploadExamProject Integration Tests', function () {
  const baseTestFolder = path.join(__dirname, 'mock_students');

  // Runs once before all tests
  before(function () {
    if (!fs.existsSync(baseTestFolder)) {
      fs.mkdirSync(baseTestFolder);
    }
  });

  it('Upload 100 student projects', async function () {
    this.timeout(60000); // Optional: increase timeout for long-running tests

    for (let i = 1; i <= 100; i++) {
      const surname = `Surname${i}`;
      const name = `Name${i}`;
      const studentID = `ID${String(i).padStart(3, '0')}`;
      const studentFolder = path.join(baseTestFolder, `student_${i}`);
      const teacher = "TEST TEACHER";

      if (!fs.existsSync(studentFolder)) {
        fs.mkdirSync(studentFolder);
        fs.writeFileSync(path.join(studentFolder, 'main.txt'), `This is student ${i}'s file.`);
      }

      console.log(`Uploading for student ${i}: ${surname} ${name} (${studentID})`);
      try {
        await uploadExamProject(studentFolder, surname, name, studentID, teacher);
        console.log(`Upload for ${studentID} successful`);
      } catch (error) {
        console.error(`Upload for ${studentID} failed:`, error);
        assert.fail(`Upload failed for student ${studentID}`);
      }
    }
  });
});
