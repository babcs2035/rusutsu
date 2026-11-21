// 比較リストの更新を順に実行し，後から届く古い一覧で画面を巻き戻さない．

/** 前の更新の失敗に関係なく，次の更新を実行する． */
export function createCompareListMutationQueue(): <T>(
  operation: () => Promise<T>,
) => Promise<T> {
  let tail = Promise.resolve();
  return operation => {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
