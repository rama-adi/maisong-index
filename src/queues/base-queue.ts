import * as S from "effect/Schema";
import { Effect } from "effect";
import type { QueueMiddleware } from "./middleware/base";

// Helper type to get the inferred TypeScript type from a Schema
export type SchemaType<TSchema extends S.Schema<any, any>> = S.Schema.Type<TSchema>;

/**
 * BaseQueue: Abstract class every concrete queue extends.
 *   - TSchema: Effect Schema describing the payload.
 */
export abstract class BaseQueue<TSchema extends S.Schema<any, any>> {
  /** Human‑readable queue name (BullMQ job name) */
  static readonly name: string;
  /** Effect Schema for runtime validation */
  static readonly schema: S.Schema<any, any>;

  constructor(public readonly data: SchemaType<TSchema>) {}

  /**
   * Concrete classes must provide the handler. For convenience we keep it static
   * so the worker can call it without instantiating when desired.
   */
  static handle(_data: unknown): Promise<void> | void | Effect.Effect<void, any, any> {
    throw new Error("handle() not implemented");
  }

  static validate(data: unknown) {
    return S.decodeUnknownSync(this.schema)(data);
  }

  /**
   * Optional: Define a chain of middleware for this queue.
   */
  static middleware(data: unknown): QueueMiddleware[] {
    return [];
  }
}

/**
 * QueueTag factory – similar to Effect's Context.Tag.
 * Returns a mixin class that fixes the queue name and lets you plug an Effect Schema.
 */
export function QueueTag<const TName extends string>(name: TName) {
  return class <TSchema extends S.Schema<any, any>> extends BaseQueue<TSchema> {
    static override readonly name = name;
    constructor(public override readonly data: SchemaType<TSchema>) {
      super(data);
    }
  };
}

// Utility type to get class instance type for a QueueClass
export type QueueInstance<T extends BaseQueue<any>> = InstanceType<new (...args: any) => T>;
