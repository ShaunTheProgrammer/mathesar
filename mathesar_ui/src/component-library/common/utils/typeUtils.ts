export function isDefinedObject(
  object: unknown,
): object is Record<string, unknown> {
  return typeof object === 'object' && object !== null;
}

export function isNumber(v: unknown): v is number {
  return typeof v === 'number';
}

export function hasProperty<PropertyName extends string>(
  object: unknown,
  property: PropertyName,
): object is { [k in PropertyName]: unknown } {
  return isDefinedObject(object) && property in object;
}

export function hasStringProperty<PropertyName extends string>(
  object: unknown,
  property: PropertyName,
): object is { [k in PropertyName]: string } {
  return hasProperty(object, property) && typeof object[property] === 'string';
}

export function isDefinedNonNullable<T>(x: T): x is NonNullable<T> {
  return x !== null && x !== undefined;
}

export function optionalNonNullable<T>(
  prop: T,
  defaultValue?: NonNullable<T>,
): NonNullable<T> | undefined {
  if (isDefinedNonNullable(prop)) {
    return prop;
  }
  return defaultValue;
}

export function requiredNonNullable<T>(
  prop: T,
  defaultValue: NonNullable<T>,
): NonNullable<T> {
  if (isDefinedNonNullable(prop)) {
    return prop;
  }
  return defaultValue;
}

/**
 * Used to make sure that a value is defined before using it.
 */
export function defined<T, U>(
  v: T | undefined,
  f: (v: T) => U | undefined,
): U | undefined {
  return v === undefined ? undefined : f(v);
}

/**
 * This function is used to assert that the value passed in has been narrowed
 * down to `never` by checking all possible variants.
 */
export function assertExhaustive(value: never): never {
  throw new Error(`Exhaustive condition error: ${JSON.stringify(value)}`);
}

/**
 * From https://stackoverflow.com/a/51365037/895563
 */
export type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends number | string | symbol | undefined
      ? T[P]
      : RecursivePartial<T[P]>;
};
