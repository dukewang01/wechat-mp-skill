/* ms_ci_call.js —— 真实调用云函数（验证部署是否真的能跑）
 *
 * ⚠️ 为什么需要这么绕：
 *   官方工具链只有「部署云函数」和「查询云函数」，**没有「调用云函数」**。
 *   所以部署完你无法验证它对不对 —— 只能看状态是 Active，那不证明逻辑正确。
 *
 * 解法（实测可行）：
 *   在开发者工具的自动化环境里执行 `wx.cloud.init` + `wx.cloud.callFunction`。
 *   调用方 openid = 模拟器 openid → **正好能验证管理员白名单这类鉴权逻辑**
 *   （白名单内的 openid 应通过、不在名单的应被拒）。
 *
 * 用法：
 *   node ms_ci_call.js <函数名> --file <json文件>
 *   node ms_ci_call.js <函数名> --env <环境变量名>
 * 例：
 *   echo {"action":"stats"} > args.json
 *   node ms_ci_call.js my-fn --file args.json
 *
 * ⚠️ 参数务必走 --file 或 --env：
 *   shell 会把命令行里的 JSON 双引号吃掉（`{"a":1}` 变成 `{a:1}`）。
 *
 * 前置：开发者工具已安装并登录；automation 服务可用。
 */
const fs = require('fs');
const { spawnSync } = require('child_process');
const L = require('./_lib');

const cfg = L.loadConfig();
const name = process.argv[2];
if (!name) {
  console.error('用法：node ms_ci_call.js <函数名> --file <json文件>');
  console.error('      node ms_ci_call.js <函数名> --env <环境变量名>');
  process.exit(2);
}
if (!cfg.cloudEnv) { console.error('config.js 里未填 cloudEnv'); process.exit(2); }

const got = L.readArgsArgv(process.argv.slice(3));
if (got.err) { console.error(got.err); process.exit(2); }
const parsed = L.parseArgsObject(got.raw);
if (parsed.err) {
  console.error(parsed.err);
  console.error('（提示：改用 --file 传参，避开 shell 吃引号）');
  process.exit(2);
}
const payload = parsed.val;

const exe = L.wechatidePath(cfg);
if (!fs.existsSync(exe)) { console.error('找不到 wechatide：' + exe); process.exit(2); }

const client = process.env.MSCI_CLIENT || 'default';

/* 拼成在模拟器里执行的函数源码 */
const fnSource =
  'function(){' +
  'wx.cloud.init({ env: ' + JSON.stringify(cfg.cloudEnv) + ', traceUser: true });' +
  'return new Promise(function(res){' +
  'wx.cloud.callFunction({' +
  'name: ' + JSON.stringify(name) + ',' +
  'data: ' + JSON.stringify(payload) + ',' +
  'success: function(x){ res({ call: "ok", result: x.result }); },' +
  'fail: function(e){ res({ call: "fail", err: (e && e.errMsg) || String(e) }); }' +
  '});});}';

console.log('调用云函数：' + name);
console.log('参数：' + JSON.stringify(payload));

/* 执行方式：shell:true + 自己加引号（含引号/空格的长参数走 cmd 数组会被弄坏） */
const argv = ['automation_evaluate', '--project', cfg.projectPath, '--fn-source', fnSource];
const cmdline = [L.q(exe), '-c', L.q(client)].concat(argv.map(L.q)).join(' ');

const r = spawnSync(cmdline, { shell: true, encoding: 'utf-8' });
const out = (r.stdout || '') + (r.stderr || '');

/* 截取第一个完整 JSON（括号配对，因为输出后面可能跟别的行） */
const jsonText = L.extractJson(out);
if (!jsonText) {
  console.error('未拿到 JSON 返回：');
  console.error(out.slice(-1200));
  process.exit(1);
}
let root;
try { root = JSON.parse(jsonText); }
catch (e) { console.error('JSON 解析失败：' + e.message); console.error(jsonText.slice(0, 600)); process.exit(1); }

/* 深度搜索含 call 字段的对象 —— 返回嵌套层级会随工具版本变，别写死路径 */
function findCall(node, depth) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (node.call === 'ok' || node.call === 'fail') return node;
  for (const k of Object.keys(node)) {
    const hit = findCall(node[k], depth + 1);
    if (hit) return hit;
  }
  return null;
}

const res = findCall(root, 0);
if (res && res.call === 'ok') {
  console.log('✅ 云函数返回：');
  console.log(JSON.stringify(res.result, null, 2));
  process.exit(0);
}
if (res && res.call === 'fail') {
  console.error('❌ 调用失败：' + res.err);
  process.exit(1);
}
console.error('⚠ 未在返回里找到 call 字段：' + jsonText.slice(0, 600));
process.exit(1);
