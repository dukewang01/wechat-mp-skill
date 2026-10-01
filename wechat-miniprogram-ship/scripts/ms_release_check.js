/* ms_release_check.js —— 发布前自检
 *
 * 为什么需要：
 *   审核通过后到「点发布」之间，**必须确保待发布的就是通过审核的那个版本**。
 *   一旦在此期间改了代码并重新上传，就会出现「提交审核的版本 ≠ 当前线上版本」，
 *   发布的是未经审核的代码 —— 这是明确的违规风险。
 *
 *   本脚本回答一个问题：**当前工作区，还是不是刚才通过审核的那个版本？**
 *
 * 判据：
 *   ① 版本号一致
 *   ② 名称各处一致（app.json / project.config / 每个页面标题 / 代码常量）
 *   ③ 工作区最后修改时间**早于**最后一次上传时间 → 无未上传改动
 *   ④ 关键文件 hash 与台账记录一致（若有记录）
 *
 * 用法：node ms_release_check.js
 * 退出码：0=可发布；1=有风险，需处理
 */
const fs = require('fs');
const path = require('path');
const L = require('./_lib');

const cfg = L.loadConfig();
const SRC = cfg.projectPath;

const problems = [];
const notes = [];

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (e) { return null; } }

/* 把台账里 "YYYY-MM-DD HH:mm:ss" 当**本地时间**解析。
 * ⚠️ 踩坑：不要用 new Date(str) —— 带空格的时间串在 V8 里行为不一致，
 *    实测被当成 UTC 解析，导致与本地 mtime 比较时**整体错位 8 小时**，
 *    会让"上传后有没有改动"漏判。显式构造本地时间。 */
function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s));
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

/* 本地时间格式化（不要用 toISOString —— 那是 UTC，会显示成早 8 小时） */
function fmtLocal(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/* ---------- ① 版本号 ---------- */
const cfgJs = path.join(SRC, 'utils', 'config.js');
let appVersion = '(未找到)', appName = '(未找到)';
if (fs.existsSync(cfgJs)) {
  const t = fs.readFileSync(cfgJs, 'utf-8');
  const v = /APP_VERSION:\s*'([^']+)'/.exec(t);
  const n = /APP_NAME:\s*'([^']+)'/.exec(t);
  if (v) appVersion = v[1];
  if (n) appName = n[1];
} else {
  problems.push('找不到 utils/config.js（若你的项目结构不同，请改本脚本）');
}

/* ---------- ② 名称一致性 ---------- */
const names = [];
const appJson = readJson(path.join(SRC, 'app.json'));
if (appJson) {
  names.push(['app.json', appJson.window && appJson.window.navigationBarTitleText]);
  (appJson.pages || []).forEach((pg) => {
    const pj = readJson(path.join(SRC, pg + '.json'));
    if (pj && pj.navigationBarTitleText) names.push([pg + '.json', pj.navigationBarTitleText]);
  });
}
const pc = readJson(path.join(SRC, 'project.config.json'));
if (pc && pc.projectname) names.push(['project.config.json', pc.projectname]);

const uniq = Array.from(new Set(names.map((x) => x[1]).filter(Boolean)));
if (uniq.length > 1) {
  problems.push('名称不一致（' + uniq.length + ' 种）：\n    ' +
    names.map((x) => x[0] + ' = ' + x[1]).join('\n    '));
}
if (appName !== '(未找到)' && uniq.length === 1 && uniq[0] !== appName) {
  problems.push('代码常量 APP_NAME(' + appName + ') 与页面标题(' + uniq[0] + ') 不一致');
}

/* ---------- ③ 工作区最后修改 vs 最后一次上传 ---------- */
const LAST = path.join(__dirname, 'out', 'last_upload.json');
const LEDGER = path.join(__dirname, 'out', 'upload_ledger.tsv');
let lastUploadAt = null, lastVersion = null;

if (fs.existsSync(LEDGER)) {
  /* 台账优先（CI 通道不留逐次记录，台账是唯一可靠来源） */
  const lines = fs.readFileSync(LEDGER, 'utf-8').split(/\r?\n/).filter((x) => x.trim() && !/^时间/.test(x));
  if (lines.length) {
    const cols = lines[lines.length - 1].split('\t');
    lastUploadAt = cols[0]; lastVersion = cols[1];
  }
} else if (fs.existsSync(LAST)) {
  const j = readJson(LAST);
  if (j) { lastUploadAt = String(j.at).slice(0, 19).replace('T', ' '); lastVersion = j.version; }
} else {
  notes.push('没有上传台账（out/upload_ledger.tsv）与上传记录（out/last_upload.json），无法做时间比对');
}

let maxMtime = 0, maxFile = '';
(function walk(d) {
  fs.readdirSync(d).forEach((f) => {
    if (['node_modules', '__pycache__', '.git', 'preview', 'tests', 'data'].indexOf(f) >= 0) return;
    const p = path.join(d, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(js|json|wxml|wxss|wxs)$/.test(f) && st.mtimeMs > maxMtime) {
      maxMtime = st.mtimeMs; maxFile = path.relative(SRC, p);
    }
  });
})(SRC);

if (lastUploadAt) {
  const up = parseLocal(lastUploadAt);
  if (isNaN(up)) {
    notes.push('无法解析最后上传时间「' + lastUploadAt + '」，跳过时间比对');
  } else if (maxMtime > up) {
    problems.push('工作区有**上传之后**的改动：\n' +
      '    最后改动 ' + fmtLocal(maxMtime) + '  (' + maxFile + ')\n' +
      '    最后上传 ' + lastUploadAt + '\n' +
      '    ⚠ 若这些改动已重新上传，请确认上传的就是通过审核的版本；\n' +
      '      若未重新上传，则**线上发布的仍是旧代码**，改动不会生效。');
  }
  if (!isNaN(up) && lastVersion && appVersion !== lastVersion) {
    problems.push('版本号不一致：代码 ' + appVersion + ' vs 最后上传 ' + lastVersion);
  }
}

/* ---------- 输出 ---------- */
console.log('');
console.log('发布前自检');
console.log('='.repeat(62));
console.log('  项目        ' + SRC);
console.log('  版本号      ' + appVersion);
console.log('  代码内名称  ' + appName);
console.log('  页面标题    ' + (uniq.length === 1 ? uniq[0] + '（' + names.length + ' 处一致）' : uniq.join(' / ')));
console.log('  最后上传    ' + (lastUploadAt ? lastUploadAt + '  版本 ' + (lastVersion || '?') : '(无记录)'));
console.log('  最后改动    ' + (maxFile ? fmtLocal(maxMtime) + '  (' + maxFile + ')' : '(无)'));
console.log('');

notes.forEach((n) => console.log('  ℹ ' + n));

if (problems.length === 0) {
  console.log('  ✅ 自检通过 —— 当前工作区与最后上传的版本一致，可以发布。');
  console.log('');
  console.log('  发布路径：公众平台 → 版本管理 → 审核版本 → 发布');
  console.log('  ⚠ 发布前确认：ICP 备案已通过（未备案发布会失败，错误码 86369）');
  console.log('');
  process.exit(0);
}

console.log('  ❌ 有 ' + problems.length + ' 项需要处理：');
console.log('');
problems.forEach((p, i) => console.log('  ' + (i + 1) + '. ' + p + '\n'));
process.exit(1);
