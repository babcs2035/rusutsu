type SaveResult =
  | { ok: true; writtenFiles: string[] }
  | { ok: false; errors: string[] };

/** コース・リフト共通の最終保存。関連データの失敗時は完了扱いにしない。 */
export async function saveEditorChanges({
  saveMapping,
  saveLinks,
  saveGeometry,
  mappingFile,
}: {
  saveMapping: () => Promise<boolean>;
  saveLinks: () => Promise<string[]>;
  saveGeometry: () => Promise<SaveResult>;
  mappingFile?: string;
}): Promise<SaveResult> {
  if (!(await saveMapping()))
    return {
      ok: false,
      errors: [
        "営業情報の対応表を保存できませんでした。表示されたエラーを確認してください。",
      ],
    };
  const linkFiles = await saveLinks();
  const result = await saveGeometry();
  if (!result.ok) return result;
  return {
    ok: true,
    writtenFiles: [
      ...new Set([
        ...result.writtenFiles,
        ...linkFiles,
        ...(mappingFile ? [mappingFile] : []),
      ]),
    ],
  };
}
