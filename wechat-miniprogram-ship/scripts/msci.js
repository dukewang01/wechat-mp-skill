/* msci.js —— 统一入口
 *
 *   node msci.js <命令> [参数...]
 *
 * 命令：
 *   status                  体检：配置/密钥/项目/CI/IDE/端口
 *   upide  <版本> [备注]    上传代码 → IDE 通道（**上传者 = 你的登录账号，正式发版用这个**）
 *   upload <版本> [备注]    上传代码 → CI 通道（上传者显示为 ci机器人N，headless）
 *   preview [输出] [备注]   生成预览二维码（CI）
 *   fn <函数名>             部署云函数（CI）
 *   call <函数名> --file <json>   真实调用云函数（模拟器）
 *   whichip                 查「平台看到的调用方 IP」（填白名单用）
 *   ide:<tool> [参数...]    透传官方 MCP 工具
 *   shots [输出目录]        批量截图（提审图片素材）
 *   help
 *
 * 为什么要两个上传命令：见 README「三条最重要的结论」第 1 条。
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const L = require('./_lib');

const NODE = process.execPath;
const ROOT = L.ROOT;

function run(script, args) {
  const r = spawnSync(NODE, [path.join(ROOT, script)].concat(args), { stdio: 'inherit' });
  return r.status === null ? 1 : r.status;
}

function help() {
  console.log('');
  console.log('微信小程序操作入口');
  console.log('='.repeat(60));
  console.log('  node msci.js status');
  console.log('  node msci.js doctor                 配置自检（能否真跑起来）');
  console.log('  node msci.js upide  <版本> [备注]   上传（IDE 通道，上传者=你）★推荐');
  console.log('  node msci.js upload <版本> [备注]   上传（CI 通道，上传者=ci机器人N）');
  console.log('  node msci.js preview [输出] [备注]  预览二维码');
  console.log('  node msci.js fn <函数名>            部署云函数');
  console.log('  node msci.js call <函数名> --file <json>   真实调用云函数');
  console.log('  node msci.js whichip                查白名单该填的 IP');
  console.log('  node msci.js ide:<tool> [参数...]   透传官方工具');
  console.log('  node msci.js shots [输出目录]       批量截图');
  console.log('  node msci.js release-check          发布前自检（对照最后上传）');
  console.log('  node msci.js help');
  console.log('');
  console.log('首次使用：cp config.example.js config.js 并填写。');
  console.log('');
}

/* 探测本机端口是否在监听 —— 用纯 Node 的 TCP 连接，不依赖 PowerShell
 * （跨平台一致，且没有中文编码问题）。
 * 同步用法：本函数内部用 spawnSync 起一个一次性子进程做异步连接，
 * 这样 status() 可以保持同步风格，不必改成 async。 */
function probePorts(ports) {
  const script =
    'const net=require("net");const ps=' + JSON.stringify(ports) + ';' +
    'let left=ps.length,out=[];' +
    'ps.forEach(function(p){' +
    'const s=net.connect(p,"127.0.0.1");' +
    'const done=function(ok){out.push([p,ok]);if(--left===0){' +
    'process.stdout.write(JSON.stringify(out));}};' +
    's.setTimeout(600);' +
    's.on("connect",function(){done(true);s.destroy();});' +
    's.on("timeout",function(){done(false);s.destroy();});' +
    's.on("error",function(){done(false);s.destroy();});' +
    '});';
  try {
    const r = spawnSync(NODE, ['-e', script], { encoding: 'utf-8', timeout: 5000 });
    const arr = JSON.parse((r.stdout || '').trim() || '[]');
    const alive = arr.filter((x) => x[1]).map((x) => x[0]);
    const dead = arr.filter((x) => !x[1]).map((x) => x[0]);
    return alive.length
      ? '在听 ' + alive.join('/') + (dead.length ? '（未听 ' + dead.join('/') + '）' : '')
      : '都不在听（工具可能没启动）';
  } catch (e) { return '(探测失败)'; }
}

