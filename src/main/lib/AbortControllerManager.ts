// ユーザごとに割り当てたAbortControllerのMapラップして、作成や削除コマンドを提供する
// AbortControllerを利用して機能の中断を実現したい機能で利用する

export class AbortControllerManager {
  private static instance: AbortControllerManager;
  // ユーザごとのAbortControllerを管理するインメモリMap
  private userAbortControllers = new Map<
    string,
    Map<string, AbortController>
  >();

  private constructor() {}

  public static getInstance(): AbortControllerManager {
    if (!AbortControllerManager.instance) {
      AbortControllerManager.instance = new AbortControllerManager();
    }
    return AbortControllerManager.instance;
  }

  /**
   * スレッドのAbortControllerを取得または作成する
   * @param abortId 識別子
   * @returns AbortController
   */
  public getOrCreateAbortController(
    userId: string,
    abortId: string
  ): AbortController {
    if (
      !this.userAbortControllers.has(userId) ||
      !this.userAbortControllers.get(userId)!.has(abortId)
    ) {
      const controller = new AbortController();
      this.userAbortControllers.set(userId, new Map([[abortId, controller]]));
    }
    return this.userAbortControllers.get(userId)!.get(abortId)!;
  }

  /**
   * スレッドのAbortControllerを削除する
   * @param abortId 識別子
   */
  public deleteAbortController(userId: string, abortId: string): void {
    if (
      this.userAbortControllers.has(userId) &&
      this.userAbortControllers.get(userId)!.has(abortId)
    ) {
      this.userAbortControllers.get(userId)?.get(abortId)!.abort();
      this.userAbortControllers.get(userId)?.delete(abortId);
    }
  }
}
