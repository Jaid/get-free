export type Options = {
  /**
   * @default '_'
   */
  connector?: string
  /**
   * Whether the base always gets a numeric suffix.
   * `false`: `'log'`, `'log_2'`, `'log_3'`
   * `true`: `'log_1'`, `'log_2'`, `'log_3'`
   * @default false
   */
  consistent?: boolean
  /**
   * Inclusive candidate-number limit. Must be a safe integer greater than or equal to start.
   * The bare base counts as start when consistent is false.
   * @default Number.MAX_SAFE_INTEGER
   */
  maximum?: number
  /**
   * Minimum suffix length, padded with leading zeros. Larger numbers are never truncated.
   * @default 1
   */
  pad?: number
  /**
   * Nonnegative safe integer represented by the first candidate, including the bare base.
   * @default 1
   */
  start?: number
}

export type Occupations = ((id: string) => PromiseLike<boolean> | boolean) | AsyncIterable<string> | Iterable<string>

type FreeResult<T extends Occupations> = T extends (id: string) => infer Result
  ? Result extends boolean
    ? string
    : Promise<string>
  : T extends AsyncIterable<string>
    ? Promise<string>
    : string

/**
 * Finds the first unoccupied ID. Iterable sources must be finite and are collected once.
 * A predicate returns `true` for an occupied ID and is called sequentially.
 */
function getFree(base: string, occupations: (id: string) => PromiseLike<boolean>, options?: Options): Promise<string>
function getFree(base: string, occupations: (id: string) => boolean, options?: Options): string
function getFree(base: string, occupations: AsyncIterable<string>, options?: Options): Promise<string>
function getFree(base: string, occupations: Iterable<string>, options?: Options): string
function getFree<T extends Occupations>(base: string, occupations: T, options?: Options): FreeResult<T>
function getFree(base: string, occupations: Occupations, options: Options = {}): Promise<string> | string {
  const {connector = '_', consistent = false, pad = 1, start = 1, maximum = Number.MAX_SAFE_INTEGER} = options
  if (!Number.isSafeInteger(start) || start < 0) {
    throw new RangeError('start must be a nonnegative safe integer.')
  }
  if (!Number.isSafeInteger(pad) || pad < 1) {
    throw new RangeError('pad must be a positive safe integer.')
  }
  if (!Number.isSafeInteger(maximum) || maximum < start) {
    throw new RangeError('maximum must be a safe integer greater than or equal to start.')
  }
  if (typeof occupations !== 'function') {
    if (Symbol.asyncIterator in new Object(occupations)) {
      return (async () => {
        const occupied = new Set<string>
        for await (const id of occupations) {
          occupied.add(id)
        }
        return getFree(base, id => occupied.has(id), options)
      })()
    }
    const occupied = new Set(occupations as Iterable<string>)
    return getFree(base, id => occupied.has(id), options)
  }
  const getCandidate = (index: number) => {
    if (index <= start && !consistent) {
      return base
    }
    let suffix = String(index)
    if (suffix.length < pad) {
      suffix = suffix.padStart(pad, '0')
    }
    return `${base}${connector}${suffix}`
  }
  let number = start
  let candidate = getCandidate(number)
  const advance = () => {
    if (number === maximum) {
      throw new RangeError('No free ID was found within the maximum candidate number.')
    }
    number++
    candidate = getCandidate(number)
  }
  const finishAsync = async (result: PromiseLike<boolean>): Promise<string> => {
    let occupied = await result
    while (occupied) {
      advance()
      occupied = await occupations(candidate)
    }
    return candidate
  }
  while (true) {
    const occupied = occupations(candidate)
    if (typeof occupied !== 'boolean') {
      return finishAsync(occupied)
    }
    if (!occupied) {
      return candidate
    }
    advance()
  }
}

export default getFree
