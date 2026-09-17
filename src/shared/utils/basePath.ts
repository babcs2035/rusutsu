/**
 * next.config.ts の basePath。
 *
 * `next/link` や `redirect()` は basePath を自動で付けるが、`<form action>` や
 * 素の `<a href>` には付かない。そこだけこの定数で補う。
 */
export const BASE_PATH = "/rusutsu";

/** `<form action>` や素の `<a href>` に渡す、basePath込みのURLを作る。 */
export const withBasePath = (path: string): string => `${BASE_PATH}${path}`;
