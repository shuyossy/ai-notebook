// 機能ごとに割り当てたAbortControllerのMapラップして、作成や削除コマンドを提供する
// AbortControllerを利用して機能の中断を実現したい機能で利用する

import { Feature } from "@/types";

export class AbortControllerManager {
  private static instance: AbortControllerManager;
  // ごとのAbortControllerを管理するインメモリMap
  private userAbortControllers = new Map<
    Feature,
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
    feature: Feature,
    abortId: string
  ): AbortController {
    if (
      !this.userAbortControllers.has(feature) ||
      !this.userAbortControllers.get(feature)!.has(abortId)
    ) {
      const controller = new AbortController();
      this.userAbortControllers.set(feature, new Map([[abortId, controller]]));
    }
    return this.userAbortControllers.get(feature)!.get(abortId)!;
  }

  /**
   * スレッドのAbortControllerを削除する
   * @param abortId 識別子
   */
  public deleteAbortController(feature: Feature, abortId: string): void {
    if (
      this.userAbortControllers.has(feature) &&
      this.userAbortControllers.get(feature)!.has(abortId)
    ) {
      this.userAbortControllers.get(feature)?.get(abortId)!.abort();
      this.userAbortControllers.get(feature)?.delete(abortId);
    }
  }
}
