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

这四个优先级高于所有 `GEOSITE` 分类，可用来覆盖 geosite 的判断。

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
- `TIERS` — 自动兜底组的节点优先级
- `MAIN` — 主力组名称

### 换机场

脚本不含任何机场相关信息，换订阅可直接沿用。只需把 `KEEP_GROUPS` 改成新机场自建服务的组名（没有就留空数组）。

## 结构

```
providers/
  antigravity.yaml   Antigravity CLI 专用域名
  direct.yaml        强制直连
  proxy.yaml         强制代理
  reject.yaml        黑名单
verge-script.js      Verge Script 扩展，策略组与规则在这里生成
```

## 规则优先级

从上到下依次匹配，命中即停：

1. 本机与局域网 → 直连
2. `agy.exe` 进程 → Antigravity 组
3. 机场自建服务（订阅保留）
4. 个人覆盖层（`reject` / `direct` / `proxy`）
5. 广告拦截
6. AI 服务细分（Claude / OpenAI / Gemini / Cursor / Copilot / Perplexity）
7. 开发资源（npm / pypi / crates / GitHub）
8. 其余 AI 服务
9. 流媒体、社交、厂商、游戏
10. `geosite:cn` + `GEOIP:CN` → 直连
11. `geosite:geolocation-!cn` → 主力节点
12. 兜底组
