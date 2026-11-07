const CONFIRM = "hp.confirmPlay"

export function loadConfirmPlay(): boolean {
  return localStorage.getItem(CONFIRM) === "1"
}

export function saveConfirmPlay(enabled: boolean): void {
  localStorage.setItem(CONFIRM, enabled ? "1" : "0")
}
