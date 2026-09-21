# clash-rules

自用的 Clash 分流策略。订阅只提供节点，分流规则全部由本仓库接管。

## 为什么

机场订阅自带的规则通常是内联的上万条域名列表，为兼容所有客户端（Surge / QuantumultX / 原版 Clash）而写，无法使用 mihomo 的 `GEOSITE`。规则之间缺少分类边界，容易出现**前面的规则把后面的策略组整个遮蔽**——某个组在面板上可选，实际却从未参与过匹配。

本仓库改用分层结构，把"通用"和"个性化"分开：

| 层 | 内容 | 载体 | 维护方式 |
|---|---|---|---|
| 1 | 个人覆盖层：强制直连 / 强制代理 / 黑名单 / 专用应用 | 本仓库 `providers/` | 改完 `git push`，各机器按周期自动同步 |
| 2 | 通用大类：广告、国内域名、各厂商与流媒体 | 本地 `geosite.dat` | 零维护，随 Verge 的 geo 数据更新 |
| 3 | 机场自建服务（如 Emby） | 订阅原始规则 | 脚本按组名自动提取保留 |

规则总量从 10000+ 条降到约 180 条，其中大部分还是第 3 层保留下来的，覆盖面反而更大——`geosite:cn` 一个分类就有 11 万条国内域名。

## 依赖

- **Clash Verge Rev** + **mihomo (Clash.Meta)** 内核。`GEOSITE` 是 mihomo 专有语法，原版 Clash / Surge / QuantumultX 不支持。
- 本地 `geosite.dat`（Verge 自带并自动更新）。

## 在新机器上启用

1. 装 Clash Verge Rev，导入你的机场订阅
2. 订阅卡片右键 → **编辑扩展配置** → 切到 **Script** 标签
3. 把 [`verge-script.js`](verge-script.js) 全文粘贴进去，保存
4. 点一下订阅卡片重新应用配置

完成。`providers/` 下的规则会自动从本仓库拉取，无需在新机器上做任何额外配置。

## 自定义

### 调整某个域名的走向

不用改脚本，改 `providers/` 下的文件即可，改完 push，各机器 24 小时内自动同步：

- `direct.yaml` — 强制直连
- `proxy.yaml` — 强制走代理
- `reject.yaml` — 屏蔽
- `antigravity.yaml` — Antigravity CLI 专用出口
- `oracle.yaml` — Oracle 云补充域名
- `oracle-ip.yaml` — Oracle 云 IP 段（`ipcidr` 类型）

前四个优先级高于所有 `GEOSITE` 分类，可用来覆盖 geosite 的判断。

格式：

```yaml
payload:
  - '+.example.com'      # 含所有子域名
  - 'exact.example.com'  # 精确匹配
```

### 增删策略组 / 调整分类

改 `verge-script.js` 顶部的配置区：

- `GROUPS` — 策略组清单，顺序即面板显示顺序
- `GEO_MAP` — geosite 分类到策略组的映射，**顺序即匹配优先级**
- `KEEP_GROUPS` — 需要保留订阅原始规则的组
- `DIRECT_FIRST` — 默认直连的组，见下
- `CN_DIRECT_GEOSITES` — 专用分类中应当优先直连的中国大陆子集
- `TIERS` — 自动兜底组的节点优先级
- `MAIN` — 主力组名称

### 让某个组默认直连

策略组默认选中成员列表的第一项。一般组的顺序是 `主力节点 / 兜底 / DIRECT / 各节点`，
所以默认走代理。把组名加进 `DIRECT_FIRST`，该组会改成 `DIRECT / 主力节点 / 兜底 / 各节点`，
默认直连，同时保留全部节点，需要时在面板一键切回代理。

```js
var DIRECT_FIRST = ['📺 Bilibili', '☁️ Oracle'];
```

B 站属于这类：`geosite:bilibili` 把视频 CDN（`bilivideo.com`、`hdslb.com`、`acgvideo.com`
等 53 条）一并算进去，走代理等于让整条视频流绕境外中转。实测 `upos-sz-mirrorcos.bilivideo.com`
首字节直连 0.23s、走新加坡节点 2.13s，差 9 倍，表现就是频繁卡顿。

