let _isElectron: boolean | null = null;

export function isElectron(): boolean {
  if (_isElectron !== null) return _isElectron;
  try {
    if (typeof window === "undefined") {
      _isElectron = false;
      return false;
    }
    if (!!window.electronAPI) {
      _isElectron = true;
      return true;
    }
    if (window.location.protocol === "electron:") {
      _isElectron = true;
      return true;
    }
    _isElectron = false;
    return false;
  } catch {
    _isElectron = false;
    return false;
  }
}
