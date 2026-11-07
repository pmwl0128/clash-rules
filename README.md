# clash-rules

自用的 Clash 分流策略。机场订阅提供节点与通用分流，本仓库只补机场没有的个人层。

## 为什么现在只补不改（2026-11）

机场订阅这次更新后自带完整的服务分组：47 个策略组、约 1.9 万条规则，覆盖 AI、
流媒体、社交、云盘、游戏、开发、国内服务等分类，其中 9 个组默认直连。按旧方案用
`GEOSITE` 重建全部分流已经没有收益，反而会：

- 把 47 个组换成本仓库的 30 多个组，丢掉 Spotify、Prime Video、Hulu、DAZN、Docker、
  npm、谷歌云盘、PikPak、Epic、PlayStation、Nintendo 等组的独立控制，以及它们
  「B 站 / Steam / Epic / PS / Xbox / Nintendo / 微软云盘 / PrivateTracker / 国内服务
  默认直连」的设置；
- 因为 `KEEP_GROUPS` 对不上新组名（机场现在叫「守候影院」「SNTP」），丢掉机场自建的
  Emby 规则；Epic / PS / Nintendo 这些在 geosite 里没有对应分类的流量也会退回代理。

所以脚本退化为薄覆盖层：机场规则原样保留、顺序不动，只在最前面插 15 条个人规则，
再删掉机场规则里明确写错的条目。

| 层 | 内容 | 载体 |
|---|---|---|
| 1 | 本机 / 私网 / IPv6 直连 | 脚本内联 |
| 2 | 广告拦截、强制直连、强制代理、Antigravity、Oracle | `providers/`（规则集） |
| 3 | Google Play 签名下载 CDN 直连 | 脚本内联 |
| 4 | 机场原生规则 | 订阅 |

规则总数：机场 18,999 条 + 前置 15 条 = 19,014 条。

## 依赖

- **Clash Verge Rev** + mihomo (Clash.Meta) 内核。`GEOSITE`、`DOMAIN-REGEX`、进程规则都是
  mihomo 专有语法，原版 Clash / Surge / QuantumultX 不支持。
- 本地 `geosite.dat`（Verge 自带并自动更新，广告拦截用其中的 `category-ads-all`）。
- 机场的节点容器组名（脚本默认 `Premium`，见「换机场」）。

## 在新机器上启用

1. 装 Clash Verge Rev，导入机场订阅
2. 订阅卡片右键 → **编辑扩展配置** → 切到 **Script** 标签
3. 把 [`verge-script.js`](verge-script.js) 全文粘贴进去，保存
4. 点一下订阅卡片重新应用配置

完成。`providers/` 下的规则会自动从本仓库拉取，无需在新机器上做任何额外配置。

回滚：把 Script 恢复成 `function main(config) { return config; }`，即回到机场原配置。

## 脚本做了什么

### 前置的 15 条规则

1. **本机与私网**：`127/8`、`100.64/10`、`fe80::/10`、`fc00::/7`、`::1/128` 直连
   （机场只给了 10/8、172.16/12、192.168/16）。
2. **广告拦截**：个人黑名单 + `GEOSITE,category-ads-all` → 「🛑 广告拦截」。
   机场没有一条 REJECT 规则，广告原本是跟着服务组走代理的。
3. **个人覆盖层**：`my-direct` → DIRECT，`my-proxy` → 主力节点。
4. **Play 下载**：签名主机 `DOMAIN-REGEX` → 「📥 Play 下载」，默认 DIRECT，见下节。
5. **Antigravity**：`agy.exe` 进程规则 + `my-antigravity` 域名 → 「🚀 Antigravity」，
   美国节点优先（需要与其它 AI 服务不同的出口）。
6. **Oracle**：`my-oracle` 域名 + `my-oracle-ip` 公开 IP 段（带 `no-resolve`）→
   「☁️ Oracle」，默认主力节点，需要直连时在面板切 DIRECT。

### 面板顺序

节点容器组（默认 `Premium`）置顶——其它组的成员列表都引用它，它才是真正的顶层选择；
随后是脚本自建的四个组；再往后是机场原有的服务组，顺序不变。

### 修正机场规则

- **ccTLD 级后缀**：机场 Google 组里有 `DOMAIN-SUFFIX,co,Google`、`DOMAIN-SUFFIX,hk,Google`
  等 28 条单标签后缀，是 `google.com.xx` 被生成器截断的产物，会把所有 `.co` `.hk` `.tw`
  `.sg` `.my` `.pk` `.vn` 等域名送进 Google 组。这些域名本来就被 `DOMAIN-SUFFIX,google.com`
  覆盖，脚本直接删掉这 28 条，不损失任何归属。
- **重复规则**：`GEOIP,CN` 两条、微信 6 条各重复一次，脚本去重。
- **失效的进程规则**：机场把 `find-process-mode` 设成 `off`，它自带的 66 条 `PROCESS-NAME`
  从不生效；脚本改成 `strict`，只在遇到进程规则时才查进程。

