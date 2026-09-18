/**
 * Load an ES module from /public/classic without Vite analyzing the path.
 * Literal `import("/classic/...")` fails because public JS is not a Vite asset.
 */
export function importClassicModule<T = unknown>(path: string): Promise<T> {
  const href =
    path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${typeof window !== "undefined" ? window.location.origin : ""}${
          path.startsWith("/") ? path : `/${path}`
        }`;
  return import(/* @vite-ignore */ href) as Promise<T>;
}
