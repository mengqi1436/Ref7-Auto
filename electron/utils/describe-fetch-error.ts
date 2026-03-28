export const NETWORK_RETRY_HINT = '网络波动，请更新网络后重试'

/** 仅在 fetch 因协议/网络层失败进入 catch 时使用 */
export function describeFetchError(_reason: unknown, _endpointHint?: string): string {
  return NETWORK_RETRY_HINT
}

export function userFacingNetworkMessage(detail: string): string {
  const t = detail.trim()
  if (
    /fetch failed/i.test(t) ||
    /^network\b/i.test(t) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(
      t
    )
  ) {
    return NETWORK_RETRY_HINT
  }
  return detail
}
