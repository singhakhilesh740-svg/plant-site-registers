// Runs after `npx cap add android`: enables native Google Sign-In, copies app icons.
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '..', 'android');

// 1) Google provider for @capacitor-firebase/authentication
const vg = path.join(A, 'variables.gradle');
let v = fs.readFileSync(vg, 'utf8');
if (!v.includes('rgcfaIncludeGoogle')) {
  v = v.replace(/ext\s*\{/, 'ext {\n    rgcfaIncludeGoogle = true');
  fs.writeFileSync(vg, v);
}

// 2) Original Plant Site Registers launcher icons
const src = path.join(__dirname, '..', 'android-res');
const res = path.join(A, 'app', 'src', 'main', 'res');
for (const d of fs.readdirSync(src)) {
  for (const f of fs.readdirSync(path.join(src, d))) {
    fs.copyFileSync(path.join(src, d, f), path.join(res, d, f));
  }
}
// use PNG icons instead of Capacitor's default adaptive icon
fs.rmSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true });

// 3) google-services.json present?
const gs = path.join(A, 'app', 'google-services.json');
console.log(fs.existsSync(gs) ? '✔ google-services.json found' : '⚠ android/app/google-services.json MISSING — Google login will not work');
console.log('✔ Android project patched');
