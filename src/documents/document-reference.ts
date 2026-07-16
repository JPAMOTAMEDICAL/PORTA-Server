export type StoredDocumentReference = {
  storedName?: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  facilityId?: string;
  uploadedAt: string;
  previewUrl?: string;
  downloadUrl?: string;
};

type LooseStoredDocumentReference = Partial<StoredDocumentReference> & {
  name?: string;
  fileName?: string;
  url?: string;
};

export function coerceStoredDocumentReference(
  value: unknown,
): StoredDocumentReference | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return enrichStoredDocumentReference(
        JSON.parse(trimmed) as LooseStoredDocumentReference,
      );
    } catch {
      return {
        originalName: 'Uploaded document',
        mimeType: 'application/octet-stream',
        size: 0,
        category: 'EXTERNAL_LINK',
        uploadedAt: new Date().toISOString(),
        previewUrl: trimmed,
        downloadUrl: trimmed,
      };
    }
  }

  if (typeof value === 'object') {
    return enrichStoredDocumentReference(value);
  }

  return null;
}

export function coerceStoredDocumentReferences(
  value: unknown,
): StoredDocumentReference[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceStoredDocumentReference(item))
      .filter((item): item is StoredDocumentReference => Boolean(item));
  }

  const single = coerceStoredDocumentReference(value);
  return single ? [single] : [];
}

export function serializeStoredDocumentReference(
  value: unknown,
): string | undefined {
  const normalized = coerceStoredDocumentReference(value);
  if (!normalized) {
    return undefined;
  }

  return JSON.stringify(stripDocumentReferenceUrls(normalized));
}

export function serializeStoredDocumentReferences(
  value: unknown,
): StoredDocumentReference[] {
  return coerceStoredDocumentReferences(value).map((item) =>
    stripDocumentReferenceUrls(item),
  );
}

export function enrichStoredDocumentReference(
  value: LooseStoredDocumentReference,
): StoredDocumentReference {
  const storedName = value.storedName?.trim() || undefined;
  const previewUrl =
    value.previewUrl ||
    value.url ||
    (storedName
      ? `/documents/files/${encodeURIComponent(storedName)}`
      : undefined);
  const downloadUrl =
    value.downloadUrl ||
    value.url ||
    (storedName
      ? `/documents/files/${encodeURIComponent(storedName)}/download`
      : previewUrl);

  return {
    storedName,
    originalName:
      value.originalName?.trim() ||
      value.name?.trim() ||
      value.fileName?.trim() ||
      'Uploaded document',
    mimeType: value.mimeType?.trim() || 'application/octet-stream',
    size: Number(value.size ?? 0),
    category: value.category?.trim() || 'GENERAL',
    facilityId: value.facilityId?.trim() || undefined,
    uploadedAt: value.uploadedAt || new Date().toISOString(),
    previewUrl,
    downloadUrl,
  };
}

function stripDocumentReferenceUrls(
  value: StoredDocumentReference,
): StoredDocumentReference {
  return {
    storedName: value.storedName,
    originalName: value.originalName,
    mimeType: value.mimeType,
    size: value.size,
    category: value.category,
    facilityId: value.facilityId,
    uploadedAt: value.uploadedAt,
  };
}