function status() {
  const cfg = L.loadConfig();
  const rows = [];
  const add = (k, v) => rows.push('  ' + String(k).padEnd(22) + v);

  add('— 配置 —', '');
  add('AppID', cfg.appid);
  add('工程路径', fs.existsSync(cfg.projectPath) ? '✅ ' + cfg.projectPath : '❌ 不存在');

  const appJson = path.join(cfg.projectPath, 'app.json');
  if (fs.existsSync(appJson)) {
    try {
      const j = JSON.parse(fs.readFileSync(appJson, 'utf-8'));
      add('页面数', String((j.pages || []).length));
      add('导航标题', String(j.window && j.window.navigationBarTitleText));
    } catch (e) { add('app.json', '⚠ 解析失败'); }
  }

  add('— 密钥 —', '');
  if (cfg.privateKeyPath && fs.existsSync(cfg.privateKeyPath)) {
    const st = fs.statSync(cfg.privateKeyPath);
    add('代码上传密钥', '✅ ' + st.size + ' B');
  } else {
    add('代码上传密钥', '❌ 缺失（CI 通道不可用；IDE 通道不受影响）');
  }

  add('— 云开发 —', '');
  add('环境 ID', cfg.cloudEnv || '(未配置 → 云命令不可用)');

  add('— 依赖 —', '');
  const ciPkg = path.join(ROOT, 'node_modules', 'miniprogram-ci', 'package.json');
  add('miniprogram-ci', fs.existsSync(ciPkg)
    ? '✅ v' + JSON.parse(fs.readFileSync(ciPkg, 'utf-8')).version
    : '❌ 未安装（cd scripts && npm i miniprogram-ci）');

  add('— 开发者工具 —', '');
  const cli = L.cliPath(cfg), ide = L.wechatidePath(cfg);
  add('cli', fs.existsSync(cli) ? '✅' : '❌ ' + cli);
  add('wechatide', fs.existsSync(ide) ? '✅' : '❌ ' + ide);

  /* ⚠️ 踩坑：不要在这里用 PowerShell 过滤中文进程名。
   * Node 的 spawnSync 把含中文的 -Command 字符串传给 powershell.exe 时
   * 会被编码搞坏 —— 实测恒返回 0，与实际（32 个）不符。
   * 改用「端口是否在听」判断工具是否在跑：无编码问题，且更贴近真实需求。 */
  add('工具是否在跑', probePorts([21011, 9432, 3799]));

  add('平台端口约定', '21011=IDE 默认 / 9432=automation / 3799=开发版通道');
  add('平台端口', '21011=IDE 默认 / 9432=automation / 3799=开发版(Nightly)');

  console.log('');
  console.log('体检结果');
  console.log('='.repeat(60));
  rows.forEach((r) => console.log(r));
  console.log('');
  return 0;
}

const cmd = (process.argv[2] || 'help').toLowerCase();
const rest = process.argv.slice(3);

switch (cmd) {
  case 'help': case '-h': case '--help':
    help(); process.exit(0);

  case 'status':
    process.exit(status());

  /* 配置自检（校验配置能不能真跑起来）。
   * 与 status 的分工：status 只**打印**配置；doctor **判定**配置是否可用。 */
  case 'doctor':
    process.exit(run('ms_doctor.js', rest));

  case 'upide': case 'upload-ide':
    if (!rest[0]) { console.error('用法：node msci.js upide <版本> [备注]'); process.exit(2); }
    process.exit(run('ms_ide_upload.js', rest));

  case 'upload':
    if (!rest[0]) { console.error('用法：node msci.js upload <版本> [备注]'); process.exit(2); }
    process.exit(run('ms_ci_upload.js', rest));

  case 'preview':
    process.exit(run('ms_ci_preview.js', rest));

  case 'fn':
    if (!rest[0]) { console.error('用法：node msci.js fn <函数名>'); process.exit(2); }
    process.exit(run('ms_ci_fn.js', rest));

  case 'call':
    if (!rest[0]) { console.error('用法：node msci.js call <函数名> --file <json>'); process.exit(2); }
    process.exit(run('ms_ci_call.js', rest));

  case 'whichip':
    process.exit(run('ms_ci_whichip.js', rest));

  case 'shots':
    process.exit(run('ms_shots.js', rest));

  case 'release-check': case 'rc':
    process.exit(run('ms_release_check.js', rest));

  default:
    if (cmd.indexOf('ide:') === 0) {
      const tool = process.argv[2].slice(4);
      if (!tool) { console.error('用法：node msci.js ide:<tool> [参数...]'); process.exit(2); }
      const cfg = L.loadConfig();
      console.log('经由官方工具执行：' + tool);
      const r = L.callIde(cfg, process.env.MSCI_CLIENT || 'default', tool, rest, { stdio: 'inherit' });
      process.exit(r.status || 0);
    }
    console.error('未知命令：' + cmd);
    help();
    process.exit(2);
}
