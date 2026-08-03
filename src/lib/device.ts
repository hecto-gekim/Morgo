// 로그인 없이 방 멤버를 구분하기 위한 브라우저 고정 식별자.
// localStorage에 한 번 만들어 계속 재사용한다 (같은 브라우저 = 같은 멤버).

const KEY = "morgo-device-id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}
