// 协流 XieFlow — fetch 响应语义化（r2 返工 #1·B：waizhuan P3）
// api 停机时 vite 代理把 ECONNREFUSED 转成 HTTP 500 透传给页面；原始状态码对最终用户
// 是噪音。HTTP 5xx / 网络失败统一翻译为可操作的话术；业务 4xx 的 error 消息可读、照常透传。
export const SERVICE_DOWN_MESSAGE = "服务未启动或网络异常，请稍后重试";

export async function fetchJsonOrThrow(res: Response): Promise<unknown> {
  if (res.status >= 500) throw new Error(SERVICE_DOWN_MESSAGE);
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? `请求失败（HTTP ${res.status}）`);
  return data;
}
