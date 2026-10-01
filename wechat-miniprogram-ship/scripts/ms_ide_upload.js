/* ms_ide_upload.js —— IDE 通道上传（上传者 = 你的开发者工具登录账号）
 *
 * ⚠️ 为什么正式发版要用这个：
 *   miniprogram-ci 的 `robot` 只能是 1–30 的数字，**上传者固定显示「ci机器人N」**。
 *   官方社区 2021-06-01，微信团队回复原话：
 *     「反馈已收到，我们并不打算优化。」（针对"能否自定义 ci 机器人名字"）
 *   而 IDE 通道的上传走登录身份 —— 版本管理里记的是你本人。
 *
 * 用法：node ms_ide_upload.js <版本号> [备注]
 *
 * 前置：开发者工具已安装并**已登录**，且至少开着一次（CLI 会拉起）。
 */
const fs = require('fs');
const { spawnSync } = require('child_process');
const L = require('./_lib');

const cfg = L.loadConfig();
const version = process.argv[2];
const desc = process.argv[3] || '';

if (!version) { console.error('用法：node ms_ide_upload.js <版本号> [备注]'); process.exit(2); }

const exe = L.wechatidePath(cfg);
if (!fs.existsSync(exe)) { console.error('找不到 wechatide：' + exe); process.exit(2); }

const client = process.env.MSCI_CLIENT || 'default';

/* 执行方式（踩坑）：
 *   spawnSync('cmd.exe', ['/c', exe, ...]) 在参数含空格时会报
 *     'C:\Program' is not recognized as an internal or external command
 *   → 用 shell:true + 自己拼引用。 */
const args = ['-c', client, 'upload', '--project', cfg.projectPath,
  '--upload-version', version];
if (desc) args.push('--desc', desc);
const cmdline = L.q(exe) + ' ' + args.map(L.q).join(' ');

console.log('通道：IDE（上传者 = 开发者工具登录账号）');
console.log('版本：' + version);
if (desc) console.log('备注：' + desc);

const r = spawnSync(cmdline, { shell: true, encoding: 'utf-8' });
const out = (r.stdout || '') + (r.stderr || '');
console.log(out.trim());

if (/"success":\s*true/.test(out)) {
  console.log('✅ 上传成功（上传者应为登录账号，请在后台版本管理核对）');
  process.exit(0);
}
console.error('❌ 上传失败');
process.exit(1);
