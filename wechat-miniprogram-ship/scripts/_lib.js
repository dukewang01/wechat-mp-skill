/* _lib.js —— 共享工具：配置加载、官方 CLI 调用、JSON 提取
 *
 * 为什么要单独抽出来：
 *   Windows 下把含 JSON / 空格 / 中文的参数传给 cmd，引号会被吃掉，
 *   这是本项目踩得最多的坑。所有调用统一走这里的 `callIde()`，
 *   不要各自拼命令行。
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.js');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('缺少配置文件：' + CONFIG_PATH);
    console.error('请先执行：cp config.example.js config.js，然后填写。');
    process.exit(2);
  }
  const cfg = require(CONFIG_PATH);
  const miss = [];
  if (!cfg.appid || /^wx0+$/.test(cfg.appid)) miss.push('appid');
  if (!cfg.projectPath) miss.push('projectPath');
  if (!cfg.devtoolsDir) miss.push('devtoolsDir');
  if (miss.length) {
    console.error('config.js 里这些项还没填：' + miss.join(', '));
    process.exit(2);
  }
  return cfg;
}

/* 官方 CLI 路径。Windows 用 .bat，macOS 无扩展名。 */
function cliPath(cfg) {
  const win = process.platform === 'win32';
  const name = win ? 'cli.bat' : 'cli';
  return path.join(cfg.devtoolsDir, name);
}

/* 官方 MCP 工具入口。Windows 用 wechatide.cmd。 */
function wechatidePath(cfg) {
  const win = process.platform === 'win32';
  const name = win ? 'wechatide.cmd' : 'wechatide';
  return path.join(cfg.devtoolsDir, name);
}

/* 引号包裹（shell:true 时用；路径含空格必需） */
function q(s) { return '"' + String(s).replace(/"/g, '\\"') + '"'; }

/* 调官方 CLI（cli.bat 风格：cli <命令> <参数...>） */
function callCli(cfg, args, opts) {
  const cli = cliPath(cfg);
  if (!fs.existsSync(cli)) return { ok: false, out: '找不到官方 CLI：' + cli };
  const r = spawnSync('cmd.exe', ['/c', cli].concat(args),
    Object.assign({ encoding: 'utf-8' }, opts || {}));
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}

/* 调官方 MCP 工具（wechatide -c <client> <tool> <参数...>） */
function callIde(cfg, client, tool, args, opts) {
  const exe = wechatidePath(cfg);
  if (!fs.existsSync(exe)) return { ok: false, out: '找不到 wechatide：' + exe };
  const r = spawnSync('cmd.exe', ['/c', exe, '-c', client, tool].concat(args || []),
    Object.assign({ encoding: 'utf-8' }, opts || {}));
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || ''), status: r.status };
}

/* 从混杂输出里精确截取第一个完整 JSON 对象。
 * 不用 slice(indexOf('{')) —— CLI 输出后面可能跟别的行，
 * 会导致 "Unexpected non-whitespace character after JSON"。 */
function extractJson(s) {
  const start = String(s).indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}

/* 解析 JSON，失败返回 null */
function parseJson(s) {
  const t = extractJson(s);
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}

/* 深度搜索某个 key（返回层级会随工具版本变，写死路径会失效） */
function deepFind(node, key, depth) {
  if (!node || typeof node !== 'object' || (depth || 0) > 8) return undefined;
  if (node[key] !== undefined) return node[key];
  for (const k of Object.keys(node)) {
    const v = deepFind(node[k], key, (depth || 0) + 1);
    if (v !== undefined) return v;
  }
  return undefined;
}

/* 读 JSON 参数：支持 --file <路径> / --env <变量名> / 直接字符串
 * 剥 BOM：某些 shell 写文件会带 UTF-8 BOM，JSON.parse 不认。 */
function readArgsArgv(argv) {
  const fi = argv.indexOf('--file');
  if (fi > 0 && argv[fi + 1]) {
    const p = argv[fi + 1];
    if (!fs.existsSync(p)) return { err: '参数文件不存在：' + p };
    return { raw: fs.readFileSync(p, 'utf-8') };
  }
  const ei = argv.indexOf('--env');
  if (ei > 0 && argv[ei + 1]) return { raw: process.env[argv[ei + 1]] || '{}' };
  return { raw: argv[0] || '{}' };
}

function parseArgsObject(raw) {
  const t = String(raw).replace(/^\uFEFF/, '').trim();
  try { return { val: JSON.parse(t) }; } catch (e) { return { err: '不是合法 JSON：' + t }; }
}

module.exports = {
  ROOT, CONFIG_PATH,
  loadConfig, cliPath, wechatidePath, q,
  callCli, callIde,
  extractJson, parseJson, deepFind,
  readArgsArgv, parseArgsObject,
};