### 中国大陆子集与字节跳动

Apple、Microsoft、Steam 等完整分类同时包含境内、境外服务，不能简单把整个策略组默认改成
直连。脚本会先匹配上游明确维护的大陆子集（如 `apple-cn`、`microsoft@cn`、
`steam@cn`），让中国区 CDN、系统更新等直连，再把其余域名交给对应策略组。

字节跳动使用同样的分层思路，但需要覆盖抖音与头条共用的 `snssdk.com` 等域名：

1. `category-ads-all` 先拦截带 `@ads` 标记的域名
2. `tiktok` 与 `bytedance@!cn` 走「Tiktok」组
3. 剩余 `bytedance`（抖音、头条及共用基础设施）直连

顺序不能颠倒，否则要么抖音共用域名落入代理兜底，要么 TikTok 被误判为直连。
另外，`bing` 和 `xbox` 必须放在 `microsoft` 之前；后者包含前两者，反过来排列会让
「Bing」「Xbox」两个独立组永远无法命中。

### Oracle 云

`☁️ Oracle` 组同样默认直连。OCI 在国内可以直连，自己的实例绕一趟境外中转只是白白加延迟。

覆盖分三层，缺一层就会漏：

| 规则 | 位置 | 作用 |
|---|---|---|
| `RULE-SET,my-oracle` | 所有 `GEOSITE` 分类之前 | `providers/oracle.yaml`，补 geosite 漏掉的 OCI 域名 |
| `GEOSITE,oracle` | 分类段末尾 | geosite 自带的 19 条，含 `oracle.com`、`oraclecloud.com` |
| `RULE-SET,my-oracle-ip` | `GEOSITE,cn` 之前 | `providers/oracle-ip.yaml`，OCI 公开 IP 段 |

放在分类段**末尾**是有意的：`geosite:oracle` 里混了 `java.com`、`virtualbox.org`，
排在 `category-dev` 之后它们才会归「开发资源」，不被 Oracle 组吃掉。
分类里的 `addthis.com` 等追踪域名则更早被广告拦截挡下。

IP 段那条带 **`no-resolve`**，这是关键：域名请求不在这里解析比对，仍按上面的域名规则走。
否则托管在 OCI 上的境外站点会被这 1107 条 CIDR 误判成直连。它只负责兜住 SSH、API
这类直接用 IP 发起、匹配不到域名的连接。

`oracle-ip.yaml` 由官方 [public_ip_ranges.json](https://docs.oracle.com/iaas/tools/public_ip_ranges.json)
生成，是静态快照，不会自动跟上游走。Oracle 加了新区域再重新抓一次即可。

### 换机场

脚本不含任何机场相关信息，换订阅可直接沿用。只需把 `KEEP_GROUPS` 改成新机场自建服务的组名（没有就留空数组）。

## 结构

```
providers/
  antigravity.yaml   Antigravity CLI 专用域名
  direct.yaml        强制直连
  proxy.yaml         强制代理
  reject.yaml        黑名单
  oracle.yaml        Oracle 云补充域名
  oracle-ip.yaml     Oracle 云公开 IP 段（官方 JSON 生成）
verge-script.js      Verge Script 扩展，策略组与规则在这里生成
```

## 规则优先级

从上到下依次匹配，命中即停：

1. 本机与局域网 → 直连
2. `agy.exe` 进程 → Antigravity 组
3. 机场自建服务（订阅保留）
4. 个人覆盖层（`reject` / `direct` / `proxy`）
5. 广告拦截
6. Apple TV、Oracle 云补充域名
7. Apple / Microsoft / Steam 等中国大陆子集 → 直连
8. TikTok / 字节境外子集 → Tiktok 组；其余字节域名 → 直连
9. AI 服务细分（Claude / OpenAI / Gemini / Cursor / Copilot / Perplexity）
10. 开发资源（npm / pypi / crates / GitHub）
11. 其余 AI 服务
12. 流媒体、社交、厂商、游戏、`geosite:oracle`
13. Telegram IP 段、Oracle 云 IP 段（均 `no-resolve`）
14. `geosite:cn` + `GEOIP:CN` → 直连
15. `geosite:geolocation-!cn` → 主力节点
16. 兜底组
