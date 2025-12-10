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
Object.defineProperty(exports, "__esModule", { value: true });
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const assert = __importStar(require("assert"));
const extension_1 = require("../../extension"); // adjust if necessary
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
                await (0, extension_1.uploadExamProject)(studentFolder, surname, name, studentID, teacher);
                console.log(`Upload for ${studentID} successful`);
            }
            catch (error) {
                console.error(`Upload for ${studentID} failed:`, error);
                assert.fail(`Upload failed for student ${studentID}`);
            }
        }
    });
});
//# sourceMappingURL=test_upload.js.map