/**
 * Asynchronous queue for managing snapshot updates
 *
 * This queue enables sequential processing of real-time snapshot updates,
 * allowing producers (snapshot listeners) and consumers (async generators)
 * to work at different rates without blocking.
 */
export class AsyncQueue<T> {
  private queue: T[] = [];
  private resolvers: ((value: T) => void)[] = [];

  /**
   * Adds an item to the queue
   *
   * If there are pending dequeuers waiting, immediately resolves the first one.
   * Otherwise, adds the item to the queue for later consumption.
   *
   * @param item - Item to enqueue
   * @example
   * const queue = new AsyncQueue<string>();
   * queue.enqueue('item1');
   * queue.enqueue('item2');
   */
  enqueue(item: T): void {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      if (resolve) {
        resolve(item);
      }
    } else {
      this.queue.push(item);
    }
  }

  /**
   * Removes and returns an item from the queue
   *
   * If the queue is empty, returns a promise that resolves when the next
   * item is enqueued. This enables async iteration over a stream of items.
   *
   * @returns Promise that resolves to the next item
   * @example
   * const queue = new AsyncQueue<string>();
   * queue.enqueue('item1');
   * const item = await queue.dequeue(); // 'item1'
   */
  dequeue(): Promise<T> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift() as T);
    }

    return new Promise<T>((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  /**
   * Gets the current number of items in the queue
   *
   * Note: Does not include pending dequeue operations waiting for items.
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Clears all items from the queue and cancels pending dequeue operations
   */
  clear(): void {
    this.queue = [];
    this.resolvers = [];
  }
}
