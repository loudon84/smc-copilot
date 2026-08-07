let installCancelRequested = false;

export function requestEnterpriseInstallCancel(): void {
  installCancelRequested = true;
}

export function resetEnterpriseInstallCancel(): void {
  installCancelRequested = false;
}

export function isEnterpriseInstallCancelled(): boolean {
  return installCancelRequested;
}

export function throwIfInstallCancelled(): void {
  if (installCancelRequested) {
    throw new Error("INSTALL_CANCELLED");
  }
}
