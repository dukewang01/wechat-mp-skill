# 双通道上传 · 云函数部署与调用

---

## 一、为什么有两条通道

微信官方提供了**两条完全独立的上传路径**，能力与约束都不同：

```
┌─────────────────────┬──────────────────────────────┬─────────────────────────┐
│                     │ CI 通道（miniprogram-ci）      │ IDE 通道（wechatide）    │
├─────────────────────┼──────────────────────────────┼─────────────────────────┤
│ 形态                │ npm 包，headless              │ 开发者工具自带的 CLI     │
│ 需要工具开着        │ ❌ 不需要                     │ ✅ 需要                  │
│ 鉴权                │ 代码上传密钥（长期有效）       │ 工具登录态（会过期）     │
│ IP 白名单           │ ⚠️ 受约束                    │ ✅ 不受约束              │
│ 上传者显示          │ ci机器人N（改不了）            │ 你的登录账号 ✅          │
│ 体积口径            │ __FULL__                     │ TOTAL                    │
│ 独有能力            │ 部署云函数                    │ 模拟器/截图/数据库        │
└─────────────────────┴──────────────────────────────┴─────────────────────────┘
```

### 选择原则

| 场景 | 用哪个 |
|---|---|
| **正式发版** | **IDE 通道**（记录归属是你） |
| 快速迭代、预览、CI 流水线 | CI 通道 |
| CI 白名单没配好时的兜底上传 | IDE 通道 |
| 部署云函数 | CI 通道（更省事，见第四节） |

**⚠️ 最重要的取舍**：**版本管理记录的归属，比"命令方便"重要。**
不要因为 CI 更 headless 就一直用 CI，那会让所有人的版本记录都变成「ci机器人1」。

---

## 二、CI 通道设置

### 2.1 安装

```bash
cd scripts
npm i miniprogram-ci
```

**建议装在独立目录**，不要装进小程序工程里（避免影响打包体积）。

### 2.2 拿代码上传密钥

```
公众平台 → 管理 → 开发管理 → 开发设置 → 小程序代码上传 → 生成密钥
```

下载到的文件名形如 `private.<appid>.key`。

**安全要求**：
- 放在**工程目录之外**（如用户主目录下的 secrets 目录）
- **绝不提交到版本库**（加进 `.gitignore`）
- 文件名本身含 appid，别放进公开仓库

### 2.3 IP 白名单（**最容易卡住的一步**）

**建议开启**（公钥泄露时可兜底），代价是每次 IP 变化要更新。

**遇到 `invalid ip` 时该填哪个 IP** —— 这一步有个反直觉的坑：

| 你查的地方 | 查到的 IP | 微信认吗 |
|---|---|---|
| 普通探针（如 ipify） | **代理出口 IP**（稳定） | ❌ **不认** |
| 微信报错里的 `invalid ip` | **真实客户端 IP**（动态） | ✅ **认这个** |

**原因**：如果本机走代理，探针查到的是代理出口；而微信侧看到的是被透传的真实客户端 IP。
**两个数不一样。**

**做法**：跑一次真实的 CI 调用，从报错里取 IP：

```
[error] 20003 Error: {"errCode":-10008,"errMsg":"invalid ip: x.x.x.x"}
                                                        ^^^^^^^ 填这个
```

脚本 `ms_ci_whichip.js` 已实现这个探测（跑一次预览，从报错里解析 IP）。

**⚠️ 让 CI 走本地代理通常没用**：某些实现会把真实客户端 IP 透传给上游，
设了 `ci.proxy()` 日志显示"using proxy"，但微信看到的**仍是真实 IP**。

**⚠️ 该 IP 可能会变**（运营商动态分配）。变了就重跑探测脚本再更新白名单。

---

## 三、IDE 通道设置

**没有额外配置**，只需要：
1. 开发者工具**已安装**
2. 开发者工具**已登录**（上传者就是这个人）

