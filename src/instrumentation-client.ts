// ブラウザーの入力検証を CSP のスクリプト制限内で実行する．
import { config } from "zod/v4/core";

// 検証結果は同じまま，Zod が評価関数を動的生成できるか調べる処理を省く．
config({ jitless: true });
