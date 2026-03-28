# Context7 注册相关 HTTP（Clerk FAPI + Dashboard）

依据仓库内 [ctx7-mcp-network-after-signup-submit.json](ctx7-mcp-network-after-signup-submit.json) 与 Electron 实现 [context7-requests.ts](../../electron/services/context7-requests.ts) 整理；上游变更时需以浏览器 DevTools 为准。

## Clerk Frontend API（`https://clerk.context7.com/v1`）

查询串：`__clerk_api_version`、`_clerk_js_version`（与现网 `REF7_CTX7_CLERK_*` 一致）。

| 步骤 | 方法 | 路径 | Content-Type | 说明 |
|------|------|------|----------------|------|
| 引导 | GET | `/environment`、`/client` | — | 与 `clerkBootstrap` 一致 |
| 创建注册 | POST | `/client/sign_ups` | `application/x-www-form-urlencoded` | 常见字段：`email_address`、`password`；若 ToS 缺失可能需 `legal_accepted=true` |
| 发邮箱验证码 | POST | `/client/sign_ups/{sign_up_id}/prepare_verification` | 同上 | `strategy=email_code`；`sign_up_id` 形如 `sua_...` |
| 校验验证码 | POST | `/client/sign_ups/{sign_up_id}/attempt_verification` | 同上 | `code={otp}&strategy=email_code` |
| 会话 | POST | `/client/sessions/{id}/touch`、`/tokens` | JSON / form | 与 `clerkCompleteSession` 一致 |

**Referer**：`sign_ups` 相关请求使用 `https://context7.com/sign-up`；`sign_ins` 使用 `https://accounts.context7.com/sign-in`。

**Turnstile**：`sign_ups` 可能要求人机令牌；纯 `fetch` 失败时由 [handlers.ts](../../electron/ipc/handlers.ts) 回退 [browser.ts](../../electron/services/browser.ts) 的 `registerAccount`。

## Dashboard API Key（`https://context7.com`）

在已登录会话（`Cookie` + 可选 `Authorization: Bearer`）下尝试：

1. `POST /api/dashboard/api-keys`，JSON `{"name":"..."}` 或附带 `teamspaceId`
2. 回退：`POST /api/dashboard/teamspaces/{teamspaceId}/api-keys`，JSON `{"name":"..."}`

成功响应中密钥格式 `ctx7sk-...`，由解析器从 JSON 树提取。

## 用量

继续走 `GET .../api/dashboard/stats/{teamspaceId}`（`fetchContext7AccountRequests`），不得重复爬取 Dashboard DOM。
