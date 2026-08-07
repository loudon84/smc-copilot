from __future__ import annotations


class DocumentServiceError(Exception):
    code: str

    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(message)
        self.code = code


class DocumentNotFound(DocumentServiceError):
    def __init__(self, message: str = "Document not found") -> None:
        super().__init__(message, code="document_not_found")


class PermissionDenied(DocumentServiceError):
    def __init__(self, message: str = "Permission denied") -> None:
        super().__init__(message, code="permission_denied")


class VersionConflict(DocumentServiceError):
    def __init__(self, *, current_version_no: int, base_version_no: int) -> None:
        super().__init__("Document version conflict", code="version_conflict")
        self.current_version_no = current_version_no
        self.base_version_no = base_version_no


class SnapshotTooLarge(DocumentServiceError):
    def __init__(self, message: str = "Snapshot exceeds max size 20MB") -> None:
        super().__init__(message, code="snapshot_too_large")


class SnapshotNotFound(DocumentServiceError):
    def __init__(self, message: str = "Snapshot not found") -> None:
        super().__init__(message, code="snapshot_not_found")