调用形式：
```
wechatide -c <clientName> upload --project <项目路径> --upload-version <版本> --desc <备注>
```

**⚠️ `upload` 没有 `robot` 参数** —— 这正是它能显示真实身份的原因。

### 3.1 调用方式（Windows 踩坑）

```js
// ❌ 错：引号会被 cmd 当成命令名的一部分
spawnSync('cmd.exe', ['/c', '"' + exe + '"', '-c', client, 'upload', ...])

// ❌ 错：.cmd 不能直接 spawn（EINVAL）
spawnSync(exe, args)

// ❌ 错：shell:true 但路径不引号 → 'C:\Program' is not recognized
spawnSync(exe + ' ' + args.join(' '), { shell: true })

// ✅ 对：shell:true + 逐参数加引号
const q = s => '"' + s.replace(/"/g, '\\"') + '"';
spawnSync(q(exe) + ' ' + args.map(q).join(' '), { shell: true })
```

---

## 四、云函数

### 4.1 部署：CI 通道明显更省事

```bash
node ms_ci_fn.js <函数名>
```

| | IDE 通道部署 | **CI 通道部署** |
|---|---|---|
| 需人工在工具里点确认 | ✅ 要（返回 `pending`） | ❌ **不要** |
| 首次部署竞态 | 可能因函数处于 `Creating` 而失败 | 一次性完成 |
| 依赖安装 | 需自己处理 | `remoteNpmInstall: true` 云端装 |
| 返回 | 异步任务 id | 文件数 + 包大小 |

**实测参考**：CI 通道部署耗时约 18–20s，一次成功。

### 4.2 ⚠️ 部署成功 ≠ 能跑通

**工具链通常只有"部署"和"查询"，没有"调用"。** 所以部署完你是不知道它对不对的。

**修法：用模拟器绕过去真实调用。**

在开发者工具的自动化环境里执行：

```js
function () {
  wx.cloud.init({ env: '<云环境ID>' });
  return new Promise(function (res) {
    wx.cloud.callFunction({
      name: '<函数名>',
      data: { /* 入参 */ },
      success: function (x) { res(x.result); },
      fail: function (e) { res({ __fail: e.errMsg }); }
    });
  });
}
```

调用方 openid = **模拟器的 openid** → 这刚好让**鉴权类逻辑可测**：
- 把模拟器 openid 放进白名单 → 应返回成功
- 把白名单换成别人的 openid → 应返回拒绝

**两条路径都测，才叫验证过鉴权。**

### 4.3 环境变量设不了时的兜底

若逻辑依赖环境变量（如管理员白名单），而本机工具链**没有设置环境变量的能力**：

**做法**：代码内兜底常量 + 环境变量优先。

```js
const ADMIN_ENV = process.env.ADMIN_OPENIDS;
const ADMIN_FALLBACK = ['<openid>'];   // 兜底：改这里要重新部署
const ADMIN_OPENIDS = (ADMIN_ENV ? ADMIN_ENV.split(',') : ADMIN_FALLBACK)
  .map(s => s.trim()).filter(Boolean);
```

**并在文档里写明**："要改白名单需改代码并重新部署"，
免得后来人以为能在后台改。

---

## 五、脚本参数化的注意事项

`_lib.js` 里统一处理了：

| 事项 | 做法 |
|---|---|
| 配置 | `config.js`（从 `config.example.js` 复制，**已 gitignore**） |
| Windows/macOS 差异 | `cliPath()` / `wechatidePath()` 自动选 `.bat` 或裸名 |
| 引号地狱 | 统一走 `callCli()` / `callIde()` / `q()`，不要各自拼命令 |
| JSON 提取 | `extractJson()` 括号配对；`deepFind()` 深度搜索 |
| BOM | `parseArgsObject()` 自动剥 `\uFEFF` |

**新加脚本请复用 `_lib.js`，不要重复踩坑。**
