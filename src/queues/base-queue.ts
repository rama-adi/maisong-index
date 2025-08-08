import * as S from "effect/Schema";
import { Effect } from "effect";
import type { QueueMiddleware } from "./middleware/base";

// Helper type to get the inferred TypeScript type from a Schema
export type SchemaType<TSchema extends S.Schema<any, any, never>> = S.Schema.Type<TSchema>;

// Extract schema type from a queue class constructor
export type InferSchemaType<T> = T extends abstract new (
  ...args: any[]
) => BaseQueue<infer TSchema>
  ? S.Schema.Type<TSchema>
  : never;

// Extract queue data type from static schema property
export type InferQueueData<T> = T extends { schema: infer TSchema }
  ? TSchema extends S.Schema<any, any, never>
    ? S.Schema.Type<TSchema>
    : never
  : never;

/**
 * Smart queue constructor interface with proper typing
 */
export interface QueueConstructor<TSchema extends S.Schema<any, any, never>> {
  new (data: SchemaType<TSchema>): BaseQueue<TSchema>;
  readonly name: string;
  readonly schema: TSchema;
  handle(data: SchemaType<TSchema>): Effect.Effect<void, unknown, unknown> | Promise<void> | void;
  middleware(data: SchemaType<TSchema>): QueueMiddleware[];
  validate(data: unknown): SchemaType<TSchema>;
}

/**
 * BaseQueue: Abstract class every concrete queue extends.
 *   - TSchema: Effect Schema describing the payload.
 * 
 * Enhanced with smart typing for better IntelliSense and type safety.
 */
export abstract class BaseQueue<TSchema extends S.Schema<any, any, never>> {
  /** Human‑readable queue name (BullMQ job name) - must be overridden by subclasses */
  static get name(): string {
    throw new Error("Queue name must be defined in subclass");
  }
  
  /** Effect Schema for runtime validation - must be overridden by subclasses */
  static get schema(): S.Schema<any, any, never> {
    throw new Error("Queue schema must be defined in subclass");
  }

  constructor(public readonly data: SchemaType<TSchema>) {}

  /**
   * Handler method - concrete classes must override with proper typing.
   * Enhanced typing ensures the data parameter matches the schema type.
   */
  static handle<T extends typeof BaseQueue<any>>(
    this: T, 
    data: InferQueueData<T>
  ): Effect.Effect<void, unknown, unknown> | Promise<void> | void {
    throw new Error(`handle() not implemented for queue: ${this.name}`);
  }

  /**
   * Validates unknown data against the queue's schema with enhanced typing
   */
  static validate<T extends typeof BaseQueue<any>>(this: T, data: unknown): InferQueueData<T> {
    return S.decodeUnknownSync(this.schema)(data) as InferQueueData<T>;
  }

  /**
   * Middleware method - concrete classes can override with proper typing.
   * Enhanced typing ensures the data parameter matches the schema type.
   */
  static middleware<T extends typeof BaseQueue<any>>(
    this: T,
    data: InferQueueData<T>
  ): QueueMiddleware[] {
    return [];
  }
}

/**
 * QueueTag factory – similar to Effect's Context.Tag.
 * Returns a mixin class that fixes the queue name and lets you plug an Effect Schema.
 * Now with enhanced typing for better IntelliSense and automatic type inference.
 */
export function QueueTag<const TName extends string>(name: TName) {
  return class <TSchema extends S.Schema<any, any, never>> extends BaseQueue<TSchema> {
    static override readonly name = name;
    
    constructor(public override readonly data: SchemaType<TSchema>) {
      super(data);
    }

    // The base class now provides properly typed default implementations
    // Subclasses just need to override with their specific schema and logic
  };
}

// Enhanced utility types with better inference
export type QueueInstance<T extends BaseQueue<any>> = InstanceType<new (...args: any) => T>;

// Utility type to extract queue name from QueueTag
export type QueueName<T> = T extends { name: infer TName } ? TName : never;

// Utility type to create a properly typed queue class
export type TypedQueue<TName extends string, TSchema extends S.Schema<any, any, never>> = {
  new (data: SchemaType<TSchema>): BaseQueue<TSchema>;
  readonly name: TName;
  readonly schema: TSchema;
  handle(data: SchemaType<TSchema>): Effect.Effect<void, unknown, unknown> | Promise<void> | void;
  middleware(data: SchemaType<TSchema>): QueueMiddleware[];
  validate(data: unknown): SchemaType<TSchema>;
};

// Helper type for queue factory with better constraints
export type QueueFactory<TName extends string> = <TSchema extends S.Schema<any, any, never>>() => {
  new (data: SchemaType<TSchema>): BaseQueue<TSchema>;
  readonly name: TName;
};

// Inference helpers for queue handle
export type QueueHandleReturn<T extends typeof BaseQueue<any>> = T extends {
  handle: (...args: any[]) => infer TRet;
}
  ? TRet
  : never;

export type QueueHandleSuccess<T extends typeof BaseQueue<any>> = QueueHandleReturn<T> extends Effect.Effect<
  infer TSuccess,
  any,
  any
>
  ? TSuccess
  : never;

export type QueueHandleError<T extends typeof BaseQueue<any>> = QueueHandleReturn<T> extends Effect.Effect<
  any,
  infer TError,
  any
>
  ? TError
  : never;

export type QueueHandleContext<T extends typeof BaseQueue<any>> = QueueHandleReturn<T> extends Effect.Effect<
  any,
  any,
  infer TContext
>
  ? TContext
  : never;
