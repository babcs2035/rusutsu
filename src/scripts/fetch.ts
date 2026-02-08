interface FetchRequest {
  url: string;
  options: object;
}

export async function fetchAsync<T>(request: FetchRequest): Promise<T> {
  return await fetch(request.url, request.options).then(async response => {
    if (!response.ok) {
      throw new Error(`HTTP error (status: ${response.status})`);
    }
    return (await response.json()) as T;
  });
}
