const CONFIGURED_API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * 개발 서버를 같은 와이파이의 휴대폰/태블릿에서 열면, 빌드에 들어간
 * `localhost`는 그 기기 자신을 가리킨다. 이 경우에만 현재 페이지의
 * 호스트로 바꿔 개발 PC의 API에 접속한다.
 *
 * 배포 환경에서 명시한 실제 API 도메인은 그대로 보존한다.
 */
export function getApiBase(): string {
  if (typeof window === "undefined" || !CONFIGURED_API_BASE) return CONFIGURED_API_BASE;

  try {
    const apiUrl = new URL(CONFIGURED_API_BASE, window.location.origin);
    const pageHost = window.location.hostname;
    if (LOOPBACK_HOSTS.has(apiUrl.hostname) && !LOOPBACK_HOSTS.has(pageHost)) {
      apiUrl.hostname = pageHost;
    }
    return apiUrl.origin + apiUrl.pathname.replace(/\/$/, "");
  } catch {
    return CONFIGURED_API_BASE;
  }
}

