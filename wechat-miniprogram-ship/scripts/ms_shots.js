/* ms_shots.js —— 批量截图（提审用的图片素材）
 *
 * ⚠️ 提审截图最常见的错误是**截了空状态的页面**：
 *   把「结果页」截了图，但当时没跑过数据 → 全是 0 / 全空，
 *   审核员看了会以为「没功能」，正好撞上常见拒绝情形 3.1.5「功能不能过于简单」。
 *   → **先跑一遍真实流程让页面有数据，再截图。**
 *
 * 用法：node ms_shots.js [输出目录]
 *
 * 参数说明（容易写错）：
 *   --path <本地输出路径>    （不是 --output）
 *   --wait <0-10 秒>         截图前等待渲染
 *   --optimize 默认 true → 写的是 **JPEG**，所以输出扩展名请用 .jpg
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const L = require('./_lib');

const cfg = L.loadConfig();
const OUT = process.argv[2] || path.join(__dirname, 'out', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const exe = L.wechatidePath(cfg);
if (!fs.existsSync(exe)) { console.error('找不到 wechatide：' + exe); process.exit(2); }

const client = process.env.MSCI_CLIENT || 'default';

/* ⚠️ 按**用户真实路径**改这个列表 —— 顺序会影响审核员的理解 */
const PAGES = [
  ['pages/index/index', '01_首页'],
  // ['pages/result/result', '02_结果页'],   ← 确保这时页面有真实数据再截
];

function call(tool, args) {
  const argv = [tool].concat(args || []);
  const cmdline = [L.q(exe), '-c', L.q(client)].concat(argv.map(L.q)).join(' ');
  const r = spawnSync(cmdline, { shell: true, encoding: 'utf-8' });
  return (r.stdout || '') + (r.stderr || '');
}

console.log('输出目录：' + OUT);
console.log('提示：先跑一遍真实流程让页面有数据，再截图。');
let ok = 0;

PAGES.forEach(([page, name], idx) => {
  const out = path.join(OUT, name + '.jpg');
  console.log('');
  console.log('[' + (idx + 1) + '/' + PAGES.length + '] ' + page);

  const o1 = call('simulator_open_page', ['--project', cfg.projectPath, '--page', page]);
  const opened = /"success":\s*true/.test(o1);
  console.log('  打开页面：' + (opened ? 'ok' : '失败'));
  if (!opened) console.log('    ' + o1.trim().slice(-200));

  call('simulator_screenshot', ['--project', cfg.projectPath, '--path', out,
    '--wait', String(idx === 0 ? 6 : 3)]);

  if (fs.existsSync(out)) {
    console.log('  截图：✅ ' + path.basename(out) + '  ' +
      Math.round(fs.statSync(out).size / 1024) + 'KB');
    ok++;
  } else {
    console.log('  截图：❌ 未生成');
  }
});

console.log('');
console.log('完成：' + ok + '/' + PAGES.length + ' 张 → ' + OUT);
process.exit(ok === PAGES.length ? 0 : 1);