### 没动的上游问题

- 「国内服务」里的 `DOMAIN-SUFFIX,ms` 是 `.ms` 顶级域，会把极少数 .ms 域名直连，影响可忽略。
- 47 个组全是 `select`，没有测速 / 故障转移组，节点挂了要在面板手动切。
- 「谷歌云盘」组里包含 `www.googleapis.com` 这类通用 Google API，属于机场自己的分类选择，未改。

## Google Play 下载

商店能正常浏览、应用也能搜到，但所有更新都卡在 0%、反复提示「无法安装」时，先看这一节。

Play 点更新后会拿到一个签名下载地址，主机名形如 `rr1---sn-2x3eenee.xn--ngstr-lra8j.com`
（`xn--ngstr-lra8j` 就是 `gvt1` 的 punycode 写法）。这类主机由 Google 解析到**国内 GGC
边缘**（实测 `114.250.63.2`，北京联通），本应直连取包。一旦被送去代理出口，边缘会在 TLS
握手阶段直接断开，Cronet 报 `ERR_CONNECTION_CLOSED`，Play 报 `CANNOT_CONNECT`，重试永远停在 0%。

机场把 `xn--ngstr-lra8j.com` 收进了「Google」组（默认走代理），所以脚本单独放行签名主机：

```
DOMAIN-REGEX,^rr[0-9]+---sn-[a-z0-9-]+\.xn--ngstr-lra8j\.com,📥 Play 下载
```

- 只放行签名 CDN。`play-fe.googleapis.com`、`android.clients.google.com` 等商店 API 仍走代理，
  进商店、登录、同步都不受影响。
- `redirector.gvt1.com` 这类普通 gvt1 主机不受影响（它们本来就该走代理）。
- 万一以后 Play 改用境外边缘（下载 URL 指向境外 IP），在面板把该组切回「Premium」即可。
- 已经卡住的下载要**先取消再重试**。下载队列会缓存旧 token 反复重试同一个坏地址，不取消不会自愈。

## 自定义

### 调整某个域名的走向

不用改脚本，改 `providers/` 下的文件即可，改完 push，各机器 24 小时内自动同步：

- `direct.yaml` — 强制直连
- `proxy.yaml` — 强制走代理
- `reject.yaml` — 屏蔽
- `antigravity.yaml` — Antigravity CLI 专用出口
- `oracle.yaml` — Oracle 云域名
- `oracle-ip.yaml` — Oracle 云 IP 段（`ipcidr` 类型）

这六层规则都插在机场规则之前，优先级高于所有机场分类。

格式：

```yaml
payload:
  - '+.example.com'      # 含所有子域名
  - 'exact.example.com'  # 精确匹配
```

### 策略组与常量

改 `verge-script.js` 顶部的配置区：

- `NODE` — 机场的节点容器组名，规则里当作「主力节点」
- `ADS` / `AGY` / `ORC` / `PDL` — 四个自建组的组名

## 结构

```
providers/
  antigravity.yaml   Antigravity CLI 专用域名
  direct.yaml        强制直连
  proxy.yaml         强制代理
  reject.yaml        黑名单
  oracle.yaml        Oracle 云域名
  oracle-ip.yaml     Oracle 云公开 IP 段（官方 JSON 生成）
verge-script.js      Verge Script 扩展，前置规则与规则清理
```

## 规则优先级

从上到下依次匹配，命中即停：

1. 本机与私网 → 直连
2. 广告拦截 → 「🛑 广告拦截」（REJECT）
3. 个人覆盖层（`reject` / `direct` / `proxy`）
4. Play 签名下载 CDN → 「📥 Play 下载」（默认直连）
5. `agy.exe`、Antigravity 域名 → 「🚀 Antigravity」
6. Oracle 域名、OCI IP 段（`no-resolve`） → 「☁️ Oracle」
7. 以下是机场原生规则：守候影院 / SNTP → 各服务组 → 国内服务 →
   `GEOSITE:cn`、`GEOIP:CN` → `MATCH` 漏网之鱼

## 换机场

脚本自身不含机场信息，只依赖一个组名：

- 机场节点容器组不是 `Premium` 时，改脚本顶部的 `NODE`；
- 找不到 `NODE` 时，脚本会自动挑一个「成员恰好是所有节点」的 `select` 组；
- 连这种组也没有时退化为 `DIRECT`（这时 `my-proxy` 也会指向 DIRECT，实际等于不代理，需手动处理）。

`providers/` 里的规则与机场无关，可以直接沿用。

## 历史

2026-11 之前，机场只给 3 个组、500 多条内联规则，本仓库用 `GEOSITE` 重建全部分流
（约 180 条，含字节跳动的分层处理、B 站直连、Oracle 三层覆盖）。机场配置完善后这套
重建方案已移除，需要时可以在 git 历史里找回。
